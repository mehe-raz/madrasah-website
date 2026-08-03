// ============================================================================
// routes/guardianAuth.js  (Guardian Portal — Step 2, Part 1)
// ============================================================================
// Self-signup + login for guardians, kept entirely separate from routes/
// auth.js (staff) but reusing the same building blocks: signToken/cookie
// shape from middleware/auth.js, bcrypt + lockout pattern from routes/
// auth.js, recordAudit from lib/auditLog.js. Mounted in index.js the same
// way /api/auth is — BEFORE the tenant requireAuth/rbac chain, since a
// guardian isn't logged in yet when hitting these.
//
// Part 2 (not yet built here): Admin's "Pending Guardian Approvals" queue
// (list/approve/reject pending accounts) and the "add another child" flow
// for a guardian who already has an active account. Until Part 2 ships,
// signups that land on `pending` have no way to become `active` except a
// direct DB update — see the note on POST /signup below.
// ============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const { isUniqueViolation } = require("../pg");
const { passwordPolicyError } = require("../lib/passwordPolicy");
const { validate } = require("../middleware/validate");
const { signupSchema, loginSchema } = require("../lib/guardianAuthSchemas");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes, same as staff login

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Separate from staff's loginLimiter/otpLimiter (routes/auth.js) so a spike
// of guardian traffic (e.g. many parents signing up right after admission
// season) never counts against, or gets throttled by, staff login limits —
// and vice versa: someone hammering /guardian-auth/signup can't lock staff
// out of /auth/login.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many failed login attempts from this network. Please try again later." },
});

function publicGuardian(row) {
  return { id: row.id, name: row.name, mobile: row.mobile, email: row.email, role: "Guardian" };
}

// Loose match for Bangladeshi mobile numbers typed with/without country
// code, spaces, or dashes (e.g. "+880 1712-345678" vs "01712345678") —
// compares only the digits, and only the last 10 (the actual subscriber
// number), so formatting differences never cause a false "no match" during
// the 4-field check below.
function normalizeMobile(v) {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.slice(-10);
}

function normalizeName(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

router.post("/signup", signupLimiter, validate(signupSchema), async (req, res) => {
  const { guardianName, contactMobile, contactEmail, password, studentName, studentRoll, studentClass, guardianMobile } = req.body;

  const pwError = passwordPolicyError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  // roll + class together are the identifying pair the signup form asks
  // for — anyone who doesn't know both can't reach a candidate row at all,
  // which is what keeps this from being a students-table enumeration
  // endpoint. name + guardianMobile are then compared against that one
  // candidate to score the match (see table in the Step 2 plan).
  const student = await db.get(
    'SELECT id, name, "guardianMobile" FROM students WHERE roll = $1 AND class = $2 LIMIT 1',
    [studentRoll.trim(), studentClass.trim()]
  );
  if (!student) {
    // Deliberately generic — doesn't reveal whether the roll exists, the
    // class is wrong, or both, same reasoning as routes/auth.js login
    // returning one "Invalid email or password" for every failure mode.
    return res.status(400).json({ error: "তথ্য যাচাই করা যায়নি। রোল নাম্বার ও ক্লাস আবার যাচাই করুন।" });
  }

  let matchCount = 2; // roll + class already matched by the query above
  if (normalizeName(student.name) === normalizeName(studentName)) matchCount += 1;
  if (student.guardianMobile && normalizeMobile(student.guardianMobile) === normalizeMobile(guardianMobile)) matchCount += 1;

  // matchCount is always >= 2 here (see above), so this branch only exists
  // to keep the 0-1/2/3-4 table in the plan literally intact and to fail
  // closed if that invariant is ever changed later.
  if (matchCount <= 1) {
    return res.status(400).json({ error: "তথ্য যাচাই করা যায়নি। দেওয়া তথ্যগুলো আবার যাচাই করুন।" });
  }

  const status = matchCount >= 3 ? "active" : "pending";
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const createdAt = new Date().toISOString();
  const mobile = contactMobile ? contactMobile.trim() : null;
  const email = contactEmail ? contactEmail.trim().toLowerCase() : null;

  let guardian;
  try {
    guardian = await db.get(
      `INSERT INTO guardian_accounts (name, mobile, email, "passwordHash", status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, mobile, email, status`,
      [guardianName.trim(), mobile, email, hash, status, createdAt]
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      return res.status(409).json({ error: "এই মোবাইল অথবা ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে" });
    }
    throw e;
  }

  await db.run(
    'INSERT INTO guardian_students ("guardianId", "studentId", "createdAt") VALUES ($1, $2, $3)',
    [guardian.id, student.id, createdAt]
  );

  await recordAudit({
    action: status === "active" ? "guardian.signup_active" : "guardian.signup_pending",
    actor: null,
    entityType: "guardian_account",
    entityId: guardian.id,
    label: `Guardian signup (${status}): ${guardian.name} \u2192 student #${student.id}`,
    details: { studentId: student.id, matchCount, status },
  });

  if (status === "pending") {
    // No session issued yet — Part 2's Admin approval queue is what flips
    // this row to "active"; until then /login below will explicitly refuse
    // this account with a "waiting for approval" message rather than a
    // generic invalid-credentials error.
    return res.status(201).json({
      ok: true,
      status: "pending",
      message: "আপনার তথ্য জমা হয়েছে। Admin অনুমোদনের পর আপনি লগইন করতে পারবেন।",
    });
  }

  const token = signToken({ id: guardian.id, email: guardian.email, role: "Guardian", name: guardian.name });
  res.cookie("token", token, cookieOptions);
  res.status(201).json({ ok: true, status: "active", user: publicGuardian(guardian) });
});

router.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const { identifier, password } = req.body;
  const mobileCandidate = identifier.trim();
  const emailCandidate = identifier.trim().toLowerCase();

  const row = await db.get(
    "SELECT * FROM guardian_accounts WHERE mobile = $1 OR email = $2",
    [mobileCandidate, emailCandidate]
  );
  if (!row?.passwordHash) return res.status(401).json({ error: "ভুল তথ্য অথবা পাসওয়ার্ড" });

  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(row.lockedUntil).getTime() - Date.now()) / 60000);
    return res.status(423).json({
      error: `অনেকবার ভুল চেষ্টা হয়েছে। ${minutesLeft} মিনিট পরে আবার চেষ্টা করুন।`,
    });
  }

  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) {
    const attempts = (row.failedLoginAttempts || 0) + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      await db.run(
        'UPDATE guardian_accounts SET "failedLoginAttempts" = 0, "lockedUntil" = $1 WHERE id = $2',
        [lockedUntil, row.id]
      );
      await recordAudit({
        action: "guardian.account_locked",
        actor: null,
        entityType: "guardian_account",
        entityId: row.id,
        label: `Guardian account locked after ${MAX_FAILED_ATTEMPTS} failed attempts`,
      });
      return res.status(423).json({
        error: `অনেকবার ভুল চেষ্টা হয়েছে। অ্যাকাউন্টটি ${Math.round(LOCK_DURATION_MS / 60000)} মিনিটের জন্য লক করা হয়েছে।`,
      });
    }
    await db.run('UPDATE guardian_accounts SET "failedLoginAttempts" = $1 WHERE id = $2', [attempts, row.id]);
    return res.status(401).json({ error: "ভুল তথ্য অথবা পাসওয়ার্ড" });
  }

  if (row.status === "pending") {
    return res.status(403).json({ error: "আপনার অ্যাকাউন্ট এখনও Admin অনুমোদনের অপেক্ষায় আছে।" });
  }
  if (row.status === "rejected") {
    return res.status(401).json({ error: "ভুল তথ্য অথবা পাসওয়ার্ড" });
  }

  if (row.failedLoginAttempts > 0 || row.lockedUntil) {
    await db.run('UPDATE guardian_accounts SET "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE id = $1', [row.id]);
  }

  const user = publicGuardian(row);
  const token = signToken({ id: row.id, email: row.email, role: "Guardian", name: row.name });
  res.cookie("token", token, cookieOptions);
  await recordAudit({
    action: "guardian.login",
    actor: { id: row.id, name: row.name, role: "Guardian" },
    entityType: "guardian_account",
    entityId: row.id,
    label: `Guardian logged in: ${row.name}`,
  });
  res.json({ user });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", cookieOptions);
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  try {
    const { verifyRequestToken } = require("../middleware/auth");
    const payload = verifyRequestToken(req);
    if (payload.role !== "Guardian") return res.status(401).json({ error: "Session expired" });
    const row = await db.get("SELECT id, name, mobile, email, status FROM guardian_accounts WHERE id = $1", [payload.id]);
    if (!row) return res.status(401).json({ error: "Session expired" });
    res.json({ user: publicGuardian(row) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

module.exports = router;

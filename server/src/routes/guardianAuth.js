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
// Step 2 Part 2 adds the Admin approval queue and the authenticated
// "add another child" flow. Account and child-link review actions live in
// routes/guardianApprovals.js so public guardian auth stays isolated from
// staff-only settings permissions.
// ============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { signToken } = require("../middleware/auth");
const { isUniqueViolation } = require("../pg");
const { passwordPolicyError } = require("../lib/passwordPolicy");
const { validate } = require("../middleware/validate");
const { verifyCsrfToken } = require("../middleware/csrf");
const { signupSchema, loginSchema, addChildSchema } = require("../lib/guardianAuthSchemas");
const { recordAudit } = require("../lib/auditLog");
const { feedForGuardian, markPostRead, unreadCountForGuardian } = require("../lib/classPosts");
const {
  listMessagesForGuardian,
  unreadMessageCountForGuardian,
  markMessageRead,
} = require("../lib/guardianReminders");
const { getVapidPublicKey, saveSubscription, deleteSubscription } = require("../lib/guardianPush");
const {
  activeChildrenForGuardian,
  assertGuardianOwnsStudent,
  attendanceHistoryForStudent,
  publishedResultsForStudent,
  todayAttendanceForStudent,
} = require("../lib/guardianData");
const { requirePlanFeature } = require("../middleware/planGate");
const bkashGateway = require("../lib/bkashGateway");
const { getConnectedGateway } = require("../lib/paymentGatewayCredentials");
const { nextReceipt } = require("../lib/receiptCounter");
const { computePaymentOutcome } = require("../lib/paymentLogic");
const { sendGuardianSms } = require("../lib/guardianSms");
const { createNotification } = require("../lib/notifications");

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
    'INSERT INTO guardian_students ("guardianId", "studentId", "createdAt", status, "matchCount") VALUES ($1, $2, $3, $4, $5)',
    [guardian.id, student.id, createdAt, "active", matchCount]
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

  // req.tenant must be passed through here exactly like routes/auth.js does
  // for staff (signToken(user, req.tenant)) — otherwise, under
  // MULTI_TENANT_MODE=true, this token is issued with no institutionCode
  // claim at all. verifyRequestToken() then rejects it on the very next
  // request (payload.institutionCode !== req.tenant.code, undefined !==
  // the real code) with 401 "Session expired", even though the cookie was
  // just set correctly. The guardian portal has no fallback for that: the
  // dashboard's 401 handler navigates back to /guardian/login, but
  // GuardianAuthContext's `user` was never cleared, so GuardianLogin's
  // `if (user) return <Navigate to="/guardian" />` immediately bounces
  // back — an infinite login↔dashboard redirect loop with the spinner
  // stuck mid-navigation the whole time.
  const token = signToken({ id: guardian.id, email: guardian.email, role: "Guardian", name: guardian.name }, req.tenant);
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
  // Same institutionCode binding as the signup branch above — see the
  // comment there. Without req.tenant here, every guardian login in a
  // multi-tenant deployment would set a cookie that fails verification on
  // the very next request.
  const token = signToken({ id: row.id, email: row.email, role: "Guardian", name: row.name }, req.tenant);
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


router.post("/children", signupLimiter, verifyCsrfToken, validate(addChildSchema), async (req, res) => {
  let payload;
  try {
    const { verifyRequestToken } = require("../middleware/auth");
    payload = verifyRequestToken(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
  if (payload.role !== "Guardian") return res.status(403).json({ error: "Guardian login required" });

  const guardian = await db.get("SELECT id, name, status FROM guardian_accounts WHERE id = $1", [payload.id]);
  if (!guardian || guardian.status !== "active") {
    return res.status(403).json({ error: "সক্রিয় Guardian account প্রয়োজন" });
  }

  const { studentName, studentRoll, studentClass, guardianMobile } = req.body;
  const student = await db.get(
    'SELECT id, name, "guardianMobile" FROM students WHERE roll = $1 AND class = $2 LIMIT 1',
    [studentRoll.trim(), studentClass.trim()]
  );
  if (!student) {
    return res.status(400).json({ error: "তথ্য যাচাই করা যায়নি। রোল নাম্বার ও ক্লাস আবার যাচাই করুন।" });
  }

  const existingLink = await db.get(
    'SELECT status FROM guardian_students WHERE "guardianId" = $1 AND "studentId" = $2',
    [guardian.id, student.id]
  );
  if (existingLink) {
    const message = existingLink.status === "active"
      ? "এই সন্তানটি ইতিমধ্যে আপনার অ্যাকাউন্টে যুক্ত আছে।"
      : existingLink.status === "pending"
        ? "এই সন্তানের সংযোগ অনুরোধটি Admin অনুমোদনের অপেক্ষায় আছে।"
        : "এই সন্তানের আগের সংযোগ অনুরোধটি প্রত্যাখ্যাত হয়েছে। Admin-এর সাথে যোগাযোগ করুন।";
    return res.status(409).json({ error: message });
  }

  let matchCount = 2;
  if (normalizeName(student.name) === normalizeName(studentName)) matchCount += 1;
  if (student.guardianMobile && normalizeMobile(student.guardianMobile) === normalizeMobile(guardianMobile)) matchCount += 1;
  const status = matchCount >= 3 ? "active" : "pending";
  const createdAt = new Date().toISOString();

  await db.run(
    'INSERT INTO guardian_students ("guardianId", "studentId", "createdAt", status, "matchCount") VALUES ($1, $2, $3, $4, $5)',
    [guardian.id, student.id, createdAt, status, matchCount]
  );
  await recordAudit({
    action: status === "active" ? "guardian.child_link_active" : "guardian.child_link_pending",
    actor: { id: guardian.id, name: guardian.name, role: "Guardian" },
    entityType: "guardian_student",
    entityId: student.id,
    label: `Guardian child link (${status}): ${guardian.name} → student #${student.id}`,
    details: { guardianId: guardian.id, studentId: student.id, matchCount, status },
  });

  res.status(201).json({
    ok: true,
    status,
    message: status === "active"
      ? "সন্তানটি সফলভাবে আপনার অ্যাকাউন্টে যুক্ত হয়েছে।"
      : "তথ্য জমা হয়েছে। Admin অনুমোদনের পর সন্তানটি আপনার অ্যাকাউন্টে যুক্ত হবে।",
  });
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
    if (!row || row.status !== "active") return res.status(401).json({ error: "Session expired" });
    res.json({ user: publicGuardian(row) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

// ---------------------------------------------------------------------------
// Step 4: class-broadcast feed (read side of routes/assignments.js). Same
// verifyRequestToken + active-status check /me and POST /children already
// do inline above — factored into one helper here only because three more
// call sites made the duplication worse than a one-line helper; the
// existing routes above are left as-is to keep this change scoped to what
// Step 4 actually needs.
// ---------------------------------------------------------------------------
async function requireActiveGuardianId(req) {
  const { verifyRequestToken } = require("../middleware/auth");
  const payload = verifyRequestToken(req);
  if (payload.role !== "Guardian") {
    const err = new Error("Session expired");
    err.status = 401;
    throw err;
  }
  const guardian = await db.get("SELECT status FROM guardian_accounts WHERE id = $1", [payload.id]);
  if (!guardian || guardian.status !== "active") {
    const err = new Error("Session expired");
    err.status = 401;
    throw err;
  }
  return payload.id;
}

router.get("/feed", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    res.json(await feedForGuardian(guardianId, { type: req.query.type }));
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.get("/feed/unread-count", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    res.json({ count: await unreadCountForGuardian(guardianId) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.post("/feed/:postId/read", verifyCsrfToken, async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    await markPostRead(guardianId, Number(req.params.postId));
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

// ---------------------------------------------------------------------------
// Guardian Reminder Messenger (ad-hoc) — read side of routes/
// guardianReminders.js. Same requireActiveGuardianId gate + try/catch
// shape as the Step 4 feed routes above, since a reminder-message is just
// a second, per-guardian-fan-out flavor of "things a guardian reads".
// ---------------------------------------------------------------------------

router.get("/messages", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    res.json(await listMessagesForGuardian(guardianId));
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.get("/messages/unread-count", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    res.json({ count: await unreadMessageCountForGuardian(guardianId) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.post("/messages/:id/read", verifyCsrfToken, async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    await markMessageRead(guardianId, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

// ---------------------------------------------------------------------------
// Guardian Push Notifications (docs/PUSH_NOTIFICATION_PLAN.md — Phase 3).
// Same requireActiveGuardianId gate as every other guardian-side route
// above. `getVapidPublicKey()` deliberately skips that gate (see its own
// comment in lib/guardianPush.js) — the client needs the public key before
// it can even attempt PushManager.subscribe(), and it isn't a secret.
// ---------------------------------------------------------------------------

router.get("/push/vapid-public-key", (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post("/push/subscribe", verifyCsrfToken, async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "অসম্পূর্ণ push subscription" });
    }
    await saveSubscription(guardianId, { endpoint, keys, userAgent: req.get("user-agent") });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.delete("/push/subscribe", verifyCsrfToken, async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint প্রয়োজন" });
    await deleteSubscription(guardianId, endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

// ---------------------------------------------------------------------------
// Step 5: guardian portal frontend data (children list, dashboard summary,
// per-child attendance history, published results). Same
// requireActiveGuardianId gate as the Step 4 feed routes above; every
// student-scoped call additionally goes through lib/guardianData.js's
// assertGuardianOwnsStudent (active-linked child only) before touching
// attendance/results, so a guessed studentId in the URL 403s instead of
// leaking another family's records.
// ---------------------------------------------------------------------------

router.get("/children", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    res.json(await activeChildrenForGuardian(guardianId));
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

// One combined call for the dashboard landing page — per-child today's
// attendance mark + unread feed count — instead of the client making N+1
// requests for N children.
router.get("/dashboard", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const children = await activeChildrenForGuardian(guardianId);
    const withAttendance = await Promise.all(
      children.map(async (c) => ({ ...c, todayAttendance: await todayAttendanceForStudent(c.id) }))
    );
    res.json({ children: withAttendance, unreadCount: await unreadCountForGuardian(guardianId) });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.get("/students/:id/attendance", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const studentId = Number(req.params.id);
    res.json(await attendanceHistoryForStudent(guardianId, studentId, { month: req.query.month }));
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.get("/students/:id/results", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const studentId = Number(req.params.id);
    res.json(await publishedResultsForStudent(guardianId, studentId));
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

// ---------------------------------------------------------------------------
// Phase 8F: guardian-facing bKash fee payment, using the institution's own
// connected gateway (Phase 8E's institution_payment_gateways). Two-step
// create→execute, matching how bKash's checkout actually works: 1) we ask
// bKash for a paymentID + checkout URL and hand the URL to the guardian's
// browser, 2) bKash redirects the browser back to our frontend once the
// guardian completes the OTP/PIN step on bKash's own page, 3) the frontend
// calls /bkash/execute with that paymentID and THIS is what actually
// confirms/finalizes the payment — never the redirect's query string alone
// (see the schema comment on bkash_payment_intents for why).
// ---------------------------------------------------------------------------

function guardianCallbackUrl(req) {
  const origin = req.get("origin") || req.get("referer") || process.env.CLIENT_ORIGIN || "";
  const base = origin.replace(/\/+$/, "").replace(/\/guardian.*$/, "");
  return `${base}/guardian/pay/callback`;
}

router.post("/students/:id/bkash/create", requirePlanFeature("bkash"), async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const studentId = Number(req.params.id);
    await assertGuardianOwnsStudent(guardianId, studentId);

    const student = await db.get("SELECT id, name, roll, due FROM students WHERE id = $1", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      return res.status(400).json({ error: "সঠিক পরিমাণ দিন (পূর্ণ সংখ্যা, দশমিক ছাড়া)" });
    }
    if (amount > Number(student.due || 0)) {
      return res.status(400).json({ error: "বকেয়ার চেয়ে বেশি পরিমাণ দেওয়া যাবে না" });
    }

    const gateway = await getConnectedGateway();
    if (!gateway) return res.status(503).json({ error: "প্রতিষ্ঠানের বিকাশ গেটওয়ে কানেক্টেড নেই" });

    const now = new Date().toISOString();
    const intent = await db.get(
      `INSERT INTO bkash_payment_intents (purpose, "guardianId", "studentId", amount, status, "createdAt")
       VALUES ('fee', $1, $2, $3, 'initiated', $4) RETURNING id`,
      [guardianId, studentId, amount, now]
    );

    const grant = await bkashGateway.grantToken(gateway);
    if (!grant.ok) return res.status(502).json({ error: grant.error });

    const created = await bkashGateway.createPayment({
      idToken: grant.idToken,
      appKey: gateway.appKey,
      amount,
      invoiceId: intent.id,
      callbackURL: guardianCallbackUrl(req),
    });
    if (!created.ok) return res.status(502).json({ error: created.error });

    await db.run('UPDATE bkash_payment_intents SET "paymentId" = $1 WHERE id = $2', [created.paymentID, intent.id]);
    res.json({ bkashURL: created.bkashURL, paymentID: created.paymentID });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

router.post("/bkash/execute", async (req, res) => {
  try {
    const guardianId = await requireActiveGuardianId(req);
    const paymentID = String(req.body?.paymentID || "");
    if (!paymentID) return res.status(400).json({ error: "paymentID প্রয়োজন" });

    const intent = await db.get(
      `SELECT * FROM bkash_payment_intents WHERE "paymentId" = $1 AND "guardianId" = $2 AND purpose = 'fee'`,
      [paymentID, guardianId]
    );
    if (!intent) return res.status(404).json({ error: "পেমেন্ট পাওয়া যায়নি" });

    // Already finalized (guardian's browser can legitimately hit this
    // twice — e.g. a refresh on the callback page) — return the same
    // success without calling bKash or crediting anything a second time.
    if (intent.status === "completed") return res.json({ ok: true, alreadyCompleted: true });

    const gateway = await getConnectedGateway();
    if (!gateway) return res.status(503).json({ error: "প্রতিষ্ঠানের বিকাশ গেটওয়ে কানেক্টেড নেই" });

    const grant = await bkashGateway.grantToken(gateway);
    if (!grant.ok) return res.status(502).json({ error: grant.error });

    const executed = await bkashGateway.executePayment({ idToken: grant.idToken, appKey: gateway.appKey, paymentID });
    if (!executed.ok) {
      await db.run(`UPDATE bkash_payment_intents SET status = 'failed' WHERE id = $1`, [intent.id]);
      return res.status(402).json({ ok: false, error: executed.error });
    }

    const student = await db.get("SELECT id, name, roll, due, phone FROM students WHERE id = $1", [intent.studentId]);
    const currentDue = Number(student?.due || 0);
    const { isConflict, newDue, status } = computePaymentOutcome(currentDue, Number(intent.amount));
    const date = new Date().toISOString().slice(0, 10);

    const { insertId, receipt } = await db.withTransaction(async (tx) => {
      const receipt = await nextReceipt(tx, { table: "payments", key: "payment_receipt", prefix: `RCP-${new Date().getFullYear()}-`, pad: 3 });
      const result = await tx.run(
        `INSERT INTO payments ("studentId", student, roll, amount, date, receipt, method, status, "flagReason")
         VALUES ($1, $2, $3, $4, $5, $6, 'bKash', $7, $8) RETURNING id`,
        [
          intent.studentId,
          student?.name || "",
          student?.roll || "",
          intent.amount,
          date,
          receipt,
          status,
          isConflict ? `এই শিক্ষার্থীর বকেয়া ইতিমধ্যে ০, কিন্তু গার্ডিয়ান পোর্টাল থেকে বিকাশে ৳${intent.amount} পেমেন্ট এসেছে।` : null,
        ]
      );
      if (!isConflict) {
        await tx.run(
          `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
           VALUES ('Student Fee', $1, $2, $3, 'bKash', $4, $5, 'Completed')`,
          [intent.amount, date, `Fee from ${student?.name || ""} (Guardian Portal — bKash)`, receipt, intent.studentId]
        );
        await tx.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, intent.studentId]);
      }
      await tx.run(
        `UPDATE bkash_payment_intents SET status = 'completed', "bkashTrxId" = $1, "completedAt" = $2 WHERE id = $3`,
        [executed.trxID, new Date().toISOString(), intent.id]
      );
      return { insertId: result.insertId, receipt };
    });

    await recordAudit({
      action: isConflict ? "payment.flagged" : "payment.created",
      actor: null,
      entityType: "payment",
      entityId: insertId,
      label: isConflict
        ? `Flagged bKash payment ৳${intent.amount} from guardian portal — due already 0`
        : `bKash payment ৳${intent.amount} from ${student?.name || ""} via Guardian Portal`,
      details: { studentId: intent.studentId, amount: intent.amount, receipt, trxID: executed.trxID },
    });

    if (isConflict) {
      await createNotification({
        type: "payment-flagged",
        title: "একটি পেমেন্ট পর্যালোচনা প্রয়োজন",
        body: `${student?.name || ""} — ৳${intent.amount} (বিকাশ, গার্ডিয়ান পোর্টাল), বকেয়া ইতিমধ্যে শূন্য ছিল`,
        entityType: "payment",
        entityId: insertId,
      });
    } else if (student?.phone) {
      await sendGuardianSms({
        to: student.phone,
        message: `${student.name} এর ৳${intent.amount} বেতন বিকাশের মাধ্যমে সফলভাবে গৃহীত হয়েছে। রশিদ: ${receipt}`,
        reference: `bkash-payment-receipt:${insertId}`,
        notificationType: "paymentReceived",
      });
    }

    res.json({ ok: true, receipt, newDue: isConflict ? currentDue : newDue });
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : "Session expired" });
  }
});

module.exports = router;

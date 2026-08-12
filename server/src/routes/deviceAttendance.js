// server/src/routes/deviceAttendance.js
// ============================================================================
// Device-facing attendance API (docs/ATTENDANCE_DEVICE_PLAN.md, Phase 2)
// ============================================================================
// Mounted in index.js BEFORE the staff requireAuth/rbac chain (same spot as
// /api/auth, /api/guardian-auth) because a fingerprint/card device has no
// staff JWT to send — it authenticates with its own deviceId+secretKey pair
// (attendance_devices table, Phase 1 schema) instead via authenticateDevice()
// below. Still mounted AFTER tenantResolve, so in multi-tenant mode the
// device's request — which hits the institution's own subdomain/Host, the
// same way any browser request does — is scoped to that institution's
// schema automatically. No tenantResolve.js isSkippedPath() entry needed
// here (unlike /api/platform or /api/public/signup, which deliberately
// don't belong to a tenant): this route DOES belong to one, same as
// /api/guardian-auth.
//
// Two endpoints:
//   POST /api/device/punch           — the actual scan event from hardware
//   GET  /api/device/latest-punch/:deviceId — polled by the kiosk display
//   (Phase 4) every ~2s to show the most recent scan; no WebSocket, per the
//   plan doc's Phase-1-assumption on avoiding a new dependency.
// ============================================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { validate } = require("../middleware/validate");
const { devicePunchSchema } = require("../lib/opsSchemas");
const { recordAudit } = require("../lib/auditLog");
const { sendGuardianSms } = require("../lib/guardianSms");

const router = express.Router();

// Open to the internet like /api/public/* — tighter than apiLimiter
// (200/min, staff-only) but loose enough for a busy gate with many
// students punching within the same minute.
const devicePunchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

// Separate, slightly looser limiter for the read-only polling endpoint —
// a single kiosk polling every ~2s is ~30 requests/minute on its own, so
// devicePunchLimiter's 60/min would leave very little headroom.
const deviceLatestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

// secretKey is a server-generated random token (see
// routes/attendanceDevices.js's crypto.randomBytes), not a user-chosen
// password, so there's no dictionary/brute-force surface that would call
// for bcrypt hashing the way middleware/auth.js does for staff logins —
// plain equality against the stored value is enough here.
async function authenticateDevice(deviceId, secretKey) {
  const device = await db.get(
    `SELECT * FROM attendance_devices WHERE "deviceId" = $1 AND active = true`,
    [deviceId]
  );
  if (!device || device.secretKey !== secretKey) return null;
  return device;
}

function toStudentPayload(student) {
  return {
    id: student.id,
    name: student.name,
    class: student.class,
    section: student.section,
    roll: student.roll,
    photo: student.studentPhoto,
  };
}

router.post("/punch", devicePunchLimiter, validate(devicePunchSchema), async (req, res) => {
  const { deviceId, secretKey, identifier, identifierType } = req.body;

  const device = await authenticateDevice(deviceId, secretKey);
  if (!device) return res.status(401).json({ error: "ডিভাইস শনাক্ত করা যায়নি" });

  // Column choice driven by identifierType, not by guessing which of the
  // two a given string looks like — see students.fingerprintId/cardUid
  // (Phase 1 schema), both plain unique text columns.
  const column = identifierType === "card" ? '"cardUid"' : '"fingerprintId"';
  const student = await db.get(
    `SELECT id, name, class, section, roll, "studentPhoto", phone, status
     FROM students WHERE ${column} = $1`,
    [identifier]
  );
  if (!student || student.status !== "Active") {
    // Logged (studentId null, matched false) instead of just returning the
    // error, so the kiosk's latest-punch poll (Phase 4) has a row to find
    // and can show "ছাত্র খুঁজে পাওয়া যায়নি" for a real failed scan — added
    // 2026-08-12, see supabase_schema.sql's 2026-08-12 comment on this
    // table for why studentId had to become nullable for this.
    await db.run(
      `INSERT INTO attendance_logs ("studentId", "deviceId", "punchAt", direction, method, matched, identifier)
       VALUES (NULL, $1, $2, NULL, $3, false, $4)`,
      [device.id, new Date().toISOString(), identifierType, identifier]
    );
    return res.status(404).json({ error: "ছাত্র খুঁজে পাওয়া যায়নি" });
  }

  const punchAt = new Date().toISOString();
  const today = punchAt.slice(0, 10);

  // "punchAt" is stored as ISO-8601 text (Phase 1 schema), which sorts and
  // prefix-matches correctly as a string — a LIKE 'today%' is enough to
  // count today's punches without a separate date column.
  const priorToday = await db.get(
    `SELECT COUNT(*)::int AS count FROM attendance_logs
     WHERE "studentId" = $1 AND "punchAt" LIKE $2`,
    [student.id, `${today}%`]
  );
  const isFirstPunchToday = priorToday.count === 0;

  // direction stays null: per the plan doc's Phase-1 assumption, most
  // fingerprint/card devices don't distinguish in/out at the hardware
  // level, so entry/exit is derived from first/last punch ordering
  // instead of being recorded here. "identifier" is now stored here too
  // (docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2C) — previously
  // only the unmatched branch above stored it; the new staff-facing
  // GET /:id/latest-scan (attendanceDevices.js) needs a raw identifier on
  // every scan, not just unmatched ones, so a re-enrollment scan of an
  // already-enrolled finger/card still surfaces something to the
  // "স্ক্যান করে বসান" UI instead of silently returning null.
  await db.run(
    `INSERT INTO attendance_logs ("studentId", "deviceId", "punchAt", direction, method, identifier)
     VALUES ($1, $2, $3, NULL, $4, $5)`,
    [student.id, device.id, punchAt, identifierType, identifier]
  );

  // Reuses the exact upsert routes/attendance.js's manual save already
  // uses, so a device punch and a teacher's manual mark can never disagree
  // about which unique index they're conflicting on.
  await db.run(
    `INSERT INTO attendance ("studentId", date, status)
     VALUES ($1, $2, 'উপস্থিত')
     ON CONFLICT ("studentId", date) DO UPDATE SET status = EXCLUDED.status`,
    [student.id, today]
  );

  await recordAudit({
    action: "attendance.devicePunch",
    entityType: "attendance_logs",
    entityId: student.id,
    label: `${student.name} (রোল ${student.roll}) — ডিভাইস পাঞ্চ (${device.name || device.deviceId})`,
    details: { deviceId: device.deviceId, method: identifierType, punchAt, firstToday: isFirstPunchToday },
  });

  // Guardian SMS only on the day's first punch (entry) — see plan doc
  // Phase 1 assumption: notifying on every punch would burn SMS wallet
  // balance on a student who scans more than once. sendGuardianSms never
  // throws (no phone on file, plan doesn't include SMS, empty wallet — all
  // skip silently), same contract as every other call site.
  if (isFirstPunchToday && student.phone) {
    await sendGuardianSms({
      to: student.phone,
      message: `${student.name} (রোল ${student.roll}) আজ ${punchAt.slice(11, 16)}-এ মাদরাসায় প্রবেশ করেছে।`,
      reference: `attendance-punch:${student.id}:${today}`,
      notificationType: "attendancePunch",
    });
  }

  res.json({ ok: true, student: toStudentPayload(student), punchAt, firstToday: isFirstPunchToday });
});

router.get("/latest-punch/:deviceId", deviceLatestLimiter, async (req, res) => {
  const device = await db.get(
    `SELECT id FROM attendance_devices WHERE "deviceId" = $1 AND active = true`,
    [req.params.deviceId]
  );
  if (!device) return res.status(404).json({ error: "ডিভাইস খুঁজে পাওয়া যায়নি" });

  // LEFT JOIN (not JOIN) so an unmatched attempt — studentId null, matched
  // false, see the insert in POST /punch above — still comes back instead
  // of being silently dropped from this query; the kiosk (Phase 4) tells
  // the two cases apart via "matched".
  const log = await db.get(
    `SELECT al."punchAt", al.matched, s.name, s.class, s.section, s.roll, s."studentPhoto"
     FROM attendance_logs al
     LEFT JOIN students s ON s.id = al."studentId"
     WHERE al."deviceId" = $1
     ORDER BY al."punchAt" DESC
     LIMIT 1`,
    [device.id]
  );
  if (!log) return res.json({ punch: null });

  res.json({
    punch: {
      punchAt: log.punchAt,
      matched: log.matched,
      student: log.matched
        ? {
            name: log.name,
            class: log.class,
            section: log.section,
            roll: log.roll,
            photo: log.studentPhoto,
          }
        : null,
    },
  });
});

module.exports = router;

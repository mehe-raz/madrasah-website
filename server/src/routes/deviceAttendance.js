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
// docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 2 — the actual
// punch-recording work (student lookup, attendance_logs/attendance upsert,
// audit, guardian SMS) now lives in lib/devicePunch.js, shared with the new
// routes/deviceIngest.js so the two device-facing entry points can never
// disagree on how a punch is recorded. This file keeps its own device auth
// and JSON response shape — only the DB work in between moved out.
const { recordDevicePunch, toStudentPayload, toStaffPayload } = require("../lib/devicePunch");

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

router.post("/punch", devicePunchLimiter, validate(devicePunchSchema), async (req, res) => {
  const { deviceId, secretKey, identifier, identifierType } = req.body;

  const device = await authenticateDevice(deviceId, secretKey);
  if (!device) return res.status(401).json({ error: "ডিভাইস শনাক্ত করা যায়নি" });

  // docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 2 — the
  // actual student-lookup/attendance_logs/attendance/audit/guardian-SMS
  // work now lives in lib/devicePunch.js's recordDevicePunch(), shared with
  // routes/deviceIngest.js's ADMS endpoint. Behavior here is unchanged from
  // before the extraction — only where the code lives moved.
  const result = await recordDevicePunch({ device, identifier, identifierType });

  if (!result.matched) {
    // Logged (studentId/staffId null, matched false, done inside
    // recordDevicePunch) instead of just returning the error, so the
    // kiosk's latest-punch poll (Phase 4) has a row to find and can show
    // "খুঁজে পাওয়া যায়নি" for a real failed scan.
    return res.status(404).json({ error: "খুঁজে পাওয়া যায়নি" });
  }

  // docs/STAFF_ATTENDANCE_PLAN.md, Phase 7 — result.type distinguishes a
  // student match from a staff match; only one of student/staff is ever
  // present on the response.
  if (result.type === "staff") {
    return res.json({
      ok: true,
      type: "staff",
      staff: toStaffPayload(result.staff),
      punchAt: result.punchAt,
      firstToday: result.firstToday,
    });
  }

  res.json({
    ok: true,
    type: "student",
    student: toStudentPayload(result.student),
    punchAt: result.punchAt,
    firstToday: result.firstToday,
  });
});

router.get("/latest-punch/:deviceId", deviceLatestLimiter, async (req, res) => {
  const device = await db.get(
    `SELECT id FROM attendance_devices WHERE "deviceId" = $1 AND active = true`,
    [req.params.deviceId]
  );
  if (!device) return res.status(404).json({ error: "ডিভাইস খুঁজে পাওয়া যায়নি" });

  // LEFT JOIN (not JOIN) so an unmatched attempt — studentId/staffId both
  // null, matched false, see the insert in POST /punch above — still comes
  // back instead of being silently dropped from this query; the kiosk
  // (Phase 4) tells the cases apart via "matched" and "type".
  const log = await db.get(
    `SELECT al."punchAt", al.matched, al."studentId", al."staffId",
            s.name AS "studentName", s.class AS "studentClass", s.section, s.roll, s."studentPhoto",
            st.name AS "staffName", st.designation AS "staffDesignation", st.class AS "staffClass"
     FROM attendance_logs al
     LEFT JOIN students s ON s.id = al."studentId"
     LEFT JOIN staff st ON st.id = al."staffId"
     WHERE al."deviceId" = $1
     ORDER BY al."punchAt" DESC
     LIMIT 1`,
    [device.id]
  );
  if (!log) return res.json({ punch: null });

  const isStaff = log.matched && log.staffId != null;
  const isStudent = log.matched && log.studentId != null;

  res.json({
    punch: {
      punchAt: log.punchAt,
      matched: log.matched,
      type: isStaff ? "staff" : isStudent ? "student" : null,
      student: isStudent
        ? {
            name: log.studentName,
            class: log.studentClass,
            section: log.section,
            roll: log.roll,
            photo: log.studentPhoto,
          }
        : null,
      staff: isStaff
        ? {
            name: log.staffName,
            designation: log.staffDesignation,
            class: log.staffClass,
          }
        : null,
    },
  });
});

module.exports = router;

// server/src/lib/devicePunch.js
// ============================================================================
// Shared device-punch processing
// (docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 2, section 3.5)
// ============================================================================
// The actual "find student, log the punch, upsert attendance, audit,
// guardian SMS" work — extracted out of routes/deviceAttendance.js's
// POST /punch (docs/ATTENDANCE_DEVICE_PLAN.md, Phase 2) unchanged in
// behavior, so it can be called from BOTH of this app's device-facing entry
// points without the logic drifting apart between them:
//   - routes/deviceAttendance.js's POST /api/device/punch (JSON, existing)
//   - routes/deviceIngest.js's ADMS-native POST /iclock/cdata (new, Phase 2
//     of the centralized-ingestion plan)
// Each route still authenticates the device and formats its own
// protocol-appropriate response (JSON error/success vs ADMS plain "OK") —
// only the DB work in between is shared here.
//
// Must be called with the caller's tenant schema already the active one
// (either via tenantResolve.js's normal per-request client, or a manually
// set up tenantContext.run() — see deviceIngest.js's withDeviceTenant()),
// since every db.*() call below reads that context transparently (pg.js).
// ============================================================================

const db = require("../db");
const { recordAudit } = require("./auditLog");
const { sendGuardianSms } = require("./guardianSms");

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

// `device` is a tenant-scoped attendance_devices row (needs .id for the
// attendance_logs FK, .name/.deviceId for the audit label). Returns
// { matched: false, punchAt } when the fingerprintId/cardUid isn't linked
// to any active student (still logged — see
// docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md's 2026-08-12 fix — so the
// kiosk/scan-enroll flows still see the attempt), or
// { matched: true, student, punchAt, firstToday } on a real match.
async function recordDevicePunch({ device, identifier, identifierType }) {
  // Column choice driven by identifierType, not by guessing which of the
  // two a given string looks like — see students.fingerprintId/cardUid.
  const column = identifierType === "card" ? '"cardUid"' : '"fingerprintId"';
  const student = await db.get(
    `SELECT id, name, class, section, roll, "studentPhoto", phone, status
     FROM students WHERE ${column} = $1`,
    [identifier]
  );

  if (!student || student.status !== "Active") {
    const punchAt = new Date().toISOString();
    await db.run(
      `INSERT INTO attendance_logs ("studentId", "deviceId", "punchAt", direction, method, matched, identifier)
       VALUES (NULL, $1, $2, NULL, $3, false, $4)`,
      [device.id, punchAt, identifierType, identifier]
    );
    return { matched: false, punchAt };
  }

  const punchAt = new Date().toISOString();
  const today = punchAt.slice(0, 10);

  // "punchAt" is stored as ISO-8601 text, which sorts and prefix-matches
  // correctly as a string — a LIKE 'today%' is enough to count today's
  // punches without a separate date column.
  const priorToday = await db.get(
    `SELECT COUNT(*)::int AS count FROM attendance_logs
     WHERE "studentId" = $1 AND "punchAt" LIKE $2`,
    [student.id, `${today}%`]
  );
  const isFirstPunchToday = priorToday.count === 0;

  // direction stays null: entry/exit is derived from first/last punch
  // ordering rather than recorded here, since most fingerprint/card
  // devices don't distinguish in/out at the hardware level.
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

  // Guardian SMS only on the day's first punch (entry) — notifying on
  // every punch would burn SMS wallet balance on a student who scans more
  // than once. sendGuardianSms never throws (no phone on file, plan
  // doesn't include SMS, empty wallet — all skip silently).
  if (isFirstPunchToday && student.phone) {
    await sendGuardianSms({
      to: student.phone,
      message: `${student.name} (রোল ${student.roll}) আজ ${punchAt.slice(11, 16)}-এ মাদরাসায় প্রবেশ করেছে।`,
      reference: `attendance-punch:${student.id}:${today}`,
      notificationType: "attendancePunch",
    });
  }

  return { matched: true, student, punchAt, firstToday: isFirstPunchToday };
}

module.exports = { recordDevicePunch, toStudentPayload };

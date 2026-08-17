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
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 4 — turns the day's first punch into
// an automatic 'উপস্থিত'/'দেরিতে' status instead of the old hardcoded
// 'উপস্থিত'. No shift resolved (class/staff not assigned one) => same
// 'উপস্থিত' as before, so this is additive, not a behavior change for
// anyone without a shift set up.
const { resolveShiftForClass, resolveShiftForStaff, computeEntryStatus } = require("./attendanceSchedule");

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

// docs/STAFF_ATTENDANCE_PLAN.md, Phase 7 — staff punch counterpart to
// toStudentPayload above.
function toStaffPayload(staff) {
  return {
    id: staff.id,
    name: staff.name,
    designation: staff.designation,
    class: staff.class,
  };
}

// `device` is a tenant-scoped attendance_devices row (needs .id for the
// attendance_logs FK, .name/.deviceId for the audit label). Returns
// { matched: false, punchAt } when the fingerprintId/cardUid isn't linked
// to any active student OR staff member (still logged — see
// docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md's 2026-08-12 fix — so the
// kiosk/scan-enroll flows still see the attempt), or
// { matched: true, type: "student", student, punchAt, firstToday } /
// { matched: true, type: "staff", staff, punchAt, firstToday } on a real
// match. Students are checked first, then staff — the same device serves
// both, and a fingerprintId/cardUid is only ever enrolled against one side
// (routes/staff.js's assertDeviceIdentifiersFree checks against `students`
// too, and vice versa, so the two can never collide in practice).
async function recordDevicePunch({ device, identifier, identifierType }) {
  // Column choice driven by identifierType, not by guessing which of the
  // two a given string looks like — see students.fingerprintId/cardUid.
  const column = identifierType === "card" ? '"cardUid"' : '"fingerprintId"';
  const student = await db.get(
    `SELECT id, name, class, section, roll, "studentPhoto", phone, status
     FROM students WHERE ${column} = $1`,
    [identifier]
  );

  if (student && student.status === "Active") {
    return recordStudentPunch({ device, student, identifier, identifierType });
  }

  const staff = await db.get(
    `SELECT id, name, designation, class, status, "shiftId" FROM staff WHERE ${column} = $1`,
    [identifier]
  );

  if (staff && staff.status === "Active") {
    return recordStaffPunch({ device, staff, identifier, identifierType });
  }

  const punchAt = new Date().toISOString();
  await db.run(
    `INSERT INTO attendance_logs ("studentId", "staffId", "deviceId", "punchAt", direction, method, matched, identifier)
     VALUES (NULL, NULL, $1, $2, NULL, $3, false, $4)`,
    [device.id, punchAt, identifierType, identifier]
  );
  return { matched: false, punchAt };
}

async function recordStudentPunch({ device, student, identifier, identifierType }) {
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

  if (isFirstPunchToday) {
    // Phase 4 — first punch of the day sets status (from the shift
    // comparison) and entryTime together; reuses the exact unique index
    // routes/attendance.js's manual save already conflicts on, so a device
    // punch and a teacher's manual mark can never disagree about which row
    // they're both writing.
    const shift = await resolveShiftForClass(student.class);
    const status = computeEntryStatus(punchAt, shift);
    await db.run(
      `INSERT INTO attendance ("studentId", date, status, "entryTime")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("studentId", date) DO UPDATE SET status = EXCLUDED.status, "entryTime" = EXCLUDED."entryTime"`,
      [student.id, today, status, punchAt]
    );
  } else {
    // Later punches the same day only move exitTime — status/entryTime set
    // by the first punch above stay as-is (§৩ "exit-টাইম status বদলাবে
    // না").
    await db.run(
      `UPDATE attendance SET "exitTime" = $3 WHERE "studentId" = $1 AND date = $2`,
      [student.id, today, punchAt]
    );
  }

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

  return { matched: true, type: "student", student, punchAt, firstToday: isFirstPunchToday };
}

// docs/STAFF_ATTENDANCE_PLAN.md, Phase 7 — same shape as
// recordStudentPunch above (attendance_logs row + daily-status upsert +
// audit), keyed by staffId instead of studentId and writing to
// staff_attendance instead of attendance. No guardian SMS — staff have no
// guardian to notify.
async function recordStaffPunch({ device, staff, identifier, identifierType }) {
  const punchAt = new Date().toISOString();
  const today = punchAt.slice(0, 10);

  const priorToday = await db.get(
    `SELECT COUNT(*)::int AS count FROM attendance_logs
     WHERE "staffId" = $1 AND "punchAt" LIKE $2`,
    [staff.id, `${today}%`]
  );
  const isFirstPunchToday = priorToday.count === 0;

  await db.run(
    `INSERT INTO attendance_logs ("staffId", "deviceId", "punchAt", direction, method, identifier)
     VALUES ($1, $2, $3, NULL, $4, $5)`,
    [staff.id, device.id, punchAt, identifierType, identifier]
  );

  if (isFirstPunchToday) {
    // Phase 4 — same first-punch status+entryTime logic as
    // recordStudentPunch above, resolved from staff.shiftId directly
    // instead of a class lookup.
    const shift = await resolveShiftForStaff(staff);
    const status = computeEntryStatus(punchAt, shift);
    await db.run(
      `INSERT INTO staff_attendance ("staffId", date, status, "entryTime")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("staffId", date) DO UPDATE SET status = EXCLUDED.status, "entryTime" = EXCLUDED."entryTime"`,
      [staff.id, today, status, punchAt]
    );
  } else {
    await db.run(
      `UPDATE staff_attendance SET "exitTime" = $3 WHERE "staffId" = $1 AND date = $2`,
      [staff.id, today, punchAt]
    );
  }

  await recordAudit({
    action: "staffAttendance.devicePunch",
    entityType: "attendance_logs",
    entityId: staff.id,
    label: `${staff.name} (${staff.designation}) — ডিভাইস পাঞ্চ (${device.name || device.deviceId})`,
    details: { deviceId: device.deviceId, method: identifierType, punchAt, firstToday: isFirstPunchToday },
  });

  return { matched: true, type: "staff", staff, punchAt, firstToday: isFirstPunchToday };
}

module.exports = { recordDevicePunch, toStudentPayload, toStaffPayload };

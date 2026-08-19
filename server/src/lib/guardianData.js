// ============================================================================
// lib/guardianData.js  (Guardian Portal — Step 5)
// ============================================================================
// Read-only data access for the guardian-facing dashboard/attendance/results
// pages. Every function that takes a studentId first proves — via
// guardian_students with status = 'active' — that this guardian is actually
// linked to that student, the same row-level rule feedForGuardian() in
// lib/classPosts.js already applies to the notices/assignments feed. A
// pending or rejected link (or someone else's studentId entirely) is
// rejected with a 403 before any query touches attendance/results, so a
// guardian can never reach another family's data by guessing a student id
// in the URL.
// ============================================================================

const db = require("./../db");
const { attachRanksAndSubjectGpa } = require("./results");

const ATTENDANCE_STATUSES = { PRESENT: "উপস্থিত", ABSENT: "অনুপস্থিত", LATE: "দেরিতে" };

function ownershipError() {
  const err = new Error("এই শিক্ষার্থীর তথ্যে আপনার অ্যাক্সেস নেই");
  err.status = 403;
  return err;
}

async function assertGuardianOwnsStudent(guardianId, studentId) {
  const row = await db.get(
    `SELECT 1 FROM guardian_students WHERE "guardianId" = $1 AND "studentId" = $2 AND status = 'active'`,
    [guardianId, studentId]
  );
  if (!row) throw ownershipError();
}

// Only the fields a guardian needs to identify/switch between their
// children — same narrow-columns reasoning as routes/results.js's
// GET /students (no phone/address/document fields). fee/due were added in
// Phase 8F so the guardian dashboard can show what's owed and offer a
// "Pay" button without a second round-trip per child.
async function activeChildrenForGuardian(guardianId) {
  return db.all(
    `SELECT s.id, s.name, s.roll, s.class, s.section, s.dept, s."studentPhoto", s.fee, s.due
     FROM guardian_students gs
     JOIN students s ON s.id = gs."studentId"
     WHERE gs."guardianId" = $1 AND gs.status = 'active'
     ORDER BY s.name`,
    [guardianId]
  );
}

// month is "YYYY-MM"; defaults to the current calendar month so the
// dashboard/attendance page has something to show without the guardian
// picking a range first.
async function attendanceHistoryForStudent(guardianId, studentId, { month } = {}) {
  await assertGuardianOwnsStudent(guardianId, studentId);
  const m = /^\d{4}-\d{2}$/.test(month || "") ? month : new Date().toISOString().slice(0, 7);
  const rows = await db.all(
    `SELECT date, status FROM attendance
     WHERE "studentId" = $1 AND date >= $2 AND date < to_char((($2 || '-01')::date + interval '1 month'), 'YYYY-MM-DD')
     ORDER BY date DESC`,
    [studentId, m]
  );
  const summary = { month: m, total: rows.length, present: 0, absent: 0, late: 0 };
  for (const r of rows) {
    if (r.status === ATTENDANCE_STATUSES.PRESENT) summary.present += 1;
    else if (r.status === ATTENDANCE_STATUSES.ABSENT) summary.absent += 1;
    else if (r.status === ATTENDANCE_STATUSES.LATE) summary.late += 1;
  }
  return { month: m, records: rows, summary };
}

// Guardians only ever see published results — same rule as the public
// result-lookup endpoint (lib/results.js searchPublicResult), just scoped
// to their own linked child instead of requiring a class+roll form.
async function publishedResultsForStudent(guardianId, studentId) {
  await assertGuardianOwnsStudent(guardianId, studentId);
  const rows = await db.all(
    `SELECT id, "studentId", "examName", year, class, roll, "studentName", subjects, "totalMarks", "obtainedMarks", gpa, grade, published
     FROM results WHERE "studentId" = $1 AND published = 1 ORDER BY year DESC, "examName"`,
    [studentId]
  );
  const parsed = rows.map((r) => ({ ...r, subjects: typeof r.subjects === "string" ? JSON.parse(r.subjects) : r.subjects }));
  // Attaches subject-wise GPA + মেধাস্থান (merit position) so the guardian's
  // result-sheet download/print matches the official layout — see
  // attachRanksAndSubjectGpa in lib/results.js. A guardian typically has at
  // most a handful of published results, so computing ranks per row here is
  // cheap; list-heavy admin views intentionally skip this (see routes/
  // results.js GET /:id/sheet) and only compute it on demand.
  return Promise.all(parsed.map((r) => attachRanksAndSubjectGpa(r)));
}

// Today's mark (if attendance has already been taken) for the dashboard's
// per-child summary card — deliberately today only, not a count, since the
// full history lives on the attendance page.
async function todayAttendanceForStudent(studentId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.get(`SELECT status FROM attendance WHERE "studentId" = $1 AND date = $2`, [studentId, today]);
  return row ? row.status : null;
}

// Batched version of todayAttendanceForStudent for multi-child screens (the
// guardian dashboard) — one query for all children instead of one query per
// child (N+1). Returns a Map keyed by studentId; a child with no attendance
// row taken yet today is simply absent from the map (caller treats that as
// null, same as the single-student version).
async function todayAttendanceForStudents(studentIds) {
  if (!studentIds || studentIds.length === 0) return new Map();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.all(
    `SELECT "studentId", status FROM attendance WHERE "studentId" = ANY($1) AND date = $2`,
    [studentIds, today]
  );
  return new Map(rows.map((r) => [r.studentId, r.status]));
}

module.exports = {
  ATTENDANCE_STATUSES,
  assertGuardianOwnsStudent,
  activeChildrenForGuardian,
  attendanceHistoryForStudent,
  publishedResultsForStudent,
  todayAttendanceForStudent,
  todayAttendanceForStudents,
};

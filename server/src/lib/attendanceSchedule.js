// server/src/lib/attendanceSchedule.js
//
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 4 — turns a punch timestamp into an
// automatic 'উপস্থিত'/'দেরিতে' status by comparing it against the shift
// assigned to the student's class (class_shifts) or the staff member's own
// shiftId. No shift resolved => no comparison possible => falls back to the
// pre-Phase-4 behavior ('উপস্থিত', unconditionally) so a class/staff without
// a shift assigned never regresses or breaks.

const db = require("../db");

// class_shifts.class is a plain text primary key (see supabase_schema.sql
// Phase 1 comment — classOptions/classTree have no table of their own), so
// this is a direct lookup, not a join through any class table.
async function resolveShiftForClass(className) {
  if (!className) return null;
  return db.get(
    `SELECT s.id, s.name, s."nameEn", s."startTime", s."endTime", s."graceMinutes", s.active
     FROM class_shifts cs
     JOIN shifts s ON s.id = cs."shiftId"
     WHERE cs.class = $1`,
    [className]
  );
}

// staffRow needs only .shiftId (nullable int, staffSchemas.js Phase 3) —
// callers already have the staff row from their own SELECT, so this takes
// the row rather than re-fetching by id.
async function resolveShiftForStaff(staffRow) {
  if (!staffRow || !staffRow.shiftId) return null;
  return db.get(
    `SELECT id, name, "nameEn", "startTime", "endTime", "graceMinutes", active
     FROM shifts WHERE id = $1`,
    [staffRow.shiftId]
  );
}

// punchTimeIso: full ISO-8601 timestamp of the punch (device local server
// time, same as everywhere else this project stores punchAt/entryTime).
// shift: a row from resolveShiftForClass/resolveShiftForStaff, or null/an
// inactive shift — either falls back to 'উপস্থিত' (§Phase 4 fallback rule,
// same as "no shift assigned").
function computeEntryStatus(punchTimeIso, shift) {
  if (!shift || !shift.active) return "উপস্থিত";

  const punchDate = new Date(punchTimeIso);
  const [startH, startM] = shift.startTime.split(":").map(Number);
  const graceMinutes = shift.graceMinutes || 0;

  const deadline = new Date(punchDate);
  deadline.setHours(startH, startM + graceMinutes, 0, 0);

  return punchDate > deadline ? "দেরিতে" : "উপস্থিত";
}

module.exports = { resolveShiftForClass, resolveShiftForStaff, computeEntryStatus };

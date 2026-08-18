// server/src/routes/staffAttendance.js
//
// docs/STAFF_ATTENDANCE_PLAN.md, Phase 3 — daily staff attendance, mirrors
// routes/attendance.js's shape (studentId -> staffId). No teacher class
// scoping here (attachTeacherClasses is student-attendance-specific, see
// lib/teacherScope.js) — staff attendance is Admin/Super Admin only (plan
// doc §6, open question 1 defaulted to "no Hostel Manager access" for now).

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { staffAttendanceSaveSchema } = require("../lib/opsSchemas");
const { idempotent } = require("../middleware/idempotency");
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 7 — same "X মিনিট দেরি" badge support
// as routes/attendance.js, resolved via staff.shiftId instead of a class
// lookup.
const { resolveShiftForStaff, lateMinutesFor } = require("../lib/attendanceSchedule");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("staffAttendance"));

function today() {
  return new Date().toISOString().slice(0, 10);
}

router.get("/", async (req, res) => {
  const date = req.query.date || today();

  const rows = await db.all(
    `SELECT st.id, st.name, st.designation, st.class, st."shiftId", COALESCE(sa.status, 'উপস্থিত') as att, sa."entryTime", sa."exitTime"
       FROM staff st
       LEFT JOIN staff_attendance sa ON sa."staffId" = st.id AND sa.date = $1
       WHERE st.status = 'Active'
       ORDER BY st.name`,
    [date]
  );

  // One resolveShiftForStaff() call per distinct shiftId, not per staff
  // row — same reasoning as routes/attendance.js's per-class cache.
  const shiftById = new Map();
  for (const row of rows) {
    if (row.shiftId && !shiftById.has(row.shiftId)) {
      shiftById.set(row.shiftId, await resolveShiftForStaff(row));
    }
  }
  const staff = rows.map((row) => ({
    ...row,
    lateMinutes: lateMinutesFor(row.entryTime, row.shiftId ? shiftById.get(row.shiftId) : null),
  }));

  res.json({ date, staff });
});

router.post("/", validate(staffAttendanceSaveSchema), idempotent(async (req, res) => {
  const { date: reqDate, records } = req.body;
  const date = reqDate || today();
  if (records.length === 0) return res.json({ ok: true, date });

  // Single multi-row INSERT, same reasoning as attendance.js's POST /.
  // Same COALESCE-preserve for entryTime/exitTime as attendance.js —
  // see that file's POST handler comment.
  const valuePlaceholders = [];
  const params = [];
  records.forEach((r, i) => {
    const base = i * 5;
    valuePlaceholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(r.staffId, date, r.status, r.entryTime || null, r.exitTime || null);
  });

  await db.run(
    `INSERT INTO staff_attendance ("staffId", date, status, "entryTime", "exitTime")
     VALUES ${valuePlaceholders.join(", ")}
     ON CONFLICT ("staffId", date) DO UPDATE SET
       status = EXCLUDED.status,
       "entryTime" = COALESCE(EXCLUDED."entryTime", staff_attendance."entryTime"),
       "exitTime" = COALESCE(EXCLUDED."exitTime", staff_attendance."exitTime")`,
    params
  );
  await recordAudit({
    action: "staffAttendance.saved",
    actor: req.user,
    entityType: "staffAttendance",
    label: `Saved staff attendance for ${date} (${records.length} staff)`,
    details: { date, count: records.length },
  });
  res.json({ ok: true, date });
}));

module.exports = router;

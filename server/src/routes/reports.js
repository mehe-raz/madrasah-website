/**
 * Reports API | রিপোর্ট ডেটা (তারিখ/মাস ফিল্টার)
 */
const express = require("express");
const db = require("../db");
const { requirePermission, canAccess } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 8 — same shift-resolve + lateMinutes
// helpers routes/attendance.js and routes/staffAttendance.js already use
// for the "X মিনিট দেরি" badge; reused here so a date-range "late arrivals"
// report needs no new lateness math of its own.
const { resolveShiftForClass, resolveShiftForStaff, lateMinutesFor } = require("../lib/attendanceSchedule");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("reports"));
// Phase 6: reports is a Standard+ plan feature.
router.use(requirePlanFeature("reportsExport"));

function parseRange(from, to) {
  const f = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const t = to || new Date().toISOString().slice(0, 10);
  return { from: f, to: t };
}

router.get("/income", async (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const rows = await db.all(
    `SELECT i.*, s.name as "studentName", s.roll as "studentRoll"
     FROM income i LEFT JOIN students s ON s.id = i."studentId"
     WHERE i.date >= $1 AND i.date <= $2 ORDER BY i.date DESC`,
    [from, to]
  );
  res.json({ from, to, rows });
});

router.get("/expenses", async (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const rows = await db.all(`SELECT * FROM expenses WHERE date >= $1 AND date <= $2 ORDER BY date DESC`, [from, to]);
  res.json({ from, to, rows });
});

router.get("/attendance", async (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const rows = await db.all(
    `SELECT a.date, a.status, s.id as "studentId", s.name, s.roll, s.class, s.dept
     FROM attendance a JOIN students s ON s.id = a."studentId"
     WHERE a.date >= $1 AND a.date <= $2 ORDER BY a.date, s.roll`,
    [from, to]
  );
  res.json({ from, to, rows });
});

// docs/SHIFT_SCHEDULE_PLAN.md, Phase 8 — "দেরিতে আসা" (late arrivals) list
// for the Reports module, student/staff as two separate ?type= values
// rather than one combined query (their underlying tables/permissions
// differ — see the staffAttendance check below).
//
// Lateness itself is NOT recomputed here: attendance.status/staff_attendance.status
// already get set to 'দেরিতে' at write time — automatically by
// lib/devicePunch.js (Phase 4) for device punches, or manually by whoever
// marks attendance — so this just filters on that existing column. entryTime
// + lateMinutes are added purely for display (same lateMinutesFor() call
// routes/attendance.js and routes/staffAttendance.js already use for their
// "X মিনিট দেরি" badge), not to redecide who counts as late.
router.get("/late-arrivals", async (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const type = req.query.type === "staff" ? "staff" : "student";

  // staff_attendance sits behind its own "staffAttendance" permission
  // (see routes/staffAttendance.js's router-level check) — the "reports"
  // check this router already applies isn't enough on its own for the
  // staff branch, so it's checked explicitly here too.
  if (type === "staff" && !canAccess(req.user.role, "staffAttendance")) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (type === "staff") {
    const rows = await db.all(
      `SELECT sa.date, sa."entryTime", st.id as "staffId", st.name, st.designation, st."shiftId"
       FROM staff_attendance sa JOIN staff st ON st.id = sa."staffId"
       WHERE sa.status = 'দেরিতে' AND sa.date >= $1 AND sa.date <= $2
       ORDER BY sa.date, st.name`,
      [from, to]
    );
    // One resolveShiftForStaff() call per distinct shiftId in this result
    // set, not per row — same per-page cache pattern as routes/attendance.js.
    const shiftByShiftId = new Map();
    for (const row of rows) {
      if (!shiftByShiftId.has(row.shiftId)) {
        shiftByShiftId.set(row.shiftId, await resolveShiftForStaff({ shiftId: row.shiftId }));
      }
    }
    const result = rows.map((row) => ({
      date: row.date,
      staffId: row.staffId,
      name: row.name,
      designation: row.designation,
      entryTime: row.entryTime,
      lateMinutes: lateMinutesFor(row.entryTime, shiftByShiftId.get(row.shiftId)),
    }));
    return res.json({ from, to, type, rows: result });
  }

  const rows = await db.all(
    `SELECT a.date, a."entryTime", s.id as "studentId", s.name, s.roll, s.class, s.dept
     FROM attendance a JOIN students s ON s.id = a."studentId"
     WHERE a.status = 'দেরিতে' AND a.date >= $1 AND a.date <= $2
     ORDER BY a.date, s.roll`,
    [from, to]
  );
  const shiftByClass = new Map();
  for (const row of rows) {
    if (!shiftByClass.has(row.class)) {
      shiftByClass.set(row.class, await resolveShiftForClass(row.class));
    }
  }
  const result = rows.map((row) => ({
    date: row.date,
    studentId: row.studentId,
    name: row.name,
    roll: row.roll,
    class: row.class,
    dept: row.dept,
    entryTime: row.entryTime,
    lateMinutes: lateMinutesFor(row.entryTime, shiftByClass.get(row.class)),
  }));
  res.json({ from, to, type, rows: result });
});

module.exports = router;

// ============================================================================
// lib/teacherScope.js  (Step 3 — Teacher class-scoping, row-level filter)
// ============================================================================
// A Teacher's access to attendance/results/assignments is limited to the
// classes explicitly assigned to them in teacher_class_assignments (set by
// Super Admin/Admin from Settings > Users — see the PUT /api/users/:id/classes
// route in routes/users.js). Admin and Super Admin remain unscoped — this
// middleware only ever restricts the "Teacher" role.
//
// Contract (relied on by routes/assignments.js, routes/attendance.js,
// routes/results.js): sets req.teacherClasses to an array of class names
// when req.user.role === "Teacher" (possibly an empty array, if nothing's
// assigned yet); leaves it undefined for every other role, so
// `if (req.teacherClasses)` is a reliable "am I scoped?" check in every
// route that mounts this middleware.
// ============================================================================

const db = require("../db");

async function classesForTeacher(userId) {
  const rows = await db.all(
    'SELECT class FROM teacher_class_assignments WHERE "userId" = $1 ORDER BY class',
    [userId]
  );
  return rows.map((r) => r.class);
}

async function attachTeacherClasses(req, res, next) {
  if (req.user?.role !== "Teacher") return next();
  try {
    req.teacherClasses = await classesForTeacher(req.user.id);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachTeacherClasses, classesForTeacher };

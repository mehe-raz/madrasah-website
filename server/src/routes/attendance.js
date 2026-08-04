const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { attachTeacherClasses } = require("../lib/teacherScope");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { attendanceSaveSchema } = require("../lib/opsSchemas");
const { idempotent } = require("../middleware/idempotency");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("attendance"));
// Same contract as assignments.js/results.js — see lib/teacherScope.js. A
// Teacher only ever sees/saves attendance for students in their assigned
// classes; Admin/Hostel Manager (also holders of the "attendance"
// permission) stay unscoped since req.teacherClasses is only ever set for
// role === "Teacher".
router.use(attachTeacherClasses);

const OUT_OF_SCOPE_ERROR = "আপনার নির্ধারিত ক্লাসের বাইরের ছাত্রের উপস্থিতি সংরক্ষণ করা যাবে না";

function today() {
  return new Date().toISOString().slice(0, 10);
}

router.get("/", async (req, res) => {
  const date = req.query.date || today();
  const dept = req.query.dept;

  if (req.teacherClasses && req.teacherClasses.length === 0) {
    return res.json({ date, dept: dept || "সব", students: [] });
  }

  let sql = `SELECT s.*, COALESCE(a.status, 'উপস্থিত') as att
       FROM students s
       LEFT JOIN attendance a ON a."studentId" = s.id AND a.date = $1
       WHERE s.status = 'Active'`;
  const params = [date];
  if (dept && dept !== "সব" && dept !== "All") {
    params.push(dept);
    sql += ` AND s.dept = $${params.length}`;
  }
  if (req.teacherClasses) {
    params.push(req.teacherClasses);
    sql += ` AND s.class = ANY($${params.length})`;
  }
  sql += " ORDER BY s.roll";
  const rows = await db.all(sql, params);
  res.json({ date, dept: dept || "সব", students: rows });
});

// The 5000-record cap on a single save is enforced in the zod schema
// (lib/opsSchemas.js attendanceSaveSchema) rather than here.
router.post("/", validate(attendanceSaveSchema), idempotent(async (req, res) => {
  const { date: reqDate, records } = req.body;
  const date = reqDate || today();
  if (records.length === 0) return res.json({ ok: true, date });

  if (req.teacherClasses) {
    // A Teacher's records array carries only studentId/status (no class),
    // so the only way to stop a crafted request from saving attendance for
    // another class is to look each studentId's actual class up here and
    // reject the whole save if any of them falls outside the Teacher's
    // assigned classes — same fail-closed approach as assignments.js's
    // POST /, just applied per-row since this endpoint is batch.
    const ids = records.map((r) => r.studentId);
    const rows = await db.all('SELECT id, class FROM students WHERE id = ANY($1)', [ids]);
    const classById = new Map(rows.map((r) => [r.id, r.class]));
    const outOfScope = ids.some((id) => !classById.has(id) || !req.teacherClasses.includes(classById.get(id)));
    if (outOfScope) return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  }

  // Single multi-row INSERT instead of one round-trip per student — with a
  // few hundred students this turns Save from N sequential DB calls into
  // one, which matters most on hosted DBs (Render/Neon/Supabase) where
  // each round trip carries real network latency.
  const valuePlaceholders = [];
  const params = [];
  records.forEach((r, i) => {
    const base = i * 3;
    valuePlaceholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(r.studentId, date, r.status);
  });

  await db.run(
    `INSERT INTO attendance ("studentId", date, status)
     VALUES ${valuePlaceholders.join(", ")}
     ON CONFLICT ("studentId", date) DO UPDATE SET status = EXCLUDED.status`,
    params
  );
  // One summary entry per save, not one per student record — a single
  // attendance sheet can cover hundreds of students, and per-row entries
  // would drown out everything else in the audit log without adding
  // meaningful detail over "who saved attendance for which date".
  await recordAudit({
    action: "attendance.saved",
    actor: req.user,
    entityType: "attendance",
    label: `Saved attendance for ${date} (${records.length} student(s))`,
    details: { date, count: records.length },
  });
  res.json({ ok: true, date });
}));

module.exports = router;

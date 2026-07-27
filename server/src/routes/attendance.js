const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { attendanceSaveSchema } = require("../lib/opsSchemas");
const { idempotent } = require("../middleware/idempotency");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("attendance"));

function today() {
  return new Date().toISOString().slice(0, 10);
}

router.get("/", async (req, res) => {
  const date = req.query.date || today();
  const dept = req.query.dept;
  let sql = `SELECT s.*, COALESCE(a.status, 'উপস্থিত') as att
       FROM students s
       LEFT JOIN attendance a ON a."studentId" = s.id AND a.date = $1
       WHERE s.status = 'Active'`;
  const params = [date];
  if (dept && dept !== "সব" && dept !== "All") {
    sql += " AND s.dept = $2";
    params.push(dept);
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

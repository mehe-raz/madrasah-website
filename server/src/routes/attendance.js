const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

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

router.post("/", async (req, res) => {
  const { date: reqDate, records } = req.body;
  const date = reqDate || today();
  if (!Array.isArray(records)) return res.status(400).json({ error: "records আবশ্যক" });

  await db.withTransaction(async (tx) => {
    for (const r of records) {
      await tx.run(
        `INSERT INTO attendance ("studentId", date, status) VALUES ($1, $2, $3)
         ON CONFLICT ("studentId", date) DO UPDATE SET status = EXCLUDED.status`,
        [r.studentId, date, r.status]
      );
    }
  });
  res.json({ ok: true, date });
});

module.exports = router;

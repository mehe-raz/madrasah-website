const express = require("express");
const db = require("../db");

const router = express.Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

router.get("/", (req, res) => {
  const date = req.query.date || today();
  const dept = req.query.dept;
  let sql = `SELECT s.*, COALESCE(a.status, 'উপস্থিত') as att
       FROM students s
       LEFT JOIN attendance a ON a.studentId = s.id AND a.date = ?
       WHERE s.status = 'সক্রিয়'`;
  const params = [date];
  if (dept && dept !== "সব") {
    sql += " AND s.dept = ?";
    params.push(dept);
  }
  sql += " ORDER BY s.roll";
  const rows = db.prepare(sql).all(...params);
  res.json({ date, dept: dept || "সব", students: rows });
});

router.post("/", (req, res) => {
  const { date: reqDate, records } = req.body;
  const date = reqDate || today();
  if (!Array.isArray(records)) return res.status(400).json({ error: "records আবশ্যক" });

  const upsert = db.prepare(`
    INSERT INTO attendance (studentId, date, status) VALUES (?, ?, ?)
    ON CONFLICT(studentId, date) DO UPDATE SET status = excluded.status
  `);
  const tx = db.transaction((items) => items.forEach((r) => upsert.run(r.studentId, date, r.status)));
  tx(records);
  res.json({ ok: true, date });
});

module.exports = router;

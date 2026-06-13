/**
 * Reports API | রিপোর্ট ডেটা (তারিখ/মাস ফিল্টার)
 */
const express = require("express");
const db = require("../db");

const router = express.Router();

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

module.exports = router;

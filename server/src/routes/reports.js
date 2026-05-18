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

router.get("/income", (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const rows = db
    .prepare(
      `SELECT i.*, s.name as studentName, s.roll as studentRoll
       FROM income i LEFT JOIN students s ON s.id = i.studentId
       WHERE i.date >= ? AND i.date <= ? ORDER BY i.date DESC`
    )
    .all(from, to);
  res.json({ from, to, rows });
});

router.get("/expenses", (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const rows = db
    .prepare(`SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC`)
    .all(from, to);
  res.json({ from, to, rows });
});

router.get("/attendance", (req, res) => {
  const { from, to } = parseRange(req.query.from, req.query.to);
  const rows = db
    .prepare(
      `SELECT a.date, a.status, s.id as studentId, s.name, s.roll, s.class, s.dept
       FROM attendance a JOIN students s ON s.id = a.studentId
       WHERE a.date >= ? AND a.date <= ? ORDER BY a.date, s.roll`
    )
    .all(from, to);
  res.json({ from, to, rows });
});

module.exports = router;

const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  const students = db.prepare("SELECT * FROM students WHERE dept = 'হিফজ' ORDER BY roll").all();
  res.json(students);
});

router.patch("/:studentId/para", (req, res) => {
  const { para } = req.body;
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(req.params.studentId);
  if (!student || student.dept !== "হিফজ") return res.status(404).json({ error: "হিফজ ছাত্র পাওয়া যায়নি" });
  db.prepare("UPDATE students SET para = ? WHERE id = ?").run(Math.min(30, Math.max(0, Number(para))), student.id);
  res.json(db.prepare("SELECT * FROM students WHERE id = ?").get(student.id));
});

router.post("/:studentId/sabaq", (req, res) => {
  const { sabaq } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const result = db
    .prepare("INSERT INTO hifz_logs (studentId, date, sabaq) VALUES (?, ?, ?)")
    .run(req.params.studentId, date, sabaq || "");
  res.status(201).json({ id: result.lastInsertRowid, studentId: Number(req.params.studentId), date, sabaq });
});

router.get("/:studentId/logs", (req, res) => {
  const logs = db
    .prepare("SELECT * FROM hifz_logs WHERE studentId = ? ORDER BY date DESC LIMIT 30")
    .all(req.params.studentId);
  res.json(logs);
});

module.exports = router;

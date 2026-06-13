const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", async (_req, res) => {
  const students = await db.all("SELECT * FROM students WHERE dept = 'হিফজ' ORDER BY roll");
  res.json(students);
});

router.patch("/:studentId/para", async (req, res) => {
  const { para } = req.body;
  const student = await db.get("SELECT * FROM students WHERE id = $1", [req.params.studentId]);
  if (!student || student.dept !== "হিফজ") return res.status(404).json({ error: "হিফজ ছাত্র পাওয়া যায়নি" });
  await db.run("UPDATE students SET para = $1 WHERE id = $2", [Math.min(30, Math.max(0, Number(para))), student.id]);
  res.json(await db.get("SELECT * FROM students WHERE id = $1", [student.id]));
});

router.post("/:studentId/sabaq", async (req, res) => {
  const { sabaq } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const result = await db.run(
    'INSERT INTO hifz_logs ("studentId", date, sabaq) VALUES ($1, $2, $3) RETURNING id',
    [req.params.studentId, date, sabaq || ""]
  );
  res.status(201).json({ id: result.insertId, studentId: Number(req.params.studentId), date, sabaq });
});

router.get("/:studentId/logs", async (req, res) => {
  const logs = await db.all(
    'SELECT * FROM hifz_logs WHERE "studentId" = $1 ORDER BY date DESC LIMIT 30',
    [req.params.studentId]
  );
  res.json(logs);
});

module.exports = router;

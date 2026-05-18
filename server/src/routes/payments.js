const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM payments ORDER BY id DESC").all());
});

router.post("/", (req, res) => {
  const { studentId, amount, method } = req.body;
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
  if (!student) return res.status(404).json({ error: "ছাত্র পাওয়া যায়নি" });

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "অবৈধ পরিমাণ" });

  const maxId = db.prepare("SELECT MAX(id) as m FROM payments").get().m || 0;
  const receipt = `RCP-2025-${String(maxId + 1).padStart(3, "0")}`;
  const date = new Date().toLocaleDateString("bn-BD");
  const newDue = Math.max(0, student.due - payAmount);
  const status = newDue === 0 && payAmount >= student.fee ? "সম্পন্ন" : payAmount >= student.due ? "সম্পন্ন" : "আংশিক";

  const payment = {
    studentId,
    student: student.name,
    roll: student.roll,
    amount: payAmount,
    date,
    receipt,
    method: method || "নগদ",
    status,
  };

  const result = db
    .prepare(
      `INSERT INTO payments (studentId, student, roll, amount, date, receipt, method, status)
       VALUES (@studentId, @student, @roll, @amount, @date, @receipt, @method, @status)`
    )
    .run(payment);

  db.prepare("UPDATE students SET due = ? WHERE id = ?").run(newDue, studentId);

  res.status(201).json({ id: result.lastInsertRowid, ...payment });
});

module.exports = router;

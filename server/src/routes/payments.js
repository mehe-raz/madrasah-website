const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM payments ORDER BY id DESC").all());
});

router.post("/", (req, res) => {
  const { studentId, amount, method } = req.body;
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const maxId = db.prepare("SELECT MAX(id) as m FROM payments").get().m || 0;
  const receipt = `RCP-${new Date().getFullYear()}-${String(maxId + 1).padStart(3, "0")}`;
  const date = new Date().toISOString().slice(0, 10);
  const newDue = Math.max(0, Number(student.due || 0) - payAmount);
  const status = newDue === 0 || payAmount >= Number(student.due || 0) ? "Completed" : "Partial";
  const payment = {
    studentId,
    student: student.name,
    roll: student.roll,
    amount: payAmount,
    date,
    receipt,
    method: method || "Cash",
    status,
  };

  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO payments (studentId, student, roll, amount, date, receipt, method, status)
         VALUES (@studentId, @student, @roll, @amount, @date, @receipt, @method, @status)`
      )
      .run(payment);

    db.prepare(
      `INSERT INTO income (category, amount, date, note, method, receipt, studentId, status)
       VALUES ('Student Fee', ?, ?, ?, ?, ?, ?, 'Completed')`
    ).run(payAmount, date, `Fee from ${student.name}`, payment.method, receipt, studentId);

    db.prepare("UPDATE students SET due = ? WHERE id = ?").run(newDue, studentId);
    return result.lastInsertRowid;
  });

  res.status(201).json({ id: tx(), ...payment });
});

module.exports = router;

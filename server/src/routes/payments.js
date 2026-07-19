const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// (payments maps to the "income" permission, matching ROUTE_PERMISSION in rbac.js)
router.use(requirePermission("income"));

router.get("/", async (_req, res) => {
  res.json(await db.all("SELECT * FROM payments ORDER BY id DESC"));
});

router.post("/", async (req, res) => {
  const { studentId, amount, method } = req.body;
  const student = await db.get("SELECT * FROM students WHERE id = $1", [studentId]);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const maxRow = await db.get("SELECT MAX(id) as m FROM payments");
  const maxId = maxRow?.m || 0;
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

  const insertId = await db.withTransaction(async (tx) => {
    const result = await tx.run(
      `INSERT INTO payments ("studentId", student, roll, amount, date, receipt, method, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [payment.studentId, payment.student, payment.roll, payment.amount, payment.date, payment.receipt, payment.method, payment.status]
    );

    await tx.run(
      `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
       VALUES ('Student Fee', $1, $2, $3, $4, $5, $6, 'Completed')`,
      [payAmount, date, `Fee from ${student.name}`, payment.method, receipt, studentId]
    );

    await tx.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, studentId]);
    return result.insertId;
  });

  res.status(201).json({ id: insertId, ...payment });
});

module.exports = router;

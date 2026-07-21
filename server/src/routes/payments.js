const express = require("express");
const db = require("../db");
const { createDeleteRequest, isApprovalRole } = require("../lib/deleteRequests");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// (payments maps to the "income" permission, matching ROUTE_PERMISSION in rbac.js)
router.use(requirePermission("income"));

function paymentStatus(dueAfterPayment) {
  return dueAfterPayment <= 0 ? "সম্পন্ন" : "আংশিক";
}

function normalizeDate(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw;
}

async function loadStudentOr404(studentId) {
  const student = await db.get("SELECT * FROM students WHERE id = $1", [studentId]);
  if (!student) return null;
  return student;
}

async function syncLinkedIncome(tx, payment, student, status, amount, date, method) {
  const existingIncome = await tx.get("SELECT id FROM income WHERE receipt = $1 AND category = 'Student Fee'", [
    payment.receipt,
  ]);

  if (existingIncome) {
    await tx.run(
      `UPDATE income
       SET amount = $1, date = $2, note = $3, method = $4, "studentId" = $5, status = $6
       WHERE receipt = $7`,
      [amount, date, `Fee from ${student.name}`, method, student.id, status, payment.receipt]
    );
  } else {
    await tx.run(
      `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
       VALUES ('Student Fee', $1, $2, $3, $4, $5, $6, $7)`,
      [amount, date, `Fee from ${student.name}`, method, payment.receipt, student.id, status]
    );
  }
}

router.get("/", async (_req, res) => {
  res.json(await db.all("SELECT * FROM payments ORDER BY id DESC"));
});

router.post("/", async (req, res) => {
  const { studentId, amount, method } = req.body;
  const student = await loadStudentOr404(studentId);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const maxRow = await db.get("SELECT MAX(id) as m FROM payments");
  const maxId = maxRow?.m || 0;
  const receipt = `RCP-${new Date().getFullYear()}-${String(maxId + 1).padStart(3, "0")}`;
  const date = new Date().toISOString().slice(0, 10);
  const newDue = Math.max(0, Number(student.due || 0) - payAmount);
  const status = paymentStatus(newDue);
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

    await tx.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, studentId]);
    await syncLinkedIncome(tx, payment, student, status, payAmount, date, payment.method);
    return result.insertId;
  });

  res.status(201).json({ id: insertId, ...payment });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM payments WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Payment not found" });

  const nextStudentId = req.body.studentId != null ? Number(req.body.studentId) : existing["studentId"];
  const nextAmount = req.body.amount != null ? Number(req.body.amount) : Number(existing.amount);
  const nextMethod = req.body.method != null ? String(req.body.method).trim() : existing.method || "Cash";
  const nextDate = normalizeDate(req.body.date, existing.date);
  if (!nextStudentId) return res.status(400).json({ error: "studentId is required" });
  if (!nextAmount || nextAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const student = await loadStudentOr404(nextStudentId);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const oldStudentId = existing["studentId"];
  const oldAmount = Number(existing.amount);

  let updated;
  await db.withTransaction(async (tx) => {
    if (oldStudentId) {
      await tx.run("UPDATE students SET due = due + $1 WHERE id = $2", [oldAmount, oldStudentId]);
    }
    await tx.run("UPDATE students SET due = GREATEST(0, due - $1) WHERE id = $2", [nextAmount, nextStudentId]);

    const dueRow = await tx.get("SELECT due FROM students WHERE id = $1", [nextStudentId]);
    const nextStatus = paymentStatus(Number(dueRow?.due || 0));

    await tx.run(
      `UPDATE payments
       SET "studentId" = $1, student = $2, roll = $3, amount = $4, date = $5, method = $6, status = $7
       WHERE id = $8`,
      [nextStudentId, student.name, student.roll, nextAmount, nextDate, nextMethod, nextStatus, id]
    );

    const paymentForIncome = {
      receipt: existing.receipt,
    };
    await syncLinkedIncome(tx, paymentForIncome, student, nextStatus, nextAmount, nextDate, nextMethod);
    updated = await tx.get("SELECT * FROM payments WHERE id = $1", [id]);
  });

  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM payments WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (!isApprovalRole(req.user?.role)) {
    const request = await createDeleteRequest({
      entityType: "payment-delete",
      entityId: id,
      label: `${existing.receipt} - ${existing.student}`,
      amount: existing.amount,
      user: req.user,
      payload: { receipt: existing.receipt, studentId: existing["studentId"] },
    });
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }

  await db.withTransaction(async (tx) => {
    if (existing["studentId"]) {
      await tx.run("UPDATE students SET due = due + $1 WHERE id = $2", [existing.amount, existing["studentId"]]);
    }
    await tx.run("DELETE FROM income WHERE receipt = $1 AND category = 'Student Fee'", [existing.receipt]);
    await tx.run("DELETE FROM payments WHERE id = $1", [id]);
  });

  res.json({ ok: true });
});

module.exports = router;

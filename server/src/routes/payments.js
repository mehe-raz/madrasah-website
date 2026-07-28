const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { nextReceipt } = require("../lib/receiptCounter");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// (payments maps to the "income" permission, matching ROUTE_PERMISSION in rbac.js)
router.use(requirePermission("income"));

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

router.get("/", async (req, res) => {
  const limit = clampInt(req.query.limit, 25, 1, 100);
  const page = clampInt(req.query.page, 1, 1, 100000);
  const paginate = req.query.paginate === "1" || req.query.paginate === "true" || req.query.page != null || req.query.limit != null;

  const baseSql = `FROM payments ORDER BY id DESC`;
  if (paginate) {
    const totalRow = await db.get("SELECT COUNT(*)::int AS total FROM payments");
    const total = totalRow?.total || 0;
    const offset = (page - 1) * limit;
    const rows = await db.all(`SELECT * ${baseSql} LIMIT $1 OFFSET $2`, [limit, offset]);
    return res.json({
      items: rows,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  res.json(await db.all("SELECT * FROM payments ORDER BY id DESC"));
});

router.post("/", async (req, res) => {
  const { studentId, amount, method } = req.body;
  const student = await db.get("SELECT id, name, roll, due FROM students WHERE id = $1", [studentId]);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const date = new Date().toISOString().slice(0, 10);
  const newDue = Math.max(0, Number(student.due || 0) - payAmount);
  const status = newDue === 0 || payAmount >= Number(student.due || 0) ? "Completed" : "Partial";

  // receipt is generated inside the transaction via an atomic
  // UPDATE ... RETURNING on receipt_counters, so two concurrent payment
  // requests can never both compute the same next number the way the old
  // "SELECT MAX(id) FROM payments" (done before the transaction, with no
  // retry) could — that raced under load and threw an unhandled unique
  // constraint error on payments.receipt.
  const { insertId, payment } = await db.withTransaction(async (tx) => {
    const receipt = await nextReceipt(tx, { table: "payments", key: "payment_receipt", prefix: `RCP-${new Date().getFullYear()}-`, pad: 3 });
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
    return { insertId: result.insertId, payment };
  });

  await recordAudit({
    action: "payment.created",
    actor: req.user,
    entityType: "payment",
    entityId: insertId,
    label: `Payment ৳${payment.amount} from ${payment.student} (Roll ${payment.roll})`,
    details: { studentId: payment.studentId, amount: payment.amount, method: payment.method, receipt: payment.receipt, status: payment.status },
  });

  res.status(201).json({ id: insertId, ...payment });
});

// Exposed for unit testing only; does not affect route behavior.
router.clampInt = clampInt;

module.exports = router;

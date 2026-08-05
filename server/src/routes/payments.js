const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { nextReceipt } = require("../lib/receiptCounter");
const { recordAudit } = require("../lib/auditLog");
const { idempotent } = require("../middleware/idempotency");
const { isApprovalRole } = require("../lib/deleteRequests");
const { createNotification } = require("../lib/notifications");
const { computePaymentOutcome, computeDueAfterPayment } = require("../lib/paymentLogic");

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

router.post("/", idempotent(async (req, res) => {
  const { studentId, amount, method } = req.body;
  const student = await db.get("SELECT id, name, roll, due FROM students WHERE id = $1", [studentId]);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const payAmount = Number(amount);
  if (!payAmount || payAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const date = new Date().toISOString().slice(0, 10);
  const currentDue = Number(student.due || 0);

  // Offline-first Phase 5: a queued payment (see client/src/lib/offlineDb.ts)
  // can reach the server well after it was collected, so by sync time
  // another payment for the same student — queued from a different device,
  // or taken live in the meantime — may have already cleared the due to 0.
  // The idempotency middleware only catches an exact retry of the SAME
  // request; it does nothing for two genuinely different payments. Rather
  // than guess which one is "real" and silently double-book income, treat
  // "due already 0" as a conflict: keep the payment row (nothing is lost)
  // but withhold the income entry and due deduction until a Super
  // Admin/Admin reviews it via POST /:id/resolve-flag below.
  const { isConflict, newDue, status } = computePaymentOutcome(currentDue, payAmount);
  const flagReason = isConflict
    ? `এই ছাত্রের বকেয়া ইতিমধ্যে ০, কিন্তু ৳${payAmount} এর আরেকটি পেমেন্ট এসেছে — সম্ভবত অফলাইনে দুইজন একই বেতন নিয়েছেন।`
    : null;

  // receipt is generated inside the transaction via an atomic
  // UPDATE ... RETURNING on receipt_counters, so two concurrent payment
  // requests can never both compute the same next number the way the old
  // "SELECT MAX(id) FROM payments" (done before the transaction, with no
  // retry) could — that raced under load and threw an unhandled unique
  // constraint error on payments.receipt. A flagged payment still gets a
  // real receipt number (it's a real record awaiting review, not a no-op).
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
      flagReason,
    };

    const result = await tx.run(
      `INSERT INTO payments ("studentId", student, roll, amount, date, receipt, method, status, "flagReason")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [payment.studentId, payment.student, payment.roll, payment.amount, payment.date, payment.receipt, payment.method, payment.status, payment.flagReason]
    );

    if (!isConflict) {
      await tx.run(
        `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
         VALUES ('Student Fee', $1, $2, $3, $4, $5, $6, 'Completed')`,
        [payAmount, date, `Fee from ${student.name}`, payment.method, receipt, studentId]
      );
      await tx.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, studentId]);
    }
    return { insertId: result.insertId, payment };
  });

  await recordAudit({
    action: isConflict ? "payment.flagged" : "payment.created",
    actor: req.user,
    entityType: "payment",
    entityId: insertId,
    label: isConflict
      ? `Flagged payment ৳${payment.amount} from ${payment.student} (Roll ${payment.roll}) — due already 0`
      : `Payment ৳${payment.amount} from ${payment.student} (Roll ${payment.roll})`,
    details: { studentId: payment.studentId, amount: payment.amount, method: payment.method, receipt: payment.receipt, status: payment.status },
  });

  if (isConflict) {
    await createNotification({
      type: "payment-flagged",
      title: "একটি পেমেন্ট পর্যালোচনা প্রয়োজন",
      body: `${payment.student} (রোল ${payment.roll}) — ৳${payment.amount}, বকেয়া ইতিমধ্যে শূন্য ছিল`,
      entityType: "payment",
      entityId: insertId,
      link: "/fees",
      targetRoles: ["Admin", "Super Admin"],
    });
  }

  res.status(201).json({ id: insertId, ...payment });
}));

// List of payments awaiting review (see isConflict above). Kept as its own
// small endpoint rather than filtering the paginated GET / client-side,
// since a flagged entry could be on any page and there are normally very
// few of them.
router.get("/flagged", async (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const rows = await db.all(`SELECT * FROM payments WHERE status = 'Flagged' ORDER BY id DESC LIMIT 100`);
  res.json(rows);
});

// Super Admin/Admin resolves a flagged payment: "confirm" books it now
// (income entry + due deduction, computed against the student's CURRENT
// due since time has passed since it was queued); "void" marks it as not
// counted, keeping the row for the audit trail instead of deleting it
// (deleting would lose the receipt history — same lesson as the payments
// ON DELETE CASCADE issue elsewhere in this codebase).
router.post("/:id/resolve-flag", async (req, res) => {
  if (!isApprovalRole(req.user?.role)) return res.status(403).json({ error: "Approval access required" });
  const id = Number(req.params.id);
  const action = req.body?.action;
  if (action !== "confirm" && action !== "void") {
    return res.status(400).json({ error: "action must be 'confirm' or 'void'" });
  }

  const row = await db.get("SELECT * FROM payments WHERE id = $1", [id]);
  if (!row) return res.status(404).json({ error: "Payment not found" });
  if (row.status !== "Flagged") return res.status(400).json({ error: "Payment is not flagged" });

  if (action === "void") {
    await db.run(
      `UPDATE payments SET status = 'Voided', "flagReason" = $1 WHERE id = $2`,
      [`${row.flagReason || ""} (বাতিল করেছেন ${req.user?.name || "Admin"})`.trim(), id]
    );
    await recordAudit({
      action: "payment.flag-voided",
      actor: req.user,
      entityType: "payment",
      entityId: id,
      label: `Voided flagged payment ৳${row.amount} from ${row.student} (Roll ${row.roll})`,
      details: { amount: row.amount, studentId: row.studentId },
    });
    return res.json({ ok: true, status: "Voided" });
  }

  const student = await db.get("SELECT id, name, roll, due FROM students WHERE id = $1", [row.studentId]);
  const currentDue = Number(student?.due || 0);
  const { newDue, status: finalStatus } = computeDueAfterPayment(currentDue, row.amount);

  await db.withTransaction(async (tx) => {
    await tx.run(`UPDATE payments SET status = $1, "flagReason" = NULL WHERE id = $2`, [finalStatus, id]);
    await tx.run(
      `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
       VALUES ('Student Fee', $1, $2, $3, $4, $5, $6, 'Completed')`,
      [row.amount, row.date, `Fee from ${row.student} (পর্যালোচনার পর নিশ্চিত)`, row.method, row.receipt, row.studentId]
    );
    if (student) await tx.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, row.studentId]);
  });

  await recordAudit({
    action: "payment.flag-confirmed",
    actor: req.user,
    entityType: "payment",
    entityId: id,
    label: `Confirmed flagged payment ৳${row.amount} from ${row.student} (Roll ${row.roll})`,
    details: { amount: row.amount, studentId: row.studentId, newDue },
  });

  res.json({ ok: true, status: finalStatus });
});

// Exposed for unit testing only; does not affect route behavior.
router.clampInt = clampInt;

module.exports = router;

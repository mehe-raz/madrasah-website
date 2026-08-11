const express = require("express");
const db = require("../db");
const { getIncomeCategories, setIncomeCategories } = require("../lib/incomeCategories");
const { createDeleteRequest, isApprovalRole } = require("../lib/deleteRequests");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { nextReceipt } = require("../lib/receiptCounter");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { incomeCreateSchema, incomeUpdateSchema } = require("../lib/financeSchemas");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("income"));
// Phase 6: same Income screen as payments.js (tabs share one page client-side).
router.use(requirePlanFeature("feesCollection"));

router.get("/categories", async (_req, res) => {
  res.json(await getIncomeCategories());
});

router.get("/summary", async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";
  if (from && to) {
    params.push(from, to);
    where = `WHERE date >= $1 AND date <= $2`;
  }
  const [totalRow, catRows] = await Promise.all([
    db.get(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::int AS total FROM income ${where}`, params),
    db.all(`SELECT category, COALESCE(SUM(amount), 0)::int AS total FROM income ${where} GROUP BY category ORDER BY total DESC`, params),
  ]);
  res.json({
    total: totalRow?.total || 0,
    count: totalRow?.count || 0,
    byCategory: catRows.map((r) => ({ cat: r.category, total: r.total })),
  });
});

router.put("/categories", async (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: "categories array required" });
  try {
    res.json(await setIncomeCategories(categories));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseListOptions(query) {
  const limit = clampInt(query.limit, 25, 1, 100);
  const page = clampInt(query.page, 1, 1, 100000);
  const paginate = query.paginate === "1" || query.paginate === "true" || query.page != null || query.limit != null;
  return { limit, page, paginate };
}

router.get("/", async (req, res) => {
  const { from, to, category } = req.query;
  const { limit, page, paginate } = parseListOptions(req.query);
  let sql = `SELECT i.id, i.category, i.amount, i.date, i.note, i.method, i.receipt, i."studentId", i.status, s.name as "studentName", s.roll as "studentRoll"
       FROM income i LEFT JOIN students s ON s.id = i."studentId"`;
  const conditions = [];
  const params = [];
  if (from && to) {
    params.push(from, to);
    conditions.push(`i.date >= $${params.length - 1} AND i.date <= $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`i.category = $${params.length}`);
  }
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY i.id DESC";

  if (paginate) {
    const totalRow = await db.get(`SELECT COUNT(*)::int AS total FROM income i ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`, params);
    const total = totalRow?.total || 0;
    const offset = (page - 1) * limit;
    const rows = await db.all(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    return res.json({
      items: rows.map((r) => ({
        id: r.id,
        category: r.category,
        amount: r.amount,
        date: r.date,
        note: r.note,
        method: r.method,
        receipt: r.receipt,
        studentId: r.studentId,
        student: r.studentName,
        roll: r.studentRoll,
        status: r.status,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  const rows = await db.all(sql, params);
  res.json(
    rows.map((r) => ({
      id: r.id,
      category: r.category,
      amount: r.amount,
      date: r.date,
      note: r.note,
      method: r.method,
      receipt: r.receipt,
      studentId: r.studentId,
      student: r.studentName,
      roll: r.studentRoll,
      status: r.status,
    }))
  );
});

router.post("/", validate(incomeCreateSchema), async (req, res) => {
  const { category, amount, note, method, studentId, date } = req.body;
  const CATEGORIES = await getIncomeCategories();
  if (!category || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  const amt = amount;

  let student = null;
  if (studentId) {
    student = await db.get("SELECT * FROM students WHERE id = $1", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found" });
  }

  const entryDate = date || new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();

  const insertId = await db.withTransaction(async (tx) => {
    // A "Student Fee" entry made here (instead of via the Payments module)
    // mirrors into `payments` below — and from here on, both rows share
    // ONE receipt (the RCP- one), the same way payments.js's own mirror
    // does it (see the POST / there: it reuses its own receipt for the
    // income row it creates). That shared receipt is what lets PATCH/DELETE
    // below find and keep the paired row in sync instead of one going
    // stale — before this, this direction minted two unrelated receipt
    // numbers (INC- for income, RCP- for payments) with nothing connecting
    // them, so editing or deleting the income row here silently left a
    // mismatched payments row behind.
    const isFeeForStudent = student && category === "Student Fee";
    const receipt = isFeeForStudent
      ? await nextReceipt(tx, { table: "payments", key: "payment_receipt", prefix: `RCP-${year}-`, pad: 3 })
      : await nextReceipt(tx, { table: "income", key: "income_receipt", prefix: `INC-${year}-`, pad: 4 });

    const result = await tx.run(
      `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [category, amt, entryDate, note || "", method || "Cash", receipt, studentId || null, "Completed"]
    );

    if (isFeeForStudent) {
      const newDue = Math.max(0, student.due - amt);
      await tx.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, studentId]);

      await tx.run(
        `INSERT INTO payments ("studentId", student, roll, amount, date, receipt, method, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [studentId, student.name, student.roll, amt, entryDate, receipt, method || "Cash", newDue === 0 ? "Completed" : "Partial"]
      );
    }

    return result.insertId;
  });

  const row = await db.get("SELECT * FROM income WHERE id = $1", [insertId]);
  await recordAudit({
    action: "income.created",
    actor: req.user,
    entityType: "income",
    entityId: row.id,
    label: `Recorded income: ${row.receipt} — ${row.category}, ৳${row.amount}`,
    details: { category: row.category, amount: row.amount, studentId: row.studentId },
  });
  res.status(201).json(row);
});

router.patch("/:id", validate(incomeUpdateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM income WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { category, amount, note, method, date } = req.body;
  const CATEGORIES = await getIncomeCategories();
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const nextCategory = category ?? existing.category;
  const nextAmount = amount != null ? amount : existing.amount;
  const wasFee = existing.category === "Student Fee";
  const isFee = nextCategory === "Student Fee";

  await db.withTransaction(async (tx) => {
    await tx.run(
      `UPDATE income SET
        category = COALESCE($1, category),
        amount = COALESCE($2, amount),
        note = COALESCE($3, note),
        method = COALESCE($4, method),
        date = COALESCE($5, date)
       WHERE id = $6`,
      [category ?? null, amount != null ? amount : null, note ?? null, method ?? null, date ?? null, id]
    );

    // Keep the linked student's due balance correct: undo the old effect on
    // due (if this entry used to count as a Student Fee payment) and apply
    // the new effect (if it still does / now does), so editing an entry
    // can't silently leave the student's balance out of sync.
    if (existing.studentId) {
      const delta = (wasFee ? existing.amount : 0) - (isFee ? nextAmount : 0);
      if (delta !== 0) {
        await tx.run("UPDATE students SET due = GREATEST(0, due + $1) WHERE id = $2", [delta, existing.studentId]);
      }
    }

    // Since income.js's own POST now mints one shared receipt for a
    // Student-Fee entry and its mirrored payments row (see POST / above),
    // editing amount/method/date here without also touching that payments
    // row would immediately break the invariant it exists to keep — the
    // receipt would show one amount in Fees/Payments and another in
    // Income. Only applies when this entry was (and still is) a Student
    // Fee entry; a category change away from it is left alone (the
    // payments row is history at that point, not a live mirror).
    if (wasFee && isFee && existing.receipt) {
      await tx.run(
        `UPDATE payments SET amount = COALESCE($1, amount), method = COALESCE($2, method), date = COALESCE($3, date)
         WHERE receipt = $4`,
        [amount != null ? amount : null, method ?? null, date ?? null, existing.receipt]
      );
    }
  });

  const updated = await db.get("SELECT * FROM income WHERE id = $1", [id]);
  await recordAudit({
    action: "income.updated",
    actor: req.user,
    entityType: "income",
    entityId: id,
    label: `Updated income: ${updated.receipt} — ${updated.category}, ৳${updated.amount}`,
    details: { before: { category: existing.category, amount: existing.amount }, after: { category: updated.category, amount: updated.amount } },
  });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM income WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (!isApprovalRole(req.user?.role)) {
    const request = await createDeleteRequest({
      entityType: "income",
      entityId: id,
      label: `${existing.receipt} - ${existing.category}`,
      amount: existing.amount,
      user: req.user,
    });
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }

  // Same shared-receipt invariant as PATCH above: a Student-Fee income row
  // has a matching payments row under the same receipt (see POST /). Delete
  // it too, in the same transaction, so approval-role's immediate delete
  // can't leave a payment sitting in Fees/Payments for an income entry that
  // no longer exists.
  await db.withTransaction(async (tx) => {
    await tx.run("DELETE FROM income WHERE id = $1", [id]);
    if (existing.category === "Student Fee") {
      if (existing.studentId) {
        await tx.run("UPDATE students SET due = due + $1 WHERE id = $2", [existing.amount, existing.studentId]);
      }
      if (existing.receipt) {
        await tx.run("DELETE FROM payments WHERE receipt = $1", [existing.receipt]);
      }
    }
  });
  await recordAudit({
    action: "income.deleted",
    actor: req.user,
    entityType: "income",
    entityId: id,
    label: `Deleted income: ${existing.receipt} — ${existing.category}, ৳${existing.amount}`,
  });
  res.json({ ok: true });
});

module.exports = router;

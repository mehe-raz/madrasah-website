const express = require("express");
const db = require("../db");
const { createDeleteRequest, isApprovalRole } = require("../lib/deleteRequests");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { expenseCreateSchema } = require("../lib/opsSchemas");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("expenses"));
// Phase 6: expense tracking is a Standard+ plan feature.
router.use(requirePlanFeature("expenses"));

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

// Totals + by-category breakdown for the Expenses screen's summary cards,
// computed in SQL instead of requiring the full row set on the client.
router.get("/summary", async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";
  if (from && to) {
    params.push(from, to);
    where = `WHERE date >= $1 AND date <= $2`;
  }
  const [totalRow, catRows] = await Promise.all([
    db.get(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::int AS total FROM expenses ${where}`, params),
    db.all(`SELECT cat, COALESCE(SUM(amount), 0)::int AS total FROM expenses ${where} GROUP BY cat ORDER BY total DESC`, params),
  ]);
  res.json({
    total: totalRow?.total || 0,
    count: totalRow?.count || 0,
    byCategory: catRows.map((r) => ({ cat: r.cat, total: r.total })),
  });
});

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const { limit, page, paginate } = parseListOptions(req.query);
  const conditions = [];
  const params = [];
  if (from && to) {
    params.push(from, to);
    conditions.push(`date >= $${params.length - 1} AND date <= $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  if (paginate) {
    const totalRow = await db.get(`SELECT COUNT(*)::int AS total FROM expenses ${where}`, params);
    const total = totalRow?.total || 0;
    const offset = (page - 1) * limit;
    const rows = await db.all(
      `SELECT * FROM expenses ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return res.json({
      items: rows,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  const rows = await db.all(`SELECT * FROM expenses ${where} ORDER BY id DESC`, params);
  res.json(rows);
});

router.post("/", validate(expenseCreateSchema), async (req, res) => {
  const { cat, amount: amt, note } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const result = await db.run(
    "INSERT INTO expenses (cat, amount, date, note) VALUES ($1, $2, $3, $4) RETURNING id",
    [cat, amt, date, note || ""]
  );
  await recordAudit({
    action: "expense.created",
    actor: req.user,
    entityType: "expense",
    entityId: result.insertId,
    label: `Expense ৳${amt} - ${cat}`,
    details: { cat, amount: amt, note: note || "" },
  });
  res.status(201).json({ id: result.insertId, cat, amount: amt, date, note: note || "" });
});

router.delete("/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM expenses WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "ব্যয় পাওয়া যায়নি" });

  if (!isApprovalRole(req.user?.role)) {
    const request = await createDeleteRequest({
      entityType: "expense",
      entityId: Number(req.params.id),
      label: `${existing.cat} - ${existing.date}`,
      amount: existing.amount,
      user: req.user,
    });
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }

  const result = await db.run("DELETE FROM expenses WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "ব্যয় পাওয়া যায়নি" });
  await recordAudit({
    action: "expense.deleted",
    actor: req.user,
    entityType: "expense",
    entityId: Number(req.params.id),
    label: `Deleted expense ৳${existing.amount} - ${existing.cat}`,
  });
  res.json({ ok: true });
});

module.exports = router;

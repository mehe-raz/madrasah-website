const express = require("express");
const db = require("../db");
const { createDeleteRequest, isApprovalRole } = require("../lib/deleteRequests");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("expenses"));

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  if (from && to) {
    return res.json(
      await db.all("SELECT * FROM expenses WHERE date >= $1 AND date <= $2 ORDER BY id DESC", [from, to])
    );
  }
  res.json(await db.all("SELECT * FROM expenses ORDER BY id DESC"));
});

router.post("/", async (req, res) => {
  const { cat, amount, note } = req.body;
  const amt = Number(amount);
  if (!cat || !amt || amt <= 0) return res.status(400).json({ error: "ক্যাটাগরি ও সঠিক পরিমাণ আবশ্যক" });
  const date = new Date().toISOString().slice(0, 10);
  const result = await db.run(
    "INSERT INTO expenses (cat, amount, date, note) VALUES ($1, $2, $3, $4) RETURNING id",
    [cat, amt, date, note || ""]
  );
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
  res.json({ ok: true });
});

module.exports = router;

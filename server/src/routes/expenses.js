const express = require("express");
const db = require("../db");
const { createDeleteRequest, isApprovalRole } = require("../lib/deleteRequests");

const router = express.Router();

router.get("/", (req, res) => {
  const { from, to } = req.query;
  if (from && to) {
    return res.json(
      db.prepare("SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY id DESC").all(from, to)
    );
  }
  res.json(db.prepare("SELECT * FROM expenses ORDER BY id DESC").all());
});

router.post("/", (req, res) => {
  const { cat, amount, note } = req.body;
  if (!cat || !amount) return res.status(400).json({ error: "ক্যাটাগরি ও পরিমাণ আবশ্যক" });
  const date = new Date().toLocaleDateString("bn-BD");
  const result = db
    .prepare("INSERT INTO expenses (cat, amount, date, note) VALUES (?, ?, ?, ?)")
    .run(cat, Number(amount), date, note || "");
  res.status(201).json({ id: result.lastInsertRowid, cat, amount: Number(amount), date, note: note || "" });
});

router.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "ব্যয় পাওয়া যায়নি" });

  if (!isApprovalRole(req.user?.role)) {
    const request = createDeleteRequest({
      entityType: "expense",
      entityId: Number(req.params.id),
      label: `${existing.cat} - ${existing.date}`,
      amount: existing.amount,
      user: req.user,
    });
    return res.status(202).json({ ok: true, pendingApproval: true, request });
  }

  const result = db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "ব্যয় পাওয়া যায়নি" });
  res.json({ ok: true });
});

module.exports = router;

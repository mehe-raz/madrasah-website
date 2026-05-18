const express = require("express");
const db = require("../db");
const { getIncomeCategories, setIncomeCategories } = require("../lib/incomeCategories");

const router = express.Router();

router.get("/categories", (_req, res) => {
  res.json(getIncomeCategories());
});

router.put("/categories", (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: "categories array required" });
  try {
    res.json(setIncomeCategories(categories));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/", (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT i.*, s.name as studentName, s.roll as studentRoll
       FROM income i LEFT JOIN students s ON s.id = i.studentId`;
  const params = [];
  if (from && to) {
    sql += " WHERE i.date >= ? AND i.date <= ?";
    params.push(from, to);
  }
  sql += " ORDER BY i.id DESC";
  const rows = db.prepare(sql).all(...params);
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

router.post("/", (req, res) => {
  const { category, amount, note, method, studentId, date } = req.body;
  const CATEGORIES = getIncomeCategories();
  if (!category || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "Invalid amount" });

  let student = null;
  if (studentId) {
    student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });
  }

  const maxId = db.prepare("SELECT MAX(id) as m FROM income").get().m || 0;
  const receipt = `INC-${new Date().getFullYear()}-${String(maxId + 1).padStart(4, "0")}`;
  const entryDate = date || new Date().toISOString().slice(0, 10);

  const result = db
    .prepare(
      `INSERT INTO income (category, amount, date, note, method, receipt, studentId, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      category,
      amt,
      entryDate,
      note || "",
      method || "Cash",
      receipt,
      studentId || null,
      "Completed"
    );

  if (student && category === "Student Fee") {
    const newDue = Math.max(0, student.due - amt);
    db.prepare("UPDATE students SET due = ? WHERE id = ?").run(newDue, studentId);
    const payMax = db.prepare("SELECT MAX(id) as m FROM payments").get().m || 0;
    const payReceipt = `RCP-${new Date().getFullYear()}-${String(payMax + 1).padStart(3, "0")}`;
    db.prepare(
      `INSERT INTO payments (studentId, student, roll, amount, date, receipt, method, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      studentId,
      student.name,
      student.roll,
      amt,
      entryDate,
      payReceipt,
      method || "Cash",
      newDue === 0 ? "Completed" : "Partial"
    );
  }

  const row = db.prepare("SELECT * FROM income WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM income WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { category, amount, note, method, date } = req.body;
  const CATEGORIES = getIncomeCategories();
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  db.prepare(
    `UPDATE income SET
      category = COALESCE(?, category),
      amount = COALESCE(?, amount),
      note = COALESCE(?, note),
      method = COALESCE(?, method),
      date = COALESCE(?, date)
     WHERE id = ?`
  ).run(
    category ?? null,
    amount != null ? Number(amount) : null,
    note ?? null,
    method ?? null,
    date ?? null,
    id
  );
  res.json(db.prepare("SELECT * FROM income WHERE id = ?").get(id));
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare("DELETE FROM income WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

module.exports = router;

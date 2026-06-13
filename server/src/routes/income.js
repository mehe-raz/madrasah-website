const express = require("express");
const db = require("../db");
const { getIncomeCategories, setIncomeCategories } = require("../lib/incomeCategories");
const { createDeleteRequest, isApprovalRole } = require("../lib/deleteRequests");

const router = express.Router();

router.get("/categories", async (_req, res) => {
  res.json(await getIncomeCategories());
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

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT i.*, s.name as "studentName", s.roll as "studentRoll"
       FROM income i LEFT JOIN students s ON s.id = i."studentId"`;
  const params = [];
  if (from && to) {
    sql += " WHERE i.date >= $1 AND i.date <= $2";
    params.push(from, to);
  }
  sql += " ORDER BY i.id DESC";
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

router.post("/", async (req, res) => {
  const { category, amount, note, method, studentId, date } = req.body;
  const CATEGORIES = await getIncomeCategories();
  if (!category || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "Invalid amount" });

  let student = null;
  if (studentId) {
    student = await db.get("SELECT * FROM students WHERE id = $1", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found" });
  }

  const maxRow = await db.get("SELECT MAX(id) as m FROM income");
  const maxId = maxRow?.m || 0;
  const receipt = `INC-${new Date().getFullYear()}-${String(maxId + 1).padStart(4, "0")}`;
  const entryDate = date || new Date().toISOString().slice(0, 10);

  const result = await db.run(
    `INSERT INTO income (category, amount, date, note, method, receipt, "studentId", status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [category, amt, entryDate, note || "", method || "Cash", receipt, studentId || null, "Completed"]
  );

  if (student && category === "Student Fee") {
    const newDue = Math.max(0, student.due - amt);
    await db.run("UPDATE students SET due = $1 WHERE id = $2", [newDue, studentId]);
    const payMaxRow = await db.get("SELECT MAX(id) as m FROM payments");
    const payMax = payMaxRow?.m || 0;
    const payReceipt = `RCP-${new Date().getFullYear()}-${String(payMax + 1).padStart(3, "0")}`;
    await db.run(
      `INSERT INTO payments ("studentId", student, roll, amount, date, receipt, method, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [studentId, student.name, student.roll, amt, entryDate, payReceipt, method || "Cash", newDue === 0 ? "Completed" : "Partial"]
    );
  }

  const row = await db.get("SELECT * FROM income WHERE id = $1", [result.insertId]);
  res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.get("SELECT * FROM income WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { category, amount, note, method, date } = req.body;
  const CATEGORIES = await getIncomeCategories();
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  await db.run(
    `UPDATE income SET
      category = COALESCE($1, category),
      amount = COALESCE($2, amount),
      note = COALESCE($3, note),
      method = COALESCE($4, method),
      date = COALESCE($5, date)
     WHERE id = $6`,
    [category ?? null, amount != null ? Number(amount) : null, note ?? null, method ?? null, date ?? null, id]
  );
  res.json(await db.get("SELECT * FROM income WHERE id = $1", [id]));
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

  const result = await db.run("DELETE FROM income WHERE id = $1", [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

module.exports = router;

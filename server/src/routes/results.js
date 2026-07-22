const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { listResults, upsertResult, setPublished, deleteResult } = require("../lib/results");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("results"));

// Minimal student lookup for the marks-entry screen. Deliberately narrow
// columns (id/name/roll/class only — no phone/address/documents) so
// Teacher-role users, who don't have the broader "students" permission,
// can still find a student by class to enter marks without gaining access
// to unrelated personal data.
router.get("/classes", async (_req, res) => {
  const rows = await db.all("SELECT DISTINCT class FROM students WHERE class <> '' ORDER BY class");
  res.json(rows.map((r) => r.class));
});

router.get("/students", async (req, res) => {
  const { class: className } = req.query;
  if (!className) return res.json([]);
  const rows = await db.all('SELECT id, name, roll, class FROM students WHERE class = $1 ORDER BY roll', [className]);
  res.json(rows);
});

router.get("/", async (req, res) => {
  const { class: className, examName, year } = req.query;
  res.json(await listResults({ class: className, examName, year }));
});

router.post("/", async (req, res) => {
  try {
    const row = await upsertResult(req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Save failed" });
  }
});

router.patch("/:id/publish", async (req, res) => {
  const row = await setPublished(req.params.id, !!req.body.published);
  if (!row) return res.status(404).json({ error: "Result not found" });
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  await deleteResult(req.params.id);
  res.status(204).end();
});

module.exports = router;

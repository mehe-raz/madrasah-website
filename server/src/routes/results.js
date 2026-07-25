const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { listResults, upsertResult, setPublished, deleteResult } = require("../lib/results");
const { recordAudit } = require("../lib/auditLog");

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
    await recordAudit({
      action: "result.saved",
      actor: req.user,
      entityType: "result",
      entityId: row.id,
      label: `Saved result: ${row.studentName} (Roll ${row.roll}) — ${row.examName} ${row.year}`,
      details: { studentId: row.studentId, examName: row.examName, year: row.year, obtainedMarks: row.obtainedMarks, totalMarks: row.totalMarks },
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Save failed" });
  }
});

router.patch("/:id/publish", async (req, res) => {
  const published = !!req.body.published;
  const row = await setPublished(req.params.id, published);
  if (!row) return res.status(404).json({ error: "Result not found" });
  await recordAudit({
    action: published ? "result.published" : "result.unpublished",
    actor: req.user,
    entityType: "result",
    entityId: row.id,
    label: `${published ? "Published" : "Unpublished"} result: ${row.studentName} (Roll ${row.roll}) — ${row.examName} ${row.year}`,
  });
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM results WHERE id = $1", [req.params.id]);
  await deleteResult(req.params.id);
  if (existing) {
    await recordAudit({
      action: "result.deleted",
      actor: req.user,
      entityType: "result",
      entityId: existing.id,
      label: `Deleted result: ${existing.studentName} (Roll ${existing.roll}) — ${existing.examName} ${existing.year}`,
    });
  }
  res.status(204).end();
});

module.exports = router;

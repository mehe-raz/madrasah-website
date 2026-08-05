const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { attachTeacherClasses } = require("../lib/teacherScope");
const { listResults, upsertResult, setPublished, deleteResult } = require("../lib/results");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { resultSaveSchema } = require("../lib/financeSchemas");
const { sendGuardianSms } = require("../lib/guardianSms");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("results"));
// Same contract as assignments.js/attendance.js — see lib/teacherScope.js.
router.use(attachTeacherClasses);

const OUT_OF_SCOPE_ERROR = "আপনার নির্ধারিত ক্লাসের বাইরের তথ্যে অ্যাক্সেস নেই";

// Minimal student lookup for the marks-entry screen. Deliberately narrow
// columns (id/name/roll/class only — no phone/address/documents) so
// Teacher-role users, who don't have the broader "students" permission,
// can still find a student by class to enter marks without gaining access
// to unrelated personal data.
router.get("/classes", async (req, res) => {
  if (req.teacherClasses) return res.json([...req.teacherClasses].sort());
  const rows = await db.all("SELECT DISTINCT class FROM students WHERE class <> '' ORDER BY class");
  res.json(rows.map((r) => r.class));
});

router.get("/students", async (req, res) => {
  const { class: className } = req.query;
  if (!className) return res.json([]);
  if (req.teacherClasses && !req.teacherClasses.includes(className)) {
    return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  }
  const rows = await db.all('SELECT id, name, roll, class FROM students WHERE class = $1 ORDER BY roll', [className]);
  res.json(rows);
});

router.get("/", async (req, res) => {
  const { class: className, examName, year } = req.query;
  if (req.teacherClasses) {
    if (req.teacherClasses.length === 0) return res.json([]);
    if (className && !req.teacherClasses.includes(className)) {
      return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
    }
    return res.json(await listResults({ class: className, classes: className ? undefined : req.teacherClasses, examName, year }));
  }
  res.json(await listResults({ class: className, examName, year }));
});

router.post("/", validate(resultSaveSchema), async (req, res) => {
  try {
    if (req.teacherClasses) {
      // resultSaveSchema doesn't carry a class field (upsertResult derives
      // it server-side from the student row) — so the scope check has to
      // look the student up here too, same reasoning as attendance.js's
      // POST /.
      const student = await db.get("SELECT class FROM students WHERE id = $1", [req.body.studentId]);
      if (!student || !req.teacherClasses.includes(student.class)) {
        return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
      }
    }
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
  const existing = await db.get("SELECT class FROM results WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Result not found" });
  if (req.teacherClasses && !req.teacherClasses.includes(existing.class)) {
    return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  }
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

  // BUSINESS_READINESS_ROADMAP.md Phase 8C — SMS the guardian when a
  // result is published (not on unpublish). Best-effort: sendGuardianSms
  // never throws (no phone on file, plan doesn't include SMS, empty
  // wallet, provider error — all just skip silently), so this can't turn
  // a successful publish into a failed response.
  if (published) {
    const student = await db.get("SELECT phone FROM students WHERE id = $1", [row.studentId]);
    if (student?.phone) {
      await sendGuardianSms({
        to: student.phone,
        message: `${row.studentName} (রোল ${row.roll}) এর ${row.examName} ${row.year} পরীক্ষার ফলাফল প্রকাশিত হয়েছে।`,
        reference: `result-published:${row.id}`,
      });
    }
  }

  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const existing = await db.get("SELECT * FROM results WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(204).end();
  if (req.teacherClasses && !req.teacherClasses.includes(existing.class)) {
    return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  }
  await deleteResult(req.params.id);
  await recordAudit({
    action: "result.deleted",
    actor: req.user,
    entityType: "result",
    entityId: existing.id,
    label: `Deleted result: ${existing.studentName} (Roll ${existing.roll}) — ${existing.examName} ${existing.year}`,
  });
  res.status(204).end();
});

module.exports = router;

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { attachTeacherClasses } = require("../lib/teacherScope");
const {
  listResults,
  getResultById,
  upsertResult,
  saveSubjectForClass,
  setPublished,
  setPublishedBatch,
  deleteResult,
  attachRanksAndSubjectGpa,
} = require("../lib/results");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { resultSaveSchema, resultSubjectBatchSchema, resultPublishBatchSchema } = require("../lib/financeSchemas");
const { sendGuardianSms } = require("../lib/guardianSms");
const { notifyGuardians } = require("../lib/guardianPush");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("results"));
// Same contract as assignments.js/attendance.js — see lib/teacherScope.js.
router.use(attachTeacherClasses);

const OUT_OF_SCOPE_ERROR = "আপনার নির্ধারিত ক্লাসের বাইরের তথ্যে অ্যাক্সেস নেই";

// Shared by the single-result publish route and the checkbox-select
// batch-publish route below: records the audit entry and, on publish only,
// best-effort notifies the guardian (SMS + push). Never throws — every
// notify/audit call inside is itself best-effort — so it can't turn a
// successful publish into a failed response for the caller.
async function afterPublish(row, published, actor) {
  await recordAudit({
    action: published ? "result.published" : "result.unpublished",
    actor,
    entityType: "result",
    entityId: row.id,
    label: `${published ? "Published" : "Unpublished"} result: ${row.studentName} (Roll ${row.roll}) — ${row.examName} ${row.year}`,
  });

  // BUSINESS_READINESS_ROADMAP.md Phase 8C — SMS the guardian when a
  // result is published (not on unpublish). Best-effort: sendGuardianSms
  // never throws (no phone on file, plan doesn't include SMS, empty
  // wallet, provider error — all just skip silently).
  if (!published) return;
  const student = await db.get("SELECT phone FROM students WHERE id = $1", [row.studentId]);
  if (student?.phone) {
    await sendGuardianSms({
      to: student.phone,
      message: `${row.studentName} (রোল ${row.roll}) এর ${row.examName} ${row.year} পরীক্ষার ফলাফল প্রকাশিত হয়েছে।`,
      reference: `result-published:${row.id}`,
      notificationType: "resultPublished",
    });
  }
  // Push, alongside the SMS above — Phase 6 (optional) of docs/
  // PUSH_NOTIFICATION_PLAN.md. One-off lookup (not a shared helper like
  // classPosts.resolveGuardiansForClass, since this is the only call
  // site) — same ACTIVE-linked-only rule as everywhere else.
  const guardianRows = await db.all(
    `SELECT DISTINCT "guardianId" FROM guardian_students WHERE "studentId" = $1 AND status = 'active'`,
    [row.studentId]
  );
  await notifyGuardians(
    guardianRows.map((r) => r.guardianId),
    {
      title: "ফলাফল প্রকাশিত হয়েছে",
      body: `${row.studentName} (রোল ${row.roll}) — ${row.examName} ${row.year}`,
      url: "/guardian/results",
    }
  );
}

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

router.post("/subject-batch", validate(resultSubjectBatchSchema), async (req, res) => {
  try {
    if (req.teacherClasses && !req.teacherClasses.includes(req.body.class)) {
      return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
    }
    const { updated, skipped } = await saveSubjectForClass(req.body);
    await recordAudit({
      action: "result.subjectBatchSaved",
      actor: req.user,
      entityType: "result",
      entityId: null,
      label: `Batch-saved "${req.body.subjectName}" marks — ${req.body.class}, ${req.body.examName} ${req.body.year} (${updated.length} students${skipped.length ? `, ${skipped.length} skipped` : ""})`,
      details: {
        class: req.body.class,
        examName: req.body.examName,
        year: req.body.year,
        subjectName: req.body.subjectName,
        fullMarks: req.body.fullMarks,
        studentCount: updated.length,
        skipped,
      },
    });
    res.status(200).json({ updated, skipped });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Save failed" });
  }
});

// Printable রেজাল্ট শীট (result sheet) data for one result row: subject-wise
// GPA + মেধাস্থান (merit position) and the overall merit position, computed
// on demand (see attachRanksAndSubjectGpa) so the plain list endpoint above
// stays cheap. Same scope check as the other :id routes below.
router.get("/:id/sheet", async (req, res) => {
  const existing = await getResultById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Result not found" });
  if (req.teacherClasses && !req.teacherClasses.includes(existing.class)) {
    return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
  }
  res.json(await attachRanksAndSubjectGpa(existing));
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
  await afterPublish(row, published, req.user);
  res.json(row);
});

// Checkbox-select bulk publish/unpublish — the "নির্বাচিতগুলো প্রকাশ করুন"
// button on the results screen, so a teacher can publish a whole class's
// results in one click instead of toggling each student individually.
// A selected id outside the teacher's scope, or one that doesn't resolve to
// a real result, is silently dropped from the batch rather than failing
// the whole request.
router.patch("/publish-batch", validate(resultPublishBatchSchema), async (req, res) => {
  try {
    const { ids, published } = req.body;
    let targetIds = ids;
    if (req.teacherClasses) {
      const rows = await db.all(`SELECT id, class FROM results WHERE id = ANY($1)`, [ids]);
      targetIds = rows.filter((r) => req.teacherClasses.includes(r.class)).map((r) => r.id);
    }
    const updatedRows = await setPublishedBatch(targetIds, published);
    for (const row of updatedRows) {
      await afterPublish(row, published, req.user);
    }
    res.json(updatedRows);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Publish failed" });
  }
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

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { LIST_COLUMNS } = require("../models/studentAdmission");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { hifzParaSchema, hifzSabaqSchema } = require("../lib/opsSchemas");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("hifz"));
// Phase 6: Hifz tracking is a Standard+ plan feature.
router.use(requirePlanFeature("hifzTracking"));

router.get("/", async (_req, res) => {
  const students = await db.all(`SELECT ${LIST_COLUMNS} FROM students WHERE dept = 'Hifz' ORDER BY roll`);
  res.json(students);
});

router.patch("/:studentId/para", validate(hifzParaSchema), async (req, res) => {
  const { para } = req.body;
  const student = await db.get("SELECT * FROM students WHERE id = $1", [req.params.studentId]);
  if (!student || student.dept !== "Hifz") return res.status(404).json({ error: "হিফজ ছাত্র পাওয়া যায়নি" });
  const clampedPara = para;
  await db.run("UPDATE students SET para = $1 WHERE id = $2", [clampedPara, student.id]);
  await recordAudit({
    action: "hifz.para_updated",
    actor: req.user,
    entityType: "student",
    entityId: student.id,
    label: `Updated para for ${student.name} (Roll ${student.roll}): ${student.para} → ${clampedPara}`,
    details: { from: student.para, to: clampedPara },
  });
  res.json(await db.get("SELECT * FROM students WHERE id = $1", [student.id]));
});

router.post("/:studentId/sabaq", validate(hifzSabaqSchema), async (req, res) => {
  const { sabaq } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const result = await db.run(
    'INSERT INTO hifz_logs ("studentId", date, sabaq) VALUES ($1, $2, $3) RETURNING id',
    [req.params.studentId, date, sabaq || ""]
  );
  const student = await db.get("SELECT name, roll FROM students WHERE id = $1", [req.params.studentId]);
  await recordAudit({
    action: "hifz.sabaq_logged",
    actor: req.user,
    entityType: "student",
    entityId: Number(req.params.studentId),
    label: `Logged sabaq for ${student?.name || "student #" + req.params.studentId} (${date})`,
    details: { date, sabaq },
  });
  res.status(201).json({ id: result.insertId, studentId: Number(req.params.studentId), date, sabaq });
});

router.get("/:studentId/logs", async (req, res) => {
  const logs = await db.all(
    'SELECT * FROM hifz_logs WHERE "studentId" = $1 ORDER BY date DESC LIMIT 30',
    [req.params.studentId]
  );
  res.json(logs);
});

module.exports = router;

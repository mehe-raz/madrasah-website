const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");

const router = express.Router();
router.use(requirePermission("settings"));

function adminOnly(req, res, next) {
  if (req.user?.role === "Super Admin" || req.user?.role === "Admin") return next();
  return res.status(403).json({ error: "Only Admin or Super Admin can review guardian requests" });
}

router.use(adminOnly);

router.get("/pending", async (_req, res) => {
  const accounts = await db.all(
    `SELECT ga.id, ga.name, ga.mobile, ga.email, ga.status, ga."createdAt",
            COALESCE(json_agg(json_build_object(
              'id', s.id, 'name', s.name, 'roll', s.roll, 'class', s.class,
              'matchCount', gs."matchCount"
            ) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS students
       FROM guardian_accounts ga
       LEFT JOIN guardian_students gs ON gs."guardianId" = ga.id
       LEFT JOIN students s ON s.id = gs."studentId"
      WHERE ga.status = 'pending'
      GROUP BY ga.id
      ORDER BY ga."createdAt" ASC, ga.id ASC`
  );

  const childLinks = await db.all(
    `SELECT gs."guardianId", gs."studentId", gs.status, gs."matchCount", gs."createdAt",
            ga.name AS "guardianName", ga.mobile, ga.email,
            s.name AS "studentName", s.roll AS "studentRoll", s.class AS "studentClass"
       FROM guardian_students gs
       JOIN guardian_accounts ga ON ga.id = gs."guardianId"
       JOIN students s ON s.id = gs."studentId"
      WHERE gs.status = 'pending' AND ga.status = 'active'
      ORDER BY gs."createdAt" ASC, gs."guardianId" ASC, gs."studentId" ASC`
  );

  res.json({ accounts, childLinks });
});

router.post("/accounts/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid guardian id" });
  const existing = await db.get("SELECT id, name, status FROM guardian_accounts WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Guardian account not found" });
  if (existing.status !== "pending") return res.status(409).json({ error: "This request has already been reviewed" });

  await db.run("UPDATE guardian_accounts SET status = 'active' WHERE id = $1", [id]);
  await recordAudit({
    action: "guardian.approved",
    actor: req.user,
    entityType: "guardian_account",
    entityId: id,
    label: `Approved guardian account: ${existing.name}`,
  });
  res.json({ ok: true, status: "active" });
});

router.post("/accounts/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid guardian id" });
  const existing = await db.get("SELECT id, name, status FROM guardian_accounts WHERE id = $1", [id]);
  if (!existing) return res.status(404).json({ error: "Guardian account not found" });
  if (existing.status !== "pending") return res.status(409).json({ error: "This request has already been reviewed" });

  await db.run("UPDATE guardian_accounts SET status = 'rejected' WHERE id = $1", [id]);
  await recordAudit({
    action: "guardian.rejected",
    actor: req.user,
    entityType: "guardian_account",
    entityId: id,
    label: `Rejected guardian account: ${existing.name}`,
  });
  res.json({ ok: true, status: "rejected" });
});

router.post("/child-links/:guardianId/:studentId/approve", async (req, res) => {
  const guardianId = Number(req.params.guardianId);
  const studentId = Number(req.params.studentId);
  const link = await db.get(
    `SELECT gs.status, ga.name AS "guardianName", s.name AS "studentName"
       FROM guardian_students gs
       JOIN guardian_accounts ga ON ga.id = gs."guardianId"
       JOIN students s ON s.id = gs."studentId"
      WHERE gs."guardianId" = $1 AND gs."studentId" = $2`,
    [guardianId, studentId]
  );
  if (!link) return res.status(404).json({ error: "Child-link request not found" });
  if (link.status !== "pending") return res.status(409).json({ error: "This request has already been reviewed" });

  await db.run(
    `UPDATE guardian_students
        SET status = 'active', "reviewedAt" = $1, "reviewedBy" = $2
      WHERE "guardianId" = $3 AND "studentId" = $4`,
    [new Date().toISOString(), req.user.id, guardianId, studentId]
  );
  await recordAudit({
    action: "guardian.child_link_approved",
    actor: req.user,
    entityType: "guardian_student",
    entityId: studentId,
    label: `Approved child link: ${link.guardianName} → ${link.studentName}`,
    details: { guardianId, studentId },
  });
  res.json({ ok: true, status: "active" });
});

router.post("/child-links/:guardianId/:studentId/reject", async (req, res) => {
  const guardianId = Number(req.params.guardianId);
  const studentId = Number(req.params.studentId);
  const link = await db.get(
    `SELECT gs.status, ga.name AS "guardianName", s.name AS "studentName"
       FROM guardian_students gs
       JOIN guardian_accounts ga ON ga.id = gs."guardianId"
       JOIN students s ON s.id = gs."studentId"
      WHERE gs."guardianId" = $1 AND gs."studentId" = $2`,
    [guardianId, studentId]
  );
  if (!link) return res.status(404).json({ error: "Child-link request not found" });
  if (link.status !== "pending") return res.status(409).json({ error: "This request has already been reviewed" });

  await db.run(
    `UPDATE guardian_students
        SET status = 'rejected', "reviewedAt" = $1, "reviewedBy" = $2
      WHERE "guardianId" = $3 AND "studentId" = $4`,
    [new Date().toISOString(), req.user.id, guardianId, studentId]
  );
  await recordAudit({
    action: "guardian.child_link_rejected",
    actor: req.user,
    entityType: "guardian_student",
    entityId: studentId,
    label: `Rejected child link: ${link.guardianName} → ${link.studentName}`,
    details: { guardianId, studentId },
  });
  res.json({ ok: true, status: "rejected" });
});

module.exports = router;

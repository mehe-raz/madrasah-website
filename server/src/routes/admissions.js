const express = require("express");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { listAdmissions, updateAdmissionStatus } = require("../lib/admissions");

const router = express.Router();
// Reuses the "website" permission (Admin / Super Admin) — whoever manages
// the public site is who reviews applications coming in from it.
router.use(requirePermission("website"));

router.get("/", async (_req, res) => {
  res.json(await listAdmissions());
});

router.patch("/:id/status", async (req, res) => {
  try {
    const row = await updateAdmissionStatus(Number(req.params.id), req.body?.status);
    await recordAudit({
      action: "admission.status-updated",
      actor: req.user,
      entityType: "admission",
      entityId: row.id,
      label: `Admission for ${row.studentName} → ${row.status}`,
      details: row,
    });
    res.json(row);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Update failed" });
  }
});

module.exports = router;

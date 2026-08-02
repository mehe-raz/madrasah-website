const express = require("express");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { getClassOptions, saveClassOptions } = require("../lib/classOptions");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in
// index.js. Readable by anyone who can reach the admission form (students)
// as well as Settings, since the dropdown in Students.tsx needs this list;
// only Super Admin may write to it (checked per-route below), matching the
// pattern in routes/backup.js.
router.use(requirePermission(["students", "settings"]));

router.get("/", async (_req, res) => {
  res.json(await getClassOptions());
});

router.put("/", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can edit the class/jamaat list" });
  }
  const before = await getClassOptions();
  const options = await saveClassOptions(req.body?.options);
  if (JSON.stringify(before) !== JSON.stringify(options)) {
    await recordAudit({
      action: "classOptions.updated",
      actor: req.user,
      entityType: "settings",
      entityId: 0,
      label: `Updated class/jamaat list (${options.length} entries)`,
      details: { options },
    });
  }
  res.json(options);
});

module.exports = router;

// ============================================================================
// routes/classTree.js — Class/Jamaat Hierarchy (Part 1 / 2)
// ============================================================================
// Mirrors routes/classOptions.js exactly (same permission model, same
// Super-Admin-only write gate, same audit-log pattern) but serves the new
// hierarchical tree from lib/classTree.js instead of the flat list. Both
// routers stay mounted side by side during the Part 2 frontend rollout so
// nothing that already reads /api/class-options breaks.
// ============================================================================

const express = require("express");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { getClassTree, saveClassTree } = require("../lib/classTree");

const router = express.Router();
// Same reasoning as classOptions.js: readable by anyone who can reach the
// admission form or Settings (students permission covers the former, since
// the same staff who can add students need the cascading dropdown data);
// only Super Admin may write, checked per-route below.
router.use(requirePermission(["students", "settings"]));

router.get("/", async (_req, res) => {
  res.json(await getClassTree());
});

router.put("/", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "শুধুমাত্র সুপার এডমিন ক্লাস/জামাত তালিকা সম্পাদনা করতে পারবেন" });
  }
  const before = await getClassTree();
  const tree = await saveClassTree(req.body?.tree);
  if (JSON.stringify(before) !== JSON.stringify(tree)) {
    await recordAudit({
      action: "classTree.updated",
      actor: req.user,
      entityType: "settings",
      entityId: 0,
      label: `Updated class/jamaat hierarchy`,
      details: { tree },
    });
  }
  res.json(tree);
});

module.exports = router;

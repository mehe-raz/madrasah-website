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
const db = require("../db");
const {
  SETTINGS_KEY,
  getClassTree,
  saveClassTree,
  editClassTreeNode,
  migrateLiveClassReferences,
  ClassTreeEditError,
} = require("../lib/classTree");

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

// Renames one node's বাংলা label / ইংরেজি data-slug in place — unlike PUT /
// above (which replaces the whole tree, used by the add/delete UI), this
// only touches the single node at `path` and, when it's a leaf whose `en`
// actually changed, cascades that rename to every live table that stores
// the same slug (students.class, teacher-class-assignments, class posts,
// guardian reminders) in one transaction so nothing gets left pointing at
// the old value. See lib/classTree.js's migrateLiveClassReferences for
// exactly which tables move and which (results/admissions snapshots)
// deliberately don't.
router.put("/node", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "শুধুমাত্র সুপার এডমিন ক্লাস/জামাত তালিকা সম্পাদনা করতে পারবেন" });
  }
  const { path, bn, en } = req.body || {};
  try {
    const before = await getClassTree();
    const { tree: nextTree, oldEn, newEn, enChanged, wasLeaf } = editClassTreeNode(before, path, { bn, en });

    let migratedCount = 0;
    let tree;
    if (enChanged && wasLeaf) {
      tree = await db.withTransaction(async (tx) => {
        migratedCount = await migrateLiveClassReferences(tx, oldEn, newEn);
        await tx.run(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [SETTINGS_KEY, JSON.stringify(nextTree)]
        );
        return nextTree;
      });
    } else {
      tree = await saveClassTree(nextTree);
    }

    await recordAudit({
      action: "classTree.nodeRenamed",
      actor: req.user,
      entityType: "settings",
      entityId: 0,
      label: enChanged
        ? `Renamed class/jamaat entry: ${oldEn} → ${newEn} (${bn})`
        : `Renamed class/jamaat entry label to ${bn}`,
      details: { path, oldEn, newEn, enChanged, wasLeaf, migratedCount },
    });

    res.json({ tree, migratedCount, enChanged });
  } catch (err) {
    if (err instanceof ClassTreeEditError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "DUPLICATE_EN" ? 409 : 400;
      return res.status(status).json({ error: err.message });
    }
    throw err;
  }
});

module.exports = router;

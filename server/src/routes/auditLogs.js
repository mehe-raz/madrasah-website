const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
router.use(requirePermission("settings"));

router.get("/", async (req, res) => {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can view audit logs" });
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const rows = await db.all(
    `SELECT id, "action", "actorId", "actorName", "actorRole", "entityType", "entityId", label, details, "createdAt"
     FROM audit_logs
     ORDER BY "createdAt" DESC, id DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

module.exports = router;

const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");

const router = express.Router();
router.use(requirePermission("settings"));
// Phase 6: audit log visibility is a Pro+ plan feature.
router.use(requirePlanFeature("auditLogs"));

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "Super Admin") {
    return res.status(403).json({ error: "Only Super Admin can view audit logs" });
  }
  next();
}
router.use(requireSuperAdmin);

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Distinct action/entityType values so the client can populate filter
// dropdowns without shipping a hardcoded list that drifts from reality.
router.get("/meta", async (_req, res) => {
  const [actions, entityTypes] = await Promise.all([
    db.all(`SELECT DISTINCT "action" FROM audit_logs ORDER BY "action"`),
    db.all(`SELECT DISTINCT "entityType" FROM audit_logs WHERE "entityType" != '' ORDER BY "entityType"`),
  ]);
  res.json({
    actions: actions.map((r) => r.action),
    entityTypes: entityTypes.map((r) => r.entityType),
  });
});

router.get("/", async (req, res) => {
  const { action, entityType, actorId, from, to, search } = req.query;
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const page = clampInt(req.query.page, 1, 1, 100000);

  const conditions = [];
  const params = [];

  if (action) {
    params.push(action);
    conditions.push(`"action" = $${params.length}`);
  }
  if (entityType) {
    params.push(entityType);
    conditions.push(`"entityType" = $${params.length}`);
  }
  if (actorId) {
    params.push(Number(actorId));
    conditions.push(`"actorId" = $${params.length}`);
  }
  if (from) {
    params.push(`${from} 00:00:00`);
    conditions.push(`"createdAt" >= $${params.length}`);
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    conditions.push(`"createdAt" <= $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).toLowerCase()}%`);
    const idx = params.length;
    conditions.push(
      `(LOWER("actorName") LIKE $${idx} OR LOWER(label) LIKE $${idx} OR LOWER("action") LIKE $${idx} OR LOWER(details) LIKE $${idx})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await db.get(`SELECT COUNT(*)::int AS total FROM audit_logs ${where}`, params);
  const total = totalRow?.total || 0;
  const offset = (page - 1) * limit;

  const rows = await db.all(
    `SELECT id, "action", "actorId", "actorName", "actorRole", "entityType", "entityId", label, details, "createdAt"
     FROM audit_logs
     ${where}
     ORDER BY "createdAt" DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    items: rows,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

module.exports = router;

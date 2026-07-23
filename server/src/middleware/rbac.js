// Roles & permissions now live in one place: server/src/config/roles.js
// (client/src/lib/roles.generated.ts is generated FROM that file — see
// scripts/sync-roles.js). Do not redefine these tables here.
const { ROLE_PERMISSIONS, ROUTE_PERMISSION } = require("../config/roles");

function canAccess(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Login required" });
    if (canAccess(req.user.role, permission)) return next();
    return res.status(403).json({ error: "Access denied" });
  };
}

function rbacMiddleware(req, res, next) {
  if (!req.user) return next();
  // NOTE: this middleware is mounted with `app.use("/api", ...)`, so
  // req.baseUrl is always "/api" here — it can NEVER be used to recover
  // which sub-route ("/api/students", "/api/income", ...) is being hit.
  // We must read the real path from req.path (relative to "/api") instead.
  // (Previously `req.baseUrl || ...` always short-circuited to "/api",
  // meaning this permission check silently never matched anything and
  // every authenticated role could reach every route below.)
  const segment = req.path.split("/").filter(Boolean)[0];
  const base = segment ? `/api/${segment}` : "/api";
  const perm = ROUTE_PERMISSION[base];
  if (!perm) return next();
  if (canAccess(req.user.role, perm)) return next();
  return res.status(403).json({ error: "Access denied" });
}

module.exports = { canAccess, requirePermission, rbacMiddleware, ROLE_PERMISSIONS };

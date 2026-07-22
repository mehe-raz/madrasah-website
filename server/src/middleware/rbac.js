const ROLE_PERMISSIONS = {
  "Super Admin": ["*"],
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings", "website"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["attendance", "hifz"],
  "Hostel Manager": ["dashboard", "students", "attendance"],
};

const ROUTE_PERMISSION = {
  "/api/dashboard": "dashboard",
  "/api/delete-requests": "dashboard",
  "/api/students": "students",
  "/api/attendance": "attendance",
  "/api/payments": "income",
  "/api/income": "income",
  "/api/expenses": "expenses",
  "/api/hifz": "hifz",
  "/api/settings": "settings",
  "/api/users": "settings",
  "/api/backup": "settings",
  "/api/reports": "reports",
  "/api/audit-logs": "settings",
  "/api/site-content": "website",
  "/api/admissions": "website",
};

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

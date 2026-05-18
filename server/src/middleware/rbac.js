const ROLE_PERMISSIONS = {
  "Super Admin": ["*"],
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["dashboard", "students", "attendance", "hifz"],
  "Hostel Manager": ["dashboard", "students", "attendance"],
};

const ROUTE_PERMISSION = {
  "/api/dashboard": "dashboard",
  "/api/students": "students",
  "/api/attendance": "attendance",
  "/api/payments": "income",
  "/api/income": "income",
  "/api/expenses": "expenses",
  "/api/hifz": "hifz",
  "/api/settings": "settings",
  "/api/users": "settings",
  "/api/backup": "settings",
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
  const base = req.baseUrl || req.path.split("/").slice(0, 3).join("/");
  const perm = ROUTE_PERMISSION[base];
  if (!perm) return next();
  if (canAccess(req.user.role, perm)) return next();
  return res.status(403).json({ error: "Access denied" });
}

module.exports = { canAccess, requirePermission, rbacMiddleware, ROLE_PERMISSIONS };

// server/src/config/roles.js
//
// SINGLE SOURCE OF TRUTH for roles & permissions.
// - Server (rbac.js) requires this file directly.
// - Client (client/src/lib/roles.generated.ts) is auto-generated FROM this
//   file by `scripts/sync-roles.js` — never hand-edit the generated file.
//
// To add/change a role or permission: edit ONLY this file, then run
// `npm run check` (it runs the sync automatically).

const ROLE_PERMISSIONS = {
  "Super Admin": ["*"],
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings", "website", "results"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["attendance", "hifz", "results"],
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
  "/api/results": "results",
  "/api/settings": "settings",
  "/api/users": "settings",
  "/api/backup": "settings",
  "/api/reports": "reports",
  "/api/audit-logs": "settings",
  "/api/site-content": "website",
  "/api/admissions": "website",
};

module.exports = { ROLE_PERMISSIONS, ROUTE_PERMISSION };

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
  // "websiteGallery" and "websiteNotices" are finer-grained slices of
  // "website", added so a future limited role (e.g. a volunteer who only
  // manages gallery photos) can be granted just that slice without full
  // website-content access. Admin keeps all three today — this is additive,
  // not a behavior change for any existing role.
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings", "website", "websiteGallery", "websiteNotices", "results"],
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
  // Array = "any one of these is enough to reach the route" — site-content
  // bundles hero/about/admission/gallery/notices into one JSON blob (see
  // lib/siteContent.js), so someone with only "websiteGallery" or
  // "websiteNotices" still needs to reach GET/PUT here; the route itself
  // (routes/siteContent.js) then restricts *which* fields they're allowed
  // to actually change.
  "/api/site-content": ["website", "websiteGallery", "websiteNotices"],
  "/api/admissions": "website",
  // Class/jamaat master list: read by the admission form (students) and
  // managed by Super Admin from the Settings screen (settings). The route
  // itself (routes/classOptions.js) further restricts writes to Super Admin
  // only, same defense-in-depth pattern as /api/backup above.
  "/api/class-options": ["students", "settings"],
};

module.exports = { ROLE_PERMISSIONS, ROUTE_PERMISSION };

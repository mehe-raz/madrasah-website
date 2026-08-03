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
  // "assignments" (Step 4) gates routes/assignments.js — the class-broadcast
  // notice/assignment/message feed. Admin can post/manage for any class;
  // Teacher can too, but scoped to their teacher_class_assignments rows via
  // lib/teacherScope.js (same row-level layer as "attendance"/"results").
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings", "website", "websiteGallery", "websiteNotices", "results", "assignments"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["attendance", "hifz", "results", "assignments"],
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
  "/api/assignments": "assignments",
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
  // Settings-adjacent account management (Step 2, Part 2) — same
  // permission as /api/users, since approving a guardian signup or a
  // second-child link is a user-account decision, not day-to-day student
  // data. requirePermission("settings") in routes/guardianApprovals.js is
  // the actual enforcement; this entry just keeps rbacMiddleware's table
  // complete/consistent with every other admin route above.
  "/api/guardian-approvals": "settings",
};

module.exports = { ROLE_PERMISSIONS, ROUTE_PERMISSION };

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
  // "SMS সেবা" settings page (Phase 8D) — wallet balance/history, per-type
  // toggle, manual top-up requests. Same tier as /api/backup above; the
  // route itself additionally gates on the "sms" plan feature.
  "/api/sms": "settings",
  // bKash self-connect settings (Phase 8E) — institution submits its own
  // agent/merchant credentials. Same tier as /api/sms above; the route
  // itself additionally gates on the "bkash" plan feature.
  "/api/payment-gateway": "settings",
  // Institution self-service platform-subscription billing (ad-hoc,
  // docs/CURRENT_TASK.md) — same "settings" tier as /api/payment-gateway
  // just above, but the reverse money direction (institution -> platform,
  // via routes/institutionBilling.js). Only meaningful in multi-tenant
  // mode; the route itself 404s cleanly on single-tenant deployments.
  "/api/institution-billing": "settings",
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
  // Guardian Reminder Messenger (ad-hoc, docs/CURRENT_TASK.md) — admin-side
  // compose/list/dispatch screen. Same "settings" tier as /api/sms and
  // /api/payment-gateway above: an admin-configuration screen, not
  // day-to-day student data, so Teacher/Accountant/Hostel Manager stay
  // excluded without touching ROLE_PERMISSIONS. The guardian-facing read
  // side (message list, unread count, mark-read) lives under
  // /api/guardian-auth instead — see routes/guardianAuth.js.
  "/api/guardian-reminders": "settings",
};

module.exports = { ROLE_PERMISSIONS, ROUTE_PERMISSION };

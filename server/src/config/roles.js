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
  // docs/STAFF_ATTENDANCE_PLAN.md, Phase 4 — staff registry + staff
  // attendance. Kept as two separate keys (not folded into "settings")
  // so a future narrower role could get one without the other; today
  // only Admin/Super Admin hold either (plan doc §6, open question 1
  // defaulted to no Hostel Manager access for staffAttendance).
  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 5 — shift/schedule master data
  // (routes/shifts.js) and class->shift assignment (routes/classShifts.js)
  // share this one key; staff.shiftId itself is edited through the
  // existing "staff" permission (routes/staff.js's PATCH), not this one.
  // Plan §6 open question 2 defaulted to Admin/Super Admin only.
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings", "website", "websiteGallery", "websiteNotices", "results", "assignments", "staff", "staffAttendance", "shifts"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["attendance", "hifz", "results", "assignments"],
  "Hostel Manager": ["dashboard", "students", "attendance"],
};

const ROUTE_PERMISSION = {
  "/api/dashboard": "dashboard",
  "/api/delete-requests": "dashboard",
  "/api/students": "students",
  "/api/attendance": "attendance",
  // Admin device management (docs/ATTENDANCE_DEVICE_PLAN.md Phase 2) — same
  // "attendance" tier, since it's the same Admin/Hostel Manager/Teacher
  // audience that already handles daily attendance. The device's own
  // punch/latest-punch endpoints (/api/device/*) are unauthenticated by
  // design (see routes/deviceAttendance.js) and never reach this map.
  "/api/attendance-devices": "attendance",
  "/api/payments": "income",
  "/api/income": "income",
  "/api/expenses": "expenses",
  "/api/hifz": "hifz",
  "/api/results": "results",
  "/api/assignments": "assignments",
  "/api/settings": "settings",
  // docs/STAFF_ATTENDANCE_PLAN.md, Phase 4 — staff registry (name/phone/
  // designation/joining date, optionally linked to a users login) and its
  // separate daily attendance. Two distinct permission keys — see the
  // ROLE_PERMISSIONS comment above for why they aren't folded into
  // "settings" or merged with each other.
  "/api/staff": "staff",
  "/api/staff-attendance": "staffAttendance",
  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 5 — shift master data + class->shift
  // assignment, same "shifts" key for both (see ROLE_PERMISSIONS comment
  // above for why they aren't folded into "settings").
  "/api/shifts": "shifts",
  "/api/class-shifts": "shifts",
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
  // Own-phone/SIM bulk SMS gateway connect settings
  // (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 2) — same "settings" tier
  // as /api/payment-gateway above; the route itself additionally gates on
  // the existing "sms" plan feature (reused, not a new feature key — this
  // is a second SMS-sending path, completely separate from /api/sms's
  // paid-reseller wallet system).
  "/api/own-sms-gateway": "settings",
  // Own-SIM bulk SMS contact list (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md
  // Phase 3) — same "settings" tier as /api/own-sms-gateway above. The
  // broadcast-send endpoint stays under /api/sms (already listed above),
  // not a separate entry.
  "/api/sms-contacts": "settings",
};

module.exports = { ROLE_PERMISSIONS, ROUTE_PERMISSION };

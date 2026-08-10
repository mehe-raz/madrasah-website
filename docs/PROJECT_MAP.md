# PROJECT_MAP.md — full project picture for a new AI agent

Read this **after** `AGENTS.md` (rules) and **before** touching any code.
`AGENTS.md` tells you *how* to work in this repo; this file tells you *what
exists in it* — so you don't have to open every folder to find out.

If something you need isn't described here, that itself is useful
information (see "Known gaps" at the end) — say so instead of guessing.

---

## 1. What this project is

A multi-tenant Madrasah ERP + public website, one deployment serving many
madrasahs (tenants). Each tenant gets:
- a public marketing website (About, Admission, Gallery, Notices, Result
  Lookup, Classes/Courses)
- an admin ERP (students, attendance, fees/income, expenses, Hifz tracking,
  results, reports, audit logs, website content editor)
- a Guardian Portal (parents log in separately, see their child's
  attendance/results/notices), with browser/phone push notifications
  (Web Push + VAPID, opt-in per guardian) layered on top of the existing
  polling messenger bubble — see `docs/PUSH_NOTIFICATION_PLAN.md` (all 7
  phases done: reminders, class posts/notices, and result-publish all
  call `server/src/lib/guardianPush.js`'s `notifyGuardians()`)
- a platform/super-admin layer above all tenants (see §5)

Stack: **React + Vite + TypeScript** (client), **Express + PostgreSQL**
(server), deployed via Vercel (client) + Render-style Node host (server,
per `CLIENT_ORIGIN`/`connect-src` in `vercel.json`) + Cloudflare Worker for
tenant routing.

---

## 2. Repo layout — top level

```
├── client/           ← the actual React app (see §3)
├── server/           ← Express API + Postgres (see §4)
├── src/               ⚠ SEE "Known gaps" — likely dead/orphaned, not the client
├── scripts/          ← root-level maintenance scripts (role sync, checks)
├── cloudflare-worker/← tenant-routing worker (subdomain → tenant resolution)
├── docs/              ← all project documentation (this file lives here)
├── AGENTS.md          ← rules for AI agents (read first, always)
├── package.json        ← root: `npm run check`, `npm run dev` orchestration
├── Dockerfile, cloudbuild.yaml, vercel.json ← deployment
```

**Three separate `npm install` locations**: root, `client/`, `server/` —
each has its own `package.json`/`package-lock.json`. This is intentional
(matches the delivery workflow's 3-way install step), not a mistake.

---

## 3. `client/` — the ERP + public website (React/Vite/TS)

```
client/src/
├── pages/          ← public-facing routes (no login): Home, About,
│                     Admission, AdmissionApply, ClassesCourses, Gallery,
│                     Notices, ResultLookup, Login, ResetPassword
├── pages/guardian/ ← Guardian Portal pages: GuardianLogin, GuardianDashboard,
│                     GuardianAttendance, GuardianResults, GuardianFeed
├── modules/        ← admin ERP screens (behind login + RBAC):
│                     Dashboard, Students, Attendance, Income, Expenses,
│                     HifzTracking, Results, Reports, Settings, Website,
│                     WebsiteSectionEditor, AdmissionsReview, AuditLogs
├── components/     ← shared UI: Sidebar, Topbar, Layout, PublicHeader/Footer,
│                     NotificationBell, ReceiptModal, StudentPicker, etc.
├── components/ui/  ← design-system primitives (Button, Input, Select,
│                     Textarea, Field, Card, ReadonlyValue) — see
│                     "Design System (mandatory)" in AGENTS.md
├── context/        ← AuthContext, GuardianAuthContext, AppSettingsContext,
│                     PublicSiteContext (global state, not per-module)
├── lib/            ← api.ts (all HTTP calls), permissions.ts, roles.generated.ts
│                     (DO NOT hand-edit — see AGENTS.md rule 3), offline*
│                     (offlineDb/offlineCache/offlineSync — PWA offline
│                     support), imageCompress.ts, cloudinaryImage.ts,
│                     exportReports.ts, printReport.ts, icons.ts (central
│                     `Icons` map — lucide-react component per semantic
│                     key, e.g. `Icons.dashboard`, `Icons.lock`; ALL UI
│                     icons in the React app go through this file, never
│                     a raw emoji string. Admin-editable content icons,
│                     e.g. a class's own `c.icon` from the Website
│                     module, are content and intentionally NOT part of
│                     this map. The two plain-JS server panels
│                     (`server/public-platform/app.js`,
│                     `server/public-marketing/app.js`) can't import this
│                     — they keep their own small inline-SVG `ICONS`
│                     helper at the top of each file instead, same
│                     outline visual style)
├── i18n/           ← bn.ts / en.ts — full Bengali + English translation
│                     tables (this app is bilingual, Bengali-first)
├── theme/          ← colors.ts
├── types/          ← index.ts — shared TS types/interfaces
└── App.tsx         ← route table (all pages/modules wired here via lazy())
```

Routing pattern: everything under `modules/` and most of `pages/guardian/`
is lazy-loaded (`lazy()` in `App.tsx`) and route-protected via
`ProtectedRoute.tsx` / `GuardianProtectedRoute.tsx`.

---

## 4. `server/` — Express API + Postgres

```
server/src/
├── index.js         ← app entry: middleware chain, security headers
│                       (Helmet/CSP), rate limiters, and the full list of
│                       mounted /api/* routers (this is the fastest way to
│                       see "does an endpoint for X exist")
├── routes/          ← one file per resource: students, attendance, payments,
│                       income, expenses, hifz, results, assignments,
│                       settings, users, dashboard, reports, auditLogs,
│                       backup, uploads, siteContent, admissions,
│                       notifications, guardianAuth, guardianApprovals,
│                       publicSignup, platform, classOptions, classTree,
│                       deleteRequests
├── middleware/      ← auth.js (JWT), rbac.js (permission gate),
│                       csrf.js, tenantResolve.js (multi-tenant routing),
│                       platformAuth.js (super-admin layer), idempotency.js,
│                       validate.js (Zod wrapper)
├── lib/             ← business logic + shared helpers: auditLog.js,
│                       googleDrive.js (backup storage), backupEncryption.js,
│                       cloudinary.js, mailer.js (Resend), notifications.js,
│                       *Schemas.js (Zod validation, one file per domain),
│                       classTree.js, teacherScope.js (row-level scoping
│                       for teachers), results.js, siteContent.js, seoMeta.js
├── config/          ← roles.js (RBAC single source of truth — see AGENTS.md
│                       rule 3), planFeatures.js (plan-gated features, e.g.
│                       customDomain on "pro" plan only)
├── models/          ← studentAdmission.js
├── sql/             ← registry_schema.sql (platform/tenant registry DB),
│                       supabase_schema.sql (per-tenant schema)
├── scripts/         ← registry-cli.js, migrate-original-to-tenant.js,
│                       migrate-images-to-cloudinary.js, seed-class-tree.sql
├── registryDb.js, tenantContext.js, tenantProvision.js, migrateTenants.js
│                    ← multi-tenant provisioning/lookup layer
├── billing.js        ← plan/billing logic
└── seed.js            ← dev data seeding
```

**Route → permission mapping** lives in `server/src/config/roles.js`
(`ROUTE_PERMISSION`) — check there first if asking "who can call this
endpoint."

**Integrations in use** (see `.env.example` for the full var list):
Cloudinary (images), Google Drive OAuth (encrypted backup storage), Resend
(transactional email), Postgres (`DATABASE_URL`).

---

## 5. Multi-tenancy & platform layer

- `server/src/middleware/tenantResolve.js` + `cloudflare-worker/tenant-router.js`
  resolve which tenant a request belongs to (subdomain-based).
- `server/src/registryDb.js` / `sql/registry_schema.sql` — the
  platform-level registry of all tenants (separate from each tenant's own
  data schema, `sql/supabase_schema.sql`).
- `routes/platform.js` + `middleware/platformAuth.js` — super-admin-only
  endpoints that operate across tenants (not reachable by a normal
  Admin/Teacher/etc. role).
- Full design rationale: `docs/MULTI_TENANT_PLAN.md` (large — read only the
  section relevant to your task, don't load it wholesale).

---

## 6. RBAC (roles & permissions)

Roles today (from `server/src/config/roles.js`): **Super Admin**, **Admin**,
**Accountant**, **Teacher**, **Hostel Manager** — plus **Guardian** as a
wholly separate auth system (`guardianAuth.js`/`GuardianAuthContext`, not
part of the staff role table above).

Permission gate: `requirePermission()` in `middleware/rbac.js`, driven by
`ROLE_PERMISSIONS` in `config/roles.js`. Client mirror is
`client/src/lib/roles.generated.ts` (auto-generated, never hand-edit).

---

## 7. Design system

Documented in AGENTS.md ("Design System (mandatory)" section) — don't
duplicate that here. Migration backlog/status: `docs/DESIGN_SYSTEM_MIGRATION.md`.

---

## 8. Offline support

`client/src/lib/offlineDb.ts` / `offlineCache.ts` / `offlineSync.ts` +
`client/public/sw.js` (service worker) — PWA-style offline-first behavior.
Testing procedure: `docs/OFFLINE_FIRST_TESTING.md`.

---

## 9. Other docs (read on demand, not by default)

- `docs/DEPLOYMENT_CHECKLIST.md` — pre-deploy steps
- `docs/SUPABASE_CLOUDINARY_SETUP.md` — third-party service setup
- `docs/DEVELOPER_GUIDE (1).md` — manual smoke-test steps (login, student
  create, attendance, backup) referenced from AGENTS.md
- `docs/BUSINESS_READINESS_ROADMAP.md` — 8-phase plan (data-integrity fix,
  email notifications, notice-broadcast UI, legal pages, test coverage,
  plan-tiering, multi-branch, SMS/bKash architecture notes) from a
  2026-08-05 business-readiness review. Phase 8's SMS sub-phases (8A-8D)
  are done — wallet/ledger schema, `smsSender.js` + BulkSMSBD provider,
  the guardian-facing notification hook, and the "SMS সেবা" settings page
  with manual bKash top-up. bKash/Nagad *guardian-facing payment* (8E/8F)
  and sandbox testing (8G) are still explicitly blocked until the user
  says their provider accounts are ready — don't start those on your own
  initiative.
- `docs/PUSH_NOTIFICATION_PLAN.md` — 7-phase Guardian Push Notification
  architecture (Web Push + VAPID). All 7 phases complete as of 2026-08-08:
  schema (Phase 1), `notifyGuardians()` in `server/src/lib/guardianPush.js`
  + subscribe infra (Phase 2-3), reminder dispatch hook (Phase 4), class
  post/notice hook (Phase 5), result-publish hook (Phase 6, optional —
  done), manual test checklist (Phase 7). Any already-provisioned tenant
  still needs the one-time manual `guardian_push_subscriptions` table SQL
  via the Super-Admin "run SQL on all tenants" tool — see
  `docs/CURRENT_TASK.md`'s (now archived) entry for the exact statement.
- `docs/CURRENT_TASK.md` — **multi-part task handoff queue**. Always check
  this one regardless of task (see AGENTS.md pointer at the top of that file).
- `docs/CALL_LIST_PLAN.md` — 3-phase plan for a new "call list" view under
  Reports (student list / due list): full-page in-app list with a green
  `tel:` call button per row and a per-month called/not-called mark, backed
  by the new `student_call_log` table. **Phase 1 (backend: table + the
  3 `/api/students/call-log` endpoints) is done — see
  `docs/CURRENT_TASK.md` for the exact detail.** Phase 2 (frontend) and
  Phase 3 (polish) have not started — wait for the user to explicitly say
  to start the next phase before touching them.

---

## 10. Known gaps / things a new agent should NOT assume

- **Root-level `src/` folder** (`src/pages/Home.tsx`, `src/components/Reveal.tsx`,
  etc.) has no matching `vite.config.*` or build script at root and appears
  to be leftover from an earlier scaffold, separate from the real client at
  `client/src/`. **Don't assume it's live or wire new work into it** — if a
  task seems to require touching it, flag this ambiguity to the user first
  instead of guessing which one is "real."
- **No automated test suite beyond `npm run check`'s syntax/type/build gate**
  and the standalone `npm run test:backup` (needs a throwaway DB, not run by
  default). There is no unit/integration test coverage for business logic
  (fees calculation, attendance edge cases, RBAC edge cases, etc.) beyond
  what's in `server/src/lib/__tests__/` and `server/src/routes/__tests__/`
  — check those two folders for what *is* covered before assuming a
  behavior is untested.
- **No CI pipeline** — `npm run check` run locally by whichever agent is
  working is the only gate (see AGENTS.md).
- **No formal changelog file** — task history lives in git commit messages
  + `docs/CURRENT_TASK.md`, not a maintained `CHANGELOG.md`.
- **No architecture-decision log** (a `DECISIONS.md`) exists yet — if a
  non-obvious technical choice is made during a task, consider proposing one
  rather than letting the reasoning live only in a commit message.

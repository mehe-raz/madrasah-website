# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: DONE

## Task: (none — Phase 1, Phase 3, Phase 4, Phase 5, and Phase 6 (scaffolding
only) of BUSINESS_READINESS_ROADMAP.md complete; Phase 2 intentionally
skipped for now on the user's decision — see
`docs/BUSINESS_READINESS_ROADMAP.md` for Phase 7 onward)

### সম্পন্ন
(cleared — see git history for Phase 1's, Phase 3's, Phase 4's, and Phase
6's diffs)

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
(none queued — next agent should read `docs/BUSINESS_READINESS_ROADMAP.md`
and ask the user which phase to start, per that file's "কীভাবে ব্যবহার
করবেন" section. Note: Phase 2 (email notifications) was deliberately
skipped, not forgotten — the user's Resend free tier only allows 100
emails, so they chose to come back to it later. Don't auto-start Phase 2
without the user explicitly asking.)

### নোট
Phase 6 (plan-tiering, **scaffolding only**) finished 2026-08-05:
- User decided the tier structure: `basic` / `standard` / `pro` / `premium`,
  mapped to what's actually built in this repo (Basic = student/attendance/
  results/notices/guardian portal; Standard = + fees collection/expenses/
  reports/Hifz tracking/assignments; Pro = + custom domain, unchanged from
  before; Premium = payroll/library/ID cards/hostel/SMS/bKash, none of
  which exist in code yet — "Coming Soon" marketing only).
- **Deliberately did NOT turn this into a real paywall yet.** Before today,
  every tenant regardless of `plan` already had unrestricted access to fees
  collection, Hifz tracking, reports, assignments, and audit logs — locking
  those behind `standard`/`pro` now would silently cut off any tenant
  currently on `plan = "basic"` in the database. So `server/src/config/
  planFeatures.js` now has 4 tier objects, but the already-in-use features
  are `true` on all 4, and the not-yet-built Premium features are `false`
  on all 4 (placeholder keys only, not gates on working code).
  `customDomain` is untouched (still pro+ only, same as before).
- **Still open — needs the user's explicit decision before coding further:**
  (1) pricing per tier (not decided), (2) which of the already-built
  features (if any) actually move behind a real paywall, and if so what
  happens to existing tenants already on a lower plan (a migration/
  grandfathering decision, not a code decision), (3) whether "Coming Soon"
  Premium features get a marketing page now or wait until built.
- No client-side UI changes this round — no new lock/unlock screens, no
  pricing page changes. Only `server/src/config/planFeatures.js` touched.

Phase 5 (core business-logic test coverage) finished 2026-08-05:
- **Part 1 — payments/fees logic:** `payments.js`'s inline due/conflict/
  status math (the `isConflict` block the roadmap flagged as risky) was
  extracted, unchanged in behavior, into new `server/src/lib/paymentLogic.js`
  (`isPaymentConflict`, `computeDueAfterPayment`, `computePaymentOutcome`) —
  the same pure-function-in-lib pattern `results.js` already uses for
  `sanitizeSubjects`/`computeGrade`. This was necessary (not a drive-by
  refactor) because the logic can't be meaningfully unit tested while stuck
  inside a route handler wrapped in `db.withTransaction`. Both call sites in
  `payments.js` (`POST /` and `POST /:id/resolve-flag`'s confirm branch,
  which duplicated the same due/status math) now call the shared helpers.
  New tests: `server/src/lib/__tests__/paymentLogic.test.js` — conflict
  detection (zero/negative/missing due), Partial vs Completed status,
  overpayment clamping to 0 due, and string-vs-number input coercion (values
  read back from Postgres often arrive as strings).
- **Part 2 — `teacherScope.js` expansion:** added multi-class-teacher and
  no-class-teacher edge cases to the existing
  `server/src/lib/__tests__/teacherScope.test.js` — asserts a Teacher with
  nothing assigned gets a defined-but-empty array (not `undefined`, which
  `routes/attendance.js`/`results.js`/`assignments.js` all depend on to
  distinguish "scoped to nothing" from "unscoped"), a multi-class Teacher
  gets the full list, and the lookup uses the request's own `user.id`.
- **Part 3 — RBAC permission matrix:** new
  `server/src/middleware/__tests__/rbac.test.js` (+ sibling `package.json`
  with `"type": "module"`, matching the other `__tests__` folders per
  `teacherScope.test.js`'s comment on why that's needed) — a hand-written
  per-route "which roles are allowed" table checked against every route in
  `ROUTE_PERMISSION` (fails loudly if a route is added without updating the
  table), full `canAccess()` coverage for all 5 roles × 18 routes, plus
  `requirePermission()` (401/403/pass, array-of-alternatives) and
  `rbacMiddleware()` (path-segment parsing, ungated routes, nested
  sub-paths) behavior tests.
- **`npm run check` NOT run by this agent** (no network/node_modules in this
  sandbox, same limitation noted for Phases 1/3/4). Instead: `node --check`
  on every new/modified file (including the new ESM test files, which
  correctly picked up the nested `package.json`'s `"type": "module"`), plus
  every assertion in all three new/expanded test files was independently
  re-run as a plain Node script against the real `paymentLogic.js`/`rbac.js`
  modules (not vitest, since that's unavailable offline) — all passed.
  **Run `npm run check` (which runs `test:server` + the real `vitest`
  suite via `test:unit`) as part of this delivery's CMD before trusting
  it** — this is exactly what the packaged CMD does.

Phase 4 (Terms of Service + Privacy Policy) finished 2026-08-05:
- New public (logged-out) pages in the tenant React client, matching the
  `About.tsx`/`Notices.tsx` public-page pattern (`PublicHeader`/
  `PublicFooter`/`PublicPageSkeleton`, `usePublicSite`, `useSeoMeta`) but
  **not** copying their inline-`style={{}}` approach: `About.tsx` etc. are
  on the legacy exemption list in `client/eslint.config.js`, these two new
  files are not, so per AGENTS.md's Design System rule they had to be
  clean from the start —
  `client/src/pages/TermsOfService.tsx` (route `/terms`) and
  `client/src/pages/PrivacyPolicy.tsx` (route `/privacy`).
- New CSS added to `client/src/index.css`: `.legal-page__*` (badge/heading/
  updated-date/notice) and `.legal-content*` (card + typography for the
  section list), plus `.public-footer__legal` for the new footer link row.
  Reused existing generic classes (`app-shell`, `page-shell`,
  `section-shell`, `soft-panel(-strong)`, `pill`, `section-heading`,
  `alert alert--amber`) rather than inventing near-duplicates.
- Both pages open with an amber "এটি একটি খসড়া নথি..." notice — per the
  roadmap's Phase 4 point 4, the content is a structural starting point,
  not lawyer-reviewed final language. Flagging this to the user explicitly
  here too: **have an actual lawyer review the wording before relying on
  it with real customers.**
- `client/src/App.tsx`: lazy-imported both pages, added the `/terms` and
  `/privacy` public routes (outside `ProtectedRoute`, alongside
  `/about`/`/notices`/etc.).
- `client/src/components/PublicFooter.tsx`: added a legal-links row
  (Terms/Privacy) below the copyright line. This file is on the legacy
  exemption list too, but per AGENTS.md "Migration status" (touched parts
  of a legacy file should use the design system, not add more inline
  styles next to the old ones) the new row uses the new
  `.public-footer__legal` class, not `style={{}}`.
- `server/src/lib/seoMeta.js`: added `/terms` and `/privacy` to
  `PUBLIC_ROUTES` (title/description) so crawlers/link-previews get real
  meta tags instead of falling into the generic noindex default, and so
  the two paths are picked up automatically by the existing
  `/sitemap.xml` route (`INDEXABLE_PUBLIC_PATHS`) — no route/index.js
  change needed, that wiring already existed.
- **Scope call not in the original roadmap wording:** the roadmap's step 3
  ("স্ব-নিবন্ধন ফ্লো ... একটা checkbox") assumed a `PublicSignup`-style
  frontend page, but there isn't one — the actual self-signup UI is the
  separate plain-HTML/JS marketing site (`server/public-marketing/`,
  served only on the bare apex root domain per `PLATFORM_ROOT_DOMAIN`,
  see `index.js`'s apex-host middleware) that only talks to
  `POST /api/public/signup`. The tenant client's new `/terms`/`/privacy`
  routes aren't reachable from that apex domain (different serving path
  entirely), so:
  - Added standalone `server/public-marketing/terms.html` and
    `privacy.html` (plain HTML, same visual language as `index.html` via
    the shared `styles.css`, plus a small page-scoped `<style>` block for
    the section-list layout). Linked with the `.html` extension
    (`/terms.html`, `/privacy.html`) because the apex middleware's
    `express.static` call has no `extensions` option configured, so an
    extensionless `/terms` request there would fall through to the
    marketing SPA's `index.html` instead of matching a static file.
  - `server/public-marketing/app.js`: added a required "আমি শর্তাবলী ও
    গোপনীয়তা নীতি মেনে নিচ্ছি" checkbox (links to the two new `.html`
    pages, opened in a new tab) right before the submit button. Enforced
    client-side only via the native HTML `required` attribute (form
    submission is blocked by the browser until checked) — did **not**
    add server-side enforcement in `publicSignup.js`, since the roadmap
    only asked for the flow to have the checkbox, and adding a new
    required-field check there would be a second, unscoped change to a
    file outside this task's stated diff. Flagging this as a possible
    follow-up if the user wants it enforced server-side too (a bad actor
    could bypass the checkbox by calling `POST /api/public/signup`
    directly, same as with any client-only validation).
  - New `.field--checkbox` styles added to
    `server/public-marketing/styles.css` for that checkbox row.
- **`npm run check` NOT run by this agent** (no network/node_modules in
  this sandbox, same limitation noted for Phase 1 and Phase 3). Manual
  review only: read-through of both new `.tsx` files against the
  `no-restricted-syntax` ESLint rule (confirmed no native-element
  `style={{`), a bracket/JSX-balance pass, confirmed `App.tsx`'s new
  routes/imports are well-formed, confirmed the new/edited `.js`/`.html`
  files have no syntax errors, and confirmed no CSS custom property was
  referenced without being defined (caught and fixed one: `var(--slate-d)`
  doesn't exist in `index.css`, swapped to `var(--muted)`).
  **Run `npm run check` as part of this delivery's CMD before trusting
  it** — this is exactly what the packaged CMD does.

Phase 3 (staff-side notice/assignment broadcast UI) finished 2026-08-05:
- Backend was already complete (`server/src/routes/assignments.js`,
  `server/src/lib/classPosts.js`); only a new `GET /api/assignments/classes`
  endpoint was added (mirrors `results.js`'s `/classes` — teacher-scoped via
  `attachTeacherClasses`, unscoped roles get every class with a student).
  Required adding `const db = require("../db");` to that route file, which
  wasn't imported before.
- New client module `client/src/modules/ClassPosts.tsx` — compose form
  (class/type/title/body) + sent-posts list with a type filter, built
  entirely from `components/ui/` (`Card`, `Field`, `Input`, `Select`,
  `Textarea`, `Button`) plus the existing `Badge` component for the
  type/class chip — no raw `style={{}}` on native elements, per AGENTS.md's
  Design System rule (this file was not on the legacy-exemption list, so it
  had to comply from the start).
- New scoped CSS classes added to `client/src/index.css`:
  `.class-post-form`, `.class-post`, `.class-post__head`,
  `.class-post__meta`, `.class-post__title`, `.class-post__body`,
  `.class-post__actions` — same pattern as `.report-card__*` in the same
  file.
- `client/src/lib/api.ts`: added `getAssignmentClasses`, `getClassPosts`,
  `createClassPost`, `deleteClassPost`.
- `client/src/lib/permissions.ts`: added `"assignments"` to the
  `Permission` union type and to `firstAllowedPath`'s fallback order (right
  after `results`). No `roles.js`/`roles.generated.ts` change was needed —
  the `"assignments"` permission already existed for Admin/Teacher.
- `client/src/App.tsx`: lazy-imported `ClassPosts` and added the
  `/assignments` protected route.
- `client/src/components/Sidebar.tsx`: added one `NAV_IDS` entry (📢) —
  only a data-array addition, so it renders through the file's existing
  `NavLink` block and needed no new inline styles (the file is on the
  legacy-exemption list, but nothing new was written there anyway).
- `client/src/i18n/bn.ts` + `en.ts`: added `nav.assignments` and a new
  `classPosts` block (structural key-parity between the two files was
  checked by script, not just by eye).
- Attachments (image/PDF upload on a post) were intentionally left out of
  this UI — the roadmap's Phase 3 scope only asked for the write/send form
  and list, and the backend schema already defaults `attachments` to `[]`
  if omitted, so this can be added later as its own small task without
  touching what's here.
- **`npm run check` NOT run by this agent** (no network/node_modules in
  this sandbox, same limitation noted for Phase 1). Manual review only:
  `node --check` on the new/edited `.js` route file, a bracket-balance
  pass on the new `.tsx` file, and a script-based structural diff
  confirming `bn.ts`/`en.ts` key parity for the new translation blocks.
  **Run `npm run check` as part of this delivery's CMD before trusting
  it** — this is exactly what the packaged CMD does.

Phase 1 (payments cascade fix) finished 2026-08-05:
- `server/sql/supabase_schema.sql`: `payments.studentId` changed from
  `not null ... on delete cascade` to `references students(id) on delete
  set null` (nullable) in the `create table if not exists payments` block,
  matching `income.studentId`'s existing pattern. Added an idempotent
  migration block right after it (`alter column ... drop not null` +
  `drop constraint if exists` + `add constraint ... on delete set null`) so
  **existing** databases (not just fresh ones) pick up the fix — this
  mirrors the file's established idempotent-statement convention (see
  `db.js`'s `initSchema()` comment).
- No server route code needed changes: `payments.js`'s only place that
  reads a payment row's `studentId` after the fact (`resolve-flag`
  endpoint) already guards with `if (student)` before touching
  `students`, so a null `studentId` degrades gracefully. `payments.student`/
  `payments.roll` are already denormalized snapshot columns, so receipts
  keep showing the right name/roll even after `studentId` goes null.
  `students.js`'s delete endpoint needed no change — the DB now handles
  the cascade behavior via the FK itself.
- No frontend code reads `payment.studentId` anywhere, so no client changes
  needed either.
- **Deployment-time action the user still needs to take (not code, can't be
  done from this sandbox):** `db.js`'s `initSchema()` only re-runs
  `supabase_schema.sql` against the `public` schema on every boot — it does
  NOT automatically reach existing tenant schemas (`tenant_xxx`), per
  `migrateTenants.js`'s own header comment. Any **already-provisioned**
  institution's `payments` table still has the old CASCADE constraint until
  someone runs this migration SQL against it via the Platform panel's
  tenant-migration tool (`POST` route in `platform.js`, calls
  `migrateTenants.migrateAllTenants(sql)`):
  ```sql
  alter table payments alter column "studentId" drop not null;
  alter table payments drop constraint if exists "payments_studentId_fkey";
  alter table payments add constraint "payments_studentId_fkey"
    foreign key ("studentId") references students(id) on delete set null;
  ```
  Brand-new institutions provisioned after this deploy get the fix
  automatically (`tenantProvision.js` reads the same schema file).
- `npm run check` NOT run by this agent (no network/node_modules in this
  sandbox) — manual review only (parens-balance sanity check on the SQL
  file, read-through of every `studentId` usage in `payments.js` and the
  student-delete endpoint in `students.js`, confirmed no frontend
  dependency). **Run `npm run check` as part of this delivery's CMD before
  trusting it.**

## How to use this file (for the AI agent)

**If `Status: IN_PROGRESS` above:**
1. Read "বাকি" below — that is the next work, already scoped by a previous
   agent. Continue it without asking the user to re-explain, unless the
   user's current message gives a clearly different/new instruction (a new
   instruction always takes priority — see AGENTS.md).
2. When you finish another part of the queued task, move it from "বাকি" to
   "সম্পন্ন" and update "বাকি" with what's still left — do this *before*
   packaging the delivery zip, so it travels with the commit.
3. If, after your part, nothing remains in "বাকি", reset this entire file
   back to the template below (Status: DONE, both lists cleared). Do not
   leave a stale IN_PROGRESS with an empty "বাকি" list — that's ambiguous
   for the next agent.

**If `Status: DONE` above:** there is no carried-over task. Proceed on
whatever the user asks in their current message; if they say to split it
into parts, switch this file to the IN_PROGRESS template below as part of
your delivery.

**If the user gives a brand-new task while Status is IN_PROGRESS:** do the
new task, and leave the existing IN_PROGRESS entry untouched unless the
user says to drop it — don't merge the two into one entry.

---

## Template (copy this in when starting a multi-part task)

```markdown
## Status: IN_PROGRESS

## Task: [এক লাইনে মূল কাজের নাম]
Started: [YYYY-MM-DD]

### সম্পন্ন
- [x] Part 1 — কী করা হয়েছে, কোন ফাইলে

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
- [ ] Part 2 — ঠিক কী করতে হবে, কোন ফাইলে/ফাংশনে
- [ ] Part 3 — ঠিক কী করতে হবে, কোন ফাইলে/ফাংশনে

### নোট
পরের অংশ করতে যা context লাগবে — নাম/স্ট্রাকচার/সিদ্ধান্ত যা এই সেশনে ঠিক
হয়েছে এবং কোথাও লেখা নেই।
```

---
project_name: 'madrasah-website'
user_name: 'Mdashikashrafe'
date: '2026-07-19'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 22
optimized_for_llm: true
---

# Project Context for AI Agents

_Critical rules and patterns for AI agents implementing code in this project. Focus is on unobvious details — not a general tutorial on the stack._

**What this is**: Madrasah ERP — a school management system for a madrasah (Islamic school) covering student admissions, attendance, hifz (Quran memorization) tracking, income/fees, expenses, reports, and role-based user management. Bilingual UI (Bengali primary, English secondary).

---

## Technology Stack & Versions

**Monorepo layout**: `client/` (frontend) + `server/` (backend) + root orchestration via `concurrently`. No shared package — types are duplicated by hand between `server/src/models/` and `client/src/types/index.ts`.

**Frontend** (`client/`):
- React 19.2 + TypeScript ~6.0, Vite 8, React Router 7 (routes in `App.tsx`, all module pages lazy-loaded)
- Recharts 3 (dashboard charts), jsPDF 4 + jspdf-autotable 5 (client-rendered PDFs: receipts, reports)
- ESLint 10 flat config (`eslint.config.js`): `js.configs.recommended` + `typescript-eslint recommended` + `react-hooks` + `react-refresh`
- `tsconfig.app.json`: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax` all on — dead imports/vars and non-erasable type-only syntax will fail the build, not just lint
- No test framework configured (no jest/vitest/playwright present)

**Backend** (`server/`):
- Node + Express 5, **CommonJS** (`"type": "commonjs"`, uses `require`/`module.exports` — do not introduce ESM `import` syntax here)
- `pg` 8 driver → **PostgreSQL only**. There is no SQLite anywhere in the current code despite `docs/DEVELOPER_GUIDE.md` describing one — that doc is stale, treat it as historical, not authoritative
- Auth: `jsonwebtoken` (7-day expiry) + `bcryptjs` (12 salt rounds everywhere)
- `helmet`, `express-rate-limit` (auth: 100/15min, general API: 200/min), `cookie-parser`
- `pdfkit` for server-rendered PDFs (student profile PDF) — a **second, separate PDF stack** from the client's jsPDF; don't conflate the two
- `nodemailer` for password-reset email (Gmail SMTP by default via env vars)
- No test framework configured

**Deploy target**: Vercel (frontend static build) + Render (backend) + Supabase Postgres (managed DB). See `docs/SUPABASE_CLOUDINARY_SETUP.md` and `docs/DEPLOYMENT_CHECKLIST.md` for the current, accurate deployment story — prefer those two over `DEVELOPER_GUIDE.md` when they conflict.

**Schema strategy**: No migration tool. `server/sql/supabase_schema.sql` is run **idempotently on every server boot** (`db.js` → `initSchema()`, split on `;` and executed statement-by-statement). Uses `create table if not exists` and `alter table add column if not exists`. Any schema change is made by **appending** a new idempotent statement to this file — never edit or reorder existing statements, since they re-run on every deploy.

---

## Critical Implementation Rules

### Language-Specific Rules

- Backend is CommonJS — always `require(...)` / `module.exports`, never ESM `import`/`export` in `server/`.
- Frontend TS is strict about unused code — an unused import or variable breaks `tsc`, not just lints as a warning.
- Client API layer (`client/src/lib/api.ts`) is the single fetch wrapper (`request<T>`) — all HTTP calls go through `api.*` methods, not ad-hoc `fetch()` in components.

### Framework-Specific Rules

- **Routing**: all authenticated pages are nested under `<ProtectedRoute>` → `<Layout>` in `App.tsx`; new pages must be added there, lazy-loaded the same way as existing modules.
- **RBAC is defined in two places that must be kept in sync by hand**: `server/src/middleware/rbac.js` (`ROLE_PERMISSIONS`, `ROUTE_PERMISSION`) and `client/src/lib/permissions.ts` (`ROLE_PERMISSIONS`). Same 5 roles: `Super Admin` (`*`), `Admin`, `Accountant`, `Teacher`, `Hostel Manager`. Adding a permission/route on the backend without mirroring it in the frontend list will silently break nav visibility or vice versa.
- **Sensitive-write approval flow**: deletes on `income`/`expenses`, and edits/deletes on `Admin`/`Super Admin` user records, do **not** execute directly for non-approval roles (`Teacher`, `Accountant`, `Hostel Manager`, or a peer Admin editing another Admin). Instead they insert a row into `delete_requests` (via `server/src/lib/deleteRequests.js` → `createDeleteRequest`) and return `202 { pendingApproval: true }`. A `Super Admin`/`Admin` must call `/api/delete-requests/:id/approve`. **Any new destructive/sensitive endpoint should follow this same pattern**, not a bare `DELETE`/`UPDATE`.
- **Money-moving side effects are duplicated across two routes**: posting income with `category === "Student Fee"` (`routes/income.js`) and posting to `/api/payments` (`routes/payments.js`) both (a) decrement `students.due`, (b) insert into the *other* table (`payments`↔`income`) to keep them mirrored. These are two independently-maintained code paths doing the same dual-write — if you change one, check the other. `payments.js` wraps its dual-write in `db.withTransaction`; `income.js`'s student-fee path does **not** use a transaction (sequential awaits) — worth using `withTransaction` if touched.
- **Server-side validation lives in dedicated model files**, e.g. `server/src/models/studentAdmission.js` exports `admissionFromBody`/`validateAdmission`/`RETURNING_COLUMNS` — routes stay thin and call into these rather than inlining validation.
- Auth token is delivered **both** as an httpOnly cookie and returned in the JSON body for `localStorage` (`madrasah-token`); the client sends `Authorization: Bearer <token>` when a real token is stored, or relies on the cookie when the stored value is the sentinel string `"cookie"`. This dual mechanism exists because Vercel/Render cross-origin cookies can be unreliable — don't remove either path without checking `AuthContext.tsx` and `api.ts` together.

### Testing Rules

- No test suite exists in this repo currently (no jest/vitest/playwright config, no `test` script in either `package.json`). Do not assume tests exist or add test-runner-dependent CI steps without setting one up first.

### Code Quality & Style Rules

- Route files (`server/src/routes/*.js`) are consistently thin: parse/validate → `db.all`/`db.get`/`db.run`/`db.withTransaction` (from `server/src/pg.js`) → shape response. Match this shape for new routes rather than introducing an ORM or a different data-access style.
- Bilingual strings for UI go in `client/src/i18n/bn.ts` and `client/src/i18n/en.ts` (parallel key structure, accessed via `useLanguage()` → `t.*`) — never hardcode user-facing strings in component JSX.
- Bengali-script literals also appear as **data values**, not just UI strings — see Anti-Patterns below.

### Development Workflow Rules

- Commit style in history is short, lower-case, prefix-style (`fix: ...`, `add ...`, `improve ...`) — match this for new commits.
- `main` is the only branch in use; no branch-naming convention has been established yet.
- BMad module config: `_bmad/bmm/config.yaml` sets `output_folder: _bmad-output`, `planning_artifacts`/`implementation_artifacts` under it, and `project_knowledge: docs/`. This `project-context.md` lives in `docs/` per that config. BMad planning/implementation artifact folders are currently empty — no PRD, architecture doc, or epics/stories exist yet for this project as of this writing.

### Critical Don't-Miss Rules

- **⚠️ Bengali/English enum split (the biggest landmine in this codebase)**: Legacy data (schema defaults, `seed.js`, and older routes like `attendance.js`, `hifz.js`, `dashboard.js`) uses **Bengali-script literal values** for status/type/department fields — e.g. student `status: "সক্রিয়"` (active), `type: "আবাসিক"` (residential), `dept: "হিফজ"` (Hifz), attendance `status: "উপস্থিত"/"অনুপস্থিত"/"দেরিতে"` (present/absent/late). The **newer** admission model (`server/src/models/studentAdmission.js`, used by `POST/PATCH /api/students`) validates **English** enum values instead — `type: "Day"|"Residential"`, `dept: "Hifz"|"Nazera"|"Kitab"|"General"`, `gender`, `religion`, etc. **These two value sets do not match.** A student admitted through the new admission form will have `dept: "Hifz"` (English), but `routes/hifz.js`'s `GET /` filters `WHERE dept = 'হিফজ'` (Bengali) — so new Hifz students silently won't appear in Hifz tracking, attendance queries that check `status = 'সক্রিয়'`, or dashboard residential counts that check `type === "আবাসিক"`. **Before touching students/attendance/hifz/dashboard code, check which literal set the specific query/filter you're editing expects, and don't assume old and new records are comparable.** This needs a deliberate reconciliation (migration or a normalization layer) — flag it to the user if you're asked to build on top of any of these modules.
- Duplicate-checking on student create/update happens in **two layers**: application-level `duplicateError()` query in `routes/students.js` (checks `birthRegistrationNumber`/`admissionNumber`) *and* DB unique partial indexes (`students_admission_number_unique`, `students_birth_registration_unique`) with `constraintError()` catching the Postgres `23505` race as a fallback. Keep both in sync if either field's uniqueness rule changes.
- `admissionFromBody` derives `student.phone` from `fatherMobile` → `guardianMobile` → `motherMobile` fallback chain — not a direct field: don't read/write `phone` as if it were independently authoritative on create/update.
- File uploads (student photo, documents) are **base64 data URLs stored directly in Postgres** (`documents jsonb`, `studentPhoto text`), capped at 750KB per file via `validateDataUrl`, and the JSON body limit is `6mb` (`express.json({ limit: "6mb" })`) — there is no object storage (S3/Cloudinary) wired up yet despite `SUPABASE_CLOUDINARY_SETUP.md`'s title mentioning Cloudinary; Cloudinary is not actually integrated in current code.
- `INITIAL_ADMIN_PASSWORD`/`INITIAL_ADMIN_EMAIL` env vars only seed an admin when `NODE_ENV=production` **and** the `users` table is empty; in non-production with an empty table it seeds 3 *passwordless* dev users instead (`db.js`) — don't expect `INITIAL_ADMIN_*` to work locally unless `NODE_ENV=production` is also set.
- Public self-registration (`POST /api/auth/register`) only works when the `users` table is completely empty, and is additionally gated behind `ENABLE_PUBLIC_SETUP=true` in production — it always creates a `Super Admin`. Don't treat it as a general signup endpoint.
- CORS allows any `*.vercel.app` origin automatically in addition to `CLIENT_ORIGIN` (`isAllowedOrigin` in `index.js`) — intentional for preview deployments, but means any Vercel-hosted app can call this API cross-origin; don't widen this further without noticing the implication.

---

## Open Gaps for Future BMad Work

- No PRD, architecture doc, UX spec, or epics/stories exist yet (`_bmad-output/planning-artifacts` and `implementation-artifacts` are both empty). If continuing this project inside BMad, natural next steps are `bmad-document-project` (deeper brownfield doc) or going straight to `bmad-architecture`/`bmad-create-epics-and-stories` once a PRD-equivalent (this context + a brief) exists.
- The Bengali/English enum inconsistency above is the single highest-value thing to resolve before building new features on students/attendance/hifz/dashboard — worth a dedicated correct-course or spec pass.
- No automated tests exist anywhere in the repo.
- `docs/DEVELOPER_GUIDE.md` contradicts current reality (SQLite vs Postgres, Windows path, db file location) and should be refreshed or retired in favor of `SUPABASE_CLOUDINARY_SETUP.md` + `DEPLOYMENT_CHECKLIST.md`.

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code in this repo.
- Follow all rules exactly as documented; when in doubt, prefer the more restrictive/cautious option (especially around the approval-flow and enum-split rules above).
- Update this file when a new unobvious pattern or gotcha is discovered.

**For Humans:**
- Keep this file lean and focused on agent needs — not a general README.
- Update when the technology stack or business rules change.
- Review periodically and prune rules that become obvious over time.

Last Updated: 2026-07-19

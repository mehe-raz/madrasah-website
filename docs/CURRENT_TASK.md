# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: DONE

## Task: (none — Phase 1 and Phase 3 of BUSINESS_READINESS_ROADMAP.md
complete; Phase 2 intentionally skipped for now on the user's decision
— see `docs/BUSINESS_READINESS_ROADMAP.md` for Phase 4 onward)

### সম্পন্ন
(cleared — see git history for Phase 1's and Phase 3's diffs)

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
(none queued — next agent should read `docs/BUSINESS_READINESS_ROADMAP.md`
and ask the user which phase to start, per that file's "কীভাবে ব্যবহার
করবেন" section. Note: Phase 2 (email notifications) was deliberately
skipped, not forgotten — the user's Resend free tier only allows 100
emails, so they chose to come back to it later. Don't auto-start Phase 2
without the user explicitly asking.)

### নোট
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

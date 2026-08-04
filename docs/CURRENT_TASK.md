# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: DONE

## Task: (none — Phase 1 of BUSINESS_READINESS_ROADMAP.md complete, see
`docs/BUSINESS_READINESS_ROADMAP.md` for Phase 2 onward)

### সম্পন্ন
(cleared — see git history for Phase 1's diff)

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
(none queued — next agent should read `docs/BUSINESS_READINESS_ROADMAP.md`
and ask the user which phase to start, per that file's "কীভাবে ব্যবহার
করবেন" section)

### নোট
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

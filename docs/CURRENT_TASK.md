# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: IN_PROGRESS

## Task: BUSINESS_READINESS_ROADMAP — Phase 1 (payments cascade fix)
Started: 2026-08-05

Full 8-phase plan lives in `docs/BUSINESS_READINESS_ROADMAP.md` (created
from a 2026-08-05 business-readiness review) — read that file for every
phase's detail. This entry tracks only which phase is active. **Phase 8
(SMS + bKash/Nagad) must NOT be started by any agent on its own initiative
— the user will explicitly say when their provider accounts are ready.**

### সম্পন্ন
- [x] Roadmap document written: `docs/BUSINESS_READINESS_ROADMAP.md`
      (8 phases), referenced from `docs/PROJECT_MAP.md` §9.

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
- [ ] **Phase 1 — Payments cascade fix.** Full detail in
      `docs/BUSINESS_READINESS_ROADMAP.md` under "Phase 1". Short version:
      `server/sql/supabase_schema.sql`'s `payments.studentId` FK is still
      `on delete cascade` (deleting a student wipes their receipt/payment
      history) — `income.studentId` was already fixed to `on delete set
      null` earlier, `payments` needs the same treatment. Touches
      `server/sql/` (an AGENTS.md protected path — explain the exact change
      when reporting done) and possibly `server/src/routes/payments.js`/
      `students.js` for null-safety. Not started yet.
- [ ] Phase 2 through 7 — see roadmap doc, not started. Each is its own
      delivery once the prior phase's `npm run check` passes and is
      pushed.
- [ ] Phase 8 — blocked, do not start (see warning above).

### নোট
- This queue replaces the now-finished ক্লাস/জামাত hierarchy task (Part 1
  + Part 2A/2B-1/2B-2/2B-3, all done — see git history).
- Same delivery pattern as before: one phase = one zip + one CMD
  install/check/commit/push cycle (user's standing preference, see
  AGENTS.md "Workflow").

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

# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: DONE

## Task: (none — see git history for the completed ক্লাস/জামাত hierarchy
Part 1 + Part 2/2A/2B-1/2B-2/2B-3 work)

### সম্পন্ন
(cleared — see AGENTS.md "Reusable building blocks" and this repo's git log
for what's been built)

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
(none)

### নোট
Part 2B-3 (the last sub-part of the ক্লাস/জামাত hierarchy frontend work)
finished on 2026-08-05:
- `Settings.tsx` teacher class-assignment checkboxes now group by top-level
  `classTree` department (`.class-tree-checkbox-group` /
  `.class-tree-checkbox-group__title` in `index.css`) instead of one flat
  `classOptions` list. The `manageUsers && editUsers` effect that used to
  call `refreshClassOptions()` now calls `refreshClassTree()` instead, since
  the checkbox list's data source changed. `classOptions` itself is
  untouched and still powers the separate flat-list editor UI in this same
  file (intentional back-compat, see prior Part 2A/2B-2 notes).
- Remaining raw `.class` string displays now go through
  `classTreeLabel(classTree, value)`: `Attendance.tsx` (table cell, switched
  `useLanguage()` → `useAppSettings()` to get `classTree`), `HifzTracking.tsx`
  (student list row + selected-student header, same hook switch),
  `StudentPicker.tsx` (option-label suffix, newly imports
  `useAppSettings`/`classTreeLabel` — this component previously had no
  AppSettingsContext dependency at all). `Income.tsx`'s class filter
  dropdown keeps its `<option value={c}>` raw (still must match
  `students.class` exactly for `StudentPicker`'s `classFilter`) but now
  displays `classTreeLabel(classTree, c)` as the visible text; also switched
  `useLanguage()` → `useAppSettings()`.
- This closes out the full ক্লাস/জামাত hierarchy task (Part 1 data model +
  Part 2A shared infra + Part 2B-1/2B-2/2B-3 frontend wiring). Every file in
  the Part 2B-3 scope list has been touched; no further sub-parts remain.
- `npm run check` NOT run by this agent (no network/node_modules in this
  sandbox) — manual review only (brace-balance sanity check on every edited
  file, grep sweep confirming the `classOptions` inventory matches what
  Part 2B-2's notes expected). **Run `npm run check` as part of this
  delivery's CMD before trusting it, same caveat as every prior sub-part.**

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

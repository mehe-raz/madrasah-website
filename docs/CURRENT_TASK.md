# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: IN_PROGRESS

## Task: ক্লাস/জামাত hierarchy — Part 2: Frontend cascading UI (৩ উপ-ভাগে)
Started: 2026-08-05

Part 2B was originally scoped as one block but the user asked to split it
into 3 self-contained deliveries (each one gets its own zip + CMD install/
check/commit/push cycle from the user — see AGENTS.md "Workflow" and the
user's standing delivery preference). **Each sub-part must leave the repo in
a state where `npm run check` passes on its own** — don't assume a later
sub-part's files exist yet when writing a given sub-part.

### সম্পন্ন
- [x] Part 2A — Shared cascading infra + Settings tree editor (unchanged from
      before, see git history): `ClassTreeNode` type, `api.getClassTree` /
      `saveClassTree` / `getPublicClassTree`, `client/src/lib/classTree.ts`
      (flatten/find/label + tree-edit helpers), `AppSettingsContext`
      `classTree` state, `ClassCascadeSelect` component (depth-agnostic
      cascading `<Select>` picker, exported from `components/ui/index.ts`),
      i18n `classTree*` keys, Settings.tsx tree editor UI + warning banner,
      `.class-tree-row--depth-*` / `.class-tree-warning` CSS.
- [x] Part 2B-1 — `client/src/modules/Students.tsx` (admin admission/edit
      form) + `client/src/lib/labels.ts`:
  - Swapped the flat `class` Select for
    `<ClassCascadeSelect tree={classTree} value={form.class} onChange={handleClassChange} />`.
  - Added `handleClassChange` in Students.tsx: sets `class`, then walks
    `findClassTreePath(classTree, en)` and auto-sets `dept` from the picked
    leaf's top-level department via the new `deptCodeFromTreeTopLevel()` /
    `TREE_TOP_LEVEL_TO_DEPT` map in `lib/labels.ts`
    (`hifz→Hifz, nurani-najera→Nurani, kitab→Kitab, general→General`).
    **`hifz→Hifz` is deliberate and must never change** —
    `server/src/routes/hifz.js`'s Hifz Tracking module filters students with
    the exact string `dept = 'Hifz'`. `nurani-najera` maps to the existing
    `Nurani` code (the tree merges old Nurani+Nazera into one department) —
    `DEPT_LABELS_BN` still keeps a `Nazera` entry so any pre-existing legacy
    record still *displays* correctly, it's just never produced by new
    admissions anymore. No server-side change was needed — `ALLOWED.dept` in
    `server/src/models/studentAdmission.js` already permitted all 4 codes.
  - The `dept` field in step 2 of the form is now a `<ReadonlyValue>` (not a
    Select) showing `deptLabel(form.dept)` — it's derived, not manually
    picked. `departmentOptions` (top-of-file const) is now only used for the
    department *filter tabs* above the student list, trimmed from 5 values
    to 4 (`Hifz/Kitab/Nurani/General` — dropped `Nazera`, see above).
  - Any place this file displayed a raw `student.class`/`viewing.class`
    string (list table cell, mobile RecordCard, view-modal detail row, view-
    modal header line) now runs it through
    `classTreeLabel(classTree, value)` from `lib/classTree.ts` first, so
    tree-based leaf `en` values show their nice Bengali path instead of the
    raw slug. The one intentionally-left-alone spot: the offline-queued-
    admission badge (`body.class`, search "pendingAdmissionsTitle") still
    shows the raw value — low-visibility, not worth the extra complexity of
    reading `classTree` inside that map for a queued (not-yet-synced) entry.
  - `npm run check` NOT run by this agent (no network/node_modules in its
    sandbox) — **run it as part of this delivery's CMD before trusting it**,
    same caveat as Part 2A.

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)

- [ ] **Part 2B-2 — public-facing class pickers.** Three files, all follow
      the exact same pattern (grep "getPublicClassOptions" to re-find them
      if any have moved): add local `classTree` state populated from
      `api.getPublicClassTree()` (NOT `api.getClassTree()` — these are all
      unauthenticated/public-context components/pages), then swap the
      manual `<Select>`+`options.map` block for `<ClassCascadeSelect>`,
      keeping the existing plain-`<Input>` fallback for whenever the tree
      hasn't loaded/is empty (same fallback shape that's already there for
      `classOptions`).
  - [ ] `client/src/pages/AdmissionApply.tsx` — the "ক্লাস / জামাত" required
        field (search `classOptions.map`). This file hand-rolls its own
        inline `style={{...}}` throughout (it predates the Design System
        rule and is a public page, not flagged in
        `docs/DESIGN_SYSTEM_MIGRATION.md`) — `ClassCascadeSelect` itself is
        exempt (it's inside `components/ui/`), don't try to re-style it to
        match `inputStyle`, just drop it in as-is.
  - [ ] `client/src/pages/guardian/GuardianLogin.tsx` — the signup form's
        "ক্লাস" field (search `classOptions.map`, inside the
        `guardian-form-row` div next to "রোল নম্বর"). This file already uses
        `components/ui` (`Field`/`Select`), so `ClassCascadeSelect` drops in
        cleanly — remove the wrapping `<Field label="ক্লাস">` since
        `ClassCascadeSelect` renders its own.
  - [ ] `client/src/pages/guardian/GuardianDashboard.tsx` — the "+ আরেকটি
        সন্তান যুক্ত করুন" (add child) form's "ক্লাস" field — identical
        pattern/rationale to GuardianLogin.tsx above (same exact code
        shape, same comment about avoiding exact-string-match signup
        failures — search `classOptions.map`).
  - [ ] Run `npm run check`, fix everything it flags, re-run until clean.

- [ ] **Part 2B-3 — Settings.tsx teacher-assignment checkboxes + remaining
      raw class-label displays + final cleanup.** Do this one LAST (after
      2B-2 is delivered/merged), since it's the natural point to also reset
      this file to `Status: DONE`.
  - [ ] `client/src/modules/Settings.tsx` — teacher class-assignment
        checkbox list (search `classDraftForRow`, around the
        `classOptions.map((option) => ...)` inside `{classDraftForRow && (`).
        Regroup it to mirror the tree instead of one flat list: import
        `flattenClassTree` from `../lib/classTree` (alongside the existing
        `addClassTreeNode`/`removeClassTreeNode` import), then for each
        top-level `classTree` node render a group header (`dept.bn`) and
        underneath it `flattenClassTree([dept])` as the checkboxes for that
        group (checkbox `value`/`checked`/`onChange` keep using the leaf's
        `en`, exactly like today — only the grouping/labels change). Add a
        `.class-tree-checkbox-group` / `.class-tree-checkbox-group__title`
        CSS rule to `client/src/index.css` near the existing
        `.class-tree-row*` rules — no inline `style={{...}}` (Design System
        rule).
  - [ ] Swap remaining raw `.class` string displays to
        `classTreeLabel(classTree, value)` (import from `../lib/classTree`;
        each of these files/modules already gets `classTree` from
        `useAppSettings()` or can add it — they're all authenticated
        modules):
    - [ ] `client/src/modules/Attendance.tsx` — line showing `{s.class}` in
          the attendance table (search `t.attendance.class`).
    - [ ] `client/src/modules/HifzTracking.tsx` — two spots: the student
          list row (`{s.class} · {s.para}/...`) and the selected-student
          header (`{selected.class}`).
    - [ ] `client/src/components/StudentPicker.tsx` — the `` `(${s.class})` ``
          suffix in the picker's option label.
    - [ ] `client/src/modules/Income.tsx` — this one is DIFFERENT from the
          others: its class filter dropdown (search `const [classes,
          setClasses]`) is populated from a server-side *distinct-values*
          query, not the tree, so both the `value` and the displayed
          `<option>` text are the same raw string today. Leave the `value`
          alone (it still needs to match `students.class` exactly for the
          `StudentPicker`'s `classFilter` to work) but wrap the *displayed*
          text with `classTreeLabel(classTree, c)` so tree-based leaf values
          show their nice label while the underlying filter value is
          unchanged. Needs `classTree` added to this component (pull from
          `useAppSettings()`/`useLanguage()` — check which one this file
          currently imports from `context/AppSettingsContext`).
  - [ ] Run `npm run check`, fix everything it flags, re-run until clean.
  - [ ] Once 2B-3's `npm run check` passes, reset this ENTIRE file back to
        the `Status: DONE` template at the bottom of this file (per the
        "How to use this file" section below) — there is nothing left in
        "বাকি" after this sub-part.

### নোট
- Storage decision (approved, from Part 2A, still holds): a student's
  `class` field still stores a single leaf `en` string, exactly as before —
  no schema change, no students.class migration. Old demo/legacy `class`
  text values are intentionally NOT auto-matched into the new tree —
  `classTreeLabel()` falls back to showing the raw stored string for
  anything not found in the tree, so old records don't break, they just
  won't get the pretty composite label.
- The `dept` restructuring (Part 2B-1, above) is now done — don't redo it in
  2B-2/2B-3, but DO be aware of the `hifz→Hifz` exact-string constraint if
  either of the later sub-parts ever touches dept-related code.
- User declined adding "মহিলা বিভাগ" as a top-level department now (add
  later) — the tree editor still supports adding new top-level departments
  in general (button `t.settings.classTreeAddTopLevel`), just don't seed a
  new one by default.
- Design System rule (AGENTS.md) applies to all of Part 2B/2B-2/2B-3: no
  `style={{...}}` on native elements outside `components/ui/` — use `.ds-*`
  classes or add a new named class to `index.css`. Exception already noted
  above: `AdmissionApply.tsx`'s pre-existing inline styles are untouched
  legacy code, not a new violation.
- Full file inventory of everywhere `classOptions` (the old flat list) is
  still referenced, as of the start of Part 2B-2 (re-grep
  `grep -rln "classOptions" client/src/modules client/src/pages
  client/src/components` if this list might be stale): `Settings.tsx` (the
  tree editor coexists with the old flat-list editor UI — both stay, this
  is intentional back-compat, see Part 2A notes), `AdmissionApply.tsx`,
  `GuardianLogin.tsx`, `GuardianDashboard.tsx` (these 3 are 2B-2's scope).
  `Students.tsx` no longer references it (done in 2B-1).

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

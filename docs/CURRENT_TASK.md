# Current Task Queue

Read this file every session, regardless of what the user's message says —
it may carry unfinished work from a previous AI agent's session.

## Status: IN_PROGRESS

## Task: ক্লাস/জামাত hierarchy — Part 2: Frontend cascading UI (২ ভাগে)
Started: 2026-08-05

### সম্পন্ন
- [x] Part 2A — Shared cascading infra + Settings tree editor:
      `client/src/types/index.ts` (ClassTreeNode type), `client/src/lib/api.ts`
      (getClassTree/saveClassTree/getPublicClassTree), `client/src/lib/classTree.ts`
      (new — flatten/find/label + addClassTreeNode/removeClassTreeNode edit
      helpers), `client/src/context/AppSettingsContext.tsx` (classTree state,
      loaded alongside classOptions), `client/src/components/ui/ClassCascadeSelect.tsx`
      (new — generic depth-agnostic cascading picker) + exported from
      `components/ui/index.ts`, `client/src/i18n/{bn,en}.ts` (classTree*
      keys incl. the warning text), `client/src/modules/Settings.tsx`
      (ClassTreeRow recursive component + new "ক্লাস/জামাত ব্যবস্থাপনা
      (ধাপে-ধাপে)" card: warning banner, add-top-level-department button,
      add-child-under-any-node form, delete-with-confirm), `client/src/index.css`
      (.class-tree-row--depth-*, .class-tree-warning — no inline styles).
      `npm run check` NOT run by the agent (no network/node_modules in its
      sandbox) — run it as part of the delivery CMD before this is trusted.

### বাকি (পরের এজেন্ট এখান থেকে চালিয়ে যাবে)
- [ ] Part 2B — Wire `ClassCascadeSelect` into every class-picking spot and
      retire reliance on the flat `classOptions` for *new* selections
      (flat list/routes stay in the codebase, untouched, for back-compat):
  - [ ] `client/src/modules/Students.tsx` — replace the flat `class` Select
        (search "classSelectValues"/"classLabelFor") with
        `<ClassCascadeSelect tree={classTree} value={form.class} onChange={...} />`.
        Also resolve the `dept` field redundancy: user decided (see chat)
        to auto-derive `dept` from the cascade's top-level pick instead of
        keeping the separate manual `departmentOptions` Select — map the
        chosen top-level node id (hifz/nurani-najera/kitab/general) to
        whatever `dept` values the rest of the app expects (check
        `deptLabel()`/`DEPT_LABELS_BN` in `client/src/lib/labels.ts` — these
        may need new entries or a rename since the old dept slugs were
        Hifz/Nazera/Kitab/Nurani/General, 5 values, and the tree's top level
        is only 4 nodes with "nurani-najera" merged).
  - [ ] `client/src/pages/AdmissionApply.tsx` — same swap, using
        `api.getPublicClassTree()` (public, unauthenticated) instead of
        `api.getClassTree()`.
  - [ ] Teacher class-assignment checkboxes (Settings.tsx, search
        "classDraftForRow"/"toggleDraftClass") — regroup flat checkbox list
        to mirror the tree (group headers per top-level department), value
        stored is still the leaf `en`.
  - [ ] Guardian signup dropdown (`client/src/pages/guardian/GuardianLogin.tsx`
        or wherever the signup class-picker lives — grep "getPublicClassOptions").
  - [ ] Any class-label lookups for lists/filters/reports currently using
        `classOptions.find(...).bn` — switch to `classTreeLabel(classTree, en)`
        from `client/src/lib/classTree.ts` so labels resolve for tree-based
        values (Income filter, Attendance, Reports, Students list column).
  - [ ] Run `npm run check`, fix everything it flags, re-run until clean.

### নোট
- Storage decision (approved): a student's `class` field still stores a
  single leaf `en` string, exactly as before — no schema change, no
  students.class migration. Old demo/legacy `class` text values are
  intentionally NOT auto-matched into the new tree (user will replace demo
  data separately) — `classTreeLabel()` falls back to showing the raw
  stored string for anything not found in the tree, so old records don't
  break, they just won't get the pretty composite label.
- User explicitly said data loss on the old `dept` field/old tenant data is
  fine — free to restructure `dept` handling in Part 2B rather than keep it
  a separate manually-set field.
- User declined adding "মহিলা বিভাগ" as a top-level department now (add
  later) — the tree editor still supports adding new top-level departments
  in general (button `t.settings.classTreeAddTopLevel`), just don't seed a
  new one by default.
- Design System rule (AGENTS.md) applies to all of Part 2B too: no
  `style={{...}}` on native elements outside `components/ui/` — use `.ds-*`
  classes or add a new named class to `index.css`.

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

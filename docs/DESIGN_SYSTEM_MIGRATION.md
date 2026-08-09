# Design system migration — backlog

See `AGENTS.md` → "Design System (mandatory)" for the rule and why it's
enforced by lint. This file tracks the one-time cleanup of files that
predate the rule.

The lint rule only fails on **new** `style={{...}}` on a native element —
it does not retroactively fail the whole build for existing inline styles,
or every module would be red at once. This list is the backlog for cleaning
those up over time, roughly in order of impact (highest occurrence count /
most-used screens first).

**How to update this file:** when a task migrates a file below to the
design system, move it to "Done" with the date, and update its count if a
task partially migrates it (touches the file for an unrelated reason and
cleans up what it touched, per the "Migration status" note in AGENTS.md).

## Done

- `components/StatCard.tsx` — fully migrated (1 documented dynamic-color
  exception remains: per-instance icon tint)
- `components/RecordCard.tsx` — fully migrated (0 inline styles)
- `components/ConfirmModal.tsx` — fully migrated (0 inline styles)
- `modules/Reports.tsx` — fully migrated (2 documented dynamic-color
  exceptions remain: per-report accent color)
- `modules/Students.tsx` — fully migrated, 114 → 10 (remaining 10 are
  small structural flex/layout groupings using CSS vars, not hex colors —
  low priority, not a design-consistency issue)
- `modules/Settings.tsx` — fully migrated, 105 → 16 (13 of the 16 are
  sizing props passed to `<Input>`/`<Select>`/`<Button>` — already
  lint-exempt since those are components/ui/ primitives, not native
  elements; the remaining 3 are documented dynamic-color exceptions:
  brand-color swatch, per-role user-row tint)
- Base CSS added for `.modal-backdrop` / `.modal-content` (was previously
  duplicated as inline style in every modal, e.g. `Students.tsx`'s student
  detail modal, `ReceiptModal.tsx`) — new modals should use the class only
- Generic layout utilities added (`.row`, `.row--gap-8`/`--gap-10`,
  `.mt-8`/`.mt-12`, `.mb-6`/`.mb-8`/`.mb-24`, `.min-w-0`, `.form-grid`,
  `.page-header`, `.filter-bar`, `.data-table`, `.table-pagination`,
  `.detail-*`) — reusable by any module below, check `index.css` before
  inventing a new class name that might already exist.

## Backlog (raw `style={{` count as of this migration, descending)

| File | Count |
|---|---|
| `modules/WebsiteSectionEditor.tsx` | 82 |
| `modules/Income.tsx` | 73 |
| `modules/Fees.tsx` | 58 |
| `pages/Home.tsx` | 57 |
| `pages/ResultLookup.tsx` | 43 |
| `pages/Admission.tsx` | 42 |
| `pages/Notices.tsx` | 39 |
| `modules/Expenses.tsx` | 39 |
| `components/PublicHeader.tsx` | 39 |
| `pages/AdmissionApply.tsx` | 37 |
| `modules/Results.tsx` | 11 (was 36 — Part 3 of the exam-type/bulk-marks task migrated the entry-form section; the "সংরক্ষিত ফলাফল" saved-results list below was explicitly out of scope and still has its old inline styles) |
| `modules/HifzTracking.tsx` | 36 |
| `modules/AuditLogs.tsx` | 34 |
| `pages/About.tsx` | 32 |
| `modules/Attendance.tsx` | 29 |
| `modules/Website.tsx` | 28 |
| `pages/Gallery.tsx` | 27 |
| `modules/Dashboard.tsx` | 27 |
| `pages/ClassesCourses.tsx` | 25 |
| `components/ReceiptModal.tsx` | 17 |
| `components/PublicFooter.tsx` | 17 |
| `components/Sidebar.tsx` | 16 |
| `modules/AdmissionsReview.tsx` | 15 |
| `pages/Login.tsx` | 14 |
| `components/NotificationBell.tsx` | 14 |
| `pages/ResetPassword.tsx` | 13 |
| `components/ReportDateFilter.tsx` | 11 |
| `components/Skeleton.tsx` | 9 |
| `components/Topbar.tsx` | 7 |
| `pages/WebsitePreview.tsx` | 4 |
| `components/Layout.tsx` | 4 |

Small remaining counts not worth a dedicated pass on their own (1 each,
already at/near the documented-exception pattern): `components/ui/Button.tsx`
(false positive — it's in a comment), `components/ProtectedRoute.tsx`,
`components/HudSpinner.tsx`, `components/Badge.tsx` (documented dynamic
color, same as StatCard).

Pages under `pages/` are the public-facing site (About, Admission, Gallery,
Home, Notices, etc.) — these should be migrated to the same `.ds-*`
primitives where the pattern fits (buttons, form fields), but keep in mind
they're also styled by the separate "sharp-corner public site" rules
(`.page-shell *:not(button):not(.pill)` in `index.css`) — check that a
migrated element still renders correctly on the public site, not just the
admin dashboard, before considering a public page done.

## Priority note

`modules/WebsiteSectionEditor.tsx` and `modules/Income.tsx` are next up —
same treatment as Students.tsx/Settings.tsx worked well: reuse the
`components/ui/` primitives (Button, Input, Select, Textarea, Field, Card,
ReadonlyValue) for standard controls, add a handful of new named classes to
`index.css` for module-specific layout (check the "Done" list above first —
`.page-header`, `.filter-bar`, `.form-grid`, `.data-table`,
`.table-pagination` etc. are already there and reusable), and keep only
genuinely per-instance dynamic values (a runtime color, a runtime size) as
inline style with a `eslint-disable-next-line no-restricted-syntax` +
justifying comment directly above the line.

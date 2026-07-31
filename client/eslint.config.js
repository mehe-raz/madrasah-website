import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Design system enforcement — see AGENTS.md "Design System (mandatory)".
  // Native JSX elements (div, span, button, input, ...) may not take a raw
  // `style={{...}}` prop; use the primitives in src/components/ui/ (Button,
  // Input, Select, Textarea, Field, Card, ReadonlyValue) and the .ds-*/named
  // classes in src/index.css instead. This is deliberately a lint error, not
  // a convention in a doc, so it fails `npm run lint` (part of `npm run
  // check`, which every change — including one made by an AI agent — must
  // pass before it can be committed/pushed per this repo's delivery rule).
  //
  // components/ui/ itself is exempt: those files ARE the sanctioned place
  // style objects live. Genuinely dynamic per-instance values elsewhere
  // (e.g. a runtime color prop) are still allowed via a one-line
  // `eslint-disable-next-line no-restricted-syntax` with a comment
  // explaining why it can't be a static class — see StatCard.tsx or
  // Reports.tsx for the pattern.
  {
    files: ['**/*.{ts,tsx}'],
    // components/ui/** is exempt (sanctioned place for style objects), plus
    // the legacy backlog from docs/DESIGN_SYSTEM_MIGRATION.md — per AGENTS.md
    // "Design System (mandatory) / Migration status", the rule is meant to
    // fail only on *new* violations, not retroactively on pre-existing
    // inline styles. Remove a file from this list once it's migrated.
    ignores: [
      'src/components/ui/**',
      'src/modules/WebsiteSectionEditor.tsx',
      'src/modules/Income.tsx',
      'src/modules/Fees.tsx',
      'src/pages/Home.tsx',
      'src/pages/ResultLookup.tsx',
      'src/pages/Admission.tsx',
      'src/pages/Notices.tsx',
      'src/modules/Expenses.tsx',
      'src/components/PublicHeader.tsx',
      'src/pages/AdmissionApply.tsx',
      'src/modules/Results.tsx',
      'src/modules/HifzTracking.tsx',
      'src/modules/AuditLogs.tsx',
      'src/pages/About.tsx',
      'src/modules/Attendance.tsx',
      'src/modules/Website.tsx',
      'src/pages/Gallery.tsx',
      'src/modules/Dashboard.tsx',
      'src/pages/ClassesCourses.tsx',
      'src/components/ReceiptModal.tsx',
      'src/components/PublicFooter.tsx',
      'src/components/Sidebar.tsx',
      'src/modules/AdmissionsReview.tsx',
      'src/pages/Login.tsx',
      'src/components/NotificationBell.tsx',
      'src/pages/ResetPassword.tsx',
      'src/components/ReportDateFilter.tsx',
      'src/components/Skeleton.tsx',
      'src/components/Topbar.tsx',
      'src/pages/WebsitePreview.tsx',
      'src/components/Layout.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='style']",
          message:
            'Raw style={{...}} on a native element is not allowed — use a component from src/components/ui/ and/or a class from src/index.css. If this one value is genuinely dynamic per instance, add an eslint-disable-next-line with a comment explaining why (see StatCard.tsx). See AGENTS.md "Design System (mandatory)".',
        },
      ],
    },
  },
])

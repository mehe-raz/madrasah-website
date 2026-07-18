# Madrasah ERP — Developer Guide | ডেভেলপার গাইড

## Project structure | প্রজেক্ট স্ট্রাকচার

```
madrasah website/
├── client/                 # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── modules/        # Page screens: Dashboard, Students, Income, …
│   │   ├── components/     # Reusable UI: Sidebar, Layout, ReceiptModal
│   │   ├── context/        # Auth + App settings (theme, language)
│   │   ├── lib/            # API client, PDF export, permissions
│   │   ├── hooks/          # useMadrasaBranding, useMediaQuery
│   │   └── i18n/           # Bengali / English strings
│   └── public/             # PWA manifest, service worker
├── server/                 # Express API + PostgreSQL
│   ├── src/routes/         # REST endpoints per feature
│   ├── src/lib/            # Shared server helpers
│   └── sql/supabase_schema.sql  # Database schema (run once against your PostgreSQL DB)
└── docs/                   # Documentation
```

## How to run | চালানো

```bash
cd "E:\madrasah website"
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3001](http://localhost:3001)

## Where to change what | কোথায় কী পরিবর্তন করবেন


| Feature               | Frontend                                      | Backend                                       |
| --------------------- | --------------------------------------------- | --------------------------------------------- |
| Madrasa name/logo     | `Settings.tsx`, `hooks/useMadrasaBranding.ts` | `routes/settings.js`                          |
| Students              | `modules/Students.tsx`                        | `routes/students.js`                          |
| Attendance            | `modules/Attendance.tsx`                      | `routes/attendance.js`                        |
| Income / fees         | `modules/Income.tsx`                          | `routes/income.js`, `lib/incomeCategories.js` |
| Expenses              | `modules/Expenses.tsx`                        | `routes/expenses.js`                          |
| Reports (date filter) | `modules/Reports.tsx`, `lib/exportReports.ts` | `routes/reports.js`                           |
| Login / roles         | `pages/Login.tsx`, `lib/permissions.ts`       | `routes/auth.js`, `middleware/rbac.js`        |
| PWA mobile app        | `public/manifest.webmanifest`, `public/sw.js` | —                                             |


## Auth & roles | লগইন ও ভূমিকা

- First user registration creates **Super Admin** (only when no password exists in DB).
- Permissions: `client/src/lib/permissions.ts` and `server/src/middleware/rbac.js`.
- Super Admin cannot be deleted (`isProtected` flag in `users` table).

## Income categories | আয়ের ক্যাটাগরি

- Stored in `settings.incomeCategories` as JSON.
- Edit in UI: **Income → Add income → Edit categories**.
- API: `GET/PUT /api/income/categories`.

## Reports date range | রিপোর্ট তারিখ

- UI: `components/ReportDateFilter.tsx`
- Export: `exportReport(kind, format, { from, to })`
- API: `/api/reports/income?from=&to=`

## Student attendance history | ছাত্র প্রোফাইলে হাজিরা

- Saved on each attendance save: `attendance` table.
- Profile summary: `GET /api/students/:id/attendance?month=YYYY-MM`

## Mobile (PWA) | মোবাইল অ্যাপ

1. Deploy site with HTTPS (or localhost for test).
2. Chrome → menu → **Install app** / Add to Home Screen.
3. Icons: add `client/public/icon-192.png` and `icon-512.png` for best results.

## Security notes | নিরাপত্তা

- Set `JWT_SECRET` in production (see `.env.example`).
- All `/api/`* routes require login except `/api/auth/*` and `/api/health`.


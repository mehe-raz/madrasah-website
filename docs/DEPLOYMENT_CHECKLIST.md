# Deployment Checklist

## Before Upload

- Run `npm run build` from the project root.
- Set `NODE_ENV=production`.
- Set a new strong `JWT_SECRET` with at least 32 private random characters.
- Set `CLIENT_ORIGIN` to the real HTTPS website URL.
- Rotate any email app password that was used locally, then put only the new value in the server environment variables.
- Ensure `DATABASE_URL` points at your PostgreSQL instance and take regular backups (Settings → Data Backup, or `psql`/`pg_dump` directly).
- Test login, attendance save, PDF export, backup download, and delete approval after deployment.

## Single Server Deployment

- Build the frontend with `npm run build`.
- Start the app with `npm start`.
- The Express server will serve both `/api/*` and the built frontend from `client/dist`.

## Separate Frontend And Backend

- Build the frontend with `VITE_API_URL=https://api.your-domain.com/api`.
- Set backend `CLIENT_ORIGIN=https://your-frontend-domain.com`.
- Use HTTPS for both domains so secure login cookies work correctly.

## Vercel Frontend Deployment

- Keep `vercel.json` in the project root so `/login` and other frontend routes do not return 404.
- In Vercel Project Settings, use:
  - Build command: `npm run build`
  - Output directory: `client/dist`
- Add environment variable in Vercel:
  - `VITE_API_URL=https://your-backend-domain.com/api`
- Redeploy after each GitHub push.
- If login opens but does not work, the frontend is live but backend URL/env is not set correctly.

## Content-Security-Policy (CSP)

- A CSP is enforced in two places: `helmet()` in `server/src/index.js` (applies when Express serves the frontend directly) and the `headers` block in `client/vercel.json` / root `vercel.json` (applies when Vercel serves the static build).
- Both already allow: same-origin scripts/styles, Google Fonts, Cloudinary images, and any `https://*.onrender.com` backend.
- If your backend API is hosted somewhere other than Render (a custom domain, Railway, Fly.io, etc.), add that exact origin to `connect-src` in **both** places above, or `fetch()` calls from the frontend to the API will be blocked by the browser.
- After changing the CSP, always retest login, attendance save, image upload, and PDF/report export — a missed domain shows up as a silent network failure in the browser console, not a visible error in the UI.

## Guardian Portal Go-Live (Step 6)

Before enabling the Guardian Portal for real parents, run through this
manually — `npm run check` is a syntax/type/build gate, not a full test
suite (see AGENTS.md), so it will not catch a scoping mistake below.

- **Teacher class-scoping is now assigned from Settings → Users → Classes**
  (Super Admin/Admin only). A Teacher with no classes assigned sees an empty
  list everywhere (attendance, results, assignments) rather than every
  class — assign classes before asking a teacher to start using the portal.
- **Manually verify isolation, not just permissions:**
  - Log in as a Teacher assigned to Class A only. Confirm the attendance
    sheet, results screen, and assignments feed only ever show Class A —
    try switching the `class`/`studentId` query params directly in the
    browser network tab to confirm the server rejects Class B, not just
    that the UI hides it.
  - Log in as a Guardian linked to one child. Confirm `/api/guardian-auth/*`
    responses never include another family's attendance, results, or
    class-post feed even when a studentId is guessed in the URL.
- **Guardian signup approval queue**: confirm Settings → Pending Guardian
  Approvals actually shows a pending signup end-to-end (2-field match) and
  that login is refused until an Admin approves it.
- **Audit log**: `guardian.signup_active` / `guardian.signup_pending`,
  `guardian.login`, `guardian.account_locked`, `guardian.child_link_*`,
  `class_post.created` / `class_post.deleted`, and `user.classes_updated`
  should all show up in Audit Logs as the above steps are exercised.
- **Load check**: with a class of ~40+ students and a handful of guardians
  per class, confirm the assignments feed and dashboard endpoints
  (`GET /api/guardian-auth/dashboard`, `GET /api/guardian-auth/feed`) stay
  fast — they're not paginated beyond the existing `LIMIT 200`/`LIMIT 30`
  caps in `lib/classPosts.js`/`lib/guardianData.js`, so a very large class
  post history is the one case worth watching.
- **Rollout**: there is currently no feature flag gating the Guardian
  Portal routes (`/api/guardian-auth`, `/api/guardian-approvals`) or the
  `/api/assignments` class-broadcast routes — they are mounted
  unconditionally in `server/src/index.js`, same as every other module. If
  a staged rollout across institutions is needed later, the
  `MULTI_TENANT_MODE` env-flag pattern already in `index.js` is the
  precedent to follow — this was deliberately left out of Step 6 rather
  than added retroactively, since flipping a default to "off" here could
  silently take down a portal already in use.


- Do not commit `.env`, `server/data`, `.db`, or backup files.
- Use the Settings backup screen to configure local or Google Drive synced backup folders.
- Render Free instances do not provide permanent local database storage. For production data, use a persistent disk and set `DATA_DIR` to that disk path, or restore from a downloaded `.db` backup after a reset.
- Super Admins can restore a downloaded backup from Settings -> Backup -> Restore backup database.

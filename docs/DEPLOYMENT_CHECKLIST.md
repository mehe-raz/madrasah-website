# Deployment Checklist

## Before Upload

- Run `npm run build` from the project root.
- Set `NODE_ENV=production`.
- Set a new strong `JWT_SECRET` with at least 32 private random characters.
- Set `CLIENT_ORIGIN` to the real HTTPS website URL.
- Rotate any email app password that was used locally, then put only the new value in the server environment variables.
- Keep `server/data/madrasah.db` outside public web folders and include it in backups.
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

## Data Safety

- Do not commit `.env`, `server/data`, `.db`, or backup files.
- Use the Settings backup screen to configure local or Google Drive synced backup folders.
- Render Free instances do not provide permanent local database storage. For production data, use a persistent disk and set `DATA_DIR` to that disk path, or restore from a downloaded `.db` backup after a reset.
- Super Admins can restore a downloaded backup from Settings -> Backup -> Restore backup database.

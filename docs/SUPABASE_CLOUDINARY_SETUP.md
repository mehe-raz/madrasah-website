# Supabase PostgreSQL + Cloudinary Setup

## Current Target Architecture

- Frontend: Vercel
- Backend: Render
- Database: Supabase PostgreSQL
- Images: Cloudinary

## 1. Supabase Project

1. Go to Supabase dashboard.
2. Create a new project.
3. Save the database password safely.
4. Open SQL Editor.
5. Run `server/sql/supabase_schema.sql`.
6. Go to Project Settings -> Database -> Connect.
7. Copy the pooled PostgreSQL connection string.

Use the pooled connection string for Render:

```text
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres
```

Do not put `DATABASE_URL` in Vercel because it is a backend secret.

## 2. Render Backend Environment

Add these environment variables in Render:

```text
NODE_ENV=production
JWT_SECRET=your-strong-32-plus-character-secret
CLIENT_ORIGIN=https://jamia-tajdidul-iman-madrasah.vercel.app
DATABASE_URL=your-supabase-pooled-postgres-url
INITIAL_ADMIN_NAME=Super Admin
INITIAL_ADMIN_EMAIL=your-admin-email
INITIAL_ADMIN_PASSWORD=your-strong-admin-password
ENABLE_PUBLIC_SETUP=false
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

After saving env variables, run Manual Deploy -> Deploy latest commit.

## 3. Vercel Frontend Environment

Add this environment variable in Vercel:

```text
VITE_API_URL=https://madrasah-website.onrender.com/api
```

After saving, redeploy with existing build cache disabled.

## 4. Cloudinary

1. Go to Cloudinary dashboard.
2. Copy Cloud name, API Key, and API Secret.
3. Add them to Render only.
4. For direct browser uploads, create an unsigned upload preset from Settings -> Upload.
5. Keep signed/server uploads for sensitive images.

## 5. Database

This project runs entirely on PostgreSQL via `DATABASE_URL` (`server/src/db.js` uses `pg`, not SQLite). The migration described here is already complete — no `better-sqlite3` code remains. Run `server/sql/supabase_schema.sql` once against a fresh database to create the schema.


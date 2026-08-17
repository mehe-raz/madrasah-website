require("dotenv").config({ quiet: true });

// Error monitoring (optional): initialized before any other require() so it
// can catch errors thrown during startup too. No-ops completely when
// SENTRY_DSN is unset (local/dev/CI), so this is safe to leave in without a
// Sentry account — see .env.example for how to enable it.
const Sentry = require("@sentry/node");
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.1,
});

function validateEnv() {
  console.log(`Booting NODE_ENV=${process.env.NODE_ENV || "undefined"}`);
  console.log(`PORT=${process.env.PORT || "10000 (default)"}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set" : "MISSING"}`);
  console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? `set (${process.env.JWT_SECRET.length} chars)` : "MISSING"}`);

  if (process.env.NODE_ENV !== "production") return;

  const missing = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) missing.push("JWT_SECRET (32+ chars)");
  if (missing.length) {
    throw new Error(`Missing or invalid production env: ${missing.join(", ")}. Add them in Render Dashboard → Environment.`);
  }
  if (!process.env.CLIENT_ORIGIN) {
    console.warn("CLIENT_ORIGIN not set — CORS will only allow *.vercel.app origins");
  }
}

try {
  validateEnv();
} catch (err) {
  console.error("Server startup failed:", err.message);
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const db = require("./db");
const { requireAuth, validateAuthConfig } = require("./middleware/auth");
const { validatePlatformAuthConfig } = require("./middleware/platformAuth");
const { rbacMiddleware } = require("./middleware/rbac");
const tenantResolve = require("./middleware/tenantResolve");
const { issueCsrfToken, verifyCsrfToken } = require("./middleware/csrf");

validateAuthConfig();
validatePlatformAuthConfig();

const PORT = process.env.PORT || 10000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
const allowedOrigins = (CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.hostname.endsWith(".vercel.app")) return true;
    const rootDomain = (process.env.PLATFORM_ROOT_DOMAIN || "").toLowerCase();
    if (rootDomain) {
      const host = parsed.hostname.toLowerCase();
      // Accept the root domain itself and any subdomain of it
      // (tenant-a.oriluxbd.com, www.oriluxbd.com, oriluxbd.com, ...).
      if (host === rootDomain || host.endsWith(`.${rootDomain}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

app.set("trust proxy", 1);

// Explicit CSP allow-list instead of helmet's defaults: locks script/object
// execution down to same-origin only, and only opens img/font/connect-src
// for the specific third-party hosts this app actually talks to (Google
// Fonts for the Bengali font, Cloudinary for uploaded photos/documents,
// Google's own domains for Drive-backup avatars). Anything not listed here
// is blocked by the 'self'/'none' fallback, which is the point.
// If you deploy the backend API on its own domain (see
// docs/DEPLOYMENT_CHECKLIST.md, e.g. Render), that origin is already covered
// below via https://*.onrender.com and CLIENT_ORIGIN's allowedOrigins.
const cspConnectSrc = [
  "'self'",
  "https://*.onrender.com",
  "https://res.cloudinary.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  ...allowedOrigins,
];

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React sets inline `style` attributes at runtime, so style-src needs
        // 'unsafe-inline'; Google Fonts' stylesheet link needs its own host.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.googleusercontent.com"],
        connectSrc: cspConnectSrc,
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(process.env.NODE_ENV === "production" ? { upgradeInsecureRequests: [] } : {}),
      },
    },
  })
);
// Gzip-compress every response. JSON payloads (student lists, dashboard
// aggregates, reports) typically shrink by 70-90%, which directly speeds up
// "page data loading" over slower mobile connections.
app.use(compression());

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error("CORS blocked for this origin"));
    },
    credentials: true,
  })
);

app.use(cookieParser());
// Defense-in-depth CSRF protection (double-submit cookie) — see
// middleware/csrf.js. issueCsrfToken just sets a readable cookie, so it's
// safe to run globally before routes; verifyCsrfToken (the actual check) is
// only applied to the authenticated /api chain below, after requireAuth.
app.use(issueCsrfToken);
app.use(express.json({ limit: "6mb" }));

// Resolves which institution (tenant_xxx schema) this request belongs to
// and scopes every DB call made for the rest of the request to it — must
// run before auth (login itself queries the tenant's users table) and
// before the "public" endpoints below (they read that tenant's site
// content/settings, not a global one). No-op unless MULTI_TENANT_MODE=true;
// see middleware/tenantResolve.js.
app.use(tenantResolve);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many attempts" },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
});

// Tighter than apiLimiter: this endpoint is public and unauthenticated, so
// it's the one most exposed to spam/abuse from the open internet.
const admissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

app.use("/api/auth", authLimiter, require("./routes/auth"));

// Guardian Portal — Step 2, Part 1 (self-signup + login). Mounted the same
// way as /api/auth just above: after tenantResolve (so each institution's
// guardians are scoped to that institution's schema) but before the staff
// requireAuth/rbac chain below, since a guardian isn't logged in yet when
// hitting these two routes. guardianAuth.js applies its own limiters
// per-route, same pattern as routes/auth.js.
app.use("/api/guardian-auth", require("./routes/guardianAuth"));

// Fingerprint/card attendance-device API (docs/ATTENDANCE_DEVICE_PLAN.md,
// Phase 2) — a device has no staff JWT, so this is mounted here (after
// tenantResolve, before the staff requireAuth/rbac chain below) and
// authenticates itself with deviceId+secretKey instead. See
// routes/deviceAttendance.js's header comment for why no tenantResolve
// isSkippedPath() entry is needed (this route DOES belong to a tenant,
// resolved the normal Host-based way, same as /api/guardian-auth above).
app.use("/api/device", require("./routes/deviceAttendance"));

// Bridge-free ADMS attendance-device ingestion
// (docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 2) — mounted
// at the bare top-level /iclock path (not /api), matching the fixed path
// real ADMS device firmware sends to (an admin can only configure a server
// IP/port on the device itself, never a path/subdomain — see the plan
// doc's section 3.1/3.2). deviceId-scoped tenant routing happens INSIDE
// this router (registry.device_registry lookup, routes/deviceIngest.js),
// not via tenantResolve.js/Host header, so this deliberately sits outside
// both tenantResolve (which only inspects "/api/*" paths — no
// isSkippedPath() entry needed here) and the requireAuth/rbac chain below.
app.use("/iclock", require("./routes/deviceIngest"));


// Platform/Super-Admin panel (Part 5) — talks only to the registry schema,
// never a tenant_xxx schema, so it's mounted here (before the tenant
// requireAuth/rbac chain below) with its own auth (middleware/platformAuth.js,
// requirePlatformAuth is applied inside routes/platform.js itself). Already
// excluded from tenant resolution by tenantResolve's isSkippedPath().
app.use("/api/platform", require("./routes/platform"));

// Public self-signup (Step 2) — same "control plane, not a tenant" reasoning
// as /api/platform above: it only ever creates a registry row + a brand new
// tenant_xxx schema, never reads/writes an existing one, so no tenant
// resolution or tenant auth applies here. Already excluded from tenant
// resolution by tenantResolve's isSkippedPath(). NOTE: mounted with no
// blanket rate limiter here (unlike /api/auth above) because /api/public/*
// already hosts unrelated, differently-limited routes (site-content,
// settings, admissions, results — registered further below); publicSignup.js
// applies its own limiter to just its /signup route instead.
app.use("/api/public", require("./routes/publicSignup"));

// Static Super-Admin panel UI (plain HTML/JS, no build step — see
// server/public-platform/). Served directly by this Express app so it works
// the same in dev and production, independent of the client's Vite build.
app.use("/platform", express.static(path.join(__dirname, "..", "public-platform")));

// ----------------------------------------------------------------------------
// Public marketing site (Step 3) — served instead of the client SPA when a
// visitor's Host is the bare apex root domain (yourapp.com / www.yourapp.com),
// same PLATFORM_ROOT_DOMAIN env var tenantResolve.js and isAllowedOrigin
// above already use. Any subdomain (abc.yourapp.com) or custom domain still
// falls through unchanged to the tenant SPA further below — this only
// intercepts the bare apex, and only GET requests, and never /api/* or
// /platform/* (those are matched by earlier app.use()s above and never
// reach this middleware for those paths in the first place... but path is
// still checked defensively here in case route order ever changes).
// No-op (next() immediately) unless PLATFORM_ROOT_DOMAIN is set, so a
// single-tenant deployment without it configured is completely unaffected.
// ----------------------------------------------------------------------------
const marketingDist = path.join(__dirname, "..", "public-marketing");
const marketingStatic = express.static(marketingDist, { index: false });

function isApexHost(hostname) {
  const rootDomain = (process.env.PLATFORM_ROOT_DOMAIN || "").toLowerCase();
  if (!rootDomain) return false;
  const host = (hostname || "").toLowerCase();
  return host === rootDomain || host === `www.${rootDomain}`;
}

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/platform")) return next();
  if (!isApexHost(req.hostname)) return next();

  marketingStatic(req, res, (err) => {
    if (err) return next(err);
    // Not a static asset (js/css/etc) — serve the marketing SPA's own
    // index.html for any other apex path, same catch-all role the client
    // SPA's own index.html plays for tenant paths further below.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(marketingDist, "index.html"));
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Public, unauthenticated: powers the logged-out visitor landing page.
// Must be registered before the requireAuth chain below, same as /api/health.
app.get("/api/public/site-content", async (_req, res) => {
  const { getSiteContent } = require("./lib/siteContent");
  // NOT max-age: this same endpoint is also read by the admin
  // WebsiteSectionEditor on mount, so a timed cache could show stale
  // content there right after a save. "no-cache" still lets the browser
  // skip re-downloading the body via a 304 (Express's default weak ETag
  // handles that) but always revalidates with the server first — same
  // bandwidth savings, no risk of showing outdated data anywhere.
  res.setHeader("Cache-Control", "no-cache");
  res.json(await getSiteContent());
});

// Public, unauthenticated: institution identity/contact info (name, logo,
// address, phone, email, footer text) for the same logged-out landing page.
// Deliberately a separate, whitelisted endpoint rather than opening up
// /api/settings — see lib/publicSettings.js for exactly which keys this
// exposes.
app.get("/api/public/settings", async (_req, res) => {
  const { getPublicSettings } = require("./lib/publicSettings");
  // Same reasoning as /api/public/site-content above: rarely changes, but
  // no-cache (not max-age) so an admin editing name/logo/contact info in
  // Settings never has to wait out a browser cache window to see it
  // reflected on the public pages.
  res.setHeader("Cache-Control", "no-cache");
  res.json(await getPublicSettings());
});

// Public, unauthenticated: static tier/feature data for the public
// /pricing marketing page (client/src/pages/Pricing.tsx). Deliberately a
// tiny read-only mirror of config/planFeatures.js rather than hand-copied
// data in the client — this is display-only content (no per-institution
// data, no auth needed), so it doesn't go through the tenant-scoped
// GET /api/plan (routes/plan.js) at all.
app.get("/api/public/plan-tiers", (_req, res) => {
  const { PLAN_FEATURES, PLAN_ORDER, FEATURE_META } = require("./config/planFeatures");
  res.setHeader("Cache-Control", "no-cache");
  res.json({ planFeatures: PLAN_FEATURES, planOrder: PLAN_ORDER, featureMeta: FEATURE_META });
});

// Public, unauthenticated: the tenant's class/jamaat master list, so the
// logged-out admission-apply page (AdmissionApply.tsx) can offer the same
// dropdown options as the authenticated admission form instead of a
// separately-maintained list. Managed by Super Admin under Settings; see
// lib/classOptions.js and routes/classOptions.js.
app.get("/api/public/class-options", async (_req, res) => {
  const { getClassOptions } = require("./lib/classOptions");
  res.setHeader("Cache-Control", "no-cache");
  res.json(await getClassOptions());
});

// Public, unauthenticated: same reasoning as /api/public/class-options
// above, but for the new hierarchical বিভাগ -> গ্রুপ/নেসাব -> জামাত tree
// (lib/classTree.js, routes/classTree.js). Kept as a separate endpoint
// rather than replacing class-options so both can coexist during the
// Part 2 frontend rollout.
app.get("/api/public/class-tree", async (_req, res) => {
  const { getClassTree } = require("./lib/classTree");
  res.setHeader("Cache-Control", "no-cache");
  res.json(await getClassTree());
});

// robots.txt / sitemap.xml — generated per-request (not static files) so the
// Sitemap directive and every <loc> below use the actual request host. That
// matters here because each tenant is reachable on its own subdomain/custom
// domain (see middleware/tenantResolve.js) — a single static file couldn't
// point at the right host for all of them. Only the public marketing routes
// (INDEXABLE_PUBLIC_PATHS) are listed; admin/auth-gated paths are excluded
// via Disallow below instead, matching the noindex default in
// lib/seoMeta.js for any path outside PUBLIC_ROUTES.
app.get("/robots.txt", (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /login",
      "Disallow: /reset-password",
      "Disallow: /website/preview",
      "Disallow: /students",
      "Disallow: /attendance",
      "Disallow: /income",
      "Disallow: /fees",
      "Disallow: /expenses",
      "Disallow: /hifz",
      "Disallow: /results",
      "Disallow: /reports",
      "Disallow: /website",
      "Disallow: /admissions",
      "Disallow: /settings",
      "Disallow: /audit-logs",
      "Disallow: /api/",
      "",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n")
  );
});

app.get("/sitemap.xml", (req, res) => {
  const { INDEXABLE_PUBLIC_PATHS } = require("./lib/seoMeta");
  const origin = `${req.protocol}://${req.get("host")}`;
  const urls = INDEXABLE_PUBLIC_PATHS.map(
    (p) => `  <url><loc>${origin}${p}</loc></url>`
  ).join("\n");
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
});

// Public, unauthenticated: the "ভর্তি" (admission) form on the marketing
// site submits here directly — no login exists yet at that point in the
// visitor's journey. Rate-limited harder than the general API since it's
// a write endpoint reachable by anyone.
app.post("/api/public/admissions", admissionLimiter, async (req, res) => {
  const { createAdmission } = require("./lib/admissions");
  try {
    const row = await createAdmission(req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Submission failed" });
  }
});

// Public, unauthenticated: powers the "ফলাফল দেখুন" (Result Lookup) page.
// Read-only and scoped tightly in lib/results.js (exact class+roll match,
// published rows only, no personal data beyond name/roll/class/marks) — but
// still rate-limited like admissions since it's open to the internet.
const resultLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

app.get("/api/public/results", resultLookupLimiter, async (req, res) => {
  const { searchPublicResult } = require("./lib/results");
  try {
    res.json(await searchPublicResult(req.query));
  } catch (err) {
    res.status(500).json({ error: "লুকআপ ব্যর্থ হয়েছে" });
  }
});

// Google's OAuth redirect lands the browser here as a top-level, cross-
// origin navigation (it goes to GOOGLE_DRIVE_REDIRECT_URI, one fixed host
// registered in Google Cloud Console — never the tenant subdomain the admin
// is actually logged into), so it never carries the tenant's "token"
// cookie. That used to mean this request fell through to the global
// requireAuth chain just below, which replied 401 {"error":"Login
// required"} before routes/backup.js's own callback handler — which
// re-derives identity from the signed `state` param instead of a cookie —
// ever got a chance to run. Registering it here, before that chain, is what
// actually fixes that; see routes/backup.js's googleCallbackHandler for the
// full explanation and the identity re-verification logic.
app.get("/api/backup/google/callback", require("./routes/backup").googleCallbackHandler);

// Google Cloud Scheduler's trigger for the daily automatic backup (see the
// big comment above cronRunHandler in routes/backup.js for why this exists
// and why it's free). It calls in from outside with a shared secret, never
// a browser session, so it's registered here — before requireAuth — same
// reasoning as the Google OAuth callback just above. It authenticates
// itself (BACKUP_CRON_SECRET) and, for multi-tenant deployments, resolves
// every tenant internally, so it's also excluded from the automatic
// per-request tenant resolution in tenantResolve.js's isSkippedPath().
app.post("/api/backup/cron-run", require("./routes/backup").cronRunHandler);

app.use("/api", apiLimiter, requireAuth, verifyCsrfToken, rbacMiddleware);

app.use("/api/students", require("./routes/students"));
app.use("/api/attendance", require("./routes/attendance"));
// Admin device management for attendance_devices (Phase 2) — the device's
// own public-facing endpoint is /api/device above, mounted before this
// authenticated chain; this one is the staff-facing CRUD side.
app.use("/api/attendance-devices", require("./routes/attendanceDevices"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/income", require("./routes/income"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/hifz", require("./routes/hifz"));
app.use("/api/results", require("./routes/results"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/plan", require("./routes/plan"));
app.use("/api/class-options", require("./routes/classOptions"));
app.use("/api/class-tree", require("./routes/classTree"));
app.use("/api/users", require("./routes/users"));
// docs/STAFF_ATTENDANCE_PLAN.md, Phase 2/3 — staff registry + staff
// attendance. Mounted near /api/users since staff.userId optionally links
// to a users row, but this is a separate router/permission, not a
// sub-route of users.js.
app.use("/api/staff", require("./routes/staff"));
app.use("/api/staff-attendance", require("./routes/staffAttendance"));
app.use("/api/guardian-approvals", require("./routes/guardianApprovals"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/delete-requests", require("./routes/deleteRequests"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/audit-logs", require("./routes/auditLogs"));
app.use("/api/backup", require("./routes/backup"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/site-content", require("./routes/siteContent"));
app.use("/api/admissions", require("./routes/admissions"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/sms", require("./routes/sms"));
app.use("/api/payment-gateway", require("./routes/paymentGateway"));
// Own-phone/SIM bulk SMS gateway connect settings
// (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 2) — separate, parallel
// system from /api/sms's paid-reseller wallet flow above.
app.use("/api/own-sms-gateway", require("./routes/ownSmsGateway"));
// Own-SIM bulk SMS contact list (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md
// Phase 3) — the broadcast-send endpoint itself lives under /api/sms
// (routes/sms.js's POST /broadcast, extended in this same Phase), not here.
app.use("/api/sms-contacts", require("./routes/smsContacts"));
// Institution self-service platform-subscription billing (ad-hoc,
// docs/CURRENT_TASK.md) — reverse money direction from the line above
// (institution -> platform, not guardian -> institution).
app.use("/api/institution-billing", require("./routes/institutionBilling"));
app.use("/api/guardian-reminders", require("./routes/guardianReminders"));

// Reports any error thrown/passed to next() by the routes above to Sentry
// (no-op when SENTRY_DSN is unset, same as Sentry.init above) — must be
// registered after all routes and before any other error-handling
// middleware so it sees the original error.
Sentry.setupExpressErrorHandler(app);

// Final JSON error handler for every /api/* route. Without this, any error
// thrown/rejected inside a route handler (a bad DB type coercion, a unique-
// constraint violation, anything not already caught and turned into a clean
// res.status(...).json({error}) by the route itself) fell through to
// Express's DEFAULT error handler, which renders an HTML error page, not
// JSON. The client's api.ts does `await res.json().catch(() => ({}))` on a
// non-ok response — parsing that HTML page as JSON always fails, so every
// single one of these came back to the user as a bare "HTTP 500" with the
// underlying reason invisible, on every data-entry screen (attendance,
// hifz, income, expenses, etc.) alike. This restores an ordinary JSON body
// so callers get *some* usable message, and logs the real error server-side
// for diagnosis. Mounted after all routes/Sentry so it only ever sees
// errors nothing else has already handled.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);

  // Common Postgres error codes worth a clean, specific Bangla message
  // instead of a generic 500 — these are caller mistakes (bad input shape),
  // not server failures, so 400 is the honest status code.
  if (err?.code === "22P02" || err?.code === "23502") {
    return res.status(400).json({ error: "প্রদত্ত তথ্যের ফরম্যাট সঠিক নয়। আবার চেষ্টা করুন।" });
  }
  if (err?.code === "23505") {
    // TEMP DIAGNOSTIC (remove once the real cause is confirmed): a normal,
    // legitimate insert (new income entry, new expense, new attendance row)
    // should never collide — if this fires on routine use rather than an
    // actual duplicate, it's almost certainly the "id" identity sequence
    // being out of sync with existing rows (see db.js's OVERRIDING SYSTEM
    // VALUE seed inserts, which never call setval() afterward), not a real
    // "this already exists". err.detail names the exact column/value so we
    // can tell which case it is instead of guessing.
    console.error("23505 detail:", err.detail, "| constraint:", err.constraint, "| table:", err.table);
    return res.status(409).json({
      error: "এই তথ্য সংরক্ষণে সমস্যা হয়েছে (ডুপ্লিকেট)।",
      _debugDetail: err.detail || null,
      _debugConstraint: err.constraint || null,
    });
  }
  if (err?.code === "23503") {
    return res.status(400).json({ error: "সংশ্লিষ্ট তথ্য পাওয়া যায়নি।" });
  }
  if (err?.code === "42P10") {
    // "no unique or exclusion constraint matching the ON CONFLICT
    // specification" — an upsert route (e.g. attendance) hit a database
    // that's missing the unique index it needs. sql/supabase_schema.sql
    // now creates that index defensively on every boot, so this should be
    // self-healing after the next deploy/restart; surfaced as a clear
    // message in the meantime instead of a bare 500.
    return res.status(500).json({ error: "ডাটাবেজ কনফিগারেশন সমস্যা — সার্ভার পুনরায় চালু করার পর এটি ঠিক হয়ে যাবে। সমস্যা থাকলে অ্যাডমিনের সাথে যোগাযোগ করুন।" });
  }

  res.status(err.status || err.statusCode || 500).json({
    error: err.expose ? err.message : "সার্ভারে একটি সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
  });
});

if (process.env.NODE_ENV === "production") {
  const fs = require("fs");
  const { buildSeoMeta, injectSeoMeta } = require("./lib/seoMeta");
  // Read once at boot — dist/index.html is a build artifact that never
  // changes without a redeploy (which restarts this process anyway), so
  // there's no point re-reading it from disk on every request.
  const indexHtmlTemplate = fs.readFileSync(path.join(clientDist, "index.html"), "utf8");

  app.use(
    express.static(clientDist, {
      // Vite fingerprints JS/CSS/image chunk filenames with a content hash,
      // so once a hashed asset is served it can never change — cache it
      // "forever" in the browser. index.html itself is NOT hashed, so it
      // must never be cached (must always revalidate) or users get stuck
      // on an old app shell after a deploy.
      //
      // Without this, express.static's own default ("/" → serve
      // index.html straight off disk) would intercept every request to
      // "/" before it ever reached the catch-all below, so the home page
      // — the single most-shared/most-crawled URL on the whole site —
      // would never get its per-route SEO meta injected. Turning it off
      // routes "/" (and every other path) through the catch-all instead.
      index: false,
      setHeaders(res, filePath) {
        // Only Vite's content-hashed chunks (dist/assets/*.js|css|...,
        // filename changes whenever content changes) are safe to cache
        // "forever". Every other file copied verbatim from client/public/
        // — index.html, sw.js, manifest.webmanifest,
        // guardian-manifest.webmanifest, manifest-select.js, icon.svg,
        // reload-splash.js, etc. — keeps the SAME filename across deploys,
        // so it must always revalidate. This matters most for sw.js: an
        // immutable-cached service worker file means a guardian's browser
        // never even asks the server about a new sw.js (e.g. one that adds
        // the push listener), silently running a stale SW indefinitely —
        // this was the actual root cause of "server sends the push
        // successfully but nothing ever shows on the phone" (2026-08-08).
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );
  app.get(/.*/, async (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    try {
      const { getPublicSettings } = require("./lib/publicSettings");
      const { getSiteContent } = require("./lib/siteContent");
      const origin = `${req.protocol}://${req.get("host")}`;

      const fetchMeta = async () => {
        const [site, content] = await Promise.all([getPublicSettings(), getSiteContent()]);
        return buildSeoMeta(req.path, site, content, origin);
      };

      // tenantResolve (registered above) only runs for /api/* paths, so this
      // route — unlike /api/public/settings & /api/public/site-content — is
      // never given a resolved tenant automatically. In multi-tenant mode,
      // resolve the same Host-derived tenant an API call from this same
      // page would get, using the exact logic tenantResolve.js itself uses,
      // so the injected title/description/logo are the visiting
      // institution's own, not whichever schema happens to be default.
      let meta;
      if (process.env.MULTI_TENANT_MODE === "true") {
        const { extractTenantCode, withTenantByCode } = require("./middleware/tenantResolve");
        const code = extractTenantCode(req);
        meta = code ? await withTenantByCode(code, fetchMeta) : buildSeoMeta(req.path, {}, {}, origin);
      } else {
        meta = await fetchMeta();
      }

      res.type("html").send(injectSeoMeta(indexHtmlTemplate, meta));
    } catch (err) {
      // SEO injection is a nice-to-have on top of the app shell, not a
      // dependency of it — a DB hiccup here should never break navigation.
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

// Background jobs (registry schema init, billing's auto-suspend sweep below)
// and any other async code that runs outside a request never passes through
// Sentry.setupExpressErrorHandler above, so catch those here too.
process.on("unhandledRejection", (err) => Sentry.captureException(err));
process.on("uncaughtException", (err) => Sentry.captureException(err));

async function start() {
  try {
    await db.init();
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Madrasah ERP API running on port ${PORT}`);
  });

  // Guardian Reminder Messenger (ad-hoc) — periodic auto-dispatch sweep for
  // 'daily'/'specificDate' reminders. Unlike billing's registry job below,
  // this belongs to the core single-tenant schema db.init() just created
  // above, so it starts right away rather than waiting on the optional
  // multi-tenant registry init. See guardianReminderScheduler.js.
  require("./guardianReminderScheduler").startGuardianReminderJob();

  // registry.* (Part 5/6 — platform/Super-Admin panel: institutions,
  // platform_admins incl. its `role` column, audit_logs, payments) still
  // needs its schema created/migrated on boot (see initRegistrySchema),
  // but that must never (a) delay the app from accepting normal requests,
  // or (b) crash the whole app if it fails — this is an OPTIONAL feature
  // for the multi-tenant Super-Admin panel, completely separate from the
  // core single-tenant app that every institution's login/logout/public
  // site depends on. Previously this was awaited before app.listen() and
  // shared db.init()'s process.exit(1) on failure, which meant: every
  // boot/cold-start paid its full round-trip before serving any request,
  // and any hiccup running it (permissions, a transient connection issue,
  // etc.) took the entire site down and could trigger a crash-restart
  // loop — exactly the site-wide slowness this is fixing. Now it runs in
  // the background after the server is already listening, and a failure
  // here only logs a warning; the Super-Admin panel simply stays broken
  // until it's fixed, instead of taking every tenant's app down with it.
  require("./registryDb")
    .initRegistrySchema()
    .then(() => {
      // Part 6 — periodic auto-suspend sweep for expired trials/subscriptions
      // in the (optional) multi-tenant registry. No-op cost when the registry
      // has no institutions yet, so safe to always start. See src/billing.js.
      require("./billing").startExpiryScanJob();
    })
    .catch((err) => {
      console.error(
        "[registry] schema init failed — the Super-Admin platform panel may not work until this is fixed (rest of the app is unaffected):",
        err.message
      );
    });
}

start();

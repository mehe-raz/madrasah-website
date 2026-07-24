require("dotenv").config({ quiet: true });

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
    return parsed.hostname.endsWith(".vercel.app");
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

// Platform/Super-Admin panel (Part 5) — talks only to the registry schema,
// never a tenant_xxx schema, so it's mounted here (before the tenant
// requireAuth/rbac chain below) with its own auth (middleware/platformAuth.js,
// requirePlatformAuth is applied inside routes/platform.js itself). Already
// excluded from tenant resolution by tenantResolve's isSkippedPath().
app.use("/api/platform", require("./routes/platform"));

// Static Super-Admin panel UI (plain HTML/JS, no build step — see
// server/public-platform/). Served directly by this Express app so it works
// the same in dev and production, independent of the client's Vite build.
app.use("/platform", express.static(path.join(__dirname, "..", "public-platform")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Public, unauthenticated: powers the logged-out visitor landing page.
// Must be registered before the requireAuth chain below, same as /api/health.
app.get("/api/public/site-content", async (_req, res) => {
  const { getSiteContent } = require("./lib/siteContent");
  res.json(await getSiteContent());
});

// Public, unauthenticated: institution identity/contact info (name, logo,
// address, phone, email, footer text) for the same logged-out landing page.
// Deliberately a separate, whitelisted endpoint rather than opening up
// /api/settings — see lib/publicSettings.js for exactly which keys this
// exposes.
app.get("/api/public/settings", async (_req, res) => {
  const { getPublicSettings } = require("./lib/publicSettings");
  res.json(await getPublicSettings());
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

app.use("/api", apiLimiter, requireAuth, rbacMiddleware);

app.use("/api/students", require("./routes/students"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/income", require("./routes/income"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/hifz", require("./routes/hifz"));
app.use("/api/results", require("./routes/results"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/users", require("./routes/users"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/delete-requests", require("./routes/deleteRequests"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/audit-logs", require("./routes/auditLogs"));
app.use("/api/backup", require("./routes/backup"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/site-content", require("./routes/siteContent"));
app.use("/api/admissions", require("./routes/admissions"));
app.use("/api/notifications", require("./routes/notifications"));

if (process.env.NODE_ENV === "production") {
  app.use(
    express.static(clientDist, {
      // Vite fingerprints JS/CSS/image chunk filenames with a content hash,
      // so once a hashed asset is served it can never change — cache it
      // "forever" in the browser. index.html itself is NOT hashed, so it
      // must never be cached (must always revalidate) or users get stuck
      // on an old app shell after a deploy.
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function start() {
  try {
    await db.init();
    // Part 6 — periodic auto-suspend sweep for expired trials/subscriptions
    // in the (optional) multi-tenant registry. No-op cost when the registry
    // has no institutions yet, so safe to always start. See src/billing.js.
    require("./billing").startExpiryScanJob();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Madrasah ERP API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

start();

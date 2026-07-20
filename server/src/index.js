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
const { rbacMiddleware } = require("./middleware/rbac");

validateAuthConfig();

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
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many attempts" },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
});

app.use("/api/auth", authLimiter, require("./routes/auth"));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", apiLimiter, requireAuth, rbacMiddleware);

app.use("/api/students", require("./routes/students"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/income", require("./routes/income"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/hifz", require("./routes/hifz"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/users", require("./routes/users"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/delete-requests", require("./routes/deleteRequests"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/backup", require("./routes/backup"));
app.use("/api/uploads", require("./routes/uploads"));

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

// ============================================================================
// routes/platform.js  (Part 5 / 6 — Super-Admin panel)
// ============================================================================
// API for the platform/Super-Admin panel: platform-operator login, and
// CRUD-ish control over registry.institutions (list/create/suspend/etc).
// Talks ONLY to the registry schema via registryDb.js / tenantProvision.js —
// never touches any tenant_xxx schema directly, same separation of "control
// plane" vs "data plane" that Part 1 established.
//
// Mounted in index.js BEFORE the tenant requireAuth/rbac chain, and is one
// of tenantResolve's isSkippedPath()s (middleware/tenantResolve.js already
// excludes /api/platform/*), so none of this depends on or interferes with
// MULTI_TENANT_MODE or any tenant's schema.
// ============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const registryDb = require("../registryDb");
const tenantProvision = require("../tenantProvision");
const { signPlatformToken, requirePlatformAuth, cookieOptions } = require("../middleware/platformAuth");

const router = express.Router();

// Mirrors the reasoning behind routes/auth.js's loginLimiter: IP-based,
// only failed attempts count, so normal repeated use by the (few) platform
// admins is never penalized.
const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many failed login attempts. Please try again later." },
});

function publicAdmin(row) {
  return { id: row.id, name: row.name, email: row.email };
}

router.post("/auth/login", platformLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const row = await registryDb.getPlatformAdminByEmail(email.trim().toLowerCase());
  if (!row) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = signPlatformToken(row);
  res.cookie("platform_token", token, cookieOptions);
  res.json({ admin: publicAdmin(row) });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("platform_token", cookieOptions);
  res.json({ ok: true });
});

router.get("/auth/me", requirePlatformAuth, (req, res) => {
  res.json({ admin: { id: req.platformAdmin.id, name: req.platformAdmin.name, email: req.platformAdmin.email } });
});

// Everything below requires a logged-in platform admin.
router.use(requirePlatformAuth);

router.get("/institutions", async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status && !registryDb.STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${registryDb.STATUSES.join(", ")}` });
    }
    const rows = await registryDb.listInstitutions({ status });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/institutions", async (req, res, next) => {
  try {
    const { name, code, contactName, contactPhone, plan, trialDays, adminName, adminEmail, adminPassword } =
      req.body || {};
    if (!name || !code || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "name, code, adminEmail and adminPassword are required" });
    }
    const institution = await tenantProvision.provisionInstitution({
      name,
      code,
      contactName,
      contactPhone,
      plan,
      trialDays,
      adminName,
      adminEmail,
      adminPassword,
    });
    await registryDb.logAction(institution.id, req.platformAdmin.email, "institution_created_via_panel", {
      schema: institution.schema_name,
    });
    res.status(201).json(institution);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch("/institutions/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid institution id" });
    const updated = await registryDb.updateStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Institution not found" });
    await registryDb.logAction(id, req.platformAdmin.email, "status_changed", { status });
    res.json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch("/institutions/:id/subscription", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid institution id" });
    const { plan, subscriptionEndsAt } = req.body || {};
    const updated = await registryDb.updateSubscription(id, { plan, subscriptionEndsAt });
    if (!updated) return res.status(404).json({ error: "Institution not found" });
    await registryDb.logAction(id, req.platformAdmin.email, "subscription_changed", {
      plan,
      subscriptionEndsAt,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get("/audit-logs", async (req, res, next) => {
  try {
    const institutionId = req.query.institutionId ? Number(req.query.institutionId) : undefined;
    const rows = await registryDb.listAuditLogs({ institutionId });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

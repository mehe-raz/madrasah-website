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
const migrateTenants = require("../migrateTenants");
const billing = require("../billing");
const { signPlatformToken, requirePlatformAuth, requirePlatformRole, cookieOptions } = require("../middleware/platformAuth");

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
  return { id: row.id, name: row.name, email: row.email, role: row.role || "super_admin" };
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
  res.json({
    admin: {
      id: req.platformAdmin.id,
      name: req.platformAdmin.name,
      email: req.platformAdmin.email,
      role: req.platformAdmin.role || "super_admin",
    },
  });
});

// Everything below requires a logged-in platform admin.
router.use(requirePlatformAuth);

// Global config, not tied to any single institution — currently just "how
// many days of trial does a brand-new self-signup account get" (read by
// the future public signup route). Any logged-in platform admin (including
// read-only "manager") can view it; only super_admin/admin can change it.
router.get("/settings", async (_req, res, next) => {
  try {
    const defaultTrialDays = await registryDb.getDefaultTrialDays();
    res.json({ defaultTrialDays });
  } catch (err) {
    next(err);
  }
});

router.patch("/settings/default-trial-days", requirePlatformRole("super_admin", "admin"), async (req, res, next) => {
  try {
    const { days } = req.body || {};
    const defaultTrialDays = await registryDb.setDefaultTrialDays(days);
    await registryDb.logAction(null, req.platformAdmin.email, "default_trial_days_changed", { days: defaultTrialDays });
    res.json({ defaultTrialDays });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

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

router.post("/institutions", requirePlatformRole("super_admin", "admin"), async (req, res, next) => {
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

router.patch("/institutions/:id/status", requirePlatformRole("super_admin", "admin"), async (req, res, next) => {
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

router.patch("/institutions/:id/subscription", requirePlatformRole("super_admin", "admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid institution id" });
    const { plan, subscriptionEndsAt, billingModel, priceAmount } = req.body || {};
    if (billingModel && !["student", "flat"].includes(billingModel)) {
      return res.status(400).json({ error: "billingModel must be 'student' or 'flat'" });
    }
    let parsedPrice = null;
    if (priceAmount !== undefined && priceAmount !== null && priceAmount !== "") {
      parsedPrice = Number(priceAmount);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: "priceAmount must be a non-negative number" });
      }
    }
    const updated = await registryDb.updateSubscription(id, {
      plan,
      subscriptionEndsAt,
      billingModel,
      priceAmount: parsedPrice,
    });
    if (!updated) return res.status(404).json({ error: "Institution not found" });
    await registryDb.logAction(id, req.platformAdmin.email, "subscription_changed", {
      plan,
      subscriptionEndsAt,
      billingModel,
      priceAmount: parsedPrice,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Sets or clears (send customDomain: "" or null) the domain an institution
// can be reached at instead of its <code>.rootDomain subdomain. This only
// updates the registry row that tenantResolve.js matches the request Host
// header against — it does NOT create the DNS record or the hosting
// platform's (Vercel/Render) domain entry, both of which still need to be
// done separately, once, outside this app.
router.patch("/institutions/:id/domain", requirePlatformRole("super_admin", "admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid institution id" });
    const { customDomain } = req.body || {};
    const updated = await registryDb.updateCustomDomain(id, customDomain);
    if (!updated) return res.status(404).json({ error: "Institution not found" });
    await registryDb.logAction(id, req.platformAdmin.email, "custom_domain_changed", { customDomain: updated.custom_domain });
    res.json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Permanently deletes an institution: its tenant_xxx schema (all students,
// payments, users, etc.) is dropped and its registry row removed. This is
// irreversible, so the caller must re-send the institution's own `code` as
// `confirmCode` — a simple "are you sure" isn't enough for something this
// destructive, and this mirrors the "type to confirm" pattern used for
// dangerous actions elsewhere.
router.delete("/institutions/:id", requirePlatformRole("super_admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid institution id" });

    const institution = await registryDb.getInstitutionById(id);
    if (!institution) return res.status(404).json({ error: "Institution not found" });

    const { confirmCode } = req.body || {};
    if (!confirmCode || confirmCode !== institution.code) {
      return res.status(400).json({ error: "প্রতিষ্ঠান মুছে ফেলা নিশ্চিত করতে সঠিক কোড লিখুন" });
    }

    await registryDb.deleteInstitution(id);
    // institutionId is intentionally omitted (not passed as the FK column)
    // since the row it would reference no longer exists after the delete
    // above — it's kept in `detail` instead so the log entry still shows
    // which institution this was.
    await registryDb.logAction(null, req.platformAdmin.email, "institution_deleted", {
      institutionId: id,
      name: institution.name,
      code: institution.code,
      schema: institution.schema_name,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/audit-logs", async (req, res, next) => {
  try {
    const institutionId = req.query.institutionId ? Number(req.query.institutionId) : undefined;
    const { page, limit, from, to } = req.query;
    const result = await registryDb.listAuditLogs({ institutionId, page, limit, from, to });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Billing + Migration Tooling (Part 6 / 6)
// ============================================================================

router.get("/institutions/:id/payments", async (req, res, next) => {
  try {
    const institutionId = Number(req.params.id);
    if (!Number.isInteger(institutionId)) return res.status(400).json({ error: "Invalid institution id" });
    const { page, limit, from, to } = req.query;
    const result = await registryDb.listPayments({ institutionId, page, limit, from, to });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Records a manually-confirmed payment (see sql/registry_schema.sql comment
// on registry.payments for why this isn't a live gateway integration) and
// extends/reactivates the institution's subscription in one step.
router.post("/institutions/:id/payments", async (req, res, next) => {
  try {
    const institutionId = Number(req.params.id);
    if (!Number.isInteger(institutionId)) return res.status(400).json({ error: "Invalid institution id" });
    const { amount, currency, method, reference, periodDays, note } = req.body || {};
    if (!amount) return res.status(400).json({ error: "amount is required" });
    const payment = await registryDb.recordPayment(institutionId, {
      amount: Number(amount),
      currency,
      method,
      reference,
      periodDays: periodDays ? Number(periodDays) : undefined,
      recordedBy: req.platformAdmin.email,
      note,
    });
    await registryDb.logAction(institutionId, req.platformAdmin.email, "payment_recorded", {
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      coversUntil: payment.covers_until,
    });
    res.status(201).json(payment);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Manually trigger the same sweep the background job (src/billing.js) runs
// on a schedule — useful right after changing BILLING_AUTOSUSPEND_INTERVAL_MINUTES,
// or just to see the effect immediately instead of waiting for the next tick.
router.post("/billing/expiry-scan", async (req, res, next) => {
  try {
    const suspended = await billing.runScanOnce();
    await registryDb.logAction(null, req.platformAdmin.email, "expiry_scan_triggered", {
      suspendedCount: suspended.length,
      suspended: suspended.map((i) => i.code),
    });
    res.json({ suspended });
  } catch (err) {
    next(err);
  }
});

// Lists every tenant schema currently in the registry, for the migration
// tool's "which institutions will this affect" preview before running SQL
// against all of them.
router.get("/migrations/tenants", requirePlatformRole("super_admin"), async (_req, res, next) => {
  try {
    const tenants = await migrateTenants.listTenantSchemas();
    res.json(tenants);
  } catch (err) {
    next(err);
  }
});

// Runs an arbitrary SQL statement across every tenant schema. Intentionally
// requires the operator to paste the exact SQL (no "run the latest schema
// file" shortcut) so nothing runs without the operator having read it first.
// Every attempt is written to the audit log; the full per-tenant SQL text is
// intentionally NOT stored in the log (only its length), since migration SQL
// can be long and isn't itself sensitive-but-worth-repeating information.
router.post("/migrations/run", requirePlatformRole("super_admin"), async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql || !sql.trim()) return res.status(400).json({ error: "sql is required" });
    const result = await migrateTenants.migrateAllTenants(sql);
    await registryDb.logAction(null, req.platformAdmin.email, "tenant_migration_run", {
      total: result.total,
      succeeded: result.succeeded.length,
      failed: result.failed.map((f) => ({ code: f.code, error: f.error })),
      sqlLength: sql.length,
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ============================================================================
// Platform admin management (Part 5.1 — multiple admin/manager logins)
// ============================================================================
// Lets an existing super_admin add/edit/remove other operator logins
// (super_admin / admin / manager — see sql/registry_schema.sql comment on
// registry.platform_admins for what each role can do). Restricted to
// super_admin only, since granting/revoking access to the panel itself is
// the most sensitive action here.

router.get("/admins", requirePlatformRole("super_admin"), async (_req, res, next) => {
  try {
    const rows = await registryDb.listPlatformAdmins();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/admins", requirePlatformRole("super_admin"), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }
    const admin = await registryDb.createPlatformAdmin({ name, email, password, role });
    await registryDb.logAction(null, req.platformAdmin.email, "platform_admin_created", {
      newAdminEmail: admin.email,
      role: admin.role,
    });
    res.status(201).json(admin);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch("/admins/:id", requirePlatformRole("super_admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid admin id" });
    const { name, role } = req.body || {};
    const updated = await registryDb.updatePlatformAdmin(id, { name, role });
    if (!updated) return res.status(404).json({ error: "Admin not found" });
    await registryDb.logAction(null, req.platformAdmin.email, "platform_admin_updated", {
      targetAdminId: id,
      name,
      role,
    });
    res.json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.delete("/admins/:id", requirePlatformRole("super_admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid admin id" });
    if (id === req.platformAdmin.id) {
      return res.status(400).json({ error: "নিজেকে মুছে ফেলা যাবে না" });
    }
    const deleted = await registryDb.deletePlatformAdmin(id);
    if (!deleted) return res.status(404).json({ error: "Admin not found" });
    await registryDb.logAction(null, req.platformAdmin.email, "platform_admin_deleted", {
      targetAdminId: id,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;

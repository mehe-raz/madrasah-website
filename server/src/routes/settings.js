const express = require("express");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const registryDb = require("../registryDb");
const tenantContext = require("../tenantContext");
const { getPlanFeatures } = require("../config/planFeatures");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("settings"));

async function getAllSettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// Keys this generic endpoint is allowed to write. Previously it wrote
// whatever keys were in req.body with no whitelist — since "settings" and
// "backupConfig" live in the same key/value table, that meant this route
// could silently overwrite backupConfig with an unvalidated value, bypassing
// the number-clamping and destination-path checks in routes/backup.js
// saveConfig(). backupConfig now has to go through that route instead.
const ALLOWED_KEYS = new Set([
  "name",
  "address",
  "phone",
  "email",
  "footer",
  "logo",
  "lang",
  "theme",
  "currency",
  "brandColor",
  // City/country used by the dashboard prayer-times widget (lib/prayerTimes.js)
  // to look up namaz timings. Free text (city/country names as Aladhan's API
  // expects them), not geo-coordinates — kept simple since almost every
  // institution is in one fixed, named city.
  "prayerCity",
  "prayerCountry",
]);

// brandColor is rendered straight into inline CSS on the public site (see
// client's usePublicSite), so it's validated as a strict 6-digit hex color
// here rather than accepted as free text like the other keys.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

router.get("/", async (_req, res) => {
  res.json(await getAllSettings());
});

router.put("/", async (req, res) => {
  const before = await getAllSettings();
  const applied = {};
  await db.withTransaction(async (tx) => {
    for (const [k, v] of Object.entries(req.body)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      const value = String(v);
      if (k === "brandColor" && !HEX_COLOR_RE.test(value)) continue;
      applied[k] = value;
      await tx.run(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [k, value]
      );
    }
  });
  const after = await getAllSettings();
  const changedKeys = Object.keys(applied).filter((k) => before[k] !== after[k]);
  if (changedKeys.length) {
    await recordAudit({
      action: "settings.updated",
      actor: req.user,
      entityType: "settings",
      entityId: 0,
      label: `Updated ${changedKeys.length} setting(s)`,
      details: { keys: changedKeys, values: changedKeys.reduce((acc, k) => ({ ...acc, [k]: after[k] }), {}) },
    });
  }

  // #7 fix: registry.institutions keeps its own copy of name/contact info
  // (read by the Super Admin panel) that used to never learn about changes
  // made here. No-op outside multi-tenant mode (tenantContext.get() is only
  // populated when MULTI_TENANT_MODE=true — see middleware/tenantResolve.js)
  // and deliberately best-effort: a registry sync failure must never block a
  // tenant from saving their own settings.
  const relevantChange = ["name", "email", "phone"].some((k) => changedKeys.includes(k));
  if (relevantChange) {
    const ctx = tenantContext.get();
    if (ctx?.institution) {
      try {
        await registryDb.updateInstitutionContact(ctx.institution.id, {
          name: after.name,
          contactEmail: after.email,
          contactPhone: after.phone,
        });
      } catch (err) {
        console.error("Failed to sync settings to registry.institutions:", err.message);
      }
    }
  }

  res.json(after);
});

// ============================================================================
// Plan info + self-service custom domain (Step 5/6)
// ============================================================================
// Both routes are no-ops (404) outside multi-tenant mode: a single-tenant
// deployment has no registry.institutions row / plan concept, and already
// has full freedom over its own domain via hosting config — this feature
// only makes sense once one Express app is serving many institutions.
function requireTenantContext(req, res, next) {
  const ctx = tenantContext.get();
  if (!ctx?.institution) {
    return res.status(404).json({ error: "এই ফিচারটি এই ডিপ্লয়মেন্টে উপলব্ধ নয়" });
  }
  req._institution = ctx.institution;
  next();
}

// Tells the dashboard's "ডোমেইন কানেক্ট করুন" page which plan the
// institution is on, what that plan allows, and its currently-set custom
// domain (if any) — everything the UI needs to either show the form or the
// "প্রো প্ল্যান নিন" upsell message.
router.get("/plan", requireTenantContext, (req, res) => {
  const institution = req._institution;
  res.json({
    plan: institution.plan,
    features: getPlanFeatures(institution.plan, institution.institution_type),
    customDomain: institution.custom_domain || null,
  });
});

// Lets the institution set/clear its own custom domain — the tenant-side
// counterpart to the Super-Admin-only PATCH /api/platform/institutions/:id/domain
// (routes/platform.js), which still also works (e.g. for support staff
// setting it on a tenant's behalf). Plan-gated: basic-plan institutions are
// rejected here even if they somehow bypass the frontend's lock/unlock UI —
// same "never trust the client alone" reasoning as every other permission
// check in this app. Sending customDomain: "" or null clears it.
router.put("/custom-domain", requireTenantContext, async (req, res, next) => {
  try {
    const institution = req._institution;
    const features = getPlanFeatures(institution.plan, institution.institution_type);
    if (!features.customDomain) {
      return res.status(403).json({ error: "কাস্টম ডোমেইন শুধুমাত্র প্রো প্ল্যানে উপলব্ধ। প্রো প্ল্যানে আপগ্রেড করুন।" });
    }

    const { customDomain } = req.body || {};
    const updated = await registryDb.updateCustomDomain(institution.id, customDomain);
    await recordAudit({
      action: "settings.custom_domain_updated",
      actor: req.user,
      entityType: "settings",
      entityId: 0,
      label: customDomain ? `Custom domain set to ${updated.custom_domain}` : "Custom domain cleared",
      details: { customDomain: updated.custom_domain },
    });
    res.json({ customDomain: updated.custom_domain || null });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;

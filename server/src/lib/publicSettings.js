const db = require("./../db");
const tenantContext = require("../tenantContext");

// The full `settings` table (currency, backupConfig, receipt footer text,
// etc.) is only ever readable through the auth-protected /api/settings
// route. This is a deliberately small whitelist of the identity/contact
// fields that are safe to expose to a logged-out visitor, so the public
// page can show the institution's real name/logo/address/phone/email
// instead of placeholder text — without ever risking a future settings
// field leaking publicly by accident.
const PUBLIC_KEYS = ["name", "logo", "address", "phone", "email", "footer", "brandColor"];

// Falls back to the site's current default accent (sky blue) when an
// institution hasn't picked its own brand color yet, so existing tenants
// keep looking exactly the same after this field was added.
const DEFAULT_BRAND_COLOR = "#0ea5e9";
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

async function getPublicSettings() {
  const rows = await db.all(
    `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
    [PUBLIC_KEYS]
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // docs/GENERAL_MODE_PLAN.md, Phase 7 (খোলা প্রশ্ন ৪) — the public
  // homepage's fallback institution name depends on institution type
  // (madrasah vs general), not just per-tenant `settings` (which is what
  // PUBLIC_KEYS above reads). institution_type instead lives on the
  // registry.institutions row for this request's tenant — middleware/
  // tenantResolve.js already resolves that into tenantContext for every
  // /api/public/* request (it's not in tenantResolve.js's isSkippedPath
  // list), same as routes/students.js's PDF-print route (Phase 5) reads it.
  // Falls back to "madrasah" — same default the Phase 1 DB migration and
  // MULTI_TENANT_MODE-off single-tenant deployments use — when no tenant
  // context exists (single-tenant deployment, MULTI_TENANT_MODE unset).
  const ctx = tenantContext.get();
  return {
    name: map.name || "",
    logo: map.logo || "",
    address: map.address || "",
    phone: map.phone || "",
    email: map.email || "",
    footer: map.footer || "",
    brandColor: HEX_COLOR_RE.test(map.brandColor || "") ? map.brandColor : DEFAULT_BRAND_COLOR,
    institutionType: ctx?.institution?.institution_type || "madrasah",
  };
}

module.exports = { getPublicSettings, PUBLIC_KEYS };

// ============================================================================
// routes/publicSignup.js  (Step 2 — Public self-signup API)
// ============================================================================
// One open, unauthenticated route that lets a visitor create their own
// institution account ("এক ক্লিকে অ্যাকাউন্ট খুলুন"). Internally this is
// just tenantProvision.provisionInstitution() — the exact same engine
// routes/platform.js's POST /institutions already uses — with two things
// the caller is NOT allowed to control:
//   - plan is always forced to "basic" (paid plans are sold, not
//     self-selected at signup)
//   - trialDays always comes from registryDb.getDefaultTrialDays() (the
//     global setting Step 1 added), never from the request body
//
// Mounted in index.js BEFORE the tenant requireAuth/rbac chain (same spot
// as /api/platform) and is one of tenantResolve's isSkippedPath()s, since
// this route creates a tenant rather than belonging to one.
// ============================================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const registryDb = require("../registryDb");
const tenantProvision = require("../tenantProvision");

const router = express.Router();

// This router is mounted on the shared /api/public prefix (alongside
// site-content/settings/admissions/results, each with their own limiter —
// see index.js), so the limiter lives here, scoped to just this route,
// rather than as a blanket limiter over the whole prefix. Creating a whole
// new tenant schema per successful request is by far the most expensive
// thing an anonymous visitor can trigger here, hence the tight cap.
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "একটু পরে আবার চেষ্টা করুন" },
});

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// Same shape registryDb.assertValidCode() enforces — checked again here so
// the error message can be shown right next to the form field, before any
// DB round trip.
const CODE_RE = /^[a-z][a-z0-9-]{1,30}$/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lets the marketing page's signup form show "yourcode.<real-root-domain>"
// as a live preview while typing, instead of a hardcoded guess baked into
// the static JS bundle.
router.get("/root-domain", (_req, res) => {
  res.json({ rootDomain: process.env.PLATFORM_ROOT_DOMAIN || "" });
});

router.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    const { name, code, adminName, adminEmail, adminPassword, contactPhone, institutionType } = req.body || {};

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: "প্রতিষ্ঠানের নাম আবশ্যক" });
    }
    // docs/GENERAL_MODE_PLAN.md, Phase 2 — self-signup form's "প্রতিষ্ঠানের
    // ধরন" selector. Defaults to 'madrasah' when omitted (an older/cached
    // frontend build without the selector, or a direct API call) so this
    // stays backward-compatible rather than a hard 400.
    const resolvedInstitutionType = isNonEmptyString(institutionType) ? institutionType.trim() : "madrasah";
    if (!registryDb.INSTITUTION_TYPES.includes(resolvedInstitutionType)) {
      return res.status(400).json({
        error: `প্রতিষ্ঠানের ধরন এই মানগুলোর একটি হতে হবে: ${registryDb.INSTITUTION_TYPES.join(", ")}`,
      });
    }
    const trimmedCode = typeof code === "string" ? code.trim().toLowerCase() : "";
    if (!CODE_RE.test(trimmedCode)) {
      return res.status(400).json({
        error: "সাবডোমেইন কোড ২-৩১ অক্ষরের হতে হবে, শুধু ছোট হাতের ইংরেজি অক্ষর/সংখ্যা/হাইফেন, প্রথম অক্ষর অবশ্যই ইংরেজি অক্ষর দিয়ে শুরু",
      });
    }
    if (!isNonEmptyString(adminEmail) || !EMAIL_RE.test(adminEmail.trim())) {
      return res.status(400).json({ error: "সঠিক ইমেইল ঠিকানা দিন" });
    }
    if (!isNonEmptyString(adminPassword) || adminPassword.length < 8) {
      return res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে" });
    }

    // Forced, not trusted from the request body — see header comment.
    const trialDays = await registryDb.getDefaultTrialDays();

    const institution = await tenantProvision.provisionInstitution({
      name: name.trim(),
      code: trimmedCode,
      contactName: adminName,
      contactEmail: adminEmail.trim(),
      contactPhone,
      plan: "basic",
      trialDays,
      adminName,
      adminEmail: adminEmail.trim(),
      adminPassword,
      institutionType: resolvedInstitutionType,
    });

    await registryDb.logAction(institution.id, adminEmail.trim(), "institution_self_signup", {
      schema: institution.schema_name,
      trialDays,
      institutionType: resolvedInstitutionType,
    });

    const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || "";
    const loginUrl = rootDomain ? `https://${institution.code}.${rootDomain}/login` : null;

    res.status(201).json({
      institution: {
        id: institution.id,
        name: institution.name,
        code: institution.code,
        status: institution.status,
        trial_ends_at: institution.trial_ends_at,
      },
      loginUrl,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;

// ============================================================================
// bkashGateway.js — validates an institution's own bKash agent/merchant
// credentials (BUSINESS_READINESS_ROADMAP.md Phase 8E)
// ============================================================================
// This is the "Bring-Your-Own-Account" gateway (roadmap Phase 8 intro,
// point 2) — distinct from the platform-wide SMS wallet (lib/smsSender.js).
// Each institution submits its own App Key/Secret/Username/Password from
// its own bKash merchant/agent account; this module's only job right now
// is to call bKash's grant-token endpoint with those credentials and
// report whether they're valid. Actual payment create/execute (Phase 8F)
// is out of scope here.
//
// BKASH_BASE_URL defaults to the public sandbox (developer.bka.sh) so this
// can be exercised for free with no real business account (roadmap 8G) —
// an operator switches to the production base URL later via env var only,
// no code change, same "flip a var to go live" contract as every other
// provider adapter in this codebase (smsProviders/*, lib/mailer.js).
// ============================================================================

const DEFAULT_BASE_URL = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

function baseUrl() {
  return process.env.BKASH_BASE_URL || DEFAULT_BASE_URL;
}

/**
 * Calls bKash's grant-token endpoint with the given credentials. Never
 * throws for an ordinary API-level rejection (bad credentials) — those
 * come back as { ok: false, error }. A thrown error means the HTTP
 * request itself failed (network/DNS/etc.); callers should catch that
 * separately and treat it the same as a validation failure.
 */
async function validateCredentials({ appKey, appSecret, username, password }) {
  if (!appKey || !appSecret || !username || !password) {
    return { ok: false, error: "সব ৪টি ফিল্ড আবশ্যক" };
  }

  const res = await fetch(`${baseUrl()}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username,
      password,
    },
    body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
  });

  const bodyText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }

  const ok = res.ok && Boolean(parsed?.id_token);
  return {
    ok,
    error: ok ? null : parsed?.msg || parsed?.message || `bKash validation failed (HTTP ${res.status})`,
    raw: parsed ?? bodyText,
  };
}

module.exports = { validateCredentials, baseUrl };

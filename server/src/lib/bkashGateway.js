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

// ============================================================================
// bkashGateway.js — validates an institution's own bKash agent/merchant
// credentials (Phase 8E), and drives the create→execute payment lifecycle
// against those same credentials (Phase 8F).
// ============================================================================
// This is the "Bring-Your-Own-Account" gateway (roadmap Phase 8 intro,
// point 2) — distinct from the platform-wide SMS wallet (lib/smsSender.js).
// Each institution submits its own App Key/Secret/Username/Password from
// its own bKash merchant/agent account (routes/paymentGateway.js); this
// module calls bKash's grant-token, create-payment, and execute-payment
// endpoints with those credentials on the institution's behalf.
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

async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Calls bKash's grant-token endpoint with the given credentials. Never
 * throws for an ordinary API-level rejection (bad credentials) — those
 * come back as { ok: false, error }. A thrown error means the HTTP
 * request itself failed (network/DNS/etc.); callers should catch that
 * separately and treat it the same as a validation failure.
 */
async function grantToken({ appKey, appSecret, username, password }) {
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

  const parsed = await parseJson(res);
  const ok = res.ok && Boolean(parsed?.id_token);
  return {
    ok,
    error: ok ? null : parsed?.msg || parsed?.message || `bKash validation failed (HTTP ${res.status})`,
    idToken: ok ? parsed.id_token : null,
    raw: parsed,
  };
}

// Kept as a named alias — routes/paymentGateway.js only cares whether the
// submitted credentials are valid, not about the token itself, so it reads
// more clearly calling this "validate" than "grant".
const validateCredentials = grantToken;

/**
 * Starts a bKash checkout: asks bKash for a paymentID + checkout URL to
 * redirect the payer's browser to. invoiceId should be unique per attempt
 * (routes pass the bkash_payment_intents row id) — bKash rejects a reused
 * one. Never throws for an ordinary rejection; see grantToken's doc above.
 */
async function createPayment({ idToken, appKey, amount, invoiceId, callbackURL }) {
  const res = await fetch(`${baseUrl()}/tokenized/checkout/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: idToken,
      "X-App-Key": appKey,
    },
    body: JSON.stringify({
      mode: "0011",
      payerReference: String(invoiceId),
      callbackURL,
      amount: String(amount),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: String(invoiceId),
    }),
  });

  const parsed = await parseJson(res);
  const ok = res.ok && Boolean(parsed?.paymentID && parsed?.bkashURL);
  return {
    ok,
    error: ok ? null : parsed?.msg || parsed?.message || `bKash create-payment failed (HTTP ${res.status})`,
    paymentID: ok ? parsed.paymentID : null,
    bkashURL: ok ? parsed.bkashURL : null,
    raw: parsed,
  };
}

/**
 * Finalizes a checkout the payer already completed on bKash's own page.
 * This — not the browser redirect's query string — is the only source of
 * truth for whether money actually moved; see the schema comment on
 * bkash_payment_intents for why. transactionStatus "Completed" is success;
 * anything else (including bKash's own idempotent-retry response for an
 * already-executed paymentID) is surfaced via ok:false so the caller falls
 * back to its own intent-row status check.
 */
async function executePayment({ idToken, appKey, paymentID }) {
  const res = await fetch(`${baseUrl()}/tokenized/checkout/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: idToken,
      "X-App-Key": appKey,
    },
    body: JSON.stringify({ paymentID }),
  });

  const parsed = await parseJson(res);
  const ok = res.ok && parsed?.transactionStatus === "Completed";
  return {
    ok,
    error: ok ? null : parsed?.msg || parsed?.message || `bKash execute-payment failed (HTTP ${res.status})`,
    trxID: parsed?.trxID || null,
    raw: parsed,
  };
}

module.exports = { baseUrl, grantToken, validateCredentials, createPayment, executePayment };

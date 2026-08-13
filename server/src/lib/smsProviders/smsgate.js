// ============================================================================
// smsgate.js — SMSGate (sms-gate.app, "SMS Gateway for Android") Cloud API
// adapter for the own-phone/SIM bulk SMS feature
// (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 1/2).
// ============================================================================
// Deliberately NOT registered in smsProviders/index.js — that registry is
// for the platform-wide, paid-reseller flow (smsSender.js /
// SMS_PROVIDER env var); this is a completely separate, per-tenant,
// Bring-Your-Own-Device flow used only via
// lib/ownSmsGatewayCredentials.js + routes/ownSmsGateway.js +
// routes/sms.js's POST /broadcast.
//
// Cloud API base URL and request/response shape confirmed against
// https://docs.sms-gate.app/integration/api/ and
// https://docs.sms-gate.app/getting-started/public-cloud-server/
// (Basic Auth, JSON body {"textMessage":{"text":...},"phoneNumbers":[...]}
// to POST /3rdparty/v1/messages) — NOT yet exercised against a real
// device/account from this sandbox (no network access here). Verify with
// one real send before relying on this in production, per the plan doc's
// standing caveat.
// ============================================================================

const BASE_URL = "https://api.sms-gate.app/3rdparty/v1";

function authHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Sends one SMS via SMSGate's Cloud API. Matches this folder's adapter
 * shape: send({ username, password, to, message }) -> { ok, raw }. Never
 * throws for an ordinary API-level rejection (bad credentials, device
 * offline, ...) — those come back as ok: false with the parsed body in
 * raw. A thrown error here means the HTTP request itself failed
 * (network/DNS/etc.); callers (routes/sms.js's /broadcast loop) catch that
 * separately per-recipient.
 */
async function send({ username, password, to, message }) {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: authHeader(username, password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      textMessage: { text: message },
      phoneNumbers: [to],
    }),
  });

  const bodyText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }

  return {
    ok: res.ok,
    raw: parsed ?? bodyText,
  };
}

/**
 * Lightweight credential check for routes/ownSmsGateway.js's POST /connect
 * — a GET /messages?limit=1 call never sends a real SMS, just confirms the
 * username/password pair is accepted (200) or not (401/403). Returns
 * { ok, error }.
 */
async function verifyCredentials({ username, password }) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/messages?limit=1`, {
      method: "GET",
      headers: { Authorization: authHeader(username, password) },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "সংযোগ ব্যর্থ হয়েছে" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "ইউজারনেম/পাসওয়ার্ড সঠিক নয়" };
  }
  if (!res.ok) {
    return { ok: false, error: `SMSGate API ত্রুটি (HTTP ${res.status})` };
  }
  return { ok: true, error: null };
}

module.exports = { send, verifyCredentials };

// ============================================================================
// smsgate.js — SMSGate (sms-gate.app, Android own-phone/SIM gateway,
// Cloud mode) provider adapter
// ============================================================================
// docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md Phase 1. Deliberately NOT added to
// smsProviders/index.js's registry — that registry is platform-wide
// (keyed by the SMS_PROVIDER env var, used by smsSender.js's paid-reseller
// wallet-deducting flow). This adapter belongs to a completely separate,
// per-tenant system (own_sms_gateway table, routes/ownSmsGateway.js +
// routes/sms.js's POST /broadcast) — see the plan doc's design decision #5
// for why the two are kept apart.
//
// API (per docs.sms-gate.app, Cloud mode — NOT yet verified against a real
// request from this sandbox; re-confirm endpoint/response shape against
// https://docs.sms-gate.app/integration/api/ before trusting this in
// production, same flag as the plan doc and hardware-bridge/'s ADMS
// dialect):
//   POST https://api.sms-gate.app/3rdparty/v1/messages
//   Auth: HTTP Basic (username:password, set inside the SMSGate app)
//   Body: { "textMessage": { "text": "..." }, "phoneNumbers": ["+8801..."] }
// ============================================================================

const API_URL = "https://api.sms-gate.app/3rdparty/v1/messages";

/**
 * Sends one SMS via the institution's own connected SMSGate phone. Matches
 * the provider-adapter shape used across this codebase: send({...}) ->
 * { ok, raw }. Never throws for an ordinary API-level rejection (bad
 * credentials, phone offline, etc.) — those come back as ok: false with
 * the parsed body in raw, same contract as smsProviders/bulksmsbd.js.
 * A thrown error here means the HTTP request itself failed
 * (network/DNS/etc.) — callers catch that separately.
 */
async function send({ username, password, to, message }) {
  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
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
    parsed = null; // documented to return JSON; fall back to raw text for
    // logging if that ever changes.
  }

  return {
    ok: res.ok,
    raw: parsed ?? bodyText,
  };
}

module.exports = { send };

// ============================================================================
// bulksmsbd.js — BulkSMSBD (bulksmsbd.net) provider adapter for smsSender.js
// ============================================================================
// API docs: https://bulksmsbd.com/bulksms-api-bangladesh.php
// Single-recipient endpoint used here (POST /api/smsapi) — smsSender.js
// calls this once per SMS, so the many-to-many endpoint (/api/smsapimany)
// isn't needed; revisit only if a future caller needs true batch dispatch
// in one HTTP call.
//
// Response is JSON with a numeric "response_code" — 202 is the only
// success code ("SMS Submitted Successfully"). Every other documented code
// is a specific failure reason on BulkSMSBD's own side (bad/disabled
// sender id, missing fields, their account's balance insufficient, etc.)
// — smsSender.js only needs ok/not-ok plus the raw payload for logging, so
// we don't branch on individual codes here.
// ============================================================================

const API_URL = "https://bulksmsbd.net/api/smsapi";
const SUCCESS_CODE = 202;

/**
 * Sends one SMS via BulkSMSBD. Matches the provider-adapter shape every
 * file in this folder must implement: send({ apiKey, senderId, to, message })
 * -> { ok, providerMessageId, raw }. Never throws for an ordinary API-level
 * rejection (bad sender id, insufficient balance on BulkSMSBD's side, ...)
 * — those come back as ok: false with the parsed body in raw. A thrown
 * error here means the HTTP request itself failed (network/DNS/etc.);
 * smsSender.js catches that separately.
 */
async function send({ apiKey, senderId, to, message }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      api_key: apiKey,
      senderid: senderId,
      number: to,
      message,
    }),
  });

  const bodyText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null; // BulkSMSBD is documented to return JSON, but fall back
    // to the raw text if that ever changes — still usable for logging.
  }

  const responseCode = Number(parsed?.response_code);
  const ok = res.ok && responseCode === SUCCESS_CODE;

  return {
    ok,
    providerMessageId: parsed?.message_id ?? null,
    raw: parsed ?? bodyText,
  };
}

module.exports = { send };

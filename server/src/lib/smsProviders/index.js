// ============================================================================
// smsProviders/index.js — provider registry for smsSender.js
// ============================================================================
// Key = the value of the SMS_PROVIDER env var. Every entry must export a
// send({ apiKey, senderId, to, message }) -> { ok, providerMessageId, raw }
// function (see bulksmsbd.js for the reference shape/comments).
//
// Adding another Bangladeshi reseller later (Alpha SMS, MimSMS, ...) is:
//   1. new file in this folder implementing the same send() shape
//   2. one new line below
// Nothing in smsSender.js or any of its callers needs to change — this is
// the whole point of keeping the registry in one small file.
// ============================================================================

module.exports = {
  bulksmsbd: require("./bulksmsbd"),
  // Not yet implemented — add when the user is ready to switch/add a
  // second provider (see docs/BUSINESS_READINESS_ROADMAP.md Phase 8B):
  // alphasms: require("./alphasms"),
  // mimsms: require("./mimsms"),
};

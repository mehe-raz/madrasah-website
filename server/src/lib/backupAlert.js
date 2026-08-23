// ============================================================================
// backupAlert.js — email alerts for database redundancy problems
// ============================================================================
// Two situations page the platform owner (PLATFORM_OWNER_EMAIL):
//   1. notifyFailover() — primary database became unreachable and all
//      traffic (read + write) has switched to the backup database. This is
//      urgent: the site is running on backup only, with no further
//      redundancy, until a human runs scripts/sync-and-switch-back.js.
//   2. notifyMirrorFailing() — the secondary database (whichever one is
//      NOT currently active) has rejected several consecutive mirrored
//      writes in a row. The live site is unaffected, but the two databases
//      are silently drifting out of sync and need attention.
//
// Both are rate-limited per process (see MIN_INTERVAL_MS below) so a
// flapping connection or a persistently broken backup can't spam the
// mailbox — one email per situation per window is enough to get attention.
//
// If PLATFORM_OWNER_EMAIL or RESEND_API_KEY isn't set, these functions log a
// warning and return instead of throwing — a missing alert configuration
// must never be able to break the request path that triggered it (the
// failover/mirror-mirror-write code paths that call these already treat
// them as fire-and-forget, but this is defense in depth).
// ============================================================================

const { sendMail } = require("./mailer");

const MIN_INTERVAL_MS = 30 * 60 * 1000; // don't re-alert for the same situation more than once per 30 min

let lastFailoverAlertAt = 0;
let lastMirrorAlertAt = 0;

function ownerEmail() {
  const email = (process.env.PLATFORM_OWNER_EMAIL || "").trim();
  return email || null;
}

async function safeSend(subject, html) {
  const to = ownerEmail();
  if (!to) {
    console.warn(`[backupAlert] PLATFORM_OWNER_EMAIL not set — skipping alert: ${subject}`);
    return;
  }
  try {
    await sendMail({ to, subject, html });
  } catch (err) {
    // Never throw out of an alert function — the caller (dbFailover.js /
    // backupMirror.js) is already in a best-effort, fire-and-forget path.
    console.error("[backupAlert] Failed to send alert email:", err.message);
  }
}

async function notifyFailover(reason) {
  const now = Date.now();
  if (now - lastFailoverAlertAt < MIN_INTERVAL_MS) return;
  lastFailoverAlertAt = now;

  await safeSend(
    "🚨 জরুরি: প্রাইমারি ডাটাবেজ ডাউন — সাইট এখন ব্যাকআপ ডাটাবেজে চলছে",
    `
      <p><strong>প্রাইমারি ডাটাবেজে সংযোগ ব্যর্থ হয়েছে</strong> এবং ওয়েবসাইট স্বয়ংক্রিয়ভাবে ব্যাকআপ ডাটাবেজে সুইচ করেছে।</p>
      <p>সাইট এখনো চালু আছে, কিন্তু আপাতত কোনো দ্বিতীয় নিরাপত্তা কপি (redundancy) নেই — শুধু ব্যাকআপ ডাটাবেজের উপর নির্ভর করে চলছে।</p>
      <p><strong>কারণ:</strong> ${reason || "অজানা সংযোগ সমস্যা"}</p>
      <p><strong>পরবর্তী পদক্ষেপ:</strong></p>
      <ol>
        <li>প্রাইমারি Neon ডাটাবেজের অবস্থা পরীক্ষা করুন (Neon ড্যাশবোর্ড / status page)।</li>
        <li>প্রাইমারি সুস্থ হওয়ার পর <code>scripts/sync-and-switch-back.js</code> চালিয়ে দুই ডাটাবেজ সিঙ্ক করুন।</li>
        <li>সিঙ্ক সফল হলে সাইট আবার প্রাইমারিতে ফিরে যাবে।</li>
      </ol>
      <p>সময়: ${new Date().toISOString()}</p>
    `
  );
}

async function notifyMirrorFailing(reason, consecutiveFailures) {
  const now = Date.now();
  if (now - lastMirrorAlertAt < MIN_INTERVAL_MS) return;
  lastMirrorAlertAt = now;

  await safeSend(
    "⚠️ সতর্কতা: ব্যাকআপ ডাটাবেজে ডেটা মিরর হচ্ছে না",
    `
      <p>সাইট স্বাভাবিকভাবে চলছে, কিন্তু গত <strong>${consecutiveFailures}</strong>টি লেখার চেষ্টা ব্যাকআপ ডাটাবেজে সফল হয়নি।</p>
      <p>দুই ডাটাবেজ এখন একে অপরের থেকে আলাদা হয়ে যাচ্ছে (out of sync) — যত দ্রুত সম্ভব ঠিক করা দরকার, নাহলে ব্যাকআপ ডাটাবেজ পুরনো ডেটা নিয়ে থেকে যাবে।</p>
      <p><strong>সর্বশেষ কারণ:</strong> ${reason || "অজানা"}</p>
      <p>সার্ভার লগে আরও বিস্তারিত দেখুন। ব্যাকআপ ডাটাবেজের connection string, schema, এবং অ্যাক্সেস অনুমতি পরীক্ষা করুন।</p>
      <p>সময়: ${new Date().toISOString()}</p>
    `
  );
}

module.exports = { notifyFailover, notifyMirrorFailing };

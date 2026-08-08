// ============================================================================
// lib/guardianPush.js  (Guardian Push Notifications — Phase 2)
// ============================================================================
// One single entry point — notifyGuardians() — for turning any
// guardian-facing event (a reminder dispatch, a new class post/notice/
// assignment, and later a published result — see docs/
// PUSH_NOTIFICATION_PLAN.md Phase 6) into a real browser/phone push
// notification. Callers never talk to `web-push` directly; this is the
// only file that does.
//
// Same env-var-driven / no-op-if-unset pattern as lib/mailer.js and lib/
// smsSender.js: if VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT aren't
// all set, every call here is a silent no-op — the guardian portal's
// existing 45-second polling bubble (GuardianMessengerBubble.tsx) still
// works normally either way, push is purely an additive layer on top of
// it, never a replacement.
//
// Never throws — a push failure must never break the guardian_messages/
// class_posts write it's attached to (same "never throws per-guardian"
// rule guardianReminders.js's dispatchReminder() already follows).
// ============================================================================

const db = require("./../db");
const { getPublicSettings } = require("./publicSettings");

let webpush = null;
let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  try {
    webpush = require("web-push");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return true;
  } catch (err) {
    // web-push not installed / VAPID subject malformed — degrade to no-op
    // rather than crashing whatever triggered this (a reminder dispatch, a
    // class post) same as smsSender.js's own require-time guard.
    console.error("guardianPush: failed to configure web-push", err.message);
    return false;
  }
}

async function subscriptionsForGuardians(guardianIds) {
  if (!guardianIds || guardianIds.length === 0) return [];
  return db.all(
    `SELECT * FROM guardian_push_subscriptions WHERE "guardianId" = ANY($1)`,
    [guardianIds]
  );
}

// Best-effort: the institution's own logo (Cloudinary URL, set in
// Settings) becomes the notification's icon, so every guardian sees their
// own madrasah's branding in the OS notification tray instead of a
// generic app icon. Never throws — a settings lookup failure must not
// block the push itself; falls back to the static /icon.svg the service
// worker already uses when there's no logo yet or the lookup fails.
async function institutionIcon() {
  try {
    const settings = await getPublicSettings();
    return settings.logo || null;
  } catch {
    return null;
  }
}

// Sends one push per subscribed browser/device for the given guardians.
// `title`/`body` shown in the OS notification, `url` is where
// sw.js's notificationclick handler navigates on tap (e.g.
// "/guardian/messages" or the guardian feed). Every subscription is
// attempted independently — one guardian's dead subscription never stops
// delivery to the rest.
async function notifyGuardians(guardianIds, { title, body, url } = {}) {
  if (!ensureConfigured()) return { sent: 0, reason: "not_configured" };
  if (!guardianIds || guardianIds.length === 0) return { sent: 0, reason: "no_targets" };

  const subscriptions = await subscriptionsForGuardians(guardianIds);
  if (subscriptions.length === 0) return { sent: 0, reason: "no_subscriptions" };

  const icon = await institutionIcon();
  const payload = JSON.stringify({
    title: title || "",
    body: body || "",
    url: url || "/",
    icon: icon || undefined,
  });
  let sent = 0;

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      // urgency: "high" is the signal Android/Chrome uses to decide
      // whether to show this as a heads-up banner (pops up over whatever
      // app is on screen — YouTube, another app, the lock screen) instead
      // of silently landing in the notification tray. TTL keeps it queued
      // for 24h if the guardian's phone is offline when it's sent, so a
      // reminder/notice isn't lost, only delayed until the phone reconnects.
      await webpush.sendNotification(pushSubscription, payload, {
        urgency: "high",
        TTL: 60 * 60 * 24,
      });
      sent += 1;
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired/revoked on the browser's side (uninstalled,
        // site data cleared, permission revoked) — the push service will
        // never accept this endpoint again, so stop tracking it. Standard
        // Web Push cleanup practice, not an error worth logging.
        await db.run(`DELETE FROM guardian_push_subscriptions WHERE id = $1`, [sub.id]).catch(() => {});
      } else {
        // Anything else (network hiccup, malformed payload, rate limit) —
        // log and move on, never let one bad subscription abort the loop.
        console.error("guardianPush: send failed", sub.id, err.message);
      }
    }
  }

  return { sent, reason: sent > 0 ? "ok" : "all_failed" };
}

async function saveSubscription(guardianId, { endpoint, keys, userAgent }) {
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO guardian_push_subscriptions ("guardianId", endpoint, p256dh, auth, "userAgent", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET
       "guardianId" = EXCLUDED."guardianId",
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       "userAgent" = EXCLUDED."userAgent"`,
    [guardianId, endpoint, keys?.p256dh || "", keys?.auth || "", userAgent || null, createdAt]
  );
}

async function deleteSubscription(guardianId, endpoint) {
  await db.run(
    `DELETE FROM guardian_push_subscriptions WHERE "guardianId" = $1 AND endpoint = $2`,
    [guardianId, endpoint]
  );
}

function getVapidPublicKey() {
  // Deliberately does NOT call ensureConfigured() — the public key alone
  // is not a secret and the client needs it to even attempt
  // PushManager.subscribe(), before we know the private key/subject are
  // also valid. Returns null (not an error) when unset, same "feature
  // just isn't on" shape as SmsSettings.tsx's SMS_TOPUP_BKASH_NUMBER
  // fallback.
  return process.env.VAPID_PUBLIC_KEY || null;
}

module.exports = {
  notifyGuardians,
  saveSubscription,
  deleteSubscription,
  getVapidPublicKey,
};

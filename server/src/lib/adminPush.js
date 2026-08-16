// ============================================================================
// lib/adminPush.js  (Admin/Super Admin Push Notifications)
// ============================================================================
// Same shape as lib/guardianPush.js, but targets staff accounts (the
// `users` table) instead of guardian_accounts. Built specifically so a
// Super Admin gets a real OS-level push notification on their phone/browser
// the moment something they'd otherwise never notice goes wrong — starting
// with automatic backups silently failing (routes/backup.js).
//
// Reuses the exact same VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT env
// vars as guardian push — Web Push doesn't need a separate keypair per
// audience, and if those are already set up for the guardian portal, admin
// push works with zero extra configuration.
//
// Same "never throws, silent no-op if unconfigured" contract as
// guardianPush.js: a push failure must never break whatever triggered it
// (e.g. the backup job itself), and this is purely an additive layer on
// top of the in-app notification bell (lib/notifications.js), never a
// replacement for it.
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
    console.error("adminPush: failed to configure web-push", err.message);
    return false;
  }
}

async function subscriptionsForUsers(userIds) {
  if (!userIds || userIds.length === 0) return [];
  return db.all(`SELECT * FROM admin_push_subscriptions WHERE "userId" = ANY($1)`, [userIds]);
}

// Best-effort institution branding, same as guardianPush.js's institutionIcon().
async function institutionIcon() {
  try {
    const settings = await getPublicSettings();
    return settings.logo || null;
  } catch {
    return null;
  }
}

// Sends a push to every subscribed browser/device belonging to users with
// the given role(s) (e.g. "Super Admin"). Looking up by role rather than a
// fixed userId means a newly-added Super Admin (or a second one) starts
// receiving these automatically, with no code change.
async function notifyByRole(roles, { title, body, url } = {}) {
  if (!ensureConfigured()) return { sent: 0, reason: "not_configured" };
  const roleList = Array.isArray(roles) ? roles : [roles];
  if (!roleList.length) return { sent: 0, reason: "no_targets" };

  const users = await db.all(`SELECT id FROM users WHERE role = ANY($1)`, [roleList]);
  const userIds = users.map((u) => u.id);
  if (!userIds.length) return { sent: 0, reason: "no_targets" };

  const subscriptions = await subscriptionsForUsers(userIds);
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
      // urgency: "high" so this shows as a heads-up banner rather than
      // silently landing in the tray — a failed backup is exactly the kind
      // of thing that shouldn't wait for the admin to happen to check.
      await webpush.sendNotification(pushSubscription, payload, {
        urgency: "high",
        TTL: 60 * 60 * 24,
      });
      sent += 1;
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.run(`DELETE FROM admin_push_subscriptions WHERE id = $1`, [sub.id]).catch(() => {});
      } else {
        console.error("adminPush: send failed", sub.id, err.message);
      }
    }
  }

  return { sent, reason: sent > 0 ? "ok" : "all_failed" };
}

async function saveSubscription(userId, { endpoint, keys, userAgent }) {
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO admin_push_subscriptions ("userId", endpoint, p256dh, auth, "userAgent", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET
       "userId" = EXCLUDED."userId",
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       "userAgent" = EXCLUDED."userAgent"`,
    [userId, endpoint, keys?.p256dh || "", keys?.auth || "", userAgent || null, createdAt]
  );
}

async function deleteSubscription(userId, endpoint) {
  await db.run(`DELETE FROM admin_push_subscriptions WHERE "userId" = $1 AND endpoint = $2`, [userId, endpoint]);
}

// Deliberately does NOT call ensureConfigured() — see guardianPush.js's
// identical getVapidPublicKey() for why (the public key isn't a secret and
// the client needs it before we know push is fully usable).
function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

module.exports = {
  notifyByRole,
  saveSubscription,
  deleteSubscription,
  getVapidPublicKey,
};

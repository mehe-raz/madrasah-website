const express = require("express");
const { listForUser, unreadCountForUser, markRead, markAllRead } = require("../lib/notifications");
const adminPush = require("../lib/adminPush");

const router = express.Router();
// No requirePermission() here on purpose: every role should be able to see
// its own notifications, and listForUser/unreadCountForUser already scope
// results to the requesting user's id/role at the query level.

router.get("/", async (req, res) => {
  const rows = await listForUser(req.user, { limit: req.query.limit });
  res.json(rows);
});

router.get("/unread-count", async (req, res) => {
  const count = await unreadCountForUser(req.user);
  res.json({ count });
});

router.post("/:id/read", async (req, res) => {
  await markRead(req.user, Number(req.params.id));
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await markAllRead(req.user);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Browser/phone push notifications for staff (Super Admin gets alerted here
// the moment an automatic backup fails — see routes/backup.js). Mirrors the
// guardian-auth push routes; req.user is available here because this router
// is mounted after the requireAuth/rbac chain in index.js.
// ---------------------------------------------------------------------------

router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: adminPush.getVapidPublicKey() });
});

router.post("/push/subscribe", async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Incomplete push subscription" });
  }
  await adminPush.saveSubscription(req.user.id, { endpoint, keys, userAgent: req.get("user-agent") });
  res.json({ ok: true });
});

router.delete("/push/subscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
  await adminPush.deleteSubscription(req.user.id, endpoint);
  res.json({ ok: true });
});

module.exports = router;

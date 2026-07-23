const express = require("express");
const { listForUser, unreadCountForUser, markRead, markAllRead } = require("../lib/notifications");

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

module.exports = router;

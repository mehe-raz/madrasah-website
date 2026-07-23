const db = require("../db");

// Fires on: new admission application, new delete request, delete request
// resolved. A notification is visible to a user when either:
//   - "targetUserId" matches them directly (e.g. "your request was approved"), or
//   - "targetUserId" is null and their role is in "targetRoles" (or
//     "targetRoles" is empty, meaning "every authenticated user").
// Failing to write a notification must never break the action that
// triggered it (admission submitted, delete requested, etc.) — same
// best-effort contract as recordAudit in lib/auditLog.js.
async function createNotification({
  type,
  title,
  body = "",
  entityType = "",
  entityId = null,
  link = "",
  targetRoles = [],
  targetUserId = null,
}) {
  try {
    if (!type || !title) return null;
    const row = await db.get(
      `INSERT INTO notifications
       (type, title, body, "entityType", "entityId", link, "targetRoles", "targetUserId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        String(type),
        String(title).slice(0, 200),
        String(body).slice(0, 1000),
        entityType ? String(entityType) : "",
        entityId == null ? null : Number(entityId),
        link ? String(link) : "",
        targetRoles,
        targetUserId == null ? null : Number(targetUserId),
        new Date().toISOString(),
      ]
    );
    return row;
  } catch (e) {
    console.error("Notification write failed:", e.message);
    return null;
  }
}

async function listForUser(user, { limit = 30 } = {}) {
  const cappedLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const rows = await db.all(
    `SELECT n.*, nr."readAt" AS "readAt"
     FROM notifications n
     LEFT JOIN notification_reads nr ON nr."notificationId" = n.id AND nr."userId" = $1
     WHERE ("targetUserId" = $2 OR ("targetUserId" IS NULL AND (cardinality("targetRoles") = 0 OR $3 = ANY("targetRoles"))))
     ORDER BY n."createdAt" DESC, n.id DESC
     LIMIT $4`,
    [user.id, user.id, user.role, cappedLimit]
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    entityType: r.entityType,
    entityId: r.entityId,
    link: r.link,
    createdAt: r.createdAt,
    read: !!r.readAt,
  }));
}

async function unreadCountForUser(user) {
  const row = await db.get(
    `SELECT COUNT(*)::int AS c
     FROM notifications n
     LEFT JOIN notification_reads nr ON nr."notificationId" = n.id AND nr."userId" = $1
     WHERE ("targetUserId" = $2 OR ("targetUserId" IS NULL AND (cardinality("targetRoles") = 0 OR $3 = ANY("targetRoles"))))
       AND nr."readAt" IS NULL`,
    [user.id, user.id, user.role]
  );
  return row?.c || 0;
}

async function markRead(user, notificationId) {
  await db.run(
    `INSERT INTO notification_reads ("notificationId", "userId", "readAt")
     VALUES ($1, $2, $3)
     ON CONFLICT ("notificationId", "userId") DO NOTHING`,
    [Number(notificationId), user.id, new Date().toISOString()]
  );
}

async function markAllRead(user) {
  await db.run(
    `INSERT INTO notification_reads ("notificationId", "userId", "readAt")
     SELECT n.id, $1, $2
     FROM notifications n
     WHERE ("targetUserId" = $3 OR ("targetUserId" IS NULL AND (cardinality("targetRoles") = 0 OR $4 = ANY("targetRoles"))))
     ON CONFLICT ("notificationId", "userId") DO NOTHING`,
    [user.id, new Date().toISOString(), user.id, user.role]
  );
}

module.exports = { createNotification, listForUser, unreadCountForUser, markRead, markAllRead };

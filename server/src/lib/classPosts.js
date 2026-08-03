// ============================================================================
// lib/classPosts.js  (Class-Broadcast Model — Step 4)
// ============================================================================
// A Teacher posts once per class (routes/assignments.js); every guardian
// with an ACTIVE-linked child in that class sees it by joining at read
// time (feedForGuardian below) — no per-guardian fan-out row is written,
// matching the "no duplicate rows" note in the Step 4 plan. Unread
// tracking is class_post_reads (see the migration note in sql/
// supabase_schema.sql for why this isn't the existing notifications
// table).
// ============================================================================

const db = require("./../db");

function parseAttachments(row) {
  if (!row) return row;
  return { ...row, attachments: typeof row.attachments === "string" ? JSON.parse(row.attachments) : row.attachments };
}

async function createPost({ type, class: className, title, body, attachments, teacherId }) {
  const createdAt = new Date().toISOString();
  const row = await db.get(
    `INSERT INTO class_posts (type, class, "teacherId", title, body, attachments, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [type, className, teacherId || null, title, body || "", JSON.stringify(attachments || []), createdAt]
  );
  return parseAttachments(row);
}

// `classes: null` means unscoped (Admin/Super Admin browsing everything);
// `classes: []` (a Teacher with nothing assigned yet) is handled by the
// caller returning early — see routes/assignments.js — rather than being
// passed in here, since `= ANY('{}')` would just quietly return zero rows
// instead of surfacing the "you have no classes yet" case explicitly.
async function listPosts({ classes, type } = {}) {
  const conditions = [];
  const params = [];
  if (classes) {
    params.push(classes);
    conditions.push(`class = ANY($${params.length})`);
  }
  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.all(`SELECT * FROM class_posts ${where} ORDER BY "createdAt" DESC LIMIT 200`, params);
  return rows.map(parseAttachments);
}

async function getPost(id) {
  const row = await db.get("SELECT * FROM class_posts WHERE id = $1", [id]);
  return parseAttachments(row);
}

async function deletePost(id) {
  await db.run("DELETE FROM class_posts WHERE id = $1", [id]);
}

// Every post whose class matches one of this guardian's ACTIVE-linked
// children's classes — a pending child-link (see routes/guardianAuth.js
// POST /add-child) is excluded on purpose, same reasoning as a pending
// guardian_accounts row never being able to log in at all: an unapproved
// link shouldn't leak class content either.
async function feedForGuardian(guardianId, { type } = {}) {
  const conditions = [];
  const params = [guardianId];
  if (type) {
    params.push(type);
    conditions.push(`AND cp.type = $${params.length}`);
  }
  const rows = await db.all(
    `SELECT cp.*, (cpr."postId" IS NOT NULL) AS read
     FROM class_posts cp
     LEFT JOIN class_post_reads cpr ON cpr."postId" = cp.id AND cpr."guardianId" = $1
     WHERE cp.class IN (
       SELECT DISTINCT s.class
       FROM guardian_students gs
       JOIN students s ON s.id = gs."studentId"
       WHERE gs."guardianId" = $1 AND gs.status = 'active'
     )
     ${conditions.join(" ")}
     ORDER BY cp."createdAt" DESC
     LIMIT 200`,
    params
  );
  return rows.map(parseAttachments);
}

async function markPostRead(guardianId, postId) {
  if (!Number.isFinite(postId)) return;
  const readAt = new Date().toISOString();
  await db.run(
    `INSERT INTO class_post_reads ("postId", "guardianId", "readAt") VALUES ($1, $2, $3)
     ON CONFLICT ("postId", "guardianId") DO NOTHING`,
    [postId, guardianId, readAt]
  );
}

async function unreadCountForGuardian(guardianId) {
  const row = await db.get(
    `SELECT COUNT(*)::int AS count
     FROM class_posts cp
     WHERE cp.class IN (
       SELECT DISTINCT s.class
       FROM guardian_students gs
       JOIN students s ON s.id = gs."studentId"
       WHERE gs."guardianId" = $1 AND gs.status = 'active'
     )
     AND NOT EXISTS (
       SELECT 1 FROM class_post_reads cpr WHERE cpr."postId" = cp.id AND cpr."guardianId" = $1
     )`,
    [guardianId]
  );
  return row?.count || 0;
}

module.exports = { createPost, listPosts, getPost, deletePost, feedForGuardian, markPostRead, unreadCountForGuardian };

// ============================================================================
// lib/classPosts.js  (Class-Broadcast Model — Step 4; multi-target audience
// added ad-hoc, docs/CURRENT_TASK.md — sidebar "নোটিশ ও অ্যাসাইনমেন্ট" <->
// public site notices connector)
// ============================================================================
// A Teacher posts once per class (routes/assignments.js); every guardian
// with an ACTIVE-linked child in that class sees it by joining at read
// time (feedForGuardian below) — no per-guardian fan-out row is written,
// matching the "no duplicate rows" note in the Step 4 plan. Unread
// tracking is class_post_reads (see the migration note in sql/
// supabase_schema.sql for why this isn't the existing notifications
// table).
//
// Audience model (Admin/Super Admin only — see routes/assignments.js):
// a post reaches a guardian if ANY of the following hold —
//   - "allClasses" is true (every active-linked guardian, any class)
//   - one of "targetClasses" matches one of the guardian's active
//     children's `students.class`
//   - one of "guardianStudentIds" is one of the guardian's active
//     children (targets that guardian specifically, regardless of class)
// A Teacher's post (the original, unchanged path) simply sets `class` +
// targetClasses: [class] with everything else at its default/empty, so it
// behaves exactly as before.
// ============================================================================

const db = require("./../db");

function parseJsonColumn(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parsePost(row) {
  if (!row) return row;
  return {
    ...row,
    attachments: parseJsonColumn(row.attachments, []),
    targetClasses: parseJsonColumn(row.targetClasses, []),
    guardianStudentIds: parseJsonColumn(row.guardianStudentIds, []),
  };
}

async function createPost({
  type,
  class: className,
  title,
  body,
  attachments,
  teacherId,
  targetClasses,
  allClasses,
  publicSite,
  guardianStudentIds,
}) {
  const createdAt = new Date().toISOString();
  const row = await db.get(
    `INSERT INTO class_posts
       (type, class, "teacherId", title, body, attachments, "createdAt",
        "targetClasses", "allClasses", "publicSite", "guardianStudentIds")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      type,
      className || "",
      teacherId || null,
      title,
      body || "",
      JSON.stringify(attachments || []),
      createdAt,
      JSON.stringify(targetClasses || []),
      !!allClasses,
      !!publicSite,
      JSON.stringify(guardianStudentIds || []),
    ]
  );
  return parsePost(row);
}

// `classes: null` means unscoped (Admin/Super Admin browsing everything);
// `classes: []` (a Teacher with nothing assigned yet) is handled by the
// caller returning early — see routes/assignments.js — rather than being
// passed in here, since `= ANY('{}')` would just quietly return zero rows
// instead of surfacing the "you have no classes yet" case explicitly. When
// `classes` is provided, a post matches if it's an "allClasses" broadcast
// OR its targetClasses overlaps the given list (this also covers a plain
// Teacher single-class post, since createPost always seeds targetClasses
// with `[class]`).
async function listPosts({ classes, type } = {}) {
  const conditions = [];
  const params = [];
  if (classes) {
    params.push(classes);
    conditions.push(`("allClasses" = true OR "targetClasses" ?| $${params.length}::text[])`);
  }
  if (type) {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.all(`SELECT * FROM class_posts ${where} ORDER BY "createdAt" DESC LIMIT 200`, params);
  return rows.map(parsePost);
}

async function getPost(id) {
  const row = await db.get("SELECT * FROM class_posts WHERE id = $1", [id]);
  return parsePost(row);
}

async function deletePost(id) {
  await db.run("DELETE FROM class_posts WHERE id = $1", [id]);
}

// Every ACTIVE-linked guardian this post's audience reaches — same
// "status = 'active' + join students" rule feedForGuardian's WHERE already
// applies (a pending child-link never surfaces content). Used by
// routes/assignments.js's POST handler to know who to push-notify right
// after a post is created. Replaces the old resolveGuardiansForClass(className)
// (single-class only) now that a post's audience can be class(es), "all",
// and/or specific guardians (via their students) all at once.
async function resolveGuardiansForAudience({ targetClasses, allClasses, guardianStudentIds }) {
  if (allClasses) {
    const rows = await db.all(`SELECT DISTINCT "guardianId" FROM guardian_students WHERE status = 'active'`);
    return rows.map((r) => r.guardianId);
  }
  const ids = new Set();
  if (targetClasses && targetClasses.length) {
    const rows = await db.all(
      `SELECT DISTINCT gs."guardianId"
       FROM guardian_students gs
       JOIN students s ON s.id = gs."studentId"
       WHERE gs.status = 'active' AND s.class = ANY($1)`,
      [targetClasses]
    );
    for (const r of rows) ids.add(r.guardianId);
  }
  if (guardianStudentIds && guardianStudentIds.length) {
    const rows = await db.all(
      `SELECT DISTINCT "guardianId" FROM guardian_students WHERE status = 'active' AND "studentId" = ANY($1)`,
      [guardianStudentIds]
    );
    for (const r of rows) ids.add(r.guardianId);
  }
  return Array.from(ids);
}

// Kept for any other caller expecting the old single-class helper (e.g. a
// plain Teacher post) — just the "one class" special case of the function
// above.
async function resolveGuardiansForClass(className) {
  return resolveGuardiansForAudience({ targetClasses: [className], allClasses: false, guardianStudentIds: [] });
}

// Every post whose audience reaches this guardian — allClasses, OR a
// targetClasses match against one of this guardian's ACTIVE-linked
// children's classes, OR this guardian is directly named via
// guardianStudentIds on one of their ACTIVE-linked children. A pending
// child-link (see routes/guardianAuth.js POST /add-child) is excluded on
// purpose throughout, same reasoning as a pending guardian_accounts row
// never being able to log in at all: an unapproved link shouldn't leak
// content either.
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
     WHERE (
       cp."allClasses" = true
       OR EXISTS (
         SELECT 1 FROM guardian_students gs
         JOIN students s ON s.id = gs."studentId"
         WHERE gs."guardianId" = $1 AND gs.status = 'active'
           AND cp."targetClasses" ? s.class
       )
       OR EXISTS (
         SELECT 1 FROM guardian_students gs
         WHERE gs."guardianId" = $1 AND gs.status = 'active'
           AND cp."guardianStudentIds" @> to_jsonb(gs."studentId")
       )
     )
     ${conditions.join(" ")}
     ORDER BY cp."createdAt" DESC
     LIMIT 200`,
    params
  );
  return rows.map(parsePost);
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
     WHERE (
       cp."allClasses" = true
       OR EXISTS (
         SELECT 1 FROM guardian_students gs
         JOIN students s ON s.id = gs."studentId"
         WHERE gs."guardianId" = $1 AND gs.status = 'active'
           AND cp."targetClasses" ? s.class
       )
       OR EXISTS (
         SELECT 1 FROM guardian_students gs
         WHERE gs."guardianId" = $1 AND gs.status = 'active'
           AND cp."guardianStudentIds" @> to_jsonb(gs."studentId")
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM class_post_reads cpr WHERE cpr."postId" = cp.id AND cpr."guardianId" = $1
     )`,
    [guardianId]
  );
  return row?.count || 0;
}

module.exports = {
  createPost,
  listPosts,
  getPost,
  deletePost,
  feedForGuardian,
  markPostRead,
  unreadCountForGuardian,
  resolveGuardiansForClass,
  resolveGuardiansForAudience,
};

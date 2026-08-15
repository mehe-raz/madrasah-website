// ============================================================================
// routes/assignments.js  (Class-Broadcast Model — Step 4; multi-target
// audience added ad-hoc, docs/CURRENT_TASK.md — sidebar "নোটিশ ও
// অ্যাসাইনমেন্ট" <-> public site notices connector)
// ============================================================================
// Teacher/Admin/Super Admin side of class_posts. Mounted at
// /api/assignments, after the staff requireAuth/rbac chain in index.js.
// Uses the same attachTeacherClasses contract as attendance.js/results.js
// (Step 3): a Teacher only ever sees/creates/deletes posts in their
// assigned classes; Admin/Super Admin are unscoped and are the only roles
// who may use the extended audience fields (allClasses/publicSite/
// guardianStudentIds/multi-class targetClasses) — see the `req.teacherClasses`
// branch in the POST handler below. The guardian-facing read side (feed,
// unread count, mark-read) lives in routes/guardianAuth.js instead, since
// it needs a guardian session, not a staff one.
// ============================================================================

const express = require("express");
const db = require("../db");
const { requirePermission, canAccess } = require("../middleware/rbac");
const { requirePlanFeature } = require("../middleware/planGate");
const { attachTeacherClasses } = require("../lib/teacherScope");
const { getClassOptions } = require("../lib/classOptions");
const { getClassTree, flattenClassTree } = require("../lib/classTree");
const { recordAudit } = require("../lib/auditLog");
const { validate } = require("../middleware/validate");
const { idempotent } = require("../middleware/idempotency");
const { classPostCreateSchema } = require("../lib/classPostSchemas");
const {
  createPost,
  listPosts,
  getPost,
  deletePost,
  resolveGuardiansForAudience,
} = require("../lib/classPosts");
const { notifyGuardians } = require("../lib/guardianPush");
const { addNoticeAndPublish } = require("../lib/siteContent");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("assignments"));
// Phase 6: assignments/notice broadcast is a Standard+ plan feature. (The
// guardian-facing read side in routes/guardianAuth.js is intentionally NOT
// gated — a guardian should still be able to read posts made before any
// downgrade; this only blocks staff from creating new ones.)
router.use(requirePlanFeature("assignmentsBroadcast"));
// Same contract as attendance.js/results.js — see lib/teacherScope.js.
router.use(attachTeacherClasses);

const OUT_OF_SCOPE_ERROR = "আপনার নির্ধারিত ক্লাসের বাইরের তথ্যে অ্যাক্সেস নেই";

// Same contract as routes/results.js's "/classes" — a Teacher only sees
// their own assigned classes, Admin/Super Admin see every class that has
// at least one student. Powers the class dropdown on the compose form in
// client/src/modules/ClassPosts.tsx.
router.get("/classes", async (req, res) => {
  if (req.teacherClasses) return res.json([...req.teacherClasses].sort());
  const rows = await db.all("SELECT DISTINCT class FROM students WHERE class <> '' ORDER BY class");
  res.json(rows.map((r) => r.class));
});

router.get("/", async (req, res) => {
  const { class: className, type } = req.query;

  if (req.teacherClasses) {
    if (req.teacherClasses.length === 0) return res.json([]);
    if (className && !req.teacherClasses.includes(className)) {
      return res.status(403).json({ error: OUT_OF_SCOPE_ERROR });
    }
    return res.json(await listPosts({ classes: className ? [className] : req.teacherClasses, type }));
  }

  res.json(await listPosts({ classes: className ? [className] : null, type }));
});

router.post("/", validate(classPostCreateSchema), idempotent(async (req, res) => {
  const {
    type,
    class: className,
    title,
    body,
    attachments,
    targetClasses: rawTargetClasses,
    allClasses,
    publicSite,
    guardianStudentIds,
  } = req.body;

  // Fold the legacy single `class` field into targetClasses so every reader
  // (listPosts/feedForGuardian/etc.) only ever needs to look at one array.
  const requestedClasses = Array.from(new Set([...(className ? [className] : []), ...rawTargetClasses]));

  if (req.teacherClasses) {
    // A Teacher may only ever post to exactly one of their own assigned
    // classes — none of the extended audience options are available to
    // them (the compose form never sends them for a Teacher, but this is
    // the actual enforcement point, not the UI).
    if (allClasses || publicSite || (guardianStudentIds && guardianStudentIds.length)) {
      return res.status(403).json({ error: "এই ধরনের নোটিশ পাঠানোর অনুমতি শুধু অ্যাডমিন/সুপার অ্যাডমিনের রয়েছে" });
    }
    if (requestedClasses.length !== 1 || !req.teacherClasses.includes(requestedClasses[0])) {
      return res.status(403).json({ error: "আপনার নির্ধারিত ক্লাসের বাইরে পোস্ট করা যাবে না" });
    }
  } else {
    // Admin/Super Admin aren't scoped to a fixed class list, but every
    // requested class should still be real — otherwise a typo here creates
    // a post no guardian's feed query (which matches on their children's
    // actual `students.class` values) can ever surface. Validated against
    // the class TREE's leaves (not the older flat classOptions list) since
    // that's what the checkbox picker on ClassPosts.tsx is built from,
    // including any "সকল বিভাগ" (whole-department) picks it already
    // expanded to leaf classes before sending.
    if (requestedClasses.length) {
      const leaves = flattenClassTree(await getClassTree());
      const validSlugs = new Set(leaves.map((l) => l.en));
      // Legacy tenants that never migrated off the flat classOptions list
      // still validate against it too, same fallback classPosts.js's
      // caller-facing docs already assume elsewhere in this file.
      for (const o of await getClassOptions()) validSlugs.add(o.en);
      const unknown = requestedClasses.filter((c) => !validSlugs.has(c));
      if (unknown.length) return res.status(400).json({ error: `অজানা ক্লাস: ${unknown.join(", ")}` });
    }
    if (publicSite && !canAccess(req.user.role, ["website", "websiteNotices"])) {
      return res.status(403).json({ error: "পাবলিক সাইটে নোটিশ পাঠানোর অনুমতি নেই" });
    }
    if (!requestedClasses.length && !allClasses && !publicSite && (!guardianStudentIds || !guardianStudentIds.length)) {
      return res.status(400).json({ error: "কমপক্ষে একটি গন্তব্য নির্বাচন করুন (ক্লাস, সকল ক্লাস, পাবলিক সাইট বা গার্ডিয়ান)" });
    }
  }

  // `class` (the legacy display/scoping column) keeps carrying the first
  // targeted class for anything that still reads it directly (audit log
  // labels, the Teacher out-of-scope checks above); the real audience for
  // every reader going forward is targetClasses/allClasses/guardianStudentIds.
  const primaryClass = requestedClasses[0] || "";

  const post = await createPost({
    type,
    class: primaryClass,
    title,
    body,
    attachments,
    teacherId: req.user.id,
    targetClasses: requestedClasses,
    allClasses: !!allClasses,
    publicSite: !!publicSite,
    guardianStudentIds: guardianStudentIds || [],
  });

  if (publicSite) {
    // Best-effort mirror to the public site — a failure here shouldn't
    // undo the class_posts row already created above (same "additive,
    // never blocks the primary write" philosophy as notifyGuardians below).
    try {
      await addNoticeAndPublish({ title, body });
    } catch (err) {
      console.error("addNoticeAndPublish failed:", err);
    }
  }

  await recordAudit({
    action: "class_post.created",
    actor: req.user,
    entityType: "class_post",
    entityId: post.id,
    label: `Posted ${type}${publicSite ? " (+public site)" : ""}: ${title}`,
    details: {
      type,
      targetClasses: requestedClasses,
      allClasses: !!allClasses,
      publicSite: !!publicSite,
      guardianStudentCount: (guardianStudentIds || []).length,
      attachmentCount: (attachments || []).length,
    },
  });
  // Push is purely additive on top of the class_posts row above —
  // notifyGuardians() never throws (lib/guardianPush.js), so a push
  // failure or missing VAPID config can never stop the post itself from
  // being created/returned. Same placement pattern as Phase 4's
  // guardianReminders.js dispatchReminder().
  const guardianIds = await resolveGuardiansForAudience({
    targetClasses: requestedClasses,
    allClasses: !!allClasses,
    guardianStudentIds: guardianStudentIds || [],
  });
  await notifyGuardians(guardianIds, { title, body, url: "/guardian/feed" });
  res.status(201).json(post);
}));

router.delete("/:id", async (req, res) => {
  const existing = await getPost(req.params.id);
  if (!existing) return res.status(404).json({ error: "Post not found" });

  if (req.teacherClasses) {
    // A Teacher can only remove their own posts, and only while the class
    // is still one of theirs (an Admin may have reassigned it away since
    // the post was made — that shouldn't hand back delete rights).
    if (existing.teacherId !== req.user.id || !req.teacherClasses.includes(existing.class)) {
      return res.status(403).json({ error: "শুধু নিজের পোস্ট মুছে ফেলা যায়" });
    }
  }

  await deletePost(req.params.id);
  await recordAudit({
    action: "class_post.deleted",
    actor: req.user,
    entityType: "class_post",
    entityId: existing.id,
    label: `Deleted ${existing.type} post for ${existing.class}: ${existing.title}`,
  });
  res.json({ ok: true });
});

module.exports = router;

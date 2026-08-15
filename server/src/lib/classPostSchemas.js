// server/src/lib/classPostSchemas.js
//
// Zod schema for routes/assignments.js. Business rules that need a DB
// lookup (is `class` one this Teacher is actually assigned, does it exist
// in the tenant's class-tree, does the audience contain at least one
// target) still live in the route handler — same split as every other
// *Schemas.js file in this codebase.

const { z } = require("zod");

const POST_TYPES = ["notice", "assignment", "message"];

// Mirrors the allowlist already enforced server-side at upload time in
// routes/uploads.js (image or PDF, <=1MB) — this schema only re-checks the
// MIME type here (an attachment is a URL reference to an already-uploaded
// Cloudinary asset by this point, not raw file bytes, so there's no size
// to re-check), as defense-in-depth against a client sending back a
// tampered attachments array with an unsupported type.
const ALLOWED_ATTACHMENT_MIMES = ["image/jpeg", "image/png", "application/pdf"];

const classPostAttachmentSchema = z.object({
  url: z.string().trim().url("সঠিক ফাইল লিংক আবশ্যক").max(500),
  name: z.string().trim().max(200).optional().default(""),
  mime: z.enum(ALLOWED_ATTACHMENT_MIMES, {
    errorMap: () => ({ message: "শুধু ছবি (JPG/PNG) অথবা PDF ফাইল যুক্ত করা যাবে" }),
  }),
  size: z.coerce.number().int().nonnegative().optional().default(0),
});

// Ad-hoc (docs/CURRENT_TASK.md) — multi-target audience. `class` is kept as
// the single required field it always was, so a plain Teacher post (the
// only kind Teacher is allowed to make — see routes/assignments.js) is
// unchanged byte-for-byte from before this. Everything below is optional
// and additive, only ever populated by an Admin/Super Admin request.
//   - targetClasses: extra classes beyond `class` itself (a "নির্দিষ্ট
//     ক্লাস" multi-pick, or a "সকল বিভাগ" department pick already expanded
//     to its leaf classes client-side). `class` is always folded into this
//     list server-side too, so callers only need to read targetClasses.
//   - allClasses / publicSite: plain broadcast flags.
//   - guardianStudentIds: "নির্দিষ্ট গার্ডিয়ান" — student ids whose
//     guardian(s) should receive this regardless of class.
const classPostCreateSchema = z.object({
  type: z.enum(POST_TYPES, { errorMap: () => ({ message: "ধরন নোটিশ/অ্যাসাইনমেন্ট/বার্তার একটি হতে হবে" }) }),
  class: z.string().trim().max(60).optional().default(""),
  title: z.string().trim().min(1, "শিরোনাম আবশ্যক").max(200),
  body: z.string().trim().max(5000).optional().default(""),
  // Capped at 5 — a class post is a notice/assignment/short message, not a
  // file-sharing drop; keeps the jsonb column and the guardian feed
  // payload small.
  attachments: z.array(classPostAttachmentSchema).max(5, "সর্বোচ্চ ৫টি ফাইল যুক্ত করা যাবে").optional().default([]),
  targetClasses: z.array(z.string().trim().min(1).max(60)).max(100, "একসাথে সর্বোচ্চ ১০০টি ক্লাস নির্বাচন করা যাবে").optional().default([]),
  allClasses: z.boolean().optional().default(false),
  publicSite: z.boolean().optional().default(false),
  guardianStudentIds: z.array(z.coerce.number().int().positive()).max(200, "একসাথে সর্বোচ্চ ২০০ জন শিক্ষার্থী নির্বাচন করা যাবে").optional().default([]),
});

module.exports = { POST_TYPES, classPostCreateSchema };

// server/src/lib/classPostSchemas.js
//
// Zod schema for routes/assignments.js. Business rules that need a DB
// lookup (is `class` one this Teacher is actually assigned, does it exist
// in the tenant's class-options list) still live in the route handler —
// same split as every other *Schemas.js file in this codebase.

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

const classPostCreateSchema = z.object({
  type: z.enum(POST_TYPES, { errorMap: () => ({ message: "ধরন নোটিশ/অ্যাসাইনমেন্ট/বার্তার একটি হতে হবে" }) }),
  class: z.string().trim().min(1, "ক্লাস আবশ্যক").max(60),
  title: z.string().trim().min(1, "শিরোনাম আবশ্যক").max(200),
  body: z.string().trim().max(5000).optional().default(""),
  // Capped at 5 — a class post is a notice/assignment/short message, not a
  // file-sharing drop; keeps the jsonb column and the guardian feed
  // payload small.
  attachments: z.array(classPostAttachmentSchema).max(5, "সর্বোচ্চ ৫টি ফাইল যুক্ত করা যাবে").optional().default([]),
});

module.exports = { POST_TYPES, classPostCreateSchema };

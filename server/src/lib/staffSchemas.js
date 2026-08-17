// server/src/lib/staffSchemas.js
//
// Zod schemas for routes/staff.js — same split as opsSchemas.js/
// financeSchemas.js: this only guarantees shape/type, not business rules
// that need a DB lookup (e.g. "userId must point at an existing, unlinked
// user" stays in the route handler).

const { z } = require("zod");

const STAFF_STATUSES = ["Active", "Inactive"];

const staffCreateSchema = z.object({
  name: z.string().trim().min(1, "নাম আবশ্যক").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  designation: z.string().trim().min(1, "পদবি আবশ্যক").max(60),
  class: z.string().trim().max(60).optional().default(""),
  joiningDate: z.string().trim().max(10).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  // Optional link to an existing software-login account (server/src/routes/
  // users.js) — validated for existence in the route handler, not here.
  userId: z.coerce.number().int().positive().optional().nullable(),
  // docs/STAFF_ATTENDANCE_PLAN.md, Phase 7 — device-punch enrollment,
  // same optional fingerprintId/cardUid pattern as students (see
  // routes/students.js's admissionSchema). Cross-table + cross-row
  // uniqueness is checked in the route handler, not here (needs a DB
  // lookup, same reasoning as the userId comment above).
  fingerprintId: z.string().trim().max(120).optional().default(""),
  cardUid: z.string().trim().max(120).optional().default(""),
  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 3 — optional shift assignment.
  // Existence checked in the route handler (needs a DB lookup), same
  // split as userId above.
  shiftId: z.coerce.number().int().positive().optional().nullable(),
});

// PATCH: every field optional (partial update), including the status
// toggle used instead of a hard DELETE (see plan doc §6, open question 2).
const staffUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  designation: z.string().trim().min(1).max(60).optional(),
  class: z.string().trim().max(60).optional(),
  joiningDate: z.string().trim().max(10).optional(),
  note: z.string().trim().max(500).optional(),
  userId: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(STAFF_STATUSES, { errorMap: () => ({ message: "Active অথবা Inactive হতে হবে" }) }).optional(),
  fingerprintId: z.string().trim().max(120).optional(),
  cardUid: z.string().trim().max(120).optional(),
  shiftId: z.coerce.number().int().positive().optional().nullable(),
});

module.exports = { staffCreateSchema, staffUpdateSchema, STAFF_STATUSES };

// server/src/lib/shiftSchemas.js
//
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 2 — Zod schemas for routes/shifts.js.
// Same split as opsSchemas.js/staffSchemas.js: this only guarantees
// shape/type, not business rules that need a DB lookup (e.g. "this shift
// is still referenced by a class/staff row" stays in the route handler).

const { z } = require("zod");

// 'HH:MM', 24-hour — matches how every other time-ish value in this
// project is stored as plain text rather than a DB time type (see
// supabase_schema.sql's comment on attendance.entryTime/exitTime).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeField = () => z.string().trim().regex(TIME_RE, "সময় অবশ্যই HH:MM (২৪-ঘণ্টা) ফরম্যাটে দিতে হবে");

const shiftCreateSchema = z.object({
  name: z.string().trim().min(1, "শিফটের নাম আবশ্যক").max(80),
  nameEn: z.string().trim().max(80).optional().default(""),
  startTime: timeField(),
  endTime: timeField(),
  // Capped at 180 (3 hours) — a grace period longer than that almost
  // certainly means the wrong number was typed, not a real institutional
  // policy; the field stays free-form within that cap rather than an enum
  // since minute-level values vary institution to institution.
  graceMinutes: z.coerce.number().int().min(0).max(180).optional().default(0),
});

// PATCH: every field optional (partial update), plus the active toggle —
// no hard DELETE route (see routes/shifts.js header comment for why).
const shiftUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  nameEn: z.string().trim().max(80).optional(),
  startTime: timeField().optional(),
  endTime: timeField().optional(),
  graceMinutes: z.coerce.number().int().min(0).max(180).optional(),
  active: z.boolean().optional(),
});

// docs/SHIFT_SCHEDULE_PLAN.md, Phase 3 — bulk class->shift map save, same
// "send the whole map, replace it" pattern as lib/classOptions.js's
// saveClassOptions. shiftId is coerced/validated for shape here; whether
// it actually points at an existing shift row is a DB lookup, checked in
// the route handler (same split as userId in staffSchemas.js).
const classShiftMapSchema = z.object({
  assignments: z
    .array(
      z.object({
        class: z.string().trim().min(1).max(60),
        shiftId: z.coerce.number().int().positive(),
      })
    )
    .max(200, "একবারে সর্বোচ্চ ২০০টা ক্লাস-শিফট বরাদ্দ পাঠানো যাবে"),
});

module.exports = { shiftCreateSchema, shiftUpdateSchema, classShiftMapSchema };

// server/src/lib/guardianReminderSchemas.js
//
// Zod schema for routes/guardianReminders.js. Business rules that need a
// DB lookup (does targetClass/targetStudentId actually exist) still live
// in the route handler — same split as every other *Schemas.js file in
// this codebase (see lib/classPostSchemas.js).

const { z } = require("zod");

const TARGET_TYPES = ["all", "class", "student", "feeDue", "lateArrival", "attendanceMissing", "selectedStudents"];
const SCHEDULE_TYPES = ["once", "daily", "specificDate"];

const guardianReminderCreateSchema = z
  .object({
    title: z.string().trim().min(1, "শিরোনাম আবশ্যক").max(200),
    body: z.string().trim().min(1, "বার্তা আবশ্যক").max(2000),
    targetType: z.enum(TARGET_TYPES, { errorMap: () => ({ message: "সঠিক টার্গেট নির্বাচন আবশ্যক" }) }),
    targetClass: z.string().trim().max(60).optional().default(""),
    targetStudentId: z.coerce.number().int().positive().optional().nullable(),
    scheduleType: z.enum(SCHEDULE_TYPES, { errorMap: () => ({ message: "শিডিউল একবার/প্রতিদিন/নির্দিষ্ট তারিখের একটি হতে হবে" }) }),
    // 'YYYY-MM-DD' — required only for scheduleType 'specificDate'.
    scheduleDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "সঠিক তারিখ আবশ্যক")
      .optional()
      .nullable(),
    // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 4 — the three conditional
    // schedule fields. All optional at the base-object level; the .refine()
    // calls below enforce which target types actually require them.
    scheduleTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "সঠিক সময় (HH:MM) আবশ্যক")
      .optional()
      .nullable(),
    intervalDays: z.coerce.number().int().min(1).max(30).optional().default(1),
    selectedStudentIds: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine((d) => d.targetType !== "class" || d.targetClass, {
    message: "ক্লাস নির্বাচন আবশ্যক",
    path: ["targetClass"],
  })
  .refine((d) => d.targetType !== "student" || d.targetStudentId, {
    message: "ছাত্র নির্বাচন আবশ্যক",
    path: ["targetStudentId"],
  })
  .refine((d) => d.scheduleType !== "specificDate" || d.scheduleDate, {
    message: "তারিখ নির্বাচন আবশ্যক",
    path: ["scheduleDate"],
  })
  .refine((d) => !["lateArrival", "attendanceMissing"].includes(d.targetType) || d.targetClass, {
    message: "ক্লাস নির্বাচন আবশ্যক",
    path: ["targetClass"],
  })
  .refine((d) => !["feeDue", "lateArrival", "attendanceMissing"].includes(d.targetType) || d.scheduleTime, {
    message: "সময় নির্বাচন আবশ্যক",
    path: ["scheduleTime"],
  })
  .refine((d) => d.targetType !== "selectedStudents" || (d.selectedStudentIds && d.selectedStudentIds.length > 0), {
    message: "অন্তত একজন ছাত্র নির্বাচন আবশ্যক",
    path: ["selectedStudentIds"],
  });

// Only the active flag is editable after creation — same "no update
// endpoint, only create/list/delete" scope as class_posts, plus this one
// toggle so an admin can pause a 'daily' reminder without deleting its
// history.
const guardianReminderUpdateSchema = z.object({
  active: z.boolean(),
});

module.exports = { TARGET_TYPES, SCHEDULE_TYPES, guardianReminderCreateSchema, guardianReminderUpdateSchema };

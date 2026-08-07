// server/src/lib/guardianReminderSchemas.js
//
// Zod schema for routes/guardianReminders.js. Business rules that need a
// DB lookup (does targetClass/targetStudentId actually exist) still live
// in the route handler — same split as every other *Schemas.js file in
// this codebase (see lib/classPostSchemas.js).

const { z } = require("zod");

const TARGET_TYPES = ["all", "class", "student"];
const SCHEDULE_TYPES = ["once", "daily", "specificDate"];

const guardianReminderCreateSchema = z
  .object({
    title: z.string().trim().min(1, "শিরোনাম আবশ্যক").max(200),
    body: z.string().trim().min(1, "বার্তা আবশ্যক").max(2000),
    targetType: z.enum(TARGET_TYPES, { errorMap: () => ({ message: "টার্গেট সব/ক্লাস/ছাত্রের একটি হতে হবে" }) }),
    targetClass: z.string().trim().max(60).optional().default(""),
    targetStudentId: z.coerce.number().int().positive().optional().nullable(),
    scheduleType: z.enum(SCHEDULE_TYPES, { errorMap: () => ({ message: "শিডিউল একবার/প্রতিদিন/নির্দিষ্ট তারিখের একটি হতে হবে" }) }),
    // 'YYYY-MM-DD' — required only for scheduleType 'specificDate'.
    scheduleDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "সঠিক তারিখ আবশ্যক")
      .optional()
      .nullable(),
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
  });

// Only the active flag is editable after creation — same "no update
// endpoint, only create/list/delete" scope as class_posts, plus this one
// toggle so an admin can pause a 'daily' reminder without deleting its
// history.
const guardianReminderUpdateSchema = z.object({
  active: z.boolean(),
});

module.exports = { TARGET_TYPES, SCHEDULE_TYPES, guardianReminderCreateSchema, guardianReminderUpdateSchema };

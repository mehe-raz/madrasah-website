// server/src/lib/opsSchemas.js
//
// Zod schemas for the routes that previously had only ad-hoc/no shape
// validation: expenses, attendance, hifz. (students.js, income.js, and
// results.js already run comparable hand-written validation of similar
// strength — validateAdmission() / lib/results.js's upsertResult / income's
// own category+amount checks — so converting those too was left out of this
// batch to keep the diff reviewable; flagging here in case that's wanted
// as a follow-up.)

const { z } = require("zod");

const expenseCreateSchema = z.object({
  cat: z.string().trim().min(1, "ক্যাটাগরি আবশ্যক").max(60),
  amount: z.coerce.number().positive("সঠিক পরিমাণ আবশ্যক"),
  note: z.string().trim().max(300).optional().default(""),
});

const ATTENDANCE_STATUSES = ["উপস্থিত", "অনুপস্থিত", "দেরিতে"];

const attendanceRecordSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  status: z.enum(ATTENDANCE_STATUSES),
});

const attendanceSaveSchema = z.object({
  date: z.string().trim().min(1).max(10).optional(),
  records: z.array(attendanceRecordSchema).max(5000, "একবারে সর্বোচ্চ ৫০০০ রেকর্ড পাঠানো যাবে"),
});

const hifzParaSchema = z.object({
  para: z.coerce.number().int().min(0).max(30, "পারা ০-৩০ এর মধ্যে হতে হবে"),
});

const hifzSabaqSchema = z.object({
  sabaq: z.string().trim().max(1000).optional().default(""),
});

module.exports = {
  expenseCreateSchema,
  attendanceSaveSchema,
  hifzParaSchema,
  hifzSabaqSchema,
};

// server/src/lib/opsSchemas.js
//
// Zod schemas for expenses, attendance, hifz — these had only ad-hoc/no
// shape validation before. (income.js and results.js are now covered by
// lib/financeSchemas.js. students.js's validateAdmission() is deliberately
// left as-is: it's already a thorough, well-tested required-field +
// enum-whitelist + document-shape validator, and converting it to Zod would
// be a large rewrite of business logic for little extra safety — higher
// regression risk than value for this batch.)

const { z } = require("zod");

const expenseCreateSchema = z.object({
  cat: z.string().trim().min(1, "ক্যাটাগরি আবশ্যক").max(60),
  // The `expenses.amount` column is `integer` (see sql/supabase_schema.sql) —
  // without .int() here, a decimal amount (e.g. "500.50") passed validation
  // and was only rejected by Postgres at INSERT time, as an uncaught error
  // that surfaced to the user as a bare, unexplained "HTTP 500" with the
  // entry never saved. Enforcing it here turns that into a clean, in-form
  // 400 message instead.
  amount: z.coerce.number().int("পূর্ণ সংখ্যা লিখুন (টাকা, দশমিক ছাড়া)").positive("সঠিক পরিমাণ আবশ্যক"),
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

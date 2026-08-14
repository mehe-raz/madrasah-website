// server/src/lib/financeSchemas.js
//
// Zod schemas for income.js and results.js. These only guarantee shape/type
// (right field, right type) — business rules that need a DB lookup (category
// must be a currently-configured category, student must exist, etc.) stay in
// the route handlers, same split as authSchemas.js/passwordPolicy.js.

const { z } = require("zod");
const { EXAM_TYPE_VALUES } = require("./examTypes");

// `income.amount` (and `payments.amount`, which a Student Fee income entry
// also writes to) is an `integer` column in sql/supabase_schema.sql. Without
// .int(), a decimal amount (e.g. from a stray "." while typing) passed this
// check and only failed at the database INSERT — an uncaught error that
// reached the user as an unexplained "HTTP 500" with nothing saved, instead
// of a normal in-form validation message.
const incomeCreateSchema = z.object({
  category: z.string().trim().min(1, "ক্যাটাগরি আবশ্যক"),
  amount: z.coerce.number().int("পূর্ণ সংখ্যা লিখুন (টাকা, দশমিক ছাড়া)").positive("সঠিক পরিমাণ আবশ্যক"),
  note: z.string().trim().max(300).optional(),
  method: z.string().trim().max(40).optional(),
  studentId: z.coerce.number().int().positive().optional().nullable(),
  date: z.string().trim().max(10).optional(),
});

// PATCH: every field optional (partial update), but if present must still
// be the right shape/type — this is what was previously missing (a bad
// `amount` string would have silently become NaN and hit the database).
const incomeUpdateSchema = z.object({
  category: z.string().trim().min(1).optional(),
  amount: z.coerce.number().int("পূর্ণ সংখ্যা লিখুন (টাকা, দশমিক ছাড়া)").positive("সঠিক পরিমাণ আবশ্যক").optional(),
  note: z.string().trim().max(300).optional(),
  method: z.string().trim().max(40).optional(),
  date: z.string().trim().max(10).optional(),
});

const resultSubjectSchema = z.object({
  name: z.string().trim().max(60).optional(),
  marks: z.coerce.number().optional(),
  fullMarks: z.coerce.number().optional(),
});

const resultSaveSchema = z.object({
  studentId: z.coerce.number().int().positive("শিক্ষার্থী নির্বাচন আবশ্যক"),
  examName: z.string().trim().min(1, "পরীক্ষার নাম আবশ্যক").max(80),
  year: z.string().trim().min(1, "বছর আবশ্যক").max(4),
  subjects: z.array(resultSubjectSchema).max(20).optional().default([]),
  gpa: z.string().trim().max(10).optional(),
  grade: z.string().trim().max(10).optional(),
});

// Part 2 (docs/CURRENT_TASK.md) will add the route that uses this — defined
// here in Part 1 alongside the exam-type list since both land together.
// Unlike resultSaveSchema (free-text examName, single student), this is for
// the batch entry screen: one subject, one exam, entered for many students
// in one request — so examName is locked to the fixed list (EXAM_TYPE_VALUES)
// instead of free text.
const resultSubjectBatchSchema = z.object({
  class: z.string().trim().min(1, "ক্লাস আবশ্যক"),
  examName: z.enum(EXAM_TYPE_VALUES, { errorMap: () => ({ message: "পরীক্ষার ধরন তালিকা থেকে নির্বাচন করুন" }) }),
  year: z.string().trim().min(1, "শিক্ষাবর্ষ আবশ্যক").max(4),
  subjectName: z.string().trim().min(1, "বিষয়ের নাম আবশ্যক").max(60),
  fullMarks: z.coerce.number().positive("সঠিক পূর্ণমান আবশ্যক"),
  entries: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        marks: z.coerce.number(),
      })
    )
    .min(1, "অন্তত একজন শিক্ষার্থীর নম্বর আবশ্যক")
    .max(200),
});

// Bulk publish/unpublish from the checkbox-select UI on the results screen —
// a list of result row ids plus the target published state, applied to all
// of them in one call.
const resultPublishBatchSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "অন্তত একটি ফলাফল নির্বাচন করুন").max(200),
  published: z.boolean(),
});

module.exports = {
  incomeCreateSchema,
  incomeUpdateSchema,
  resultSaveSchema,
  resultSubjectBatchSchema,
  resultPublishBatchSchema,
};

// server/src/lib/financeSchemas.js
//
// Zod schemas for income.js and results.js. These only guarantee shape/type
// (right field, right type) — business rules that need a DB lookup (category
// must be a currently-configured category, student must exist, etc.) stay in
// the route handlers, same split as authSchemas.js/passwordPolicy.js.

const { z } = require("zod");

const incomeCreateSchema = z.object({
  category: z.string().trim().min(1, "ক্যাটাগরি আবশ্যক"),
  amount: z.coerce.number().positive("সঠিক পরিমাণ আবশ্যক"),
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
  amount: z.coerce.number().positive("সঠিক পরিমাণ আবশ্যক").optional(),
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
  studentId: z.coerce.number().int().positive("ছাত্র নির্বাচন আবশ্যক"),
  examName: z.string().trim().min(1, "পরীক্ষার নাম আবশ্যক").max(80),
  year: z.string().trim().min(1, "বছর আবশ্যক").max(4),
  subjects: z.array(resultSubjectSchema).max(20).optional().default([]),
  gpa: z.string().trim().max(10).optional(),
  grade: z.string().trim().max(10).optional(),
});

module.exports = {
  incomeCreateSchema,
  incomeUpdateSchema,
  resultSaveSchema,
};

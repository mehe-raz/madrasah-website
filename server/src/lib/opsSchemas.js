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

// docs/SHIFT_SCHEDULE_PLAN.md, Phase 4 — entryTime/exitTime accepted here
// now (optional, unused by routes/attendance.js yet) so the field exists
// ahead of the Phase 8 UI that will actually send it; omitting it keeps
// today's manual-save behavior identical.
const attendanceRecordSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  status: z.enum(ATTENDANCE_STATUSES),
  entryTime: z.string().trim().max(40).optional(),
  exitTime: z.string().trim().max(40).optional(),
});

const attendanceSaveSchema = z.object({
  date: z.string().trim().min(1).max(10).optional(),
  records: z.array(attendanceRecordSchema).max(5000, "একবারে সর্বোচ্চ ৫০০০ রেকর্ড পাঠানো যাবে"),
});

// docs/STAFF_ATTENDANCE_PLAN.md, Phase 3 — same 3-state vocabulary as
// student attendance (plan doc §6, open question 3 defaulted to "no
// separate Leave status for now"), just keyed by staffId instead of
// studentId. A much smaller cap than the 5000-record student version is
// enough here — an institution's staff count is a handful to a few dozen,
// never thousands.
// Phase 4 — same optional entryTime/exitTime prep as attendanceRecordSchema
// above.
const staffAttendanceRecordSchema = z.object({
  staffId: z.coerce.number().int().positive(),
  status: z.enum(ATTENDANCE_STATUSES),
  entryTime: z.string().trim().max(40).optional(),
  exitTime: z.string().trim().max(40).optional(),
});

const staffAttendanceSaveSchema = z.object({
  date: z.string().trim().min(1).max(10).optional(),
  records: z.array(staffAttendanceRecordSchema).max(500, "একবারে সর্বোচ্চ ৫০০ রেকর্ড পাঠানো যাবে"),
});

const hifzParaSchema = z.object({
  para: z.coerce.number().int().min(0).max(30, "পারা ০-৩০ এর মধ্যে হতে হবে"),
});

const hifzSabaqSchema = z.object({
  sabaq: z.string().trim().max(1000).optional().default(""),
});

// docs/ATTENDANCE_DEVICE_PLAN.md Phase 2 — device-facing punch + admin
// device-management schemas. Kept in this file alongside attendance*
// above rather than a new file, since these are also attendance-domain
// validation and this file is already the "ops" catch-all (see file
// header comment).
const devicePunchSchema = z.object({
  deviceId: z.string().trim().min(1, "ডিভাইস আইডি আবশ্যক").max(100),
  secretKey: z.string().trim().min(1, "সিক্রেট কী আবশ্যক").max(200),
  identifier: z.string().trim().min(1, "fingerprintId/cardUid আবশ্যক").max(200),
  identifierType: z.enum(["fingerprint", "card"]),
});

// docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 1 — "ধরন"
// field. Defaults to push_adms (the common case) so the selfservice plan's
// existing create form keeps working unchanged until it's updated to send
// this explicitly.
const DEVICE_PROTOCOLS = ["push_adms", "key_reader", "pull_sdk"];

const attendanceDeviceCreateSchema = z.object({
  deviceId: z.string().trim().min(1, "ডিভাইস আইডি আবশ্যক").max(100),
  name: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
  protocol: z.enum(DEVICE_PROTOCOLS).optional().default("push_adms"),
});

const attendanceDeviceUpdateSchema = z.object({
  name: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  active: z.boolean().optional(),
});

module.exports = {
  expenseCreateSchema,
  attendanceSaveSchema,
  staffAttendanceSaveSchema,
  ATTENDANCE_STATUSES,
  hifzParaSchema,
  hifzSabaqSchema,
  devicePunchSchema,
  attendanceDeviceCreateSchema,
  attendanceDeviceUpdateSchema,
  DEVICE_PROTOCOLS,
};

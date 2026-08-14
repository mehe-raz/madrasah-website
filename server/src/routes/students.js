const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { idempotent } = require("../middleware/idempotency");
const { isUniqueViolation } = require("../pg");
const PDFDocument = require("pdfkit");
const {
  RETURNING_COLUMNS,
  LIST_COLUMNS,
  admissionFromBody,
  normalizeDocuments,
  validateAdmission,
  validateDocuments,
} = require("../models/studentAdmission");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
router.use(requirePermission("students"));

const INSERT_COLUMNS = [
  ["name", "name"],
  ['"nameEn"', "nameEn"],
  ["roll", "roll"],
  ["class", "class"],
  ["dept", "dept"],
  ["type", "type"],
  ["fee", "fee"],
  ["due", "due"],
  ["phone", "phone"],
  ["blood", "blood"],
  ["para", "para"],
  ["status", "status"],
  ['"admissionNumber"', "admissionNumber"],
  ['"admissionDate"', "admissionDate"],
  ['"academicYear"', "academicYear"],
  ["session", "session"],
  ["section", "section"],
  ['"dateOfBirth"', "dateOfBirth"],
  ['"birthRegistrationNumber"', "birthRegistrationNumber"],
  ["gender", "gender"],
  ["religion", "religion"],
  ['"studentPhoto"', "studentPhoto"],
  ['"fatherName"', "fatherName"],
  ['"fatherMobile"', "fatherMobile"],
  ['"fatherOccupation"', "fatherOccupation"],
  ['"motherName"', "motherName"],
  ['"motherMobile"', "motherMobile"],
  ['"motherOccupation"', "motherOccupation"],
  ['"guardianName"', "guardianName"],
  ['"guardianRelationship"', "guardianRelationship"],
  ['"guardianMobile"', "guardianMobile"],
  ['"presentAddress"', "presentAddress"],
  ['"permanentAddress"', "permanentAddress"],
  ["district", "district"],
  ["upazila", "upazila"],
  ['"postOffice"', "postOffice"],
  ["village", "village"],
  ['"previousInstitution"', "previousInstitution"],
  ['"previousClass"', "previousClass"],
  ['"admissionFee"', "admissionFee"],
  ["discount", "discount"],
  ["documents", "documents"],
  // docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2A
  ['"fingerprintId"', "fingerprintId"],
  ['"cardUid"', "cardUid"],
];

const UPDATE_COLUMNS = INSERT_COLUMNS.filter(([column]) => column !== "documents");

async function getSettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

async function nextAdmissionNumber(admissionDate) {
  const year = String(admissionDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const prefix = `ADM-${year}-`;
  const row = await db.get(
    `SELECT "admissionNumber" FROM students
     WHERE "admissionNumber" LIKE $1
     ORDER BY "admissionNumber" DESC
     LIMIT 1`,
    [`${prefix}%`]
  );
  const last = Number(String(row?.admissionNumber || "").slice(prefix.length)) || 0;
  return `${prefix}${String(last + 1).padStart(4, "0")}`;
}

async function duplicateError(admission, excludeId) {
  if (admission.birthRegistrationNumber) {
    const row = await db.get(
      `SELECT id FROM students WHERE "birthRegistrationNumber" = $1 AND ($2::int IS NULL OR id <> $2)`,
      [admission.birthRegistrationNumber, excludeId || null]
    );
    if (row) return "Birth registration number already exists";
  }

  if (admission.admissionNumber) {
    const row = await db.get(
      `SELECT id FROM students WHERE "admissionNumber" = $1 AND ($2::int IS NULL OR id <> $2)`,
      [admission.admissionNumber, excludeId || null]
    );
    if (row) return "Admission number already exists";
  }

  // docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2A — same partial-
  // unique pattern as birthRegistrationNumber/admissionNumber above,
  // matching the students_fingerprint_id_unique/students_card_uid_unique
  // indexes in server/sql/supabase_schema.sql.
  if (admission.fingerprintId) {
    const row = await db.get(
      `SELECT id FROM students WHERE "fingerprintId" = $1 AND ($2::int IS NULL OR id <> $2)`,
      [admission.fingerprintId, excludeId || null]
    );
    if (row) return "This fingerprint ID is already linked to another student";
  }

  if (admission.cardUid) {
    const row = await db.get(
      `SELECT id FROM students WHERE "cardUid" = $1 AND ($2::int IS NULL OR id <> $2)`,
      [admission.cardUid, excludeId || null]
    );
    if (row) return "This card UID is already linked to another student";
  }

  return "";
}

function admissionValues(admission, columns = INSERT_COLUMNS) {
  return columns.map(([, key]) => (key === "documents" ? JSON.stringify(admission.documents || {}) : admission[key]));
}

function constraintError(err) {
  if (!db.isUniqueViolation?.(err)) return "";
  if (err.constraint === "students_admission_number_unique") return "Admission number already exists";
  if (err.constraint === "students_birth_registration_unique") return "Birth registration number already exists";
  // docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2A
  if (err.constraint === "students_fingerprint_id_unique") return "This fingerprint ID is already linked to another student";
  if (err.constraint === "students_card_uid_unique") return "This card UID is already linked to another student";
  return "Duplicate student admission value";
}

async function logoBuffer(logo) {
  const value = String(logo || "");
  if (!value) return null;

  if (value.startsWith("data:image/")) {
    const base64 = value.split(",")[1];
    if (!base64) return null;
    try {
      return Buffer.from(base64, "base64");
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const response = await fetch(value);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  return null;
}

router.get("/classes/list", async (_req, res) => {
  const rows = await db.all("SELECT DISTINCT class FROM students WHERE class != '' ORDER BY class");
  res.json(rows.map((r) => r.class));
});

const CALL_MONTH_RE = /^\d{4}-\d{2}$/;

// Reports > কল-লিস্ট ফিচার (docs/CALL_LIST_PLAN.md, Phase 1).
// Literal "/call-log" route — must stay above "/:id" below, otherwise
// Express would match a GET here as "/:id" with id="call-log" first.
router.get("/call-log", async (req, res) => {
  const month = String(req.query.month || "").trim();
  if (!CALL_MONTH_RE.test(month)) {
    return res.status(400).json({ error: "মাস 'YYYY-MM' ফরম্যাটে দিতে হবে" });
  }
  const rows = await db.all(
    `SELECT "studentId", "calledBy", "calledAt" FROM student_call_log WHERE "callMonth" = $1`,
    [month]
  );
  res.json(rows);
});

router.get("/:id/attendance", async (req, res) => {
  const { from, to, month, all } = req.query;
  const isAll = String(all || "").toLowerCase() === "true" || String(all || "") === "1";
  let f = from;
  let t = to;
  if (month) {
    f = `${month}-01`;
    const [y, m] = String(month).split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    t = `${month}-${String(last).padStart(2, "0")}`;
  }

  const rows = isAll
    ? await db.all(
        `SELECT date, status FROM attendance WHERE "studentId" = $1 ORDER BY date`,
        [req.params.id]
      )
    : await db.all(
        `SELECT date, status FROM attendance WHERE "studentId" = $1 AND date >= $2 AND date <= $3 ORDER BY date`,
        [req.params.id, f || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), t || new Date().toISOString().slice(0, 10)]
      );

  const summary = { present: 0, absent: 0, late: 0 };
  rows.forEach((r) => {
    if (r.status === "উপস্থিত") summary.present++;
    else if (r.status === "অনুপস্থিত") summary.absent++;
    else if (r.status === "দেরিতে") summary.late++;
  });
  res.json({ from: isAll ? "" : f, to: isAll ? "" : t, records: rows, summary });
});

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Real LIMIT/OFFSET pagination with the search filter applied in SQL
// (previously: fetched every matching row into memory, filtered `search`
// with a JS .includes() pass, then sliced the array for the requested
// page — so page 2 of a search still paid to transfer and scan every
// row). Same opt-in pattern as /income and /payments: only kicks in when
// the client asks for it (page/limit/paginate present in the query
// string), so the existing plain-array callers (getStudents, used by
// export reports) keep working unchanged.
router.get("/", async (req, res) => {
  const { dept, search, status, class: cls } = req.query;
  const conditions = [];
  const params = [];
  if (status && status !== "All" && status !== "সব") {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (cls) {
    params.push(cls);
    conditions.push(`class = $${params.length}`);
  }
  if (dept && dept !== "All" && dept !== "সব") {
    params.push(dept);
    conditions.push(`dept = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(
      `(name ILIKE $${idx} OR "nameEn" ILIKE $${idx} OR roll ILIKE $${idx} OR "admissionNumber" ILIKE $${idx} OR "birthRegistrationNumber" ILIKE $${idx})`
    );
  }
  // dueOnly: used by the Fees "Due" tab so it can paginate/total students
  // with outstanding balances in SQL instead of the client fetching every
  // active student (previously capped at 100) and filtering due>0 in JS.
  const dueOnly = req.query.dueOnly === "1" || req.query.dueOnly === "true";
  if (dueOnly) {
    conditions.push(`due > 0`);
  }
  // riskOnly: "Risk Zone" — students with an estimated 2+ months of unpaid
  // fees (due ÷ fee, floored). Per-month payments aren't tracked separately
  // in this schema, so this is an approximation off the accumulated `due`
  // balance. fee = 0 is excluded to avoid a division by zero (and because a
  // 0-fee student can never be "behind"). Only currently active students are
  // considered, matching the existing dueOnly/status filter convention.
  const riskOnly = req.query.riskOnly === "1" || req.query.riskOnly === "true";
  if (riskOnly) {
    conditions.push(`status = 'Active' AND fee > 0 AND FLOOR(due::numeric / fee) >= 2`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // Computed alongside LIST_COLUMNS (not folded into that shared constant,
  // since it's also reused by routes/hifz.js where it isn't needed) so the
  // client can show/sort on "months unpaid" without recomputing due÷fee
  // itself. NULLIF avoids a division-by-zero for fee = 0 rows.
  const selectColumns = `${LIST_COLUMNS}, FLOOR(due::numeric / NULLIF(fee, 0))::int AS "monthsUnpaid"`;

  const paginate = req.query.paginate === "1" || req.query.paginate === "true" || req.query.page != null || req.query.limit != null;
  if (paginate) {
    const limit = clampInt(req.query.limit, 25, 1, 200);
    const page = clampInt(req.query.page, 1, 1, 100000);
    const offset = (page - 1) * limit;
    const orderBy = dueOnly || riskOnly ? "due DESC, roll" : "roll";
    const totalRow = await db.get(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(due), 0)::int AS "totalDue" FROM students ${where}`,
      params
    );
    const total = totalRow?.total || 0;
    const items = await db.all(
      `SELECT ${selectColumns} FROM students ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      // Only meaningful (and only sent) for the dueOnly/riskOnly queries —
      // sum of `due` across every matching row, not just the current page.
      ...(dueOnly || riskOnly ? { totalDue: totalRow?.totalDue || 0 } : {}),
    });
  }

  const rows = await db.all(`SELECT ${selectColumns} FROM students ${where} ORDER BY roll`, params);
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const row = await db.get(`SELECT ${RETURNING_COLUMNS} FROM students WHERE id = $1`, [req.params.id]);
  if (!row) return res.status(404).json({ error: "শিক্ষার্থী পাওয়া যায়নি" });

  const attendanceRows = await db.all('SELECT status FROM attendance WHERE "studentId" = $1', [req.params.id]);
  const attendanceSummary = {
    total: attendanceRows.length,
    present: 0,
    absent: 0,
    late: 0,
  };
  attendanceRows.forEach((r) => {
    if (r.status === "উপস্থিত") attendanceSummary.present++;
    else if (r.status === "অনুপস্থিত") attendanceSummary.absent++;
    else if (r.status === "দেরিতে") attendanceSummary.late++;
  });

  res.json({ ...row, attendanceSummary });
});

router.post("/", idempotent(async (req, res) => {
  const student = admissionFromBody(req.body, { status: "Active", due: 0, discount: 0, para: 0 });
  if (!student.admissionNumber) student.admissionNumber = await nextAdmissionNumber(student.admissionDate);

  const errors = validateAdmission(student);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed", errors });

  const duplicate = await duplicateError(student);
  if (duplicate) return res.status(409).json({ error: duplicate });

  const columns = INSERT_COLUMNS.map(([column]) => column).join(", ");
  const placeholders = INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");

  try {
    const result = await db.run(
      `INSERT INTO students (${columns})
       VALUES (${placeholders})
       RETURNING id`,
      admissionValues(student)
    );
    const created = await db.get(`SELECT ${RETURNING_COLUMNS} FROM students WHERE id = $1`, [result.insertId]);
    await recordAudit({
      action: "student.created",
      actor: req.user,
      entityType: "student",
      entityId: created.id,
      label: `Admitted ${created.name} (Roll ${created.roll})`,
      details: { roll: created.roll, class: created.class, dept: created.dept, admissionNumber: created.admissionNumber },
    });
    res.status(201).json(created);
  } catch (err) {
    const duplicateMessage = constraintError(err);
    if (duplicateMessage) return res.status(409).json({ error: duplicateMessage });
    throw err;
  }
}));

router.patch("/:id", async (req, res) => {
  const existing = await db.get(`SELECT ${RETURNING_COLUMNS} FROM students WHERE id = $1`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: "শিক্ষার্থী পাওয়া যায়নি" });
  const updated = admissionFromBody(req.body, existing);

  const errors = validateAdmission(updated);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed", errors });

  const duplicate = await duplicateError(updated, existing.id);
  if (duplicate) return res.status(409).json({ error: duplicate });

  const assignments = UPDATE_COLUMNS.map(([column], i) => `${column}=$${i + 1}`).join(", ");
  const values = admissionValues(updated, UPDATE_COLUMNS);

  try {
    await db.run(
      `UPDATE students SET ${assignments}, documents=$${values.length + 1} WHERE id=$${values.length + 2}`,
      [...values, JSON.stringify(updated.documents || {}), existing.id]
    );
    const changedFields = UPDATE_COLUMNS.map(([, key]) => key).filter((key) => String(existing[key] ?? "") !== String(updated[key] ?? ""));
    await recordAudit({
      action: "student.updated",
      actor: req.user,
      entityType: "student",
      entityId: existing.id,
      label: `Updated ${updated.name} (Roll ${updated.roll})`,
      details: { changedFields },
    });
    res.json(await db.get(`SELECT ${RETURNING_COLUMNS} FROM students WHERE id = $1`, [existing.id]));
  } catch (err) {
    const duplicateMessage = constraintError(err);
    if (duplicateMessage) return res.status(409).json({ error: duplicateMessage });
    throw err;
  }
});

// Reports > কল-লিস্ট ফিচার (docs/CALL_LIST_PLAN.md, Phase 1): মার্ক করা
// ("এই মাসে কল দেওয়া হয়েছে") এবং আনমার্ক করা (ভুল করে মার্ক হয়ে গেলে)।
router.post("/:id/call-log", async (req, res) => {
  const month = String(req.body?.month || "").trim();
  if (!CALL_MONTH_RE.test(month)) {
    return res.status(400).json({ error: "মাস 'YYYY-MM' ফরম্যাটে দিতে হবে" });
  }
  const student = await db.get("SELECT id FROM students WHERE id = $1", [req.params.id]);
  if (!student) return res.status(404).json({ error: "শিক্ষার্থী পাওয়া যায়নি" });

  await db.run(
    `INSERT INTO student_call_log ("studentId", "callMonth", "calledBy", "calledAt")
     VALUES ($1, $2, $3, now())
     ON CONFLICT ("studentId", "callMonth")
     DO UPDATE SET "calledBy" = EXCLUDED."calledBy", "calledAt" = now()`,
    [student.id, month, req.user?.id || null]
  );
  res.json({ studentId: student.id, callMonth: month, called: true });
});

router.delete("/:id/call-log", async (req, res) => {
  const month = String(req.query.month || "").trim();
  if (!CALL_MONTH_RE.test(month)) {
    return res.status(400).json({ error: "মাস 'YYYY-MM' ফরম্যাটে দিতে হবে" });
  }
  await db.run(
    `DELETE FROM student_call_log WHERE "studentId" = $1 AND "callMonth" = $2`,
    [req.params.id, month]
  );
  res.json({ studentId: Number(req.params.id), callMonth: month, called: false });
});

router.patch("/:id/documents", async (req, res) => {
  const existing = await db.get(`SELECT ${RETURNING_COLUMNS} FROM students WHERE id = $1`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Student not found" });

  const documents = { ...(existing.documents || {}), ...normalizeDocuments(req.body.documents || req.body) };
  const errors = validateDocuments(documents);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed", errors });

  const studentPhoto = documents.studentPhoto || existing.studentPhoto || "";
  await db.run('UPDATE students SET documents=$1, "studentPhoto"=$2 WHERE id=$3', [
    JSON.stringify(documents),
    studentPhoto,
    existing.id,
  ]);
  res.json(await db.get(`SELECT ${RETURNING_COLUMNS} FROM students WHERE id = $1`, [existing.id]));
});

router.delete("/:id", requirePermission("*"), async (req, res) => {
  const existing = await db.get("SELECT * FROM students WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "শিক্ষার্থী পাওয়া যায়নি" });

  await db.run('DELETE FROM attendance WHERE "studentId" = $1', [req.params.id]);
  await db.run("DELETE FROM students WHERE id = $1", [req.params.id]);

  await recordAudit({
    action: "student.deleted",
    actor: req.user,
    entityType: "student",
    entityId: existing.id,
    label: `Deleted ${existing.name} (Roll ${existing.roll})`,
  });

  res.json({ ok: true, message: "শিক্ষার্থী মুছে ফেলা হয়েছে" });
});

router.get("/:id/pdf", async (req, res) => {
  const student = await db.get("SELECT * FROM students WHERE id = $1", [req.params.id]);
  if (!student) return res.status(404).json({ error: "শিক্ষার্থী পাওয়া যায়নি" });

  const attendanceRows = await db.all('SELECT status FROM attendance WHERE "studentId" = $1', [req.params.id]);
  const attendanceSummary = {
    total: attendanceRows.length,
    present: 0,
    absent: 0,
    late: 0,
  };
  attendanceRows.forEach((r) => {
    if (r.status === "উপস্থিত") attendanceSummary.present++;
    else if (r.status === "অনুপস্থিত") attendanceSummary.absent++;
    else if (r.status === "দেরিতে") attendanceSummary.late++;
  });

  try {
    console.log("Starting PDF generation for student:", student.id);
    const settings = await getSettings();
    const logo = await logoBuffer(settings.logo);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      console.log("PDF generated successfully for student:", student.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="student-${student.id}-${student.name.replace(/\s+/g, "-")}.pdf"`);
      res.send(pdfBuffer);
    });

    if (logo) {
      try {
        doc.image(logo, 257, 42, { fit: [80, 80] });
        doc.moveDown(5);
      } catch {
        doc.moveDown();
      }
    }

    doc.fontSize(24).fillColor("#333").text("মাদ্রাসা শিক্ষার্থী প্রোফাইল", { align: "center" });
    doc.fontSize(12).fillColor("#666").text("শিক্ষার্থী তথ্য রিসিপ্ট", { align: "center" });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#333").lineWidth(3).stroke();
    doc.moveDown();

    doc.fontSize(14).fillColor("#333").text("শিক্ষার্থীর তথ্য:");
    doc.moveDown();

    const info = [
      ["নাম:", student.name],
      ["রোল:", student.roll],
      ["শ্রেণি:", student.class || "N/A"],
      ["বিভাগ:", student.dept],
      ["ধরন:", student.type],
      ["মাসিক বেতন:", `৳${student.fee}`],
      ["বকেয়া:", `৳${student.due}`],
      ["মোবাইল:", student.phone || "N/A"],
      ["রক্তের গ্রুপ:", student.blood],
      ["পাড়া:", student.para || "N/A"],
      ["অবস্থা:", student.status],
    ];

    info.forEach(([label, value]) => {
      doc.fontSize(12).fillColor("#333").text(label, { continued: true });
      doc.fillColor("#555").text(` ${value}`);
    });

    doc.moveDown();

    doc.rect(50, doc.y, 495, 100).fill("#e8f4e8");
    doc.fillColor("#2d5a2d").fontSize(16).text("হাজিরা সারসংক্ষেপ", 60, doc.y + 15);

    const stats = [
      ["মোট দিন", attendanceSummary.total],
      ["উপস্থিত", attendanceSummary.present],
      ["অনুপস্থিত", attendanceSummary.absent],
    ];

    let xPos = 60;
    stats.forEach(([label, value]) => {
      doc.rect(xPos, doc.y + 45, 150, 40).fill("#fff");
      doc.fillColor("#2d5a2d").fontSize(20).text(String(value), xPos + 75, doc.y + 55, { align: "center" });
      doc.fillColor("#666").fontSize(11).text(label, xPos + 75, doc.y + 75, { align: "center" });
      xPos += 165;
    });

    doc.y += 120;

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").lineWidth(1).stroke();
    doc.moveDown();
    doc.fontSize(10).fillColor("#999").text(`তারিখ: ${new Date().toLocaleDateString("bn-BD")}`, { align: "center" });
    doc.text("মাদ্রাসা এরিপি সিস্টেম", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "PDF তৈরি করতে সমস্যা হয়েছে: " + error.message });
  }
});

const GUARDIAN_SALT_ROUNDS = 12;

// Simple 8-char password: 1 uppercase letter + 3 lowercase + 4 digits —
// satisfies passwordPolicy.js (needs 8+ chars and 3 of 4 character
// classes: here upper+lower+digit) without needing a symbol, which tends
// to get mistyped when read aloud or copied by hand for a guardian who
// isn't comfortable with computers.
function generateGuardianPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz"; // no ambiguous i/l/o
  let letterPart = "";
  for (let i = 0; i < 4; i++) letterPart += letters[Math.floor(Math.random() * letters.length)];
  const capitalized = letterPart.charAt(0).toUpperCase() + letterPart.slice(1);
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${capitalized}${digits}`;
}

// ----------------------------------------------------------------------------
// Admin-assisted guardian connect: the self-signup flow in
// routes/guardianAuth.js asks a guardian to type their child's roll/class
// (and optionally name/mobile) and only auto-activates on a strong match —
// good for security, but a real barrier for a guardian who doesn't
// remember a roll number or isn't comfortable filling in a form. This
// endpoint lets staff who already have the student open in front of them
// create (or connect to an existing) guardian account in one click, using
// the guardianMobile already on file from admission — no separate signup
// step, no pending/approval wait, since a staff member confirming the
// identity here is a stronger signal than a self-reported form match.
// ----------------------------------------------------------------------------
router.post("/:id/guardian-account", async (req, res) => {
  const id = Number(req.params.id);
  const student = await db.get('SELECT id, name, "guardianName", "guardianMobile" FROM students WHERE id = $1', [id]);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const mobile = (student.guardianMobile || "").trim();
  if (!mobile) {
    return res.status(400).json({
      error: "এই শিক্ষার্থীর প্রোফাইলে অভিভাবকের মোবাইল নম্বর নেই — আগে সেটা যোগ করে সেভ করুন।",
    });
  }

  let guardian = await db.get("SELECT id, name, status FROM guardian_accounts WHERE mobile = $1", [mobile]);
  let generatedPassword = null;

  if (!guardian) {
    generatedPassword = generateGuardianPassword();
    const hash = await bcrypt.hash(generatedPassword, GUARDIAN_SALT_ROUNDS);
    const createdAt = new Date().toISOString();
    try {
      guardian = await db.get(
        `INSERT INTO guardian_accounts (name, mobile, "passwordHash", status, "createdAt")
         VALUES ($1, $2, $3, 'active', $4) RETURNING id, name, status`,
        [student.guardianName || student.name, mobile, hash, createdAt]
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Race: another request created this same mobile's account between
        // our SELECT and this INSERT (e.g. staff connecting two siblings
        // at almost the same moment) — re-fetch instead of failing.
        guardian = await db.get("SELECT id, name, status FROM guardian_accounts WHERE mobile = $1", [mobile]);
        generatedPassword = null;
      } else {
        throw e;
      }
    }
  }

  const existingLink = await db.get(
    'SELECT status FROM guardian_students WHERE "guardianId" = $1 AND "studentId" = $2',
    [guardian.id, id]
  );
  if (existingLink) {
    return res.status(409).json({
      error: existingLink.status === "active"
        ? "এই শিক্ষার্থী ইতিমধ্যে এই অভিভাবক অ্যাকাউন্টের সাথে যুক্ত আছে।"
        : "এই সংযোগ অনুরোধটি ইতিমধ্যে বিদ্যমান।",
    });
  }

  const createdAt = new Date().toISOString();
  await db.run(
    "INSERT INTO guardian_students (\"guardianId\", \"studentId\", \"createdAt\", status) VALUES ($1, $2, $3, 'active')",
    [guardian.id, id, createdAt]
  );

  // If the account itself was left pending/rejected from an earlier
  // self-signup attempt, staff confirming the identity here is at least as
  // strong a signal as an Admin approval click (routes/guardianApprovals.js)
  // — activate it the same way.
  if (guardian.status !== "active") {
    await db.run("UPDATE guardian_accounts SET status = 'active' WHERE id = $1", [guardian.id]);
  }

  await recordAudit({
    action: "guardian.admin_connected",
    actor: req.user,
    entityType: "guardian_student",
    entityId: id,
    label: `Admin-connected guardian: ${guardian.name} \u2192 student #${id} (${student.name})`,
    details: { guardianId: guardian.id, studentId: id, createdNewAccount: Boolean(generatedPassword) },
  });

  res.status(201).json({
    ok: true,
    mobile,
    // Only present when a brand-new account was just created — an
    // existing account's password is already known to that guardian (or
    // was already handed out on an earlier connect), so there's nothing
    // new to show staff here beyond confirming the connection succeeded.
    password: generatedPassword,
    message: generatedPassword
      ? "নতুন অভিভাবক অ্যাকাউন্ট তৈরি হয়েছে এবং শিক্ষার্থীর সাথে যুক্ত হয়েছে।"
      : "বিদ্যমান অভিভাবক অ্যাকাউন্টের সাথে শিক্ষার্থীকে যুক্ত করা হয়েছে।",
  });
});

module.exports = router;

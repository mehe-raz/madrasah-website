const db = require("./../db");
const { createNotification } = require("./notifications");

const MAX_LEN = {
  studentName: 120,
  studentNameEn: 120,
  dateOfBirth: 20,
  gender: 20,
  className: 60,
  guardianName: 120,
  guardianPhone: 20,
  presentAddress: 300,
  previousInstitution: 160,
  note: 500,
};

function clean(value, maxLen) {
  const s = value == null ? "" : String(value).trim();
  return maxLen ? s.slice(0, maxLen) : s;
}

// Loose Bangladeshi mobile number check (01XXXXXXXXX, optionally with a
// +88 prefix and/or spaces/dashes) — rejects obvious garbage without being
// so strict it blocks a real guardian's number.
function isPlausiblePhone(phone) {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 14;
}

function sanitizeInput(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    studentName: clean(b.studentName, MAX_LEN.studentName),
    studentNameEn: clean(b.studentNameEn, MAX_LEN.studentNameEn),
    dateOfBirth: clean(b.dateOfBirth, MAX_LEN.dateOfBirth),
    gender: clean(b.gender, MAX_LEN.gender),
    className: clean(b.className, MAX_LEN.className),
    guardianName: clean(b.guardianName, MAX_LEN.guardianName),
    guardianPhone: clean(b.guardianPhone, MAX_LEN.guardianPhone),
    presentAddress: clean(b.presentAddress, MAX_LEN.presentAddress),
    previousInstitution: clean(b.previousInstitution, MAX_LEN.previousInstitution),
    note: clean(b.note, MAX_LEN.note),
  };
}

function validate(input) {
  const errors = [];
  if (!input.studentName) errors.push("studentName is required");
  if (!input.className) errors.push("className is required");
  if (!input.guardianName) errors.push("guardianName is required");
  if (!input.guardianPhone) errors.push("guardianPhone is required");
  else if (!isPlausiblePhone(input.guardianPhone)) errors.push("guardianPhone looks invalid");
  return errors;
}

async function createAdmission(body) {
  const input = sanitizeInput(body);
  const errors = validate(input);
  if (errors.length) {
    const err = new Error(errors.join(", "));
    err.status = 400;
    throw err;
  }
  const createdAt = new Date().toISOString();
  const row = await db.get(
    `INSERT INTO admissions
      ("studentName","studentNameEn","dateOfBirth",gender,"className","guardianName","guardianPhone","presentAddress","previousInstitution",note,status,"createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11)
     RETURNING *`,
    [
      input.studentName,
      input.studentNameEn,
      input.dateOfBirth,
      input.gender,
      input.className,
      input.guardianName,
      input.guardianPhone,
      input.presentAddress,
      input.previousInstitution,
      input.note,
      createdAt,
    ]
  );

  // Same roles that can review applications (requirePermission("website")
  // on the /api/admissions route) — see lib/notifications.js for how
  // targetRoles visibility is resolved.
  await createNotification({
    type: "admission",
    title: "নতুন ভর্তির আবেদন",
    body: `${row.studentName} — ${row.className}`,
    entityType: "admission",
    entityId: row.id,
    link: "/admissions",
    targetRoles: ["Admin", "Super Admin"],
  });

  return row;
}

async function listAdmissions() {
  return db.all(`SELECT * FROM admissions ORDER BY "createdAt" DESC`);
}

async function updateAdmissionStatus(id, status) {
  const allowed = ["Pending", "Reviewed", "Admitted", "Rejected"];
  if (!allowed.includes(status)) {
    const err = new Error("Invalid status");
    err.status = 400;
    throw err;
  }
  const row = await db.get(`UPDATE admissions SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
  if (!row) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  return row;
}

module.exports = { createAdmission, listAdmissions, updateAdmissionStatus };

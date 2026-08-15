const TEXT_FIELDS = [
  "admissionNumber",
  "admissionDate",
  "academicYear",
  "session",
  "class",
  "section",
  "roll",
  "type",
  "name",
  "nameEn",
  "dateOfBirth",
  "birthRegistrationNumber",
  "gender",
  "religion",
  "blood",
  "studentPhoto",
  "fatherName",
  "fatherMobile",
  "fatherOccupation",
  "motherName",
  "motherMobile",
  "motherOccupation",
  "guardianName",
  "guardianRelationship",
  "guardianMobile",
  "presentAddress",
  "permanentAddress",
  "district",
  "upazila",
  "postOffice",
  "village",
  "previousInstitution",
  "previousClass",
  "dept",
  "status",
  "phone",
  // docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2A — optional, only
  // set once a student is enrolled on an attendance device (Phase 2C's
  // scan-to-enroll mode, or typed in manually via Phase 2B's form fields).
  // Not in REQUIRED_FIELDS below: most students won't have these set.
  "fingerprintId",
  "cardUid",
];

const NUMBER_FIELDS = ["para", "fee", "due", "admissionFee", "discount"];

const REQUIRED_FIELDS = [
  ["admissionDate", "Admission date is required"],
  ["academicYear", "Academic year is required"],
  ["session", "Session is required"],
  ["class", "Class / Jamaat is required"],
  ["roll", "Roll number is required"],
  ["type", "Student type is required"],
  ["name", "Bengali name is required"],
  ["nameEn", "English name is required"],
  ["dateOfBirth", "Date of birth is required"],
  ["gender", "Gender is required"],
  ["religion", "Religion is required"],
  ["fatherName", "Father name is required"],
  ["fatherMobile", "Father mobile is required"],
  ["motherName", "Mother name is required"],
  ["motherMobile", "Mother mobile is required"],
  ["presentAddress", "Present address is required"],
  ["permanentAddress", "Permanent address is required"],
  ["district", "District is required"],
  ["upazila", "Upazila is required"],
  ["postOffice", "Post office is required"],
  ["village", "Village is required"],
  ["dept", "Department is required"],
  ["fee", "Monthly fee is required"],
  ["admissionFee", "Admission fee is required"],
];

const ALLOWED = {
  type: ["Day", "Residential"],
  // Madrasah-only product: gender is restricted to Male/Female and religion
  // is fixed to Islam (matching frontend change in Students.tsx). Existing
  // records saved before this change may still hold an older value (e.g.
  // "Other") — those are left as-is and only shown read-only; this
  // whitelist only blocks *new* writes.
  gender: ["Male", "Female"],
  religion: ["Islam"],
  blood: ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
};

// `dept` used to be checked against a fixed 5-value list here too
// (["Hifz","Nazera","Kitab","Nurani","General"]) — that predates the
// class/jamaat hierarchy (server/src/lib/classTree.js) letting a Super
// Admin add brand-new top-level departments from Settings. Once a custom
// department exists, deptCodeFromTreeTopLevel() (client/src/lib/labels.ts)
// deliberately falls through to that department's own raw `en` slug
// instead of leaving dept blank — but the fixed list here had no way to
// know about it, so every admission/edit under a custom department failed
// with "dept is invalid" (400) and nothing saved. This instead accepts any
// well-formed slug/code — same shape classTree.js's own EN_SLUG_RE already
// requires for a department's `en` value — while still rejecting garbage
// input. "Hifz" and the other legacy codes still pass this unchanged (see
// hifz.js's `WHERE dept = 'Hifz'`, which depends on that exact string).
const DEPT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,58}$/;

const DOCUMENT_KEYS = ["studentPhoto", "birthCertificate", "guardianNid", "previousCertificate"];
const DATA_URL_RE = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i;

function cleanText(value) {
  return value == null ? "" : String(value).trim();
}

function cleanNumber(value, fallback = 0) {
  if (value === "" || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function normalizeMobile(value) {
  return cleanText(value).replace(/[\s-]/g, "");
}

function isValidMobile(value) {
  if (!value) return true;
  return /^01[3-9]\d{8}$/.test(normalizeMobile(value));
}

const HTTP_URL_RE = /^https?:\/\//i;

function dataUrlSize(value) {
  const match = String(value || "").match(DATA_URL_RE);
  if (!match) return 0;
  return Math.ceil(match[2].replace(/\s/g, "").length * 0.75);
}

function validateDataUrl(value, { imageOnly = false, required = false, maxBytes = 750 * 1024 } = {}) {
  if (!value) return required ? "File is required" : "";
  // Files uploaded through /uploads are already stored (e.g. on Cloudinary)
  // and come back as a normal https URL, not a base64 data URL. They were
  // already type/size validated at upload time, so just accept them here.
  if (HTTP_URL_RE.test(String(value))) return "";
  const match = String(value).match(DATA_URL_RE);
  if (!match) return "Upload must be a valid base64 file";
  const mime = match[1].toLowerCase();
  if (imageOnly && !mime.startsWith("image/")) return "Student photo must be an image";
  if (!imageOnly && !mime.startsWith("image/") && mime !== "application/pdf") {
    return "Document must be an image or PDF";
  }
  if (dataUrlSize(value) > maxBytes) return "File must be 750 KB or smaller";
  return "";
}

function normalizeDocuments(input) {
  const source = input && typeof input === "object" ? input : {};
  return DOCUMENT_KEYS.reduce((acc, key) => {
    const value = cleanText(source[key]);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

function validateDocuments(documents) {
  const errors = {};
  for (const key of DOCUMENT_KEYS) {
    const error = validateDataUrl(documents[key], { imageOnly: key === "studentPhoto" });
    if (error) errors[`documents.${key}`] = error;
  }
  return errors;
}

function admissionFromBody(body, existing = {}) {
  const admission = { ...existing };

  for (const field of TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      admission[field] = field.endsWith("Mobile") || field === "phone" ? normalizeMobile(body[field]) : cleanText(body[field]);
    }
  }

  for (const field of NUMBER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      admission[field] = cleanNumber(body[field]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "documents")) {
    admission.documents = normalizeDocuments(body.documents);
    if (admission.documents.studentPhoto) admission.studentPhoto = admission.documents.studentPhoto;
  }

  admission.phone = admission.fatherMobile || admission.guardianMobile || admission.motherMobile || admission.phone || "";
  admission.fee = cleanNumber(admission.fee, 0);
  admission.due = cleanNumber(admission.due, 0);
  admission.admissionFee = cleanNumber(admission.admissionFee, 0);
  admission.discount = cleanNumber(admission.discount, 0);
  admission.para = Math.min(30, cleanNumber(admission.para, 0));
  admission.status = admission.status || "Active";
  admission.blood = admission.blood || "";

  return admission;
}

function validateAdmission(admission, { partial = false } = {}) {
  const errors = {};

  if (!partial) {
    for (const [field, message] of REQUIRED_FIELDS) {
      if (field === "fee" || field === "admissionFee") {
        if (admission[field] == null || Number(admission[field]) < 0) errors[field] = message;
      } else if (!cleanText(admission[field])) {
        errors[field] = message;
      }
    }
  }

  for (const field of ["fatherMobile", "motherMobile", "guardianMobile", "phone"]) {
    if (!isValidMobile(admission[field])) errors[field] = "Enter a valid Bangladeshi mobile number";
  }

  for (const [field, options] of Object.entries(ALLOWED)) {
    if (admission[field] && !options.includes(admission[field])) {
      errors[field] = `${field} is invalid`;
    }
  }

  if (admission.dept && !DEPT_CODE_RE.test(admission.dept)) {
    errors.dept = "dept is invalid";
  }

  if (admission.studentPhoto) {
    const photoError = validateDataUrl(admission.studentPhoto, { imageOnly: true });
    if (photoError) errors.studentPhoto = photoError;
  }

  Object.assign(errors, validateDocuments(admission.documents || {}));
  return errors;
}

const RETURNING_COLUMNS = `
  id, name, "nameEn", roll, class, dept, type, fee, due, phone, blood, para, status,
  "admissionNumber", "admissionDate", "academicYear", session, section,
  "dateOfBirth", "birthRegistrationNumber", gender, religion, "studentPhoto",
  "fatherName", "fatherMobile", "fatherOccupation",
  "motherName", "motherMobile", "motherOccupation",
  "guardianName", "guardianRelationship", "guardianMobile",
  "presentAddress", "permanentAddress", district, upazila, "postOffice", village,
  "previousInstitution", "previousClass", "admissionFee", discount, documents,
  "fingerprintId", "cardUid"
`;

// Same as RETURNING_COLUMNS but without the "documents" JSONB column, which
// can hold several uploaded files (birth certificate, guardian NID, previous
// certificate — sometimes still legacy base64 for older records). The list
// table never displays these, only the single-student detail view does, so
// list requests shouldn't pay to transfer them for every row.
//
// Also without "studentPhoto": it's often a base64 data URL, so pulling it
// for every row on every list/dropdown load (Students table, Fees/Income
// student picker) is the single heaviest part of those requests. Only the
// single-student detail view (GET /students/:id, which uses
// RETURNING_COLUMNS) needs it.
const LIST_COLUMNS = `
  id, name, "nameEn", roll, class, dept, type, fee, due, phone, blood, para, status,
  "admissionNumber", "admissionDate", "academicYear", session, section,
  "dateOfBirth", "birthRegistrationNumber", gender, religion,
  "fatherName", "fatherMobile", "fatherOccupation",
  "motherName", "motherMobile", "motherOccupation",
  "guardianName", "guardianRelationship", "guardianMobile",
  "presentAddress", "permanentAddress", district, upazila, "postOffice", village,
  "previousInstitution", "previousClass", "admissionFee", discount,
  "fingerprintId", "cardUid"
`;

module.exports = {
  admissionFromBody,
  validateAdmission,
  normalizeDocuments,
  validateDocuments,
  RETURNING_COLUMNS,
  LIST_COLUMNS,
};

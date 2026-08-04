const db = require("./../db");

const MAX_SUBJECTS = 20;

function cleanText(value, maxLen) {
  const s = value == null ? "" : String(value).trim();
  return maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeSubjects(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_SUBJECTS).map((s) => ({
    name: cleanText(s && s.name, 60),
    marks: Math.max(0, Number(s && s.marks) || 0),
    fullMarks: Math.max(1, Number(s && s.fullMarks) || 100),
  }));
}

// Standard Bangladesh SSC/HSC-style grading scale (percentage -> letter
// grade + GPA point), applied to obtainedMarks/totalMarks. This replaces
// trusting a free-text gpa/grade typed in by whoever enters the result —
// previously nothing stopped e.g. 45/100 being saved alongside a
// hand-typed grade of "A+", since the two fields were unrelated inputs.
const GRADE_SCALE = [
  { min: 80, grade: "A+", gpa: 5.0 },
  { min: 70, grade: "A", gpa: 4.0 },
  { min: 60, grade: "A-", gpa: 3.5 },
  { min: 50, grade: "B", gpa: 3.0 },
  { min: 40, grade: "C", gpa: 2.0 },
  { min: 33, grade: "D", gpa: 1.0 },
  { min: 0, grade: "F", gpa: 0.0 },
];

function computeGrade(obtainedMarks, totalMarks, subjects) {
  if (!totalMarks || totalMarks <= 0) return { gpa: "0.00", grade: "F" };

  // Any single subject below the pass mark (33%) fails the whole result,
  // same rule Bangladeshi boards use — a high overall percentage can't
  // paper over one failed subject.
  const failedSubject = Array.isArray(subjects) && subjects.some((s) => {
    const full = Number(s.fullMarks) || 0;
    if (full <= 0) return false;
    return ((Number(s.marks) || 0) / full) * 100 < 33;
  });
  if (failedSubject) return { gpa: "0.00", grade: "F" };

  const pct = (obtainedMarks / totalMarks) * 100;
  const tier = GRADE_SCALE.find((t) => pct >= t.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
  return { gpa: tier.gpa.toFixed(2), grade: tier.grade };
}

function parseSubjects(row) {
  if (!row) return row;
  return { ...row, subjects: typeof row.subjects === "string" ? JSON.parse(row.subjects) : row.subjects };
}

// `classes` (array) is used by routes/results.js when a scoped Teacher asks
// for results without picking one specific class from their assigned list —
// `class` (single value) takes priority when both are present, same as a
// Teacher filtering their own scoped view down to one class.
async function listResults({ class: className, classes, examName, year } = {}) {
  const conditions = [];
  const params = [];
  if (className) {
    params.push(className);
    conditions.push(`class = $${params.length}`);
  } else if (classes) {
    params.push(classes);
    conditions.push(`class = ANY($${params.length})`);
  }
  if (examName) {
    params.push(examName);
    conditions.push(`"examName" = $${params.length}`);
  }
  if (year) {
    params.push(year);
    conditions.push(`year = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.all(`SELECT * FROM results ${where} ORDER BY roll`, params);
  return rows.map(parseSubjects);
}

async function upsertResult(input) {
  const studentId = Number(input && input.studentId);
  if (!studentId) {
    const err = new Error("ছাত্র নির্বাচন আবশ্যক");
    err.status = 400;
    throw err;
  }
  const student = await db.get("SELECT * FROM students WHERE id = $1", [studentId]);
  if (!student) {
    const err = new Error("ছাত্র পাওয়া যায়নি");
    err.status = 404;
    throw err;
  }

  const examName = cleanText(input.examName, 80);
  const year = cleanText(input.year, 4);
  if (!examName || !year) {
    const err = new Error("পরীক্ষার নাম ও বছর আবশ্যক");
    err.status = 400;
    throw err;
  }

  const subjects = sanitizeSubjects(input.subjects);
  const obtainedMarks = subjects.reduce((sum, s) => sum + s.marks, 0);
  const totalMarks = subjects.reduce((sum, s) => sum + s.fullMarks, 0);
  // gpa/grade are always derived from the marks above, never taken from
  // input — see computeGrade(). Any gpa/grade sent in the request body is
  // ignored so the two can't drift apart.
  const { gpa, grade } = computeGrade(obtainedMarks, totalMarks, subjects);

  const row = await db.get(
    `INSERT INTO results
       ("studentId", "examName", year, class, roll, "studentName", subjects, "totalMarks", "obtainedMarks", gpa, grade, published, "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,now())
     ON CONFLICT ("studentId", "examName", year) DO UPDATE SET
       subjects = EXCLUDED.subjects,
       "totalMarks" = EXCLUDED."totalMarks",
       "obtainedMarks" = EXCLUDED."obtainedMarks",
       gpa = EXCLUDED.gpa,
       grade = EXCLUDED.grade,
       class = EXCLUDED.class,
       roll = EXCLUDED.roll,
       "studentName" = EXCLUDED."studentName",
       "updatedAt" = now()
     RETURNING *`,
    [
      studentId,
      examName,
      year,
      student.class,
      student.roll,
      student.name,
      JSON.stringify(subjects),
      totalMarks,
      obtainedMarks,
      gpa,
      grade,
    ]
  );
  return parseSubjects(row);
}

async function setPublished(id, published) {
  const row = await db.get('UPDATE results SET published = $1 WHERE id = $2 RETURNING *', [published ? 1 : 0, id]);
  return parseSubjects(row);
}

async function deleteResult(id) {
  await db.run("DELETE FROM results WHERE id = $1", [id]);
}

// Public, unauthenticated lookup. Deliberately narrow: only returns
// published rows, and only fields safe to show an anonymous visitor
// (name/roll/class/marks) — never phone numbers, addresses, or any other
// student record data. Requires an exact class + roll match so a visitor
// can't enumerate every student by leaving fields blank.
async function searchPublicResult({ class: className, roll, examName }) {
  const cls = cleanText(className, 60);
  const rollNo = cleanText(roll, 20);
  if (!cls || !rollNo) return [];

  const params = [cls, rollNo];
  let where = `WHERE class = $1 AND roll = $2 AND published = 1`;
  if (examName) {
    params.push(cleanText(examName, 80));
    where += ` AND "examName" = $${params.length}`;
  }

  const rows = await db.all(
    `SELECT "studentName" AS name, roll, class, "examName", year, subjects, "totalMarks", "obtainedMarks", gpa, grade
     FROM results ${where}
     ORDER BY year DESC
     LIMIT 10`,
    params
  );
  return rows.map(parseSubjects);
}

module.exports = { listResults, upsertResult, setPublished, deleteResult, searchPublicResult, sanitizeSubjects, computeGrade };

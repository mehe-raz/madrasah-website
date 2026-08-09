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

// Standard "competition ranking" (1, 2, 2, 4 — a tie shares the higher
// rank and the next distinct value skips ahead by the tie count), the same
// convention Bangladeshi board results use for মেধাস্থান. `items` is any
// array; `valueFn` extracts the number to rank by (higher = better rank).
// Returns a Map from item.key -> rank. Pure/sync so it's unit-testable
// without a DB (see __tests__/results.test.js).
function competitionRank(items, keyFn, valueFn) {
  const sorted = [...items].sort((a, b) => valueFn(b) - valueFn(a));
  const ranks = new Map();
  let rank = 0;
  let seen = 0;
  let lastValue = null;
  for (const item of sorted) {
    seen += 1;
    const value = valueFn(item);
    if (lastValue === null || value !== lastValue) {
      rank = seen;
      lastValue = value;
    }
    ranks.set(keyFn(item), rank);
  }
  return ranks;
}

// মেধাস্থান (merit position), computed within one exam group — same class,
// exam name, and year — decided to be class-wide (not split by section);
// see project notes. Only counts published results, matching the rule
// everywhere else a guardian/public reader can see results (a draft mark
// entry shouldn't affect another student's rank). Returns:
//   - overallRanks: Map<studentId, rank>            (by total obtainedMarks)
//   - subjectRanksByStudent: Map<studentId, {[subjectNameLower]: rank}>
async function computeRanksForGroup({ class: className, examName, year }) {
  const cls = cleanText(className, 60);
  const exam = cleanText(examName, 80);
  const yr = cleanText(year, 4);
  const rows = await db.all(
    `SELECT "studentId", subjects, "obtainedMarks" FROM results
     WHERE class = $1 AND "examName" = $2 AND year = $3 AND published = 1`,
    [cls, exam, yr]
  );
  const parsed = rows.map(parseSubjects);

  const overallRanks = competitionRank(parsed, (r) => r.studentId, (r) => r.obtainedMarks);

  const bySubject = new Map(); // subjectNameLower -> [{ studentId, marks }]
  for (const r of parsed) {
    for (const s of Array.isArray(r.subjects) ? r.subjects : []) {
      const key = cleanText(s.name, 60).toLowerCase();
      if (!key) continue;
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push({ studentId: r.studentId, marks: Number(s.marks) || 0 });
    }
  }
  const subjectRankMaps = new Map(); // subjectNameLower -> Map<studentId, rank>
  for (const [key, list] of bySubject.entries()) {
    subjectRankMaps.set(key, competitionRank(list, (i) => i.studentId, (i) => i.marks));
  }

  const subjectRanksByStudent = new Map();
  for (const r of parsed) {
    const map = {};
    for (const s of Array.isArray(r.subjects) ? r.subjects : []) {
      const key = cleanText(s.name, 60).toLowerCase();
      if (!key) continue;
      map[key] = subjectRankMaps.get(key)?.get(r.studentId) ?? null;
    }
    subjectRanksByStudent.set(r.studentId, map);
  }

  return { overallRanks, subjectRanksByStudent };
}

// Attaches everything the printable রেজাল্ট শীট (result sheet) needs on top
// of a single result row: per-subject GPA/grade (same board grade scale as
// the overall one, applied to that subject's own percentage) and merit
// positions (subject-wise + overall) from computeRanksForGroup(). Kept
// separate from listResults()/publishedResultsForStudent() so list views
// stay cheap — this is only called when a result sheet is actually being
// printed/downloaded.
async function attachRanksAndSubjectGpa(row) {
  const { overallRanks, subjectRanksByStudent } = await computeRanksForGroup({
    class: row.class,
    examName: row.examName,
    year: row.year,
  });
  const rankMap = subjectRanksByStudent.get(row.studentId) || {};
  const subjects = (Array.isArray(row.subjects) ? row.subjects : []).map((s) => {
    const { gpa, grade } = computeGrade(Number(s.marks) || 0, Number(s.fullMarks) || 0, []);
    const key = cleanText(s.name, 60).toLowerCase();
    return { ...s, gpa, grade, meritPosition: rankMap[key] ?? null };
  });
  return {
    ...row,
    subjects,
    meritPosition: overallRanks.get(row.studentId) ?? null,
  };
}

// Merges one subject into an existing subjects list: replaces the entry if
// a subject with the same name already exists (case-insensitive, trimmed —
// so "Math" and " math " are the same subject), otherwise appends it. Used
// by saveSubjectForClass() so entering marks for one subject never wipes
// out marks already saved for other subjects in the same exam. Pure
// function (no DB access) so it can be unit-tested directly — see
// __tests__/results.test.js.
function mergeSubjectIntoList(existingSubjects, newSubject) {
  const list = Array.isArray(existingSubjects) ? existingSubjects.slice(0, MAX_SUBJECTS) : [];
  const key = (name) => cleanText(name, 60).toLowerCase();
  const newKey = key(newSubject.name);
  const idx = list.findIndex((s) => key(s && s.name) === newKey);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = newSubject;
    return next;
  }
  if (list.length >= MAX_SUBJECTS) return list; // already full, silently drop — same cap sanitizeSubjects enforces
  return [...list, newSubject];
}

// Shared by upsertResult() and saveSubjectForClass() — both end up writing
// a full (already-merged) subjects list for one (studentId, examName, year)
// row, they just arrive at that list differently. Recomputes
// totalMarks/obtainedMarks/gpa/grade from the subjects list every time, so
// those columns can never drift from what's actually in `subjects`.
async function upsertResultRow({ student, examName, year, subjects }) {
  const cleanSubjects = sanitizeSubjects(subjects);
  const obtainedMarks = cleanSubjects.reduce((sum, s) => sum + s.marks, 0);
  const totalMarks = cleanSubjects.reduce((sum, s) => sum + s.fullMarks, 0);
  const { gpa, grade } = computeGrade(obtainedMarks, totalMarks, cleanSubjects);

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
      student.id,
      examName,
      year,
      student.class,
      student.roll,
      student.name,
      JSON.stringify(cleanSubjects),
      totalMarks,
      obtainedMarks,
      gpa,
      grade,
    ]
  );
  return parseSubjects(row);
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

  // gpa/grade are always derived from the marks in `subjects` — see
  // computeGrade() inside upsertResultRow(). Any gpa/grade sent in the
  // request body is ignored so the two can't drift apart.
  return upsertResultRow({ student, examName, year, subjects: input.subjects });
}

// Enters marks for ONE subject, for MANY students in the same class, in one
// call — the batch marks-entry screen (docs/CURRENT_TASK.md Part 2/3). For
// each entry: looks up the student, merges { name: subjectName, marks,
// fullMarks } into whatever subjects that student already has saved for
// this (examName, year) — via mergeSubjectIntoList(), so previously-entered
// subjects for other subjects are preserved, not overwritten — then
// recomputes totals/gpa/grade and upserts the row (same as upsertResult).
//
// Sequential awaits, not a manual pg transaction: this codebase binds each
// request to the right tenant schema via AsyncLocalStorage (see
// server/src/pg.js), so db.get/db.run already go to the right place without
// passing a client around. A raw pool.connect()+BEGIN transaction (the
// pattern used in migrateTenants.js/registryDb.js) is for cross-schema work,
// which this isn't — so it's not needed here.
//
// A studentId that doesn't resolve to a real student is skipped (not a hard
// failure) — one bad id in a 40-student class shouldn't block saving the
// other 39, but the caller does need to know it happened, hence `skipped`.
async function saveSubjectForClass({ class: classroom, examName, year, subjectName, fullMarks, entries }) {
  const cls = cleanText(classroom, 60);
  const exam = cleanText(examName, 80);
  const yr = cleanText(year, 4);
  const subject = cleanText(subjectName, 60);
  const full = Math.max(1, Number(fullMarks) || 0);
  if (!cls || !exam || !yr || !subject) {
    const err = new Error("ক্লাস, পরীক্ষার নাম, শিক্ষাবর্ষ ও বিষয়ের নাম আবশ্যক");
    err.status = 400;
    throw err;
  }

  const updated = [];
  const skipped = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const studentId = Number(entry && entry.studentId);
    if (!studentId) {
      skipped.push(entry && entry.studentId);
      continue;
    }
    const student = await db.get("SELECT * FROM students WHERE id = $1", [studentId]);
    if (!student || student.class !== cls) {
      // Either the id doesn't exist, or it exists but belongs to a
      // different class than the one this batch says it's for (e.g. a
      // stale class list, or a tampered request) — skip rather than
      // silently saving a mark under the wrong class.
      skipped.push(studentId);
      continue;
    }

    const existing = await db.get(
      `SELECT subjects FROM results WHERE "studentId" = $1 AND "examName" = $2 AND year = $3`,
      [studentId, exam, yr]
    );
    const existingSubjects = existing ? parseSubjects(existing).subjects : [];
    const marks = Math.max(0, Number(entry.marks) || 0);
    const mergedSubjects = mergeSubjectIntoList(existingSubjects, { name: subject, marks, fullMarks: full });

    const row = await upsertResultRow({ student, examName: exam, year: yr, subjects: mergedSubjects });
    updated.push(row);
  }

  return { updated, skipped };
}

async function getResultById(id) {
  const row = await db.get("SELECT * FROM results WHERE id = $1", [id]);
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

module.exports = {
  listResults,
  getResultById,
  upsertResult,
  saveSubjectForClass,
  mergeSubjectIntoList,
  setPublished,
  deleteResult,
  searchPublicResult,
  sanitizeSubjects,
  computeGrade,
  competitionRank,
  computeRanksForGroup,
  attachRanksAndSubjectGpa,
};

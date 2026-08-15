import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAppSettings } from "../context/AppSettingsContext";
import { classTreeLeafLabel } from "../lib/classTree";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { EXAM_TYPES } from "../lib/examTypes";
import { printAdmitCards, PopupBlockedError } from "../lib/printReport";
import type { AdmitCardStudent } from "../types";

// প্রবেশপত্র (admit card) generation — same "results"-scoped roster lookup
// as Results.tsx (see server/src/routes/results.js GET /admit-card-students)
// but purely a print action: nothing here is saved to the database, so
// there's no save/publish state to track, just class+exam+year+date inputs
// followed by a single "সব প্রবেশপত্র তৈরি করুন" print action for the whole
// class roster (docs/CURRENT_TASK.md — "প্রবেশপত্র/এডমিট কার্ড" task).
export function AdmitCards() {
  const { t, lang, classTree } = useAppSettings();

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState<AdmitCardStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [examType, setExamType] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [examStartDate, setExamStartDate] = useState("");

  const [generating, setGenerating] = useState(false);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getResultClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the roster when no class is selected; nothing to fetch without one
      setStudents([]);
      return;
    }
    setLoadingStudents(true);
    api
      .getAdmitCardStudents(selectedClass)
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, [selectedClass]);

  const examTypeLabel = (value: string) => {
    const found = EXAM_TYPES.find((et) => et.value === value);
    if (!found) return value;
    return lang === "en" ? found.labelEn : found.labelBn;
  };

  // DD/MM/YYYY for the printed card — the <input type="date"> value is
  // always YYYY-MM-DD regardless of locale, so this is a plain reformat,
  // not a timezone-sensitive Date() parse.
  const formattedExamDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examStartDate);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : examStartDate;
  })();

  const validationError = () => {
    if (!selectedClass) return t.admitCards.selectClass;
    if (!examType) return t.admitCards.selectExamType;
    if (!academicYear.trim()) return t.admitCards.yearRequired;
    if (!examStartDate) return t.admitCards.examDateRequired;
    if (!students.length) return t.admitCards.noStudentsInClass;
    return "";
  };

  const generateAll = () => {
    const err = validationError();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setGenerating(true);
    try {
      printAdmitCards({
        examLabel: examTypeLabel(examType),
        academicYear: academicYear.trim(),
        examStartDate: formattedExamDate,
        classLabel: classTreeLeafLabel(classTree, selectedClass),
        students: students.map((s) => ({
          name: s.name,
          fatherName: s.fatherName,
          roll: s.roll,
          admissionNumber: s.admissionNumber,
        })),
      });
    } catch (err) {
      setError(err instanceof PopupBlockedError ? t.admitCards.popupBlocked : t.admitCards.generateFailed);
    } finally {
      setGenerating(false);
    }
  };

  const printOne = (s: AdmitCardStudent) => {
    const err = validationError();
    // A single-card reprint still needs exam type/year/date filled in, even
    // though the roster itself is already loaded for this one student.
    if (err && err !== t.admitCards.noStudentsInClass) {
      setError(err);
      return;
    }
    setError("");
    setPrintingId(s.id);
    try {
      printAdmitCards({
        examLabel: examTypeLabel(examType),
        academicYear: academicYear.trim(),
        examStartDate: formattedExamDate,
        classLabel: classTreeLeafLabel(classTree, selectedClass),
        students: [{ name: s.name, fatherName: s.fatherName, roll: s.roll, admissionNumber: s.admissionNumber }],
      });
    } catch (err) {
      setError(err instanceof PopupBlockedError ? t.admitCards.popupBlocked : t.admitCards.generateFailed);
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header__title">{t.admitCards.title}</h2>
      </div>

      {error && <p className="alert alert--rose">{error}</p>}

      <Card className="mb-24">
        <div className="form-grid">
          <Field label={t.admitCards.selectClass}>
            <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">{t.admitCards.selectClass}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {classTreeLeafLabel(classTree, c)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.admitCards.selectExamType}>
            <Select value={examType} onChange={(e) => setExamType(e.target.value)}>
              <option value="">{t.admitCards.selectExamType}</option>
              {EXAM_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {lang === "en" ? et.labelEn : et.labelBn}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.admitCards.academicYear}>
            <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="২০২৫/২৬" />
          </Field>

          <Field label={t.admitCards.examStartDate}>
            <Input type="date" value={examStartDate} onChange={(e) => setExamStartDate(e.target.value)} />
          </Field>
        </div>

        {selectedClass && (
          <div className="mb-18">
            <p className="section-title">{t.admitCards.rosterFor}</p>
            {loadingStudents && <p className="text-muted">{t.admitCards.loading}</p>}
            {!loadingStudents && !students.length && <p className="text-muted">{t.admitCards.noStudentsInClass}</p>}
            {!loadingStudents && !!students.length && (
              <div className="marks-entry-list marks-entry-list--admitcards">
                <div className="marks-entry-header">
                  <span>{t.attendance.roll}</span>
                  <span>{t.attendance.name}</span>
                  <span>{t.admitCards.admissionNumber}</span>
                </div>
                {students.map((s) => (
                  <div className="marks-entry-row" key={s.id}>
                    <span className="marks-entry-row__roll">{s.roll}</span>
                    <span className="marks-entry-row__name">{s.name}</span>
                    <div className="admitcard-row__meta">
                      <span className="admitcard-row__admission">{s.admissionNumber || "-"}</span>
                      <button
                        type="button"
                        onClick={() => printOne(s)}
                        disabled={printingId === s.id}
                        className="admitcard-row__print-btn"
                      >
                        {printingId === s.id ? t.admitCards.printing : t.admitCards.printOne}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button variant="teal" solid onClick={generateAll} disabled={generating}>
          {generating ? t.admitCards.generating : t.admitCards.generateAll}
        </Button>
      </Card>
    </div>
  );
}

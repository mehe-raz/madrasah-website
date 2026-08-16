import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAppSettings } from "../context/AppSettingsContext";
import { classTreeLeafLabel } from "../lib/classTree";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { EXAM_TYPES } from "../lib/examTypes";
import { printExamCoverSheets, PopupBlockedError } from "../lib/printReport";
import type { ExamCoverStudent } from "../types";

// পরীক্ষার খাতার প্রথম পেইজ (exam cover sheet) generation — same
// "results"-scoped roster lookup as AdmitCards.tsx, but its own roster
// endpoint (GET /results/exam-cover-students) since the cover sheet needs
// শাখা (section), which admit cards don't print. Purely a print action:
// nothing here is saved to the database. See docs/CURRENT_TASK.md —
// "পরীক্ষার খাতার প্রথম পেইজ" task.
export function ExamCoverSheets() {
  const { t, lang, classTree } = useAppSettings();

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState<ExamCoverStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [examType, setExamType] = useState("");
  const [subject, setSubject] = useState("");
  const [examDate, setExamDate] = useState("");

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
      .getExamCoverStudents(selectedClass)
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, [selectedClass]);

  const examTypeLabel = (value: string) => {
    const found = EXAM_TYPES.find((et) => et.value === value);
    if (!found) return value;
    return lang === "en" ? found.labelEn : found.labelBn;
  };

  // DD/MM/YYYY for the printed sheet — the <input type="date"> value is
  // always YYYY-MM-DD regardless of locale, so this is a plain reformat,
  // not a timezone-sensitive Date() parse.
  const formattedExamDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : examDate;
  })();

  const validationError = () => {
    if (!selectedClass) return t.examCoverSheets.selectClass;
    if (!examType) return t.examCoverSheets.selectExamType;
    if (!subject.trim()) return t.examCoverSheets.subjectRequired;
    if (!examDate) return t.examCoverSheets.examDateRequired;
    if (!students.length) return t.examCoverSheets.noStudentsInClass;
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
      printExamCoverSheets({
        examName: examTypeLabel(examType),
        subject: subject.trim(),
        examDate: formattedExamDate,
        classLabel: classTreeLeafLabel(classTree, selectedClass),
        students: students.map((s) => ({
          name: s.name,
          roll: s.roll,
          section: s.section,
          admissionNumber: s.admissionNumber,
        })),
      });
    } catch (err) {
      setError(err instanceof PopupBlockedError ? t.examCoverSheets.popupBlocked : t.examCoverSheets.generateFailed);
    } finally {
      setGenerating(false);
    }
  };

  const printOne = (s: ExamCoverStudent) => {
    const err = validationError();
    // A single-sheet reprint still needs exam type/subject/date filled in,
    // even though the roster itself is already loaded for this one student.
    if (err && err !== t.examCoverSheets.noStudentsInClass) {
      setError(err);
      return;
    }
    setError("");
    setPrintingId(s.id);
    try {
      printExamCoverSheets({
        examName: examTypeLabel(examType),
        subject: subject.trim(),
        examDate: formattedExamDate,
        classLabel: classTreeLeafLabel(classTree, selectedClass),
        students: [{ name: s.name, roll: s.roll, section: s.section, admissionNumber: s.admissionNumber }],
      });
    } catch (err) {
      setError(err instanceof PopupBlockedError ? t.examCoverSheets.popupBlocked : t.examCoverSheets.generateFailed);
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header__title">{t.examCoverSheets.title}</h2>
      </div>

      {error && <p className="alert alert--rose">{error}</p>}

      <Card className="mb-24">
        <div className="form-grid">
          <Field label={t.examCoverSheets.selectClass}>
            <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">{t.examCoverSheets.selectClass}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {classTreeLeafLabel(classTree, c)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.examCoverSheets.selectExamType}>
            <Select value={examType} onChange={(e) => setExamType(e.target.value)}>
              <option value="">{t.examCoverSheets.selectExamType}</option>
              {EXAM_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {lang === "en" ? et.labelEn : et.labelBn}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.examCoverSheets.subject}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.examCoverSheets.subjectPlaceholder} />
          </Field>

          <Field label={t.examCoverSheets.examDate}>
            <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </Field>
        </div>

        {selectedClass && (
          <div className="mb-18">
            <p className="section-title">{t.examCoverSheets.rosterFor}</p>
            {loadingStudents && <p className="text-muted">{t.examCoverSheets.loading}</p>}
            {!loadingStudents && !students.length && <p className="text-muted">{t.examCoverSheets.noStudentsInClass}</p>}
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
                        {printingId === s.id ? t.examCoverSheets.printing : t.examCoverSheets.printOne}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button variant="teal" solid onClick={generateAll} disabled={generating}>
          {generating ? t.examCoverSheets.generating : t.examCoverSheets.generateAll}
        </Button>
      </Card>
    </div>
  );
}

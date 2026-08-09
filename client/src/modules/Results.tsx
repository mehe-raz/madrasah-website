import { useEffect, useState } from "react";
import { SkeletonCardList } from "../components/Skeleton";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { EXAM_TYPES } from "../lib/examTypes";
import type { ResultStudentOption, StudentResult } from "../types";

export function Results() {
  const { t, lang } = useLanguage();

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState<ResultStudentOption[]>([]);

  const [examType, setExamType] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [subjectName, setSubjectName] = useState("");
  const [subjectFullMarks, setSubjectFullMarks] = useState("100");
  const [marksById, setMarksById] = useState<Record<number, string>>({});

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");

  const [savedResults, setSavedResults] = useState<StudentResult[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    api.getResultClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  const refreshList = async (className: string) => {
    setLoadingList(true);
    try {
      setSavedResults(await api.getResults({ class: className }));
    } catch {
      setSavedResults([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!selectedClass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the student list when no class is selected; nothing to derive during render since there's no class to fetch students for
      setStudents([]);
      return;
    }
    api.getResultStudents(selectedClass).then(setStudents).catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- switching class means the previous roster's marks-in-progress no longer apply, so the input map must reset alongside the fetch below
    setMarksById({});
    refreshList(selectedClass);
  }, [selectedClass]);

  const updateMark = (studentId: number, value: string) => {
    setMarksById((prev) => ({ ...prev, [studentId]: value }));
  };

  const addSubjectBatch = async () => {
    const entries = Object.entries(marksById)
      .filter(([, v]) => v.trim() !== "")
      .map(([studentId, v]) => ({ studentId: Number(studentId), marks: Number(v) }));

    if (!selectedClass || !examType || !year.trim() || !subjectName.trim() || !subjectFullMarks || !entries.length) {
      setError(t.results.saveFailed);
      return;
    }

    setSaving(true);
    setSavedMsg("");
    setError("");
    try {
      const res = await api.saveResultSubjectBatch({
        class: selectedClass,
        examName: examType,
        year: year.trim(),
        subjectName: subjectName.trim(),
        fullMarks: Number(subjectFullMarks),
        entries,
      });
      setSubjectName("");
      setSubjectFullMarks("100");
      setMarksById({});
      setSavedMsg(
        res.skipped.length
          ? `${t.results.addSubjectBatchSaved} — ${t.results.addSubjectBatchSkipped.replace("{count}", String(res.skipped.length))}`
          : t.results.addSubjectBatchSaved,
      );
      window.setTimeout(() => setSavedMsg(""), 3000);
      refreshList(selectedClass);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.results.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (row: StudentResult) => {
    try {
      await api.setResultPublished(row.id, !row.published);
      if (selectedClass) refreshList(selectedClass);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.results.saveFailed);
    }
  };

  const remove = async (row: StudentResult) => {
    try {
      await api.deleteResult(row.id);
      if (selectedClass) refreshList(selectedClass);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.results.saveFailed);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header__title">{t.results.title}</h2>
      </div>

      {error && <p className="alert alert--rose">{error}</p>}
      {savedMsg && <p className="alert alert--emerald">{savedMsg}</p>}

      <Card className="mb-24">
        <div className="form-grid">
          <Field label={t.results.selectClass}>
            <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">{t.results.selectClass}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.results.selectExamType}>
            <Select value={examType} onChange={(e) => setExamType(e.target.value)}>
              <option value="">{t.results.selectExamType}</option>
              {EXAM_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {lang === "en" ? et.labelEn : et.labelBn}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.results.year}>
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
          </Field>

          <Field label={t.results.subjectName}>
            <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder={t.results.subjectName} />
          </Field>

          <Field label={t.results.subjectFullMarks}>
            <Input type="number" value={subjectFullMarks} onChange={(e) => setSubjectFullMarks(e.target.value)} placeholder="100" />
          </Field>
        </div>

        {selectedClass && (
          <div className="mb-18">
            <p className="section-title">{t.results.marksFor}</p>
            {!students.length && <p className="text-muted">{t.results.noStudentsInClass}</p>}
            {!!students.length && (
              <div className="marks-entry-list">
                <div className="marks-entry-header">
                  <span>{t.attendance.roll}</span>
                  <span>{t.attendance.name}</span>
                  <span>{t.results.marksObtained}</span>
                </div>
                {students.map((s) => (
                  <div className="marks-entry-row" key={s.id}>
                    <span className="marks-entry-row__roll">{s.roll}</span>
                    <span className="marks-entry-row__name">{s.name}</span>
                    <Input
                      type="number"
                      value={marksById[s.id] ?? ""}
                      onChange={(e) => updateMark(s.id, e.target.value)}
                      placeholder={t.results.marksObtained}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button variant="teal" solid onClick={addSubjectBatch} disabled={saving}>
          {saving ? t.results.addSubjectBatchSaving : t.results.addSubjectBatch}
        </Button>
      </Card>

      {selectedClass && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>{t.results.savedResults}</h3>
          {loadingList && <SkeletonCardList count={3} lines={1} />}
          {!loadingList && !savedResults.length && <p style={{ color: C.muted, fontSize: 13 }}>{t.results.noResults}</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {savedResults.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                    {row.roll} — {row.studentName}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    {row.examName} · {row.year} · {row.obtainedMarks}/{row.totalMarks}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: row.published ? C.emeraldL : C.amberL,
                      color: row.published ? C.emeraldD : C.amberD,
                    }}
                  >
                    {row.published ? t.results.published : t.results.unpublished}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePublish(row)}
                    style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {row.published ? t.results.unpublish : t.results.publish}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {t.results.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

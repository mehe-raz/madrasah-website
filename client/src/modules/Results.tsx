import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import type { ResultStudentOption, ResultSubjectMark, StudentResult } from "../types";

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

const emptySubject: ResultSubjectMark = { name: "", marks: 0, fullMarks: 100 };

export function Results() {
  const { t } = useLanguage();

  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState<ResultStudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | "">("");

  const [examName, setExamName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [subjects, setSubjects] = useState<ResultSubjectMark[]>([{ ...emptySubject }]);
  const [gpa, setGpa] = useState("");
  const [grade, setGrade] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [savedResults, setSavedResults] = useState<StudentResult[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    api.getResultClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    api.getResultStudents(selectedClass).then(setStudents).catch(() => setStudents([]));
    refreshList(selectedClass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass]);

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

  const updateSubject = (index: number, patch: Partial<ResultSubjectMark>) => {
    setSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSubject = () => setSubjects((prev) => [...prev, { ...emptySubject }]);
  const removeSubject = (index: number) => setSubjects((prev) => prev.filter((_, i) => i !== index));

  const save = async () => {
    if (!selectedStudentId || !examName.trim() || !year.trim()) {
      setError(t.results.saveFailed);
      return;
    }
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api.saveResult({
        studentId: Number(selectedStudentId),
        examName: examName.trim(),
        year: year.trim(),
        subjects: subjects.filter((s) => s.name.trim()),
        gpa: gpa.trim(),
        grade: grade.trim(),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      if (selectedClass) refreshList(selectedClass);
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

  const totalObtained = subjects.reduce((sum, s) => sum + (Number(s.marks) || 0), 0);
  const totalFull = subjects.reduce((sum, s) => sum + (Number(s.fullMarks) || 0), 0);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 24 }}>{t.results.title}</h2>

      {error && <p style={{ color: C.roseD, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
          <label>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.selectClass}</span>
            <select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedStudentId(""); }} style={inputStyle}>
              <option value="">{t.results.selectClass}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.selectStudent}</span>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value ? Number(e.target.value) : "")}
              style={inputStyle}
              disabled={!students.length}
            >
              <option value="">{t.results.selectStudent}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.roll} — {s.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.examName}</span>
            <input value={examName} onChange={(e) => setExamName(e.target.value)} style={inputStyle} placeholder="যেমন: বার্ষিক পরীক্ষা" />
          </label>

          <label>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.year}</span>
            <input value={year} onChange={(e) => setYear(e.target.value)} style={inputStyle} placeholder="2026" />
          </label>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 700 }}>{t.results.subjects}</span>
          <div style={{ display: "grid", gap: 8 }}>
            {subjects.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={s.name}
                  onChange={(e) => updateSubject(i, { name: e.target.value })}
                  style={{ ...inputStyle, flex: 2, minWidth: 140 }}
                  placeholder={t.results.subjectName}
                />
                <input
                  type="number"
                  value={s.marks}
                  onChange={(e) => updateSubject(i, { marks: Number(e.target.value) })}
                  style={{ ...inputStyle, flex: 1, minWidth: 90 }}
                  placeholder={t.results.marksObtained}
                />
                <input
                  type="number"
                  value={s.fullMarks}
                  onChange={(e) => updateSubject(i, { fullMarks: Number(e.target.value) })}
                  style={{ ...inputStyle, flex: 1, minWidth: 90 }}
                  placeholder={t.results.fullMarks}
                />
                <button
                  type="button"
                  onClick={() => removeSubject(i)}
                  style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSubject}
            style={{ marginTop: 10, border: `1px dashed ${C.border}`, background: "transparent", color: C.emerald, borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}
          >
            {t.results.addSubject}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 18 }}>
          <label>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.gpa}</span>
            <input value={gpa} onChange={(e) => setGpa(e.target.value)} style={inputStyle} placeholder="5.00" />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.grade}</span>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle} placeholder="A+" />
          </label>
          <div>
            <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{t.results.total}</span>
            <div style={{ ...inputStyle, background: C.slateL }}>
              {totalObtained} / {totalFull}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 10, padding: "11px 24px", fontWeight: 700, fontSize: 14, cursor: saving ? "wait" : "pointer" }}
        >
          {saving ? t.results.saving : saved ? t.results.saved : t.results.save}
        </button>
      </div>

      {selectedClass && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>{t.results.savedResults}</h3>
          {loadingList && <p style={{ color: C.muted, fontSize: 13 }}>{t.common.loading}</p>}
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

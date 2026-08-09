import { useEffect, useState } from "react";
import { SkeletonCardList } from "../components/Skeleton";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { EXAM_TYPES } from "../lib/examTypes";
import { printResultSheet } from "../lib/printReport";
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
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [openExamKey, setOpenExamKey] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a checkbox selection made against the previous class's saved-results list has no meaning once the class changes
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an exam drilled into for the previous class doesn't exist in the new class's list
    setOpenExamKey(null);
    refreshList(selectedClass);
  }, [selectedClass]);

  // Groups the flat savedResults list (all exams for this class, all mixed
  // together) into one card per (examName, year) — সাজানো ক্লাস → পরীক্ষা →
  // ছাত্র navigation the results screen needs, instead of every student
  // from every exam in one long list. Sorted newest year first, then by
  // exam name, so the most recent exam is the first card.
  const examGroups = Object.values(
    savedResults.reduce<Record<string, { key: string; examName: string; year: string; rows: StudentResult[] }>>((acc, row) => {
      const key = `${row.examName}__${row.year}`;
      if (!acc[key]) acc[key] = { key, examName: row.examName, year: row.year, rows: [] };
      acc[key].rows.push(row);
      return acc;
    }, {}),
  ).sort((a, b) => (b.year !== a.year ? b.year.localeCompare(a.year) : a.examName.localeCompare(b.examName)));

  const openGroup = examGroups.find((g) => g.key === openExamKey) || null;
  const visibleRows = openGroup ? openGroup.rows : [];

  const examTypeLabel = (value: string) => {
    const found = EXAM_TYPES.find((et) => et.value === value);
    if (!found) return value;
    return lang === "en" ? found.labelEn : found.labelBn;
  };

  // Clamps to [0, subjectFullMarks] as the teacher types, so a mark above
  // the পূর্ণমান (full marks) can never even be entered — matches the
  // server-side clamp in results.js, this is just the immediate feedback.
  const updateMark = (studentId: number, value: string) => {
    if (value.trim() === "") {
      setMarksById((prev) => ({ ...prev, [studentId]: value }));
      return;
    }
    const full = Number(subjectFullMarks);
    let n = Number(value);
    if (Number.isNaN(n)) return;
    if (n < 0) n = 0;
    if (full > 0 && n > full) n = full;
    setMarksById((prev) => ({ ...prev, [studentId]: String(n) }));
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

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map((r) => r.id))));
  };

  const bulkPublish = async (published: boolean) => {
    if (!selectedIds.size) return;
    setBulkPublishing(true);
    setError("");
    setSavedMsg("");
    try {
      await api.setResultPublishedBatch([...selectedIds], published);
      setSavedMsg(published ? t.results.bulkPublishSuccess : t.results.bulkUnpublishSuccess);
      window.setTimeout(() => setSavedMsg(""), 3000);
      setSelectedIds(new Set());
      if (selectedClass) refreshList(selectedClass);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.results.saveFailed);
    } finally {
      setBulkPublishing(false);
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

  // Institution's own filing copy of the রেজাল্ট শীট (result sheet) — same
  // printable layout the guardian downloads (see GuardianResults.tsx),
  // but fetched via the admin sheet endpoint so it works for any result
  // row here, published or not.
  const printSheet = async (row: StudentResult) => {
    setPrintingId(row.id);
    setError("");
    try {
      const sheet = await api.getResultSheet(row.id);
      printResultSheet({
        examName: sheet.examName,
        year: sheet.year,
        studentName: sheet.studentName,
        class: sheet.class,
        roll: sheet.roll,
        subjects: sheet.subjects.map((s) => ({
          name: s.name,
          marks: s.marks,
          fullMarks: s.fullMarks,
          gpa: s.gpa,
          meritPosition: s.meritPosition,
        })),
        obtainedMarks: sheet.obtainedMarks,
        totalMarks: sheet.totalMarks,
        gpa: sheet.gpa,
        grade: sheet.grade,
        meritPosition: sheet.meritPosition,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.results.saveFailed);
    } finally {
      setPrintingId(null);
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
                      min={0}
                      max={Number(subjectFullMarks) || undefined}
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
          {!openGroup && (
            <>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 14px" }}>{t.results.savedResults}</h3>
              {loadingList && <SkeletonCardList count={3} lines={1} />}
              {!loadingList && !examGroups.length && <p style={{ color: C.muted, fontSize: 13 }}>{t.results.noResults}</p>}
              <div style={{ display: "grid", gap: 8 }}>
                {examGroups.map((g) => {
                  const publishedCount = g.rows.filter((r) => r.published).length;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        setOpenExamKey(g.key);
                        setSelectedIds(new Set());
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                          {examTypeLabel(g.examName)} · {g.year}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          {t.results.studentsCount.replace("{count}", String(g.rows.length))} · {publishedCount}/{g.rows.length} {t.results.published}
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: C.muted }}>›</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {openGroup && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenExamKey(null);
                      setSelectedIds(new Set());
                    }}
                    style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {t.results.backToExamList}
                  </button>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
                    {examTypeLabel(openGroup.examName)} · {openGroup.year} · {selectedClass}
                  </h3>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={visibleRows.length > 0 && selectedIds.size === visibleRows.length}
                      onChange={toggleSelectAll}
                    />
                    {t.results.selectAll}
                  </label>
                  {!!selectedIds.size && (
                    <span style={{ fontSize: 12, color: C.muted }}>
                      {t.results.selectedCount.replace("{count}", String(selectedIds.size))}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => bulkPublish(true)}
                    disabled={!selectedIds.size || bulkPublishing}
                    style={{ border: "none", background: C.emeraldL, color: C.emeraldD, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: selectedIds.size ? "pointer" : "not-allowed" }}
                  >
                    {bulkPublishing ? t.results.bulkPublishing : t.results.bulkPublish}
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkPublish(false)}
                    disabled={!selectedIds.size || bulkPublishing}
                    style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.text, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: selectedIds.size ? "pointer" : "not-allowed" }}
                  >
                    {t.results.bulkUnpublish}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {visibleRows.map((row) => (
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={row.studentName}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                          {row.roll} — {row.studentName}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          {row.obtainedMarks}/{row.totalMarks}
                        </div>
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
                        onClick={() => printSheet(row)}
                        disabled={printingId === row.id}
                        style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.text, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        {printingId === row.id ? t.results.printing : t.results.printSheet}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

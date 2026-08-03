import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";
import { printReportTable } from "../../lib/printReport";
import { Button } from "../../components/ui";
import type { GuardianShellContext } from "../../components/GuardianShell";
import type { StudentResult } from "../../types";

export function GuardianResults() {
  const { children, selected, selectChild } = useOutletContext<GuardianShellContext>();
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally sets loading=true immediately so the panel shows a loading state right away; the rest of the state updates land after the request resolves
    setLoading(true);
    setError("");
    api.guardian
      .getResults(selected.id)
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : "লোড করা যায়নি"))
      .finally(() => setLoading(false));
  }, [selected]);

  const download = (r: StudentResult) => {
    printReportTable({
      title: `ফলাফল — ${r.examName} ${r.year}`,
      subtitle: `${r.studentName} · ${r.class} · রোল ${r.roll} — মোট: ${r.obtainedMarks}/${r.totalMarks} · GPA ${r.gpa} · গ্রেড ${r.grade}`,
      headers: ["বিষয়", "প্রাপ্ত নম্বর", "পূর্ণমান"],
      rows: r.subjects.map((s) => [s.name, s.marks, s.fullMarks]),
    });
  };

  if (children.length === 0) {
    return <div className="soft-panel guardian-empty">কোনো সক্রিয় সন্তান যুক্ত নেই।</div>;
  }

  return (
    <div className="guardian-page">
      <div className="soft-panel-strong guardian-panel">
        <h1 className="guardian-title">ফলাফল — {selected?.name}</h1>
      </div>

      {children.length > 1 && (
        <div className="guardian-tab-row">
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectChild(c.id)}
              className={`pill guardian-tab${c.id === selected?.id ? " guardian-tab--active" : ""}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="guardian-loading">লোড হচ্ছে...</div>}
      {!loading && error && <div className="soft-panel guardian-error-box">{error}</div>}

      {!loading && !error && results.length === 0 && (
        <div className="soft-panel guardian-empty">
          এখনো কোনো প্রকাশিত ফলাফল নেই। প্রকাশিত হলে এখানেই দেখা যাবে।
        </div>
      )}

      {!loading && !error &&
        results.map((r) => (
          <div key={r.id} className="soft-panel guardian-result-card">
            <div className="guardian-result-head">
              <div>
                <div className="guardian-result-exam">{r.examName} {r.year}</div>
                <div className="guardian-meta-text">{r.class} · রোল {r.roll}</div>
              </div>
              <div className="guardian-result-score">
                <div className="guardian-result-gpa">GPA {r.gpa}</div>
                <div className="guardian-meta-text">গ্রেড: {r.grade}</div>
              </div>
            </div>

            <div className="guardian-subjects">
              {r.subjects.map((s, i) => (
                <div key={i} className="guardian-subject-row">
                  <span>{s.name}</span>
                  <span className="guardian-subject-marks">{s.marks} / {s.fullMarks}</span>
                </div>
              ))}
            </div>

            <div className="guardian-result-footer">
              <div className="guardian-result-total">মোট: {r.obtainedMarks} / {r.totalMarks}</div>
              <Button variant="sky" onClick={() => download(r)}>প্রিন্ট / ডাউনলোড</Button>
            </div>
          </div>
        ))}
    </div>
  );
}

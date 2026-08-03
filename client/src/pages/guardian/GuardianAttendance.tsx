import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../lib/api";
import type { GuardianShellContext } from "../../components/GuardianShell";
import type { GuardianAttendanceResponse } from "../../types";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const statusBadgeClass = (status: string) => {
  if (status === "উপস্থিত") return "guardian-status-badge--present";
  if (status === "অনুপস্থিত") return "guardian-status-badge--absent";
  return "guardian-status-badge--late";
};

export function GuardianAttendance() {
  const { children, selected, selectChild } = useOutletContext<GuardianShellContext>();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<GuardianAttendanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally sets loading=true immediately so the panel shows a loading state right away; the rest of the state updates land after the request resolves
    setLoading(true);
    setError("");
    api.guardian
      .getAttendance(selected.id, month)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "লোড করা যায়নি"))
      .finally(() => setLoading(false));
  }, [selected, month]);

  if (children.length === 0) {
    return <div className="soft-panel guardian-empty">কোনো সক্রিয় সন্তান যুক্ত নেই।</div>;
  }

  return (
    <div className="guardian-page">
      <div className="soft-panel-strong guardian-panel guardian-panel__row">
        <h1 className="guardian-title">উপস্থিতি — {selected?.name}</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="ds-input guardian-month-input"
        />
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

      {!loading && !error && data && (
        <>
          <div className="guardian-stats-grid">
            {([
              ["উপস্থিত", data.summary.present, "present"],
              ["অনুপস্থিত", data.summary.absent, "absent"],
              ["দেরিতে", data.summary.late, "late"],
            ] as const).map(([lbl, val, kind]) => (
              <div key={lbl} className="soft-panel guardian-stat">
                <div className={`guardian-stat__value guardian-stat__value--${kind}`}>{val}</div>
                <div className="guardian-stat__label">{lbl}</div>
              </div>
            ))}
          </div>

          {data.records.length === 0 ? (
            <div className="soft-panel guardian-empty">এই মাসে কোনো উপস্থিতি তথ্য নেই</div>
          ) : (
            <div className="soft-panel guardian-attendance-list">
              {data.records.map((r) => (
                <div key={r.date} className="guardian-attendance-row">
                  <span className="guardian-attendance-date">{r.date}</span>
                  <span className={`guardian-status-badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button } from "../../components/ui";
import { HudSpinner } from "../../components/HudSpinner";
import { Icons } from "../../lib/icons";
import { api } from "../../lib/api";
import { exportReport, ReportRangeRequiredError } from "../../lib/exportReports";
import { PopupBlockedError } from "../../lib/printReport";
import { useLanguage } from "../../context/AppSettingsContext";
import type { Student } from "../../types";

// Reports > "কল লিস্ট" ফিচার (docs/CALL_LIST_PLAN.md, Phase 2).
// Full-page in-app view for the "শিক্ষার্থী তালিকা"/"বকেয়া তালিকা" report cards —
// replaces the old behavior of those two cards (which used to go straight to
// print/CSV). Print/CSV are still available, just moved onto this page (see
// handleExport below, which reuses exportReport() as-is — no new export
// logic written here).

type CallListKind = "students" | "due" | "risk";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Phase 3 edge-case fix: stored phone numbers may contain spaces/dashes/
// parens (however staff typed them at admission), or occasionally a
// placeholder like "N/A" with no digits at all. Strip everything except
// digits and a leading "+" so `tel:` always opens reliably, and treat a
// value with no digits left as "no phone" rather than a broken tel: link.
function cleanPhone(phone: string): string {
  return phone.trim().replace(/[^\d+]/g, "");
}

export function CallListView() {
  const { t } = useLanguage();
  const { kind: kindParam } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const kind: CallListKind = kindParam === "due" ? "due" : kindParam === "risk" ? "risk" : "students";
  const month = useMemo(() => currentMonth(), []);
  const TITLES: Record<CallListKind, string> = {
    students: t.reports.callListTitleStudents,
    due: t.reports.callListTitleDue,
    risk: t.reports.callListTitleRisk,
  };

  const [students, setStudents] = useState<Student[]>([]);
  const [calledIds, setCalledIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"print" | "excel" | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Pulled out of the effect below (rather than left inline) so the
  // synchronous setLoading(true)/setError(null) at the top happen inside a
  // named function the effect merely *calls* — matching the established
  // pattern in AuditLogs.tsx/InstitutionBilling.tsx/etc. for "show a
  // loading state immediately, resolve the rest after the request lands".
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    // "risk" uses the server-side riskOnly filter (FLOOR(due/fee) >= 2,
    // see server/src/routes/students.js) rather than a client-side filter
    // like "due" — the threshold needs `fee` alongside `due`, and the
    // server already computes it once via `monthsUnpaid`.
    Promise.all([api.getStudents(kind === "risk" ? { riskOnly: true } : undefined), api.getCallLog(month)])
      .then(([allStudents, callLog]) => {
        if (cancelled) return;
        setStudents(kind === "due" ? allStudents.filter((s) => s.due > 0) : allStudents);
        setCalledIds(new Set(callLog.map((c) => c.studentId)));
      })
      .catch(() => {
        if (!cancelled) setError(t.reports.callListLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` intentionally excluded: switching language mid-load shouldn't re-fetch
  }, [kind, month]);

  useEffect(() => {
    // Invalid/missing :kind (anything other than "students"/"due") — send
    // back to the Reports grid rather than rendering a broken page.
    if (kindParam !== "students" && kindParam !== "due" && kindParam !== "risk") {
      navigate("/reports", { replace: true });
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    return load();
  }, [kindParam, navigate, load]);

  const toggleCalled = async (student: Student) => {
    setTogglingId(student.id);
    setError(null);
    const wasCalled = calledIds.has(student.id);
    try {
      if (wasCalled) {
        await api.unmarkStudentCalled(student.id, month);
        setCalledIds((prev) => {
          const next = new Set(prev);
          next.delete(student.id);
          return next;
        });
      } else {
        await api.markStudentCalled(student.id, month);
        setCalledIds((prev) => new Set(prev).add(student.id));
      }
    } catch {
      setError(t.reports.callListStatusUpdateFailed);
    } finally {
      setTogglingId(null);
    }
  };

  const handleExport = async (format: "print" | "excel") => {
    setExporting(format);
    setError(null);
    try {
      // students/due are never date-range-filtered (see exportReports.ts's
      // RANGE_FILTERED map), so no range arg is needed here.
      await exportReport(kind, format);
    } catch (err) {
      if (err instanceof ReportRangeRequiredError) {
        setError(t.reports.callListRangeRequired);
      } else if (err instanceof PopupBlockedError) {
        setError(t.reports.popupBlocked);
      } else {
        setError(t.reports.callListExportFailed);
      }
    } finally {
      setExporting(null);
    }
  };

  const calledCount = students.filter((s) => calledIds.has(s.id)).length;

  return (
    <div>
      <div className="call-list-topbar">
        <Button variant="outline" onClick={() => navigate("/reports")}>
          <Icons.chevronLeft size={16} aria-hidden="true" /> {t.reports.callListBack}
        </Button>
        <div className="call-list-topbar__actions">
          <Button variant="teal" onClick={() => handleExport("print")} disabled={exporting !== null || loading}>
            {exporting === "print" ? "…" : (
              <>
                <Icons.printer size={14} aria-hidden="true" /> {t.common.print}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => handleExport("excel")} disabled={exporting !== null || loading}>
            {exporting === "excel" ? "…" : "CSV"}
          </Button>
        </div>
      </div>

      <h2 className="page-title">{TITLES[kind]}</h2>
      <p className="page-subtitle">{t.reports.callListMonth.replace("{month}", month)}</p>

      {error && <div className="alert alert--rose">{error}</div>}

      {loading ? (
        <HudSpinner />
      ) : (
        <>
          <div className="call-list-summary">
            {t.reports.callListSummary
              .replace("{total}", String(students.length))
              .replace("{called}", String(calledCount))
              .replace("{remaining}", String(students.length - calledCount))}
          </div>

          <Card className="table-card call-list-card">
            <div className="call-list">
              <div className="call-list-header">
                <span className="call-list-row__roll">{t.reports.callListRoll}</span>
                <span className="call-list-row__name">{t.reports.callListName}</span>
                <span className="call-list-row__meta">{t.reports.callListClass}</span>
                {(kind === "due" || kind === "risk") && <span className="call-list-row__meta">{t.reports.callListDue}</span>}
                {kind === "risk" && <span className="call-list-row__meta">{t.reports.callListMonthsUnpaid}</span>}
                <span className="call-list-row__actions">{t.reports.callListCallStatus}</span>
              </div>

              {students.map((s) => {
                const called = calledIds.has(s.id);
                const cleanedPhone = s.phone ? cleanPhone(s.phone) : "";
                const hasPhone = cleanedPhone.length > 0;
                return (
                  <div className="call-list-row" key={s.id}>
                    <span className="call-list-row__roll">{s.roll}</span>
                    <span className="call-list-row__name">{s.name}</span>
                    <span className="call-list-row__meta call-list-row__meta--class">{s.class}</span>
                    {(kind === "due" || kind === "risk") && <span className="call-list-row__meta call-list-row__meta--due">{s.due}</span>}
                    {kind === "risk" && <span className="call-list-row__meta call-list-row__meta--due">{s.monthsUnpaid ?? "—"}</span>}
                    <span className="call-list-row__actions">
                      <a
                        className="call-list-row__call-btn"
                        href={hasPhone ? `tel:${cleanedPhone}` : undefined}
                        aria-disabled={!hasPhone}
                        aria-label={hasPhone ? t.reports.callListCallStudent.replace("{name}", s.name) : t.reports.callListNoNumber}
                        title={hasPhone ? s.phone : t.reports.callListNoNumber}
                      >
                        <Icons.phone size={16} aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        className={`call-list-row__status-btn ${
                          called ? "call-list-row__status-btn--called" : "call-list-row__status-btn--not-called"
                        }`}
                        onClick={() => toggleCalled(s)}
                        disabled={togglingId === s.id}
                        aria-label={called ? t.reports.callListCalledUnmark : t.reports.callListNotCalledMark}
                        title={called ? t.reports.callListCalled : t.reports.callListNotCalled}
                      >
                        {togglingId === s.id ? (
                          "…"
                        ) : called ? (
                          <Icons.checkCircle size={16} aria-hidden="true" />
                        ) : (
                          <Icons.alertTriangle size={16} aria-hidden="true" />
                        )}
                      </button>
                    </span>
                  </div>
                );
              })}

              {students.length === 0 && <p className="page-subtitle">{t.reports.callListNoStudents}</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReportDateFilter } from "../components/ReportDateFilter";
import { defaultReportRange, type ReportRange } from "../lib/reportRange";
import type { ReportKind } from "../lib/exportReports";
import { ReportRangeRequiredError } from "../lib/exportReports";
import { PopupBlockedError } from "../lib/printReport";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/AppSettingsContext";
import { canAccess, type Permission } from "../lib/permissions";
import { C } from "../theme/colors";
import { Card } from "../components/ui";
import { Icons, type IconKey } from "../lib/icons";
import type { Dict } from "../i18n/bn";

// Each report's underlying data comes from a different API resource, and
// that resource enforces its own permission — it isn't covered just because
// the user can see the Reports page (which only requires "reports").
// e.g. "students"/"due" call the students API (needs "students"), "hifz"
// calls the hifz API (needs "hifz"). Without this map, a role like
// Accountant (reports+income+expenses, no students/hifz) could see and
// click those cards but get a 403 from the server every time.
const REPORT_PERMISSION: Record<ReportKind, Permission> = {
  students: "students",
  due: "students",
  risk: "students",
  attendance: "reports",
  income: "income",
  expenses: "expenses",
  hifz: "hifz",
};

// Titles/descriptions come from the current language's dictionary (see
// i18n/bn.ts / i18n/en.ts -> reports.*) so the cards switch with the rest
// of the UI instead of staying fixed in one language.
function buildReports(t: Dict): { title: string; kind: ReportKind; icon: IconKey; desc: string; color: string }[] {
  return [
    { title: t.reports.studentsTitle, kind: "students", icon: "students", desc: t.reports.studentsDesc, color: C.teal },
    { title: t.reports.dueTitle, kind: "due", icon: "alertTriangle", desc: t.reports.dueDesc, color: C.rose },
    { title: t.reports.riskTitle, kind: "risk", icon: "alertTriangle", desc: t.reports.riskDesc, color: C.rose },
    { title: t.reports.attendanceTitle, kind: "attendance", icon: "attendance", desc: t.reports.attendanceDesc, color: C.amber },
    { title: t.reports.incomeTitle, kind: "income", icon: "income", desc: t.reports.incomeDesc, color: C.emerald },
    { title: t.reports.expensesTitle, kind: "expenses", icon: "expenses", desc: t.reports.expensesDesc, color: C.violet },
    { title: t.reports.hifzTitle, kind: "hifz", icon: "hifz", desc: t.reports.hifzDesc, color: C.sky },
  ];
}

// Reports > "কল লিস্ট" ফিচার (docs/CALL_LIST_PLAN.md) + "রিস্ক জোন"
// (docs/RISK_ZONE_PLAN.md Phase 2): these report kinds no longer export
// directly from the card click — they open the full-page CallListView first
// (Back/Exit, call button, called/not-called mark), which is where
// print/CSV now live for them. The other four kinds
// (attendance/income/expenses/hifz) are unchanged.
const CALL_LIST_KINDS: ReportKind[] = ["students", "due", "risk"];

export function Reports() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const role = user?.role || "";
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ReportRange>(defaultReportRange());
  const reports = useMemo(() => buildReports(t), [t]);

  const handleExport = async (kind: ReportKind, format: "print" | "excel") => {
    const key = `${kind}-${format}`;
    setLoading(key);
    setError(null);
    try {
      const { exportReport } = await import("../lib/exportReports");
      await exportReport(kind, format, { from: range.from, to: range.to });
    } catch (err) {
      if (err instanceof ReportRangeRequiredError) {
        setError(t.reports.rangeRequired);
      } else if (err instanceof PopupBlockedError) {
        setError(t.reports.popupBlocked);
      } else if (err instanceof Error && (err.message === "Access denied" || err.message === "UNAUTHORIZED")) {
        setError(t.reports.permissionDenied);
      } else {
        setError(t.reports.genericFailed);
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h2 className="page-title">{t.reports.title}</h2>
      <p className="page-subtitle">{t.reports.subtitle}</p>

      <ReportDateFilter value={range} onChange={setRange} />

      {error && <div className="alert alert--rose">{error}</div>}

      <div className="reports-grid">
        {reports.map((r) => {
          const allowed = canAccess(role, REPORT_PERMISSION[r.kind]);
          const disabled = loading !== null || !allowed;
          const isCallList = CALL_LIST_KINDS.includes(r.kind);
          return (
            <Card key={r.title} className="report-card" style={{ opacity: allowed ? 1 : 0.55 }}>
              <div className="report-card__icon">{(() => { const RIcon = Icons[r.icon]; return <RIcon size={32} aria-hidden="true" />; })()}</div>
              <h3 className="report-card__title">{r.title}</h3>
              <p className="report-card__desc">{allowed ? r.desc : t.reports.noPermissionDesc}</p>
              <div className="report-card__actions">
                {/* Each report kind has its own accent color (r.color) —
                    per-instance data, so it can't be a static CSS class.
                    Documented exception, see AGENTS.md Design System section. */}
                {isCallList ? (
                  <button
                    type="button"
                    disabled={!allowed}
                    title={allowed ? undefined : t.reports.noPermissionTitle}
                    onClick={() => navigate(`/reports/call-list/${r.kind}`)}
                    className="report-card__btn"
                    // eslint-disable-next-line no-restricted-syntax -- dynamic per-report accent color, see comment above
                    style={{ background: r.color + "18", color: r.color, border: `1px solid ${r.color}40` }}
                  >
                    {t.reports.viewCallList}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      title={allowed ? undefined : t.reports.noPermissionTitle}
                      onClick={() => handleExport(r.kind, "print")}
                      className="report-card__btn"
                      // eslint-disable-next-line no-restricted-syntax -- dynamic per-report accent color, see comment above
                      style={{ background: r.color + "18", color: r.color, border: `1px solid ${r.color}40` }}
                    >
                      {loading === `${r.kind}-print` ? "…" : (<><Icons.printer size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{t.common.print}</>)}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      title={allowed ? undefined : t.reports.noPermissionTitle}
                      onClick={() => handleExport(r.kind, "excel")}
                      className="report-card__btn report-card__btn--csv"
                    >
                      {loading === `${r.kind}-excel` ? "…" : "CSV"}
                    </button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

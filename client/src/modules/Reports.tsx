import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReportDateFilter } from "../components/ReportDateFilter";
import { defaultReportRange, type ReportRange } from "../lib/reportRange";
import type { ReportKind } from "../lib/exportReports";
import { ReportRangeRequiredError } from "../lib/exportReports";
import { PopupBlockedError } from "../lib/printReport";
import { useAuth } from "../context/AuthContext";
import { canAccess, type Permission } from "../lib/permissions";
import { C } from "../theme/colors";
import { Card } from "../components/ui";
import { Icons, type IconKey } from "../lib/icons";

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

const reports: { title: string; kind: ReportKind; icon: IconKey; desc: string; color: string }[] = [
  { title: "শিক্ষার্থী তালিকা", kind: "students", icon: "students", desc: "সকল শিক্ষার্থীর বিস্তারিত তালিকা", color: C.teal },
  { title: "বকেয়া তালিকা", kind: "due", icon: "alertTriangle", desc: "যেসব শিক্ষার্থীর বেতন বাকি আছে", color: C.rose },
  { title: "রিস্ক জোন", kind: "risk", icon: "alertTriangle", desc: "২+ মাস বেতন বকেয়া শিক্ষার্থী", color: C.rose },
  { title: "হাজিরা রিপোর্ট", kind: "attendance", icon: "attendance", desc: "নির্বাচিত তারিখের হাজিরা", color: C.amber },
  { title: "আয় রিপোর্ট", kind: "income", icon: "income", desc: "নির্বাচিত সময়ের আয়", color: C.emerald },
  { title: "ব্যয় রিপোর্ট", kind: "expenses", icon: "expenses", desc: "নির্বাচিত সময়ের ব্যয়", color: C.violet },
  { title: "হিফজ রিপোর্ট", kind: "hifz", icon: "hifz", desc: "শিক্ষার্থীদের হিফজ অগ্রগতি", color: C.sky },
];

// Reports > "কল লিস্ট" ফিচার (docs/CALL_LIST_PLAN.md) + "রিস্ক জোন"
// (docs/RISK_ZONE_PLAN.md Phase 2): these report kinds no longer export
// directly from the card click — they open the full-page CallListView first
// (Back/Exit, call button, called/not-called mark), which is where
// print/CSV now live for them. The other four kinds
// (attendance/income/expenses/hifz) are unchanged.
const CALL_LIST_KINDS: ReportKind[] = ["students", "due", "risk"];

export function Reports() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || "";
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ReportRange>(defaultReportRange());

  const handleExport = async (kind: ReportKind, format: "print" | "excel") => {
    const key = `${kind}-${format}`;
    setLoading(key);
    setError(null);
    try {
      const { exportReport } = await import("../lib/exportReports");
      await exportReport(kind, format, { from: range.from, to: range.to });
    } catch (err) {
      if (err instanceof ReportRangeRequiredError) {
        setError("তারিখ পরিসীমা (from / to) সিলেক্ট করুন — এই রিপোর্টের জন্য দুটোই আবশ্যক।");
      } else if (err instanceof PopupBlockedError) {
        setError("ব্রাউজারের পপ-আপ ব্লকারের কারণে প্রিন্ট উইন্ডো খোলা যায়নি। ঠিকানা বারে পপ-আপ অনুমতি চালু করে আবার চেষ্টা করুন।");
      } else if (err instanceof Error && (err.message === "Access denied" || err.message === "UNAUTHORIZED")) {
        setError("এই রিপোর্ট দেখার অনুমতি আপনার নেই। প্রয়োজনে অ্যাডমিনের সাথে যোগাযোগ করুন।");
      } else {
        setError("রিপোর্ট তৈরি করা যায়নি। সার্ভার চালু আছে কিনা দেখুন।");
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h2 className="page-title">রিপোর্ট ও এক্সপোর্ট</h2>
      <p className="page-subtitle">মাস বা তারিখ সিলেক্ট করে প্রিন্ট বা CSV ডাউনলোড করুন।</p>

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
              <p className="report-card__desc">{allowed ? r.desc : "এই রিপোর্ট দেখার অনুমতি আপনার নেই"}</p>
              <div className="report-card__actions">
                {/* Each report kind has its own accent color (r.color) —
                    per-instance data, so it can't be a static CSS class.
                    Documented exception, see AGENTS.md Design System section. */}
                {isCallList ? (
                  <button
                    type="button"
                    disabled={!allowed}
                    title={allowed ? undefined : "অনুমতি নেই"}
                    onClick={() => navigate(`/reports/call-list/${r.kind}`)}
                    className="report-card__btn"
                    // eslint-disable-next-line no-restricted-syntax -- dynamic per-report accent color, see comment above
                    style={{ background: r.color + "18", color: r.color, border: `1px solid ${r.color}40` }}
                  >
                    কল লিস্ট দেখুন
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      title={allowed ? undefined : "অনুমতি নেই"}
                      onClick={() => handleExport(r.kind, "print")}
                      className="report-card__btn"
                      // eslint-disable-next-line no-restricted-syntax -- dynamic per-report accent color, see comment above
                      style={{ background: r.color + "18", color: r.color, border: `1px solid ${r.color}40` }}
                    >
                      {loading === `${r.kind}-print` ? "…" : (<><Icons.printer size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />প্রিন্ট</>)}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      title={allowed ? undefined : "অনুমতি নেই"}
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

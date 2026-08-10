import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button } from "../../components/ui";
import { HudSpinner } from "../../components/HudSpinner";
import { Icons } from "../../lib/icons";
import { api } from "../../lib/api";
import { exportReport, ReportRangeRequiredError } from "../../lib/exportReports";
import { PopupBlockedError } from "../../lib/printReport";
import type { Student } from "../../types";

// Reports > "কল লিস্ট" ফিচার (docs/CALL_LIST_PLAN.md, Phase 2).
// Full-page in-app view for the "ছাত্র তালিকা"/"বকেয়া তালিকা" report cards —
// replaces the old behavior of those two cards (which used to go straight to
// print/CSV). Print/CSV are still available, just moved onto this page (see
// handleExport below, which reuses exportReport() as-is — no new export
// logic written here).

type CallListKind = "students" | "due";

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

const TITLES: Record<CallListKind, string> = {
  students: "কল লিস্ট — ছাত্র তালিকা",
  due: "কল লিস্ট — বকেয়া তালিকা",
};

export function CallListView() {
  const { kind: kindParam } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const kind: CallListKind = kindParam === "due" ? "due" : "students";
  const month = useMemo(() => currentMonth(), []);

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
    Promise.all([api.getStudents(), api.getCallLog(month)])
      .then(([allStudents, callLog]) => {
        if (cancelled) return;
        setStudents(kind === "due" ? allStudents.filter((s) => s.due > 0) : allStudents);
        setCalledIds(new Set(callLog.map((c) => c.studentId)));
      })
      .catch(() => {
        if (!cancelled) setError("তালিকা লোড করা যায়নি। সার্ভার চালু আছে কিনা দেখুন।");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, month]);

  useEffect(() => {
    // Invalid/missing :kind (anything other than "students"/"due") — send
    // back to the Reports grid rather than rendering a broken page.
    if (kindParam !== "students" && kindParam !== "due") {
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
      setError("কল-স্ট্যাটাস আপডেট করা যায়নি। আবার চেষ্টা করুন।");
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
        setError("তারিখ পরিসীমা প্রয়োজন।");
      } else if (err instanceof PopupBlockedError) {
        setError("ব্রাউজারের পপ-আপ ব্লকারের কারণে প্রিন্ট উইন্ডো খোলা যায়নি। ঠিকানা বারে পপ-আপ অনুমতি চালু করে আবার চেষ্টা করুন।");
      } else {
        setError("এক্সপোর্ট করা যায়নি।");
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
          <Icons.chevronLeft size={16} aria-hidden="true" /> ফিরে যান
        </Button>
        <div className="call-list-topbar__actions">
          <Button variant="teal" onClick={() => handleExport("print")} disabled={exporting !== null || loading}>
            {exporting === "print" ? "…" : (
              <>
                <Icons.printer size={14} aria-hidden="true" /> প্রিন্ট
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => handleExport("excel")} disabled={exporting !== null || loading}>
            {exporting === "excel" ? "…" : "CSV"}
          </Button>
        </div>
      </div>

      <h2 className="page-title">{TITLES[kind]}</h2>
      <p className="page-subtitle">মাস: {month} — কাকে কল দেওয়া হয়েছে তা নিচে মার্ক করুন</p>

      {error && <div className="alert alert--rose">{error}</div>}

      {loading ? (
        <HudSpinner />
      ) : (
        <>
          <div className="call-list-summary">
            মোট {students.length} জন · কল হয়েছে {calledCount} জন · বাকি {students.length - calledCount} জন
          </div>

          <Card className="table-card call-list-card">
            <div className="call-list">
              <div className="call-list-header">
                <span className="call-list-row__roll">রোল</span>
                <span className="call-list-row__name">নাম</span>
                <span className="call-list-row__meta">ক্লাস</span>
                {kind === "due" && <span className="call-list-row__meta">বকেয়া</span>}
                <span className="call-list-row__actions">কল / স্ট্যাটাস</span>
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
                    {kind === "due" && <span className="call-list-row__meta call-list-row__meta--due">{s.due}</span>}
                    <span className="call-list-row__actions">
                      <a
                        className="call-list-row__call-btn"
                        href={hasPhone ? `tel:${cleanedPhone}` : undefined}
                        aria-disabled={!hasPhone}
                        aria-label={hasPhone ? `${s.name}-কে কল করুন` : "নম্বর নেই"}
                        title={hasPhone ? s.phone : "নম্বর নেই"}
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
                        aria-label={called ? "কল দেওয়া হয়েছে — আনমার্ক করতে ক্লিক করুন" : "কল দেওয়া হয়নি — মার্ক করতে ক্লিক করুন"}
                        title={called ? "কল দেওয়া হয়েছে" : "কল দেওয়া হয়নি"}
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

              {students.length === 0 && <p className="page-subtitle">কোনো ছাত্র পাওয়া যায়নি।</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

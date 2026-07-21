import { useState } from "react";
import { defaultReportRange, ReportDateFilter, type ReportRange } from "../components/ReportDateFilter";
import type { ReportKind } from "../lib/exportReports";
import { ReportRangeRequiredError } from "../lib/exportReports";
import { PopupBlockedError } from "../lib/printReport";
import { useAuth } from "../context/AuthContext";
import { canAccess, type Permission } from "../lib/permissions";
import { C } from "../theme/colors";

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
  attendance: "reports",
  income: "income",
  expenses: "expenses",
  hifz: "hifz",
};

const reports: { title: string; kind: ReportKind; icon: string; desc: string; color: string }[] = [
  { title: "ছাত্র তালিকা", kind: "students", icon: "👨‍🎓", desc: "সকল ছাত্রের বিস্তারিত তালিকা", color: C.teal },
  { title: "বকেয়া তালিকা", kind: "due", icon: "⚠️", desc: "যেসব ছাত্রের বেতন বাকি আছে", color: C.rose },
  { title: "হাজিরা রিপোর্ট", kind: "attendance", icon: "📅", desc: "নির্বাচিত তারিখের হাজিরা", color: C.amber },
  { title: "আয় রিপোর্ট", kind: "income", icon: "💰", desc: "নির্বাচিত সময়ের আয়", color: C.emerald },
  { title: "ব্যয় রিপোর্ট", kind: "expenses", icon: "💸", desc: "নির্বাচিত সময়ের ব্যয়", color: C.violet },
  { title: "হিফজ রিপোর্ট", kind: "hifz", icon: "📖", desc: "ছাত্রদের হিফজ অগ্রগতি", color: C.sky },
];

export function Reports() {
  const { user } = useAuth();
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
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>রিপোর্ট ও এক্সপোর্ট</h2>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>মাস বা তারিখ সিলেক্ট করে প্রিন্ট বা CSV ডাউনলোড করুন।</p>

      <ReportDateFilter value={range} onChange={setRange} />

      {error && (
        <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
        {reports.map((r) => {
          const allowed = canAccess(role, REPORT_PERMISSION[r.kind]);
          const disabled = loading !== null || !allowed;
          return (
            <div key={r.title} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, opacity: allowed ? 1 : 0.55 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{r.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{r.title}</h3>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
                {allowed ? r.desc : "এই রিপোর্ট দেখার অনুমতি আপনার নেই"}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={disabled} title={allowed ? undefined : "অনুমতি নেই"} onClick={() => handleExport(r.kind, "print")} style={{ flex: 1, background: r.color + "18", color: r.color, border: `1px solid ${r.color}40`, borderRadius: 7, padding: "7px 10px", cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                  {loading === `${r.kind}-print` ? "…" : "🖨️ প্রিন্ট"}
                </button>
                <button type="button" disabled={disabled} title={allowed ? undefined : "অনুমতি নেই"} onClick={() => handleExport(r.kind, "excel")} style={{ flex: 1, background: C.slateL, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                  {loading === `${r.kind}-excel` ? "…" : "CSV"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

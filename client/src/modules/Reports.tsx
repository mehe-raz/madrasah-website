import { useState } from "react";
import { defaultReportRange, ReportDateFilter, type ReportRange } from "../components/ReportDateFilter";
import type { ReportKind } from "../lib/exportReports";
import { C } from "../theme/colors";
import { useLanguage } from "../context/AppSettingsContext";

const REPORT_META: { titleKey: string; descKey: string; kind: ReportKind; icon: string; color: string }[] = [
  { titleKey: "studentsTitle", descKey: "studentsDesc", kind: "students", icon: "👨‍🎓", color: C.teal },
  { titleKey: "dueTitle", descKey: "dueDesc", kind: "due", icon: "⚠️", color: C.rose },
  { titleKey: "attendanceTitle", descKey: "attendanceDesc", kind: "attendance", icon: "📅", color: C.amber },
  { titleKey: "incomeTitle", descKey: "incomeDesc", kind: "income", icon: "💰", color: C.emerald },
  { titleKey: "expensesTitle", descKey: "expensesDesc", kind: "expenses", icon: "💸", color: C.violet },
  { titleKey: "hifzTitle", descKey: "hifzDesc", kind: "hifz", icon: "📖", color: C.sky },
];

export function Reports() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ReportRange>(defaultReportRange());

  const reports = REPORT_META.map((r) => ({
    ...r,
    title: t.reports[r.titleKey as keyof typeof t.reports],
    desc: t.reports[r.descKey as keyof typeof t.reports],
  }));

  const handleExport = async (kind: ReportKind, format: "pdf" | "excel") => {
    const key = `${kind}-${format}`;
    setLoading(key);
    setError(null);
    try {
      const { exportReport } = await import("../lib/exportReports");
      await exportReport(kind, format, { from: range.from, to: range.to });
    } catch {
      setError(t.reports.downloadFailed);
    } finally {
      setLoading(null);
    }
  };

  const exportAllPdf = async () => {
    setLoading("all-pdf");
    setError(null);
    try {
      const { exportReport } = await import("../lib/exportReports");
      for (const r of REPORT_META) {
        if (["income", "expenses", "attendance"].includes(r.kind)) {
          await exportReport(r.kind, "pdf", { from: range.from, to: range.to });
        }
      }
    } catch {
      setError(t.reports.multiDownloadFailed);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>{t.reports.title}</h2>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>{t.reports.subtitle}</p>

      <ReportDateFilter value={range} onChange={setRange} />

      <button
        type="button"
        disabled={loading !== null}
        onClick={exportAllPdf}
        style={{ marginBottom: 20, background: C.violet, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
      >
        {loading === "all-pdf" ? "…" : `📄 ${t.reports.downloadBundle}`}
      </button>

      {error && (
        <div>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
        {reports.map((r) => (
          <div key={r.kind} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{r.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{r.title}</h3>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{r.desc}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={loading !== null} onClick={() => handleExport(r.kind, "pdf")} style={{ flex: 1, background: r.color + "18", color: r.color, border: `1px solid ${r.color}40`, borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {loading === `${r.kind}-pdf` ? "…" : "📄 PDF"}
              </button>
              <button type="button" disabled={loading !== null} onClick={() => handleExport(r.kind, "excel")} style={{ flex: 1, background: C.slateL, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {loading === `${r.kind}-excel` ? "…" : "CSV"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

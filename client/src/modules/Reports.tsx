import { useState } from "react";
import { defaultReportRange, ReportDateFilter, type ReportRange } from "../components/ReportDateFilter";
import type { ReportKind } from "../lib/exportReports";
import { C } from "../theme/colors";

const reports: { title: string; kind: ReportKind; icon: string; desc: string; color: string }[] = [
  { title: "ছাত্র তালিকা", kind: "students", icon: "👨‍🎓", desc: "সকল ছাত্রের বিস্তারিত তালিকা", color: C.teal },
  { title: "বকেয়া তালিকা", kind: "due", icon: "⚠️", desc: "যেসব ছাত্রের বেতন বাকি আছে", color: C.rose },
  { title: "হাজিরা রিপোর্ট", kind: "attendance", icon: "📅", desc: "নির্বাচিত তারিখের হাজিরা", color: C.amber },
  { title: "আয় রিপোর্ট", kind: "income", icon: "💰", desc: "নির্বাচিত সময়ের আয়", color: C.emerald },
  { title: "ব্যয় রিপোর্ট", kind: "expenses", icon: "💸", desc: "নির্বাচিত সময়ের ব্যয়", color: C.violet },
  { title: "হিফজ রিপোর্ট", kind: "hifz", icon: "📖", desc: "ছাত্রদের হিফজ অগ্রগতি", color: C.sky },
];

export function Reports() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ReportRange>(defaultReportRange());

  const handleExport = async (kind: ReportKind, format: "pdf" | "excel") => {
    const key = `${kind}-${format}`;
    setLoading(key);
    setError(null);
    try {
      const { exportReport } = await import("../lib/exportReports");
      await exportReport(kind, format, { from: range.from, to: range.to });
    } catch {
      setError("রিপোর্ট ডাউনলোড করা যায়নি। সার্ভার চালু আছে কিনা দেখুন।");
    } finally {
      setLoading(null);
    }
  };

  const exportAllPdf = async () => {
    setLoading("all-pdf");
    setError(null);
    try {
      const { exportReport } = await import("../lib/exportReports");
      for (const r of reports) {
        if (["income", "expenses", "attendance"].includes(r.kind)) {
          await exportReport(r.kind, "pdf", { from: range.from, to: range.to });
        }
      }
    } catch {
      setError("একাধিক রিপোর্ট ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>রিপোর্ট ও এক্সপোর্ট</h2>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>মাস বা তারিখ সিলেক্ট করে PDF/CSV ডাউনলোড করুন।</p>

      <ReportDateFilter value={range} onChange={setRange} />

      <button
        type="button"
        disabled={loading !== null}
        onClick={exportAllPdf}
        style={{ marginBottom: 22, background: C.violet, color: "#fdfbf6", border: "none", borderRadius: 9, padding: "11px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, letterSpacing: 0.2, boxShadow: "0 4px 14px rgba(106,63,106,0.28)" }}
      >
        {loading === "all-pdf" ? "…" : "📄 Download income + expense + attendance PDF (selected period)"}
      </button>

      {error && (
        <div>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
        {reports.map((r) => (
          <div key={r.title} style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(20,16,10,0.04), 0 6px 20px rgba(20,16,10,0.06)", padding: 22, borderTop: `2px solid ${r.color}` }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{r.icon}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4, fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>{r.title}</h3>
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

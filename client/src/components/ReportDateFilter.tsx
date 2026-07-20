/**
 * Date / month filter for reports | রিপোর্ট তারিখ বা মাস ফিল্টার
 */
import { C } from "../theme/colors";

export interface ReportRange {
  from: string;
  to: string;
  label: string;
}

interface ReportDateFilterProps {
  value: ReportRange;
  onChange: (r: ReportRange) => void;
}

function monthRange(ym: string): ReportRange {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, "0")}`,
    label: ym,
  };
}

function currentMonth() {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return monthRange(ym);
}

export function defaultReportRange(): ReportRange {
  return currentMonth();
}

export function ReportDateFilter({ value, onChange }: ReportDateFilterProps) {
  const monthInput = value.from.slice(0, 7);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22, boxShadow: "0 1px 2px rgba(20,16,10,0.04), 0 6px 20px rgba(20,16,10,0.06)" }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>📅 Report period / রিপোর্ট সময়কাল</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Month / মাস</label>
          <input
            type="month"
            value={monthInput}
            onChange={(e) => onChange(monthRange(e.target.value))}
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: C.card, color: C.text }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>From / থেকে</label>
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value, label: `${e.target.value} — ${value.to}` })}
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: C.card, color: C.text }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>To / পর্যন্ত</label>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value, label: `${value.from} — ${e.target.value}` })}
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, background: C.card, color: C.text }}
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(currentMonth())}
          style={{ border: `1px solid ${C.teal}`, background: C.tealL, color: C.tealD, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
        >
          Current month
        </button>
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 10, marginBottom: 0 }}>
        Selected: <strong>{value.from}</strong> to <strong>{value.to}</strong>
      </p>
    </div>
  );
}

/**
 * Date / month filter for reports | রিপোর্ট তারিখ বা মাস ফিল্টার
 */
import { C } from "../theme/colors";
import { currentMonth, monthRange, type ReportRange } from "../lib/reportRange";
import { Icons } from "../lib/icons";

interface ReportDateFilterProps {
  value: ReportRange;
  onChange: (r: ReportRange) => void;
}

export function ReportDateFilter({ value, onChange }: ReportDateFilterProps) {
  const monthInput = value.from.slice(0, 7);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}><Icons.attendance size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />Report period / রিপোর্ট সময়কাল</h3>
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

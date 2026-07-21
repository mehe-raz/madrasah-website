import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { Student } from "../types";

const DEPTS = ["Hifz", "Kitab", "Nazera", "General", "All"] as const;

export function Attendance() {
  const { t } = useLanguage();
  const [dept, setDept] = useState<string>("All");
  const [att, setAtt] = useState<Student[]>([]);
  const [saved, setSaved] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(() => {
    api.getAttendance({ dept, date }).then((res) => {
      setAtt(res.students);
      setDate(res.date);
    });
  }, [dept, date]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: number, val: string) =>
    setAtt(att.map((s) => (s.id === id ? { ...s, att: val } : s)));

  const stats = {
    present: att.filter((s) => s.att === "উপস্থিত").length,
    absent: att.filter((s) => s.att === "অনুপস্থিত").length,
    late: att.filter((s) => s.att === "দেরিতে").length,
  };

  const handleSave = async () => {
    try {
      await api.saveAttendance(
        att.map((s) => ({ studentId: s.id, status: s.att || "উপস্থিত" })),
        date
      );
      load();
    } catch {
      /* mock mode */
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const bulkMark = (v: string) => setAtt(att.map((s) => ({ ...s, att: v })));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{t.attendance.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.muted }}>{t.attendance.date}:</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontSize: 13, color: C.text, background: C.card }} />
          </div>
        </div>
        <button type="button" onClick={handleSave} style={{ background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
          {saved ? t.common.saved : t.common.save}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {DEPTS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDept(d)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${dept === d ? C.teal : C.border}`,
              background: dept === d ? C.tealL : C.card,
              color: dept === d ? C.tealD : C.muted,
              fontWeight: dept === d ? 700 : 400,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {d}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {([["উপস্থিত", stats.present, C.emerald], ["অনুপস্থিত", stats.absent, C.rose], ["দেরিতে", stats.late, C.amber]] as const).map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: col + "18", border: `1px solid ${col}40`, borderRadius: 10, padding: "10px 18px", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</span>
            <span style={{ fontSize: 13, color: col }}>{lbl}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: C.muted, alignSelf: "center" }}>{t.attendance.markAll}:</span>
        {["উপস্থিত", "অনুপস্থিত"].map((v) => (
          <button key={v} type="button" onClick={() => bulkMark(v)} style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: C.text }}>
            {v === "উপস্থিত" ? t.attendance.markPresent : t.attendance.markAbsent}
          </button>
        ))}
      </div>

      <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {["#", t.attendance.roll, t.attendance.name, t.attendance.class, t.attendance.dept, t.attendance.status].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {att.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "var(--row-alt)" }}>
                <td style={{ padding: "10px 14px", color: C.muted }}>{i + 1}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: C.muted }}>{s.roll}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{s.name}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{s.class}</td>
                <td style={{ padding: "10px 14px" }}><Badge label={s.dept} color={C.teal} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["উপস্থিত", "অনুপস্থিত", "দেরিতে"].map((v) => {
                      const active = s.att === v;
                      const col = v === "উপস্থিত" ? C.emerald : v === "অনুপস্থিত" ? C.rose : C.amber;
                      const colL = v === "উপস্থিত" ? C.emeraldL : v === "অনুপস্থিত" ? C.roseL : C.amberL;
                      const colD = v === "উপস্থিত" ? C.emeraldD : v === "অনুপস্থিত" ? C.roseD : C.amberD;
                      return (
                        <button key={v} type="button" onClick={() => toggle(s.id, v)} style={{ border: `1px solid ${active ? col : C.border}40`, background: active ? colL : "transparent", color: active ? colD : C.muted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400 }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

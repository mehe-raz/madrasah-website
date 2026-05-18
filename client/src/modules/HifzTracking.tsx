import { useEffect, useState } from "react";
import { PARA_NAMES, STUDENTS } from "../data/mockData";
import { api } from "../lib/api";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { C } from "../theme/colors";
import type { Student } from "../types";

const TOTAL_PARAS = 30;

export function HifzTracking() {
  const [hifzStudents, setHifzStudents] = useState<Student[]>(STUDENTS.filter((s) => s.dept === "হিফজ"));
  const [selected, setSelected] = useState<Student | null>(null);
  const [sabaq, setSabaq] = useState("");
  const [saved, setSaved] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    api.getHifzStudents().then((list) => {
      setHifzStudents(list);
      setSelected((prev) => prev || list[0] || null);
    });
  }, []);

  if (!selected) return <p style={{ color: C.muted }}>হিফজ ছাত্র পাওয়া যায়নি</p>;

  const progress = (selected.para / TOTAL_PARAS) * 100;

  const saveSabaq = async () => {
    try {
      await api.saveSabaq(selected.id, sabaq);
    } catch {
      /* mock */
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>হিফজ ট্র্যাকিং</h2>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "260px 1fr", gap: 20 }}>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>হিফজ বিভাগ</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hifzStudents.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s)} style={{ border: `1px solid ${selected.id === s.id ? C.emerald : C.border}`, background: selected.id === s.id ? C.emeraldL : "transparent", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.class} · {s.para}/{TOTAL_PARAS} পারা</div>
                <div style={{ marginTop: 6, height: 4, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(s.para / TOTAL_PARAS) * 100}%`, background: C.emerald, borderRadius: 4 }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.emeraldL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: C.emeraldD }}>{selected.name[0]}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{selected.class}</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.emerald }}>{selected.para}</div>
                <div style={{ fontSize: 12, color: C.muted }}>পারা সম্পন্ন</div>
              </div>
            </div>
            <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
              <span>অগ্রগতি</span><span>{progress.toFixed(1)}%</span>
            </div>
            <div style={{ height: 12, background: C.border, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.emerald})`, borderRadius: 8, transition: "width 0.5s" }} />
            </div>
          </div>

          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>পারাওয়ারি অগ্রগতি</h3>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(5, 1fr)" : "repeat(6, 1fr)", gap: 6 }}>
              {PARA_NAMES.map((name, i) => {
                const done = i < selected.para;
                const current = i === selected.para;
                return (
                  <div key={i} title={name} style={{ height: 36, borderRadius: 6, border: `1px solid ${done ? C.emerald : current ? C.amber : C.border}`, background: done ? C.emeraldL : current ? C.amberL : C.slateL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: done ? C.emeraldD : current ? C.amberD : C.muted }}>
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>আজকের সবক</h3>
            <textarea value={sabaq} onChange={(e) => setSabaq(e.target.value)} rows={3} placeholder="আজকের নতুন সবক এবং পুরানো মুরাজাআর বিবরণ লিখুন..." style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", color: C.text }} />
            <button type="button" onClick={saveSabaq} style={{ marginTop: 10, background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {saved ? "✓ সংরক্ষিত" : "সবক সংরক্ষণ করুন"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

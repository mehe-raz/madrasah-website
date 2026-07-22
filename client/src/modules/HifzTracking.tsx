import { useEffect, useState } from "react";
import { PARA_NAMES } from "../data/mockData";
import { api } from "../lib/api";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import type { Student } from "../types";

const TOTAL_PARAS = 30;

export function HifzTracking() {
  const { t } = useLanguage();
  const [hifzStudents, setHifzStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [sabaq, setSabaq] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [paraSaving, setParaSaving] = useState(false);
  const [paraError, setParaError] = useState("");
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    // Previously this had no .catch() at all — a failed load left the
    // (originally fake mock) student list on screen forever with no way
    // for a teacher to know the real data never arrived.
    api
      .getHifzStudents()
      .then((list) => {
        setHifzStudents(list);
        setSelected((prev) => prev || list[0] || null);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) return <p style={{ color: C.rose }}>{t.common.requestFailed}</p>;
  if (!selected) return <p style={{ color: C.muted }}>{t.hifz.noStudents}</p>;

  const progress = (selected.para / TOTAL_PARAS) * 100;

  // This was the missing piece: api.updatePara() and the server's
  // PATCH /hifz/:studentId/para route already existed, but no button or
  // control anywhere in the UI ever called them — a teacher had no way to
  // actually record Quran-memorization progress, only view it.
  const updatePara = async (nextPara: number) => {
    const clamped = Math.min(TOTAL_PARAS, Math.max(0, nextPara));
    if (clamped === selected.para) return;
    setParaSaving(true);
    setParaError("");
    try {
      const updated = await api.updatePara(selected.id, clamped);
      setSelected(updated);
      setHifzStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setParaError(err instanceof Error ? err.message : "সংরক্ষণ ব্যর্থ হয়েছে");
    } finally {
      setParaSaving(false);
    }
  };

  const saveSabaq = async () => {
    setSaving(true);
    setError("");
    try {
      await api.saveSabaq(selected.id, sabaq);
      // Previously this ran unconditionally (even after a swallowed
      // error), so "Saved" showed and the textarea kept stale text even
      // when the log never reached the server. Now only a confirmed
      // save clears the field and shows success.
      setSabaq("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "সংরক্ষণ ব্যর্থ হয়েছে");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 20 }}>{t.hifz.title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "260px 1fr", gap: 20 }}>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>{t.hifz.dept}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hifzStudents.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s)} style={{ border: `1px solid ${selected.id === s.id ? C.emerald : C.border}`, background: selected.id === s.id ? C.emeraldL : C.card, borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.class} · {s.para}/{TOTAL_PARAS}</div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    disabled={paraSaving || selected.para <= 0}
                    onClick={() => updatePara(selected.para - 1)}
                    style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: paraSaving || selected.para <= 0 ? "not-allowed" : "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, opacity: paraSaving ? 0.6 : 1 }}
                  >
                    −
                  </button>
                  <div style={{ fontSize: 28, fontWeight: 800, color: C.emerald, minWidth: 32, textAlign: "center" }}>{selected.para}</div>
                  <button
                    type="button"
                    disabled={paraSaving || selected.para >= TOTAL_PARAS}
                    onClick={() => updatePara(selected.para + 1)}
                    style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.emerald}`, background: C.emeraldL, color: C.emeraldD, cursor: paraSaving || selected.para >= TOTAL_PARAS ? "not-allowed" : "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1, opacity: paraSaving ? 0.6 : 1 }}
                  >
                    +
                  </button>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{t.hifz.paraDone}</div>
              </div>
            </div>
            {paraError && <div style={{ color: C.rose, fontSize: 12, marginTop: 8 }}>{paraError}</div>}
            <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
              <span>{t.hifz.progress}</span><span>{progress.toFixed(1)}%</span>
            </div>
            <div style={{ height: 12, background: C.border, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.emerald})`, borderRadius: 8, transition: "width 0.5s" }} />
            </div>
          </div>

          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>{t.hifz.paraProgress}</h3>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(5, 1fr)" : "repeat(6, 1fr)", gap: 6 }}>
              {PARA_NAMES.map((name, i) => {
                const done = i < selected.para;
                const current = i === selected.para;
                return (
                  <button
                    key={i}
                    type="button"
                    title={name}
                    disabled={paraSaving}
                    onClick={() => updatePara(i + 1)}
                    style={{ height: 36, borderRadius: 6, border: `1px solid ${done ? C.emerald : current ? C.amber : C.border}`, background: done ? C.emeraldL : current ? C.amberL : C.slateL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: done ? C.emeraldD : current ? C.amberD : C.muted, cursor: paraSaving ? "not-allowed" : "pointer", opacity: paraSaving ? 0.6 : 1, padding: 0 }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>{t.hifz.todaySabaq}</h3>
            <textarea value={sabaq} onChange={(e) => setSabaq(e.target.value)} rows={3} placeholder={t.hifz.sabaqPlaceholder} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", color: C.text, background: C.card }} />
            {error && <div style={{ color: C.rose, marginTop: 8, fontSize: 12 }}>{error}</div>}
            <button type="button" disabled={saving} onClick={saveSabaq} style={{ marginTop: 10, background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, opacity: saving ? 0.7 : 1 }}>
              {saving ? "…" : saved ? t.common.saved : t.hifz.saveSabaq}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

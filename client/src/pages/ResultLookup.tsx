import { useEffect, useState, type FormEvent } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

export function ResultLookup() {
  const { site, content } = usePublicSite();
  const [className, setClassName] = useState("");
  const [roll, setRoll] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    document.title = `ফলাফল দেখুন — ${site.name}`;
  }, [site.name]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setSearched(true);
  };

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.skyL, color: C.skyD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                Result
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>Find results in a fast, simple search panel</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                The search shell is designed to feel premium, light, and responsive while still keeping the page honest about the data.
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 250, padding: 18, background: "linear-gradient(180deg, rgba(240,249,255,0.94), rgba(255,255,255,0.68))", display: "grid", gap: 12 }}>
                <div className="soft-panel" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Fast lookup</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>Class + Roll → publish results later</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <div className="soft-panel" style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>Status</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Not published</div>
                  </div>
                  <div className="soft-panel" style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>Style</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Premium shell</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 22, maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>ফলাফল দেখুন</h2>
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>ক্লাস নির্বাচন করে রোল নম্বর দিয়ে খুঁজুন</p>
          </div>

          <form onSubmit={search} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 6 }}>ক্লাস / কোর্স</span>
              {content.classes.length ? (
                <select value={className} onChange={(e) => setClassName(e.target.value)} style={inputStyle} required>
                  <option value="">নির্বাচন করুন</option>
                  {content.classes.map((c, i) => (
                    <option key={i} value={c.title}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={className} onChange={(e) => setClassName(e.target.value)} style={inputStyle} placeholder="ক্লাসের নাম" required />
              )}
            </label>

            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 6 }}>রোল নম্বর</span>
              <input value={roll} onChange={(e) => setRoll(e.target.value)} style={inputStyle} placeholder="যেমন: ১২" inputMode="numeric" required />
            </label>

            <button type="submit" className="pill hover-lift" style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px 22px", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
              ফলাফল খুঁজুন
            </button>
          </form>

          {searched && (
            <div style={{ marginTop: 18, background: C.amberL, color: C.amberD, borderRadius: 14, padding: 18, textAlign: "center", fontSize: 13, lineHeight: 1.8 }}>
              এই ক্লাসের ফলাফল এখনো প্রকাশ করা হয়নি। প্রকাশিত হলে এখানেই দেখা যাবে।
            </div>
          )}
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

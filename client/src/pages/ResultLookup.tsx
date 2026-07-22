import { useEffect, useState, type FormEvent } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

// Public "ফলাফল দেখুন" page. There's no exam/marks data anywhere in the
// backend yet, so this is deliberately a working search shell with no
// fake results wired up — searching shows an honest "not published yet"
// state instead of inventing a result. Once a results dataset exists this
// is the page to wire a real lookup into.
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
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 560, margin: "0 auto", padding: "36px 20px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>ফলাফল দেখুন</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>ক্লাস নির্বাচন করে রোল নম্বর দিয়ে খুঁজুন</p>
        </div>

        <form onSubmit={search} style={{ display: "grid", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 6 }}>ক্লাস / কোর্স</span>
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
            <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 6 }}>রোল নম্বর</span>
            <input value={roll} onChange={(e) => setRoll(e.target.value)} style={inputStyle} placeholder="যেমন: ১২" inputMode="numeric" required />
          </label>

          <button type="submit" style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            ফলাফল খুঁজুন
          </button>
        </form>

        {searched && (
          <div style={{ marginTop: 18, background: C.amberL, color: C.amberD, borderRadius: 12, padding: 18, textAlign: "center", fontSize: 13 }}>
            এই ক্লাসের ফলাফল এখনো প্রকাশ করা হয়নি। প্রকাশিত হলে এখানেই দেখা যাবে।
          </div>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

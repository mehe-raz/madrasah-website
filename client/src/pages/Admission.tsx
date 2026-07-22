import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

// Public "ভর্তি" page. Same class list as /classes, but clicking a class
// goes straight to the admission form — no confirmation step — per spec.
export function Admission() {
  const { site, content, loading } = usePublicSite();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `ভর্তি — ${site.name}`;
  }, [site.name]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px 44px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>ভর্তি</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>যে ক্লাসে ভর্তি হতে চান সেটি নির্বাচন করুন</p>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</p>
        ) : content.classes.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {content.classes.map((c, i) => (
              <button
                key={`${c.title}-${i}`}
                type="button"
                onClick={() => navigate(`/admission/apply?class=${encodeURIComponent(c.title)}`)}
                style={{
                  textAlign: "left",
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: 20,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{ width: 46, height: 46, borderRadius: 10, background: C.emeraldL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 14 }}
                >
                  {c.icon || "🎓"}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 6px" }}>{c.title}</h3>
                {c.desc && <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{c.desc}</p>}
                <span style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 700, color: C.emerald }}>ভর্তি ফর্ম পূরণ করুন →</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, color: C.muted, fontSize: 14, display: "grid", gap: 16 }}>
            <span>ক্লাসের তালিকা শীঘ্রই যুক্ত করা হবে। আপাতত সরাসরি ভর্তি ফর্ম পূরণ করতে পারেন।</span>
            <button
              type="button"
              onClick={() => navigate("/admission/apply")}
              style={{ justifySelf: "center", background: C.emerald, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              ভর্তি ফর্ম পূরণ করুন →
            </button>
          </div>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

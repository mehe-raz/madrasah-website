import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

const principles = [
  { icon: "✨", title: "Warm & welcoming", desc: "A calm, child-friendly atmosphere with thoughtful details." },
  { icon: "🎨", title: "Learning through play", desc: "Simple, hands-on activities that build curiosity and confidence." },
  { icon: "👩‍🏫", title: "Caring teachers", desc: "Supportive guidance with modern classroom practices." },
  { icon: "💬", title: "Parent partnership", desc: "Clear communication and easy access to school updates." },
];

export function About() {
  const { site, content } = usePublicSite();

  useEffect(() => {
    document.title = `আমাদের সম্পর্কে — ${site.name}`;
  }, [site.name]);

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                About Us
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>{site.name}</h1>
              <p style={{ fontSize: 15, lineHeight: 1.85, color: C.muted, margin: 0, maxWidth: 680 }}>
                {content.heroSubtitle}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                <Link to="/admission" className="pill hover-lift" style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", textDecoration: "none", padding: "12px 18px", fontWeight: 900 }}>
                  Register Now
                </Link>
                <Link to="/classes" className="pill hover-lift" style={{ background: C.card, color: C.text, textDecoration: "none", border: `1px solid ${C.border}`, padding: "12px 18px", fontWeight: 900 }}>
                  View Classes
                </Link>
              </div>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, padding: 20, minHeight: 260, background: "linear-gradient(180deg, rgba(224,242,254,0.9), rgba(255,255,255,0.65))" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {[
                    { value: "01", label: "Joyful start" },
                    { value: "02", label: "Caring guidance" },
                    { value: "03", label: "Strong foundation" },
                    { value: "04", label: "Parent connection" },
                  ].map((item) => (
                    <div key={item.value} className="soft-panel" style={{ padding: 16 }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 6 }}>{item.value}</div>
                      <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.slateL, color: C.slateD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            What makes us special
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>A premium school-style experience</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>Clear structure, gentle colors, smooth spacing, and responsive motion.</p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {principles.map((p) => (
            <div key={p.title} className="soft-panel hover-lift" style={{ padding: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 18, background: C.emeraldL, display: "grid", placeItems: "center", fontSize: 24, marginBottom: 14 }}>
                {p.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 8px" }}>{p.title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel" style={{ padding: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 18 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 10px" }}>Our programs</h3>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, margin: 0 }}>
                The site keeps a clean information hierarchy, just like a premium school front end — easy to scan on mobile, polished on desktop.
              </p>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {content.highlights.slice(0, 4).map((h, i) => (
                <div key={`${h.label}-${i}`} className="soft-panel" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{h.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{h.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>Visit, explore, and apply</h3>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>{site.address || "Dhaka, Bangladesh"} • {site.phone || "—"}</p>
            </div>
            <Link to="/admission" className="pill hover-lift" style={{ textDecoration: "none", background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", padding: "12px 18px", fontWeight: 900 }}>
              Admission Open
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

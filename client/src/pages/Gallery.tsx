import { useEffect } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

const DEMO_ITEMS = [
  { icon: "🕌", label: "Campus frontage", tint: C.skyL },
  { icon: "📖", label: "Learning corner", tint: C.emeraldL },
  { icon: "🎓", label: "Celebration day", tint: C.amberL },
  { icon: "🏆", label: "Award moments", tint: C.violetL },
  { icon: "🤝", label: "Parent meet-up", tint: C.slateL },
  { icon: "🕋", label: "Special event", tint: C.roseL },
];

export function Gallery() {
  const { site, content } = usePublicSite();

  useEffect(() => {
    document.title = `গ্যালারি — ${site.name}`;
  }, [site.name]);

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.violetL, color: C.violetD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                Gallery
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>A soft, premium gallery layout</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                Static showcase cards keep the page light and fast while matching the polished style of the reference design.
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 260, display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.68))" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, width: "100%" }}>
                  {["📸", "🌈", "✨", "🎉", "🧩", "💫"].map((icon, i) => (
                    <div key={icon} className="soft-panel" style={{ minHeight: 74, display: "grid", placeItems: "center", fontSize: 24 }}>
                      {icon}
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
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            Moments
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>Memorable moments from campus life</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>The cards are lightweight, responsive, and visually aligned with the main landing page.</p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {DEMO_ITEMS.map((item) => (
            <div key={item.label} className="soft-panel hover-lift shine-on-hover" style={{ aspectRatio: "4 / 3", background: item.tint, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, textAlign: "center" }}>
              <span style={{ fontSize: 34 }}>{item.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>Photo uploads can be added later</h3>
              <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.8 }}>
                This page is intentionally lightweight now so it loads quickly and stays easy to extend later.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

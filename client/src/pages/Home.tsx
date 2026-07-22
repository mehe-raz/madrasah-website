import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";
import heroImage from "../assets/hero.png";

function formatNoticeDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" });
}

const defaultBadges = ["Playgroup", "Nursery", "KG", "Primary"];

export function Home() {
  const { site, content } = usePublicSite();
  const fallbackName = site.name || "Little Learners Academy";

  useEffect(() => {
    document.title = `${fallbackName} — স্বাগতম`;
  }, [fallbackName]);

  const latestNotice = useMemo(() => {
    if (!content.notices.length) return null;
    return [...content.notices].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [content.notices]);

  const stats = [
    { value: `${content.departments.length || 4}`, label: "Programs" },
    { value: `${content.highlights.length || 4}`, label: "Highlights" },
    { value: `${content.notices.length || 0}`, label: "News" },
  ];

  const features = content.highlights.length
    ? content.highlights
    : [
        { icon: "🏡", label: "Safe, welcoming campus" },
        { icon: "👩‍🏫", label: "Caring teachers" },
        { icon: "🎨", label: "Play-based learning" },
        { icon: "💬", label: "Strong parent connection" },
      ];

  const programs = content.departments.length
    ? content.departments
    : [
        { icon: "🧸", title: "Playgroup", desc: "A warm first step into learning." },
        { icon: "📘", title: "Nursery", desc: "Language, numeracy, and creative discovery." },
        { icon: "🌈", title: "Kindergarten", desc: "Balanced growth in a joyful atmosphere." },
        { icon: "🎓", title: "Primary", desc: "Confident foundation for the next stage." },
      ];

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong gradient-border" style={{ position: "relative", overflow: "hidden", padding: 26 }}>
          <div className="hero-glow floaty-slow" aria-hidden style={{ inset: "auto -120px -120px auto", width: 260, height: 260, background: "radial-gradient(circle, rgba(14,165,233,0.18), transparent 70%)" }} />
          <div className="hero-glow floaty" aria-hidden style={{ inset: "-90px auto auto -100px", width: 220, height: 220, background: "radial-gradient(circle, rgba(245,158,11,0.15), transparent 70%)" }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28, alignItems: "center" }}>
            <div style={{ position: "relative", zIndex: 1 }}>
              <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.amberL, color: C.amberD, fontSize: 12, fontWeight: 900, marginBottom: 16 }}>
                ✨ {content.badge || "Inspiring curious little minds"}
              </span>

              <h1 className="text-balance" style={{ fontSize: "clamp(34px, 5vw, 60px)", lineHeight: 1.02, letterSpacing: "-0.04em", fontWeight: 900, margin: "0 0 14px" }}>
                {fallbackName}
              </h1>

              <p style={{ fontSize: 16, lineHeight: 1.85, color: C.muted, margin: "0 0 22px", maxWidth: 580 }}>
                {content.heroSubtitle}
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                <Link
                  to="/admission"
                  className="pill hover-lift shine-on-hover"
                  style={{
                    textDecoration: "none",
                    background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`,
                    color: "#fff",
                    padding: "13px 22px",
                    fontWeight: 900,
                    boxShadow: "0 16px 32px rgba(16, 185, 129, 0.18)",
                  }}
                >
                  Register Now
                </Link>
                <Link
                  to="/about"
                  className="pill hover-lift"
                  style={{
                    textDecoration: "none",
                    background: C.card,
                    color: C.text,
                    border: `1px solid ${C.border}`,
                    padding: "13px 22px",
                    fontWeight: 900,
                  }}
                >
                  Learn More
                </Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(122px, 1fr))", gap: 12, maxWidth: 480 }}>
                {stats.map((stat) => (
                  <div key={stat.label} className="soft-panel hover-lift" style={{ padding: "15px 16px" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: C.text, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontWeight: 800 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1 }}>
              <div className="soft-panel hero-visual gradient-border" style={{ padding: 18, overflow: "hidden" }}>
                <div style={{ borderRadius: 24, minHeight: 380, display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(224,242,254,0.8), rgba(255,255,255,0.66))" }}>
                  <img
                    src={heroImage}
                    alt=""
                    loading="eager"
                    decoding="async"
                    style={{ width: "100%", maxWidth: 390, objectFit: "contain", filter: "drop-shadow(0 20px 30px rgba(15, 23, 42, 0.12))" }}
                  />
                </div>

                <div className="soft-panel floaty" style={{ position: "absolute", left: 18, bottom: 18, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, maxWidth: 240 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: C.emeraldL, display: "grid", placeItems: "center", fontSize: 18 }}>📚</div>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>Easy enrollment</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 900 }}>Quick application flow</div>
                  </div>
                </div>

                <div className="soft-panel floaty-slow" style={{ position: "absolute", right: 18, top: 18, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, maxWidth: 200 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: C.amberL, display: "grid", placeItems: "center", fontSize: 18 }}>⭐</div>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>Premium look</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 900 }}>Fast, clean, modern</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, justifyContent: "center" }}>
                {(content.classes.length ? content.classes.map((c) => c.title) : defaultBadges).slice(0, 4).map((label) => (
                  <span key={label} className="pill" style={{ padding: "7px 12px", background: C.slateL, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 800, color: C.text }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {latestNotice && (
        <section className="section-shell page-section section-pop">
          <div className="soft-panel hover-lift" style={{ padding: 22, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="pill" style={{ display: "inline-flex", padding: "5px 11px", background: C.emeraldL, color: C.emeraldD, fontSize: 11, fontWeight: 900, marginBottom: 10 }}>
                Latest News
              </span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.text }}>{latestNotice.title}</h3>
                <span style={{ fontSize: 12, color: C.muted }}>{formatNoticeDate(latestNotice.date)}</span>
              </div>
              {latestNotice.body && (
                <p style={{ fontSize: 13, lineHeight: 1.8, color: C.muted, margin: "6px 0 0", maxWidth: 760 }}>
                  {latestNotice.body}
                </p>
              )}
            </div>
            <Link to="/notices" className="pill hover-lift" style={{ background: C.slateL, border: `1px solid ${C.border}`, color: C.text, textDecoration: "none", padding: "11px 18px", fontSize: 13, fontWeight: 900 }}>
              View all →
            </Link>
          </div>
        </section>
      )}

      <section className="section-shell page-section section-pop">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.slateL, color: C.slateD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            Why parents choose us
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>Caring learning, premium presentation</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>A clean school-style front end with soft depth, rounded panels, and light motion.</p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {features.map((h, i) => (
            <div key={`${h.label}-${i}`} className="soft-panel hover-lift" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 46, height: 46, borderRadius: 16, background: i % 2 === 0 ? C.emeraldL : C.slateL, display: "grid", placeItems: "center", fontSize: 22, flexShrink: 0 }}>
                {h.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.text, lineHeight: 1.5 }}>{h.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.amberL, color: C.amberD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            Programs
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>Programs and classes</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>Flexible class structure with a smooth admission journey.</p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))" }}>
          {programs.map((d, i) => (
            <Link
              key={`${d.title}-${i}`}
              to="/classes"
              className="soft-panel hover-lift shine-on-hover"
              style={{ textDecoration: "none", color: C.text, padding: 20, display: "block" }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 18, background: i % 3 === 0 ? C.emeraldL : i % 3 === 1 ? C.amberL : C.slateL, display: "grid", placeItems: "center", fontSize: 22, marginBottom: 14 }}>
                {d.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 8px" }}>{d.title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>{d.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 24, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
                Admissions made simple
              </span>
              <h2 className="section-heading" style={{ margin: "0 0 10px" }}>A quick, premium admission flow</h2>
              <p style={{ margin: 0, color: C.muted, fontSize: 14, lineHeight: 1.8 }}>
                Visitors can review class options, check notices, and open the application form in a few taps.
              </p>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <Link to="/admission" className="pill hover-lift" style={{ textDecoration: "none", background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", padding: "12px 18px", fontWeight: 900, textAlign: "center" }}>
                Start admission
              </Link>
              <Link to="/gallery" className="pill hover-lift" style={{ textDecoration: "none", background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 18px", fontWeight: 900, textAlign: "center" }}>
                Explore gallery
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

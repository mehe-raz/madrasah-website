import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";
import heroImage from "../assets/hero.png";

/**
 * Public-facing institution page shown to visitors who are not logged in.
 * Everything it loads comes from public, unauthenticated endpoints via
 * usePublicSite() — /api/public/site-content and /api/public/settings —
 * both editable by Admin/Super Admin from the Website admin module, so
 * changes there show up here on next load with no redeploy needed.
 */

function DividerPattern() {
  return (
    <div
      aria-hidden
      style={{
        height: 14,
        margin: "0 auto",
        maxWidth: 1100,
        backgroundImage: `linear-gradient(135deg, ${C.emerald} 25%, transparent 25%), linear-gradient(225deg, ${C.emerald} 25%, transparent 25%), linear-gradient(45deg, ${C.amber} 25%, transparent 25%), linear-gradient(315deg, ${C.amber} 25%, transparent 25%)`,
        backgroundPosition: "14px 0, 14px 0, 0 0, 0 0",
        backgroundSize: "28px 28px",
        backgroundRepeat: "repeat-x",
        opacity: 0.55,
      }}
    />
  );
}

export function Home() {
  const { site, content } = usePublicSite();
  const madrasaName = site.name;

  useEffect(() => {
    document.title = `${madrasaName} — স্বাগতম`;
  }, [madrasaName]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 20px 40px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 32,
            alignItems: "center",
          }}
        >
          <div>
            <span
              style={{
                display: "inline-block",
                background: C.amberL,
                color: C.amberD,
                fontSize: 12,
                fontWeight: 700,
                padding: "5px 12px",
                borderRadius: 999,
                marginBottom: 16,
              }}
            >
              {content.badge}
            </span>
            <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, lineHeight: 1.25, margin: "0 0 14px", color: C.text }}>
              {madrasaName}
            </h1>
            <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7, margin: "0 0 26px", maxWidth: 480 }}>
              {content.heroSubtitle}
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                to="/admission"
                style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
              >
                ভর্তি হোন →
              </Link>
              <a
                href="#departments"
                style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 22px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
              >
                বিভাগসমূহ দেখুন
              </a>
            </div>
          </div>
          <div
            style={{
              background: C.slateL,
              borderRadius: 20,
              border: `1px solid ${C.border}`,
              padding: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img src={heroImage} alt="" style={{ width: "100%", maxWidth: 280, objectFit: "contain" }} />
          </div>
        </div>
      </section>

      <DividerPattern />

      {/* Highlights strip */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {content.highlights.map((h, i) => (
            <div
              key={`${h.label}-${i}`}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 14px", display: "flex", alignItems: "center", gap: 10 }}
            >
              <span style={{ fontSize: 22 }}>{h.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>{h.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Departments */}
      <section id="departments" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 44px" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>আমাদের বিভাগসমূহ</h2>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>শিক্ষার্থীদের চাহিদা অনুযায়ী বিভিন্ন বিভাগে ভর্তির সুযোগ</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          {content.departments.map((d, i) => (
            <div key={`${d.title}-${i}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div
                style={{ width: 46, height: 46, borderRadius: 10, background: C.emeraldL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 14 }}
              >
                {d.icon}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 6px" }}>{d.title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <DividerPattern />

      <PublicFooter site={site} />
    </div>
  );
}

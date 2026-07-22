import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

// Public "আমাদের সম্পর্কে" page. Replaces the old header login button for
// logged-out visitors — it reuses the same public, unauthenticated content
// (site settings + departments) that Home.tsx already loads via usePublicSite(),
// so there is nothing new to manage from the admin side.
export function About() {
  const { site, content } = usePublicSite();

  useEffect(() => {
    document.title = `আমাদের সম্পর্কে — ${site.name}`;
  }, [site.name]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 820, margin: "0 auto", padding: "40px 20px 20px" }}>
        <span
          style={{
            display: "inline-block",
            background: C.emeraldL,
            color: C.emeraldD,
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 999,
            marginBottom: 14,
          }}
        >
          আমাদের সম্পর্কে
        </span>
        <h1 style={{ fontSize: "clamp(24px, 3.4vw, 34px)", fontWeight: 800, margin: "0 0 14px", color: C.text }}>
          {site.name}
        </h1>
        <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.8, margin: 0, maxWidth: 680 }}>
          {content.heroSubtitle}
        </p>
      </section>

      <section style={{ maxWidth: 820, margin: "0 auto", padding: "20px 20px 10px" }}>
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

      <section style={{ maxWidth: 820, margin: "0 auto", padding: "26px 20px 44px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: "0 0 16px" }}>আমাদের বিভাগসমূহ</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, marginBottom: 26 }}>
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

        <div
          style={{
            background: C.slateL,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 26,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 6px" }}>যোগাযোগের ঠিকানা</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px" }}>{site.address || "ঠিকানা এখনো যুক্ত করা হয়নি"}</p>
            <p style={{ fontSize: 13, color: C.text, fontWeight: 700, margin: 0 }}>{site.phone || "—"} {site.email ? `• ${site.email}` : ""}</p>
          </div>
          <Link
            to="/admission"
            style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            ভর্তি হোন →
          </Link>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

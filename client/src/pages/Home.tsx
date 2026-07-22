import { useEffect, useMemo } from "react";
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
        maxWidth: 1140,
        backgroundImage: `linear-gradient(135deg, ${C.sky} 25%, transparent 25%), linear-gradient(225deg, ${C.sky} 25%, transparent 25%), linear-gradient(45deg, ${C.amber} 25%, transparent 25%), linear-gradient(315deg, ${C.amber} 25%, transparent 25%)`,
        backgroundPosition: "14px 0, 14px 0, 0 0, 0 0",
        backgroundSize: "28px 28px",
        backgroundRepeat: "repeat-x",
        opacity: 0.45,
      }}
    />
  );
}

function formatNoticeDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" });
}

export function Home() {
  const { site, content } = usePublicSite();
  const madrasaName = site.name;

  useEffect(() => {
    document.title = `${madrasaName} — স্বাগতম`;
  }, [madrasaName]);

  // Only the single most recent notice shows on the landing page; the full
  // list (with the 6-month window) lives on /notices behind "সব দেখুন".
  const latestNotice = useMemo(() => {
    if (!content.notices.length) return null;
    return [...content.notices].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [content.notices]);

  const heroStats = [
    { value: content.departments.length || "0", label: "বিভাগ" },
    { value: content.highlights.length || "0", label: "হাইলাইট" },
    { value: content.notices.length || "0", label: "নোটিশ" },
  ];

  return (
    <div className="app-shell page-float" style={{ background: "var(--bg)", minHeight: "100vh", color: C.text, position: "relative", overflow: "hidden" }}>
      <div
        aria-hidden
        className="pattern-divider"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 10% 8%, rgba(14, 165, 233, 0.14), transparent 24%), radial-gradient(circle at 90% 12%, rgba(245, 158, 11, 0.12), transparent 22%), radial-gradient(circle at 50% 0%, rgba(34, 197, 94, 0.08), transparent 18%)",
          opacity: 0.18,
          height: "100%",
        }}
      />

      <PublicHeader site={site} classes={content.classes} />

      {/* Hero */}
      <section className="section-shell section-pop" style={{ position: "relative", paddingTop: 40, paddingBottom: 24 }}>
        <div
          className="soft-panel-strong shine-on-hover"
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "28px",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "auto -120px -120px auto",
              width: 260,
              height: 260,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(14,165,233,0.18), transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-80px auto auto -100px",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(245,158,11,0.16), transparent 70%)",
              filter: "blur(8px)",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 28,
              alignItems: "center",
            }}
          >
            <div style={{ position: "relative", zIndex: 1 }}>
              <span
                className="pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: C.amberL,
                  color: C.amberD,
                  fontSize: 12,
                  fontWeight: 800,
                  padding: "7px 13px",
                  marginBottom: 16,
                  boxShadow: "0 8px 22px rgba(245, 158, 11, 0.12)",
                }}
              >
                <span aria-hidden>✨</span>
                {content.badge}
              </span>

              <h1
                className="text-balance"
                style={{
                  fontSize: "clamp(32px, 4.5vw, 54px)",
                  fontWeight: 900,
                  lineHeight: 1.08,
                  margin: "0 0 14px",
                  color: C.text,
                  letterSpacing: "-0.03em",
                }}
              >
                {madrasaName}
              </h1>
              <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.8, margin: "0 0 26px", maxWidth: 560 }}>
                {content.heroSubtitle}
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                <Link
                  to="/admission"
                  className="pill hover-lift"
                  style={{
                    background: `linear-gradient(135deg, ${C.emerald}, ${C.teal})`,
                    color: "#fff",
                    border: "none",
                    padding: "13px 22px",
                    fontWeight: 800,
                    fontSize: 14,
                    textDecoration: "none",
                    boxShadow: "0 12px 28px rgba(16, 185, 129, 0.22)",
                  }}
                >
                  ভর্তি হোন →
                </Link>
                <a
                  href="#departments"
                  className="pill hover-lift"
                  style={{
                    background: C.card,
                    color: C.text,
                    border: `1px solid ${C.border}`,
                    padding: "13px 22px",
                    fontWeight: 800,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  বিভাগসমূহ দেখুন
                </a>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 12, maxWidth: 460 }}>
                {heroStats.map((item) => (
                  <div key={item.label} className="soft-panel hover-lift" style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: C.text, lineHeight: 1 }}>{item.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontWeight: 700 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1 }}>
              <div
                className="gradient-border soft-panel hero-visual"
                style={{
                  padding: 18,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    borderRadius: 22,
                    background: "linear-gradient(180deg, rgba(224,242,254,0.8), rgba(255,255,255,0.65))",
                    padding: 18,
                    minHeight: 380,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <img
                    src={heroImage}
                    alt=""
                    style={{ width: "100%", maxWidth: 360, objectFit: "contain", filter: "drop-shadow(0 20px 30px rgba(15, 23, 42, 0.12))" }}
                  />
                </div>

                <div
                  className="soft-panel"
                  style={{
                    position: "absolute",
                    left: 16,
                    bottom: 16,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    maxWidth: 220,
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: C.emeraldL, display: "grid", placeItems: "center", fontSize: 18 }}>📚</div>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>সহজ ভর্তি</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 800 }}>চাইলেই দ্রুত শুরু করুন</div>
                  </div>
                </div>

                <div
                  className="soft-panel"
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 16,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    maxWidth: 180,
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: C.amberL, display: "grid", placeItems: "center", fontSize: 18 }}>⭐</div>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>আধুনিক অভিজ্ঞতা</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 800 }}>সফট কার্ড + ক্লিন লেআউট</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-pop"><DividerPattern /></div>

      {/* Latest notice */}
      {latestNotice && (
        <section className="section-shell" style={{ paddingTop: 32, paddingBottom: 8 }}>
          <div className="soft-panel hover-lift section-pop delay-1" style={{ padding: 22, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, justifyContent: "space-between" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span
                className="pill"
                style={{
                  display: "inline-flex",
                  background: C.emeraldL,
                  color: C.emeraldD,
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "4px 10px",
                  marginBottom: 8,
                }}
              >
                সর্বশেষ নোটিশ
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: C.text, margin: 0 }}>{latestNotice.title}</h3>
                <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{formatNoticeDate(latestNotice.date)}</span>
              </div>
              {latestNotice.body && (
                <p
                  style={{
                    fontSize: 13,
                    color: C.muted,
                    lineHeight: 1.7,
                    margin: "6px 0 0",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {latestNotice.body}
                </p>
              )}
            </div>
            <Link
              to="/notices"
              className="pill hover-lift shine-on-hover"
              style={{ background: C.slateL, color: C.text, border: `1px solid ${C.border}`, padding: "10px 18px", fontWeight: 800, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}
            >
              সব দেখুন →
            </Link>
          </div>
        </section>
      )}

      {/* Highlights strip */}
      <section className="section-shell" style={{ paddingTop: 28, paddingBottom: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {content.highlights.map((h, i) => (
            <div
              key={`${h.label}-${i}`}
              className="soft-panel hover-lift section-pop delay-2"
              style={{
                padding: "16px 15px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: i % 2 === 0 ? C.emeraldL : C.slateL,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                {h.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{h.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Departments */}
      <section id="departments" className="section-shell section-pop" style={{ paddingTop: 12, paddingBottom: 42 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.slateL, color: C.slateD, fontSize: 12, fontWeight: 800, marginBottom: 10 }}>
            শিক্ষার বিভাগসমূহ
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>আমাদের বিভাগসমূহ</h2>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>শিক্ষার্থীদের চাহিদা অনুযায়ী বিভিন্ন বিভাগে ভর্তির সুযোগ</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          {content.departments.map((d, i) => (
            <div key={`${d.title}-${i}`} className="soft-panel hover-lift" style={{ padding: 20 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 16,
                  background: i % 3 === 0 ? C.emeraldL : i % 3 === 1 ? C.amberL : C.slateL,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  marginBottom: 14,
                }}
              >
                {d.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: C.text, margin: "0 0 8px" }}>{d.title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="section-pop"><DividerPattern /></div>

      <PublicFooter site={site} />
    </div>
  );
}

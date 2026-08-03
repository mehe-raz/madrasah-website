import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { Reveal } from "../components/Reveal";
import { C } from "../theme/colors";
import { cloudinaryResize } from "../lib/cloudinaryImage";
import heroImage from "../assets/hero.png";
import type { SiteDepartment } from "../types";

function formatNoticeDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" });
}

const defaultBadges = ["হিফজ", "নাজেরা", "কিতাব", "জেনারেল"];

export function Home() {
  const { site, content, loading } = usePublicSite();
  const fallbackName = site.name || "মাদ্রাসা";

  useSeoMeta({
    title: `${fallbackName} — স্বাগতম`,
    description:
      content.heroSubtitle || `${fallbackName}-এ স্বাগতম — শিক্ষার্থী ভর্তি, ক্লাস, নোটিস ও পরীক্ষার ফলাফল সম্পর্কে সব তথ্য এখানে।`,
    image: site.logo || undefined,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const latestNotice = useMemo(() => {
    if (!content.notices.length) return null;
    return [...content.notices].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [content.notices]);

  const stats = [
    { value: `${content.departments.length || 4}`, label: "বিভাগ" },
    { value: `${content.highlights.length || 4}`, label: "বৈশিষ্ট্য" },
    { value: `${content.notices.length || 0}`, label: "নোটিশ" },
  ];


  // Gallery photos an admin has opted into a homepage placement (Website
  // → গ্যালারি → "হোমপেজে ব্যবহার" per photo). "hero"/"cta" are single-photo
  // slots (server keeps only the first if more than one is tagged); "strip"
  // can hold several. Falls back to the newest untagged photos for the
  // strip so a fresh gallery still shows something without extra setup.
  const heroBgPhoto = content.gallery.find((p) => p.homeSlot === "hero");
  const ctaBgPhoto = content.gallery.find((p) => p.homeSlot === "cta");
  const stripTagged = content.gallery.filter((p) => p.homeSlot === "strip");
  const stripPhotos = (stripTagged.length ? stripTagged : content.gallery).slice(0, 5);

  const programs: SiteDepartment[] = content.departments.length
    ? content.departments
    : [
        { icon: "📖", title: "হিফজ বিভাগ", desc: "পূর্ণাঙ্গ কুরআন মুখস্থকরণ প্রোগ্রাম।" },
        { icon: "🕌", title: "নাজেরা বিভাগ", desc: "শুদ্ধভাবে কুরআন তিলাওয়াত শিক্ষা।" },
        { icon: "📚", title: "কিতাব বিভাগ", desc: "ইসলামী শিক্ষার ধারাবাহিক পাঠ্যক্রম।" },
        { icon: "🎓", title: "জেনারেল বিভাগ", desc: "জাতীয় শিক্ষাক্রম অনুসরণে সাধারণ শিক্ষা।" },
      ];

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      {latestNotice && (
        <section className="section-shell page-section section-pop">
          <div className="soft-panel hover-lift" style={{ padding: 22, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="pill" style={{ display: "inline-flex", padding: "5px 11px", background: C.emeraldL, color: C.emeraldD, fontSize: 11, fontWeight: 900, marginBottom: 10 }}>
                নোটিশ
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
              সব নোটিশ →
            </Link>
          </div>
        </section>
      )}

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong gradient-border" style={{ position: "relative", overflow: "hidden", padding: 26 }}>
          {heroBgPhoto && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url(${cloudinaryResize(heroBgPhoto.url, "f_auto,q_auto,w_1400,e_blur:200")})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: 0.1,
              }}
            />
          )}
          <div className="hero-glow floaty-slow" aria-hidden style={{ inset: "auto -120px -120px auto", width: 260, height: 260, background: "radial-gradient(circle, rgba(14,165,233,0.18), transparent 70%)" }} />
          <div className="hero-glow floaty" aria-hidden style={{ inset: "-90px auto auto -100px", width: 220, height: 220, background: "radial-gradient(circle, rgba(245,158,11,0.15), transparent 70%)" }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28, alignItems: "center" }}>
            <Reveal variant="text" style={{ position: "relative", zIndex: 1 }}>
              {(loading || content.badge) && (
                <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", background: C.amberL, color: C.amberD, fontSize: 12, fontWeight: 900, marginBottom: 16 }}>
                  ✨ {loading ? "দ্বীনি ও আধুনিক শিক্ষার সমন্বয়" : content.badge}
                </span>
              )}

              <h1 className="text-balance" style={{ fontSize: "clamp(34px, 5vw, 60px)", lineHeight: 1.02, letterSpacing: "-0.04em", fontWeight: 900, margin: "0 0 14px" }}>
                {fallbackName}
              </h1>

              <p style={{ fontSize: 16, lineHeight: 1.85, color: C.muted, margin: "0 0 22px", maxWidth: 580 }}>
                {content.heroSubtitle}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(122px, 1fr))", gap: 12, maxWidth: 480 }}>
                {stats.map((stat) => (
                  <div key={stat.label} className="soft-panel hover-lift" style={{ padding: "15px 16px" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: C.text, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontWeight: 800 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal variant="image" style={{ position: "relative", zIndex: 1 }}>
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
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>সহজ ভর্তি</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 900 }}>দ্রুত আবেদন প্রক্রিয়া</div>
                  </div>
                </div>

                <div className="soft-panel floaty-slow" style={{ position: "absolute", right: 18, top: 18, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, maxWidth: 200 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: C.amberL, display: "grid", placeItems: "center", fontSize: 18 }}>⭐</div>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>মানসম্মত অভিজ্ঞতা</div>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 900 }}>দ্রুত, পরিচ্ছন্ন, আধুনিক</div>
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
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <Reveal variant="text" style={{ textAlign: "center", marginBottom: 22 }}>
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.amberL, color: C.amberD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            বিভাগসমূহ
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>বিভাগ ও ক্লাসসমূহ</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>সুবিন্যস্ত ক্লাস কাঠামো ও ঝামেলাবিহীন ভর্তি প্রক্রিয়া।</p>
        </Reveal>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))" }}>
          {programs.map((d, i) => (
            <Reveal key={`${d.title}-${i}`} variant="image" style={{ transitionDelay: `${Math.min(i, 4) * 70}ms` }}>
              <Link
                to="/classes"
                className="soft-panel hover-lift shine-on-hover"
                style={{ textDecoration: "none", color: C.text, display: "block", overflow: "hidden" }}
              >
                {d.image && (
                  <img
                    src={d.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }}
                  />
                )}
                <div style={{ padding: 20 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 18, background: i % 3 === 0 ? C.emeraldL : i % 3 === 1 ? C.amberL : C.slateL, display: "grid", placeItems: "center", fontSize: 22, marginBottom: 14 }}>
                    {d.icon}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 8px" }}>{d.title}</h3>
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>{d.desc}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {stripPhotos.length > 0 && (
        <section className="section-shell page-section section-pop">
          <Reveal variant="text" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.violetL, color: C.violetD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
                ঝলক
              </span>
              <h2 className="section-heading" style={{ margin: 0 }}>ক্যাম্পাস জীবনের কিছু মুহূর্ত</h2>
            </div>
            <Link to="/gallery" className="pill hover-lift" style={{ textDecoration: "none", background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "10px 18px", fontSize: 13, fontWeight: 900, whiteSpace: "nowrap" }}>
              পূর্ণ গ্যালারি →
            </Link>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 12,
            }}
          >
            {stripPhotos.map((photo, i) => (
              <Reveal key={`${photo.url}-${i}`} variant="image" style={{ transitionDelay: `${i * 60}ms` }}>
                <Link
                  to="/gallery"
                  className="soft-panel hover-lift shine-on-hover"
                  style={{ display: "block", overflow: "hidden", position: "relative" }}
                >
                  <img
                    src={cloudinaryResize(photo.url, "f_auto,q_auto,w_400")}
                    alt={photo.caption || ""}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                  />
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="section-shell page-section section-pop">
        <div
          className="soft-panel-strong"
          style={{
            padding: 24,
            overflow: "hidden",
            position: "relative",
            ...(ctaBgPhoto
              ? {
                  backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.82), rgba(15,23,42,0.55)), url(${cloudinaryResize(ctaBgPhoto.url, "f_auto,q_auto,w_1400")})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {}),
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center", position: "relative", color: ctaBgPhoto ? "#fff" : undefined }}>
            <Reveal variant="text">
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
                সহজ ভর্তি প্রক্রিয়া
              </span>
              <h2 className="section-heading" style={{ margin: "0 0 10px" }}>দ্রুত ও সহজ ভর্তি প্রক্রিয়া</h2>
              <p style={{ margin: 0, color: ctaBgPhoto ? "rgba(255,255,255,0.85)" : C.muted, fontSize: 14, lineHeight: 1.8 }}>
                ভিজিটররা কয়েক ট্যাপেই ক্লাসের তথ্য দেখতে, নোটিশ চেক করতে এবং আবেদন ফর্ম খুলতে পারবেন।
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                <Link
                  to="/admission"
                  className="pill hover-lift shine-on-hover"
                  style={{
                    textDecoration: "none",
                    background: C.brand,
                    color: "#fff",
                    padding: "13px 22px",
                    fontWeight: 900,
                    boxShadow: "0 16px 32px color-mix(in srgb, var(--brand) 30%, transparent)",
                  }}
                >
                  ভর্তি হন
                </Link>
                <Link
                  to="/about"
                  className="pill hover-lift"
                  style={
                    ctaBgPhoto
                      ? { textDecoration: "none", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", padding: "13px 22px", fontWeight: 900 }
                      : { textDecoration: "none", background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "13px 22px", fontWeight: 900 }
                  }
                >
                  আরও জানুন
                </Link>
              </div>
            </Reveal>
            <Reveal variant="image" style={{ display: "grid", gap: 10 }}>
              <Link to="/admission" className="pill hover-lift" style={{ textDecoration: "none", background: C.brand, color: "#fff", padding: "12px 18px", fontWeight: 900, textAlign: "center" }}>
                ভর্তি শুরু করুন
              </Link>
              <Link
                to="/gallery"
                className="pill hover-lift"
                style={
                  ctaBgPhoto
                    ? { textDecoration: "none", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", padding: "12px 18px", fontWeight: 900, textAlign: "center" }
                    : { textDecoration: "none", background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 18px", fontWeight: 900, textAlign: "center" }
                }
              >
                গ্যালারি দেখুন
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}
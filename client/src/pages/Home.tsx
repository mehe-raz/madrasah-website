import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppSettings } from "../context/AppSettingsContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { SiteContent } from "../types";
import heroImage from "../assets/hero.png";

/**
 * Public-facing institution page shown to visitors who are not logged in.
 * The editable parts (badge, hero text, highlights, departments) are loaded
 * from /api/public/site-content, which Admin/Super Admin update from the
 * "ওয়েবসাইট" control panel — so changes there show up here immediately on
 * the next load, no redeploy needed. Everything else (form submissions,
 * gallery, notices) is still a later pass; every action here just routes to
 * /login for now.
 */

const FALLBACK_CONTENT: SiteContent = {
  badge: "ডেমো ওয়েবসাইট — শীঘ্রই সম্পূর্ণ চালু হচ্ছে",
  heroSubtitle: "দ্বীনি ও আধুনিক শিক্ষার সমন্বয়ে আপনার সন্তানের উজ্জ্বল ভবিষ্যৎ গড়ে তুলুন।",
  highlights: [
    { label: "প্রতিষ্ঠাকাল থেকে সুনামের সাথে পরিচালিত", icon: "🏛️" },
    { label: "আবাসিক ও অনাবাসিক উভয় ব্যবস্থা", icon: "🏠" },
    { label: "অভিজ্ঞ ও যোগ্য শিক্ষক পরিষদ", icon: "👳" },
    { label: "নিয়মিত অভিভাবক যোগাযোগ ব্যবস্থা", icon: "📞" },
  ],
  departments: [
    { title: "হিফজ বিভাগ", desc: "পূর্ণাঙ্গ কুরআন মুখস্থকরণ প্রোগ্রাম, অভিজ্ঞ হাফেজ শিক্ষকমণ্ডলীর তত্ত্বাবধানে।", icon: "📖" },
    { title: "নাজেরা বিভাগ", desc: "শুদ্ধভাবে কুরআন তিলাওয়াত শিক্ষা ও তাজবীদ চর্চা।", icon: "🕌" },
    { title: "কিতাব বিভাগ", desc: "দাওরায়ে হাদীস পর্যন্ত ইসলামী শিক্ষার ধারাবাহিক পাঠ্যক্রম।", icon: "📚" },
    { title: "জেনারেল বিভাগ", desc: "দ্বীনি শিক্ষার পাশাপাশি জাতীয় শিক্ষাক্রম অনুসরণ।", icon: "🎓" },
  ],
};

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
  const { settings } = useAppSettings();
  const { name: madrasaName } = useMadrasaBranding();
  const [content, setContent] = useState<SiteContent>(FALLBACK_CONTENT);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicSiteContent()
      .then((data) => {
        if (cancelled) return;
        setContent({
          badge: data.badge || FALLBACK_CONTENT.badge,
          heroSubtitle: data.heroSubtitle || FALLBACK_CONTENT.heroSubtitle,
          highlights: data.highlights.length ? data.highlights : FALLBACK_CONTENT.highlights,
          departments: data.departments.length ? data.departments : FALLBACK_CONTENT.departments,
        });
      })
      .catch(() => {
        /* keep fallback content */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      {/* Top nav */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--card)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {settings.logo ? (
              <img src={settings.logo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 28, flexShrink: 0 }}>🕌</span>
            )}
            <span style={{ fontWeight: 800, fontSize: 16, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {madrasaName}
            </span>
          </div>
          <Link
            to="/login"
            style={{
              background: C.emerald,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 18px",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            লগইন
          </Link>
        </div>
      </header>

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
                to="/login"
                style={{
                  background: C.emerald,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "13px 22px",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                লগইন করুন →
              </Link>
              <a
                href="#departments"
                style={{
                  background: C.card,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "13px 22px",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
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
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "16px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
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
            <div
              key={`${d.title}-${i}`}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 10,
                  background: C.emeraldL,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  marginBottom: 14,
                }}
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

      {/* Contact / footer */}
      <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px 32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
            background: C.slateL,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 26,
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{madrasaName}</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.7 }}>
              {settings.address || "ঠিকানা এখনো যুক্ত করা হয়নি"}
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>যোগাযোগ</div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 4 }}>{settings.phone || "—"}</div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{settings.email || "—"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontSize: 12, color: C.muted }}>প্রতিষ্ঠান ব্যবস্থাপনার অংশ?</div>
            <Link
              to="/login"
              style={{
                background: C.teal,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              লগইন করুন
            </Link>
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 20 }}>
          © {new Date().getFullYear()} {madrasaName} • এটি একটি প্রিভিউ/ডেমো পেজ, ধীরে ধীরে হালনাগাদ করা হবে
        </p>
      </footer>
    </div>
  );
}

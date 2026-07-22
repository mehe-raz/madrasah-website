import { useEffect } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

// Public "গ্যালারি" page. Per spec this stays a static demo for now — the
// admin panel doesn't have a real image-upload section for this yet, so
// there is nothing to fetch and nothing needs to open on click. Building
// the real upload-and-manage flow is a separate later task.
const DEMO_ITEMS = [
  { icon: "🕌", label: "প্রতিষ্ঠানের ভবন" },
  { icon: "📖", label: "হিফজ ক্লাস" },
  { icon: "🎓", label: "সমাপনী অনুষ্ঠান" },
  { icon: "🏆", label: "পুরস্কার বিতরণী" },
  { icon: "🤝", label: "অভিভাবক সমাবেশ" },
  { icon: "🕋", label: "ইসলামিক অনুষ্ঠান" },
];

export function Gallery() {
  const { site, content } = usePublicSite();

  useEffect(() => {
    document.title = `গ্যালারি — ${site.name}`;
  }, [site.name]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px 44px" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>গ্যালারি</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>প্রতিষ্ঠানের বিভিন্ন মুহূর্তের ছবি</p>
        </div>

        <div style={{ background: C.amberL, color: C.amberD, borderRadius: 10, padding: "10px 16px", fontSize: 13, textAlign: "center", marginBottom: 24 }}>
          এটি একটি ডেমো — প্রকৃত ছবি শীঘ্রই যুক্ত করা হবে
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          {DEMO_ITEMS.map((item, i) => (
            <div
              key={i}
              style={{
                aspectRatio: "4 / 3",
                background: C.slateL,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 34 }}>{item.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

import { useEffect } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

export function Gallery() {
  const { site, content, loading } = usePublicSite();
  const photos = content.gallery;

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
                গ্যালারি
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>ক্যাম্পাসের ছবিতে কিছু মুহূর্ত</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                প্রতিষ্ঠানের কার্যক্রম, অনুষ্ঠান ও দৈনন্দিন পরিবেশের কিছু ছবি এখানে দেখা যাবে।
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 260, display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.68))" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, width: "100%" }}>
                  {["📸", "🕌", "📖", "🎓", "🤝", "🏆"].map((icon) => (
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
            মুহূর্তসমূহ
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>ক্যাম্পাস জীবনের স্মরণীয় মুহূর্ত</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>ছবিগুলো Website সেকশন থেকে নিয়মিত আপডেট করা হয়।</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</div>
        ) : photos.length ? (
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {photos.map((item, i) => (
              <figure
                key={`${item.url}-${i}`}
                className="soft-panel hover-lift shine-on-hover"
                style={{ margin: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
              >
                <img
                  src={item.url}
                  alt={item.caption || "গ্যালারি ছবি"}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
                />
                {item.caption && (
                  <figcaption style={{ padding: "10px 12px", fontSize: 13, fontWeight: 800, color: C.text }}>{item.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <div className="soft-panel" style={{ padding: 22, textAlign: "center", color: C.muted }}>
            এখনো কোনো ছবি যুক্ত করা হয়নি। শীঘ্রই ক্যাম্পাসের ছবি এখানে যোগ করা হবে।
          </div>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

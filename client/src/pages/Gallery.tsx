import { useEffect, useState } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { C } from "../theme/colors";

export function Gallery() {
  const { site, content, loading } = usePublicSite();
  const photos = content.gallery;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    document.title = `গ্যালারি — ${site.name}`;
  }, [site.name]);

  // Keyboard support for the lightbox: Escape closes, arrow keys move
  // between photos — only wired up while it's actually open.
  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      else if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
      else if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, photos.length]);

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.violetL, color: C.violetD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                {content.galleryHeroBadge}
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>{content.galleryHeroTitle}</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                {content.galleryHeroSubtitle}
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
            {content.galleryIntroBadge}
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>{content.galleryIntroTitle}</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>{content.galleryIntroSubtitle}</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</div>
        ) : photos.length ? (
          <div className="card-grid gallery-photo-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {photos.map((item, i) => (
              <figure
                key={`${item.url}-${i}`}
                className="soft-panel hover-lift shine-on-hover"
                style={{ margin: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  aria-label="ছবি বড় করে দেখুন"
                  style={{ border: "none", padding: 0, margin: 0, background: "none", cursor: "zoom-in", display: "block", width: "100%" }}
                >
                  <img
                    src={item.url}
                    alt={item.caption || "গ্যালারি ছবি"}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
                  />
                </button>
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

      {openIndex !== null && photos[openIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.85)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label="বন্ধ করুন"
            style={{ position: "absolute", top: 18, right: 18, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 20, cursor: "pointer" }}
          >
            ✕
          </button>

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
              }}
              aria-label="আগের ছবি"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 22, cursor: "pointer" }}
            >
              ‹
            </button>
          )}

          <figure
            onClick={(e) => e.stopPropagation()}
            style={{ margin: 0, maxWidth: "min(92vw, 900px)", maxHeight: "88vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
          >
            <img
              src={photos[openIndex].url}
              alt={photos[openIndex].caption || "গ্যালারি ছবি"}
              style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 10 }}
            />
            {photos[openIndex].caption && (
              <figcaption style={{ color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "center" }}>{photos[openIndex].caption}</figcaption>
            )}
          </figure>

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
              }}
              aria-label="পরের ছবি"
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 22, cursor: "pointer" }}
            >
              ›
            </button>
          )}
        </div>
      )}

      <PublicFooter site={site} />
    </div>
  );
}

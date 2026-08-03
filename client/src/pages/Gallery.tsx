import { useEffect, useMemo, useState } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { cloudinaryResize } from "../lib/cloudinaryImage";
import { C } from "../theme/colors";

const UNCATEGORIZED = "সাধারণ";
const PAGE_SIZE = 12;

export function Gallery() {
  const { site, content, loading } = usePublicSite();
  const allPhotos = content.gallery;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null); // null = "সব"
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Tabs = admin-defined category list, plus any ad-hoc category a photo
  // was tagged with that isn't in that list, plus "সাধারণ" only if at
  // least one photo is actually untagged. Keeps the tab row from showing
  // an empty category nobody has a photo in yet... except the admin's own
  // list, which is allowed to include "not used yet" categories on purpose.
  const categories = useMemo(() => {
    const fromContent = content.galleryCategories.filter(Boolean);
    const set = new Set(fromContent);
    let hasUncategorized = false;
    for (const p of allPhotos) {
      if (p.category) set.add(p.category);
      else hasUncategorized = true;
    }
    const list = Array.from(set);
    if (hasUncategorized) list.push(UNCATEGORIZED);
    return list;
  }, [content.galleryCategories, allPhotos]);

  const photos = useMemo(() => {
    if (!activeCategory) return allPhotos;
    if (activeCategory === UNCATEGORIZED) return allPhotos.filter((p) => !p.category);
    return allPhotos.filter((p) => p.category === activeCategory);
  }, [allPhotos, activeCategory]);

  // Reset pagination whenever the filter changes so switching tabs never
  // shows a stale "আরও দেখুন" state left over from a longer list. Adjusted
  // during render (comparing against the previous category) rather than in
  // a useEffect, since a setState that only mirrors a prop/derived change
  // like this belongs in the render body, not an effect.
  const [prevCategory, setPrevCategory] = useState<string | null>(null);
  if (activeCategory !== prevCategory) {
    setPrevCategory(activeCategory);
    setVisibleCount(PAGE_SIZE);
  }

  const visiblePhotos = photos.slice(0, visibleCount);

  useSeoMeta({
    title: `${content.galleryHeroTitle || "গ্যালারি"} — ${site.name}`,
    description: content.galleryHeroSubtitle || `${site.name}-এর ক্যাম্পাস ও কার্যক্রমের ছবি দেখুন।`,
    image: allPhotos[0]?.url || site.logo || undefined,
  });

  // Keyboard support for the lightbox: Escape closes, arrow keys move
  // between photos — only wired up while it's actually open. Navigates
  // within the currently-visible (filtered + paginated) set, matching
  // what's actually on screen.
  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      else if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % visiblePhotos.length));
      else if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + visiblePhotos.length) % visiblePhotos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, visiblePhotos.length]);

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

        {categories.length > 1 && (
          <div
            role="tablist"
            aria-label="ছবির ক্যাটাগরি"
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 4,
              marginBottom: 20,
              WebkitOverflowScrolling: "touch",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === null}
              onClick={() => setActiveCategory(null)}
              className="pill hover-lift"
              style={{
                flexShrink: 0,
                border: `1px solid ${activeCategory === null ? "transparent" : C.border}`,
                background: activeCategory === null ? C.brand : C.card,
                color: activeCategory === null ? "#fff" : C.text,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              সব ({allPhotos.length})
            </button>
            {categories.map((cat) => {
              const count = cat === UNCATEGORIZED ? allPhotos.filter((p) => !p.category).length : allPhotos.filter((p) => p.category === cat).length;
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(cat)}
                  className="pill hover-lift"
                  style={{
                    flexShrink: 0,
                    border: `1px solid ${active ? "transparent" : C.border}`,
                    background: active ? C.brand : C.card,
                    color: active ? "#fff" : C.text,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {visiblePhotos.length ? (
          <>
            <div className="card-grid gallery-photo-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {visiblePhotos.map((item, i) => (
                <figure
                  key={`${item.url}-${i}`}
                  className="soft-panel hover-lift shine-on-hover"
                  style={{ margin: 0, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(i)}
                    aria-label="ছবি বড় করে দেখুন"
                    style={{ border: "none", padding: 0, margin: 0, background: "none", cursor: "zoom-in", display: "block", width: "100%", position: "relative" }}
                  >
                    <img
                      src={cloudinaryResize(item.url, "f_auto,q_auto,w_500")}
                      alt={item.caption || "গ্যালারি ছবি"}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }}
                    />
                    {item.category && (
                      <span
                        style={{
                          position: "absolute",
                          top: 10,
                          insetInlineStart: 10,
                          background: "rgba(15,23,42,0.6)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: 999,
                          backdropFilter: "blur(2px)",
                        }}
                      >
                        {item.category}
                      </span>
                    )}
                  </button>
                  {item.caption && (
                    <figcaption style={{ padding: "10px 12px", fontSize: 13, fontWeight: 800, color: C.text }}>{item.caption}</figcaption>
                  )}
                </figure>
              ))}
            </div>

            {visibleCount < photos.length && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="pill hover-lift"
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    padding: "12px 26px",
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  আরও দেখুন ({photos.length - visibleCount}টি বাকি)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="soft-panel" style={{ padding: 22, textAlign: "center", color: C.muted }}>
            {allPhotos.length ? "এই ক্যাটাগরিতে এখনো কোনো ছবি নেই।" : "এখনো কোনো ছবি যুক্ত করা হয়নি। শীঘ্রই ক্যাম্পাসের ছবি এখানে যোগ করা হবে।"}
          </div>
        )}
      </section>

      {openIndex !== null && visiblePhotos[openIndex] && (
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

          {visiblePhotos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i - 1 + visiblePhotos.length) % visiblePhotos.length));
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
              src={cloudinaryResize(visiblePhotos[openIndex].url, "f_auto,q_auto,w_1200")}
              alt={visiblePhotos[openIndex].caption || "গ্যালারি ছবি"}
              style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: 10 }}
            />
            {visiblePhotos[openIndex].caption && (
              <figcaption style={{ color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "center" }}>{visiblePhotos[openIndex].caption}</figcaption>
            )}
          </figure>

          {visiblePhotos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i + 1) % visiblePhotos.length));
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

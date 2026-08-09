import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { C } from "../theme/colors";
import { Icons, type IconKey } from "../lib/icons";

const principles: { icon: IconKey; title: string; desc: string }[] = [
  { icon: "sparkles", title: "যত্নশীল পরিবেশ", desc: "শান্ত, শিক্ষার্থী-বান্ধব পরিবেশ ও যত্নের প্রতিটি খুঁটিনাটি।" },
  { icon: "palette", title: "কার্যকর শিক্ষাপদ্ধতি", desc: "সহজবোধ্য, হাতে-কলমে অনুশীলন যা কৌতূহল ও আত্মবিশ্বাস গড়ে তোলে।" },
  { icon: "teacherSalary", title: "যত্নশীল শিক্ষকমণ্ডলী", desc: "আধুনিক শিক্ষণ পদ্ধতির পাশাপাশি সহায়ক তত্ত্বাবধান।" },
  { icon: "chat", title: "অভিভাবক সংযোগ", desc: "স্পষ্ট যোগাযোগ ও প্রতিষ্ঠানের হালনাগাদ তথ্যে সহজ প্রবেশাধিকার।" },
];

export function About() {
  const { site, content, loading } = usePublicSite();

  useSeoMeta({
    title: `আমাদের সম্পর্কে — ${site.name}`,
    description: content.aboutIntro || `${site.name}-এর ইতিহাস, লক্ষ্য ও শিক্ষাদান পদ্ধতি সম্পর্কে জানুন।`,
    image: site.logo || undefined,
  });

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                আমাদের সম্পর্কে
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>{site.name}</h1>
              {(loading || content.aboutIntro) && (
                <p style={{ fontSize: 15, lineHeight: 1.85, color: C.muted, margin: 0, maxWidth: 680 }}>
                  {loading ? "যত্ন, শৃঙ্খলা এবং প্রতিটি শিক্ষার্থীর ধারাবাহিক উন্নতিকে কেন্দ্র করে গড়ে ওঠা একটি প্রতিষ্ঠান।" : content.aboutIntro}
                </p>
              )}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                <Link to="/admission" className="pill hover-lift" style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", textDecoration: "none", padding: "12px 18px", fontWeight: 900 }}>
                  ভর্তি হন
                </Link>
                <Link to="/classes" className="pill hover-lift" style={{ background: C.card, color: C.text, textDecoration: "none", border: `1px solid ${C.border}`, padding: "12px 18px", fontWeight: 900 }}>
                  ক্লাসসমূহ দেখুন
                </Link>
              </div>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, padding: 20, minHeight: 260, background: "linear-gradient(180deg, rgba(224,242,254,0.9), rgba(255,255,255,0.65))" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {[
                    { value: "০১", label: "আনন্দময় সূচনা" },
                    { value: "০২", label: "যত্নশীল দিকনির্দেশনা" },
                    { value: "০৩", label: "মজবুত ভিত্তি" },
                    { value: "০৪", label: "অভিভাবক সংযোগ" },
                  ].map((item) => (
                    <div key={item.value} className="soft-panel" style={{ padding: 16 }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 6 }}>{item.value}</div>
                      <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>{item.label}</div>
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
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.slateL, color: C.slateD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            আমাদের বিশেষত্ব
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>একটি সুশৃঙ্খল প্রাতিষ্ঠানিক অভিজ্ঞতা</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>স্পষ্ট কাঠামো, শান্ত রঙ ও গোছানো উপস্থাপনা।</p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {principles.map((p) => {
            const Icon = Icons[p.icon];
            return (
              <div key={p.title} className="soft-panel hover-lift" style={{ padding: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: 18, background: C.emeraldL, display: "grid", placeItems: "center", color: C.emeraldD, marginBottom: 14 }}>
                  <Icon size={24} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 8px" }}>{p.title}</h3>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {(loading || content.aboutMission) && (
        <section className="section-shell page-section section-pop">
          <div className="soft-panel" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 10px" }}>আমাদের লক্ষ্য</h3>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.85, margin: 0, maxWidth: 780 }}>
              {loading ? "আমাদের লক্ষ্য প্রতিটি পরিবারকে একটি নিরাপদ ও যত্নশীল শিক্ষার পরিবেশ দেওয়া — যেখানে একাডেমিক উন্নতি চরিত্র গঠন ও সমাজের সাথে একসাথে এগিয়ে চলে।" : content.aboutMission}
            </p>
          </div>
        </section>
      )}

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>ঘুরে দেখুন ও আবেদন করুন</h3>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>{site.address || "ঠিকানা এখনো যুক্ত করা হয়নি"} • {site.phone || "—"}</p>
            </div>
            <Link to="/admission" className="pill hover-lift" style={{ textDecoration: "none", background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", padding: "12px 18px", fontWeight: 900 }}>
              ভর্তি চলছে
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

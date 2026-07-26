import { useEffect, useMemo, useState } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { C } from "../theme/colors";

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" });
}

export function Notices() {
  const { site, content, loading } = usePublicSite();
  const [showOlder, setShowOlder] = useState(false);

  useEffect(() => {
    document.title = `নোটিসেস — ${site.name}`;
  }, [site.name]);

  const { recent, older } = useMemo(() => {
    const sixMonthsAgo = monthsAgo(6);
    const threeMonthsAgo = monthsAgo(3);
    const withinSixMonths = content.notices
      .filter((n) => {
        const d = new Date(n.date);
        return !Number.isNaN(d.getTime()) && d >= sixMonthsAgo;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      recent: withinSixMonths.filter((n) => new Date(n.date) >= threeMonthsAgo),
      older: withinSixMonths.filter((n) => new Date(n.date) < threeMonthsAgo),
    };
  }, [content.notices]);

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 22, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                নোটিশ বোর্ড
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>সর্বশেষ ঘোষণা, সাজানো ও পরিষ্কার আকারে</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                সাম্প্রতিক নোটিশগুলো প্রথমে দেখা যাবে, আর পুরনো নোটিশগুলো একটি ছোট বাটনে চাপলে দেখা যাবে।
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 250, padding: 18, background: "linear-gradient(180deg, rgba(240,253,244,0.92), rgba(255,255,255,0.68))", display: "grid", gap: 12 }}>
                <div className="soft-panel" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>সংক্ষিপ্ত তথ্য</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>মোবাইল-বান্ধব ও স্পষ্ট উপস্থাপনায় সর্বশেষ তথ্য।</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <div className="soft-panel" style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>সাম্প্রতিক</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{recent.length}</div>
                  </div>
                  <div className="soft-panel" style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>পুরনো</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{older.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.slateL, color: C.slateD, fontSize: 12, fontWeight: 900, marginBottom: 10 }}>
            নতুন আগে
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>নোটিশ বোর্ড</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>পেজটি সংক্ষিপ্ত রাখতে শুধু গত ৬ মাসের নোটিশ দেখানো হয়।</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              {recent.length ? recent.map((n, i) => (
                <article key={`${n.title}-${i}`} className="soft-panel hover-lift" style={{ padding: 18, display: "grid", gap: 10, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                    <span className="pill" style={{ padding: "5px 10px", background: i % 2 === 0 ? C.emeraldL : C.slateL, color: C.text, fontSize: 11, fontWeight: 900 }}>নোটিশ</span>
                    <span style={{ fontSize: 12, color: C.muted }}>{formatDate(n.date)}</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: C.text, lineHeight: 1.45, overflowWrap: "anywhere" }}>{n.title}</h3>
                  {n.body && <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.8, overflowWrap: "anywhere" }}>{n.body}</p>}
                </article>
              )) : (
                <div className="soft-panel" style={{ padding: 22, textAlign: "center", color: C.muted }}>এখনো কোনো নোটিশ যুক্ত করা হয়নি।</div>
              )}

              {!!older.length && (
                <div className="soft-panel" style={{ padding: 18 }}>
                  {!showOlder ? (
                    <button type="button" onClick={() => setShowOlder(true)} className="pill hover-lift" style={{ border: "none", background: C.emeraldL, color: C.emeraldD, padding: "11px 16px", fontWeight: 900, cursor: "pointer" }}>
                      আরও পুরনো নোটিশ দেখুন
                    </button>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {older.map((n, i) => (
                        <article key={`${n.title}-${i}`} className="soft-panel" style={{ padding: 16, background: C.card, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 900, lineHeight: 1.45, overflowWrap: "anywhere" }}>{n.title}</h4>
                            <span style={{ fontSize: 12, color: C.muted }}>{formatDate(n.date)}</span>
                          </div>
                          {n.body && <p style={{ margin: "8px 0 0", color: C.muted, fontSize: 13, lineHeight: 1.7, overflowWrap: "anywhere" }}>{n.body}</p>}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

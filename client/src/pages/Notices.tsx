import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
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

// Public "নোটিসেস" page. Shows only the last 6 months of notices, newest
// first. The most recent ~3 months load immediately; anything 3-6 months
// old stays behind "আরও পুরনো নোটিশ দেখুন" so the page doesn't load
// everything at once. Notices older than 6 months are not shown at all —
// per spec, that's a deliberate cutoff, not a bug.
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

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 760, margin: "0 auto", padding: "36px 20px 44px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: "0 0 6px" }}>নোটিসেস</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>গত ৬ মাসের নোটিশ, সর্বশেষগুলো আগে</p>
          </div>
          <Link
            to="/result"
            style={{ background: C.amberL, color: C.amberD, borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            ফলাফল দেখুন →
          </Link>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</p>
        ) : recent.length === 0 && older.length === 0 ? (
          <div style={{ textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, color: C.muted, fontSize: 14 }}>
            এই মুহূর্তে কোনো নোটিশ নেই।
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {recent.map((n, i) => (
              <NoticeCard key={`r-${i}`} title={n.title} date={n.date} body={n.body} />
            ))}

            {older.length > 0 && !showOlder && (
              <button
                type="button"
                onClick={() => setShowOlder(true)}
                style={{ border: `1px dashed ${C.border}`, background: "transparent", color: C.emerald, borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                আরও পুরনো নোটিশ দেখুন (গত ৩-৬ মাস)
              </button>
            )}

            {showOlder && older.map((n, i) => <NoticeCard key={`o-${i}`} title={n.title} date={n.date} body={n.body} />)}
          </div>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

function NoticeCard({ title, date, body }: { title: string; date: string; body: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{formatDate(date)}</span>
      </div>
      {body && <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{body}</p>}
    </div>
  );
}

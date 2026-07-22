import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { ConfirmModal } from "../components/ConfirmModal";
import { C } from "../theme/colors";

// Public "ক্লাস ও কোর্সসমূহ" page. Lists whatever classes the admin has
// configured (Website module → same content.classes list the header's
// dropdown reads). Clicking a class asks for confirmation before routing
// to the admission form, per spec — unlike the /admission page, where
// clicking goes straight through with no confirmation step.
export function ClassesCourses() {
  const { site, content, loading } = usePublicSite();
  const navigate = useNavigate();
  const [pendingClass, setPendingClass] = useState<string | null>(null);

  useEffect(() => {
    document.title = `ক্লাস ও কোর্সসমূহ — ${site.name}`;
  }, [site.name]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px 44px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>ক্লাস ও কোর্সসমূহ</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>যেকোনো ক্লাসে ক্লিক করে ভর্তি সম্পর্কে জানুন</p>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</p>
        ) : content.classes.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {content.classes.map((c, i) => (
              <button
                key={`${c.title}-${i}`}
                type="button"
                onClick={() => setPendingClass(c.title)}
                style={{
                  textAlign: "left",
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: 20,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{ width: 46, height: 46, borderRadius: 10, background: C.emeraldL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 14 }}
                >
                  {c.icon || "🎓"}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 6px" }}>{c.title}</h3>
                {c.desc && <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{c.desc}</p>}
                <span style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 700, color: C.emerald }}>ভর্তি হতে চান? →</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, color: C.muted, fontSize: 14 }}>
            ক্লাসের তালিকা শীঘ্রই যুক্ত করা হবে।
          </div>
        )}
      </section>

      <PublicFooter site={site} />

      <ConfirmModal
        open={!!pendingClass}
        title="ভর্তি নিশ্চিতকরণ"
        message={`আপনি কি "${pendingClass}"-এ ভর্তি হতে আগ্রহী? কন্টিনিউ করলে ভর্তি ফর্মে নিয়ে যাওয়া হবে।`}
        onCancel={() => setPendingClass(null)}
        onConfirm={() => {
          if (pendingClass) navigate(`/admission/apply?class=${encodeURIComponent(pendingClass)}`);
          setPendingClass(null);
        }}
      />
    </div>
  );
}

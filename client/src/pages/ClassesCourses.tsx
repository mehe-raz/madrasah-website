import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { ConfirmModal } from "../components/ConfirmModal";
import { C } from "../theme/colors";

export function ClassesCourses() {
  const { site, content, loading } = usePublicSite();
  const navigate = useNavigate();
  const [pendingClass, setPendingClass] = useState<string | null>(null);

  useEffect(() => {
    document.title = `ক্লাস ও কোর্সসমূহ — ${site.name}`;
    window.scrollTo(0, 0);
  }, [site.name]);

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.skyL, color: C.skyD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                ক্লাস
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>উপলব্ধ ক্লাস ও কোর্সসমূহ দেখুন</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                এক ট্যাপে প্রোগ্রাম বেছে নিয়ে ভর্তি ফর্ম খুলুন। ডিজাইনটি সহজ, দ্রুত এবং মোবাইল-বান্ধব।
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 260, display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(240,249,255,0.94), rgba(255,255,255,0.68))" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, width: "100%" }}>
                  {["হিফজ", "নাজেরা", "কিতাব", "জেনারেল"].map((item, i) => (
                    <div key={item} className="soft-panel" style={{ padding: 16, minHeight: 84 }}>
                      <div style={{ fontSize: 12, color: C.muted, fontWeight: 900, marginBottom: 8 }}>বিভাগ</div>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>{item}</div>
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
            ক্লাস তালিকা
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>এগিয়ে যেতে একটি ক্লাসে ট্যাপ করুন</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>হোম, পরিচিতি, ভর্তি ও ফলাফল পেজেও একই ডিজাইন বজায় রাখা হয়েছে।</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13 }}>লোড হচ্ছে…</div>
        ) : content.classes.length ? (
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {content.classes.map((c, i) => (
              <button
                key={`${c.title}-${i}`}
                type="button"
                onClick={() => setPendingClass(c.title)}
                className="soft-panel hover-lift shine-on-hover"
                style={{ textAlign: "left", background: C.card, border: `1px solid ${C.border}`, padding: 20, cursor: "pointer" }}
              >
                <div style={{ width: 50, height: 50, borderRadius: 17, background: i % 2 === 0 ? C.emeraldL : C.slateL, display: "grid", placeItems: "center", fontSize: 22, marginBottom: 14 }}>
                  {c.icon || "🎓"}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 8px" }}>{c.title}</h3>
                {c.desc && <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>{c.desc}</p>}
                <div style={{ marginTop: 14, fontSize: 12, fontWeight: 900, color: C.emeraldD }}>ভর্তিতে এগিয়ে যান →</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="soft-panel" style={{ padding: 20, textAlign: "center", color: C.muted }}>
            এখনো কোনো ক্লাস যুক্ত করা হয়নি।
          </div>
        )}
      </section>

      <PublicFooter site={site} />

      <ConfirmModal
        open={pendingClass !== null}
        title="ভর্তি"
        message={`${pendingClass ?? ""} ক্লাসে ভর্তি ফর্মে যেতে চান?`}
        confirmLabel="এগিয়ে যান"
        cancelLabel="বাতিল"
        onCancel={() => setPendingClass(null)}
        onConfirm={() => {
          if (pendingClass) navigate(`/admission/apply?class=${encodeURIComponent(pendingClass)}`);
          setPendingClass(null);
        }}
      />
    </div>
  );
}

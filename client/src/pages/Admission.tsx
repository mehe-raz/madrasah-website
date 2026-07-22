import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { C } from "../theme/colors";

const steps = [
  { icon: "①", title: "Choose a class", desc: "Select the class that matches your child’s age and learning stage." },
  { icon: "②", title: "Fill the form", desc: "Open the admission form and complete the required information." },
  { icon: "③", title: "Wait for contact", desc: "Our team reviews the application and reaches out quickly." },
];

export function Admission() {
  const { site, content, loading } = usePublicSite();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `ভর্তি — ${site.name}`;
  }, [site.name]);

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.amberL, color: C.amberD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                Admission
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>A fast, elegant admission experience</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                Pick a class, review the options, and continue to the form. The flow stays clean and mobile-friendly, with no heavy loading.
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 260, display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(255,247,237,0.92), rgba(255,255,255,0.68))", padding: 18 }}>
                <div className="soft-panel" style={{ width: "100%", padding: 18 }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Quick summary</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>✅ Easy application</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>✅ Smooth navigation</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>✅ Premium visual polish</div>
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
            How it works
          </span>
          <h2 className="section-heading" style={{ margin: "0 0 10px" }}>Simple steps to apply</h2>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>The same polished design language stays consistent across every page.</p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {steps.map((step) => (
            <div key={step.title} className="soft-panel hover-lift" style={{ padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{step.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 8px" }}>{step.title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel" style={{ padding: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>Available classes</h3>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, margin: 0 }}>
                Choose from the current program list and continue directly to the application form.
              </p>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {(loading ? [] : content.classes).slice(0, 6).map((c, i) => (
                <button
                  key={`${c.title}-${i}`}
                  type="button"
                  onClick={() => navigate(`/admission/apply?class=${encodeURIComponent(c.title)}`)}
                  className="soft-panel hover-lift"
                  style={{ textAlign: "left", background: C.card, border: `1px solid ${C.border}`, padding: "13px 14px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 13, background: C.emeraldL, display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>{c.icon || "🎓"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 900 }}>{c.title}</div>
                      {c.desc && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{c.desc}</div>}
                    </div>
                  </div>
                </button>
              ))}
              {!loading && !content.classes.length && (
                <div style={{ fontSize: 13, color: C.muted }}>No classes configured yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>Ready to register?</h3>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                Click any class to open the application page instantly.
              </p>
            </div>
            <button type="button" onClick={() => navigate("/classes")} className="pill hover-lift" style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", border: "none", padding: "12px 18px", fontWeight: 900 }}>
              Browse all classes
            </button>
          </div>
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

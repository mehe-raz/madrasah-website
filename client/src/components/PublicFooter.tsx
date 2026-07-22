import { Link } from "react-router-dom";
import { C } from "../theme/colors";
import type { PublicSettings } from "../types";

export function PublicFooter({ site }: { site: PublicSettings }) {
  const year = new Date().getFullYear();

  return (
    <footer className="section-shell footer-glow section-pop" style={{ paddingTop: 10, paddingBottom: 34 }}>
      <div className="soft-panel-strong shine-on-hover" style={{ overflow: "hidden" }}>
        <div style={{ height: 6, background: `linear-gradient(90deg, ${C.sky}, ${C.emerald}, ${C.amber})` }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            padding: 24,
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 12, background: C.emeraldL, display: "grid", placeItems: "center" }}>🏫</span>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: C.text, margin: 0 }}>{site.name}</h3>
            </div>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.8 }}>{site.address || "ঠিকানা এখনো যুক্ত করা হয়নি"}</p>
            {site.footer && (
              <p style={{ fontSize: 13, color: C.text, fontWeight: 700, marginTop: 14, marginBottom: 0, lineHeight: 1.7 }}>{site.footer}</p>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>যোগাযোগ</div>
            <div className="soft-panel" style={{ padding: 14 }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>ফোন</div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 800, marginBottom: 12 }}>{site.phone || "—"}</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>ইমেইল</div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 800 }}>{site.email || "—"}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>দ্রুত লিংক</div>
            <div style={{ display: "grid", gap: 10 }}>
              <Link to="/about" className="pill hover-lift nav-chip" style={{ background: C.slateL, color: C.text, border: `1px solid ${C.border}`, padding: "11px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center" }}>
                আমাদের সম্পর্কে
              </Link>
              <Link to="/admission" className="pill hover-lift nav-chip" style={{ background: C.emeraldL, color: C.emeraldD, border: `1px solid ${C.border}`, padding: "11px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center" }}>
                ভর্তি তথ্য
              </Link>
              <Link to="/login" className="pill hover-lift nav-chip" style={{ background: `linear-gradient(135deg, ${C.emerald}, ${C.teal})`, color: "#fff", padding: "11px 14px", fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center" }}>
                লগইন করুন
              </Link>
            </div>
          </div>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 16, marginBottom: 0 }}>
        © {year} {site.name} • এটি একটি প্রিভিউ/ডেমো পেজ, ধীরে ধীরে হালনাগাদ করা হবে
      </p>
    </footer>
  );
}

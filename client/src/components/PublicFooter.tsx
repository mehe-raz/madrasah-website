import { C } from "../theme/colors";
import type { PublicSettings } from "../types";

export function PublicFooter({ site }: { site: PublicSettings }) {
  const year = new Date().getFullYear();

  return (
    <footer className="section-shell footer-glow section-pop" style={{ paddingTop: 12, paddingBottom: 36 }}>
      <div className="soft-panel-strong shine-on-hover" style={{ overflow: "hidden" }}>
        <div style={{ height: 6, background: `linear-gradient(90deg, ${C.sky}, ${C.emerald}, ${C.amber})` }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 20,
            padding: 24,
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 42, height: 42, borderRadius: 14, background: C.emeraldL, display: "grid", placeItems: "center", fontSize: 20, color: C.emeraldD }}>🏫</span>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 900, color: C.text, margin: 0 }}>{site.name}</h3>
                <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0", fontWeight: 700 }}>দ্বীনি ও আধুনিক শিক্ষার একটি নির্ভরযোগ্য প্রতিষ্ঠান</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.8 }}>{site.address || "ঠিকানা এখনো যুক্ত করা হয়নি"}</p>
            {site.footer && (
              <p style={{ fontSize: 13, color: C.text, fontWeight: 700, marginTop: 14, marginBottom: 0, lineHeight: 1.7 }}>{site.footer}</p>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>যোগাযোগ</div>
            <div className="soft-panel" style={{ padding: 14 }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>ফোন</div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 800, marginBottom: 12 }}>{site.phone || "—"}</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>ইমেইল</div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 800 }}>{site.email || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 16, marginBottom: 0 }}>
        © {year} {site.name} • সর্বস্বত্ব সংরক্ষিত
      </p>
    </footer>
  );
}

import { Link } from "react-router-dom";
import { C } from "../theme/colors";
import type { PublicSettings } from "../types";

const quickLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About Us" },
  { to: "/classes", label: "Classes" },
  { to: "/admission", label: "Admission" },
  { to: "/gallery", label: "Gallery" },
  { to: "/notices", label: "Notices" },
  { to: "/result", label: "Result" },
];

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
                <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0", fontWeight: 700 }}>Premium early learning environment</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.8 }}>{site.address || "ঠিকানা এখনো যুক্ত করা হয়নি"}</p>
            {site.footer && (
              <p style={{ fontSize: 13, color: C.text, fontWeight: 700, marginTop: 14, marginBottom: 0, lineHeight: 1.7 }}>{site.footer}</p>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Contact</div>
            <div className="soft-panel" style={{ padding: 14 }}>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Phone</div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 800, marginBottom: 12 }}>{site.phone || "—"}</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Email</div>
              <div style={{ fontSize: 14, color: C.text, fontWeight: 800 }}>{site.email || "—"}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Links</div>
            <div style={{ display: "grid", gap: 10 }}>
              {quickLinks.map((link, i) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="pill nav-chip"
                  style={{
                    background: i % 2 === 0 ? C.slateL : C.card,
                    color: C.text,
                    border: `1px solid ${C.border}`,
                    padding: "11px 14px",
                    fontWeight: 800,
                    fontSize: 13,
                    textDecoration: "none",
                    textAlign: "center",
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 16, marginBottom: 0 }}>
        © {year} {site.name} • Crafted with a clean, premium, responsive interface
      </p>
    </footer>
  );
}

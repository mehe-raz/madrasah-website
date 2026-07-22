import { Link } from "react-router-dom";
import { C } from "../theme/colors";
import type { PublicSettings } from "../types";

export function PublicFooter({ site }: { site: PublicSettings }) {
  return (
    <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px 32px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          background: C.slateL,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 26,
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{site.name}</h3>
          <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.7 }}>{site.address || "ঠিকানা এখনো যুক্ত করা হয়নি"}</p>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>যোগাযোগ</div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 4 }}>{site.phone || "—"}</div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{site.email || "—"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontSize: 12, color: C.muted }}>প্রতিষ্ঠান ব্যবস্থাপনার অংশ?</div>
          <Link
            to="/login"
            style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
          >
            লগইন করুন
          </Link>
        </div>
      </div>
      {site.footer && <p style={{ textAlign: "center", fontSize: 13, color: C.text, fontWeight: 700, marginTop: 24, marginBottom: 0 }}>{site.footer}</p>}
      <p style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 8 }}>
        © {new Date().getFullYear()} {site.name} • এটি একটি প্রিভিউ/ডেমো পেজ, ধীরে ধীরে হালনাগাদ করা হবে
      </p>
    </footer>
  );
}

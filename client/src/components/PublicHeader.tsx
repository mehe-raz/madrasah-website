import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { C } from "../theme/colors";
import { ConfirmModal } from "./ConfirmModal";
import type { PublicSettings, SiteClassItem } from "../types";

const NAV_LINKS = [
  { to: "/", label: "হোম" },
  { to: "/admission", label: "ভর্তি" },
  { to: "/gallery", label: "গ্যালারি" },
  { to: "/notices", label: "নোটিসেস" },
];

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      style={{
        color: active ? C.emerald : C.text,
        fontWeight: 700,
        fontSize: 13,
        textDecoration: "none",
        padding: "8px 4px",
        borderBottom: active ? `2px solid ${C.emerald}` : "2px solid transparent",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}

export function PublicHeader({ site, classes }: { site: PublicSettings; classes: SiteClassItem[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 800px)");
  const [classesOpen, setClassesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingClass, setPendingClass] = useState<string | null>(null);

  const goToAdmission = (className: string) => {
    setClassesOpen(false);
    setMobileOpen(false);
    navigate(`/admission/apply?class=${encodeURIComponent(className)}`);
  };

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "var(--card)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, textDecoration: "none" }}>
            {site.logo ? (
              <img src={site.logo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 28, flexShrink: 0 }}>🕌</span>
            )}
            <span style={{ fontWeight: 800, fontSize: 16, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {site.name}
            </span>
          </Link>

          {!isMobile && (
            <nav style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <NavLink to="/" label="হোম" active={location.pathname === "/"} />

              <div
                style={{ position: "relative" }}
                onMouseEnter={() => setClassesOpen(true)}
                onMouseLeave={() => setClassesOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setClassesOpen((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: location.pathname === "/classes" ? C.emerald : C.text,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "8px 4px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  ক্লাস ও কোর্সসমূহ <span style={{ fontSize: 10 }}>▾</span>
                </button>
                {classesOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                      minWidth: 220,
                      padding: 6,
                    }}
                  >
                    {classes.length ? (
                      classes.map((c, i) => (
                        <button
                          key={`${c.title}-${i}`}
                          type="button"
                          onClick={() => setPendingClass(c.title)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            borderRadius: 6,
                            padding: "9px 10px",
                            fontSize: 13,
                            color: C.text,
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = C.slateL)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {c.icon} {c.title}
                        </button>
                      ))
                    ) : (
                      <Link to="/classes" style={{ display: "block", padding: "9px 10px", fontSize: 13, color: C.muted, textDecoration: "none" }}>
                        সব ক্লাস দেখুন →
                      </Link>
                    )}
                    {classes.length > 0 && (
                      <Link
                        to="/classes"
                        style={{ display: "block", padding: "9px 10px", fontSize: 12, color: C.emerald, fontWeight: 700, textDecoration: "none", borderTop: `1px solid ${C.border}`, marginTop: 4 }}
                      >
                        সব দেখুন →
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <NavLink to="/admission" label="ভর্তি" active={location.pathname.startsWith("/admission")} />
              <NavLink to="/gallery" label="গ্যালারি" active={location.pathname === "/gallery"} />
              <NavLink to="/notices" label="নোটিসেস" active={location.pathname === "/notices"} />
              <Link
                to="/result"
                style={{
                  background: C.amberL,
                  color: C.amberD,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                ফলাফল দেখুন
              </Link>
              <Link
                to="/login"
                style={{ background: C.emerald, color: "#fff", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
              >
                লগইন
              </Link>
            </nav>
          )}

          {isMobile && (
            <button
              type="button"
              aria-label="মেনু"
              onClick={() => setMobileOpen((v) => !v)}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 18, cursor: "pointer", color: C.text }}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          )}
        </div>

        {isMobile && mobileOpen && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 20px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMobileOpen(false)}
                style={{ padding: "12px 6px", fontSize: 14, fontWeight: 700, color: C.text, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}
              >
                {l.label}
              </Link>
            ))}

            <div style={{ padding: "12px 6px 4px", fontSize: 14, fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}` }}>ক্লাস ও কোর্সসমূহ</div>
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 8 }}>
              {classes.length ? (
                classes.map((c, i) => (
                  <button
                    key={`${c.title}-${i}`}
                    type="button"
                    onClick={() => setPendingClass(c.title)}
                    style={{ textAlign: "left", background: "none", border: "none", padding: "10px 14px", fontSize: 13, color: C.muted, cursor: "pointer" }}
                  >
                    {c.icon} {c.title}
                  </button>
                ))
              ) : (
                <Link to="/classes" onClick={() => setMobileOpen(false)} style={{ padding: "10px 14px", fontSize: 13, color: C.muted, textDecoration: "none" }}>
                  সব ক্লাস দেখুন →
                </Link>
              )}
            </div>

            <Link
              to="/result"
              onClick={() => setMobileOpen(false)}
              style={{ margin: "6px 6px", background: C.amberL, color: C.amberD, borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, textDecoration: "none", textAlign: "center" }}
            >
              ফলাফল দেখুন
            </Link>
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              style={{ margin: "0 6px", background: C.emerald, color: "#fff", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14, textDecoration: "none", textAlign: "center" }}
            >
              লগইন
            </Link>
          </div>
        )}
      </header>

      <ConfirmModal
        open={!!pendingClass}
        title="ভর্তি নিশ্চিতকরণ"
        message={`আপনি কি "${pendingClass}"-এ ভর্তি হতে আগ্রহী? কন্টিনিউ করলে ভর্তি ফর্মে নিয়ে যাওয়া হবে।`}
        onCancel={() => setPendingClass(null)}
        onConfirm={() => {
          if (pendingClass) goToAdmission(pendingClass);
          setPendingClass(null);
        }}
      />
    </>
  );
}

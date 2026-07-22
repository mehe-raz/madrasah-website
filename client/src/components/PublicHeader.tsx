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
        color: active ? C.emeraldD : C.text,
        fontWeight: 800,
        fontSize: 13,
        textDecoration: "none",
        padding: "10px 14px",
        borderRadius: 999,
        background: active ? C.emeraldL : "transparent",
        border: `1px solid ${active ? "transparent" : "transparent"}`,
        whiteSpace: "nowrap",
        transition: "all 180ms ease",
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
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${C.border}`,
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ height: 4, background: `linear-gradient(90deg, ${C.sky}, ${C.emerald}, ${C.amber})` }} />
        <div
          className="section-shell"
          style={{
            paddingTop: 12,
            paddingBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, textDecoration: "none" }}>
            {site.logo ? (
              <img src={site.logo} alt="" style={{ width: 42, height: 42, borderRadius: 14, objectFit: "cover", flexShrink: 0, boxShadow: "0 10px 24px rgba(15, 23, 42, 0.10)" }} />
            ) : (
              <span style={{ fontSize: 30, flexShrink: 0 }}>🕌</span>
            )}
            <span
              style={{
                fontWeight: 900,
                fontSize: 16,
                color: C.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                letterSpacing: "-0.01em",
              }}
            >
              {site.name}
            </span>
          </Link>

          {!isMobile && (
            <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavLink to="/" label="হোম" active={location.pathname === "/"} />

              <div style={{ position: "relative" }} onMouseEnter={() => setClassesOpen(true)} onMouseLeave={() => setClassesOpen(false)}>
                <button
                  type="button"
                  onClick={() => setClassesOpen((v) => !v)}
                  style={{
                    background: classesOpen ? C.slateL : "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: location.pathname === "/classes" ? C.emeraldD : C.text,
                    fontWeight: 800,
                    fontSize: 13,
                    padding: "10px 14px",
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  ক্লাস ও কোর্সসমূহ <span style={{ fontSize: 10 }}>▾</span>
                </button>
                {classesOpen && (
                  <div
                    className="soft-panel"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 10px)",
                      left: 0,
                      minWidth: 240,
                      padding: 8,
                      overflow: "hidden",
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
                            borderRadius: 12,
                            padding: "10px 12px",
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
                      <Link to="/classes" style={{ display: "block", padding: "10px 12px", fontSize: 13, color: C.muted, textDecoration: "none" }}>
                        সব ক্লাস দেখুন →
                      </Link>
                    )}
                    {classes.length > 0 && (
                      <Link
                        to="/classes"
                        style={{ display: "block", padding: "10px 12px", fontSize: 12, color: C.emeraldD, fontWeight: 800, textDecoration: "none", borderTop: `1px solid ${C.border}`, marginTop: 4 }}
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
                className="pill hover-lift"
                style={{
                  background: C.amberL,
                  color: C.amberD,
                  padding: "10px 14px",
                  fontWeight: 800,
                  fontSize: 13,
                  textDecoration: "none",
                  border: `1px solid ${C.border}`,
                }}
              >
                ফলাফল দেখুন
              </Link>
              <Link
                to="/about"
                className="pill hover-lift"
                style={{ background: `linear-gradient(135deg, ${C.emerald}, ${C.teal})`, color: "#fff", padding: "10px 16px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}
              >
                আমাদের সম্পর্কে
              </Link>
            </nav>
          )}

          {isMobile && (
            <button
              type="button"
              aria-label="মেনু"
              onClick={() => setMobileOpen((v) => !v)}
              className="soft-panel"
              style={{ background: "var(--card)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 12px", fontSize: 18, cursor: "pointer", color: C.text }}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          )}
        </div>

        {isMobile && mobileOpen && (
          <div className="section-shell" style={{ paddingBottom: 14 }}>
            <div className="soft-panel" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    padding: "12px 12px",
                    fontSize: 14,
                    fontWeight: 800,
                    color: C.text,
                    textDecoration: "none",
                    borderRadius: 12,
                    background: location.pathname === l.to ? C.slateL : "transparent",
                  }}
                >
                  {l.label}
                </Link>
              ))}

              <div style={{ padding: "12px 12px 4px", fontSize: 14, fontWeight: 800, color: C.text }}>ক্লাস ও কোর্সসমূহ</div>
              <div style={{ display: "flex", flexDirection: "column", paddingBottom: 8 }}>
                {classes.length ? (
                  classes.map((c, i) => (
                    <button
                      key={`${c.title}-${i}`}
                      type="button"
                      onClick={() => setPendingClass(c.title)}
                      style={{ textAlign: "left", background: "none", border: "none", padding: "10px 12px", fontSize: 13, color: C.muted, cursor: "pointer" }}
                    >
                      {c.icon} {c.title}
                    </button>
                  ))
                ) : (
                  <Link to="/classes" onClick={() => setMobileOpen(false)} style={{ padding: "10px 12px", fontSize: 13, color: C.muted, textDecoration: "none" }}>
                    সব ক্লাস দেখুন →
                  </Link>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "4px 2px 2px" }}>
                <Link
                  to="/result"
                  onClick={() => setMobileOpen(false)}
                  className="pill"
                  style={{ background: C.amberL, color: C.amberD, padding: "12px", fontWeight: 800, fontSize: 14, textDecoration: "none", textAlign: "center" }}
                >
                  ফলাফল
                </Link>
                <Link
                  to="/about"
                  onClick={() => setMobileOpen(false)}
                  className="pill"
                  style={{ background: `linear-gradient(135deg, ${C.emerald}, ${C.teal})`, color: "#fff", padding: "12px", fontWeight: 800, fontSize: 14, textDecoration: "none", textAlign: "center" }}
                >
                  সম্পর্কে
                </Link>
              </div>
            </div>
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

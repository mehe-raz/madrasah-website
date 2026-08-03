import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { C } from "../theme/colors";
import { ConfirmModal } from "./ConfirmModal";
import type { PublicSettings, SiteClassItem } from "../types";

const NAV_LINKS = [
  { to: "/", label: "হোম" },
  { to: "/about", label: "আমাদের সম্পর্কে" },
  { to: "/classes", label: "ক্লাস" },
  { to: "/admission", label: "ভর্তি" },
  { to: "/gallery", label: "গ্যালারি" },
  { to: "/notices", label: "নোটিশ" },
  { to: "/result", label: "ফলাফল" },
];

function ChipLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className="nav-chip pill"
      style={{
        color: active ? C.emeraldD : C.text,
        fontWeight: 800,
        fontSize: 13,
        textDecoration: "none",
        padding: "10px 14px",
        background: active ? C.emeraldL : "transparent",
        border: `1px solid ${active ? "transparent" : "transparent"}`,
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
  const isMobile = useMediaQuery("(max-width: 900px)");
  const [classesOpen, setClassesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileClassesOpen, setMobileClassesOpen] = useState(false);
  const [pendingClass, setPendingClass] = useState<string | null>(null);
  // The button and dropdown panel aren't flush against each other (there's
  // a visual gap between them), so a plain onMouseLeave={() =>
  // setClassesOpen(false)} fires the instant the pointer crosses that gap
  // while moving diagonally toward the panel — the menu closes before the
  // pointer ever reaches it. Delaying the close (and cancelling the delay
  // if the pointer re-enters the button or panel in time) fixes that
  // without needing precise hit-area geometry.
  const closeTimer = useRef<number | null>(null);
  const cancelScheduledClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openClasses = () => {
    cancelScheduledClose();
    setClassesOpen(true);
  };
  const scheduleCloseClasses = () => {
    cancelScheduledClose();
    closeTimer.current = window.setTimeout(() => setClassesOpen(false), 250);
  };

  const navItems = useMemo(() => NAV_LINKS, []);

  const goToAdmission = (className: string) => {
    setClassesOpen(false);
    setMobileOpen(false);
    setMobileClassesOpen(false);
    window.scrollTo(0, 0);
    navigate(`/admission/apply?class=${encodeURIComponent(className)}`);
  };

  return (
    <>

      <header
        className="glass-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div className="section-shell" style={{ paddingTop: 12, paddingBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, textDecoration: "none" }}>
            {site.logo ? (
              <img src={site.logo} alt="" loading="eager" decoding="async" style={{ width: 46, height: 46, borderRadius: 16, objectFit: "cover", flexShrink: 0, boxShadow: "0 14px 28px rgba(15, 23, 42, 0.12)" }} />
            ) : (
              <span style={{ width: 46, height: 46, borderRadius: 16, display: "grid", placeItems: "center", background: C.emeraldL, color: C.emeraldD, fontSize: 22, flexShrink: 0, boxShadow: "0 14px 28px rgba(15, 23, 42, 0.08)" }}>🏫</span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-0.02em", color: C.text, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {site.name}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3, fontWeight: 700 }}>দ্বীনি ও আধুনিক শিক্ষার সমন্বয়</div>
            </div>
          </Link>

          {!isMobile ? (
            <>
              <nav style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                {navItems.filter((item) => item.to !== "/").map((item) => (
                  item.to === "/classes" ? (
                    <div key={item.to} style={{ position: "relative" }} onMouseEnter={openClasses} onMouseLeave={scheduleCloseClasses}>
                      <button
                        type="button"
                        onClick={() => {
                          cancelScheduledClose();
                          setClassesOpen((v) => !v);
                        }}
                        className="nav-chip pill"
                        style={{
                          background: location.pathname.startsWith("/classes") ? C.emeraldL : "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: location.pathname.startsWith("/classes") ? C.emeraldD : C.text,
                          fontWeight: 800,
                          fontSize: 13,
                          padding: "10px 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        ক্লাস <span style={{ fontSize: 10 }}>▾</span>
                      </button>

                      {classesOpen && (
                        <div
                          className="soft-panel section-pop"
                          style={{ position: "absolute", top: "calc(100% + 10px)", left: 0, minWidth: 260, maxWidth: "min(320px, 90vw)", maxHeight: "min(420px, calc(100vh - 140px))", padding: 8, display: "flex", flexDirection: "column" }}
                        >
                          <div style={{ overflowY: "auto", flex: "1 1 auto" }}>
                            {classes.length ? (
                              classes.map((c, i) => (
                                <button
                                  key={`${c.title}-${i}`}
                                  type="button"
                                  onClick={() => setPendingClass(c.title)}
                                  className="nav-chip"
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    background: "transparent",
                                    border: "none",
                                    borderRadius: 14,
                                    padding: "11px 12px",
                                    fontSize: 13,
                                    color: C.text,
                                    cursor: "pointer",
                                    fontWeight: 700,
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = C.slateL)}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                  <span style={{ marginRight: 8 }}>{c.icon}</span>
                                  {c.title}
                                  {c.desc && <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 4, fontWeight: 600 }}>{c.desc}</span>}
                                </button>
                              ))
                            ) : (
                              <Link to="/classes" style={{ display: "block", padding: "10px 12px", fontSize: 13, color: C.muted, textDecoration: "none" }}>
                                সব ক্লাস এখানে দেখা যাবে →
                              </Link>
                            )}
                          </div>
                          <div style={{ padding: 8, paddingTop: 8, flex: "0 0 auto" }}>
                            <Link to="/classes" className="pill nav-chip" style={{ display: "block", background: C.emeraldL, color: C.emeraldD, padding: "10px 12px", textDecoration: "none", fontWeight: 800, fontSize: 12, textAlign: "center" }}>
                              সব ক্লাস দেখুন
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ChipLink key={item.to} to={item.to} label={item.label} active={location.pathname === item.to} />
                  )
                ))}
              </nav>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="pill nav-chip"
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "10px 14px",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              ☰ মেনু
            </button>
          )}
        </div>
      </header>

      {isMobile && mobileOpen && (
        <div className="drawer-backdrop" style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setMobileOpen(false)}>
          <div
            className="glass-drawer"
            style={{ position: "absolute", top: 0, right: 0, width: "min(88vw, 360px)", height: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: C.text }}>{site.name}</div>
              <button type="button" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ border: `1px solid ${C.border}`, background: C.card, color: C.text, padding: "8px 10px" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <Link to="/" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: location.pathname === "/" ? C.emeraldL : C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 14px", textDecoration: "none", fontWeight: 800 }}>হোম</Link>
              <Link to="/about" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: location.pathname === "/about" ? C.emeraldL : C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 14px", textDecoration: "none", fontWeight: 800 }}>আমাদের সম্পর্কে</Link>
              <Link to="/admission" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: location.pathname.startsWith("/admission") ? C.emeraldL : C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 14px", textDecoration: "none", fontWeight: 800 }}>ভর্তি</Link>
              <Link to="/gallery" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: location.pathname === "/gallery" ? C.emeraldL : C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 14px", textDecoration: "none", fontWeight: 800 }}>গ্যালারি</Link>
              <Link to="/notices" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: location.pathname === "/notices" ? C.emeraldL : C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 14px", textDecoration: "none", fontWeight: 800 }}>নোটিশ</Link>
              <Link to="/result" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: location.pathname === "/result" ? C.emeraldL : C.card, color: C.text, border: `1px solid ${C.border}`, padding: "12px 14px", textDecoration: "none", fontWeight: 800 }}>ফলাফল</Link>
            </div>

            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setMobileClassesOpen((v) => !v)}
                className="pill nav-chip"
                style={{ width: "100%", textAlign: "left", background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "11px 14px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span>ক্লাস</span>
                <span style={{ fontSize: 10 }}>{mobileClassesOpen ? "▴" : "▾"}</span>
              </button>
              {mobileClassesOpen && (
                <div style={{ display: "grid", gap: 8, marginTop: 8, paddingLeft: 4 }}>
                  {classes.length ? (
                    classes.map((c, i) => (
                      <button key={`${c.title}-${i}`} type="button" onClick={() => setPendingClass(c.title)} className="pill nav-chip" style={{ textAlign: "left", background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "11px 14px", fontWeight: 700 }}>
                        {c.icon} {c.title}
                      </button>
                    ))
                  ) : (
                    <Link to="/classes" onClick={() => setMobileOpen(false)} className="pill nav-chip" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: "11px 14px", textDecoration: "none", fontWeight: 700 }}>
                      সব ক্লাস দেখুন
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingClass !== null}
        title="ভর্তি"
        message={`${pendingClass ?? ""} ক্লাসে ভর্তি ফর্মে যেতে চান?`}
        confirmLabel="এগিয়ে যান"
        cancelLabel="বাতিল"
        onCancel={() => setPendingClass(null)}
        onConfirm={() => {
          if (pendingClass) {
            goToAdmission(pendingClass);
          }
          setPendingClass(null);
        }}
      />
    </>
  );
}

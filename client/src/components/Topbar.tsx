import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";

const PATH_KEYS: Record<string, "dashboard" | "students" | "attendance" | "income" | "expenses" | "hifz" | "reports" | "settings"> = {
  "/": "dashboard",
  "/students": "students",
  "/attendance": "attendance",
  "/income": "income",
  "/fees": "income",
  "/expenses": "expenses",
  "/hifz": "hifz",
  "/reports": "reports",
  "/settings": "settings",
};

interface TopbarProps {
  onToggleSidebar: () => void;
  onLogout: () => void;
}

export function Topbar({ onToggleSidebar, onLogout }: TopbarProps) {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const key = Object.entries(PATH_KEYS).find(([path]) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path)
  )?.[1];
  const title = key ? t.nav[key] : t.nav.dashboard;
  const initials = user?.name?.slice(0, 2) || "U";

  return (
    <header
      className="topbar"
      style={{
        background: C.card,
        borderBottom: `1px solid ${C.border}`,
        padding: "14px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexShrink: 0,
        boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
      }}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="sidebar-toggle"
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.muted, padding: 4 }}
      >
        ☰
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 15, color: C.text, fontWeight: 600, fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>{title}</span>
      </div>
      <span className="hide-mobile" style={{ fontSize: 12, color: C.muted, letterSpacing: 0.5 }}>2025-2026</span>
      <button
        type="button"
        onClick={onLogout}
        style={{ background: C.slateL, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.text }}
      >
        {t.settings.logout}
      </button>
      <div
        title={user?.role}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: C.tealL,
          border: `1px solid ${C.teal}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: C.tealD,
        }}
      >
        {initials}
      </div>
    </header>
  );
}

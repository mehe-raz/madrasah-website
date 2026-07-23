import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import { NotificationBell } from "./NotificationBell";

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
  const key = Object.entries(PATH_KEYS).find(([path]) => (path === "/" ? pathname === "/" : pathname.startsWith(path)))?.[1];
  const title = key ? t.nav[key] : t.nav.dashboard;
  const initials = user?.name?.slice(0, 2) || "U";

  return (
    <header
      className="topbar"
      style={{
        background: "var(--surface)",
        borderBottom: `1px solid ${C.border}`,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        backdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        className="sidebar-toggle pill"
        style={{ background: "var(--card)", border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 18, color: C.muted, padding: "7px 11px" }}
      >
        ☰
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, color: C.muted, fontWeight: 700 }}>{title}</span>
      </div>

      <span className="hide-mobile" style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>
        2025-2026
      </span>

      <NotificationBell />

      <button
        type="button"
        onClick={onLogout}
        className="pill nav-chip"
        style={{ background: C.slateL, border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 12px", fontSize: 12, cursor: "pointer", color: C.text, fontWeight: 800 }}
      >
        {t.settings.logout}
      </button>

      <div
        title={user?.role}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: C.emeraldL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
          color: C.emeraldD,
        }}
      >
        {initials}
      </div>
    </header>
  );
}

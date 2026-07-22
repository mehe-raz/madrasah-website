import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { canAccess, type Permission } from "../lib/permissions";
import { C } from "../theme/colors";

const NAV_IDS: { id: string; path: string; icon: string; key: Permission }[] = [
  { id: "dashboard", path: "/", icon: "🏠", key: "dashboard" },
  { id: "students", path: "/students", icon: "👨‍🎓", key: "students" },
  { id: "attendance", path: "/attendance", icon: "📅", key: "attendance" },
  { id: "income", path: "/income", icon: "💰", key: "income" },
  { id: "expenses", path: "/expenses", icon: "💸", key: "expenses" },
  { id: "hifz", path: "/hifz", icon: "📖", key: "hifz" },
  { id: "results", path: "/results", icon: "📝", key: "results" },
  { id: "reports", path: "/reports", icon: "📊", key: "reports" },
  { id: "website", path: "/website", icon: "🌐", key: "website" },
  { id: "settings", path: "/settings", icon: "⚙️", key: "settings" },
];

interface SidebarProps {
  open: boolean;
  user: { name: string; role: string };
  onNavigate?: () => void;
}

export function Sidebar({ open, user, onNavigate }: SidebarProps) {
  const { t } = useLanguage();
  const { settings } = useAppSettings();
  const { name: madrasaName } = useMadrasaBranding();
  const { user: authUser } = useAuth();
  const role = authUser?.role || user.role;

  const navItems = NAV_IDS.filter((n) => canAccess(role, n.key));

  return (
    <aside
      className={`sidebar ${open ? "sidebar-open" : "sidebar-closed"}`}
      style={{
        width: open ? 236 : 64,
        background: "linear-gradient(180deg, #0f172a 0%, #08111d 100%)",
        transition: "width 0.25s",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          padding: open ? "20px 20px 16px" : "20px 12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {settings.logo ? (
            <img src={settings.logo} alt="" loading="lazy" decoding="async" style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 26, flexShrink: 0 }}>🕌</span>
          )}
          {open && (
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{madrasaName}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 4 }}>{user.role}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: open ? 12 : 8, display: "grid", gap: 6 }}>
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""}`}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: open ? "11px 12px" : "11px 10px",
              textDecoration: "none",
              color: isActive ? "#fff" : "rgba(255,255,255,0.84)",
              background: isActive ? "rgba(14,165,233,0.16)" : "transparent",
              border: `1px solid ${isActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
              fontSize: 13,
              fontWeight: 800,
              justifyContent: open ? "flex-start" : "center",
            })}
            title={!open ? t.nav[item.key] : undefined}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav[item.key]}</span>}
          </NavLink>
        ))}
      </div>

      {open && (
        <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="soft-panel" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)", boxShadow: "none", padding: 14 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 800, marginBottom: 6 }}>Theme</div>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{settings.theme === "dark" ? "Dark" : "Light"}</div>
          </div>
        </div>
      )}
    </aside>
  );
}

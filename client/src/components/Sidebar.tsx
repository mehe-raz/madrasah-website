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
  { id: "reports", path: "/reports", icon: "📊", key: "reports" },
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
        width: open ? 230 : 60,
        background: C.slateD,
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
          padding: open ? "20px 20px 16px" : "20px 10px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {settings.logo ? (
            <img src={settings.logo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 26, flexShrink: 0 }}>🕌</span>
          )}
          {open && (
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{madrasaName}</div>
              <div style={{ color: C.teal, fontWeight: 600, fontSize: 12 }}>ERP</div>
            </div>
          )}
        </div>
      </div>

      <nav style={{ padding: "10px 8px", flex: 1 }}>
        {navItems.map((n) => (
          <NavLink
            key={n.id}
            to={n.path}
            end={n.path === "/"}
            onClick={onNavigate}
            title={t.nav[n.key as keyof typeof t.nav] || n.id}
            style={({ isActive }) => ({
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: open ? "10px 12px" : "10px",
              borderRadius: 8,
              marginBottom: 2,
              background: isActive ? "rgba(8,145,178,0.25)" : "transparent",
              color: isActive ? "#7dd3fc" : "rgba(255,255,255,0.6)",
              textDecoration: "none",
              transition: "all 0.15s",
            })}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
            {open && (
              <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.nav[n.key as keyof typeof t.nav] || n.id}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {open && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: C.teal }}>{user.role}</div>
        </div>
      )}
    </aside>
  );
}

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
        width: open ? 240 : 64,
        background: "linear-gradient(180deg, #171410 0%, #0f0d0a 100%)",
        transition: "width 0.25s",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
        boxShadow: "2px 0 24px rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          padding: open ? "22px 20px 18px" : "22px 10px 18px",
          borderBottom: "1px solid rgba(201,162,77,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {settings.logo ? (
            <img src={settings.logo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(201,162,77,0.4)" }} />
          ) : (
            <span style={{ fontSize: 26, flexShrink: 0 }}>🕌</span>
          )}
          {open && (
            <div>
              <div style={{ color: "#f7f0dc", fontWeight: 700, fontSize: 14, lineHeight: 1.25, fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>{madrasaName}</div>
              <div style={{ color: C.teal, fontWeight: 600, fontSize: 11, letterSpacing: 1.5 }}>ERP</div>
            </div>
          )}
        </div>
      </div>

      <nav style={{ padding: "12px 8px", flex: 1 }}>
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
              marginBottom: 3,
              background: isActive ? "rgba(201,162,77,0.16)" : "transparent",
              borderLeft: isActive ? `2px solid ${C.teal}` : "2px solid transparent",
              color: isActive ? "#e9cf8c" : "rgba(243,236,220,0.6)",
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
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(201,162,77,0.18)" }}>
          <div style={{ fontSize: 13, color: "rgba(243,236,220,0.85)", fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: C.teal, letterSpacing: 0.4 }}>{user.role}</div>
        </div>
      )}
    </aside>
  );
}

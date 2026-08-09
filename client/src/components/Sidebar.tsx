import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { usePlanFeatures } from "../context/PlanContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { canAccess, canViewAuditLogs, type Permission } from "../lib/permissions";
import { Icons, type IconKey } from "../lib/icons";

// `feature` is omitted for nav items that are never plan-gated (dashboard,
// students, attendance, results, website, settings) — see the 6-route list
// in server/src/config/planFeatures.js / App.tsx's PlanFeatureGate wiring.
const NAV_IDS: { id: string; path: string; icon: IconKey; key: Permission; feature?: string }[] = [
  { id: "dashboard", path: "/", icon: "dashboard", key: "dashboard" },
  { id: "students", path: "/students", icon: "students", key: "students" },
  { id: "attendance", path: "/attendance", icon: "attendance", key: "attendance" },
  { id: "income", path: "/income", icon: "income", key: "income", feature: "feesCollection" },
  { id: "expenses", path: "/expenses", icon: "expenses", key: "expenses", feature: "expenses" },
  { id: "hifz", path: "/hifz", icon: "hifz", key: "hifz", feature: "hifzTracking" },
  { id: "results", path: "/results", icon: "results", key: "results" },
  { id: "assignments", path: "/assignments", icon: "assignments", key: "assignments", feature: "assignmentsBroadcast" },
  { id: "reports", path: "/reports", icon: "reports", key: "reports", feature: "reportsExport" },
  { id: "website", path: "/website", icon: "website", key: "website" },
  { id: "settings", path: "/settings", icon: "settings", key: "settings" },
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
  const { isLocked } = usePlanFeatures();

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
            <Icons.brand size={22} color="#fff" style={{ flexShrink: 0 }} />
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
        {navItems.map((item) => {
          const locked = item.feature ? isLocked(item.feature) : false;
          const Icon = Icons[item.icon];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""} ${locked ? "nav-item--locked" : ""}`}
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
              <Icon size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
              {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav[item.key]}</span>}
              {open && locked && (
                <span className="nav-item__lock-badge" aria-hidden="true">
                  <Icons.lock size={12} />
                </span>
              )}
            </NavLink>
          );
        })}
        {/* Guardian Reminder Messenger admin module — rendered outside
            NAV_IDS for the same reason as the SMS/bKash blocks below: it
            reuses the "settings" permission but needs its own nav LABEL
            (t.nav[item.key] would otherwise show "Settings" twice). No
            plan-lock check yet — plan-gating for this feature is still an
            open decision (docs/CURRENT_TASK.md), so isLocked() isn't
            called here the way it is for "sms"/"bkash" below. */}
        {canAccess(role, "settings") && (
          <NavLink
            to="/guardian-reminders"
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
            title={!open ? t.nav.guardianReminders : undefined}
          >
            <Icons.bell size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.guardianReminders}</span>}
          </NavLink>
        )}
        {/* "SMS সেবা" (Phase 8D) — rendered outside NAV_IDS like audit-logs
            below, because it reuses the "settings" permission for access
            but needs its own nav LABEL (t.nav[item.key] would otherwise
            show "Settings" twice) and its own plan-lock check ("sms", not
            "auditLogs"). */}
        {canAccess(role, "settings") && (
          <NavLink
            to="/sms"
            onClick={onNavigate}
            className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""} ${isLocked("sms") ? "nav-item--locked" : ""}`}
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
            title={!open ? t.nav.sms : undefined}
          >
            <Icons.sms size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.sms}</span>}
            {open && isLocked("sms") && (
              <span className="nav-item__lock-badge" aria-hidden="true">
                <Icons.lock size={12} />
              </span>
            )}
          </NavLink>
        )}
        {/* "বিকাশ পেমেন্ট গেটওয়ে" (Phase 8E) — same reasoning as the SMS
            block above: reuses "settings" permission, own label/lock via
            the "bkash" plan feature, kept outside NAV_IDS. */}
        {canAccess(role, "settings") && (
          <NavLink
            to="/payment-gateway"
            onClick={onNavigate}
            className={({ isActive }) =>
              `pill nav-chip ${isActive ? "active" : ""} ${isLocked("bkash") ? "nav-item--locked" : ""}`
            }
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
            title={!open ? t.nav.paymentGateway : undefined}
          >
            <Icons.paymentGateway size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.paymentGateway}</span>}
            {open && isLocked("bkash") && (
              <span className="nav-item__lock-badge" aria-hidden="true">
                <Icons.lock size={12} />
              </span>
            )}
          </NavLink>
        )}
        {/* Institution self-service platform-subscription billing (ad-hoc,
            docs/CURRENT_TASK.md) — reuses "settings" permission like
            payment-gateway above, but no plan-lock: paying your own bill
            isn't itself a paid plan feature. */}
        {canAccess(role, "settings") && (
          <NavLink
            to="/settings/billing"
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
            title={!open ? t.nav.institutionBilling : undefined}
          >
            <Icons.institutionBilling size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.institutionBilling}</span>}
          </NavLink>
        )}
        {canViewAuditLogs(role) && (
          <NavLink
            to="/audit-logs"
            onClick={onNavigate}
            className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""} ${isLocked("auditLogs") ? "nav-item--locked" : ""}`}
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
            title={!open ? t.nav.auditLogs : undefined}
          >
            <Icons.auditLogs size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.auditLogs}</span>}
            {open && isLocked("auditLogs") && (
              <span className="nav-item__lock-badge" aria-hidden="true">
                <Icons.lock size={12} />
              </span>
            )}
          </NavLink>
        )}
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

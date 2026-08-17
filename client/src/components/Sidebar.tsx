import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
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
  const location = useLocation();

  // ad-hoc, docs/CURRENT_TASK.md — the two SMS-related nav items ("SMS
  // সেবা" wallet settings + "বাল্ক SMS" own-phone gateway) used to be two
  // separate top-level pills; now grouped under one expandable "SMS"
  // parent so they read as sub-categories of one feature instead of two
  // unrelated items. Starts expanded if the user is already on either
  // sub-route (e.g. a page refresh on /bulk-sms shouldn't hide its own
  // parent), collapsed otherwise.
  const [smsGroupOpen, setSmsGroupOpen] = useState(
    location.pathname === "/sms" || location.pathname === "/bulk-sms"
  );
  const smsGroupActive = location.pathname === "/sms" || location.pathname === "/bulk-sms";

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
        {/* Attendance device management
            (docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 1B) — kept
            outside NAV_IDS like the blocks below because it reuses the
            "attendance" permission but needs its own nav LABEL
            (t.nav.attendance already labels the /attendance route above,
            reusing t.nav[item.key] here would show "হাজিরা" twice). No
            plan-lock: this is core to the attendance feature, not gated
            behind a separate plan feature. */}
        {/* প্রবেশপত্র (Admit Cards) — reuses the "results" permission (same
            Admin/Teacher audience as the Results screen above) but needs
            its own nav LABEL, same reasoning as the two blocks below
            (t.nav[item.key] would otherwise show "ফলাফল" twice). */}
        {canAccess(role, "results") && (
          <NavLink
            to="/admit-cards"
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
            title={!open ? t.nav.admitCards : undefined}
          >
            <Icons.admitCards size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.admitCards}</span>}
          </NavLink>
        )}
        {/* পরীক্ষার খাতার প্রথম পেইজ (Exam Cover Sheets) — reuses the
            "results" permission, same reasoning as প্রবেশপত্র above; needs
            its own nav LABEL for the same reason. */}
        {canAccess(role, "results") && (
          <NavLink
            to="/exam-cover-sheets"
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
            title={!open ? t.nav.examCoverSheets : undefined}
          >
            <Icons.examCoverSheets size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.examCoverSheets}</span>}
          </NavLink>
        )}
        {canAccess(role, "attendance") && (
          <NavLink
            to="/attendance-devices"
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
            title={!open ? t.nav.attendanceDevices : undefined}
          >
            <Icons.fingerprint size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.attendanceDevices}</span>}
          </NavLink>
        )}
        {/* docs/STAFF_ATTENDANCE_PLAN.md, Phase 5/6 — staff registry and
            staff attendance. Two separate permission keys ("staff",
            "staffAttendance"), each with its own nav item, same pattern as
            the admit-cards/attendance-devices blocks above. */}
        {canAccess(role, "staff") && (
          <NavLink
            to="/staff"
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
            title={!open ? t.nav.staff : undefined}
          >
            <Icons.staff size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.staff}</span>}
          </NavLink>
        )}
        {canAccess(role, "staffAttendance") && (
          <NavLink
            to="/staff-attendance"
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
            title={!open ? t.nav.staffAttendance : undefined}
          >
            <Icons.staffAttendance size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav.staffAttendance}</span>}
          </NavLink>
        )}
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
        {/* "SMS" group (ad-hoc, docs/CURRENT_TASK.md) — replaces the two
            previously-separate top-level pills ("SMS সেবা" wallet settings
            at /sms, and "বাল্ক SMS (নিজের ফোন)" own-phone gateway at
            /bulk-sms) with one parent + two sub-items, since both are
            really the same feature (sending SMS to guardians) with two
            delivery methods. Both routes still reuse the "settings"
            permission and "sms" plan feature exactly as before — only the
            nav presentation changed, not access control.
            In icon-rail mode (open === false) there's no room for a
            sub-menu flyout, so this falls back to the original two
            separate icon-only links instead of trying to build a rail
            flyout for two items. */}
        {canAccess(role, "settings") && !open && (
          <>
            <NavLink
              to="/sms"
              onClick={onNavigate}
              className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""} ${isLocked("sms") ? "nav-item--locked" : ""}`}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 10px",
                textDecoration: "none",
                color: isActive ? "#fff" : "rgba(255,255,255,0.84)",
                background: isActive ? "rgba(14,165,233,0.16)" : "transparent",
                border: `1px solid ${isActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
                fontSize: 13,
                fontWeight: 800,
                justifyContent: "center",
              })}
              title={t.nav.sms}
            >
              <Icons.sms size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            </NavLink>
            <NavLink
              to="/bulk-sms"
              onClick={onNavigate}
              className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""} ${isLocked("sms") ? "nav-item--locked" : ""}`}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 10px",
                textDecoration: "none",
                color: isActive ? "#fff" : "rgba(255,255,255,0.84)",
                background: isActive ? "rgba(14,165,233,0.16)" : "transparent",
                border: `1px solid ${isActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
                fontSize: 13,
                fontWeight: 800,
                justifyContent: "center",
              })}
              title={t.nav.bulkSms}
            >
              <Icons.bulkSms size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            </NavLink>
          </>
        )}
        {canAccess(role, "settings") && open && (
          <div>
            <button
              type="button"
              onClick={() => setSmsGroupOpen((v) => !v)}
              aria-expanded={smsGroupOpen}
              className={`pill nav-chip ${smsGroupActive ? "active" : ""} ${isLocked("sms") ? "nav-item--locked" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 12px",
                width: "100%",
                border: `1px solid ${smsGroupActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
                background: smsGroupActive ? "rgba(14,165,233,0.16)" : "transparent",
                color: smsGroupActive ? "#fff" : "rgba(255,255,255,0.84)",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              <Icons.sms size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span style={{ whiteSpace: "nowrap" }}>{t.nav.smsGroup}</span>
              {isLocked("sms") && (
                <span className="nav-item__lock-badge" aria-hidden="true">
                  <Icons.lock size={12} />
                </span>
              )}
              <Icons.chevronDown
                size={14}
                style={{
                  flexShrink: 0,
                  marginLeft: "auto",
                  transform: smsGroupOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s",
                }}
                aria-hidden="true"
              />
            </button>
            {smsGroupOpen && (
              <div style={{ display: "grid", gap: 4, marginTop: 4, paddingLeft: 14 }}>
                <NavLink
                  to="/sms"
                  onClick={onNavigate}
                  className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""}`}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    textDecoration: "none",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.72)",
                    background: isActive ? "rgba(14,165,233,0.16)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
                    fontSize: 12.5,
                    fontWeight: 700,
                  })}
                >
                  <span style={{ whiteSpace: "nowrap" }}>{t.nav.sms}</span>
                </NavLink>
                <NavLink
                  to="/bulk-sms"
                  onClick={onNavigate}
                  className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""}`}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    textDecoration: "none",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.72)",
                    background: isActive ? "rgba(14,165,233,0.16)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
                    fontSize: 12.5,
                    fontWeight: 700,
                  })}
                >
                  <span style={{ whiteSpace: "nowrap" }}>{t.nav.bulkSms}</span>
                </NavLink>
              </div>
            )}
          </div>
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

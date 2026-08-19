import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { usePlanFeatures } from "../context/PlanContext";
import { useMadrasaBranding } from "../hooks/useMadrasaBranding";
import { canAccess, canViewAuditLogs, type Permission } from "../lib/permissions";
import { Icons, type IconKey } from "../lib/icons";
import type { Dict } from "../i18n/bn";

// --- Nav structure ----------------------------------------------------
// ad-hoc, docs/CURRENT_TASK.md "sidebar reorganization" — the sidebar had
// grown to ~21 flat top-level items (one per feature added over time),
// which no longer scanned well on desktop and was a very long scroll on
// mobile (the mobile drawer always renders the full open/labeled sidebar —
// there's no icon-only rail on phones, see Layout.tsx). Reorganized into:
//   - TOP_ITEMS: daily-use screens, always flat/visible, in the order most
//     people touch them in a normal day.
//   - MID_ITEMS: checked regularly but not daily (reports, the public
//     website admin) — flat, rendered between the daily items and the
//     occasional-use groups below.
//   - GROUPS: things used occasionally, seasonally, or as one-time setup
//     (exam-time printing, outbound messaging, staff records, billing
//     config, hardware/audit admin) — collapsed by default, each behind
//     one parent row, so they don't compete for scan-priority with daily
//     work but are still one tap away.
//   - Settings: always last, separated by a divider — it's configuration,
//     not a "do work" screen, so it doesn't belong mixed into the flow
//     above.
// On a collapsed desktop rail (open === false) there's no room for group
// headers or indentation, so every item — top, mid, and every group's
// children — falls back to one flat list of icon-only links, same as the
// old SMS group already did; see the `!open` branch in NavGroup below.
interface NavLeaf {
  id: string;
  path: string;
  icon: IconKey;
  permission: Permission;
  labelKey: keyof Dict["nav"];
  feature?: string;
  auditLogsCheck?: boolean; // audit logs uses canViewAuditLogs(), not canAccess()
}

interface NavGroupDef {
  id: string;
  icon: IconKey;
  labelKey: keyof Dict["nav"];
  items: NavLeaf[];
}

const TOP_ITEMS: NavLeaf[] = [
  { id: "dashboard", path: "/", icon: "dashboard", permission: "dashboard", labelKey: "dashboard" },
  { id: "students", path: "/students", icon: "students", permission: "students", labelKey: "students" },
  { id: "attendance", path: "/attendance", icon: "attendance", permission: "attendance", labelKey: "attendance" },
  { id: "results", path: "/results", icon: "results", permission: "results", labelKey: "results" },
  { id: "hifz", path: "/hifz", icon: "hifz", permission: "hifz", labelKey: "hifz", feature: "hifzTracking" },
  { id: "income", path: "/income", icon: "income", permission: "income", labelKey: "income", feature: "feesCollection" },
  { id: "expenses", path: "/expenses", icon: "expenses", permission: "expenses", labelKey: "expenses", feature: "expenses" },
];

const MID_ITEMS: NavLeaf[] = [
  { id: "reports", path: "/reports", icon: "reports", permission: "reports", labelKey: "reports", feature: "reportsExport" },
  { id: "website", path: "/website", icon: "website", permission: "website", labelKey: "website" },
];

const GROUPS: NavGroupDef[] = [
  // Exam-time printing — used in bursts around exams, not daily.
  {
    id: "examDocs",
    icon: "admitCards",
    labelKey: "examDocsGroup",
    items: [
      { id: "admitCards", path: "/admit-cards", icon: "admitCards", permission: "results", labelKey: "admitCards" },
      { id: "examCoverSheets", path: "/exam-cover-sheets", icon: "examCoverSheets", permission: "results", labelKey: "examCoverSheets" },
    ],
  },
  // Outbound messaging to guardians — sent when needed, not a daily check.
  {
    id: "communication",
    icon: "assignments",
    labelKey: "communicationGroup",
    items: [
      { id: "assignments", path: "/assignments", icon: "assignments", permission: "assignments", labelKey: "assignments", feature: "assignmentsBroadcast" },
      { id: "guardianReminders", path: "/guardian-reminders", icon: "bell", permission: "settings", labelKey: "guardianReminders" },
      { id: "sms", path: "/sms", icon: "sms", permission: "settings", labelKey: "sms", feature: "sms" },
      { id: "bulkSms", path: "/bulk-sms", icon: "bulkSms", permission: "settings", labelKey: "bulkSms", feature: "sms" },
    ],
  },
  // Staff records/attendance — a separate registry from student-facing
  // daily work above.
  {
    id: "staffGroup",
    icon: "staff",
    labelKey: "staffGroup",
    items: [
      { id: "staff", path: "/staff", icon: "staff", permission: "staff", labelKey: "staff" },
      { id: "staffAttendance", path: "/staff-attendance", icon: "staffAttendance", permission: "staffAttendance", labelKey: "staffAttendance" },
    ],
  },
  // Payment/subscription configuration — set up once, revisited rarely.
  {
    id: "billingGroup",
    icon: "paymentGateway",
    labelKey: "billingGroup",
    items: [
      { id: "paymentGateway", path: "/payment-gateway", icon: "paymentGateway", permission: "settings", labelKey: "paymentGateway", feature: "bkash" },
      { id: "institutionBilling", path: "/settings/billing", icon: "institutionBilling", permission: "settings", labelKey: "institutionBilling" },
    ],
  },
  // Hardware setup + oversight — one-time or occasional, admin-only.
  {
    id: "systemGroup",
    icon: "fingerprint",
    labelKey: "systemGroup",
    items: [
      { id: "attendanceDevices", path: "/attendance-devices", icon: "fingerprint", permission: "attendance", labelKey: "attendanceDevices" },
      // docs/CCTV_INTEGRATION_PLAN.md, Phase 6 — camera bridge + camera CRUD
      { id: "cameras", path: "/cameras", icon: "camera", permission: "cameras", labelKey: "cameras" },
      { id: "auditLogs", path: "/audit-logs", icon: "auditLogs", permission: "settings", labelKey: "auditLogs", feature: "auditLogs", auditLogsCheck: true },
    ],
  },
];

const SETTINGS_ITEM: NavLeaf = { id: "settings", path: "/settings", icon: "settings", permission: "settings", labelKey: "settings" };

function canSeeItem(role: string, item: NavLeaf): boolean {
  if (item.auditLogsCheck) return canViewAuditLogs(role);
  return canAccess(role, item.permission);
}

const itemStyle = (isActive: boolean, open: boolean, indent: boolean) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: indent ? "9px 12px" : open ? "11px 12px" : "11px 10px",
  textDecoration: "none",
  color: isActive ? "#fff" : `rgba(255,255,255,${indent ? 0.72 : 0.84})`,
  background: isActive ? "rgba(14,165,233,0.16)" : "transparent",
  border: `1px solid ${isActive ? "rgba(125,211,252,0.25)" : "transparent"}`,
  fontSize: indent ? 12.5 : 13,
  fontWeight: indent ? 700 : 800,
  justifyContent: open ? "flex-start" : "center",
});

function NavItem({
  item,
  open,
  indent,
  showIcon,
  onNavigate,
  isLocked,
  t,
}: {
  item: NavLeaf;
  open: boolean;
  indent: boolean;
  showIcon: boolean;
  onNavigate?: () => void;
  isLocked: (feature: string) => boolean;
  t: Dict;
}) {
  const Icon = Icons[item.icon];
  const locked = item.feature ? isLocked(item.feature) : false;
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) => `pill nav-chip ${isActive ? "active" : ""} ${locked ? "nav-item--locked" : ""}`}
      style={({ isActive }) => itemStyle(isActive, open, indent)}
      title={!open ? t.nav[item.labelKey] : undefined}
    >
      {showIcon && <Icon size={indent ? 16 : 18} style={{ flexShrink: 0 }} aria-hidden="true" />}
      {open && <span style={{ whiteSpace: "nowrap" }}>{t.nav[item.labelKey]}</span>}
      {open && locked && (
        <span className="nav-item__lock-badge" aria-hidden="true">
          <Icons.lock size={12} />
        </span>
      )}
    </NavLink>
  );
}

function NavGroup({
  group,
  role,
  open,
  isOpen,
  onToggle,
  currentPath,
  onNavigate,
  isLocked,
  t,
}: {
  group: NavGroupDef;
  role: string;
  open: boolean;
  isOpen: boolean;
  onToggle: () => void;
  currentPath: string;
  onNavigate?: () => void;
  isLocked: (feature: string) => boolean;
  t: Dict;
}) {
  const visibleItems = group.items.filter((item) => canSeeItem(role, item));
  if (!visibleItems.length) return null;

  // Collapsed desktop rail: no room for a header/flyout, so the group's
  // own items just fall into the same flat icon-only list as everything
  // else (same fallback the old SMS group used).
  if (!open) {
    return (
      <>
        {visibleItems.map((item) => (
          <NavItem key={item.id} item={item} open={false} indent={false} showIcon onNavigate={onNavigate} isLocked={isLocked} t={t} />
        ))}
      </>
    );
  }

  const active = visibleItems.some((item) => currentPath === item.path);
  const GroupIcon = Icons[group.icon];

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`pill nav-chip ${active ? "active" : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 12px",
          width: "100%",
          border: `1px solid ${active ? "rgba(125,211,252,0.25)" : "transparent"}`,
          background: active ? "rgba(14,165,233,0.16)" : "transparent",
          color: active ? "#fff" : "rgba(255,255,255,0.84)",
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        <GroupIcon size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={{ whiteSpace: "nowrap" }}>{t.nav[group.labelKey]}</span>
        <Icons.chevronDown
          size={14}
          style={{
            flexShrink: 0,
            marginLeft: "auto",
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div style={{ display: "grid", gap: 4, marginTop: 4, paddingLeft: 14 }}>
          {visibleItems.map((item) => (
            <NavItem key={item.id} item={item} open onNavigate={onNavigate} isLocked={isLocked} t={t} indent showIcon={false} />
          ))}
        </div>
      )}
    </div>
  );
}

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

  // Each group starts open only if the current route already lives inside
  // it — e.g. landing on /bulk-sms via a page refresh shouldn't hide its
  // own parent — otherwise closed, so the sidebar opens on a short list by
  // default instead of everything unfolded.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of GROUPS) {
      initial[group.id] = group.items.some((item) => item.path === location.pathname);
    }
    return initial;
  });

  const topItems = TOP_ITEMS.filter((item) => canSeeItem(role, item));
  const midItems = MID_ITEMS.filter((item) => canSeeItem(role, item));
  const settingsVisible = canSeeItem(role, SETTINGS_ITEM);

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
        {topItems.map((item) => (
          <NavItem key={item.id} item={item} open={open} indent={false} showIcon onNavigate={onNavigate} isLocked={isLocked} t={t} />
        ))}

        {midItems.map((item) => (
          <NavItem key={item.id} item={item} open={open} indent={false} showIcon onNavigate={onNavigate} isLocked={isLocked} t={t} />
        ))}

        {GROUPS.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            role={role}
            open={open}
            isOpen={!!openGroups[group.id]}
            onToggle={() => setOpenGroups((g) => ({ ...g, [group.id]: !g[group.id] }))}
            currentPath={location.pathname}
            onNavigate={onNavigate}
            isLocked={isLocked}
            t={t}
          />
        ))}

        {settingsVisible && (
          <>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "6px 4px" }} />
            <NavItem item={SETTINGS_ITEM} open={open} indent={false} showIcon onNavigate={onNavigate} isLocked={isLocked} t={t} />
          </>
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

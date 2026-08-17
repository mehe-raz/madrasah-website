// Roles & permissions now live in one place: server/src/config/roles.js.
// This file's ROLE_PERMISSIONS is auto-generated from that source — see
// scripts/sync-roles.js. Do not edit roles.generated.ts by hand.
import { ROLE_PERMISSIONS } from "./roles.generated";

export type Permission =
  | "dashboard"
  | "students"
  | "attendance"
  | "income"
  | "expenses"
  | "hifz"
  | "results"
  | "reports"
  | "settings"
  | "website"
  | "assignments"
  | "staff"
  | "staffAttendance";

const ROLE_PERMISSIONS_MAP: Record<string, readonly string[]> = ROLE_PERMISSIONS;

export function canAccess(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS_MAP[role] || [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

export function canManageUsers(role: string): boolean {
  return role === "Super Admin" || role === "Admin";
}

export function canBackup(role: string): boolean {
  return role === "Super Admin";
}

// Custom-domain is a billing-plan-level setting (Step 6), same sensitivity
// tier as backup/restore — restricted to Super Admin, same as canBackup.
export function canManageDomain(role: string): boolean {
  return role === "Super Admin";
}

export function canViewAuditLogs(role: string): boolean {
  return role === "Super Admin";
}

export function firstAllowedPath(role: string): string {
  const fallbackOrder: { permission: Permission; path: string }[] = [
    { permission: "dashboard", path: "/" },
    { permission: "attendance", path: "/attendance" },
    { permission: "hifz", path: "/hifz" },
    { permission: "results", path: "/results" },
    { permission: "assignments", path: "/assignments" },
    { permission: "students", path: "/students" },
    { permission: "income", path: "/income" },
    { permission: "expenses", path: "/expenses" },
    { permission: "reports", path: "/reports" },
    { permission: "settings", path: "/settings" },
  ];

  return fallbackOrder.find((item) => canAccess(role, item.permission))?.path || "/login";
}

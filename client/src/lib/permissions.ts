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
  | "website";

const ROLE_PERMISSIONS: Record<string, Permission[] | ["*"]> = {
  "Super Admin": ["*"],
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings", "website", "results"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["attendance", "hifz", "results"],
  "Hostel Manager": ["dashboard", "students", "attendance"],
};

export function canAccess(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  if ((perms as string[]).includes("*")) return true;
  return (perms as Permission[]).includes(permission);
}

export function canManageUsers(role: string): boolean {
  return role === "Super Admin" || role === "Admin";
}

export function canBackup(role: string): boolean {
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
    { permission: "students", path: "/students" },
    { permission: "income", path: "/income" },
    { permission: "expenses", path: "/expenses" },
    { permission: "reports", path: "/reports" },
    { permission: "settings", path: "/settings" },
  ];

  return fallbackOrder.find((item) => canAccess(role, item.permission))?.path || "/login";
}

export type Permission =
  | "dashboard"
  | "students"
  | "attendance"
  | "income"
  | "expenses"
  | "hifz"
  | "reports"
  | "settings";

const ROLE_PERMISSIONS: Record<string, Permission[] | ["*"]> = {
  "Super Admin": ["*"],
  Admin: ["dashboard", "students", "attendance", "income", "expenses", "hifz", "reports", "settings"],
  Accountant: ["dashboard", "income", "expenses", "reports"],
  Teacher: ["dashboard", "students", "attendance", "hifz"],
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

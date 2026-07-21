import type {
  AttendanceResponse,
  AuthUser,
  BackupConfig,
  DashboardData,
  DeleteRequest,
  Expense,
  GoogleDriveFile,
  GoogleDriveStatus,
  IncomeEntry,
  IncomeSummary,
  PaginatedResult,
  Payment,
  Settings,
  Student,
  User,
} from "../types";

const API = import.meta.env.VITE_API_URL || "/api";

function getToken() {
  return localStorage.getItem("madrasah-token");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem("madrasah-token");
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length) qs.set(key, String(value));
  });
  const q = qs.toString();
  return q ? `?${q}` : "";
}


function normalizePagedResponse<T>(value: unknown): PaginatedResult<T> {
  if (Array.isArray(value)) {
    return {
      items: value as T[],
      page: 1,
      limit: value.length,
      total: value.length,
      totalPages: 1,
    };
  }

  const obj = (value && typeof value === "object" ? value as Record<string, unknown> : {});
  const items = Array.isArray(obj.items) ? (obj.items as T[]) : Array.isArray(obj.data) ? (obj.data as T[]) : [];
  const page = Number(obj.page) || 1;
  const limit = Number(obj.limit) || (items.length || 1);
  const total = Number(obj.total) || items.length;
  const totalPages = Number(obj.totalPages) || Math.max(1, Math.ceil(total / Math.max(1, limit)));

  return { items, page, limit, total, totalPages };
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  login: (email: string, password: string) =>
    request<{ user: AuthUser; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ user: AuthUser; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  me: () => request<{ user: AuthUser }>("/auth/me"),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; resetToken?: string; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  getDashboard: () => request<DashboardData>("/dashboard"),

  getStudents: (params?: { dept?: string; search?: string; status?: string; class?: string }) => {
    const q = buildQuery({ dept: params?.dept, search: params?.search, status: params?.status, class: params?.class });
    return request<Student[]>(`/students${q}`);
  },

  getStudentsPage: (params?: { dept?: string; search?: string; status?: string; class?: string; page?: number; limit?: number; fields?: "basic" | "full" }) => {
    const q = buildQuery({ dept: params?.dept, search: params?.search, status: params?.status, class: params?.class, page: params?.page, limit: params?.limit, fields: params?.fields });
    return request<unknown>(`/students${q}`).then((value) => normalizePagedResponse<Student>(value));
  },

  getStudentsBasic: (params?: { dept?: string; search?: string; status?: string; class?: string }) => {
    const q = buildQuery({ dept: params?.dept, search: params?.search, status: params?.status, class: params?.class, page: 1, limit: 1000, fields: "basic" });
    return request<unknown>(`/students${q}`).then((value) => normalizePagedResponse<Student>(value));
  },

  getClasses: () => request<string[]>("/students/classes/list"),

  getStudent: (id: number) => request<Student>(`/students/${id}`),

  getStudentAttendance: (id: number, params?: { month?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set("month", params.month);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return request<{
      from: string;
      to: string;
      records: { date: string; status: string }[];
      summary: { present: number; absent: number; late: number };
    }>(`/students/${id}/attendance${q ? `?${q}` : ""}`);
  },

  createStudent: (body: Partial<Student>) =>
    request<Student>("/students", { method: "POST", body: JSON.stringify(body) }),

  updateStudent: (id: number, body: Partial<Student>) =>
    request<Student>(`/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  uploadStudentDocuments: (id: number, documents: NonNullable<Student["documents"]>) =>
    request<Student>(`/students/${id}/documents`, { method: "PATCH", body: JSON.stringify({ documents }) }),

  deleteStudent: (id: number) =>
    request<{ ok: boolean }>(`/students/${id}`, { method: "DELETE" }),

  downloadStudentPdf: async (id: number, name: string) => {
    const token = getToken();
    const res = await fetch(`${API}/students/${id}/pdf`, {
      credentials: "include",
      headers: token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `student-${id}-${name.replace(/\s+/g, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },

  getAttendance: (params?: { date?: string; dept?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date) qs.set("date", params.date);
    if (params?.dept) qs.set("dept", params.dept);
    const q = qs.toString();
    return request<AttendanceResponse>(`/attendance${q ? `?${q}` : ""}`);
  },

  saveAttendance: (records: { studentId: number; status: string }[], date?: string) =>
    request<{ ok: boolean }>("/attendance", {
      method: "POST",
      body: JSON.stringify({ date, records }),
    }),

  getPayments: () => request<Payment[]>("/payments"),

  getPaymentsPage: (params?: { page?: number; limit?: number }) => {
    const q = buildQuery({ page: params?.page, limit: params?.limit });
    return request<unknown>(`/payments${q}`).then((value) => normalizePagedResponse<Payment>(value));
  },

  createPayment: (body: { studentId: number; amount: number; method: string }) =>
    request<Payment>("/payments", { method: "POST", body: JSON.stringify(body) }),

  getIncomeCategories: () => request<string[]>("/income/categories"),

  saveIncomeCategories: (categories: string[]) =>
    request<string[]>("/income/categories", { method: "PUT", body: JSON.stringify({ categories }) }),

  getIncome: (params?: { from?: string; to?: string }) => {
    const q = buildQuery({ from: params?.from, to: params?.to });
    return request<IncomeEntry[]>(`/income${q}`);
  },

  getIncomePage: (params?: { from?: string; to?: string; category?: string; page?: number; limit?: number }) => {
    const q = buildQuery({ from: params?.from, to: params?.to, category: params?.category, page: params?.page, limit: params?.limit });
    return request<unknown>(`/income${q}`).then((value) => normalizePagedResponse<IncomeEntry>(value));
  },

  getIncomeSummary: (params?: { from?: string; to?: string }) => {
    const q = buildQuery({ from: params?.from, to: params?.to });
    return request<IncomeSummary>(`/income/summary${q}`);
  },

  createIncome: (body: {
    category: string;
    amount: number;
    note?: string;
    method?: string;
    studentId?: number;
    date?: string;
  }) => request<IncomeEntry>("/income", { method: "POST", body: JSON.stringify(body) }),

  updateIncome: (id: number, body: Partial<IncomeEntry>) =>
    request<IncomeEntry>(`/income/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteIncome: (id: number) =>
    request<{ ok: boolean; pendingApproval?: boolean; request?: DeleteRequest }>(`/income/${id}`, { method: "DELETE" }),

  getExpenses: (params?: { from?: string; to?: string }) => {
    const q = buildQuery({ from: params?.from, to: params?.to });
    return request<Expense[]>(`/expenses${q}`);
  },

  getExpensesPage: (params?: { from?: string; to?: string; page?: number; limit?: number }) => {
    const q = buildQuery({ from: params?.from, to: params?.to, page: params?.page, limit: params?.limit });
    return request<PaginatedResult<Expense>>(`/expenses${q}`);
  },

  getReportAttendance: (from: string, to: string) =>
    request<{ from: string; to: string; rows: { date: string; status: string; name: string; roll: string; class: string; dept: string }[] }>(
      `/reports/attendance?from=${from}&to=${to}`
    ),

  createExpense: (body: { cat: string; amount: number; note?: string }) =>
    request<Expense>("/expenses", { method: "POST", body: JSON.stringify(body) }),

  deleteExpense: (id: number) =>
    request<{ ok: boolean; pendingApproval?: boolean; request?: DeleteRequest }>(`/expenses/${id}`, { method: "DELETE" }),

  getDeleteRequests: () => request<DeleteRequest[]>("/delete-requests"),

  approveDeleteRequest: (id: number) =>
    request<{ ok: boolean; deleted: boolean }>(`/delete-requests/${id}/approve`, { method: "POST" }),

  rejectDeleteRequest: (id: number) =>
    request<{ ok: boolean }>(`/delete-requests/${id}/reject`, { method: "POST" }),

  getHifzStudents: () => request<Student[]>("/hifz"),

  updatePara: (studentId: number, para: number) =>
    request<Student>(`/hifz/${studentId}/para`, {
      method: "PATCH",
      body: JSON.stringify({ para }),
    }),

  saveSabaq: (studentId: number, sabaq: string) =>
    request(`/hifz/${studentId}/sabaq`, {
      method: "POST",
      body: JSON.stringify({ sabaq }),
    }),

  getSettings: () => request<Settings>("/settings"),

  saveSettings: (settings: Settings) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),

  getUsers: () => request<User[]>("/users"),

  uploadFile: (dataUrl: string, folder: string) =>
    request<{ url: string; publicId: string }>("/uploads", { method: "POST", body: JSON.stringify({ dataUrl, folder }) }),

  createUser: (body: { name: string; role: string; email: string; password: string }) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(body) }),

  updateUser: (id: number, body: { name?: string; role?: string; email?: string; password?: string }) =>
    request<User | { ok: boolean; pendingApproval?: boolean; request?: DeleteRequest }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteUser: (id: number) =>
    request<{ ok: boolean; pendingApproval?: boolean; request?: DeleteRequest }>(`/users/${id}`, { method: "DELETE" }),

  downloadBackup: async () => {
    const token = getToken();
    const res = await fetch(`${API}/backup`, {
      credentials: "include",
      headers: token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Backup failed");
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match ? match[1] : `madrasah-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  getBackupConfig: () => request<BackupConfig>("/backup/config"),

  saveBackupConfig: (body: BackupConfig) =>
    request<BackupConfig>("/backup/config", { method: "PUT", body: JSON.stringify(body) }),

  runBackupNow: () => request<{ filename: string; localPath: string; config: BackupConfig }>("/backup/run", { method: "POST" }),

  previewBackup: async (file: File) => {
    const token = getToken();
    const res = await fetch(`${API}/backup/preview`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { exportedAt: string | null; backupCounts: Record<string, number>; currentCounts: Record<string, number> };
  },

  previewGoogleDriveBackup: (fileId: string) =>
    request<{ exportedAt: string | null; backupCounts: Record<string, number>; currentCounts: Record<string, number> }>(
      `/backup/google/preview/${fileId}`
    ),

  restoreBackup: async (file: File) => {
    const token = getToken();
    const res = await fetch(`${API}/backup/restore`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(token && token !== "cookie" ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { ok: boolean; message: string };
  },

  getGoogleDriveStatus: () => request<GoogleDriveStatus>("/backup/google/status"),

  getGoogleDriveAuthUrl: () => request<{ url: string }>("/backup/google/auth-url"),

  disconnectGoogleDrive: () => request<GoogleDriveStatus>("/backup/google/disconnect", { method: "POST" }),

  listGoogleDriveFiles: () => request<GoogleDriveFile[]>("/backup/google/files"),

  restoreFromGoogleDrive: (fileId: string) =>
    request<{ ok: boolean; message: string }>(`/backup/google/restore/${fileId}`, { method: "POST" }),
};

import type {
  AdmissionApplication,
  AdmissionApplicationInput,
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
  PublicResult,
  PublicSettings,
  ResultStudentOption,
  ResultSubjectMark,
  Settings,
  SiteContent,
  Student,
  StudentResult,
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
    const qs = new URLSearchParams();
    if (params?.dept) qs.set("dept", params.dept);
    if (params?.search) qs.set("search", params.search);
    if (params?.status) qs.set("status", params.status);
    if (params?.class) qs.set("class", params.class);
    const q = qs.toString();
    return request<Student[]>(`/students${q ? `?${q}` : ""}`);
  },

  getClasses: () => request<string[]>("/students/classes/list"),

  // Lightweight, paginated student list (LIST_COLUMNS only, no documents
  // JSONB) for screens like Fees/Income that just need id/name/roll/class
  // for a dropdown rather than the full admission record.
  getStudentsBasic: (params?: { dept?: string; search?: string; status?: string; class?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.dept) qs.set("dept", params.dept);
    if (params?.search) qs.set("search", params.search);
    if (params?.status) qs.set("status", params.status);
    if (params?.class) qs.set("class", params.class);
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 100));
    return request<PaginatedResult<Student>>(`/students?${qs.toString()}`);
  },

  getStudent: (id: number) => request<Student>(`/students/${id}`),

  getStudentAttendance: (id: number, params?: { month?: string; from?: string; to?: string; all?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set("month", params.month);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.all) qs.set("all", "true");
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

  // Paginated payments list for the Fees screen's history table.
  getPaymentsPage: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 25));
    return request<PaginatedResult<Payment>>(`/payments?${qs.toString()}`);
  },

  createPayment: (body: { studentId: number; amount: number; method: string }) =>
    request<Payment>("/payments", { method: "POST", body: JSON.stringify(body) }),

  getIncomeCategories: () => request<string[]>("/income/categories"),

  saveIncomeCategories: (categories: string[]) =>
    request<string[]>("/income/categories", { method: "PUT", body: JSON.stringify({ categories }) }),

  getIncome: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return request<IncomeEntry[]>(`/income${q ? `?${q}` : ""}`);
  },

  // Totals + by-category breakdown for the Income screen's summary cards.
  getIncomeSummary: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return request<IncomeSummary>(`/income/summary${q ? `?${q}` : ""}`);
  },

  // Paginated income list for the Income screen's table (supports the same
  // category filter as getIncome, plus page/limit).
  getIncomePage: (params?: { page?: number; limit?: number; category?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 25));
    if (params?.category) qs.set("category", params.category);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return request<PaginatedResult<IncomeEntry>>(`/income?${qs.toString()}`);
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
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return request<Expense[]>(`/expenses${q ? `?${q}` : ""}`);
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

  // Management: minimal student lookup (id/name/roll/class only) for the
  // marks-entry screen. Gated by the "results" permission, not "students",
  // so Teacher-role users can use it without the broader students access.
  getResultClasses: () => request<string[]>("/results/classes"),

  getResultStudents: (className: string) => request<ResultStudentOption[]>(`/results/students?class=${encodeURIComponent(className)}`),

  getResults: (params: { class?: string; examName?: string; year?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<StudentResult[]>(`/results${qs ? `?${qs}` : ""}`);
  },

  saveResult: (body: {
    studentId: number;
    examName: string;
    year: string;
    subjects: ResultSubjectMark[];
    gpa?: string;
    grade?: string;
  }) => request<StudentResult>("/results", { method: "POST", body: JSON.stringify(body) }),

  setResultPublished: (id: number, published: boolean) =>
    request<StudentResult>(`/results/${id}/publish`, { method: "PATCH", body: JSON.stringify({ published }) }),

  deleteResult: (id: number) => request<void>(`/results/${id}`, { method: "DELETE" }),

  // Public: no login required. Powers the "ফলাফল দেখুন" page. Exact
  // class + roll match only, server enforces its own rate limit.
  searchPublicResults: (params: { class: string; roll: string; examName?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<PublicResult[]>(`/public/results?${qs}`);
  },

  getSettings: () => request<Settings>("/settings"),

  saveSettings: (settings: Settings) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),

  // Public: no login required. Powers both the logged-out visitor page and
  // the admin website-control form's initial load.
  getPublicSiteContent: () => request<SiteContent>("/public/site-content"),

  // Public: no login required. Institution name/logo/address/phone/email/
  // footer for the logged-out visitor page — see PublicSettings type.
  getPublicSettings: () => request<PublicSettings>("/public/settings"),

  // Admin / Super Admin only (enforced server-side by the "website" permission).
  saveSiteContent: (content: SiteContent) =>
    request<SiteContent>("/site-content", { method: "PUT", body: JSON.stringify(content) }),

  // Public: no login required. Submits the "ভর্তি" (admission) form from
  // the marketing site. Server enforces its own rate limit + validation.
  submitAdmission: (body: AdmissionApplicationInput) =>
    request<AdmissionApplication>("/public/admissions", { method: "POST", body: JSON.stringify(body) }),

  getUsers: () => request<User[]>("/users"),

  uploadFile: (dataUrl: string, folder: string) =>
    request<{ url: string; publicId: string }>("/uploads", { method: "POST", body: JSON.stringify({ dataUrl, folder }) }),

  // Deletes an asset from Cloudinary storage by publicId (returned from
  // uploadFile above). Used when the admin removes a gallery photo so the
  // file doesn't keep sitting in storage, unreferenced, forever.
  deleteUpload: (publicId: string, resourceType?: string) =>
    request<{ ok: boolean; result: string }>("/uploads", {
      method: "DELETE",
      body: JSON.stringify({ publicId, resourceType }),
    }),

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

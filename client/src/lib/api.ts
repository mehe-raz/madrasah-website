import type {
  AdmissionApplication,
  AdmissionApplicationInput,
  AttendanceResponse,
  AuditLog,
  AuditLogMeta,
  AuthUser,
  BackupConfig,
  ClassOption,
  ClassPost,
  ClassTreeNode,
  DashboardData,
  DeleteRequest,
  Expense,
  GoogleDriveFile,
  GoogleDriveStatus,
  GuardianAttendanceResponse,
  GuardianChild,
  GuardianDashboardData,
  GuardianMessage,
  GuardianReminder,
  GuardianUser,
  IncomeEntry,
  IncomeSummary,
  Notification,
  PaginatedResult,
  Payment,
  PublicResult,
  PublicSettings,
  ResultStudentOption,
  ResultSubjectMark,
  Settings,
  SiteContent,
  BkashCheckoutStart,
  PaymentGatewayStatus,
  SmsNotificationPrefs,
  SmsWallet,
  Student,
  StudentResult,
  User,
} from "../types";
import { cacheGetResponse, getCachedGetResponse } from "./offlineCache";
import { enqueueOutboxEntry } from "./offlineDb";

const API = import.meta.env.VITE_API_URL || "/api";

// Defense-in-depth CSRF protection (double-submit cookie) — see
// server/src/middleware/csrf.js. The server sets a readable `csrfToken`
// cookie on every response; we just echo its current value back as a
// header on every request that carries the auth cookie. A cross-site
// attacker can trigger the request but, per same-origin policy, can't read
// this cookie to forge a matching header.
function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Phase 0 of the offline-first work: every mutating request now carries a
// client-generated id, whether or not the offline queue (a later phase)
// ever touches it. The server's idempotency middleware
// (server/src/middleware/idempotency.js) uses this to recognize "this exact
// request was already processed" if a flaky connection causes a retry — so
// wiring it in now, before any form actually queues offline, means later
// phases only have to add the enqueue call, not touch this plumbing.
function generateClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Thrown only when fetch() itself failed to complete a round trip (offline,
// DNS failure, connection refused) — never for an HTTP error response that
// did reach the server. requestOrQueue() below relies on this distinction
// to decide whether a failed mutation is safe to queue for later retry: an
// HTTP 400/403/etc is a definitive answer already, so queuing it would just
// fail again identically once synced.
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "NetworkError";
  }
}

async function request<T>(path: string, options?: RequestInit & { clientRequestId?: string }): Promise<T> {
  // Pulled out separately (rather than left inside the spread below) so a
  // caller-supplied id — used by requestOrQueue() to keep the SAME id
  // between the live attempt and the outbox entry — always wins, and so it
  // never leaks into the native fetch() call as a stray RequestInit key.
  const { clientRequestId: explicitClientRequestId, ...fetchOptions } = options ?? {};
  const csrfToken = readCsrfToken();
  const method = (fetchOptions.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...fetchOptions,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...(isMutation ? { "X-Client-Request-Id": explicitClientRequestId ?? generateClientRequestId() } : {}),
        ...fetchOptions.headers,
      },
    });
  } catch (networkError) {
    // fetch() itself throwing (as opposed to resolving with a non-ok
    // status) means there was no round trip at all — offline, DNS failure,
    // connection refused. Only THIS case falls back to the cache; a real
    // HTTP error response from a reachable server should never be masked
    // by stale data (see the res.ok check below, which does not fall back).
    if (!isMutation) {
      const cached = await getCachedGetResponse<T>(path);
      if (cached) return cached.value;
    }
    throw new NetworkError(networkError);
  }

  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  if (!isMutation) {
    // Fire-and-forget: caching is a courtesy for the next offline visit,
    // never something the current request should wait on or fail over.
    cacheGetResponse(path, data).catch(() => {});
  }
  return data;
}

export interface QueuedResult<T> {
  /** null when queued — nothing came back from the server yet. */
  data: T | null;
  /** true if this was saved to the offline outbox instead of reaching the
   *  server; the caller (see modules/Attendance.tsx) should show a "pending
   *  sync" state rather than treating it as a normal success. */
  queued: boolean;
}

/**
 * Offline-first Phase 3: for mutations where losing connectivity mid-submit
 * shouldn't be a hard failure — currently only attendance, since its
 * ON CONFLICT upsert makes a retried save safe to resend as-is (see
 * server/src/routes/attendance.js). Admission and payment forms still call
 * `request()` directly and fail normally offline; they need their own
 * conflict-handling (temporary numbers, 409 review flagging — Phases 4/5)
 * before it's safe to queue them the same way.
 *
 * The SAME clientRequestId is used for the live attempt and, if that fails
 * with a NetworkError, the outbox entry — so when offlineSync.ts resends it
 * later, the server's idempotency middleware recognizes it as the same
 * request rather than creating a duplicate, even if the live attempt had
 * actually reached the server before the connection dropped.
 */
// Phase 6 kill-switch: set VITE_OFFLINE_QUEUE_ENABLED=false (and redeploy)
// to instantly revert every screen that calls requestOrQueue back to
// "fails normally when offline, nothing queues" — the pre-Phase-3
// behavior — without a code change. Meant for the staged rollout in
// docs/OFFLINE_FIRST_TESTING.md: if the sync/flag mechanism itself turns
// out to have a problem, this is the fast rollback lever while a real fix
// is prepared.
const OFFLINE_QUEUE_ENABLED = import.meta.env.VITE_OFFLINE_QUEUE_ENABLED !== "false";

async function requestOrQueue<T>(path: string, method: string, body: unknown): Promise<QueuedResult<T>> {
  const clientRequestId = generateClientRequestId();
  try {
    const data = await request<T>(path, {
      method,
      body: JSON.stringify(body),
      clientRequestId,
    });
    return { data, queued: false };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    if (!OFFLINE_QUEUE_ENABLED) throw e;
    await enqueueOutboxEntry({ clientRequestId, path, method, body });
    return { data: null, queued: true };
  }
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  login: (email: string, password: string) =>
    request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ user: AuthUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  me: () => request<{ user: AuthUser }>("/auth/me"),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>("/auth/forgot-password", {
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
  // dueOnly + the returned totalDue are for the Fees "Due" tab: filters to
  // due>0 in SQL and returns the SUM(due) across every matching row (not
  // just the current page), so a school with hundreds of students gets an
  // accurate total instead of one summed from a single capped page.
  getStudentsBasic: (params?: { dept?: string; search?: string; status?: string; class?: string; page?: number; limit?: number; dueOnly?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.dept) qs.set("dept", params.dept);
    if (params?.search) qs.set("search", params.search);
    if (params?.status) qs.set("status", params.status);
    if (params?.class) qs.set("class", params.class);
    if (params?.dueOnly) qs.set("dueOnly", "1");
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 100));
    return request<PaginatedResult<Student> & { totalDue?: number }>(`/students?${qs.toString()}`);
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

  // Offline-first Phase 4: admission can be queued when there's no
  // connection, unlike createStudent above. Safe to queue because the
  // server (a) assigns the real roll/admission number itself rather than
  // trusting one from the client, and (b) re-runs its duplicate check at
  // sync time and returns 409 rather than silently overwriting — see
  // server/src/routes/students.js and offlineSync.ts's 4xx handling, which
  // keeps a 409'd entry around as "failed" for modules/Students.tsx's
  // review panel instead of discarding it.
  createStudentOrQueue: (body: Partial<Student>) => requestOrQueue<Student>("/students", "POST", body),

  updateStudent: (id: number, body: Partial<Student>) =>
    request<Student>(`/students/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  uploadStudentDocuments: (id: number, documents: NonNullable<Student["documents"]>) =>
    request<Student>(`/students/${id}/documents`, { method: "PATCH", body: JSON.stringify({ documents }) }),

  deleteStudent: (id: number) =>
    request<{ ok: boolean }>(`/students/${id}`, { method: "DELETE" }),

  createGuardianAccountForStudent: (id: number) =>
    request<{ ok: boolean; mobile: string; password: string | null; message: string }>(
      `/students/${id}/guardian-account`,
      { method: "POST" }
    ),

  downloadStudentPdf: async (id: number, name: string) => {
    const res = await fetch(`${API}/students/${id}/pdf`, {
      credentials: "include",
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
    requestOrQueue<{ ok: boolean; date?: string }>("/attendance", "POST", { date, records }),

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

  // Offline-first Phase 5: fee collection can be queued the same way as
  // admission (Phase 4, see createStudentOrQueue). The client only queues
  // and later re-fetches — server/src/routes/payments.js decides at sync
  // time whether the payment is safe to auto-process or needs Super
  // Admin/Admin review (see its isConflict check).
  createPaymentOrQueue: (body: { studentId: number; amount: number; method: string }) =>
    requestOrQueue<Payment>("/payments", "POST", body),

  getFlaggedPayments: () => request<Payment[]>("/payments/flagged"),

  // Manual/on-demand fee-due-reminder (BUSINESS_READINESS_ROADMAP.md Phase
  // 8D) — SMSes every student's guardian who currently has due > 0.
  // Best-effort on the server (never fails per-student), so this just
  // reports how many were attempted/sent for the caller to show a summary.
  sendDueReminders: () =>
    request<{ totalDue: number; sent: number; noPhone: number; notSent: number }>(
      "/payments/send-due-reminders",
      { method: "POST" }
    ),

  resolvePaymentFlag: (id: number, action: "confirm" | "void") =>
    request<{ ok: boolean; status: string }>(`/payments/${id}/resolve-flag`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

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

  // Totals + by-category breakdown for the Expenses screen's summary cards.
  getExpensesSummary: (params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return request<IncomeSummary>(`/expenses/summary${q ? `?${q}` : ""}`);
  },

  // Paginated expense list for the Expenses screen's table.
  getExpensesPage: (params?: { page?: number; limit?: number; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 25));
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return request<PaginatedResult<Expense>>(`/expenses?${qs.toString()}`);
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

  // Class-broadcast (Phase 3): Teacher/Admin/Super Admin composing
  // notice/assignment/message posts to their classes. Gated by the
  // "assignments" permission — see server/src/routes/assignments.js. The
  // guardian-facing read side lives under `api.guardian` below instead
  // (getFeed/markFeedRead), since it needs a guardian session.
  getAssignmentClasses: () => request<string[]>("/assignments/classes"),

  getClassPosts: (params: { class?: string; type?: ClassPost["type"] } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<ClassPost[]>(`/assignments${qs ? `?${qs}` : ""}`);
  },

  createClassPost: (body: { type: ClassPost["type"]; class: string; title: string; body?: string }) =>
    request<ClassPost>("/assignments", { method: "POST", body: JSON.stringify(body) }),

  deleteClassPost: (id: number) => request<{ ok: boolean }>(`/assignments/${id}`, { method: "DELETE" }),

  // Guardian Reminder Messenger (ad-hoc, docs/CURRENT_TASK.md) — admin
  // side of guardian_reminders. Gated by the "settings" permission (see
  // server/src/config/roles.js's ROUTE_PERMISSION entry). The
  // guardian-facing read side lives under `api.guardian` below instead
  // (getMessages/markMessageRead), since it needs a guardian session.
  getGuardianReminders: () => request<GuardianReminder[]>("/guardian-reminders"),

  createGuardianReminder: (body: {
    title: string;
    body: string;
    targetType: GuardianReminder["targetType"];
    targetClass?: string;
    targetStudentId?: number;
    scheduleType: GuardianReminder["scheduleType"];
    scheduleDate?: string;
  }) => request<GuardianReminder>("/guardian-reminders", { method: "POST", body: JSON.stringify(body) }),

  toggleGuardianReminder: (id: number, active: boolean) =>
    request<GuardianReminder>(`/guardian-reminders/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),

  deleteGuardianReminder: (id: number) => request<{ ok: boolean }>(`/guardian-reminders/${id}`, { method: "DELETE" }),

  // Manual/on-demand dispatch button — see routes/guardianReminders.js's
  // POST /dispatch. Safe to press any time: dispatchDueReminders() is
  // same-day-dedup'd against the automatic periodic sweep.
  dispatchGuardianReminders: () =>
    request<{ dispatched: { reminderId: number; title: string; count: number }[] }>("/guardian-reminders/dispatch", {
      method: "POST",
    }),

  // Public: no login required. Powers the "ফলাফল দেখুন" page. Exact
  // class + roll match only, server enforces its own rate limit.
  searchPublicResults: (params: { class: string; roll: string; examName?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<PublicResult[]>(`/public/results?${qs}`);
  },

  getSettings: () => request<Settings>("/settings"),

  saveSettings: (settings: Settings) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),

  // Class/jamaat master list — read by anyone who can reach the admission
  // form (Students module), written by Super Admin only (server enforces
  // this; see routes/classOptions.js).
  getClassOptions: () => request<ClassOption[]>("/class-options"),

  saveClassOptions: (options: Pick<ClassOption, "bn" | "en">[]) =>
    request<ClassOption[]>("/class-options", { method: "PUT", body: JSON.stringify({ options }) }),

  // Hierarchical replacement for the two calls above — see
  // server/src/routes/classTree.js. Both stay mounted side by side during
  // the rollout (Part 2 of the class/jamaat hierarchy work); Students.tsx
  // and Settings.tsx are moving to this one.
  getClassTree: () => request<ClassTreeNode[]>("/class-tree"),

  saveClassTree: (tree: ClassTreeNode[]) =>
    request<ClassTreeNode[]>("/class-tree", { method: "PUT", body: JSON.stringify({ tree }) }),

  // Multi-tenant only (404s on a single-tenant deployment — see
  // requireTenantContext in routes/settings.js). Powers the "ডোমেইন
  // কানেক্ট করুন" section: which plan the institution is on, what that
  // plan allows, and the currently-set custom domain (if any).
  getPlan: () => request<{ plan: string; features: { customDomain: boolean }; customDomain: string | null }>("/settings/plan"),

  // Multi-tenant only (404s on a single-tenant deployment, same reasoning
  // as getPlan above). Unlike getPlan (Admin/Super-Admin only, "settings"
  // permission), this hits the separate GET /api/plan route — reachable by
  // every authenticated role — so PlanFeatureGate/Sidebar can lock a
  // Teacher's or Accountant's own pages too, not just the domain section
  // an Admin sees. features covers all plan-gated keys (not just
  // customDomain); featureMeta carries Bengali labels + comingSoon flags
  // so the client never hand-duplicates server/src/config/planFeatures.js's
  // FEATURE_META.
  getPlanFeatures: () =>
    request<{
      plan: string;
      features: Record<string, boolean>;
      featureMeta: Record<string, { label: string; comingSoon: boolean; minPlan: string | null }>;
      planOrder: string[];
    }>("/plan"),

  // Send "" or null to clear the custom domain. Rejected server-side
  // (403) if the institution's plan doesn't include customDomain, even if
  // the button is somehow clicked while locked.
  setCustomDomain: (customDomain: string) =>
    request<{ customDomain: string | null }>("/settings/custom-domain", {
      method: "PUT",
      body: JSON.stringify({ customDomain }),
    }),

  // Public: no login required. Powers the logged-out visitor page (always
  // the published/live copy).
  getPublicSiteContent: () => request<SiteContent>("/public/site-content"),

  // Public: no login required. Institution name/logo/address/phone/email/
  // footer for the logged-out visitor page — see PublicSettings type.
  getPublicSettings: () => request<PublicSettings>("/public/settings"),

  // Public: no login required. Same tenant class/jamaat master list as
  // getClassOptions() above, served from server/src/index.js's
  // /api/public/class-options so the logged-out AdmissionApply page's class
  // dropdown always matches what Super Admin configured in Settings —
  // instead of the separate, easy-to-drift content.classes CMS list.
  getPublicClassOptions: () => request<ClassOption[]>("/public/class-options"),

  // Public: no login required — hierarchical equivalent of the call above,
  // for the logged-out AdmissionApply page's cascading class picker (see
  // server/src/index.js's /api/public/class-tree).
  getPublicClassTree: () => request<ClassTreeNode[]>("/public/class-tree"),

  // Public: no login required. Static tier/feature marketing data for the
  // /pricing page — see server/src/index.js's /api/public/plan-tiers
  // (mirrors server/src/config/planFeatures.js, no per-institution data).
  getPublicPlanTiers: () =>
    request<{
      planFeatures: Record<string, Record<string, boolean>>;
      planOrder: string[];
      featureMeta: Record<string, { label: string; comingSoon: boolean }>;
    }>("/public/plan-tiers"),

  // Admin / Super Admin only. Loads the section editor's *draft* copy —
  // in-progress edits nobody outside the admin panel can see yet.
  getDraftSiteContent: () => request<SiteContent>("/site-content"),

  // Admin / Super Admin only (enforced server-side by the "website"
  // permission). Saves to the draft copy — the public site is untouched
  // until publishSiteContent() below is called.
  saveSiteContent: (content: SiteContent) =>
    request<SiteContent>("/site-content", { method: "PUT", body: JSON.stringify(content) }),

  // Admin / Super Admin only, and requires full "website" access even for
  // editors otherwise scoped to just gallery/notices. Copies the current
  // draft live so visitors see it.
  publishSiteContent: () => request<SiteContent>("/site-content/publish", { method: "POST" }),

  // Public: no login required. Submits the "ভর্তি" (admission) form from
  // the marketing site. Server enforces its own rate limit + validation.
  submitAdmission: (body: AdmissionApplicationInput) =>
    request<AdmissionApplication>("/public/admissions", { method: "POST", body: JSON.stringify(body) }),

  // Admin / Super Admin only (enforced server-side by the "website" permission)
  // — review queue for submitted admission applications.
  getAdmissions: () => request<AdmissionApplication[]>("/admissions"),

  updateAdmissionStatus: (id: number, status: string) =>
    request<AdmissionApplication>(`/admissions/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // In-app notification center: new admissions, delete requests, and their
  // resolutions. Visibility is scoped server-side to the logged-in user's
  // role/id, so no permission gating needed on the client.
  getNotifications: (limit?: number) => request<Notification[]>(`/notifications${limit ? `?limit=${limit}` : ""}`),

  getUnreadNotificationCount: () => request<{ count: number }>("/notifications/unread-count"),

  markNotificationRead: (id: number) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST" }),

  markAllNotificationsRead: () => request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),

  getUsers: () => request<User[]>("/users"),

  getPendingGuardianApprovals: () =>
    request<{
      accounts: Array<{
        id: number;
        name: string;
        mobile: string | null;
        email: string | null;
        status: string;
        createdAt: string;
        students: Array<{ id: number; name: string; roll: string; class: string; matchCount: number | null }>;
      }>;
      childLinks: Array<{
        guardianId: number;
        studentId: number;
        status: string;
        matchCount: number | null;
        createdAt: string;
        guardianName: string;
        mobile: string | null;
        email: string | null;
        studentName: string;
        studentRoll: string;
        studentClass: string;
      }>;
    }>("/guardian-approvals/pending"),

  reviewGuardianAccount: (id: number, action: "approve" | "reject") =>
    request<{ ok: boolean; status: string }>(`/guardian-approvals/accounts/${id}/${action}`, { method: "POST" }),

  reviewGuardianChildLink: (guardianId: number, studentId: number, action: "approve" | "reject") =>
    request<{ ok: boolean; status: string }>(`/guardian-approvals/child-links/${guardianId}/${studentId}/${action}`, { method: "POST" }),

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

  updateUserClasses: (id: number, classes: string[]) =>
    request<{ id: number; classes: string[] }>(`/users/${id}/classes`, { method: "PUT", body: JSON.stringify({ classes }) }),

  deleteUser: (id: number) =>
    request<{ ok: boolean; pendingApproval?: boolean; request?: DeleteRequest }>(`/users/${id}`, { method: "DELETE" }),

  downloadBackup: async () => {
    const res = await fetch(`${API}/backup`, {
      credentials: "include",
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
    const csrfToken = readCsrfToken();
    const res = await fetch(`${API}/backup/preview`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
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

  // `selectedTables`, when given, restricts the restore to just those
  // sections (the checkboxes in the restore preview) — leave it out/empty
  // to restore everything in the backup file, same as before.
  restoreBackup: async (file: File, selectedTables?: string[]) => {
    const csrfToken = readCsrfToken();
    const qs = selectedTables?.length ? `?tables=${encodeURIComponent(selectedTables.join(","))}` : "";
    const res = await fetch(`${API}/backup/restore${qs}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as { ok: boolean; message: string; report?: { selfAccountRestored?: boolean; googleDriveAuthStripped?: boolean; tables?: string[] } };
  },

  getGoogleDriveStatus: () => request<GoogleDriveStatus>("/backup/google/status"),

  getGoogleDriveAuthUrl: () => request<{ url: string }>("/backup/google/auth-url"),

  disconnectGoogleDrive: () => request<GoogleDriveStatus>("/backup/google/disconnect", { method: "POST" }),

  listGoogleDriveFiles: () => request<GoogleDriveFile[]>("/backup/google/files"),

  restoreFromGoogleDrive: (fileId: string, selectedTables?: string[]) => {
    const qs = selectedTables?.length ? `?tables=${encodeURIComponent(selectedTables.join(","))}` : "";
    return request<{ ok: boolean; message: string; report?: { selfAccountRestored?: boolean; googleDriveAuthStripped?: boolean; tables?: string[] } }>(
      `/backup/google/restore/${fileId}${qs}`,
      { method: "POST" }
    );
  },

  // Super Admin-only audit log feed: filterable, paginated history of who
  // changed what (students, payments, expenses, users, settings, backups,
  // delete-request approvals, etc).
  getAuditLogs: (params?: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    search?: string;
    from?: string;
    to?: string;
  }) => {
    const qs = new URLSearchParams();
    qs.set("page", String(params?.page ?? 1));
    qs.set("limit", String(params?.limit ?? 50));
    if (params?.action) qs.set("action", params.action);
    if (params?.entityType) qs.set("entityType", params.entityType);
    if (params?.search) qs.set("search", params.search);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return request<PaginatedResult<AuditLog>>(`/audit-logs?${qs.toString()}`);
  },

  getAuditLogMeta: () => request<AuditLogMeta>("/audit-logs/meta"),

  // -------------------------------------------------------------------------
  // "SMS সেবা" settings page (BUSINESS_READINESS_ROADMAP.md Phase 8D) —
  // server/src/routes/sms.js. requirePlanFeature("sms")-gated on the
  // server; PlanFeatureGate feature="sms" wraps the /sms route on the
  // client (App.tsx) so a locked institution never even calls these.
  // -------------------------------------------------------------------------
  getSmsWallet: () => request<SmsWallet>("/sms/wallet"),

  updateSmsNotificationPrefs: (prefs: Partial<SmsNotificationPrefs>) =>
    request<{ notificationPrefs: SmsNotificationPrefs }>("/sms/notification-prefs", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),

  requestSmsTopup: (body: { amountTaka: number; trxId: string }) =>
    request<{ id: number }>("/sms/topup-request", { method: "POST", body: JSON.stringify(body) }),

  // -------------------------------------------------------------------------
  // bKash self-connect settings (BUSINESS_READINESS_ROADMAP.md Phase 8E) —
  // server/src/routes/paymentGateway.js. requirePlanFeature("bkash")-gated
  // on the server; PlanFeatureGate feature="bkash" wraps the /payment-
  // gateway route on the client (App.tsx).
  // -------------------------------------------------------------------------
  getPaymentGatewayStatus: () => request<PaymentGatewayStatus>("/payment-gateway/status"),

  connectPaymentGateway: (body: { appKey: string; appSecret: string; username: string; password: string }) =>
    request<{ connected: boolean; provider?: string; lastCheckedAt?: string; error?: string }>("/payment-gateway/connect", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  disconnectPaymentGateway: () =>
    request<{ connected: boolean }>("/payment-gateway/disconnect", { method: "POST" }),

  // Phase 8F — SMS wallet top-up via the connected bKash gateway (see
  // routes/sms.js). Admin-initiated, same create→execute shape as the
  // guardian fee-payment flow below.
  createSmsTopupViaGateway: (amountTaka: number) =>
    request<BkashCheckoutStart>("/sms/topup-via-gateway/create", {
      method: "POST",
      body: JSON.stringify({ amountTaka }),
    }),

  executeSmsTopupViaGateway: (paymentID: string) =>
    request<{ ok: boolean; amountTaka?: number; alreadyCompleted?: boolean; error?: string }>(
      "/sms/topup-via-gateway/execute",
      { method: "POST", body: JSON.stringify({ paymentID }) }
    ),

  // -------------------------------------------------------------------------
  // Guardian Portal (Step 5) — separate session/cookie from the staff `api.*`
  // calls above (see /api/guardian-auth on the server, GuardianAuthContext on
  // the client). All guardian-portal pages call through this namespace only.
  // -------------------------------------------------------------------------
  guardian: {
    signup: (body: {
      guardianName: string;
      contactMobile?: string;
      contactEmail?: string;
      password: string;
      studentName: string;
      studentRoll: string;
      studentClass: string;
      guardianMobile: string;
    }) =>
      request<{ ok: boolean; status: "active" | "pending"; message?: string; user?: GuardianUser }>(
        "/guardian-auth/signup",
        { method: "POST", body: JSON.stringify(body) }
      ),

    login: (identifier: string, password: string) =>
      request<{ user: GuardianUser }>("/guardian-auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      }),

    logout: () => request<{ ok: boolean }>("/guardian-auth/logout", { method: "POST" }),

    me: () => request<{ user: GuardianUser }>("/guardian-auth/me"),

    addChild: (body: { studentName: string; studentRoll: string; studentClass: string; guardianMobile: string }) =>
      request<{ ok: boolean; status: "active" | "pending"; message: string }>("/guardian-auth/children", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    getChildren: () => request<GuardianChild[]>("/guardian-auth/children"),

    getDashboard: () => request<GuardianDashboardData>("/guardian-auth/dashboard"),

    getAttendance: (studentId: number, month?: string) =>
      request<GuardianAttendanceResponse>(`/guardian-auth/students/${studentId}/attendance${month ? `?month=${month}` : ""}`),

    getResults: (studentId: number) => request<StudentResult[]>(`/guardian-auth/students/${studentId}/results`),

    getFeed: (type?: "notice" | "assignment" | "message") =>
      request<ClassPost[]>(`/guardian-auth/feed${type ? `?type=${type}` : ""}`),

    getFeedUnreadCount: () => request<{ count: number }>("/guardian-auth/feed/unread-count"),

    markFeedRead: (postId: number) => request<{ ok: boolean }>(`/guardian-auth/feed/${postId}/read`, { method: "POST" }),

    // Guardian Reminder Messenger (ad-hoc, docs/CURRENT_TASK.md) — read
    // side of admin-composed reminders. Same shape as getFeed/
    // getFeedUnreadCount/markFeedRead just above.
    getMessages: () => request<GuardianMessage[]>("/guardian-auth/messages"),

    getMessagesUnreadCount: () => request<{ count: number }>("/guardian-auth/messages/unread-count"),

    markMessageRead: (id: number) => request<{ ok: boolean }>(`/guardian-auth/messages/${id}/read`, { method: "POST" }),

    // Phase 8F — fee payment via the institution's own connected bKash
    // gateway (routes/guardianAuth.js's /students/:id/bkash/create + POST
    // /bkash/execute). Two-step: create() gets a checkout URL to redirect
    // to; execute() is called once bKash redirects back with a paymentID,
    // and is what actually finalizes the payment.
    createBkashPayment: (studentId: number, amount: number) =>
      request<BkashCheckoutStart>(`/guardian-auth/students/${studentId}/bkash/create`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      }),

    executeBkashPayment: (paymentID: string) =>
      request<{ ok: boolean; receipt?: string; newDue?: number; alreadyCompleted?: boolean; error?: string }>(
        "/guardian-auth/bkash/execute",
        { method: "POST", body: JSON.stringify({ paymentID }) }
      ),
  },
};

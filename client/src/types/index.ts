export interface Student {
  id: number;
  admissionNumber?: string;
  admissionDate?: string;
  academicYear?: string;
  session?: string;
  name: string;
  nameEn: string;
  dateOfBirth?: string;
  birthRegistrationNumber?: string;
  gender?: string;
  religion?: string;
  studentPhoto?: string;
  roll: string;
  class: string;
  section?: string;
  dept: string;
  type: string;
  fee: number;
  due: number;
  // Computed by the server (FLOOR(due/fee), NULL-safe for fee=0) on every
  // GET /api/students response — see server/src/routes/students.js.
  monthsUnpaid?: number;
  admissionFee?: number;
  discount?: number;
  phone: string;
  blood: string;
  para: number;
  status: string;
  fatherName?: string;
  fatherMobile?: string;
  fatherOccupation?: string;
  motherName?: string;
  motherMobile?: string;
  motherOccupation?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianMobile?: string;
  presentAddress?: string;
  permanentAddress?: string;
  district?: string;
  upazila?: string;
  postOffice?: string;
  village?: string;
  previousInstitution?: string;
  previousClass?: string;
  documents?: StudentDocuments;
  // docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2 — optional, set
  // once a student is enrolled on an attendance device (typed manually via
  // Phase 2B's form fields, or auto-filled by Phase 2C's scan-to-enroll
  // mode). Matches server/src/models/studentAdmission.js's TEXT_FIELDS.
  fingerprintId?: string;
  cardUid?: string;
  att?: string;
  attendanceSummary?: {
    total: number;
    present: number;
    absent: number;
    late: number;
  };
}

export interface StudentDocuments {
  studentPhoto?: string;
  birthCertificate?: string;
  guardianNid?: string;
  previousCertificate?: string;
}

export interface Payment {
  id: number;
  studentId?: number;
  student: string;
  roll: string;
  category?: string;
  description?: string;
  amount: number;
  date: string;
  receipt: string;
  method: string;
  status: string;
  /** Only set when status is "Flagged" — why it needs Super Admin/Admin review (see payments.js). */
  flagReason?: string;
}

export interface IncomeEntry {
  id: number;
  category: string;
  amount: number;
  date: string;
  note: string;
  method: string;
  receipt: string;
  studentId?: number | null;
  student?: string;
  roll?: string;
  status: string;
}

export interface Expense {
  id: number;
  cat: string;
  amount: number;
  date: string;
  note: string;
}

export interface DeleteRequest {
  id: number;
  entityType: "income" | "expense" | "payment-delete" | "user-update" | "user-delete";
  entityId: number;
  label: string;
  amount: number;
  requestedByName: string;
  status: string;
  createdAt: string;
}

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number;
  keepLocalCopies: number;
  keepDriveCopies: number;
  destinations: string[];
  lastRunAt?: string;
  driveEncryptionEnabled?: boolean;
}

export interface GoogleDriveStatus {
  configured: boolean;
  connected: boolean;
  accountEmail: string;
  folderLink: string;
  connectedAt: string;
  lastUploadAt: string;
  lastUploadError: string;
}

export interface IncomeSummary {
  total: number;
  count: number;
  byCategory: { cat: string; total: number }[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
}

export interface Settings {
  name: string;
  address: string;
  phone: string;
  email: string;
  footer: string;
  currency: string;
  lang: string;
  theme: string;
  logo?: string;
  brandColor?: string;
  backupConfig?: string;
}

// The small, whitelisted subset of Settings that /api/public/settings
// exposes to logged-out visitors (see server/src/lib/publicSettings.js).
export interface PublicSettings {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  footer: string;
  brandColor: string;
}

// A single class/jamaat entry in the tenant's master list, managed by Super
// Admin from Settings and consumed by the admission form's class dropdown
// (both the authenticated Students module and the public admission-apply
// page). `en` is the stable data-layer slug stored on student records; `bn`
// is the display label. See server/src/lib/classOptions.js.
export interface ClassOption {
  bn: string;
  en: string;
  order: number;
}

// Hierarchical class/jamaat tree (বিভাগ -> গ্রুপ/নেসাব -> জামাত), replacing
// ClassOption's flat list — see server/src/lib/classTree.js for the exact
// shape/rules (leaf.en is what's stored on students.class). `leaf` is only
// true on selectable nodes (no children); non-leaf nodes exist purely to
// group the cascading dropdowns.
export interface ClassTreeNode {
  id: string;
  bn: string;
  en: string;
  leaf: boolean;
  children: ClassTreeNode[];
}

export interface SiteHighlight {
  icon: string;
  label: string;
}

// `image`/`imagePublicId` are optional so existing icon-only entries keep
// working untouched — the admin can attach a photo per card from the
// Website editor, and the public pages fall back to the plain icon card
// whenever no image was uploaded. Same url/publicId pattern as
// SiteGalleryItem below (Cloudinary secure_url + publicId for cleanup).
export interface SiteDepartment {
  icon: string;
  title: string;
  desc: string;
  image?: string;
  imagePublicId?: string;
}

export interface SiteClassItem {
  icon: string;
  title: string;
  desc: string;
  image?: string;
  imagePublicId?: string;
}

export interface SiteNotice {
  title: string;
  date: string; // ISO yyyy-mm-dd
  body: string;
}

export interface SiteAdmissionStep {
  icon: string;
  title: string;
  desc: string;
  image?: string;
  imagePublicId?: string;
}

// One uploaded photo on the public Gallery page. `url` comes back from
// POST /api/uploads (Cloudinary secure_url) — the editor never lets the
// admin type an arbitrary URL by hand, only upload a file. `publicId` is
// kept alongside so a removed photo can also be deleted from Cloudinary
// storage, not just dropped from this list. Older entries saved before
// this field existed simply won't have it (optional).
// `category` groups photos for the filter tabs on the public Gallery page
// (free text, chosen from SiteContent.galleryCategories — falls back to
// "সাধারণ" when unset so older entries keep working). `homeSlot` opts a
// photo into one of the fixed homepage placements — "none" (default, most
// photos) means it only shows on the /gallery page.
export type SiteGalleryHomeSlot = "none" | "hero" | "strip" | "cta";

export interface SiteGalleryItem {
  url: string;
  caption: string;
  publicId?: string;
  category?: string;
  homeSlot?: SiteGalleryHomeSlot;
}

export interface SiteContent {
  badge: string;
  heroSubtitle: string;
  highlights: SiteHighlight[];
  departments: SiteDepartment[];
  classes: SiteClassItem[];
  notices: SiteNotice[];
  // About-page-only fields. Kept separate from heroSubtitle/highlights above
  // so the "এবাউট" page never shows Home-page content — it has its own copy.
  aboutIntro: string;
  aboutMission: string;
  // Public "গ্যালারি" page. Empty by default; admin uploads real campus
  // photos from the Website module. Same pattern as classes/notices above.
  gallery: SiteGalleryItem[];
  // Admin-defined tag list used for the category filter chips on the
  // public Gallery page (e.g. "অনুষ্ঠান", "শ্রেণিকক্ষ", "খেলাধুলা").
  // Photos not tagged with one of these fall under "সাধারণ".
  galleryCategories: string[];
  // Public "ভর্তি" (Admission) page hero + "কীভাবে কাজ করে" steps.
  admissionBadge: string;
  admissionTitle: string;
  admissionSubtitle: string;
  admissionSteps: SiteAdmissionStep[];
  // Public "গ্যালারি" page hero + intro section text.
  galleryHeroBadge: string;
  galleryHeroTitle: string;
  galleryHeroSubtitle: string;
  galleryIntroBadge: string;
  galleryIntroTitle: string;
  galleryIntroSubtitle: string;
}

// What the public "ভর্তি" (admission) form submits. Stored server-side in
// the `admissions` table for staff to review later — this is new inbound
// data, not something pulled from existing records.
export interface AdmissionApplicationInput {
  studentName: string;
  studentNameEn?: string;
  dateOfBirth?: string;
  gender?: string;
  className: string;
  guardianName: string;
  guardianPhone: string;
  presentAddress?: string;
  previousInstitution?: string;
  note?: string;
}

export interface AdmissionApplication extends AdmissionApplicationInput {
  id: number;
  status: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: number | null;
  link: string;
  createdAt: string;
  read: boolean;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface User {
  id: number;
  name: string;
  email?: string;
  role: string;
  isProtected?: boolean;
  // Only present on rows where role === "Teacher" — see
  // lib/teacherScope.js on the server for how this scopes their access.
  assignedClasses?: string[];
}

export const USER_ROLES = [
  "Super Admin",
  "Admin",
  "Accountant",
  "Teacher",
  "Hostel Manager",
] as const;

export const INCOME_CATEGORIES = [
  "Student Fee",
  "Donation",
  "Zakat",
  "Sadaqah",
  "Government Grant",
  "Event Income",
  "Other",
] as const;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditLog {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string;
  actorRole: string;
  entityType: string;
  entityId: number | null;
  label: string;
  details: string;
  createdAt: string;
}

export interface AuditLogMeta {
  actions: string[];
  entityTypes: string[];
}

export interface DashboardData {
  stats: {
    total: number;
    residential: number;
    monthlyIncome: number;
    totalDue: number;
    dueCount: number;
    monthlyExpense: number;
    attendance: string;
    attendancePct: string;
    // "রিস্ক জোন" — active students with an estimated 2+ months unpaid
    // (see server/src/routes/dashboard.js, docs/RISK_ZONE_PLAN.md Phase 1).
    riskCount: number;
    riskTotalDue: number;
  };
  incomeData: { month: string; income: number; expense: number }[];
  incomeByCategory?: { category: string; total: number }[];
  attendanceData: { day: string; present: number; absent: number; late: number }[];
  deptData: { name: string; value: number }[];
  logs: { id: number; action: string; user: string; time: string; icon: string }[];
}

export interface AttendanceResponse {
  date: string;
  dept?: string;
  students: Student[];
}

export interface ResultSubjectMark {
  name: string;
  marks: number;
  fullMarks: number;
  // Only present on a "result sheet" response (GET /results/:id/sheet, or
  // the guardian results endpoint) — not on the plain list endpoints, since
  // computing these requires ranking against the whole class/exam/year
  // group. See attachRanksAndSubjectGpa in server/src/lib/results.js.
  gpa?: string;
  grade?: string;
  meritPosition?: number | null;
}

// A management-side result record (one exam, one student). Returned by
// /api/results (auth-only) — includes the "published" flag so staff can
// see draft vs live state.
export interface StudentResult {
  id: number;
  studentId: number;
  examName: string;
  year: string;
  class: string;
  roll: string;
  studentName: string;
  subjects: ResultSubjectMark[];
  totalMarks: number;
  obtainedMarks: number;
  gpa: string;
  grade: string;
  published: number;
  // Overall মেধাস্থান (merit position) within the same class/exam/year
  // group — only present on a "result sheet" response, see
  // ResultSubjectMark.meritPosition above.
  meritPosition?: number | null;
}

export interface ResultStudentOption {
  id: number;
  name: string;
  roll: string;
  class: string;
}

// Response of POST /results/subject-batch (bulk per-subject marks entry for
// a whole class) — docs/CURRENT_TASK.md Part 3. `updated` mirrors the
// per-student rows that were upserted; `skipped` lists studentIds that had
// no matching student record and were left out (batch still succeeds for
// the rest).
export interface ResultSubjectBatchResponse {
  updated: StudentResult[];
  skipped: number[];
}

// What the public Result Lookup page receives — same shape minus
// studentId/id/published, since those are internal-only.
export interface PublicResult {
  name: string;
  roll: string;
  class: string;
  examName: string;
  year: string;
  subjects: ResultSubjectMark[];
  totalMarks: number;
  obtainedMarks: number;
  gpa: string;
  grade: string;
}

// ---------------------------------------------------------------------------
// Guardian Portal (Step 5) — separate session from AuthUser (staff), see
// context/GuardianAuthContext.tsx and /api/guardian-auth on the server.
// ---------------------------------------------------------------------------
export interface GuardianUser {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  role: "Guardian";
}

export interface GuardianChild {
  id: number;
  name: string;
  roll: string;
  class: string;
  section?: string;
  dept: string;
  studentPhoto?: string;
  fee: number;
  due: number;
}

export interface GuardianDashboardChild extends GuardianChild {
  todayAttendance: string | null;
}

export interface GuardianDashboardData {
  children: GuardianDashboardChild[];
  unreadCount: number;
}

export interface GuardianAttendanceRecord {
  date: string;
  status: string;
}

export interface GuardianAttendanceResponse {
  month: string;
  records: GuardianAttendanceRecord[];
  summary: { month: string; total: number; present: number; absent: number; late: number };
}

// One notice/assignment/message posted by a Teacher to a whole class — see
// server/src/lib/classPosts.js. `read` only appears on the guardian feed
// (GET /guardian-auth/feed), not the staff-side listing.
export interface ClassPostAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface ClassPost {
  id: number;
  type: "notice" | "assignment" | "message";
  class: string;
  teacherId: number | null;
  title: string;
  body: string;
  attachments: ClassPostAttachment[];
  createdAt: string;
  read?: boolean;
}

// Guardian Reminder Messenger (ad-hoc, docs/CURRENT_TASK.md) —
// server/src/routes/guardianReminders.js (admin side) +
// server/src/routes/guardianAuth.js (guardian read side). targetType/
// scheduleTime/intervalDays/selectedStudentIds cover the conditional
// (feeDue/lateArrival/attendanceMissing/selectedStudents) reminders —
// see docs/CONDITIONAL_REMINDERS_PLAN.md.
export interface GuardianReminder {
  id: number;
  title: string;
  body: string;
  targetType: "all" | "class" | "student" | "feeDue" | "lateArrival" | "attendanceMissing" | "selectedStudents";
  targetClass: string | null;
  targetStudentId: number | null;
  scheduleType: "once" | "daily" | "specificDate";
  scheduleDate: string | null;
  /** 'HH:MM', 24hr — only consulted for feeDue/lateArrival/attendanceMissing. */
  scheduleTime: string | null;
  /** Only consulted when scheduleType='daily'; defaults to 1 ("every day"). */
  intervalDays: number;
  /** targetType='selectedStudents' only — array of students.id. */
  selectedStudentIds: number[] | null;
  active: boolean;
  createdAt: string;
  lastSentAt: string | null;
}

export interface GuardianMessage {
  id: number;
  reminderId: number | null;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

// "SMS সেবা" settings page — server/src/routes/sms.js (BUSINESS_READINESS_
// ROADMAP.md Phase 8D). `type` distinguishes a wallet credit ("topup", from
// an approved manual top-up request) from a wallet debit ("deduct", from
// smsSender.js actually sending an SMS). `status` matters only for "topup"
// rows — a "deduct" row is always "confirmed" the moment it's written.
export interface SmsTransaction {
  id: number;
  type: "topup" | "deduct";
  amountTaka: number;
  smsCount: number | null;
  reference: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
}

export interface SmsNotificationPrefs {
  feeDueReminder: boolean;
  resultPublished: boolean;
  paymentReceived: boolean;
  attendancePunch: boolean;
}

export interface SmsWallet {
  balanceTaka: number;
  updatedAt: string | null;
  transactions: SmsTransaction[];
  notificationPrefs: SmsNotificationPrefs;
  /** Empty string if the platform operator hasn't set SMS_TOPUP_BKASH_NUMBER yet. */
  topupBkashNumber: string;
}

// Own-phone/SIM bulk SMS gateway — manual contact list
// (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md, Phase 5) — server/src/routes/
// smsContacts.js. Deliberately unrelated to students/guardians (design
// decision #2 in the plan doc) — a standalone, manually-maintained list.
export interface SmsContact {
  id: number;
  name: string;
  phone: string;
  groupName: string | null;
  createdAt: string;
}

// bKash self-connect settings — server/src/routes/paymentGateway.js
// (BUSINESS_READINESS_ROADMAP.md Phase 8E). Credentials themselves never
// come back from the server after being saved — only connection status.
export interface PaymentGatewayStatus {
  connected: boolean;
  provider: "bkash";
  lastCheckedAt: string | null;
  lastError: string | null;
  /** false if the server has no GATEWAY_CREDENTIAL_KEY set — connect attempts will fail with a clear message. */
  configured: boolean;
}

// Own-phone/SIM bulk SMS gateway (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md,
// Phase 4) — server/src/routes/ownSmsGateway.js. Same shape as
// PaymentGatewayStatus above (SMSGate credentials never come back after
// being saved, only connection status) but a separate, unrelated system —
// no money involved, just an institution's own phone acting as an SMS relay.
export interface OwnSmsGatewayStatus {
  connected: boolean;
  provider: "smsgate";
  lastCheckedAt: string | null;
  lastError: string | null;
  /** false if the server has no GATEWAY_CREDENTIAL_KEY set — connect attempts will fail with a clear message. */
  configured: boolean;
}

// Own-phone/SIM bulk SMS — broadcast-send response
// (docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md, Phase 6) — server/src/routes/
// sms.js's POST /broadcast (Phase 3 backend, already returns this shape).
export interface SmsBroadcastResult {
  total: number;
  sent: number;
  failed: number;
}

// bKash create→execute checkout (Phase 8F) — shared shape for both the
// guardian fee-payment flow (routes/guardianAuth.js) and the admin SMS
// wallet gateway top-up (routes/sms.js's /topup-via-gateway/*).
export interface BkashCheckoutStart {
  bkashURL: string;
  paymentID: string;
}

// Institution self-service platform-subscription billing (ad-hoc,
// docs/CURRENT_TASK.md) — reverse money direction from PaymentGatewayStatus
// above (institution -> platform, via routes/institutionBilling.js), not
// guardian -> institution. Only meaningful in multi-tenant deployments.
export interface InstitutionBillingStatus {
  plan: string | null;
  billingModel: string | null;
  priceAmount: number | null;
  status: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  /** true only if the PLATFORM operator's own bKash account is connected — not this institution's own gateway. */
  platformGatewayConnected: boolean;
}

// Attendance device kiosk (docs/ATTENDANCE_DEVICE_PLAN.md, Phase 4) — same
// shape server/src/routes/deviceAttendance.js's GET /device/latest-punch/:id
// sends (toStudentPayload()/the inline SELECT there), just typed client-side.
export interface KioskPunchStudent {
  name: string;
  class: string;
  section?: string;
  roll: string;
  photo?: string;
}

export interface KioskPunch {
  punchAt: string;
  // false for an unmatched fingerprint/card scan (added 2026-08-12, see
  // deviceAttendance.js's POST /punch) — student is null in that case, not
  // omitted, so callers can't forget to check this before reading it.
  matched: boolean;
  student: KioskPunchStudent | null;
}

export interface KioskLatestPunchResponse {
  punch: KioskPunch | null;
}

// Attendance device management (docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md,
// Phase 1) — admin-facing CRUD for attendance_devices, distinct from the
// device's own public-facing punch/latest-punch API above. Matches
// server/src/routes/attendanceDevices.js's response shapes.
// docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 1 — which
// kind of device this is; drives what connection instructions get shown
// (Phase 3) and, for push_adms, means no local hardware-bridge program is
// needed at all.
export type AttendanceDeviceProtocol = "push_adms" | "key_reader" | "pull_sdk";

export interface AttendanceDevice {
  id: number;
  deviceId: string;
  name: string | null;
  location: string | null;
  active: boolean;
  protocol: AttendanceDeviceProtocol;
  createdAt: string;
}

// Only ever returned once — at creation, POST / — never by GET /, same
// "shown once" contract as the server route.
export interface AttendanceDeviceCreateResponse extends AttendanceDevice {
  secretKey: string;
}

// POST /:id/regenerate-secret returns a smaller shape than create (no
// name/location/active/createdAt) — matches attendanceDevices.js exactly.
export interface AttendanceDeviceSecretResponse {
  id: number;
  deviceId: string;
  secretKey: string;
}

// GET /:id/latest-scan (docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase
// 2C) — staff-only, raw-identifier variant of KioskLatestPunchResponse
// above. Both fields null when the device has no punch history yet.
export interface AttendanceDeviceLatestScanResponse {
  punchAt: string | null;
  identifier: string | null;
}

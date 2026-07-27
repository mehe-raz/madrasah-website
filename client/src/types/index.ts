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
export interface SiteGalleryItem {
  url: string;
  caption: string;
  publicId?: string;
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
}

export interface ResultStudentOption {
  id: number;
  name: string;
  roll: string;
  class: string;
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

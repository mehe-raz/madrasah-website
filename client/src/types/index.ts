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
  backupConfig?: string;
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
  attendanceData: { day: string; present: number; absent: number }[];
  deptData: { name: string; value: number }[];
  logs: { id: number; action: string; user: string; time: string; icon: string }[];
}

export interface AttendanceResponse {
  date: string;
  dept?: string;
  students: Student[];
}

import { C } from "../theme/colors";
import type { DashboardData, Expense, Payment, Settings, Student } from "../types";

export const STUDENTS: Student[] = [
  { id: 1, name: "মুহাম্মদ আবদুল্লাহ", nameEn: "Muhammad Abdullah", roll: "001", class: "হিফজ ১", dept: "হিফজ", type: "আবাসিক", fee: 2500, due: 0, phone: "01711-111111", blood: "B+", para: 12, status: "সক্রিয়" },
  { id: 2, name: "ইমরান হোসেন", nameEn: "Imran Hossain", roll: "002", class: "কিতাব ৩", dept: "কিতাব", type: "অনাবাসিক", fee: 1500, due: 1500, phone: "01722-222222", blood: "O+", para: 0, status: "সক্রিয়" },
  { id: 3, name: "আহমদ ফারুক", nameEn: "Ahmed Faruk", roll: "003", class: "নাজেরা ২", dept: "নাজেরা", type: "আবাসিক", fee: 2000, due: 4000, phone: "01733-333333", blood: "A+", para: 0, status: "সক্রিয়" },
  { id: 4, name: "রাশেদুল ইসলাম", nameEn: "Rashedul Islam", roll: "004", class: "হিফজ ২", dept: "হিফজ", type: "আবাসিক", fee: 2500, due: 0, phone: "01744-444444", blood: "AB+", para: 20, status: "সক্রিয়" },
  { id: 5, name: "নূর মুহাম্মদ", nameEn: "Nur Muhammad", roll: "005", class: "নূরানী ১", dept: "নূরানী", type: "অনাবাসিক", fee: 800, due: 800, phone: "01755-555555", blood: "B-", para: 0, status: "সক্রিয়" },
  { id: 6, name: "তানভীর আহমদ", nameEn: "Tanvir Ahmed", roll: "006", class: "কিতাব ১", dept: "কিতাব", type: "অনাবাসিক", fee: 1500, due: 3000, phone: "01766-666666", blood: "O-", para: 0, status: "সক্রিয়" },
  { id: 7, name: "জুনায়েদ মুহাম্মদ", nameEn: "Junaid Muhammad", roll: "007", class: "হিফজ ৩", dept: "হিফজ", type: "আবাসিক", fee: 2500, due: 0, phone: "01777-777777", blood: "A-", para: 30, status: "সক্রিয়" },
  { id: 8, name: "সাইফুল ইসলাম", nameEn: "Saiful Islam", roll: "008", class: "নাজেরা ১", dept: "নাজেরা", type: "অনাবাসিক", fee: 1200, due: 1200, phone: "01788-888888", blood: "AB-", para: 0, status: "নিষ্ক্রিয়" },
];

export const PAYMENTS: Payment[] = [
  { id: 1, student: "মুহাম্মদ আবদুল্লাহ", roll: "001", amount: 2500, date: "০৩/০৬/২০২৫", receipt: "RCP-2025-001", method: "নগদ", status: "সম্পন্ন" },
  { id: 2, student: "রাশেদুল ইসলাম", roll: "004", amount: 2500, date: "০৪/০৬/২০২৫", receipt: "RCP-2025-002", method: "বিকাশ", status: "সম্পন্ন" },
  { id: 3, student: "জুনায়েদ মুহাম্মদ", roll: "007", amount: 2500, date: "০৫/০৬/২০২৫", receipt: "RCP-2025-003", method: "নগদ", status: "সম্পন্ন" },
  { id: 4, student: "নূর মুহাম্মদ", roll: "005", amount: 400, date: "০৬/০৬/২০২৫", receipt: "RCP-2025-004", method: "নগদ", status: "আংশিক" },
];

export const EXPENSES: Expense[] = [
  { id: 1, cat: "শিক্ষক বেতন", amount: 28000, date: "০১/০৬/২০২৫", note: "জুন মাসের বেতন" },
  { id: 2, cat: "বিদ্যুৎ বিল", amount: 3500, date: "০৫/০৬/২০২৫", note: "মে মাসের বিল" },
  { id: 3, cat: "খাবার খরচ", amount: 8500, date: "০৭/০৬/২০২৫", note: "আবাসিক ছাত্র" },
  { id: 4, cat: "রক্ষণাবেক্ষণ", amount: 1200, date: "১০/০৬/২০২৫", note: "পানির পাম্প মেরামত" },
  { id: 5, cat: "স্টেশনারি", amount: 800, date: "১২/০৬/২০২৫", note: "কলম, খাতা ইত্যাদি" },
];

export const DEFAULT_SETTINGS: Settings = {
  name: "মাদ্রাসাতুল হেকমা",
  address: "মিরপুর-১, ঢাকা",
  phone: "01700-000000",
  email: "info@madrasah.edu.bd",
  footer: "আল্লাহর সন্তুষ্টির জন্য শিক্ষা গ্রহণ করুন",
  currency: "BDT",
  lang: "bn",
  theme: "light",
  logo: "",
  brandColor: "#0ea5e9",
};

export const MOCK_DASHBOARD: DashboardData = {
  stats: {
    total: 53,
    residential: 31,
    monthlyIncome: 72000,
    totalDue: 10500,
    dueCount: 8,
    monthlyExpense: 45000,
    attendance: "49/53",
    attendancePct: "92.4",
  },
  incomeData: [
    { month: "জান", income: 48000, expense: 32000 },
    { month: "ফেব", income: 52000, expense: 35000 },
    { month: "মার", income: 61000, expense: 38000 },
    { month: "এপ্রি", income: 55000, expense: 34000 },
    { month: "মে", income: 67000, expense: 41000 },
    { month: "জুন", income: 72000, expense: 45000 },
  ],
  attendanceData: [
    { day: "রবি", present: 45, absent: 8, late: 1 },
    { day: "সোম", present: 50, absent: 3, late: 0 },
    { day: "মঙ্গল", present: 47, absent: 6, late: 2 },
    { day: "বুধ", present: 52, absent: 1, late: 1 },
    { day: "বৃহ", present: 49, absent: 4, late: 0 },
    { day: "শুক্র", present: 38, absent: 15, late: 3 },
  ],
  deptData: [
    { name: "হিফজ", value: 35 },
    { name: "কিতাব", value: 28 },
    { name: "নাজেরা", value: 22 },
    { name: "নূরানী", value: 15 },
  ],
  logs: [
    { id: 1, action: "নতুন ছাত্র যোগ করা হয়েছে", user: "Admin", time: "১০ মিনিট আগে", icon: "add" },
    { id: 2, action: "বেতন গ্রহণ: মুহাম্মদ আবদুল্লাহ — ২৫০০ টাকা", user: "Accountant", time: "৩০ মিনিট আগে", icon: "payment" },
    { id: 3, action: "হাজিরা আপডেট করা হয়েছে — জুন ০৭", user: "Teacher", time: "১ ঘণ্টা আগে", icon: "attendance" },
    { id: 4, action: "ব্যয় যোগ করা হয়েছে: বিদ্যুৎ বিল — ৩৫০০ টাকা", user: "Admin", time: "২ ঘণ্টা আগে", icon: "expense" },
  ],
};

export const PARA_NAMES = [
  "আলিফ লাম মীম", "সায়াকূল", "তিলকার রুসুল", "লান তানালু", "ওয়াল মুহসানাত", "লা ইউহিব্বুল্লাহ",
  "ওয়া ইজা সামিউ", "ওয়া লাও আন্নানা", "ক্বলাল মালাউ", "ওয়া'লামু", "ই'তাযারু", "ওয়ামা মিন দাব্বাহ",
  "ওয়ামা উবাররি'উ", "রুব্বামা", "সুবহানাল্লাযি", "ক্বলা আলাম", "ইক্বতারাবা", "ক্বদ আফলাহা",
  "ওয়াকলাল্লাযীনা", "আম্মান খালাক্বাস্", "উতলু মা উহিয়া", "ওয়ামাই ইয়াকনুত", "ওয়ামালী",
  "ফামান আযলামু", "ইলাইহি ইউরাদ্দু", "হা-মীম", "ক্বলা ফামা খাত্ববুকুম", "ক্বদ সামি'আল্লাহ",
  "তাবারাকাল্লাযী", "আম্মা ইয়াতাসাআলূন",
];

export const NAV = [
  { id: "dashboard", path: "/", label: "ড্যাশবোর্ড", icon: "🏠" },
  { id: "students", path: "/students", label: "ছাত্র ব্যবস্থাপনা", icon: "👨‍🎓" },
  { id: "attendance", path: "/attendance", label: "হাজিরা", icon: "📅" },
  { id: "fees", path: "/fees", label: "বেতন ও হিসাব", icon: "💰" },
  { id: "expenses", path: "/expenses", label: "ব্যয় ব্যবস্থাপনা", icon: "💸" },
  { id: "hifz", path: "/hifz", label: "হিফজ ট্র্যাকিং", icon: "📖" },
  { id: "reports", path: "/reports", label: "রিপোর্ট", icon: "📊" },
  { id: "settings", path: "/settings", label: "সেটিংস", icon: "⚙️" },
];

export const deptColor = (dept: string) =>
  dept === "হিফজ" ? C.emerald : dept === "কিতাব" ? C.teal : dept === "নাজেরা" ? C.amber : C.violet;

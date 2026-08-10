module.exports = {
  students: [
    // `class` values below are leaf `en` slugs from lib/classTree.js's
    // DEFAULT_CLASS_TREE (see the class/jamaat hierarchy work) — NOT the old
    // placeholder "হিফজ ১ / কিতাব ৩" style. `dept` matches
    // client/src/lib/labels.ts's TREE_TOP_LEVEL_TO_DEPT mapping for the
    // student's top-level department, exactly as a real admission via
    // ClassCascadeSelect would set it.
    { id: 1, name: "মুহাম্মদ আবদুল্লাহ", nameEn: "Muhammad Abdullah", roll: "001", class: "hifz-group-ka", dept: "Hifz", type: "Residential", fee: 2500, due: 0, phone: "01711-111111", blood: "B+", para: 12, status: "Active" },
    { id: 2, name: "ইমরান হোসেন", nameEn: "Imran Hossain", roll: "002", class: "madani-miyan", dept: "Kitab", type: "Day", fee: 1500, due: 1500, phone: "01722-222222", blood: "O+", para: 0, status: "Active" },
    { id: 3, name: "আহমদ ফারুক", nameEn: "Ahmed Faruk", roll: "003", class: "nurani-group-kha", dept: "Nurani", type: "Residential", fee: 2000, due: 4000, phone: "01733-333333", blood: "A+", para: 0, status: "Active" },
    { id: 4, name: "রাশেদুল ইসলাম", nameEn: "Rashedul Islam", roll: "004", class: "hifz-group-kha", dept: "Hifz", type: "Residential", fee: 2500, due: 0, phone: "01744-444444", blood: "AB+", para: 20, status: "Active" },
    { id: 5, name: "নূর মুহাম্মদ", nameEn: "Nur Muhammad", roll: "005", class: "nurani-group-ga", dept: "Nurani", type: "Day", fee: 800, due: 800, phone: "01755-555555", blood: "B-", para: 0, status: "Active" },
    { id: 6, name: "তানভীর আহমদ", nameEn: "Tanvir Ahmed", roll: "006", class: "dorse-miyan", dept: "Kitab", type: "Day", fee: 1500, due: 3000, phone: "01766-666666", blood: "O-", para: 0, status: "Active" },
    { id: 7, name: "জুনায়েদ মুহাম্মদ", nameEn: "Junaid Muhammad", roll: "007", class: "hifz-group-ga", dept: "Hifz", type: "Residential", fee: 2500, due: 0, phone: "01777-777777", blood: "A-", para: 30, status: "Active" },
    { id: 8, name: "সাইফুল ইসলাম", nameEn: "Saiful Islam", roll: "008", class: "nurani-group-ka", dept: "Nurani", type: "Day", fee: 1200, due: 1200, phone: "01788-888888", blood: "AB-", para: 0, status: "Inactive" },
  ],
  payments: [
    { id: 1, studentId: 1, student: "মুহাম্মদ আবদুল্লাহ", roll: "001", amount: 2500, date: "০৩/০৬/২০২৫", receipt: "RCP-2025-001", method: "নগদ", status: "সম্পন্ন" },
    { id: 2, studentId: 4, student: "রাশেদুল ইসলাম", roll: "004", amount: 2500, date: "০৪/০৬/২০২৫", receipt: "RCP-2025-002", method: "বিকাশ", status: "সম্পন্ন" },
    { id: 3, studentId: 7, student: "জুনায়েদ মুহাম্মদ", roll: "007", amount: 2500, date: "০৫/০৬/২০২৫", receipt: "RCP-2025-003", method: "নগদ", status: "সম্পন্ন" },
    { id: 4, studentId: 5, student: "নূর মুহাম্মদ", roll: "005", amount: 400, date: "০৬/০৬/২০২৫", receipt: "RCP-2025-004", method: "নগদ", status: "আংশিক" },
  ],
  expenses: [
    { id: 1, cat: "শিক্ষক বেতন", amount: 28000, date: "০১/০৬/২০২৫", note: "জুন মাসের বেতন" },
    { id: 2, cat: "বিদ্যুৎ বিল", amount: 3500, date: "০৫/০৬/২০২৫", note: "মে মাসের বিল" },
    { id: 3, cat: "খাবার খরচ", amount: 8500, date: "০৭/০৬/২০২৫", note: "আবাসিক ছাত্র" },
    { id: 4, cat: "রক্ষণাবেক্ষণ", amount: 1200, date: "১০/০৬/২০২৫", note: "পানির পাম্প মেরামত" },
    { id: 5, cat: "স্টেশনারি", amount: 800, date: "১২/০৬/২০২৫", note: "কলম, খাতা ইত্যাদি" },
  ],
  settings: {
    name: "মাদ্রাসাতুল হেকমা",
    address: "মিরপুর-১, ঢাকা",
    phone: "01700-000000",
    email: "info@madrasah.edu.bd",
    footer: "আল্লাহর সন্তুষ্টির জন্য শিক্ষা গ্রহণ করুন",
    currency: "BDT",
    lang: "bn",
    theme: "light",
  },
};

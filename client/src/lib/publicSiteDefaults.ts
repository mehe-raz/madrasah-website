import type { PublicSettings, SiteContent } from "../types";

// Used only when the public API can't be reached at all (e.g. offline /
// server down) — usePublicSite falls back to this so the page still renders
// something instead of a blank screen. Kept in Bengali and madrasah-themed
// so it matches the real DEFAULT_CONTENT in server/src/lib/siteContent.js
// instead of showing an unrelated English kindergarten demo.
export const FALLBACK_SETTINGS: PublicSettings = {
  name: "মাদ্রাসা",
  logo: "",
  address: "ঠিকানা এখনো যুক্ত করা হয়নি",
  phone: "",
  email: "",
  footer: "দ্বীনি ও আধুনিক শিক্ষার সমন্বয়ে একটি নির্ভরযোগ্য প্রতিষ্ঠান।",
};

export const FALLBACK_CONTENT: SiteContent = {
  badge: "দ্বীনি ও আধুনিক শিক্ষার সমন্বয়",
  heroSubtitle: "প্রতিটি শিক্ষার্থীর জন্য যত্নশীল পরিবেশে দ্বীনি শিক্ষা ও নৈতিক গঠনের নিশ্চয়তা।",
  highlights: [
    { label: "প্রতিষ্ঠাকাল থেকে সুনামের সাথে পরিচালিত", icon: "🏛️" },
    { label: "আবাসিক ও অনাবাসিক উভয় ব্যবস্থা", icon: "🏠" },
    { label: "অভিজ্ঞ ও যোগ্য শিক্ষক পরিষদ", icon: "👳" },
    { label: "নিয়মিত অভিভাবক যোগাযোগ ব্যবস্থা", icon: "📞" },
  ],
  departments: [
    { title: "হিফজ বিভাগ", desc: "পূর্ণাঙ্গ কুরআন মুখস্থকরণ প্রোগ্রাম, অভিজ্ঞ হাফেজ শিক্ষকমণ্ডলীর তত্ত্বাবধানে।", icon: "📖" },
    { title: "নাজেরা বিভাগ", desc: "শুদ্ধভাবে কুরআন তিলাওয়াত শিক্ষা ও তাজবীদ চর্চা।", icon: "🕌" },
    { title: "কিতাব বিভাগ", desc: "দাওরায়ে হাদীস পর্যন্ত ইসলামী শিক্ষার ধারাবাহিক পাঠ্যক্রম।", icon: "📚" },
    { title: "জেনারেল বিভাগ", desc: "দ্বীনি শিক্ষার পাশাপাশি জাতীয় শিক্ষাক্রম অনুসরণ।", icon: "🎓" },
  ],
  classes: [],
  notices: [],
  aboutIntro: "যত্ন, শৃঙ্খলা এবং প্রতিটি শিক্ষার্থীর ধারাবাহিক দ্বীনি ও একাডেমিক উন্নতিকে কেন্দ্র করে গড়ে ওঠা একটি নির্ভরযোগ্য প্রতিষ্ঠান।",
  aboutMission: "আমাদের লক্ষ্য প্রতিটি পরিবারকে একটি নিরাপদ ও যত্নশীল শিক্ষার পরিবেশ দেওয়া — যেখানে একাডেমিক উন্নতি চরিত্র গঠন ও উম্মাহর সাথে একসাথে এগিয়ে চলে।",
  gallery: [],
};

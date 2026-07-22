import type { PublicSettings, SiteContent } from "../types";

export const FALLBACK_SETTINGS: PublicSettings = {
  name: "Madrasah ERP",
  logo: "",
  address: "",
  phone: "",
  email: "",
  footer: "",
};

export const FALLBACK_CONTENT: SiteContent = {
  badge: "ডেমো ওয়েবসাইট — শীঘ্রই সম্পূর্ণ চালু হচ্ছে",
  heroSubtitle: "দ্বীনি ও আধুনিক শিক্ষার সমন্বয়ে আপনার সন্তানের উজ্জ্বল ভবিষ্যৎ গড়ে তুলুন।",
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
};

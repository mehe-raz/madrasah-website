import type { PublicSettings, SiteContent } from "../types";

// Used ONLY when the public API request fails outright (offline / server
// down) — usePublicSite now passes through whatever the admin actually
// saved (including an intentionally empty field) on any successful
// response, so this constant never overrides real data anymore. It is
// deliberately NOT the same text as server/src/lib/siteContent.js's
// DEFAULT_CONTENT: that one is shown when an institution hasn't configured
// its site content yet (a prompt to go fill it in), while this one is a
// generic "something's temporarily wrong" placeholder for an outage — two
// different situations that don't need to match.
export const FALLBACK_SETTINGS: PublicSettings = {
  name: "মাদ্রাসা",
  logo: "",
  address: "ঠিকানা এখনো যুক্ত করা হয়নি",
  phone: "",
  email: "",
  footer: "দ্বীনি ও আধুনিক শিক্ষার সমন্বয়ে একটি নির্ভরযোগ্য প্রতিষ্ঠান।",
  brandColor: "#0ea5e9",
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
  galleryCategories: [],
  admissionBadge: "ভর্তি",
  admissionTitle: "দ্রুত ও সহজ ভর্তি প্রক্রিয়া",
  admissionSubtitle: "একটি ক্লাস বেছে নিন, বিস্তারিত দেখুন এবং ফর্মে এগিয়ে যান — পুরো প্রক্রিয়াটি সহজ ও মোবাইল-বান্ধব।",
  admissionSteps: [
    { icon: "①", title: "ক্লাস নির্বাচন করুন", desc: "শিক্ষার্থীর বয়স ও পর্যায় অনুযায়ী উপযুক্ত ক্লাস বেছে নিন।" },
    { icon: "②", title: "ফর্ম পূরণ করুন", desc: "ভর্তি ফর্ম খুলে প্রয়োজনীয় তথ্য দিয়ে পূরণ করুন।" },
    { icon: "③", title: "যোগাযোগের অপেক্ষা করুন", desc: "আমাদের দল আবেদন পর্যালোচনা করে দ্রুত যোগাযোগ করবে।" },
  ],
  galleryHeroBadge: "গ্যালারি",
  galleryHeroTitle: "ক্যাম্পাসের ছবিতে কিছু মুহূর্ত",
  galleryHeroSubtitle: "প্রতিষ্ঠানের কার্যক্রম, অনুষ্ঠান ও দৈনন্দিন পরিবেশের কিছু ছবি এখানে দেখা যাবে।",
  galleryIntroBadge: "মুহূর্তসমূহ",
  galleryIntroTitle: "ক্যাম্পাস জীবনের স্মরণীয় মুহূর্ত",
  galleryIntroSubtitle: "ছবিগুলো Website সেকশন থেকে নিয়মিত আপডেট করা হয়।",
};

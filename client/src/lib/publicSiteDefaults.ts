import type { PublicSettings, SiteContent } from "../types";

export const FALLBACK_SETTINGS: PublicSettings = {
  name: "Little Learners Academy",
  logo: "",
  address: "Chandrima Model Town, Mohammadpur, Dhaka",
  phone: "01315-872600",
  email: "hello@llisbd.com",
  footer: "An inspiring learning environment for little minds.",
};

export const FALLBACK_CONTENT: SiteContent = {
  badge: "Inspiring curious little minds",
  heroSubtitle: "A warm, premium, child-friendly learning experience where every child grows with confidence, creativity, and care.",
  highlights: [
    { label: "Safe, happy, and welcoming campus", icon: "🏡" },
    { label: "Caring teachers with modern methods", icon: "👩‍🏫" },
    { label: "Play-based learning and discovery", icon: "🎨" },
    { label: "Strong parent communication", icon: "💬" },
  ],
  departments: [
    { title: "Playgroup", desc: "Gentle socialization with joyful early learning activities.", icon: "🧸" },
    { title: "Nursery", desc: "Language, numeracy, storytelling, and curiosity building.", icon: "📘" },
    { title: "Kindergarten", desc: "Balanced academic growth with creativity and routine.", icon: "🌈" },
    { title: "Primary", desc: "Confident foundation for the next stage of learning.", icon: "🎓" },
  ],
  classes: [
    { title: "Playgroup", desc: "A friendly start for young learners.", icon: "🧸" },
    { title: "Nursery", desc: "Fun learning through guided activities.", icon: "📘" },
    { title: "KG", desc: "Early literacy, numeracy, and creativity.", icon: "🌈" },
    { title: "Class 1", desc: "Structured learning with care and confidence.", icon: "✨" },
  ],
  notices: [
    { title: "Admission for the new session is open", date: "2026-07-01", body: "Applications are now being accepted for the upcoming session." },
    { title: "Open house for parents", date: "2026-06-20", body: "Meet the teachers, explore the campus, and learn about our approach." },
    { title: "Holiday notice", date: "2026-06-10", body: "The campus will remain closed on the announced holiday dates." },
  ],
  aboutIntro: "We are a warm, community-rooted school built around care, structure, and steady academic growth for every child who walks through our doors.",
  aboutMission: "Our mission is to give every family a safe, nurturing place to learn — where academic growth goes hand in hand with character and community.",
};

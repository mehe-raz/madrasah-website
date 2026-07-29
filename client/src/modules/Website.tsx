import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";

type WebsiteSectionId = "hero" | "about" | "highlights" | "departments" | "classes" | "notices" | "gallery" | "admissions" | "admissionContent";

interface WebsiteSectionCard {
  id: WebsiteSectionId;
  title: string;
  subtitle: string;
  summary: string;
  route: string;
  icon: string;
}

interface SectionGroup {
  id: string;
  label: string;
  hint: string;
  accent: string;
  accentSoft: string;
  sections: WebsiteSectionCard[];
}

const GROUPS: SectionGroup[] = [
  {
    id: "homepage",
    label: "হোমপেজ",
    hint: "ভিজিটর প্রথম যা দেখেন",
    accent: C.sky,
    accentSoft: C.skyL,
    sections: [
      {
        id: "hero",
        title: "হিরো সেকশন",
        subtitle: "হোমপেজের শুরু অংশ",
        summary: "ব্যাজ, মূল বর্ণনা এবং প্রথম ইমপ্রেশন তৈরি করা কন্টেন্ট।",
        route: "/website/hero",
        icon: "🏠",
      },
      {
        id: "highlights",
        title: "হাইলাইটস",
        subtitle: "হোমপেজের ছোট বৈশিষ্ট্য",
        summary: "শিশু-বন্ধু, শিক্ষক, নিরাপত্তা, পরিবেশ—এই ধরনের ছোট হাইলাইট।",
        route: "/website/highlights",
        icon: "✨",
      },
    ],
  },
  {
    id: "pages",
    label: "পাবলিক পেজসমূহ",
    hint: "প্রতিষ্ঠানের পরিচিতি ও কার্যক্রম",
    accent: C.emerald,
    accentSoft: C.emeraldL,
    sections: [
      {
        id: "about",
        title: "এবাউট পেজ",
        subtitle: "আমাদের পরিচিতি ও লক্ষ্য",
        summary: "পাবলিক About পেজে দেখানো পরিচিতি ও মিশন টেক্সট।",
        route: "/website/about",
        icon: "📖",
      },
      {
        id: "departments",
        title: "বিভাগসমূহ",
        subtitle: "পাবলিক প্রোগ্রাম লিস্ট",
        summary: "হিফজ, নাজেরা, কিতাব, জেনারেলসহ প্রতিষ্ঠানের বিভাগসমূহ।",
        route: "/website/departments",
        icon: "🏛️",
      },
      {
        id: "classes",
        title: "ক্লাস ও কোর্স",
        subtitle: "ভর্তি ও ক্লাস পেজ",
        summary: "ভর্তির পেজ এবং ক্লাস/কোর্স তালিকায় দেখানো আইটেমগুলো।",
        route: "/website/classes",
        icon: "🎓",
      },
      {
        id: "admissionContent",
        title: "ভর্তি পেজের কন্টেন্ট",
        subtitle: "পাবলিক ভর্তি পেজের হিরো ও ধাপসমূহ",
        summary: "ব্যাজ, শিরোনাম, বর্ণনা এবং \"কীভাবে কাজ করে\" ধাপগুলো এখান থেকে সম্পাদনা করুন।",
        route: "/website/admission",
        icon: "📝",
      },
    ],
  },
  {
    id: "content",
    label: "কন্টেন্ট ও আবেদন",
    hint: "নিয়মিত আপডেট হওয়া তথ্য",
    accent: C.amber,
    accentSoft: C.amberL,
    sections: [
      {
        id: "notices",
        title: "নোটিশ",
        subtitle: "পাবলিক নোটিশ লিস্ট",
        summary: "সর্বশেষ ঘোষণা ও নোটিশগুলো যা ভিজিটররা দেখবে।",
        route: "/website/notices",
        icon: "📢",
      },
      {
        id: "gallery",
        title: "গ্যালারি",
        subtitle: "পাবলিক গ্যালারি পেজ",
        summary: "ক্যাম্পাসের ছবি আপলোড করুন যা পাবলিক গ্যালারি পেজে দেখা যাবে।",
        route: "/website/gallery",
        icon: "🖼️",
      },
      {
        id: "admissions",
        title: "ভর্তির আবেদনসমূহ",
        subtitle: "পাবলিক ফর্ম থেকে আসা আবেদন",
        summary: "ভর্তি ফর্ম থেকে জমা হওয়া আবেদন দেখুন ও স্ট্যাটাস আপডেট করুন।",
        route: "/admissions",
        icon: "📥",
      },
    ],
  },
];

function SectionCard({
  section,
  accent,
  accentSoft,
  onEdit,
}: {
  section: WebsiteSectionCard;
  accent: string;
  accentSoft: string;
  onEdit: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onEdit();
      }}
      className="soft-panel hover-lift"
      style={{
        padding: 18,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: accentSoft,
          opacity: 0.6,
          filter: "blur(2px)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            background: accentSoft,
            flexShrink: 0,
          }}
        >
          {section.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.25, fontWeight: 900, color: C.text }}>{section.title}</h3>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.muted }}>{section.subtitle}</p>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.65, position: "relative", flex: 1 }}>{section.summary}</p>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          position: "relative",
        }}
      >
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>এক ক্লিকেই এডিট পেজ খুলবে</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="hover-lift"
          style={{
            border: "none",
            background: accent,
            color: "#fff",
            borderRadius: 9,
            padding: "8px 14px",
            fontWeight: 800,
            fontSize: 12.5,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          এডিট করুন →
        </button>
      </div>
    </div>
  );
}

export function Website() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeGroup, setActiveGroup] = useState<string | "all">("all");

  const groups = useMemo(
    () => (activeGroup === "all" ? GROUPS : GROUPS.filter((g) => g.id === activeGroup)),
    [activeGroup]
  );
  const totalSections = useMemo(() => GROUPS.reduce((sum, g) => sum + g.sections.length, 0), []);

  return (
    <div>
      <div
        className="soft-panel-strong gradient-border"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: 22,
          marginBottom: 18,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "auto -80px -80px auto",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(14,165,233,0.16), transparent 70%)",
          }}
        />
        <div style={{ position: "relative", minWidth: 0 }}>
          <div
            className="pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 900,
              color: C.emeraldD,
              background: C.emeraldL,
              marginBottom: 10,
            }}
          >
            🌐 পাবলিক ওয়েবসাইট নিয়ন্ত্রণ
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 900, color: C.text, margin: 0 }}>ওয়েবসাইট ম্যানেজমেন্ট</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0", lineHeight: 1.7, maxWidth: 620 }}>
            আপনার প্রতিষ্ঠানের পাবলিক ওয়েবসাইটের প্রতিটি সেকশন এখান থেকে নিয়ন্ত্রণ করুন — মোট {totalSections}টি সেকশন, ৩টি ভাগে সাজানো।
            কার্ডে ক্লিক করলেই সংশ্লিষ্ট এডিট পেজ খুলবে।
          </p>
        </div>
        <a
          href="/website/preview"
          target="_blank"
          rel="noreferrer"
          className="pill hover-lift"
          style={{
            border: "none",
            background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`,
            color: "#fff",
            borderRadius: 10,
            padding: "12px 18px",
            fontWeight: 900,
            fontSize: 13,
            textDecoration: "none",
            position: "relative",
            flexShrink: 0,
          }}
        >
          প্রিভিউ দেখুন ↗
        </a>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => setActiveGroup("all")}
          className="pill"
          style={{
            border: `1px solid ${activeGroup === "all" ? C.teal : C.border}`,
            background: activeGroup === "all" ? C.teal : C.card,
            color: activeGroup === "all" ? "#fff" : C.text,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          সব সেকশন
        </button>
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroup(g.id)}
            className="pill"
            style={{
              border: `1px solid ${activeGroup === g.id ? g.accent : C.border}`,
              background: activeGroup === g.id ? g.accent : C.card,
              color: activeGroup === g.id ? "#fff" : C.text,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {g.label} · {g.sections.length}
          </button>
        ))}
      </div>

      {groups.map((group) => (
        <div key={group.id} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: group.accent,
                flexShrink: 0,
              }}
            />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: C.text }}>{group.label}</h3>
            <span style={{ fontSize: 12, color: C.muted }}>{group.hint}</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 14,
            }}
          >
            {group.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                accent={group.accent}
                accentSoft={group.accentSoft}
                onEdit={() => navigate(section.route)}
              />
            ))}
          </div>
        </div>
      ))}

      <div
        className="soft-panel"
        style={{
          padding: 14,
          color: C.muted,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        💡 {t.common.edit} করার সময় সংশ্লিষ্ট পেজে গিয়ে সেভ দিলে সেটি সাথে সাথে পাবলিক সাইটে আপডেট হয়ে যাবে।
      </div>
    </div>
  );
}

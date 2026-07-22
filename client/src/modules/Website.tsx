import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";

type WebsiteSectionId = "hero" | "about" | "highlights" | "departments" | "classes" | "notices";

interface WebsiteSectionCard {
  id: WebsiteSectionId;
  title: string;
  subtitle: string;
  summary: string;
  route: string;
}

const SECTIONS: WebsiteSectionCard[] = [
  {
    id: "hero",
    title: "হিরো সেকশন",
    subtitle: "হোমপেজের শুরু অংশ",
    summary: "ব্যাজ, মূল বর্ণনা এবং প্রথম ইমপ্রেশন তৈরি করা কন্টেন্ট।",
    route: "/website/hero",
  },
  {
    id: "about",
    title: "এবাউট পেজ",
    subtitle: "আমাদের পরিচিতি ও লক্ষ্য",
    summary: "পাবলিক About পেজে দেখানো পরিচিতি ও মিশন টেক্সট।",
    route: "/website/about",
  },
  {
    id: "highlights",
    title: "হাইলাইটস",
    subtitle: "হোমপেজের ছোট বৈশিষ্ট্য",
    summary: "শিশু-বন্ধু, শিক্ষক, নিরাপত্তা, পরিবেশ—এই ধরনের ছোট হাইলাইট।",
    route: "/website/highlights",
  },
  {
    id: "departments",
    title: "বিভাগসমূহ",
    subtitle: "পাবলিক প্রোগ্রাম লিস্ট",
    summary: "হিফজ, নাজেরা, কিতাব, জেনারেলসহ প্রতিষ্ঠানের বিভাগসমূহ।",
    route: "/website/departments",
  },
  {
    id: "classes",
    title: "ক্লাস ও কোর্স",
    subtitle: "ভর্তি ও ক্লাস পেজ",
    summary: "ভর্তির পেজ এবং ক্লাস/কোর্স তালিকায় দেখানো আইটেমগুলো।",
    route: "/website/classes",
  },
  {
    id: "notices",
    title: "নোটিশ",
    subtitle: "পাবলিক নোটিশ লিস্ট",
    summary: "সর্বশেষ ঘোষণা ও নোটিশগুলো যা ভিজিটররা দেখবে।",
    route: "/website/notices",
  },
];

function SectionCard({
  section,
  open,
  onToggle,
  onEdit,
}: {
  section: WebsiteSectionCard;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onToggle();
      }}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 160,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="pill" style={{ display: "inline-flex", padding: "5px 10px", fontSize: 11, fontWeight: 900, color: C.emeraldD, background: C.emeraldL, marginBottom: 10 }}>
            Website
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: 17, lineHeight: 1.25, fontWeight: 900, color: C.text }}>{section.title}</h3>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{section.subtitle}</p>
        </div>

        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={`${section.title} menu`}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.slateL,
              color: C.text,
              fontSize: 18,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ⋯
          </button>

          {open && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                right: 0,
                top: 44,
                zIndex: 10,
                minWidth: 150,
                background: "#fff",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                boxShadow: "0 18px 40px rgba(15,23,42,0.14)",
                padding: 8,
              }}
            >
              <button
                type="button"
                onClick={onEdit}
                style={{
                  width: "100%",
                  border: "none",
                  background: C.teal,
                  color: "#fff",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{section.summary}</span>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>এক ক্লিকেই আলাদা পেজ</span>
      </div>
    </div>
  );
}

export function Website() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState<WebsiteSectionId | null>(null);

  const sections = useMemo(() => SECTIONS, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0 }}>ওয়েবসাইট সেকশন</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0", lineHeight: 1.7, maxWidth: 760 }}>
            এখানে প্রতিটি পাবলিক সেকশন আলাদা কার্ডে সাজানো আছে। সেকশন সিলেক্ট করে তিন ডট মেনু থেকে Edit চাপলে আলাদা এডিট পেজ খুলবে।
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          style={{
            border: `1px solid ${C.border}`,
            background: C.card,
            color: C.text,
            borderRadius: 10,
            padding: "10px 16px",
            fontWeight: 800,
            fontSize: 13,
            textDecoration: "none",
            boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
          }}
        >
          লাইভ পেজ দেখুন ↗
        </a>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            open={openMenu === section.id}
            onToggle={() => setOpenMenu((prev) => (prev === section.id ? null : section.id))}
            onEdit={() => navigate(section.route)}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 12,
          background: C.slateL,
          border: `1px solid ${C.border}`,
          color: C.muted,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {t.common.edit} করার সময় সংশ্লিষ্ট পেজে গিয়ে সেভ দিলে সেটি পাবলিক সাইটে আপডেট হবে।
      </div>
    </div>
  );
}

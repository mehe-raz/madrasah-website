import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import { Icons, type IconKey } from "../lib/icons";
import type { Dict } from "../i18n/bn";

type WebsiteSectionId = "hero" | "about" | "highlights" | "departments" | "classes" | "notices" | "gallery" | "admissions" | "admissionContent";

interface WebsiteSectionCard {
  id: WebsiteSectionId;
  title: string;
  subtitle: string;
  summary: string;
  route: string;
  icon: IconKey;
}

interface SectionGroup {
  id: string;
  label: string;
  hint: string;
  accent: string;
  accentSoft: string;
  sections: WebsiteSectionCard[];
}

// Titles/subtitles/summaries come from the current language's dictionary
// (see i18n/bn.ts / i18n/en.ts -> websiteMgmt.*) so the cards switch with
// the rest of the UI instead of staying fixed in one language.
function buildGroups(t: Dict): SectionGroup[] {
  return [
    {
      id: "homepage",
      label: t.websiteMgmt.groupHomepageLabel,
      hint: t.websiteMgmt.groupHomepageHint,
      accent: C.sky,
      accentSoft: C.skyL,
      sections: [
        {
          id: "hero",
          title: t.websiteMgmt.heroTitle,
          subtitle: t.websiteMgmt.heroSubtitle,
          summary: t.websiteMgmt.heroSummary,
          route: "/website/hero",
          icon: "dashboard",
        },
        {
          id: "highlights",
          title: t.websiteMgmt.highlightsTitle,
          subtitle: t.websiteMgmt.highlightsSubtitle,
          summary: t.websiteMgmt.highlightsSummary,
          route: "/website/highlights",
          icon: "sparkles",
        },
      ],
    },
    {
      id: "pages",
      label: t.websiteMgmt.groupPagesLabel,
      hint: t.websiteMgmt.groupPagesHint,
      accent: C.emerald,
      accentSoft: C.emeraldL,
      sections: [
        {
          id: "about",
          title: t.websiteMgmt.aboutTitle,
          subtitle: t.websiteMgmt.aboutSubtitle,
          summary: t.websiteMgmt.aboutSummary,
          route: "/website/about",
          icon: "hifz",
        },
        {
          id: "departments",
          title: t.websiteMgmt.departmentsTitle,
          subtitle: t.websiteMgmt.departmentsSubtitle,
          summary: t.websiteMgmt.departmentsSummary,
          route: "/website/departments",
          icon: "brand",
        },
        {
          id: "classes",
          title: t.websiteMgmt.classesTitle,
          subtitle: t.websiteMgmt.classesSubtitle,
          summary: t.websiteMgmt.classesSummary,
          route: "/website/classes",
          icon: "students",
        },
        {
          id: "admissionContent",
          title: t.websiteMgmt.admissionContentTitle,
          subtitle: t.websiteMgmt.admissionContentSubtitle,
          summary: t.websiteMgmt.admissionContentSummary,
          route: "/website/admission",
          icon: "results",
        },
      ],
    },
    {
      id: "content",
      label: t.websiteMgmt.groupContentLabel,
      hint: t.websiteMgmt.groupContentHint,
      accent: C.amber,
      accentSoft: C.amberL,
      sections: [
        {
          id: "notices",
          title: t.websiteMgmt.noticesTitle,
          subtitle: t.websiteMgmt.noticesSubtitle,
          summary: t.websiteMgmt.noticesSummary,
          route: "/website/notices",
          icon: "assignments",
        },
        {
          id: "gallery",
          title: t.websiteMgmt.galleryTitle,
          subtitle: t.websiteMgmt.gallerySubtitle,
          summary: t.websiteMgmt.gallerySummary,
          route: "/website/gallery",
          icon: "gallery",
        },
        {
          id: "admissions",
          title: t.websiteMgmt.admissionsTitle,
          subtitle: t.websiteMgmt.admissionsSubtitle,
          summary: t.websiteMgmt.admissionsSummary,
          route: "/admissions",
          icon: "inbox",
        },
      ],
    },
  ];
}

function SectionCard({
  section,
  accent,
  accentSoft,
  editHint,
  editButtonLabel,
  onEdit,
}: {
  section: WebsiteSectionCard;
  accent: string;
  accentSoft: string;
  editHint: string;
  editButtonLabel: string;
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
          {(() => { const SectionIcon = Icons[section.icon]; return <SectionIcon size={22} aria-hidden="true" />; })()}
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
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{editHint}</span>
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
          {editButtonLabel}
        </button>
      </div>
    </div>
  );
}

export function Website() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeGroup, setActiveGroup] = useState<string | "all">("all");
  const GROUPS = useMemo(() => buildGroups(t), [t]);

  const groups = useMemo(
    () => (activeGroup === "all" ? GROUPS : GROUPS.filter((g) => g.id === activeGroup)),
    [activeGroup, GROUPS]
  );
  const totalSections = useMemo(() => GROUPS.reduce((sum, g) => sum + g.sections.length, 0), [GROUPS]);

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
            <Icons.website size={13} aria-hidden="true" /> {t.websiteMgmt.badge}
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 900, color: C.text, margin: 0 }}>{t.websiteMgmt.heading}</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0", lineHeight: 1.7, maxWidth: 620 }}>
            {t.websiteMgmt.intro.replace("{count}", String(totalSections)).replace("{groups}", String(GROUPS.length))}
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
          {t.websiteMgmt.previewLink}
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
          {t.websiteMgmt.allSections}
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
                editHint={t.websiteMgmt.editPage}
                editButtonLabel={t.websiteMgmt.editButton}
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
        <Icons.sparkles size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{t.websiteMgmt.footerNote}
      </div>
    </div>
  );
}

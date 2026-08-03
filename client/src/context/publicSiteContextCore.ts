import { createContext, useContext } from "react";
import type { PublicSettings, SiteContent } from "../types";

export interface PublicSiteContextValue {
  site: PublicSettings;
  content: SiteContent;
  loading: boolean;
  ensureLoaded: () => void;
}

export const PublicSiteContext = createContext<PublicSiteContextValue | null>(null);

// Respect whatever the admin actually saved, including a field left
// deliberately empty — do NOT substitute FALLBACK_CONTENT here. That
// constant is only for the "API unreachable" / "nothing cached yet" case,
// never for a successful response that happens to contain an empty
// string/array. (Same rule the old per-page usePublicSite.ts followed.)
export function normalizeContent(data: Partial<SiteContent>): SiteContent {
  return {
    badge: data.badge ?? "",
    heroSubtitle: data.heroSubtitle ?? "",
    highlights: data.highlights ?? [],
    departments: data.departments ?? [],
    classes: data.classes ?? [],
    notices: data.notices ?? [],
    aboutIntro: data.aboutIntro ?? "",
    aboutMission: data.aboutMission ?? "",
    gallery: data.gallery ?? [],
    galleryCategories: data.galleryCategories ?? [],
    admissionBadge: data.admissionBadge ?? "",
    admissionTitle: data.admissionTitle ?? "",
    admissionSubtitle: data.admissionSubtitle ?? "",
    admissionSteps: data.admissionSteps ?? [],
    galleryHeroBadge: data.galleryHeroBadge ?? "",
    galleryHeroTitle: data.galleryHeroTitle ?? "",
    galleryHeroSubtitle: data.galleryHeroSubtitle ?? "",
    galleryIntroBadge: data.galleryIntroBadge ?? "",
    galleryIntroTitle: data.galleryIntroTitle ?? "",
    galleryIntroSubtitle: data.galleryIntroSubtitle ?? "",
  };
}

export function usePublicSiteContext() {
  const ctx = useContext(PublicSiteContext);
  if (!ctx) throw new Error("usePublicSiteContext must be used within PublicSiteProvider");
  return ctx;
}

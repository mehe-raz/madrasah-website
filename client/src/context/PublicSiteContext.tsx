import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import { FALLBACK_CONTENT, FALLBACK_SETTINGS } from "../lib/publicSiteDefaults";
import type { PublicSettings, SiteContent } from "../types";

const CACHE_KEY = "madrasah-public-site";

interface PublicSiteContextValue {
  site: PublicSettings;
  content: SiteContent;
  loading: boolean;
  ensureLoaded: () => void;
}

const PublicSiteContext = createContext<PublicSiteContextValue | null>(null);

// Respect whatever the admin actually saved, including a field left
// deliberately empty — do NOT substitute FALLBACK_CONTENT here. That
// constant is only for the "API unreachable" / "nothing cached yet" case,
// never for a successful response that happens to contain an empty
// string/array. (Same rule the old per-page usePublicSite.ts followed.)
function normalizeContent(data: Partial<SiteContent>): SiteContent {
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

function loadCached(): { site: PublicSettings; content: SiteContent } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      site: { ...FALLBACK_SETTINGS, ...parsed.site },
      content: normalizeContent(parsed.content ?? {}),
    };
  } catch {
    return null;
  }
}

// Shared across every public (logged-out) page — Home/About/Classes/
// Admission/Gallery/Notices/Result all used to fire their own
// site-content + settings fetch on mount (same two GETs, once per page).
// This provider fetches once per page load and every public page reads
// from here instead. A cached copy from the last visit is used
// immediately (no skeleton flash on repeat visits/route changes) while a
// fresh copy is fetched in the background and both state + the cache get
// updated when it lands.
export function PublicSiteProvider({ children }: { children: ReactNode }) {
  // Read localStorage at most once per mount (a ref, not a plain variable),
  // so it isn't re-parsed on every re-render — and ensureLoaded below can
  // reference the same snapshot later without an exhaustive-deps warning.
  const cachedRef = useRef<{ site: PublicSettings; content: SiteContent } | null | undefined>(undefined);
  if (cachedRef.current === undefined) cachedRef.current = loadCached();
  const cached = cachedRef.current;

  const [site, setSite] = useState<PublicSettings>(cached?.site ?? FALLBACK_SETTINGS);
  const [content, setContent] = useState<SiteContent>(cached?.content ?? FALLBACK_CONTENT);
  const [loading, setLoading] = useState(!cached);
  const fetchedRef = useRef(false);

  const ensureLoaded = useCallback(() => {
    // Admin/dashboard pages never call usePublicSite(), so this never runs
    // for them. Guarded so the fetch happens at most once per page load,
    // no matter how many public pages a visitor moves through.
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    Promise.allSettled([api.getPublicSiteContent(), api.getPublicSettings()]).then((results) => {
      const [contentResult, settingsResult] = results;
      let nextSite: PublicSettings | null = null;
      let nextContent: SiteContent | null = null;
      if (contentResult.status === "fulfilled") {
        nextContent = normalizeContent(contentResult.value);
        setContent(nextContent);
      }
      if (settingsResult.status === "fulfilled") {
        nextSite = { ...FALLBACK_SETTINGS, ...settingsResult.value };
        setSite(nextSite);
      }
      if (nextSite || nextContent) {
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              site: nextSite ?? cachedRef.current?.site ?? FALLBACK_SETTINGS,
              content: nextContent ?? cachedRef.current?.content ?? FALLBACK_CONTENT,
            })
          );
        } catch {
          /* ignore quota errors */
        }
      }
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({ site, content, loading, ensureLoaded }),
    [site, content, loading, ensureLoaded]
  );

  return <PublicSiteContext.Provider value={value}>{children}</PublicSiteContext.Provider>;
}

export function usePublicSiteContext() {
  const ctx = useContext(PublicSiteContext);
  if (!ctx) throw new Error("usePublicSiteContext must be used within PublicSiteProvider");
  return ctx;
}

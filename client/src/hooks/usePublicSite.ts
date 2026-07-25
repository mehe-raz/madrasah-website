import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FALLBACK_CONTENT, FALLBACK_SETTINGS } from "../lib/publicSiteDefaults";
import type { PublicSettings, SiteContent } from "../types";

// Every public (logged-out) page needs the institution's name/logo/contact
// info and the editable site content (classes, notices, departments...).
// Both are unauthenticated GETs, cheap to call per-page — this hook just
// keeps the fetch-with-fallback logic in one place instead of copy-pasted
// across Home/Classes/Admission/Gallery/Notices/Result.
export function usePublicSite() {
  const [site, setSite] = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [content, setContent] = useState<SiteContent>(FALLBACK_CONTENT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getPublicSiteContent(), api.getPublicSettings()]).then((results) => {
      if (cancelled) return;
      const [contentResult, settingsResult] = results;
      if (contentResult.status === "fulfilled") {
        const data = contentResult.value;
        // Respect whatever the admin actually saved, including a field left
        // deliberately empty — do NOT substitute FALLBACK_CONTENT here. That
        // constant is only for the "API unreachable" case below (initial
        // state + the branch this `if` skips on rejection), never for a
        // successful response that happens to contain an empty string/array.
        setContent({
          badge: data.badge ?? "",
          heroSubtitle: data.heroSubtitle ?? "",
          highlights: data.highlights ?? [],
          departments: data.departments ?? [],
          classes: data.classes ?? [],
          notices: data.notices ?? [],
          aboutIntro: data.aboutIntro ?? "",
          aboutMission: data.aboutMission ?? "",
          gallery: data.gallery ?? [],
        });
      }
      if (settingsResult.status === "fulfilled") {
        // Spread (not `||`) so an intentionally-cleared field ("") from the
        // API always wins over FALLBACK_SETTINGS — only a genuinely missing
        // key falls back.
        setSite({ ...FALLBACK_SETTINGS, ...settingsResult.value });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { site, content, loading };
}

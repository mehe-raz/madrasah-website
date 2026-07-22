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
        setContent({
          badge: data.badge || FALLBACK_CONTENT.badge,
          heroSubtitle: data.heroSubtitle || FALLBACK_CONTENT.heroSubtitle,
          highlights: data.highlights?.length ? data.highlights : FALLBACK_CONTENT.highlights,
          departments: data.departments?.length ? data.departments : FALLBACK_CONTENT.departments,
          classes: data.classes || [],
          notices: data.notices || [],
        });
      }
      if (settingsResult.status === "fulfilled") {
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

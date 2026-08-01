import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { FALLBACK_CONTENT, FALLBACK_SETTINGS } from "../lib/publicSiteDefaults";
import type { PublicSettings, SiteContent } from "../types";
import { normalizeContent, PublicSiteContext } from "./publicSiteContextCore";

const CACHE_KEY = "madrasah-public-site";

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
  // Read localStorage at most once per mount, via a useState lazy
  // initializer (not a ref) — reading a ref's `.current` during render is
  // unsafe with concurrent React, so the once-only computation belongs in
  // state initialization instead. `cached` itself is never updated after
  // mount, so it's safe to close over in ensureLoaded below.
  const [cached] = useState(loadCached);

  const [site, setSite] = useState<PublicSettings>(() => cached?.site ?? FALLBACK_SETTINGS);
  const [content, setContent] = useState<SiteContent>(() => cached?.content ?? FALLBACK_CONTENT);
  const [loading, setLoading] = useState(() => !cached);
  // Unlike cachedRef above, this ref is only ever read/written from inside
  // the ensureLoaded callback below (an event-style call, not render), so
  // it doesn't hit the same refs-during-render restriction.
  const fetchedRef = useRef(false);

  // Public pages read this as var(--brand) instead of a hardcoded hex, so an
  // institution's chosen color (Settings > brandColor) takes effect without
  // any component needing to know where the value came from. Scoped to
  // documentElement here (not a plain <style> on the public layout) because
  // this provider only ever wraps public pages — it never runs on the
  // authenticated admin dashboard, so this can't bleed into it.
  useEffect(() => {
    document.documentElement.style.setProperty("--brand", site.brandColor || FALLBACK_SETTINGS.brandColor);
  }, [site.brandColor]);

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
              site: nextSite ?? cached?.site ?? FALLBACK_SETTINGS,
              content: nextContent ?? cached?.content ?? FALLBACK_CONTENT,
            })
          );
        } catch {
          /* ignore quota errors */
        }
      }
      setLoading(false);
    });
  }, [cached]);

  const value = useMemo(
    () => ({ site, content, loading, ensureLoaded }),
    [site, content, loading, ensureLoaded]
  );

  return <PublicSiteContext.Provider value={value}>{children}</PublicSiteContext.Provider>;
}

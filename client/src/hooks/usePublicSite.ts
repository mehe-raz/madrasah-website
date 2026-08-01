import { useEffect } from "react";
import { usePublicSiteContext } from "../context/publicSiteContextCore";

// Every public (logged-out) page needs the institution's name/logo/contact
// info and the editable site content (classes, notices, departments...).
// The actual fetch + cross-page cache lives in PublicSiteContext (shared by
// every public page via PublicSiteProvider in main.tsx); this hook just
// kicks that off once a public page mounts and hands back the shared state,
// so callers (Home/About/Classes/Admission/Gallery/Notices/Result) don't
// need to change at all.
export function usePublicSite() {
  const { site, content, loading, ensureLoaded } = usePublicSiteContext();
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);
  return { site, content, loading };
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home } from "./Home";
import { C } from "../theme/colors";
import { api } from "../lib/api";
import { PublicSiteContext, normalizeContent, type PublicSiteContextValue } from "../context/publicSiteContextCore";
import { FALLBACK_SETTINGS } from "../lib/publicSiteDefaults";
import type { PublicSettings } from "../types";

// Standalone preview of the public homepage, opened from the "লাইভ পেজ
// দেখুন" button on the Website management page. Two things it fixes
// compared to just linking to "/":
//
// 1. "/" shows the public Home only to signed-out visitors and falls
//    through to the Dashboard for anyone logged in (see ProtectedRoute) —
//    so an admin previewing their own site in a new tab always saw the
//    Dashboard instead. This route renders Home directly, regardless of
//    auth state.
// 2. It renders the *draft* copy of the site content (whatever's been
//    saved in the section editor but not yet published), not the live
//    copy every visitor currently sees — by supplying its own
//    PublicSiteContext.Provider that Home reads from instead of the app's
//    global (live, cached) one. Nothing in Home.tsx or any other public
//    page needs to know the difference.
export function WebsitePreview() {
  const navigate = useNavigate();
  const [content, setContent] = useState<PublicSiteContextValue["content"] | null>(null);
  const [site, setSite] = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getDraftSiteContent(), api.getSettings()]).then(([draftResult, settingsResult]) => {
      if (cancelled) return;
      if (draftResult.status === "fulfilled") setContent(normalizeContent(draftResult.value));
      if (settingsResult.status === "fulfilled") {
        const s = settingsResult.value;
        setSite({
          name: s.name,
          logo: s.logo || "",
          address: s.address,
          phone: s.phone,
          email: s.email,
          footer: s.footer,
          brandColor: s.brandColor || FALLBACK_SETTINGS.brandColor,
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const contextValue = useMemo<PublicSiteContextValue>(
    () => ({
      site,
      content: content ?? normalizeContent({}),
      loading,
      ensureLoaded: () => {},
    }),
    [site, content, loading]
  );

  const publish = async () => {
    setPublishing(true);
    setError("");
    try {
      await api.publishSiteContent();
      setPublished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "প্রকাশ করা যায়নি");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "10px 16px",
          background: C.slateD,
          color: "#fff",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {published ? (
          <span>✅ প্রকাশ হয়ে গেছে — ভিজিটররা এখন এই ভার্সনটিই দেখছেন</span>
        ) : (
          <span>👁️ প্রিভিউ মোড — এখনো অপ্রকাশিত, শুধু আপনি এটি দেখছেন</span>
        )}
        {error && <span style={{ color: "#fecaca" }}>{error}</span>}
        {!published && (
          <button
            type="button"
            onClick={publish}
            disabled={publishing || loading}
            className="pill hover-lift"
            style={{
              border: "none",
              background: C.emerald,
              color: "#fff",
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: 900,
              cursor: publishing || loading ? "wait" : "pointer",
              flexShrink: 0,
            }}
          >
            {publishing ? "প্রকাশ হচ্ছে..." : "🚀 প্রকাশ করুন"}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("/website")}
          className="pill hover-lift"
          style={{
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            padding: "6px 14px",
            fontSize: 12.5,
            fontWeight: 900,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          প্রিভিউ থেকে বের হন ✕
        </button>
      </div>
      <PublicSiteContext.Provider value={contextValue}>
        <Home />
      </PublicSiteContext.Provider>
    </div>
  );
}

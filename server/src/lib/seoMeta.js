// ============================================================================
// seoMeta.js — per-route <title>/description/OG tag values for the public
// marketing pages, plus a safe "noindex" default for everything else
// (login, admin dashboard, etc).
//
// Why this exists: the client is a pure SPA (see client/src/App.tsx) — every
// route, public or admin, is served the exact same client/dist/index.html
// and React Router takes over from there. That's fine for a human's browser
// (JS runs, useSeoMeta.ts fixes up the tab title), but crawlers that don't
// execute JS — WhatsApp/Facebook/Telegram link-preview bots, and many
// non-Google search crawlers — only ever see whatever was already in that
// first HTML response. Without this, every single URL on the site (public
// or admin) showed the same hardcoded "Madrasah ERP" title and no
// description, so a shared admission-page link had no preview card at all.
//
// This module is intentionally dependency-free (no template engine) — the
// caller does a handful of targeted string replacements on the already-built
// index.html using the values returned here.
// ============================================================================

// docs/GENERAL_MODE_PLAN.md, Phase 7 (খোলা প্রশ্ন ৪) — same type-dependent
// fallback as client/src/pages/Home.tsx (Phase 7), server-rendered version:
// `site` is always getPublicSettings()'s result here (see buildSeoMeta below),
// which now carries institutionType (Phase 7, lib/publicSettings.js) resolved
// from tenantContext — falls back to "মাদ্রাসা" for an empty/unknown site
// object too (e.g. INDEXABLE_PUBLIC_PATHS' build({}, {}) probe below, or an
// unresolved-tenant request), same default as everywhere else in this project.
function defaultName(site) {
  return site && site.institutionType === "general" ? "প্রতিষ্ঠান" : "মাদ্রাসা";
}

function fallbackDescription(name) {
  return `${name}-এ স্বাগতম — শিক্ষার্থী ভর্তি, ক্লাস, নোটিস ও পরীক্ষার ফলাফল সম্পর্কে সব তথ্য এখানে।`;
}

// Only these paths are public, content-bearing marketing pages — see the
// unauthenticated route list in client/src/App.tsx. Everything else
// (admin dashboard, login, password reset, the website live-preview route,
// and any unknown path) defaults to noindex below.
const PUBLIC_ROUTES = {
  "/": (site, content) => ({
    title: `${site.name || defaultName(site)} — স্বাগতম`,
    description: content.heroSubtitle || fallbackDescription(site.name || defaultName(site)),
  }),
  "/about": (site, content) => ({
    title: `আমাদের সম্পর্কে — ${site.name || defaultName(site)}`,
    description: content.aboutIntro || `${site.name || defaultName(site)}-এর ইতিহাস, লক্ষ্য ও শিক্ষাদান পদ্ধতি সম্পর্কে জানুন।`,
  }),
  "/classes": (site, content) => ({
    title: `ক্লাস ও কোর্সসমূহ — ${site.name || defaultName(site)}`,
    description: `${site.name || defaultName(site)}-এর ক্লাস, কোর্স ও পাঠ্যক্রম সম্পর্কে বিস্তারিত জানুন।`,
  }),
  "/admission": (site, content) => ({
    title: `${content.admissionTitle || "ভর্তি"} — ${site.name || defaultName(site)}`,
    description: content.admissionSubtitle || `${site.name || defaultName(site)}-এ ভর্তির নিয়মকানুন ও প্রক্রিয়া সম্পর্কে জানুন।`,
  }),
  "/admission/apply": (site) => ({
    title: `ভর্তি ফর্ম — ${site.name || defaultName(site)}`,
    description: `${site.name || defaultName(site)}-এ অনলাইনে ভর্তি আবেদন করুন।`,
    noindex: true, // a submission form, not indexable content
  }),
  "/gallery": (site, content) => ({
    title: `${content.galleryHeroTitle || "গ্যালারি"} — ${site.name || defaultName(site)}`,
    description: content.galleryHeroSubtitle || `${site.name || defaultName(site)}-এর ক্যাম্পাস ও কার্যক্রমের ছবি দেখুন।`,
    image: content.gallery && content.gallery[0] && content.gallery[0].url,
  }),
  "/notices": (site) => ({
    title: `নোটিসেস — ${site.name || defaultName(site)}`,
    description: `${site.name || defaultName(site)}-এর সাম্প্রতিক নোটিস ও ঘোষণা দেখুন।`,
  }),
  "/result": (site) => ({
    title: `ফলাফল দেখুন — ${site.name || defaultName(site)}`,
    description: `${site.name || defaultName(site)}-এর পরীক্ষার ফলাফল অনলাইনে দেখুন — ক্লাস ও রোল নম্বর দিয়ে খুঁজুন।`,
    noindex: true, // personal lookup form/results, not indexable content
  }),
  "/terms": (site) => ({
    title: `শর্তাবলী — ${site.name || defaultName(site)}`,
    description: `${site.name || defaultName(site)} ব্যবহারের শর্তাবলী ও নিয়মকানুন।`,
  }),
  "/privacy": (site) => ({
    title: `গোপনীয়তা নীতি — ${site.name || defaultName(site)}`,
    description: `${site.name || defaultName(site)}-এ শিক্ষার্থী ও অভিভাবকের তথ্য কীভাবে সংগ্রহ, সংরক্ষণ ও ব্যবহার করা হয়।`,
  }),
};

// Every public route above (indexable ones only), used by both the sitemap
// route and any future "which paths are public" check.
const INDEXABLE_PUBLIC_PATHS = Object.entries(PUBLIC_ROUTES)
  .filter(([, build]) => !build({}, {}).noindex)
  .map(([path]) => path);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

// `site` = getPublicSettings() result, `content` = getSiteContent() result,
// `pathname` = req.path (already normalized by Express, no query string).
function buildSeoMeta(pathname, site, content, origin) {
  const name = (site && site.name) || defaultName(site);
  const builder = PUBLIC_ROUTES[pathname];

  const base = builder
    ? builder(site || {}, content || {})
    : {
        title: `${name} — ERP`,
        description: fallbackDescription(name),
        noindex: true, // unknown / admin / auth-gated path — never index
      };

  const image = base.image || (site && site.logo) || "/og-default.png";

  return {
    title: base.title,
    description: base.description,
    image: /^https?:\/\//i.test(image) ? image : `${origin}${image.startsWith("/") ? "" : "/"}${image}`,
    url: `${origin}${pathname}`,
    robots: base.noindex ? "noindex, nofollow" : "index, follow",
    siteName: name,
  };
}

// Replaces the <title>, description/robots meta, canonical link, and the
// whole SEO:OG:START..SEO:OG:END block in an already-built index.html with
// per-route values. Anything not matched by the regexes below is left
// untouched (fails safe — worst case the static defaults from
// client/index.html show through).
function injectSeoMeta(html, meta) {
  let out = html;

  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);

  out = out.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${escapeHtml(meta.description)}$2`
  );

  out = out.replace(/(<meta\s+name="robots"\s+content=")[^"]*("[^>]*>)/, `$1${meta.robots}$2`);

  out = out.replace(/(<link\s+rel="canonical"\s+href=")[^"]*("[^>]*>)/, `$1${escapeHtml(meta.url)}$2`);

  const ogBlock = [
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`,
  ].join("\n    ");

  out = out.replace(
    /<!-- SEO:OG:START -->[\s\S]*?<!-- SEO:OG:END -->/,
    `<!-- SEO:OG:START -->\n    ${ogBlock}\n    <!-- SEO:OG:END -->`
  );

  return out;
}

module.exports = { buildSeoMeta, injectSeoMeta, INDEXABLE_PUBLIC_PATHS, PUBLIC_ROUTES };

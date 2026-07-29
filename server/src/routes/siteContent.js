const express = require("express");
const { canAccess } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { getDraftSiteContent, saveDraftSiteContent, publishSiteContent } = require("../lib/siteContent");

const router = express.Router();

// #10 fix: previously this whole route required the single "website"
// permission, so there was no way to grant someone gallery- or
// notice-board-only access. GET is open to anyone holding at least one of
// the three website-ish permissions (they need to load the current content
// to edit their own section); PUT is gated further below, per field, since
// the content is saved as one JSON blob (see lib/siteContent.js) rather
// than one endpoint per section.
router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  if (canAccess(req.user.role, ["website", "websiteGallery", "websiteNotices"])) return next();
  return res.status(403).json({ error: "Access denied" });
});

// Which top-level siteContent keys each narrower permission is allowed to
// change. Anything not listed under a role's permission set is rejected if
// the incoming value differs from what's already stored — so a
// gallery-only editor can still submit the full content object (the client
// always does) without accidentally being able to overwrite the hero text.
const GALLERY_KEYS = new Set([
  "gallery",
  "galleryHeroBadge",
  "galleryHeroTitle",
  "galleryHeroSubtitle",
  "galleryIntroBadge",
  "galleryIntroTitle",
  "galleryIntroSubtitle",
]);
const NOTICES_KEYS = new Set(["notices"]);

function stableStringify(value) {
  return JSON.stringify(value);
}

// Draft/publish split: this whole router now reads and writes the DRAFT
// copy only. The public site (/api/public/site-content, registered
// separately in index.js) always reads the live copy, so nothing a
// section editor saves here reaches visitors until POST /publish below.
router.get("/", async (_req, res) => {
  res.json(await getDraftSiteContent());
});

router.put("/", async (req, res) => {
  const hasFullWebsite = canAccess(req.user.role, "website");
  if (!hasFullWebsite) {
    const hasGallery = canAccess(req.user.role, "websiteGallery");
    const hasNotices = canAccess(req.user.role, "websiteNotices");
    const current = await getDraftSiteContent();
    for (const key of Object.keys(req.body || {})) {
      const allowed = (hasGallery && GALLERY_KEYS.has(key)) || (hasNotices && NOTICES_KEYS.has(key));
      if (allowed) continue;
      const unchanged = stableStringify(req.body[key]) === stableStringify(current[key]);
      if (!unchanged) {
        return res.status(403).json({ error: `এই অংশ পরিবর্তনের অনুমতি নেই: ${key}` });
      }
    }
  }

  const content = await saveDraftSiteContent(req.body);
  await recordAudit({
    action: "site-content.draft-saved",
    actor: req.user,
    entityType: "siteContent",
    entityId: 0,
    label: "Saved a draft of the public website content",
    details: content,
  });
  res.json(content);
});

// Copies the current draft into the live copy that visitors see. Requires
// full "website" access — publishing affects every section at once, not
// just whichever field a gallery/notices-only editor is scoped to.
router.post("/publish", async (req, res) => {
  if (!canAccess(req.user.role, "website")) {
    return res.status(403).json({ error: "প্রকাশ করার অনুমতি নেই" });
  }
  const content = await publishSiteContent();
  await recordAudit({
    action: "site-content.published",
    actor: req.user,
    entityType: "siteContent",
    entityId: 0,
    label: "Published the public website content",
    details: content,
  });
  res.json(content);
});

module.exports = router;

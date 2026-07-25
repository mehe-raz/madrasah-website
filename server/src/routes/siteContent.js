const express = require("express");
const { canAccess } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { getSiteContent, saveSiteContent } = require("../lib/siteContent");

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

router.get("/", async (_req, res) => {
  res.json(await getSiteContent());
});

router.put("/", async (req, res) => {
  const hasFullWebsite = canAccess(req.user.role, "website");
  if (!hasFullWebsite) {
    const hasGallery = canAccess(req.user.role, "websiteGallery");
    const hasNotices = canAccess(req.user.role, "websiteNotices");
    const current = await getSiteContent();
    for (const key of Object.keys(req.body || {})) {
      const allowed = (hasGallery && GALLERY_KEYS.has(key)) || (hasNotices && NOTICES_KEYS.has(key));
      if (allowed) continue;
      const unchanged = stableStringify(req.body[key]) === stableStringify(current[key]);
      if (!unchanged) {
        return res.status(403).json({ error: `এই অংশ পরিবর্তনের অনুমতি নেই: ${key}` });
      }
    }
  }

  const content = await saveSiteContent(req.body);
  await recordAudit({
    action: "site-content.updated",
    actor: req.user,
    entityType: "siteContent",
    entityId: 0,
    label: "Updated public website content",
    details: content,
  });
  res.json(content);
});

module.exports = router;

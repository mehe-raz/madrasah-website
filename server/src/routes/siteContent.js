const express = require("express");
const { requirePermission } = require("../middleware/rbac");
const { recordAudit } = require("../lib/auditLog");
const { getSiteContent, saveSiteContent } = require("../lib/siteContent");

const router = express.Router();
// Defense-in-depth: don't rely solely on the global rbacMiddleware in index.js.
// Only Admin / Super Admin hold the "website" permission (see middleware/rbac.js),
// so nobody else can reach these endpoints even if they guess the URL.
router.use(requirePermission("website"));

router.get("/", async (_req, res) => {
  res.json(await getSiteContent());
});

router.put("/", async (req, res) => {
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

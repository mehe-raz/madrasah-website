const express = require("express");
const rateLimit = require("express-rate-limit");
const { cloudinary, configureOnce, isConfigured } = require("../lib/cloudinary");
const { canAccess } = require("../middleware/rbac");

const router = express.Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload attempts" },
});

const MAX_BYTES = 1024 * 1024; // 1MB of decoded file data (matches client-side 750KB source limit)

function dataUrlInfo(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  const [, mime, base64] = match;
  return { mime, base64, bytes: Buffer.byteLength(base64, "base64") };
}

router.post("/", uploadLimiter, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    });
  }

  const { dataUrl, folder } = req.body || {};
  const folderName = String(folder || "misc").trim();
  const requiredPermission = folderName.toLowerCase().startsWith("settings") ? "settings" : "students";
  if (!req.user) return res.status(401).json({ error: "Login required" });
  if (!canAccess(req.user.role, requiredPermission)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const info = dataUrlInfo(dataUrl);
  if (!info) return res.status(400).json({ error: "A base64 data URL is required" });

  const allowed = info.mime.startsWith("image/") || info.mime === "application/pdf";
  if (!allowed) return res.status(400).json({ error: "Only images or PDF files are allowed" });
  if (info.bytes > MAX_BYTES) return res.status(400).json({ error: "File must be 1MB or smaller" });

  configureOnce();

  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: `madrasah/${folderName.replace(/[^a-zA-Z0-9_-]/g, "") || "misc"}`,
      resource_type: info.mime === "application/pdf" ? "raw" : "image",
    });
    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error("Cloudinary upload failed:", err.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;

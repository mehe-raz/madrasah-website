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
  const folderLower = folderName.toLowerCase();
  let requiredPermission = "students";
  if (folderLower.startsWith("settings")) requiredPermission = "settings";
  else if (folderLower.startsWith("website") || folderLower.startsWith("gallery")) requiredPermission = "website";
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
    const isImage = info.mime !== "application/pdf";
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: `madrasah/${folderName.replace(/[^a-zA-Z0-9_-]/g, "") || "misc"}`,
      resource_type: isImage ? "image" : "raw",
    });
    // For images, serve through f_auto,q_auto so Cloudinary picks the best
    // format (WebP/AVIF where the browser supports it) and compression
    // automatically, instead of always sending the original upload as-is.
    // This is a delivery-URL transformation only — the stored asset is
    // untouched, so nothing here is lossy or irreversible.
    const url = isImage
      ? cloudinary.url(result.public_id, {
          secure: true,
          resource_type: "image",
          fetch_format: "auto",
          quality: "auto",
          version: result.version,
        })
      : result.secure_url;
    res.json({ url, publicId: result.public_id });
  } catch (err) {
    console.error("Cloudinary upload failed:", err.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Deletes an uploaded asset from Cloudinary storage — used when the admin
// removes a gallery photo (or replaces one) so the file doesn't keep
// sitting in Cloudinary forever, unreferenced, still counting against
// storage/bandwidth quota. Only the publicId is needed (not the full URL);
// the required permission is derived from its folder segment
// ("madrasah/<folder>/...") the same way upload above derives it, so a
// role that couldn't upload into a folder also can't delete from it.
router.delete("/", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    });
  }

  const { publicId, resourceType } = req.body || {};
  if (!publicId || typeof publicId !== "string") {
    return res.status(400).json({ error: "publicId is required" });
  }

  const folderSegment = publicId.split("/")[1] || "misc";
  const folderLower = folderSegment.toLowerCase();
  let requiredPermission = "students";
  if (folderLower.startsWith("settings")) requiredPermission = "settings";
  else if (folderLower.startsWith("website") || folderLower.startsWith("gallery")) requiredPermission = "website";
  if (!req.user) return res.status(401).json({ error: "Login required" });
  if (!canAccess(req.user.role, requiredPermission)) {
    return res.status(403).json({ error: "Access denied" });
  }

  configureOnce();

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType === "raw" ? "raw" : "image",
    });
    // Cloudinary returns { result: "not found" } (not an error) when the
    // asset is already gone — treat that as success too, since the end
    // state the caller wants (asset absent) is already true.
    res.json({ ok: true, result: result.result });
  } catch (err) {
    console.error("Cloudinary delete failed:", err.message);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;

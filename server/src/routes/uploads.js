const express = require("express");
const { cloudinary, configureOnce, isConfigured } = require("../lib/cloudinary");

const router = express.Router();

const MAX_BYTES = 1024 * 1024; // 1MB of decoded file data (matches client-side 750KB source limit)

function dataUrlInfo(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  const [, mime, base64] = match;
  return { mime, base64, bytes: Buffer.byteLength(base64, "base64") };
}

router.post("/", async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    });
  }

  const { dataUrl, folder } = req.body || {};
  const info = dataUrlInfo(dataUrl);
  if (!info) return res.status(400).json({ error: "A base64 data URL is required" });

  const allowed = info.mime.startsWith("image/") || info.mime === "application/pdf";
  if (!allowed) return res.status(400).json({ error: "Only images or PDF files are allowed" });
  if (info.bytes > MAX_BYTES) return res.status(400).json({ error: "File must be 1MB or smaller" });

  configureOnce();

  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: `madrasah/${String(folder || "misc").replace(/[^a-zA-Z0-9_-]/g, "")}`,
      resource_type: info.mime === "application/pdf" ? "raw" : "image",
    });
    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error("Cloudinary upload failed:", err.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;

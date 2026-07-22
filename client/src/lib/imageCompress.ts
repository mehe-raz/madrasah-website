// Resizes and re-encodes an image file entirely in the browser before upload.
// Typical phone photos (3000-4000px wide, 3-8MB) are shrunk to a web-appropriate
// size with no visible quality loss, usually landing well under 1MB.

export type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1, JPEG quality
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ছবি পড়া যায়নি, আবার চেষ্টা করুন।"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("ছবি লোড করা যায়নি।"));
    img.src = src;
  });
}

export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] || "";
  // base64 encodes 3 bytes as 4 chars; padding chars don't count as data
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// Resizes so the image fits within maxWidth x maxHeight (keeping aspect ratio,
// never upscaling), then re-encodes as JPEG at the given quality.
export async function compressImage(file: File, options: CompressOptions = {}): Promise<string> {
  const { maxWidth = 1600, maxHeight = 1600, quality = 0.85 } = options;

  // Non-image files (shouldn't normally reach here) just pass through as-is.
  const sourceDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(sourceDataUrl);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale < 1) {
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Canvas unsupported for some reason — fall back to the original file.
    return sourceDataUrl;
  }
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

// Compresses progressively (shrinking dimensions/quality further) until the
// result fits under maxBytes, or gives up after a few attempts.
export async function compressImageToLimit(
  file: File,
  maxBytes: number,
  options: CompressOptions = {}
): Promise<string> {
  const attempts: CompressOptions[] = [
    { maxWidth: options.maxWidth ?? 1600, maxHeight: options.maxHeight ?? 1600, quality: options.quality ?? 0.85 },
    { maxWidth: 1600, maxHeight: 1600, quality: 0.7 },
    { maxWidth: 1200, maxHeight: 1200, quality: 0.7 },
    { maxWidth: 1000, maxHeight: 1000, quality: 0.6 },
  ];

  let result = "";
  for (const attempt of attempts) {
    result = await compressImage(file, attempt);
    if (dataUrlBytes(result) <= maxBytes) return result;
  }
  return result; // best effort — caller decides whether to accept or reject
}

// Rewrites a Cloudinary delivery URL to request a resized/auto-format
// variant instead of the original upload — same image, visibly identical,
// far fewer bytes over the wire (Cloudinary transforms + caches these on
// the fly, nothing to configure server-side). Falls back to the original
// URL untouched for anything that isn't a Cloudinary "/image/upload/" URL,
// so it's always safe to call even on a non-Cloudinary or malformed value.
const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

export function cloudinaryResize(url: string, transform: string): string {
  const idx = url.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (idx === -1) return url;
  const insertAt = idx + CLOUDINARY_UPLOAD_MARKER.length;
  return `${url.slice(0, insertAt)}${transform}/${url.slice(insertAt)}`;
}

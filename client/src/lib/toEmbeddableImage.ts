export type EmbeddableImage = { dataUrl: string; type: "PNG" | "JPEG" };

/**
 * jsPDF's addImage() needs raw base64 image data, not a URL. Settings.logo
 * used to always be a base64 data URL (stored directly in the database);
 * after the Cloudinary migration it's usually an https:// URL instead. This
 * fetches remote URLs and converts them to a data URL so both old and new
 * logo values keep working in PDF exports.
 */
export async function toEmbeddableImage(src: string | undefined | null): Promise<EmbeddableImage | null> {
  if (!src) return null;

  if (src.startsWith("data:image/")) {
    return { dataUrl: src, type: src.startsWith("data:image/png") ? "PNG" : "JPEG" };
  }

  if (!/^https?:\/\//i.test(src)) return null;

  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, type: blob.type.includes("png") ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

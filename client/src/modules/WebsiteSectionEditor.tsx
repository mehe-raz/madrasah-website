import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { HudSpinner } from "../components/HudSpinner";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { compressImageToLimit, dataUrlBytes } from "../lib/imageCompress";
import { C } from "../theme/colors";
import type { SiteAdmissionStep, SiteClassItem, SiteContent, SiteDepartment, SiteGalleryItem, SiteHighlight, SiteNotice } from "../types";

const EMPTY_CONTENT: SiteContent = {
  badge: "",
  heroSubtitle: "",
  highlights: [],
  departments: [],
  classes: [],
  notices: [],
  aboutIntro: "",
  aboutMission: "",
  gallery: [],
  admissionBadge: "",
  admissionTitle: "",
  admissionSubtitle: "",
  admissionSteps: [],
  galleryHeroBadge: "",
  galleryHeroTitle: "",
  galleryHeroSubtitle: "",
  galleryIntroBadge: "",
  galleryIntroTitle: "",
  galleryIntroSubtitle: "",
};

const SECTION_LIMITS = {
  highlights: 8,
  departments: 8,
  classes: 24,
  notices: 60,
  gallery: 24,
  admissionSteps: 6,
} as const;

const MAX_GALLERY_UPLOAD_BYTES = 950_000; // final upload size cap, under server's 1MB decoded limit
const MAX_GALLERY_SOURCE_BYTES = 25 * 1024 * 1024; // 25MB — sanity check on the original phone photo
const GALLERY_MAX_DIMENSION = 1600; // px — plenty for gallery cards/lightbox, invisible to the eye
const GALLERY_JPEG_QUALITY = 0.85; // visually lossless, big size reduction

// Same upload/compression pattern as gallery photos above, reused for the
// optional per-card image on departments/classes/admission-step entries.
// Smaller max dimension since these render as small card thumbnails, not
// full gallery photos.
const MAX_ITEM_IMAGE_UPLOAD_BYTES = 950_000;
const MAX_ITEM_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
const ITEM_IMAGE_MAX_DIMENSION = 1200;
const ITEM_IMAGE_JPEG_QUALITY = 0.85;

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

const iconInputStyle = { ...inputStyle, width: 72, textAlign: "center" as const, flexShrink: 0 };

type SectionId = "hero" | "about" | "highlights" | "departments" | "classes" | "notices" | "gallery" | "admission";

const SECTION_META: Record<SectionId, { title: string; subtitle: string; note: string; icon: string }> = {
  hero: {
    title: "হিরো সেকশন",
    subtitle: "পাবলিক হোমপেজের প্রথম ভিজিটর অভিজ্ঞতা",
    note: "ব্যাজ এবং মূল বর্ণনা এখান থেকে সম্পাদনা করুন।",
    icon: "🏠",
  },
  about: {
    title: "এবাউট পেজ",
    subtitle: "শুধু About পেজে দেখা যাবে",
    note: "পরিচিতি ও লক্ষ্য/মিশন অংশ আলাদা করে নিয়ন্ত্রণ করুন।",
    icon: "📖",
  },
  highlights: {
    title: "হাইলাইটস",
    subtitle: "হোমপেজে ছোট বৈশিষ্ট্য",
    note: "সংক্ষিপ্ত icon + text আইটেমগুলো এখানে আপডেট হবে।",
    icon: "✨",
  },
  departments: {
    title: "বিভাগসমূহ",
    subtitle: "পাবলিক প্রোগ্রাম লিস্ট",
    note: "প্রতিটি বিভাগের নাম, আইকন এবং সংক্ষিপ্ত বিবরণ দিন। চাইলে প্রতিটি বিভাগে একটি ছবিও যোগ করতে পারেন — ছবি না দিলে আগের মতোই আইকন কার্ড দেখাবে।",
    icon: "🏛️",
  },
  classes: {
    title: "ক্লাস ও কোর্স",
    subtitle: "ভর্তি ও ক্লাস পেজ",
    note: "ক্লাস/কোর্স লিস্ট আলাদাভাবে এডিট করা যাবে। চাইলে প্রতিটি ক্লাসে একটি ছবিও যোগ করা যাবে (ঐচ্ছিক)।",
    icon: "🎓",
  },
  notices: {
    title: "নোটিশ",
    subtitle: "পাবলিক নোটিশ বোর্ড",
    note: "শিরোনাম, তারিখ, এবং বিস্তারিত নোটিশ এখানে আপডেট হবে।",
    icon: "📢",
  },
  gallery: {
    title: "গ্যালারি",
    subtitle: "পাবলিক গ্যালারি পেজ",
    note: "হিরো/ইন্ট্রো টেক্সট এবং ছবি — দুটোই এখান থেকে আপডেট হবে।",
    icon: "🖼️",
  },
  admission: {
    title: "ভর্তি পেজের কন্টেন্ট",
    subtitle: "পাবলিক ভর্তি পেজের হিরো ও ধাপসমূহ",
    note: "ব্যাজ, শিরোনাম, বর্ণনা এবং \"কীভাবে কাজ করে\" ধাপগুলো এখান থেকে আপডেট হবে। প্রতিটি ধাপে চাইলে একটি ছবিও যোগ করা যাবে (ঐচ্ছিক)।",
    icon: "📝",
  },
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: "0 8px 22px rgba(15,23,42,0.04)" }}>
      <h3 style={{ fontSize: 16, fontWeight: 900, color: C.text, margin: "0 0 4px" }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 13, color: C.muted, margin: "0 0 14px", lineHeight: 1.6 }}>{subtitle}</p>}
      {!subtitle && <div style={{ marginBottom: 6 }} />}
      {children}
    </div>
  );
}

function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function ReorderButton({ direction, onClick, disabled }: { direction: "up" | "down"; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={direction === "up" ? "উপরে সরান" : "নিচে সরান"}
      aria-label={direction === "up" ? "উপরে সরান" : "নিচে সরান"}
      style={{
        border: `1px solid ${C.border}`,
        background: disabled ? C.bg : C.card,
        color: disabled ? C.muted : C.text,
        borderRadius: 8,
        padding: "6px 10px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 800,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {direction === "up" ? "↑" : "↓"}
    </button>
  );
}

function ListEntryButtons({
  onRemove,
  disabled,
  onMoveUp,
  onMoveDown,
  moveUpDisabled,
  moveDownDisabled,
}: {
  onRemove: () => void;
  disabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {onMoveUp && <ReorderButton direction="up" onClick={onMoveUp} disabled={moveUpDisabled} />}
      {onMoveDown && <ReorderButton direction="down" onClick={onMoveDown} disabled={moveDownDisabled} />}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        style={{
          border: "none",
          background: C.roseL,
          color: C.roseD,
          borderRadius: 10,
          padding: "10px 12px",
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        মুছুন
      </button>
    </div>
  );
}

// Optional per-card photo picker, shared by the departments/classes/
// admission-step editors below. Purely additive: an item with no image
// keeps rendering as the plain icon card it always was, both here and on
// the public pages — this only offers a way to attach one.
function ItemImagePicker({
  image,
  uploading,
  onUpload,
  onRemove,
}: {
  image?: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  if (image) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, flexShrink: 0 }}
        />
        <button
          type="button"
          onClick={onRemove}
          style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
        >
          ছবি সরান
        </button>
      </div>
    );
  }

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        border: `1px dashed ${C.border}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 800,
        color: uploading ? C.muted : C.emerald,
        cursor: uploading ? "not-allowed" : "pointer",
      }}
    >
      <span>{uploading ? "আপলোড হচ্ছে…" : "＋ ছবি যোগ করুন (ঐচ্ছিক)"}</span>
      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          if (file) onUpload(file);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}

export function WebsiteSectionEditor() {
  const { t } = useLanguage();
  const params = useParams<{ sectionId: SectionId }>();
  const sectionId = params.sectionId as SectionId | undefined;
  const meta = sectionId ? SECTION_META[sectionId] : undefined;

  const [content, setContent] = useState<SiteContent>(EMPTY_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [galleryUploading, setGalleryUploading] = useState(false);
  // Tracks in-flight uploads for the optional per-card images on
  // departments/classes/admission-steps, keyed as "<section>-<index>" so
  // uploading one item's photo doesn't disable the others.
  const [itemImageUploading, setItemImageUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getDraftSiteContent()
      .then((data) => {
        if (cancelled) return;
        setContent({ ...EMPTY_CONTENT, ...data });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t.common.requestFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.common.requestFailed]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await api.saveSiteContent(content);
      setContent(result);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.students.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const updateHighlight = (index: number, patch: Partial<SiteHighlight>) => {
    setContent((prev) => ({ ...prev, highlights: prev.highlights.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  };

  const updateDepartment = (index: number, patch: Partial<SiteDepartment>) => {
    setContent((prev) => ({ ...prev, departments: prev.departments.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  };

  const updateClassItem = (index: number, patch: Partial<SiteClassItem>) => {
    setContent((prev) => ({ ...prev, classes: prev.classes.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  };

  const updateNotice = (index: number, patch: Partial<SiteNotice>) => {
    setContent((prev) => ({ ...prev, notices: prev.notices.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  };

  const updateGalleryItem = (index: number, patch: Partial<SiteGalleryItem>) => {
    setContent((prev) => ({ ...prev, gallery: prev.gallery.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  };

  const updateAdmissionStep = (index: number, patch: Partial<SiteAdmissionStep>) => {
    setContent((prev) => ({ ...prev, admissionSteps: prev.admissionSteps.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  };

  const addHighlight = () => {
    if (content.highlights.length >= SECTION_LIMITS.highlights) return;
    setContent((prev) => ({ ...prev, highlights: [...prev.highlights, { icon: "✨", label: "" }] }));
  };

  const addDepartment = () => {
    if (content.departments.length >= SECTION_LIMITS.departments) return;
    setContent((prev) => ({ ...prev, departments: [...prev.departments, { icon: "📖", title: "", desc: "" }] }));
  };

  const addClassItem = () => {
    if (content.classes.length >= SECTION_LIMITS.classes) return;
    setContent((prev) => ({ ...prev, classes: [...prev.classes, { icon: "🎓", title: "", desc: "" }] }));
  };

  const addNotice = () => {
    if (content.notices.length >= SECTION_LIMITS.notices) return;
    const today = new Date().toISOString().slice(0, 10);
    setContent((prev) => ({ ...prev, notices: [{ title: "", date: today, body: "" }, ...prev.notices] }));
  };

  const addAdmissionStep = () => {
    if (content.admissionSteps.length >= SECTION_LIMITS.admissionSteps) return;
    setContent((prev) => ({ ...prev, admissionSteps: [...prev.admissionSteps, { icon: "✓", title: "", desc: "" }] }));
  };

  const uploadGalleryPhoto = async (file: File | null) => {
    if (!file) return;
    if (content.gallery.length >= SECTION_LIMITS.gallery) return;
    if (!file.type.startsWith("image/")) {
      setError("শুধু ছবি ফাইল আপলোড করা যাবে।");
      return;
    }
    if (file.size > MAX_GALLERY_SOURCE_BYTES) {
      setError("ছবির আকার সর্বোচ্চ ২৫ মেগাবাইট হতে হবে।");
      return;
    }
    setError("");
    setGalleryUploading(true);
    try {
      // Resize to a web-appropriate resolution and re-encode as JPEG in the
      // browser — this shrinks typical phone photos (3-8MB) down to a few
      // hundred KB with no visible quality loss before they ever leave the device.
      const compressed = await compressImageToLimit(file, MAX_GALLERY_UPLOAD_BYTES, {
        maxWidth: GALLERY_MAX_DIMENSION,
        maxHeight: GALLERY_MAX_DIMENSION,
        quality: GALLERY_JPEG_QUALITY,
      });
      if (dataUrlBytes(compressed) > MAX_GALLERY_UPLOAD_BYTES) {
        setError("ছবিটি সংকুচিত করার পরও আকার বেশি বড়। অন্য একটি ছবি চেষ্টা করুন।");
        return;
      }
      const { url, publicId } = await api.uploadFile(compressed, "gallery");
      setContent((prev) => ({ ...prev, gallery: [...prev.gallery, { url, caption: "", publicId }] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ছবি আপলোড ব্যর্থ হয়েছে");
    } finally {
      setGalleryUploading(false);
    }
  };

  // Shared by the departments/classes/admission-step editors: compress +
  // upload one optional card photo, then hand the resulting
  // {image, imagePublicId} back to the caller's own update function. `key`
  // (e.g. "departments-2") scopes the in-flight flag to just that card.
  const uploadItemImage = async (key: string, file: File | null, onDone: (patch: { image: string; imagePublicId: string }) => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("শুধু ছবি ফাইল আপলোড করা যাবে।");
      return;
    }
    if (file.size > MAX_ITEM_IMAGE_SOURCE_BYTES) {
      setError("ছবির আকার সর্বোচ্চ ২৫ মেগাবাইট হতে হবে।");
      return;
    }
    setError("");
    setItemImageUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const compressed = await compressImageToLimit(file, MAX_ITEM_IMAGE_UPLOAD_BYTES, {
        maxWidth: ITEM_IMAGE_MAX_DIMENSION,
        maxHeight: ITEM_IMAGE_MAX_DIMENSION,
        quality: ITEM_IMAGE_JPEG_QUALITY,
      });
      if (dataUrlBytes(compressed) > MAX_ITEM_IMAGE_UPLOAD_BYTES) {
        setError("ছবিটি সংকুচিত করার পরও আকার বেশি বড়। অন্য একটি ছবি চেষ্টা করুন।");
        return;
      }
      const { url, publicId } = await api.uploadFile(compressed, "website-cards");
      onDone({ image: url, imagePublicId: publicId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ছবি আপলোড ব্যর্থ হয়েছে");
    } finally {
      setItemImageUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Best-effort Cloudinary cleanup, same reasoning as removeGalleryItem
  // below: the card's image field is cleared immediately either way, this
  // just avoids leaving the asset orphaned in storage.
  const removeItemImage = (imagePublicId: string | undefined) => {
    if (imagePublicId) {
      api.deleteUpload(imagePublicId).catch((err) => {
        console.error("Cloudinary cleanup failed for", imagePublicId, err);
      });
    }
  };

  const removeHighlight = (index: number) => setContent((prev) => ({ ...prev, highlights: prev.highlights.filter((_, i) => i !== index) }));
  const removeDepartment = (index: number) => setContent((prev) => ({ ...prev, departments: prev.departments.filter((_, i) => i !== index) }));
  const removeClassItem = (index: number) => setContent((prev) => ({ ...prev, classes: prev.classes.filter((_, i) => i !== index) }));
  const removeNotice = (index: number) => setContent((prev) => ({ ...prev, notices: prev.notices.filter((_, i) => i !== index) }));
  const removeAdmissionStep = (index: number) => setContent((prev) => ({ ...prev, admissionSteps: prev.admissionSteps.filter((_, i) => i !== index) }));

  // Reordering: public site renders each section in array order, so moving
  // an item up/down here directly controls what visitors see first.
  const moveHighlight = (index: number, dir: -1 | 1) => setContent((prev) => ({ ...prev, highlights: moveItem(prev.highlights, index, dir) }));
  const moveDepartment = (index: number, dir: -1 | 1) => setContent((prev) => ({ ...prev, departments: moveItem(prev.departments, index, dir) }));
  const moveClassItem = (index: number, dir: -1 | 1) => setContent((prev) => ({ ...prev, classes: moveItem(prev.classes, index, dir) }));
  const moveNotice = (index: number, dir: -1 | 1) => setContent((prev) => ({ ...prev, notices: moveItem(prev.notices, index, dir) }));
  const moveGalleryItem = (index: number, dir: -1 | 1) => setContent((prev) => ({ ...prev, gallery: moveItem(prev.gallery, index, dir) }));
  const moveAdmissionStep = (index: number, dir: -1 | 1) => setContent((prev) => ({ ...prev, admissionSteps: moveItem(prev.admissionSteps, index, dir) }));
  // Removes the photo from the list immediately (so the editor stays
  // responsive) and, separately, asks the server to delete the underlying
  // Cloudinary asset so it doesn't keep sitting in storage unreferenced.
  // The delete is best-effort: if it fails (network blip, already gone,
  // etc.) the photo still comes out of the gallery list either way — we
  // just log it instead of blocking the admin's edit on a cleanup call.
  const removeGalleryItem = (index: number) => {
    const item = content.gallery[index];
    setContent((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
    if (item?.publicId) {
      api.deleteUpload(item.publicId).catch((err) => {
        console.error("Cloudinary cleanup failed for", item.publicId, err);
      });
    }
  };

  const sectionContent = sectionId;

  if (!sectionId || !meta) {
    return <Navigate to="/website" replace />;
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <HudSpinner size={40} />
      </div>
    );
  }

  return (
    <div>
      <div
        className="soft-panel-strong gradient-border"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: 20,
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "auto -70px -70px auto",
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(16,185,129,0.14), transparent 70%)",
          }}
        />
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            fontSize: 26,
            background: C.slateL,
            flexShrink: 0,
            position: "relative",
          }}
        >
          {meta.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1, position: "relative" }}>
          <Link to="/website" style={{ color: C.teal, textDecoration: "none", fontSize: 12.5, fontWeight: 800 }}>
            ← সব সেকশনের লিস্টে ফিরুন
          </Link>
          <h2 style={{ fontSize: 21, fontWeight: 900, color: C.text, margin: "4px 0 0" }}>{meta.title}</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0", lineHeight: 1.6, maxWidth: 640 }}>{meta.subtitle}</p>
        </div>
      </div>

      {error && (
        <div style={{ background: C.roseL, color: C.roseD, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: `1px solid ${C.border}`, background: C.slateL, color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
        💡 {meta.note}
      </div>

      {sectionContent === "hero" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label={`ব্যাজ টেক্সট — ${content.badge.length}/120`}>
              <input
                value={content.badge}
                maxLength={120}
                onChange={(e) => setContent((prev) => ({ ...prev, badge: e.target.value }))}
                style={inputStyle}
                placeholder="যেমন: ডেমো ওয়েবসাইট — শীঘ্রই সম্পূর্ণ চালু হচ্ছে"
              />
            </Field>
            <Field label={`মূল বর্ণনা — ${content.heroSubtitle.length}/300`}>
              <textarea
                value={content.heroSubtitle}
                maxLength={300}
                rows={4}
                onChange={(e) => setContent((prev) => ({ ...prev, heroSubtitle: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="দ্বীনি ও আধুনিক শিক্ষার সমন্বয়ে..."
              />
            </Field>
          </div>
        </SectionCard>
      )}

      {sectionContent === "about" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label={`ভূমিকা — ${content.aboutIntro.length}/500`}>
              <textarea
                value={content.aboutIntro}
                maxLength={500}
                rows={4}
                onChange={(e) => setContent((prev) => ({ ...prev, aboutIntro: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="প্রতিষ্ঠানের পরিচিতি..."
              />
            </Field>
            <Field label={`লক্ষ্য ও উদ্দেশ্য — ${content.aboutMission.length}/500`}>
              <textarea
                value={content.aboutMission}
                maxLength={500}
                rows={4}
                onChange={(e) => setContent((prev) => ({ ...prev, aboutMission: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="প্রতিষ্ঠানের লক্ষ্য ও উদ্দেশ্য..."
              />
            </Field>
          </div>
        </SectionCard>
      )}

      {sectionContent === "highlights" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 10 }}>
            {content.highlights.map((item, index) => (
              <div key={index} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <input value={item.icon} maxLength={8} onChange={(e) => updateHighlight(index, { icon: e.target.value })} style={iconInputStyle} placeholder="✨" />
                <input
                  value={item.label}
                  maxLength={140}
                  onChange={(e) => updateHighlight(index, { label: e.target.value })}
                  style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                  placeholder="বৈশিষ্ট্যের লেখা"
                />
                <ListEntryButtons
                  onRemove={() => removeHighlight(index)}
                  onMoveUp={() => moveHighlight(index, -1)}
                  onMoveDown={() => moveHighlight(index, 1)}
                  moveUpDisabled={index === 0}
                  moveDownDisabled={index === content.highlights.length - 1}
                />
              </div>
            ))}
            {!content.highlights.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো হাইলাইট যোগ করা হয়নি।</p>}
            <button
              type="button"
              onClick={addHighlight}
              disabled={content.highlights.length >= SECTION_LIMITS.highlights}
              style={{
                border: `1px dashed ${C.border}`,
                background: "transparent",
                color: content.highlights.length >= SECTION_LIMITS.highlights ? C.muted : C.emerald,
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: content.highlights.length >= SECTION_LIMITS.highlights ? "not-allowed" : "pointer",
                width: "fit-content",
              }}
            >
              + নতুন হাইলাইট
            </button>
          </div>
        </SectionCard>
      )}

      {sectionContent === "departments" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 12 }}>
            {content.departments.map((item, index) => (
              <div key={index} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input value={item.icon} maxLength={8} onChange={(e) => updateDepartment(index, { icon: e.target.value })} style={iconInputStyle} placeholder="📖" />
                  <input
                    value={item.title}
                    maxLength={60}
                    onChange={(e) => updateDepartment(index, { title: e.target.value })}
                    style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                    placeholder="বিভাগের নাম"
                  />
                  <ListEntryButtons
                    onRemove={() => removeDepartment(index)}
                    onMoveUp={() => moveDepartment(index, -1)}
                    onMoveDown={() => moveDepartment(index, 1)}
                    moveUpDisabled={index === 0}
                    moveDownDisabled={index === content.departments.length - 1}
                  />
                </div>
                <textarea
                  value={item.desc}
                  maxLength={220}
                  rows={2}
                  onChange={(e) => updateDepartment(index, { desc: e.target.value })}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                  placeholder="সংক্ষিপ্ত বিবরণ"
                />
                <ItemImagePicker
                  image={item.image}
                  uploading={!!itemImageUploading[`departments-${index}`]}
                  onUpload={(file) => uploadItemImage(`departments-${index}`, file, (patch) => updateDepartment(index, patch))}
                  onRemove={() => {
                    removeItemImage(item.imagePublicId);
                    updateDepartment(index, { image: undefined, imagePublicId: undefined });
                  }}
                />
              </div>
            ))}
            {!content.departments.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো বিভাগ যোগ করা হয়নি।</p>}
            <button
              type="button"
              onClick={addDepartment}
              disabled={content.departments.length >= SECTION_LIMITS.departments}
              style={{
                border: `1px dashed ${C.border}`,
                background: "transparent",
                color: content.departments.length >= SECTION_LIMITS.departments ? C.muted : C.emerald,
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: content.departments.length >= SECTION_LIMITS.departments ? "not-allowed" : "pointer",
                width: "fit-content",
              }}
            >
              + নতুন বিভাগ
            </button>
          </div>
        </SectionCard>
      )}

      {sectionContent === "classes" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 12 }}>
            {content.classes.map((item, index) => (
              <div key={index} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input value={item.icon} maxLength={8} onChange={(e) => updateClassItem(index, { icon: e.target.value })} style={iconInputStyle} placeholder="🎓" />
                  <input
                    value={item.title}
                    maxLength={60}
                    onChange={(e) => updateClassItem(index, { title: e.target.value })}
                    style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                    placeholder="ক্লাসের নাম"
                  />
                  <ListEntryButtons
                    onRemove={() => removeClassItem(index)}
                    onMoveUp={() => moveClassItem(index, -1)}
                    onMoveDown={() => moveClassItem(index, 1)}
                    moveUpDisabled={index === 0}
                    moveDownDisabled={index === content.classes.length - 1}
                  />
                </div>
                <textarea
                  value={item.desc}
                  maxLength={160}
                  rows={2}
                  onChange={(e) => updateClassItem(index, { desc: e.target.value })}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                  placeholder="সংক্ষিপ্ত বিবরণ (ঐচ্ছিক)"
                />
                <ItemImagePicker
                  image={item.image}
                  uploading={!!itemImageUploading[`classes-${index}`]}
                  onUpload={(file) => uploadItemImage(`classes-${index}`, file, (patch) => updateClassItem(index, patch))}
                  onRemove={() => {
                    removeItemImage(item.imagePublicId);
                    updateClassItem(index, { image: undefined, imagePublicId: undefined });
                  }}
                />
              </div>
            ))}
            {!content.classes.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো ক্লাস যোগ করা হয়নি।</p>}
            <button
              type="button"
              onClick={addClassItem}
              disabled={content.classes.length >= SECTION_LIMITS.classes}
              style={{
                border: `1px dashed ${C.border}`,
                background: "transparent",
                color: content.classes.length >= SECTION_LIMITS.classes ? C.muted : C.emerald,
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: content.classes.length >= SECTION_LIMITS.classes ? "not-allowed" : "pointer",
                width: "fit-content",
              }}
            >
              + নতুন ক্লাস
            </button>
          </div>
        </SectionCard>
      )}

      {sectionContent === "notices" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 12 }}>
            {content.notices.map((item, index) => (
              <div key={index} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input
                    value={item.title}
                    maxLength={140}
                    onChange={(e) => updateNotice(index, { title: e.target.value })}
                    style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                    placeholder="নোটিশের শিরোনাম"
                  />
                  <input type="date" value={item.date} onChange={(e) => updateNotice(index, { date: e.target.value })} style={{ ...inputStyle, width: 150 }} />
                  <ListEntryButtons
                    onRemove={() => removeNotice(index)}
                    onMoveUp={() => moveNotice(index, -1)}
                    onMoveDown={() => moveNotice(index, 1)}
                    moveUpDisabled={index === 0}
                    moveDownDisabled={index === content.notices.length - 1}
                  />
                </div>
                <textarea
                  value={item.body}
                  maxLength={600}
                  rows={3}
                  onChange={(e) => updateNotice(index, { body: e.target.value })}
                  style={{ ...inputStyle, resize: "vertical" as const }}
                  placeholder="নোটিশের বিস্তারিত"
                />
              </div>
            ))}
            {!content.notices.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো নোটিশ যোগ করা হয়নি।</p>}
            <button
              type="button"
              onClick={addNotice}
              disabled={content.notices.length >= SECTION_LIMITS.notices}
              style={{
                border: `1px dashed ${C.border}`,
                background: "transparent",
                color: content.notices.length >= SECTION_LIMITS.notices ? C.muted : C.emerald,
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: content.notices.length >= SECTION_LIMITS.notices ? "not-allowed" : "pointer",
                width: "fit-content",
              }}
            >
              + নতুন নোটিশ
            </button>
          </div>
        </SectionCard>
      )}

      {sectionContent === "gallery" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label={`হিরো ব্যাজ — ${content.galleryHeroBadge.length}/60`}>
              <input
                value={content.galleryHeroBadge}
                maxLength={60}
                onChange={(e) => setContent((prev) => ({ ...prev, galleryHeroBadge: e.target.value }))}
                style={inputStyle}
                placeholder="গ্যালারি"
              />
            </Field>
            <Field label={`হিরো শিরোনাম — ${content.galleryHeroTitle.length}/120`}>
              <input
                value={content.galleryHeroTitle}
                maxLength={120}
                onChange={(e) => setContent((prev) => ({ ...prev, galleryHeroTitle: e.target.value }))}
                style={inputStyle}
                placeholder="ক্যাম্পাসের ছবিতে কিছু মুহূর্ত"
              />
            </Field>
            <Field label={`হিরো বর্ণনা — ${content.galleryHeroSubtitle.length}/300`}>
              <textarea
                value={content.galleryHeroSubtitle}
                maxLength={300}
                rows={2}
                onChange={(e) => setContent((prev) => ({ ...prev, galleryHeroSubtitle: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="প্রতিষ্ঠানের কার্যক্রম, অনুষ্ঠান ও দৈনন্দিন পরিবেশের কিছু ছবি..."
              />
            </Field>
            <Field label={`ইন্ট্রো ব্যাজ — ${content.galleryIntroBadge.length}/60`}>
              <input
                value={content.galleryIntroBadge}
                maxLength={60}
                onChange={(e) => setContent((prev) => ({ ...prev, galleryIntroBadge: e.target.value }))}
                style={inputStyle}
                placeholder="মুহূর্তসমূহ"
              />
            </Field>
            <Field label={`ইন্ট্রো শিরোনাম — ${content.galleryIntroTitle.length}/120`}>
              <input
                value={content.galleryIntroTitle}
                maxLength={120}
                onChange={(e) => setContent((prev) => ({ ...prev, galleryIntroTitle: e.target.value }))}
                style={inputStyle}
                placeholder="ক্যাম্পাস জীবনের স্মরণীয় মুহূর্ত"
              />
            </Field>
            <Field label={`ইন্ট্রো বর্ণনা — ${content.galleryIntroSubtitle.length}/300`}>
              <input
                value={content.galleryIntroSubtitle}
                maxLength={300}
                onChange={(e) => setContent((prev) => ({ ...prev, galleryIntroSubtitle: e.target.value }))}
                style={inputStyle}
                placeholder="ছবিগুলো Website সেকশন থেকে নিয়মিত আপডেট করা হয়।"
              />
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              {content.gallery.map((item, index) => (
                <div key={index} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8, background: C.slateL }}
                  />
                  <input
                    value={item.caption}
                    maxLength={140}
                    onChange={(e) => updateGalleryItem(index, { caption: e.target.value })}
                    style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }}
                    placeholder="ক্যাপশন (ঐচ্ছিক)"
                  />
                  <ListEntryButtons
                    onRemove={() => removeGalleryItem(index)}
                    onMoveUp={() => moveGalleryItem(index, -1)}
                    onMoveDown={() => moveGalleryItem(index, 1)}
                    moveUpDisabled={index === 0}
                    moveDownDisabled={index === content.gallery.length - 1}
                  />
                </div>
              ))}

              <label
                style={{
                  border: `1px dashed ${C.border}`,
                  borderRadius: 12,
                  minHeight: 160,
                  display: "grid",
                  placeItems: "center",
                  gap: 8,
                  cursor: content.gallery.length >= SECTION_LIMITS.gallery || galleryUploading ? "not-allowed" : "pointer",
                  color: content.gallery.length >= SECTION_LIMITS.gallery ? C.muted : C.emerald,
                  textAlign: "center",
                  padding: 12,
                }}
              >
                <span style={{ fontSize: 24 }}>{galleryUploading ? "…" : "＋"}</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>
                  {galleryUploading
                    ? "আপলোড হচ্ছে…"
                    : content.gallery.length >= SECTION_LIMITS.gallery
                      ? `সর্বোচ্চ ${SECTION_LIMITS.gallery}টি ছবি`
                      : "ছবি আপলোড করুন"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={content.gallery.length >= SECTION_LIMITS.gallery || galleryUploading}
                  onChange={(e) => {
                    uploadGalleryPhoto(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </div>
            {!content.gallery.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো ছবি আপলোড করা হয়নি। ছবি যোগ করে নিচের "সংরক্ষণ করুন" বাটনে ক্লিক করলে তবেই সেটি পাবলিক গ্যালারি পেজে দেখা যাবে।</p>}
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>ছবি আপলোডের সময় স্বয়ংক্রিয়ভাবে সংকুচিত হবে, সর্বোচ্চ {SECTION_LIMITS.gallery}টি ছবি। পরিবর্তন পাবলিক পেজে দেখাতে "সংরক্ষণ করুন" বাটনে ক্লিক করতে ভুলবেন না।</p>
          </div>
        </SectionCard>
      )}

      {sectionContent === "admission" && (
        <SectionCard title={meta.title} subtitle={meta.subtitle}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label={`ব্যাজ টেক্সট — ${content.admissionBadge.length}/60`}>
              <input
                value={content.admissionBadge}
                maxLength={60}
                onChange={(e) => setContent((prev) => ({ ...prev, admissionBadge: e.target.value }))}
                style={inputStyle}
                placeholder="ভর্তি"
              />
            </Field>
            <Field label={`শিরোনাম — ${content.admissionTitle.length}/120`}>
              <input
                value={content.admissionTitle}
                maxLength={120}
                onChange={(e) => setContent((prev) => ({ ...prev, admissionTitle: e.target.value }))}
                style={inputStyle}
                placeholder="দ্রুত ও সহজ ভর্তি প্রক্রিয়া"
              />
            </Field>
            <Field label={`বর্ণনা — ${content.admissionSubtitle.length}/300`}>
              <textarea
                value={content.admissionSubtitle}
                maxLength={300}
                rows={2}
                onChange={(e) => setContent((prev) => ({ ...prev, admissionSubtitle: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="একটি ক্লাস বেছে নিন, বিস্তারিত দেখুন এবং ফর্মে এগিয়ে যান..."
              />
            </Field>

            <div>
              <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 700 }}>
                "কীভাবে কাজ করে" ধাপসমূহ
              </span>
              <div style={{ display: "grid", gap: 12 }}>
                {content.admissionSteps.map((item, index) => (
                  <div key={index} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <input value={item.icon} maxLength={8} onChange={(e) => updateAdmissionStep(index, { icon: e.target.value })} style={iconInputStyle} placeholder="①" />
                      <input
                        value={item.title}
                        maxLength={60}
                        onChange={(e) => updateAdmissionStep(index, { title: e.target.value })}
                        style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                        placeholder="ধাপের শিরোনাম"
                      />
                      <ListEntryButtons
                        onRemove={() => removeAdmissionStep(index)}
                        onMoveUp={() => moveAdmissionStep(index, -1)}
                        onMoveDown={() => moveAdmissionStep(index, 1)}
                        moveUpDisabled={index === 0}
                        moveDownDisabled={index === content.admissionSteps.length - 1}
                      />
                    </div>
                    <textarea
                      value={item.desc}
                      maxLength={220}
                      rows={2}
                      onChange={(e) => updateAdmissionStep(index, { desc: e.target.value })}
                      style={{ ...inputStyle, resize: "vertical" as const }}
                      placeholder="সংক্ষিপ্ত বিবরণ"
                    />
                    <ItemImagePicker
                      image={item.image}
                      uploading={!!itemImageUploading[`admissionSteps-${index}`]}
                      onUpload={(file) => uploadItemImage(`admissionSteps-${index}`, file, (patch) => updateAdmissionStep(index, patch))}
                      onRemove={() => {
                        removeItemImage(item.imagePublicId);
                        updateAdmissionStep(index, { image: undefined, imagePublicId: undefined });
                      }}
                    />
                  </div>
                ))}
                {!content.admissionSteps.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো ধাপ যোগ করা হয়নি।</p>}
                <button
                  type="button"
                  onClick={addAdmissionStep}
                  disabled={content.admissionSteps.length >= SECTION_LIMITS.admissionSteps}
                  style={{
                    border: `1px dashed ${C.border}`,
                    background: "transparent",
                    color: content.admissionSteps.length >= SECTION_LIMITS.admissionSteps ? C.muted : C.emerald,
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontWeight: 800,
                    cursor: content.admissionSteps.length >= SECTION_LIMITS.admissionSteps ? "not-allowed" : "pointer",
                    width: "fit-content",
                  }}
                >
                  + নতুন ধাপ
                </button>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            background: saved ? C.emerald : C.teal,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "12px 24px",
            fontWeight: 800,
            fontSize: 15,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? t.students.saving : saved ? "✓ সংরক্ষিত হয়েছে" : "সংরক্ষণ করুন"}
        </button>
        <span style={{ fontSize: 12, color: C.muted }}>
          এটি শুধু ড্রাফট হিসেবে সংরক্ষণ হবে — পাবলিক সাইটে দেখাতে "ওয়েবসাইট ম্যানেজমেন্ট" পেজ থেকে প্রিভিউ করে প্রকাশ করুন।
        </span>
        <Link to="/website" style={{ textDecoration: "none", color: C.text, fontWeight: 800, fontSize: 13 }}>
          সেকশন লিস্টে ফিরুন
        </Link>
      </div>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { SiteClassItem, SiteContent, SiteDepartment, SiteHighlight, SiteNotice } from "../types";

const MAX_LIST = 8;
const MAX_CLASSES = 24;
const MAX_NOTICES = 30;

const EMPTY_CONTENT: SiteContent = {
  badge: "",
  heroSubtitle: "",
  highlights: [],
  departments: [],
  classes: [],
  notices: [],
  aboutIntro: "",
  aboutMission: "",
};

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

const iconInputStyle = { ...inputStyle, width: 64, textAlign: "center" as const, flexShrink: 0 };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 4px" }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px" }}>{subtitle}</p>}
      {!subtitle && <div style={{ marginBottom: 6 }} />}
      {children}
    </div>
  );
}

export function Website() {
  const { t } = useLanguage();
  const [content, setContent] = useState<SiteContent>(EMPTY_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicSiteContent()
      .then((data) => {
        if (!cancelled) setContent({ ...EMPTY_CONTENT, ...data });
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
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.students.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const updateHighlight = (index: number, patch: Partial<SiteHighlight>) => {
    setContent((prev) => ({
      ...prev,
      highlights: prev.highlights.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    }));
  };

  const updateDepartment = (index: number, patch: Partial<SiteDepartment>) => {
    setContent((prev) => ({
      ...prev,
      departments: prev.departments.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  };

  const updateClassItem = (index: number, patch: Partial<SiteClassItem>) => {
    setContent((prev) => ({
      ...prev,
      classes: prev.classes.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const addClassItem = () => {
    if (content.classes.length >= MAX_CLASSES) return;
    setContent((prev) => ({ ...prev, classes: [...prev.classes, { icon: "🎓", title: "", desc: "" }] }));
  };

  const removeClassItem = (index: number) => {
    setContent((prev) => ({ ...prev, classes: prev.classes.filter((_, i) => i !== index) }));
  };

  const updateNotice = (index: number, patch: Partial<SiteNotice>) => {
    setContent((prev) => ({
      ...prev,
      notices: prev.notices.map((n, i) => (i === index ? { ...n, ...patch } : n)),
    }));
  };

  const addNotice = () => {
    if (content.notices.length >= MAX_NOTICES) return;
    const today = new Date().toISOString().slice(0, 10);
    setContent((prev) => ({ ...prev, notices: [{ title: "", date: today, body: "" }, ...prev.notices] }));
  };

  const removeNotice = (index: number) => {
    setContent((prev) => ({ ...prev, notices: prev.notices.filter((_, i) => i !== index) }));
  };

  const addHighlight = () => {
    if (content.highlights.length >= MAX_LIST) return;
    setContent((prev) => ({ ...prev, highlights: [...prev.highlights, { icon: "✨", label: "" }] }));
  };

  const removeHighlight = (index: number) => {
    setContent((prev) => ({ ...prev, highlights: prev.highlights.filter((_, i) => i !== index) }));
  };

  const addDepartment = () => {
    if (content.departments.length >= MAX_LIST) return;
    setContent((prev) => ({ ...prev, departments: [...prev.departments, { icon: "🎓", title: "", desc: "" }] }));
  };

  const removeDepartment = (index: number) => {
    setContent((prev) => ({ ...prev, departments: prev.departments.filter((_, i) => i !== index) }));
  };

  if (loading) {
    return <div style={{ color: C.muted, padding: 20 }}>{t.common.loading}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>ওয়েবসাইট নিয়ন্ত্রণ</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
            আপনার প্রতিষ্ঠানের পাবলিক ওয়েবপেজে (লগইন ছাড়া ভিজিটররা যা দেখে) কী দেখানো হবে তা এখান থেকে সম্পাদনা করুন।
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          style={{ border: `1px solid ${C.border}`, background: C.card, color: C.text, borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
        >
          লাইভ পেজ দেখুন ↗
        </a>
      </div>

      {error && (
        <div style={{ background: C.roseL, color: C.roseD, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      <Card title="হিরো সেকশন" subtitle="পেজের শুরুতে দেখা যাওয়া ব্যাজ ও বর্ণনা">
        <div style={{ display: "grid", gap: 14 }}>
          <Field label={`ব্যাজ টেক্সট (সর্বোচ্চ ১২০ অক্ষর) — ${content.badge.length}/120`}>
            <input value={content.badge} maxLength={120} onChange={(e) => setContent((prev) => ({ ...prev, badge: e.target.value }))} style={inputStyle} placeholder="যেমন: ডেমো ওয়েবসাইট — শীঘ্রই সম্পূর্ণ চালু হচ্ছে" />
          </Field>
          <Field label={`মূল বর্ণনা (সর্বোচ্চ ৩০০ অক্ষর) — ${content.heroSubtitle.length}/300`}>
            <textarea
              value={content.heroSubtitle}
              maxLength={300}
              rows={3}
              onChange={(e) => setContent((prev) => ({ ...prev, heroSubtitle: e.target.value }))}
              style={{ ...inputStyle, resize: "vertical" as const }}
              placeholder="দ্বীনি ও আধুনিক শিক্ষার সমন্বয়ে আপনার সন্তানের উজ্জ্বল ভবিষ্যৎ গড়ে তুলুন।"
            />
          </Field>
        </div>
      </Card>

      <Card title="এবাউট পেজ" subtitle='শুধু পাবলিক "আমাদের সম্পর্কে" পেজে দেখানো হয় — হোম পেজের হিরো টেক্সটের সাথে মিশবে না'>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label={`ভূমিকা (সর্বোচ্চ ৫০০ অক্ষর) — ${content.aboutIntro.length}/500`}>
            <textarea
              value={content.aboutIntro}
              maxLength={500}
              rows={3}
              onChange={(e) => setContent((prev) => ({ ...prev, aboutIntro: e.target.value }))}
              style={{ ...inputStyle, resize: "vertical" as const }}
              placeholder="প্রতিষ্ঠানের পরিচিতি — এবাউট পেজের শুরুতে দেখা যাবে"
            />
          </Field>
          <Field label={`লক্ষ্য ও উদ্দেশ্য (সর্বোচ্চ ৫০০ অক্ষর) — ${content.aboutMission.length}/500`}>
            <textarea
              value={content.aboutMission}
              maxLength={500}
              rows={3}
              onChange={(e) => setContent((prev) => ({ ...prev, aboutMission: e.target.value }))}
              style={{ ...inputStyle, resize: "vertical" as const }}
              placeholder="প্রতিষ্ঠানের লক্ষ্য ও উদ্দেশ্য"
            />
          </Field>
        </div>
      </Card>

      <Card title="হাইলাইটস" subtitle={`ছোট ছোট বৈশিষ্ট্য যা হোম পেজে হিরোর নিচে দেখা যায় (সর্বোচ্চ ${MAX_LIST}টি)`}>
        <div style={{ display: "grid", gap: 10 }}>
          {content.highlights.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input value={h.icon} maxLength={8} onChange={(e) => updateHighlight(i, { icon: e.target.value })} style={iconInputStyle} placeholder="🏛️" />
              <input value={h.label} maxLength={140} onChange={(e) => updateHighlight(i, { label: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="বৈশিষ্ট্যের লেখা" />
              <button type="button" onClick={() => removeHighlight(i)} style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                মুছুন
              </button>
            </div>
          ))}
          {!content.highlights.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো হাইলাইট যোগ করা হয়নি।</p>}
          <button
            type="button"
            onClick={addHighlight}
            disabled={content.highlights.length >= MAX_LIST}
            style={{ border: `1px dashed ${C.border}`, background: "transparent", color: content.highlights.length >= MAX_LIST ? C.muted : C.emerald, borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: content.highlights.length >= MAX_LIST ? "not-allowed" : "pointer", width: "fit-content" }}
          >
            + নতুন হাইলাইট
          </button>
        </div>
      </Card>

      <Card title="বিভাগসমূহ" subtitle={`পাবলিক পেজে দেখানো বিভাগের তালিকা (সর্বোচ্চ ${MAX_LIST}টি)`}>
        <div style={{ display: "grid", gap: 14 }}>
          {content.departments.map((d, i) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={d.icon} maxLength={8} onChange={(e) => updateDepartment(i, { icon: e.target.value })} style={iconInputStyle} placeholder="📖" />
                <input value={d.title} maxLength={60} onChange={(e) => updateDepartment(i, { title: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="বিভাগের নাম" />
                <button type="button" onClick={() => removeDepartment(i)} style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                  মুছুন
                </button>
              </div>
              <textarea
                value={d.desc}
                maxLength={220}
                rows={2}
                onChange={(e) => updateDepartment(i, { desc: e.target.value })}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="সংক্ষিপ্ত বিবরণ"
              />
            </div>
          ))}
          {!content.departments.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো বিভাগ যোগ করা হয়নি।</p>}
          <button
            type="button"
            onClick={addDepartment}
            disabled={content.departments.length >= MAX_LIST}
            style={{ border: `1px dashed ${C.border}`, background: "transparent", color: content.departments.length >= MAX_LIST ? C.muted : C.emerald, borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: content.departments.length >= MAX_LIST ? "not-allowed" : "pointer", width: "fit-content" }}
          >
            + নতুন বিভাগ
          </button>
        </div>
      </Card>

      <Card title="ক্লাস ও কোর্সসমূহ" subtitle={`পাবলিক "ক্লাস ও কোর্সসমূহ" মেনু ও "ভর্তি" পেজে দেখানো ক্লাসের তালিকা (সর্বোচ্চ ${MAX_CLASSES}টি)`}>
        <div style={{ display: "grid", gap: 14 }}>
          {content.classes.map((c, i) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={c.icon} maxLength={8} onChange={(e) => updateClassItem(i, { icon: e.target.value })} style={iconInputStyle} placeholder="🎓" />
                <input value={c.title} maxLength={60} onChange={(e) => updateClassItem(i, { title: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="ক্লাসের নাম" />
                <button type="button" onClick={() => removeClassItem(i)} style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                  মুছুন
                </button>
              </div>
              <textarea
                value={c.desc}
                maxLength={160}
                rows={2}
                onChange={(e) => updateClassItem(i, { desc: e.target.value })}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="সংক্ষিপ্ত বিবরণ (ঐচ্ছিক)"
              />
            </div>
          ))}
          {!content.classes.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো ক্লাস যোগ করা হয়নি।</p>}
          <button
            type="button"
            onClick={addClassItem}
            disabled={content.classes.length >= MAX_CLASSES}
            style={{ border: `1px dashed ${C.border}`, background: "transparent", color: content.classes.length >= MAX_CLASSES ? C.muted : C.emerald, borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: content.classes.length >= MAX_CLASSES ? "not-allowed" : "pointer", width: "fit-content" }}
          >
            + নতুন ক্লাস
          </button>
        </div>
      </Card>

      <Card title="নোটিসেস" subtitle={`পাবলিক "নোটিসেস" পেজে দেখানো নোটিশ (সর্বোচ্চ ${MAX_NOTICES}টি, তারিখ অনুযায়ী নতুনগুলো আগে দেখানো হবে)`}>
        <div style={{ display: "grid", gap: 14 }}>
          {content.notices.map((n, i) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input value={n.title} maxLength={140} onChange={(e) => updateNotice(i, { title: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 160 }} placeholder="নোটিশের শিরোনাম" />
                <input type="date" value={n.date} onChange={(e) => updateNotice(i, { date: e.target.value })} style={{ ...inputStyle, width: 150 }} />
                <button type="button" onClick={() => removeNotice(i)} style={{ border: "none", background: C.roseL, color: C.roseD, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
                  মুছুন
                </button>
              </div>
              <textarea
                value={n.body}
                maxLength={600}
                rows={3}
                onChange={(e) => updateNotice(i, { body: e.target.value })}
                style={{ ...inputStyle, resize: "vertical" as const }}
                placeholder="নোটিশের বিস্তারিত"
              />
            </div>
          ))}
          {!content.notices.length && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>এখনো কোনো নোটিশ যোগ করা হয়নি।</p>}
          <button
            type="button"
            onClick={addNotice}
            disabled={content.notices.length >= MAX_NOTICES}
            style={{ border: `1px dashed ${C.border}`, background: "transparent", color: content.notices.length >= MAX_NOTICES ? C.muted : C.emerald, borderRadius: 8, padding: "9px 12px", fontWeight: 700, cursor: content.notices.length >= MAX_NOTICES ? "not-allowed" : "pointer", width: "fit-content" }}
          >
            + নতুন নোটিশ
          </button>
        </div>
      </Card>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{ background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 15, cursor: saving ? "wait" : "pointer" }}
      >
        {saving ? t.students.saving : saved ? "✓ সংরক্ষিত হয়েছে" : "সংরক্ষণ করুন"}
      </button>
    </div>
  );
}

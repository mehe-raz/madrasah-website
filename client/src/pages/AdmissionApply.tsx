import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { AdmissionApplicationInput, ClassOption, ClassTreeNode } from "../types";
import { ClassCascadeSelect } from "../components/ui";
import { Icons } from "../lib/icons";

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 6 }}>
        {label} {required && <span style={{ color: C.rose }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const EMPTY: AdmissionApplicationInput = {
  studentName: "",
  studentNameEn: "",
  dateOfBirth: "",
  gender: "",
  className: "",
  guardianName: "",
  guardianPhone: "",
  presentAddress: "",
  previousInstitution: "",
  note: "",
};

export function AdmissionApply() {
  const { site, content, loading } = usePublicSite();
  const [params] = useSearchParams();
  const preselected = params.get("class") || "";

  const [form, setForm] = useState<AdmissionApplicationInput>({ ...EMPTY, className: preselected });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: number } | null>(null);
  // Super Admin's class/jamaat master list (Settings → ক্লাস/জামাত
  // ব্যবস্থাপনা), so this public dropdown always matches the authenticated
  // admission form instead of drifting from a separately-maintained list.
  // Falls back to content.classes (CMS) below if this hasn't loaded yet /
  // is empty, so the form never blocks on it.
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  // Hierarchical replacement for classOptions above (see
  // server/src/lib/classTree.js) — preferred whenever it has loaded and is
  // non-empty; classOptions/content.classes stay as the fallback chain for
  // whatever hasn't been migrated to the tree yet. Uses the public,
  // unauthenticated endpoint (this page has no login) — NOT api.getClassTree().
  const [classTree, setClassTree] = useState<ClassTreeNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicClassOptions()
      .then((options) => {
        if (!cancelled) setClassOptions(options);
      })
      .catch(() => {
        /* fall back to content.classes below */
      });
    api
      .getPublicClassTree()
      .then((tree) => {
        if (!cancelled) setClassTree(tree);
      })
      .catch(() => {
        /* fall back to classOptions/content.classes below */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useSeoMeta({
    title: `ভর্তি ফর্ম — ${site.name}`,
    description: `${site.name}-এ অনলাইনে ভর্তি আবেদন করুন।`,
    index: false,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const update = (patch: Partial<AdmissionApplicationInput>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.studentName.trim() || !form.className.trim() || !form.guardianName.trim() || !form.guardianPhone.trim()) {
      setError("তারকা (*) চিহ্নিত ঘরগুলো অবশ্যই পূরণ করুন।");
      return;
    }
    setSubmitting(true);
    try {
      const row = await api.submitAdmission(form);
      setResult({ id: row.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "আবেদন জমা দেওয়া যায়নি, একটু পরে আবার চেষ্টা করুন।");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="app-shell page-shell" style={{ minHeight: "100vh", color: C.text }}>
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong" style={{ padding: 26, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "center" }}>
            <div>
              <span className="pill" style={{ display: "inline-flex", padding: "6px 12px", background: C.emeraldL, color: C.emeraldD, fontSize: 12, fontWeight: 900, marginBottom: 12 }}>
                আবেদন ফর্ম
              </span>
              <h1 className="section-heading" style={{ margin: "0 0 12px" }}>সহজ ও সুশৃঙ্খল আবেদন ফর্ম</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: C.muted }}>
                একই সুন্দর ডিজাইন বজায় রেখে ফর্মটি মোবাইল ব্যবহারকারীদের জন্যও সহজ রাখা হয়েছে।
              </p>
            </div>

            <div className="soft-panel hero-visual" style={{ padding: 18 }}>
              <div style={{ borderRadius: 24, minHeight: 250, padding: 18, background: "linear-gradient(180deg, rgba(240,253,244,0.92), rgba(255,255,255,0.68))", display: "grid", gap: 12 }}>
                <div className="soft-panel" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>পরামর্শ</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>তারকা (*) চিহ্নিত ঘরগুলো সতর্কতার সাথে পূরণ করুন।</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <div className="soft-panel" style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>দ্রুত</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>১ মিনিট</div>
                  </div>
                  <div className="soft-panel" style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>অবস্থা</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>অনলাইন</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        <div className="soft-panel-strong" style={{ padding: 22, maxWidth: 760, margin: "0 auto" }}>
          {result ? (
            <div style={{ textAlign: "center", padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: C.emeraldD }}>
                <Icons.checkCircle size={34} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: C.emeraldD, margin: "0 0 8px" }}>আবেদন সফলভাবে জমা হয়েছে</h2>
              <p style={{ fontSize: 13, color: C.emeraldD, margin: "0 0 4px" }}>রেফারেন্স নম্বর: #{result.id}</p>
              <p style={{ fontSize: 13, color: C.emeraldD, margin: 0 }}>আমরা শীঘ্রই যোগাযোগ করব ইনশাআল্লাহ।</p>
              <Link to="/" className="pill hover-lift" style={{ display: "inline-block", marginTop: 18, background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", borderRadius: 12, padding: "11px 18px", fontWeight: 900, textDecoration: "none" }}>
                হোমে ফিরে যান
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
              {error && <div style={{ background: C.roseL, color: C.roseD, borderRadius: 12, padding: "10px 14px", fontSize: 13, lineHeight: 1.7 }}>{error}</div>}

              <div style={{ display: "grid", gap: 16 }}>
                {classTree.length ? (
                  <ClassCascadeSelect
                    tree={classTree}
                    value={form.className}
                    onChange={(en) => update({ className: en })}
                  />
                ) : (
                <Field label="ক্লাস / জামাত" required>
                  {classOptions.length ? (
                    <select value={form.className} onChange={(e) => update({ className: e.target.value })} style={inputStyle}>
                      <option value="">নির্বাচন করুন</option>
                      {classOptions.map((c) => (
                        <option key={c.en} value={c.en}>
                          {c.bn}
                        </option>
                      ))}
                    </select>
                  ) : content.classes.length ? (
                    <select value={form.className} onChange={(e) => update({ className: e.target.value })} style={inputStyle}>
                      <option value="">নির্বাচন করুন</option>
                      {content.classes.map((c, i) => (
                        <option key={i} value={c.title}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={form.className} onChange={(e) => update({ className: e.target.value })} style={inputStyle} placeholder="যেমন: KG" />
                  )}
                </Field>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <Field label="শিক্ষার্থীর নাম" required>
                    <input value={form.studentName} onChange={(e) => update({ studentName: e.target.value })} style={inputStyle} placeholder="পূর্ণ নাম" />
                  </Field>
                  <Field label="শিক্ষার্থীর নাম (ইংরেজিতে)">
                    <input value={form.studentNameEn} onChange={(e) => update({ studentNameEn: e.target.value })} style={inputStyle} placeholder="ইংরেজিতে পূর্ণ নাম লিখুন" />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <Field label="জন্ম তারিখ">
                    <input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label="লিঙ্গ">
                    <select value={form.gender} onChange={(e) => update({ gender: e.target.value })} style={inputStyle}>
                      <option value="">নির্বাচন করুন</option>
                      <option value="Male">পুরুষ</option>
                      <option value="Female">মহিলা</option>
                    </select>
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <Field label="অভিভাবকের নাম" required>
                    <input value={form.guardianName} onChange={(e) => update({ guardianName: e.target.value })} style={inputStyle} placeholder="অভিভাবকের পূর্ণ নাম" />
                  </Field>
                  <Field label="অভিভাবকের ফোন" required>
                    <input value={form.guardianPhone} onChange={(e) => update({ guardianPhone: e.target.value })} style={inputStyle} placeholder="01XXXXXXXXX" inputMode="tel" />
                  </Field>
                </div>

                <Field label="বর্তমান ঠিকানা">
                  <textarea value={form.presentAddress} onChange={(e) => update({ presentAddress: e.target.value })} style={{ ...inputStyle, minHeight: 96, resize: "vertical" }} placeholder="বর্তমান ঠিকানা লিখুন" />
                </Field>

                <Field label="পূর্ববর্তী প্রতিষ্ঠান">
                  <input value={form.previousInstitution} onChange={(e) => update({ previousInstitution: e.target.value })} style={inputStyle} placeholder="স্কুল/মাদ্রাসার নাম" />
                </Field>

                <Field label="অতিরিক্ত তথ্য">
                  <textarea value={form.note} onChange={(e) => update({ note: e.target.value })} style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} placeholder="যদি কিছু জানানোর থাকে" />
                </Field>

                <button type="submit" disabled={submitting} className="pill hover-lift" style={{ background: `linear-gradient(135deg, ${C.sky}, ${C.emerald})`, color: "#fff", border: "none", padding: "13px 22px", fontWeight: 900, fontSize: 15, cursor: "pointer", opacity: submitting ? 0.78 : 1 }}>
                  {submitting ? "জমা হচ্ছে…" : "আবেদন জমা দিন"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

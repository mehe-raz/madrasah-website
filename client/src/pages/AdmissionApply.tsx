import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePublicSite } from "../hooks/usePublicSite";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { AdmissionApplicationInput } from "../types";

const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  color: C.text,
  background: C.card,
};

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 6 }}>
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
  const { site, content } = usePublicSite();
  const [params] = useSearchParams();
  const preselected = params.get("class") || "";

  const [form, setForm] = useState<AdmissionApplicationInput>({ ...EMPTY, className: preselected });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: number } | null>(null);

  useEffect(() => {
    document.title = `ভর্তি ফর্ম — ${site.name}`;
  }, [site.name]);

  useEffect(() => {
    if (preselected) setForm((f) => ({ ...f, className: preselected }));
  }, [preselected]);

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

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: C.text }}>
      <PublicHeader site={site} classes={content.classes} />

      <section style={{ maxWidth: 640, margin: "0 auto", padding: "36px 20px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>ভর্তি ফর্ম</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>নিচের তথ্যগুলো সঠিকভাবে পূরণ করুন, আমরা যোগাযোগ করব ইনশাআল্লাহ</p>
        </div>

        {result ? (
          <div style={{ background: C.emeraldL, border: `1px solid ${C.emerald}`, borderRadius: 14, padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: C.emeraldD, margin: "0 0 8px" }}>আবেদন সফলভাবে জমা হয়েছে</h2>
            <p style={{ fontSize: 13, color: C.emeraldD, margin: "0 0 4px" }}>রেফারেন্স নম্বর: #{result.id}</p>
            <p style={{ fontSize: 13, color: C.emeraldD, margin: 0 }}>আমরা শীঘ্রই আপনার দেওয়া নাম্বারে যোগাযোগ করব ইনশাআল্লাহ।</p>
            <Link to="/" style={{ display: "inline-block", marginTop: 18, background: C.emerald, color: "#fff", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              হোমে ফিরে যান
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
            {error && <div style={{ background: C.roseL, color: C.roseD, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>{error}</div>}

            <Field label="ক্লাস / কোর্স" required>
              {content.classes.length ? (
                <select value={form.className} onChange={(e) => update({ className: e.target.value })} style={inputStyle}>
                  <option value="">নির্বাচন করুন</option>
                  {content.classes.map((c, i) => (
                    <option key={i} value={c.title}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={form.className} onChange={(e) => update({ className: e.target.value })} style={inputStyle} placeholder="যেমন: হিফজ বিভাগ - ১ম বর্ষ" />
              )}
            </Field>

            <Field label="শিক্ষার্থীর নাম" required>
              <input value={form.studentName} onChange={(e) => update({ studentName: e.target.value })} style={inputStyle} placeholder="পূর্ণ নাম" />
            </Field>

            <Field label="শিক্ষার্থীর নাম (ইংরেজিতে)">
              <input value={form.studentNameEn} onChange={(e) => update({ studentNameEn: e.target.value })} style={inputStyle} placeholder="Full name in English" />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="জন্ম তারিখ">
                <input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="লিঙ্গ">
                <select value={form.gender} onChange={(e) => update({ gender: e.target.value })} style={inputStyle}>
                  <option value="">নির্বাচন করুন</option>
                  <option value="ছেলে">ছেলে</option>
                  <option value="মেয়ে">মেয়ে</option>
                </select>
              </Field>
            </div>

            <Field label="অভিভাবকের নাম" required>
              <input value={form.guardianName} onChange={(e) => update({ guardianName: e.target.value })} style={inputStyle} placeholder="পিতা/মাতা/অভিভাবকের নাম" />
            </Field>

            <Field label="মোবাইল নম্বর" required>
              <input value={form.guardianPhone} onChange={(e) => update({ guardianPhone: e.target.value })} style={inputStyle} placeholder="01XXXXXXXXX" inputMode="tel" />
            </Field>

            <Field label="বর্তমান ঠিকানা">
              <textarea value={form.presentAddress} onChange={(e) => update({ presentAddress: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />
            </Field>

            <Field label="পূর্ববর্তী প্রতিষ্ঠান (যদি থাকে)">
              <input value={form.previousInstitution} onChange={(e) => update({ previousInstitution: e.target.value })} style={inputStyle} />
            </Field>

            <Field label="অতিরিক্ত কিছু জানাতে চাইলে">
              <textarea value={form.note} onChange={(e) => update({ note: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />
            </Field>

            <button
              type="submit"
              disabled={submitting}
              style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontWeight: 700, fontSize: 15, cursor: submitting ? "wait" : "pointer" }}
            >
              {submitting ? "জমা হচ্ছে…" : "আবেদন জমা দিন"}
            </button>
            <p style={{ fontSize: 11, color: C.muted, margin: 0, textAlign: "center" }}>
              আপনার তথ্য শুধুমাত্র ভর্তি প্রক্রিয়ার জন্য ব্যবহার করা হবে এবং নিরাপদে সংরক্ষণ করা হয়।
            </p>
          </form>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Badge } from "../components/Badge";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { Student, StudentDocuments } from "../types";
import { useLanguage } from "../context/AppSettingsContext";
import type { Dict } from "../i18n/bn";

type AdmissionForm = Omit<Partial<Student>, "id" | "documents"> & {
  documents: StudentDocuments;
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm: AdmissionForm = {
  admissionNumber: "",
  admissionDate: today,
  academicYear: String(new Date().getFullYear()),
  session: "",
  class: "",
  section: "",
  roll: "",
  type: "Day",
  name: "",
  nameEn: "",
  dateOfBirth: "",
  birthRegistrationNumber: "",
  gender: "Male",
  religion: "Islam",
  blood: "",
  studentPhoto: "",
  fatherName: "",
  fatherMobile: "",
  fatherOccupation: "",
  motherName: "",
  motherMobile: "",
  motherOccupation: "",
  guardianName: "",
  guardianRelationship: "",
  guardianMobile: "",
  presentAddress: "",
  permanentAddress: "",
  district: "",
  upazila: "",
  postOffice: "",
  village: "",
  previousInstitution: "",
  previousClass: "",
  dept: "Hifz",
  para: 0,
  admissionFee: 0,
  fee: 0,
  discount: 0,
  due: 0,
  status: "Active",
  documents: {},
};

const requiredFields: (keyof AdmissionForm)[] = [
  "admissionDate",
  "academicYear",
  "session",
  "class",
  "roll",
  "type",
  "name",
  "nameEn",
  "dateOfBirth",
  "birthRegistrationNumber",
  "gender",
  "religion",
  "fatherName",
  "fatherMobile",
  "motherName",
  "motherMobile",
  "presentAddress",
  "permanentAddress",
  "district",
  "upazila",
  "postOffice",
  "village",
  "dept",
  "admissionFee",
  "fee",
];

const departmentOptions = ["Hifz", "Nazera", "Kitab", "General"];
const bloodOptions = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const genderOptions = ["Male", "Female", "Other"];
const religionOptions = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"];

function fieldStyle(error?: string): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${error ? C.rose : C.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
  };
}

function sectionTitle(title: string) {
  return <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 12px" }}>{title}</h3>;
}

function textValue(value: unknown) {
  return value == null || value === "" ? "-" : String(value);
}

function normalizeStudent(student: Student): AdmissionForm {
  return {
    ...emptyForm,
    ...student,
    admissionFee: student.admissionFee ?? 0,
    fee: student.fee ?? 0,
    discount: student.discount ?? 0,
    due: student.due ?? 0,
    para: student.para ?? 0,
    documents: student.documents || {},
  };
}

function validateForm(form: AdmissionForm, t: Dict) {
  const errors: Record<string, string> = {};
  requiredFields.forEach((field) => {
    const value = form[field];
    if (value === undefined || value === null || value === "") errors[field] = t.students.validationRequired;
  });

  ["fatherMobile", "motherMobile", "guardianMobile"].forEach((field) => {
    const value = String(form[field as keyof AdmissionForm] || "").replace(/[\s-]/g, "");
    if (value && !/^01[3-9]\d{8}$/.test(value)) errors[field] = t.students.mobileValidation;
  });

  return errors;
}

function readFile(file: File, t: Dict, imageOnly = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (imageOnly && !file.type.startsWith("image/")) {
      reject(new Error(t.students.photoMustBeImage));
      return;
    }
    if (!imageOnly && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      reject(new Error(t.students.docMustBeImageOrPdf));
      return;
    }
    if (file.size > 750 * 1024) {
      reject(new Error(t.students.fileTooLarge));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t.students.fileReadFailed));
    reader.readAsDataURL(file);
  });
}

export function Students() {
  const { t, tr } = useLanguage();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalStudents, setTotalStudents] = useState(0);
  const [form, setForm] = useState<AdmissionForm>(emptyForm);
  const [editing, setEditing] = useState<Student | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getStudentsPage({
        dept: department !== "All" ? department : undefined,
        search: search.trim() || undefined,
        status: status !== "All" ? status : undefined,
        page,
        limit: pageSize,
      });
      setStudents(Array.isArray(data?.items) ? data.items : []);
      setTotalStudents(Number(data?.total) || 0);
    } catch (err) {
      console.error("Failed to load students", err);
      setStudents([]);
      setTotalStudents(0);
    }
  }, [department, page, pageSize, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const setField = (field: keyof AdmissionForm, value: string | number | StudentDocuments) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[String(field)];
      return next;
    });
  };

  const startCreate = () => {
    setEditing(null);
    setViewing(null);
    setErrors({});
    setMessage("");
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = (student: Student) => {
    setEditing(student);
    setViewing(null);
    setErrors({});
    setMessage("");
    setForm(normalizeStudent(student));
    setShowForm(true);
  };

  const saveAdmission = async () => {
    const nextErrors = validateForm(form, t);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = { ...form, studentPhoto: form.documents.studentPhoto || form.studentPhoto || "" };
      const saved = editing ? await api.updateStudent(editing.id, payload) : await api.createStudent(payload);
      setStudents((prev) => (editing ? prev.map((student) => (student.id === saved.id ? saved : student)) : [saved, ...prev]));
      setEditing(saved);
      setViewing(saved);
      setShowForm(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.students.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (key: keyof StudentDocuments, file?: File) => {
    if (!file) return;
    try {
      const rawDataUrl = await readFile(file, t, key === "studentPhoto");
      const { url } = await api.uploadFile(rawDataUrl, "students");
      const documents = { ...form.documents, [key]: url };
      setField("documents", documents);
      if (key === "studentPhoto") setField("studentPhoto", url);

      if (editing) {
        const saved = await api.uploadStudentDocuments(editing.id, documents);
        setEditing(saved);
        setForm(normalizeStudent(saved));
        setStudents((prev) => prev.map((student) => (student.id === saved.id ? saved : student)));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.students.uploadFailed);
    }
  };

  const renderInput = (label: string, field: keyof AdmissionForm, type = "text") => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</span>
      <input
        type={type}
        value={String(form[field] ?? "")}
        onChange={(event) => setField(field, type === "number" ? Number(event.target.value) : event.target.value)}
        style={fieldStyle(errors[String(field)])}
      />
      {errors[String(field)] && <span style={{ color: C.rose, fontSize: 11 }}>{errors[String(field)]}</span>}
    </label>
  );

  const renderSelect = (label: string, field: keyof AdmissionForm, options: string[]) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</span>
      <select value={String(form[field] ?? "")} onChange={(event) => setField(field, event.target.value)} style={fieldStyle(errors[String(field)])}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option || t.common.select}
          </option>
        ))}
      </select>
      {errors[String(field)] && <span style={{ color: C.rose, fontSize: 11 }}>{errors[String(field)]}</span>}
    </label>
  );

  const renderTextArea = (label: string, field: keyof AdmissionForm) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</span>
      <textarea value={String(form[field] ?? "")} onChange={(event) => setField(field, event.target.value)} rows={3} style={fieldStyle(errors[String(field)])} />
      {errors[String(field)] && <span style={{ color: C.rose, fontSize: 11 }}>{errors[String(field)]}</span>}
    </label>
  );

  const renderUpload = (label: string, key: keyof StudentDocuments, optional = false) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}{optional ? ` (${t.students.optional})` : ""}</span>
      <input
        type="file"
        accept={key === "studentPhoto" ? "image/*" : "image/*,application/pdf"}
        onChange={(event) => uploadDocument(key, event.target.files?.[0])}
        style={fieldStyle()}
      />
      {form.documents[key] && <span style={{ color: C.emerald, fontSize: 11 }}>{t.common.uploaded}</span>}
    </label>
  );

  const detailRows = viewing
    ? [
        [t.students.admissionNo, viewing.admissionNumber],
        [t.students.admissionDate, viewing.admissionDate],
        [t.students.academicYear, viewing.academicYear],
        [t.students.session, viewing.session],
        [t.students.classJamaat, viewing.class],
        [t.students.section, viewing.section],
        [t.students.roll, viewing.roll],
        [t.students.studentType, viewing.type],
        [t.students.bengaliName, viewing.name],
        [t.students.englishName, viewing.nameEn],
        [t.students.birthRegistration, viewing.birthRegistrationNumber],
        [t.students.fatherName, `${textValue(viewing.fatherName)} - ${textValue(viewing.fatherMobile)}`],
        [t.students.motherName, `${textValue(viewing.motherName)} - ${textValue(viewing.motherMobile)}`],
        [t.students.presentAddress, viewing.presentAddress],
        [t.students.permanentAddress, viewing.permanentAddress],
        [t.students.department, viewing.dept],
        [t.students.memorizedQuran, viewing.para],
        [t.students.admissionFee, fmt(viewing.admissionFee || 0)],
        [t.students.monthlyFee, fmt(viewing.fee || 0)],
        [t.students.discount, fmt(viewing.discount || 0)],
      ]
    : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{t.students.admissionTitle}</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>{t.students.admissionSubtitle}</p>
        </div>
        <button type="button" onClick={startCreate} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
          {t.students.newAdmission}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t.students.admissionSearch} style={{ ...fieldStyle(), flex: 1, minWidth: 240 }} />
        <select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }} style={{ ...fieldStyle(), width: 150 }}>
          {["All", ...departmentOptions].map((option) => (
            <option key={option} value={option}>{option === "All" ? t.common.all : option}</option>
          ))}
        </select>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} style={{ ...fieldStyle(), width: 130 }}>
          <option value="All">{t.common.all}</option>
          <option value="Active">{t.students.active}</option>
          <option value="Inactive">{t.students.inactive}</option>
        </select>
      </div>

      {message && <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{message}</div>}

      {showForm && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: C.text }}>{editing ? t.students.editAdmission : t.students.admissionForm}</h3>
            <button type="button" onClick={() => setShowForm(false)} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>{t.common.close}</button>
          </div>

          {sectionTitle(t.students.admissionInfo)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput(t.students.admissionNumber, "admissionNumber")}
            {renderInput(t.students.admissionDate, "admissionDate", "date")}
            {renderInput(t.students.academicYear, "academicYear")}
            {renderInput(t.students.session, "session")}
            {renderInput(t.students.classJamaat, "class")}
            {renderInput(t.students.section, "section")}
            {renderInput(t.students.rollNumber, "roll")}
            {renderSelect(t.students.studentType, "type", ["Day", "Residential"])}
          </div>

          {sectionTitle(t.students.studentInfo)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput(t.students.bengaliName, "name")}
            {renderInput(t.students.englishName, "nameEn")}
            {renderInput(t.students.dateOfBirth, "dateOfBirth", "date")}
            {renderInput(t.students.birthRegistration, "birthRegistrationNumber")}
            {renderSelect(t.students.gender, "gender", genderOptions)}
            {renderSelect(t.students.religion, "religion", religionOptions)}
            {renderSelect(t.students.blood, "blood", bloodOptions)}
            {renderUpload(t.students.studentPhoto, "studentPhoto")}
          </div>

          {sectionTitle(t.students.guardianInfo)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput(t.students.fatherName, "fatherName")}
            {renderInput(t.students.fatherMobile, "fatherMobile")}
            {renderInput(t.students.fatherOccupation, "fatherOccupation")}
            {renderInput(t.students.motherName, "motherName")}
            {renderInput(t.students.motherMobile, "motherMobile")}
            {renderInput(t.students.motherOccupation, "motherOccupation")}
            {renderInput(t.students.optionalGuardianName, "guardianName")}
            {renderInput(t.students.relationship, "guardianRelationship")}
            {renderInput(t.students.guardianMobile, "guardianMobile")}
          </div>

          {sectionTitle(t.students.address)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderTextArea(t.students.presentAddress, "presentAddress")}
            {renderTextArea(t.students.permanentAddress, "permanentAddress")}
            {renderInput(t.students.district, "district")}
            {renderInput(t.students.upazila, "upazila")}
            {renderInput(t.students.postOffice, "postOffice")}
            {renderInput(t.students.village, "village")}
          </div>

          {sectionTitle(t.students.previousEducation)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput(t.students.previousInstitution, "previousInstitution")}
            {renderInput(t.students.previousClass, "previousClass")}
          </div>

          {sectionTitle(t.students.madrasaInfo)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderSelect(t.students.department, "dept", departmentOptions)}
            {renderInput(t.students.memorizedQuran, "para", "number")}
          </div>

          {sectionTitle(t.students.feeInfo)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput(t.students.admissionFee, "admissionFee", "number")}
            {renderInput(t.students.monthlyFee, "fee", "number")}
            {renderInput(t.students.discount, "discount", "number")}
          </div>

          {sectionTitle(t.students.documents)}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 18 }}>
            {renderUpload(t.students.studentPhoto, "studentPhoto")}
            {renderUpload(t.students.birthCertificate, "birthCertificate")}
            {renderUpload(t.students.guardianNid, "guardianNid")}
            {renderUpload(t.students.previousCertificate, "previousCertificate", true)}
          </div>

          <button type="button" disabled={saving} onClick={saveAdmission} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
            {saving ? t.students.saving : editing ? t.students.saveChanges : t.students.saveAdmission}
          </button>
        </div>
      )}

      <div className="table-wrap" style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 880 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {[t.students.admissionNo, t.students.roll, t.fees.student, t.students.class, t.students.dept, t.students.type, t.students.guardianMobile, t.students.monthlyFee, t.students.status, ""].map((header, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => (
              <tr key={student.id} style={{ borderBottom: `1px solid ${C.border}`, background: index % 2 === 0 ? C.card : "var(--row-alt)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: C.text }}>{textValue(student.admissionNumber)}</td>
                <td style={{ padding: "10px 12px", color: C.muted }}>{student.roll}</td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    {student.studentPhoto ? (
                      <img src={student.studentPhoto} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ width: 34, height: 34, borderRadius: "50%", background: C.tealL, color: C.tealD, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                        {(student.name || "?").slice(0, 1)}
                      </span>
                    )}
                    <span>
                      <strong style={{ display: "block", color: C.text }}>{student.name}</strong>
                      <span style={{ color: C.muted, fontSize: 12 }}>{student.nameEn}</span>
                    </span>
                  </div>
                </td>
                <td style={{ padding: "10px 12px", color: C.muted }}>{student.class}</td>
                <td style={{ padding: "10px 12px" }}><Badge label={student.dept} color={C.teal} /></td>
                <td style={{ padding: "10px 12px" }}><Badge label={student.type} color={student.type === "Residential" ? C.violet : C.sky} /></td>
                <td style={{ padding: "10px 12px", color: C.muted }}>{student.fatherMobile || student.guardianMobile || student.phone}</td>
                <td style={{ padding: "10px 12px", color: C.text }}>{fmt(student.fee || 0)}</td>
                <td style={{ padding: "10px 12px" }}><Badge label={student.status === "Inactive" ? t.students.inactive : t.students.active} color={student.status === "Inactive" ? C.rose : C.emerald} /></td>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                  <button type="button" onClick={() => setViewing(student)} style={{ border: "none", background: C.skyL, color: C.skyD, borderRadius: 6, padding: "5px 10px", cursor: "pointer", marginRight: 6, fontWeight: 700 }}>{t.students.view}</button>
                  <button type="button" onClick={() => startEdit(student)} style={{ border: "none", background: C.emeraldL, color: C.emeraldD, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 700 }}>{t.common.edit}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", flexWrap: "wrap", borderTop: `1px solid ${C.border}` }}>
          <div style={{ color: C.muted, fontSize: 12 }}>{tr("students.totalStudentsLine", { count: totalStudents })}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ border: `1px solid ${C.border}`, background: C.card, color: page <= 1 ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}>
              Prev
            </button>
            <span style={{ color: C.muted, fontSize: 12 }}>{page} / {Math.max(1, Math.ceil(totalStudents / pageSize))}</span>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.max(1, Math.ceil(totalStudents / pageSize))} style={{ border: `1px solid ${C.border}`, background: C.card, color: page >= Math.max(1, Math.ceil(totalStudents / pageSize)) ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page >= Math.max(1, Math.ceil(totalStudents / pageSize)) ? "not-allowed" : "pointer", fontSize: 12 }}>
              Next
            </button>
          </div>
        </div>
      </div>

      {viewing && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setViewing(null)}>
          <div className="modal-content" style={{ background: C.card, borderRadius: 8, padding: 24, width: 720, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              {viewing.studentPhoto ? <img src={viewing.studentPhoto} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} /> : null}
              <div>
                <h3 style={{ margin: 0, color: C.text, fontSize: 20 }}>{viewing.name}</h3>
                <div style={{ color: C.muted, fontSize: 13 }}>{viewing.nameEn} | {viewing.admissionNumber || t.students.noAdmissionNumber}</div>
              </div>
              <button type="button" onClick={() => setViewing(null)} style={{ marginLeft: "auto", border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>{t.common.close}</button>
            </div>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {detailRows.map(([label, value], i) => (
                <div key={i} style={{ background: C.slateL, borderRadius: 6, padding: "9px 10px" }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{textValue(value)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEdit(viewing)} style={{ border: "none", background: C.emerald, color: "#fff", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>{t.students.editStudent}</button>
              {(["studentPhoto", "birthCertificate", "guardianNid", "previousCertificate"] as (keyof StudentDocuments)[]).map((key) => (
                viewing.documents?.[key] ? (
                  <a key={key} href={viewing.documents[key]} target="_blank" rel="noreferrer" style={{ color: C.link, fontSize: 13, alignSelf: "center" }}>
                    {key}
                  </a>
                ) : null
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

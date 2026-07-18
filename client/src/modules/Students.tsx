import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Badge } from "../components/Badge";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { Student, StudentDocuments } from "../types";

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

function validateForm(form: AdmissionForm) {
  const errors: Record<string, string> = {};
  requiredFields.forEach((field) => {
    const value = form[field];
    if (value === undefined || value === null || value === "") errors[field] = "Required";
  });

  ["fatherMobile", "motherMobile", "guardianMobile"].forEach((field) => {
    const value = String(form[field as keyof AdmissionForm] || "").replace(/[\s-]/g, "");
    if (value && !/^01[3-9]\d{8}$/.test(value)) errors[field] = "Use 01XXXXXXXXX";
  });

  return errors;
}

function readFile(file: File, imageOnly = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (imageOnly && !file.type.startsWith("image/")) {
      reject(new Error("Student photo must be an image"));
      return;
    }
    if (!imageOnly && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      reject(new Error("Document must be an image or PDF"));
      return;
    }
    if (file.size > 750 * 1024) {
      reject(new Error("File must be 750 KB or smaller"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [form, setForm] = useState<AdmissionForm>(emptyForm);
  const [editing, setEditing] = useState<Student | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api.getStudents({
      dept: department !== "All" ? department : undefined,
      search: search || undefined,
      status: status !== "All" ? status : undefined,
    });
    setStudents(data);
  }, [department, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((student) => {
      const matchesDepartment = department === "All" || student.dept === department;
      const matchesStatus = status === "All" || student.status === status;
      const haystack = [
        student.name,
        student.nameEn,
        student.roll,
        student.admissionNumber,
        student.birthRegistrationNumber,
        student.fatherMobile,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesDepartment && matchesStatus && haystack.includes(q);
    });
  }, [department, search, status, students]);

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
    const nextErrors = validateForm(form);
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
      setMessage(err instanceof Error ? err.message : "Admission could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (key: keyof StudentDocuments, file?: File) => {
    if (!file) return;
    try {
      const value = await readFile(file, key === "studentPhoto");
      const documents = { ...form.documents, [key]: value };
      setField("documents", documents);
      if (key === "studentPhoto") setField("studentPhoto", value);

      if (editing) {
        const saved = await api.uploadStudentDocuments(editing.id, documents);
        setEditing(saved);
        setForm(normalizeStudent(saved));
        setStudents((prev) => prev.map((student) => (student.id === saved.id ? saved : student)));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
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
            {option || "Select"}
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
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}{optional ? " (Optional)" : ""}</span>
      <input
        type="file"
        accept={key === "studentPhoto" ? "image/*" : "image/*,application/pdf"}
        onChange={(event) => uploadDocument(key, event.target.files?.[0])}
        style={fieldStyle()}
      />
      {form.documents[key] && <span style={{ color: C.emerald, fontSize: 11 }}>Uploaded</span>}
    </label>
  );

  const detailRows = viewing
    ? [
        ["Admission No.", viewing.admissionNumber],
        ["Admission Date", viewing.admissionDate],
        ["Academic Year", viewing.academicYear],
        ["Session", viewing.session],
        ["Class / Jamaat", viewing.class],
        ["Section", viewing.section],
        ["Roll", viewing.roll],
        ["Student Type", viewing.type],
        ["Bengali Name", viewing.name],
        ["English Name", viewing.nameEn],
        ["Birth Registration", viewing.birthRegistrationNumber],
        ["Father", `${textValue(viewing.fatherName)} - ${textValue(viewing.fatherMobile)}`],
        ["Mother", `${textValue(viewing.motherName)} - ${textValue(viewing.motherMobile)}`],
        ["Present Address", viewing.presentAddress],
        ["Permanent Address", viewing.permanentAddress],
        ["Department", viewing.dept],
        ["Memorized Quran", viewing.para],
        ["Admission Fee", fmt(viewing.admissionFee || 0)],
        ["Monthly Fee", fmt(viewing.fee || 0)],
        ["Discount", fmt(viewing.discount || 0)],
      ]
    : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Student Admission</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>Manage admission records, student profiles, fees, guardians, and documents.</p>
        </div>
        <button type="button" onClick={startCreate} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
          New Admission
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, roll, admission no., birth reg., mobile" style={{ ...fieldStyle(), flex: 1, minWidth: 240 }} />
        <select value={department} onChange={(event) => setDepartment(event.target.value)} style={{ ...fieldStyle(), width: 150 }}>
          {["All", ...departmentOptions].map((option) => <option key={option}>{option}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...fieldStyle(), width: 130 }}>
          {["All", "Active", "Inactive"].map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      {message && <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{message}</div>}

      {showForm && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: C.text }}>{editing ? "Edit Student Admission" : "Admission Form"}</h3>
            <button type="button" onClick={() => setShowForm(false)} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>Close</button>
          </div>

          {sectionTitle("Admission Information")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput("Admission Number (Auto if blank)", "admissionNumber")}
            {renderInput("Admission Date", "admissionDate", "date")}
            {renderInput("Academic Year", "academicYear")}
            {renderInput("Session", "session")}
            {renderInput("Class / Jamaat", "class")}
            {renderInput("Section", "section")}
            {renderInput("Roll Number", "roll")}
            {renderSelect("Student Type", "type", ["Day", "Residential"])}
          </div>

          {sectionTitle("Student Information")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput("Bengali Name", "name")}
            {renderInput("English Name", "nameEn")}
            {renderInput("Date of Birth", "dateOfBirth", "date")}
            {renderInput("Birth Registration Number", "birthRegistrationNumber")}
            {renderSelect("Gender", "gender", genderOptions)}
            {renderSelect("Religion", "religion", religionOptions)}
            {renderSelect("Blood Group", "blood", bloodOptions)}
            {renderUpload("Student Photo", "studentPhoto")}
          </div>

          {sectionTitle("Guardian Information")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput("Father Name", "fatherName")}
            {renderInput("Father Mobile", "fatherMobile")}
            {renderInput("Father Occupation", "fatherOccupation")}
            {renderInput("Mother Name", "motherName")}
            {renderInput("Mother Mobile", "motherMobile")}
            {renderInput("Mother Occupation", "motherOccupation")}
            {renderInput("Optional Guardian Name", "guardianName")}
            {renderInput("Relationship", "guardianRelationship")}
            {renderInput("Guardian Mobile", "guardianMobile")}
          </div>

          {sectionTitle("Address")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderTextArea("Present Address", "presentAddress")}
            {renderTextArea("Permanent Address", "permanentAddress")}
            {renderInput("District", "district")}
            {renderInput("Upazila", "upazila")}
            {renderInput("Post Office", "postOffice")}
            {renderInput("Village", "village")}
          </div>

          {sectionTitle("Previous Education")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput("Previous Institution", "previousInstitution")}
            {renderInput("Previous Class", "previousClass")}
          </div>

          {sectionTitle("Madrasa Information")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderSelect("Department", "dept", departmentOptions)}
            {renderInput("Memorized Quran (Paras)", "para", "number")}
          </div>

          {sectionTitle("Fee Information")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
            {renderInput("Admission Fee", "admissionFee", "number")}
            {renderInput("Monthly Fee", "fee", "number")}
            {renderInput("Discount (Optional)", "discount", "number")}
          </div>

          {sectionTitle("Documents")}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 18 }}>
            {renderUpload("Student Photo", "studentPhoto")}
            {renderUpload("Birth Certificate", "birthCertificate")}
            {renderUpload("Guardian NID", "guardianNid")}
            {renderUpload("Previous Certificate", "previousCertificate", true)}
          </div>

          <button type="button" disabled={saving} onClick={saveAdmission} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
            {saving ? "Saving..." : editing ? "Save Changes" : "Save Admission"}
          </button>
        </div>
      )}

      <div className="table-wrap" style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 880 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {["Admission No.", "Roll", "Student", "Class", "Department", "Type", "Guardian Mobile", "Monthly Fee", "Status", ""].map((header) => (
                <th key={header} style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((student, index) => (
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
                <td style={{ padding: "10px 12px" }}><Badge label={student.status || "Active"} color={student.status === "Inactive" ? C.rose : C.emerald} /></td>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                  <button type="button" onClick={() => setViewing(student)} style={{ border: "none", background: C.skyL, color: C.skyD, borderRadius: 6, padding: "5px 10px", cursor: "pointer", marginRight: 6, fontWeight: 700 }}>View</button>
                  <button type="button" onClick={() => startEdit(student)} style={{ border: "none", background: C.emeraldL, color: C.emeraldD, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 700 }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "10px 12px", color: C.muted, fontSize: 12, borderTop: `1px solid ${C.border}` }}>Total {filtered.length} students</div>
      </div>

      {viewing && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setViewing(null)}>
          <div className="modal-content" style={{ background: C.card, borderRadius: 8, padding: 24, width: 720, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              {viewing.studentPhoto ? <img src={viewing.studentPhoto} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} /> : null}
              <div>
                <h3 style={{ margin: 0, color: C.text, fontSize: 20 }}>{viewing.name}</h3>
                <div style={{ color: C.muted, fontSize: 13 }}>{viewing.nameEn} | {viewing.admissionNumber || "No admission number"}</div>
              </div>
              <button type="button" onClick={() => setViewing(null)} style={{ marginLeft: "auto", border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>Close</button>
            </div>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {detailRows.map(([label, value]) => (
                <div key={label} style={{ background: C.slateL, borderRadius: 6, padding: "9px 10px" }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{textValue(value)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => startEdit(viewing)} style={{ border: "none", background: C.emerald, color: "#fff", borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>Edit Student</button>
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

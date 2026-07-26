import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { SkeletonTableRows } from "../components/Skeleton";
import { RecordCard, RecordCardList } from "../components/RecordCard";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { deptLabel, typeLabel } from "../lib/labels";
import { printAdmissionForm, printReportTable } from "../lib/printReport";
import { C } from "../theme/colors";
import type { Student, StudentDocuments } from "../types";
import { useLanguage } from "../context/AppSettingsContext";
import type { Dict } from "../i18n/bn";

type AdmissionForm = Omit<Partial<Student>, "id" | "documents"> & {
  documents: StudentDocuments;
};

type AttendanceRow = { date: string; status: string };
type DetailSection = { title: string; rows: [string, string | number | null | undefined][] };

type AdmissionField = keyof AdmissionForm;

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

const step1Required: AdmissionField[] = [
  "admissionDate",
  "academicYear",
  "session",
  "class",
  "roll",
  "type",
  "name",
  "nameEn",
  "dateOfBirth",
  "gender",
  "religion",
];

const step2Required: AdmissionField[] = [
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
];

const step3Required: AdmissionField[] = ["dept", "admissionFee", "fee"];
const allRequired: AdmissionField[] = [...step1Required, ...step2Required, ...step3Required];
const wizardSteps = ["ভর্তি তথ্য", "অভিভাবক ও ঠিকানা", "শিক্ষা / ফি / ডকুমেন্ট"];

const departmentOptions = ["Hifz", "Nazera", "Kitab", "Nurani", "General"];
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

function validateFields(form: AdmissionForm, fields: AdmissionField[], t: Dict) {
  const errors: Record<string, string> = {};
  fields.forEach((field) => {
    const value = form[field];
    if (value === undefined || value === null || value === "") errors[field] = t.students.validationRequired;
  });

  ["fatherMobile", "motherMobile", "guardianMobile"].forEach((field) => {
    const value = String(form[field as AdmissionField] || "").replace(/[\s-]/g, "");
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
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState<AdmissionForm>(emptyForm);
  const [editing, setEditing] = useState<Student | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRow[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState({ total: 0, present: 0, absent: 0, late: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Real server-side pagination (LIST_COLUMNS only, no studentPhoto/documents)
  // instead of pulling every student's full record into the browser and
  // filtering/slicing client-side — the previous approach re-downloaded
  // every student's photo on every keystroke of the search box.
  const load = useCallback(async () => {
    const data = await api.getStudentsBasic({
      dept: department !== "All" ? department : undefined,
      search: search || undefined,
      status: status !== "All" ? status : undefined,
      page,
      limit: pageSize,
    });
    setStudents(data.items);
    setTotal(data.total);
    setTotalPages(data.totalPages);
  }, [department, search, status, page, pageSize]);

  // Any filter change should restart from page 1, since the current page
  // number may no longer exist under the new filter (see setSearch/
  // setDepartment/setStatus handlers below, which reset page alongside it).
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!viewing) {
      setAttendanceHistory([]);
      setAttendanceSummary({ total: 0, present: 0, absent: 0, late: 0 });
      setHistoryError("");
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");
    api
      .getStudentAttendance(viewing.id, { all: true })
      .then((data) => {
        if (cancelled) return;
        setAttendanceHistory(data.records || []);
        setAttendanceSummary({
          total: data.summary.present + data.summary.absent + data.summary.late,
          present: data.summary.present,
          absent: data.summary.absent,
          late: data.summary.late,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setAttendanceHistory([]);
        setAttendanceSummary({ total: 0, present: 0, absent: 0, late: 0 });
        setHistoryError(err instanceof Error ? err.message : t.common.requestFailed);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewing, t.students.totalAttendance]);

  const setField = (field: AdmissionField, value: string | number | StudentDocuments) => {
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
    setStep(0);
    setShowForm(true);
  };

  // The list row (from the paginated /students results) no longer carries
  // studentPhoto or documents — those are fetched here from the single-
  // student detail endpoint before opening the form, so editing still shows
  // (and re-saves) the existing photo/documents instead of silently
  // clearing them.
  const startEdit = async (student: Student) => {
    setEditing(student);
    setViewing(null);
    setErrors({});
    setMessage("");
    setForm(normalizeStudent(student));
    setStep(0);
    setShowForm(true);
    try {
      const full = await api.getStudent(student.id);
      setEditing(full);
      setForm(normalizeStudent(full));
    } catch {
      // Keep the row-level data already shown; the save button below will
      // still work, just without a previously-uploaded photo/documents.
    }
  };

  // Same idea as startEdit above: the list row lacks studentPhoto, so fetch
  // the full record for the "view" modal too.
  const openView = async (student: Student) => {
    setViewing(student);
    try {
      const full = await api.getStudent(student.id);
      setViewing(full);
    } catch {
      // Keep showing what we already have from the list row.
    }
  };

  const saveAdmission = async () => {
    const nextErrors = validateFields(form, allRequired, t);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length) return;

    const printWindow = window.open("", "_blank", "width=980,height=760");
    setSaving(true);
    try {
      const payload = { ...form, studentPhoto: form.documents.studentPhoto || form.studentPhoto || "" };
      const saved = editing ? await api.updateStudent(editing.id, payload) : await api.createStudent(payload);
      await load();
      setEditing(saved);
      setViewing(saved);
      setShowForm(false);
      setStep(0);
      if (printWindow) printAdmissionForm(saved, printWindow);
    } catch (err) {
      if (printWindow && !printWindow.closed) printWindow.close();
      setMessage(err instanceof Error ? err.message : t.students.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    const currentFields = step === 0 ? step1Required : step === 1 ? step2Required : step3Required;
    const nextErrors = validateFields(form, currentFields, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setStep((prev) => Math.min(prev + 1, 2));
  };

  const goBack = () => {
    setErrors({});
    setStep((prev) => Math.max(prev - 1, 0));
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

  const renderInput = (label: string, field: AdmissionField, type = "text") => (
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

  const renderSelect = (
    label: string,
    field: AdmissionField,
    options: string[],
    labelFor?: (option: string) => string
  ) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</span>
      <select value={String(form[field] ?? "")} onChange={(event) => setField(field, event.target.value)} style={fieldStyle(errors[String(field)])}>
        {options.map((option) => (
          <option key={option} value={option}>
            {(option && labelFor ? labelFor(option) : option) || t.common.select}
          </option>
        ))}
      </select>
      {errors[String(field)] && <span style={{ color: C.rose, fontSize: 11 }}>{errors[String(field)]}</span>}
    </label>
  );

  const renderTextArea = (label: string, field: AdmissionField) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</span>
      <textarea value={String(form[field] ?? "")} onChange={(event) => setField(field, event.target.value)} rows={3} style={fieldStyle(errors[String(field)])} />
      {errors[String(field)] && <span style={{ color: C.rose, fontSize: 11 }}>{errors[String(field)]}</span>}
    </label>
  );

  const renderUpload = (label: string, key: keyof StudentDocuments, optional = false) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 4 }}>
        {label}
        {optional ? ` (${t.students.optional})` : ""}
      </span>
      <input
        type="file"
        accept={key === "studentPhoto" ? "image/*" : "image/*,application/pdf"}
        onChange={(event) => uploadDocument(key, event.target.files?.[0])}
        style={fieldStyle()}
      />
      {form.documents[key] && <span style={{ color: C.emerald, fontSize: 11 }}>{t.common.uploaded}</span>}
    </label>
  );

  const detailSections: DetailSection[] = viewing
    ? [
        {
          title: t.students.admissionInfo,
          rows: [
            [t.students.admissionNo, viewing.admissionNumber],
            [t.students.admissionDate, viewing.admissionDate],
            [t.students.academicYear, viewing.academicYear],
            [t.students.session, viewing.session],
            [t.students.classJamaat, viewing.class],
            [t.students.section, viewing.section],
            [t.students.rollNumber, viewing.roll],
            [t.students.studentType, typeLabel(viewing.type)],
          ],
        },
        {
          title: t.students.studentInfo,
          rows: [
            [t.students.bengaliName, viewing.name],
            [t.students.englishName, viewing.nameEn],
            [t.students.dateOfBirth, viewing.dateOfBirth],
            [t.students.birthRegistration, viewing.birthRegistrationNumber || "ঐচ্ছিক"],
            [t.students.gender, viewing.gender],
            [t.students.religion, viewing.religion],
            [t.students.blood, viewing.blood],
            [t.students.phone, viewing.phone],
          ],
        },
        {
          title: t.students.guardianInfo,
          rows: [
            [t.students.fatherName, viewing.fatherName],
            [t.students.fatherMobile, viewing.fatherMobile],
            [t.students.fatherOccupation, viewing.fatherOccupation],
            [t.students.motherName, viewing.motherName],
            [t.students.motherMobile, viewing.motherMobile],
            [t.students.motherOccupation, viewing.motherOccupation],
            [t.students.optionalGuardianName, viewing.guardianName],
            [t.students.relationship, viewing.guardianRelationship],
            [t.students.guardianMobile, viewing.guardianMobile],
          ],
        },
        {
          title: t.students.address,
          rows: [
            [t.students.presentAddress, viewing.presentAddress],
            [t.students.permanentAddress, viewing.permanentAddress],
            [t.students.district, viewing.district],
            [t.students.upazila, viewing.upazila],
            [t.students.postOffice, viewing.postOffice],
            [t.students.village, viewing.village],
          ],
        },
        {
          title: t.students.previousEducation,
          rows: [
            [t.students.previousInstitution, viewing.previousInstitution],
            [t.students.previousClass, viewing.previousClass],
            [t.students.department, deptLabel(viewing.dept)],
            [t.students.memorizedQuran, viewing.para],
            [t.students.admissionFee, fmt(viewing.admissionFee || 0)],
            [t.students.monthlyFee, fmt(viewing.fee || 0)],
            [t.students.discount, fmt(viewing.discount || 0)],
            [t.students.previousDue, fmt(viewing.due || 0)],
          ],
        },
      ]
    : [];

  const printHistory = () => {
    printReportTable({
      title: `হাজিরা ইতিহাস - ${viewing?.name || "ছাত্র"}`,
      subtitle: `মোট ${attendanceSummary.total} দিন | উপস্থিত ${attendanceSummary.present} | অনুপস্থিত ${attendanceSummary.absent} | দেরিতে ${attendanceSummary.late}`,
      headers: ["তারিখ", "স্ট্যাটাস"],
      rows: attendanceHistory.map((row) => [row.date, row.status]),
    });
  };

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
          {(["All", ...departmentOptions] as string[]).map((option) => (
            <option key={option} value={option}>
              {option === "All" ? t.common.all : deptLabel(option)}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} style={{ ...fieldStyle(), width: 150 }}>
          {(["All", t.students.active, t.students.inactive] as string[]).map((option) => (
            <option key={option} value={option === t.students.active ? "Active" : option === t.students.inactive ? "Inactive" : option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {message && <div style={{ marginBottom: 12, color: C.rose, fontSize: 13 }}>{message}</div>}

      {showForm && (
        <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, color: C.text }}>{editing ? t.students.editAdmission : t.students.admissionForm}</h3>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{wizardSteps[step]}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {wizardSteps.map((label, index) => (
                <span key={label} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: index === step ? C.emeraldL : C.slateL, color: index === step ? C.emeraldD : C.muted }}>
                  {index + 1}. {label}
                </span>
              ))}
            </div>
          </div>

          {step === 0 && (
            <>
              {sectionTitle(t.students.admissionInfo)}
              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
                {renderInput(t.students.admissionNumber, "admissionNumber")}
                {renderInput(t.students.admissionDate, "admissionDate", "date")}
                {renderInput(t.students.academicYear, "academicYear")}
                {renderInput(t.students.session, "session")}
                {renderInput(t.students.classJamaat, "class")}
                {renderInput(t.students.section, "section")}
                {renderInput(t.students.rollNumber, "roll")}
                {renderSelect(t.students.studentType, "type", ["Day", "Residential"], typeLabel)}
              </div>

              {sectionTitle(t.students.studentInfo)}
              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
                {renderInput(t.students.bengaliName, "name")}
                {renderInput(t.students.englishName, "nameEn")}
                {renderInput(t.students.dateOfBirth, "dateOfBirth", "date")}
                {renderInput(`${t.students.birthRegistration} (${t.students.optional})`, "birthRegistrationNumber")}
                {renderSelect(t.students.gender, "gender", genderOptions)}
                {renderSelect(t.students.religion, "religion", religionOptions)}
                {renderSelect(t.students.blood, "blood", bloodOptions)}
                {renderUpload(t.students.studentPhoto, "studentPhoto")}
              </div>
            </>
          )}

          {step === 1 && (
            <>
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
            </>
          )}

          {step === 2 && (
            <>
              {sectionTitle(t.students.previousEducation)}
              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
                {renderInput(t.students.previousInstitution, "previousInstitution")}
                {renderInput(t.students.previousClass, "previousClass")}
              </div>

              {sectionTitle(t.students.madrasaInfo)}
              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
                {renderSelect(t.students.department, "dept", departmentOptions, deptLabel)}
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
                {renderUpload(t.students.birthCertificate, "birthCertificate")}
                {renderUpload(t.students.guardianNid, "guardianNid")}
                {renderUpload(t.students.previousCertificate, "previousCertificate", true)}
              </div>

              <div style={{ background: C.slateL, borderRadius: 8, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{t.students.totalAttendance}</div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{t.students.previousDue}: {fmt(Number(form.due || 0))}</div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {step > 0 && (
              <button type="button" onClick={goBack} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>
                পেছনে
              </button>
            )}
            {step < 2 ? (
              <button type="button" onClick={goNext} style={{ background: C.sky, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>
                পরবর্তী
              </button>
            ) : (
              <button type="button" disabled={saving} onClick={saveAdmission} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
                {saving ? t.students.saving : editing ? `${t.students.saveChanges} & ${t.common.print}` : `${t.students.saveAdmission} & ${t.common.print}`}
              </button>
            )}
            <button type="button" onClick={() => { setShowForm(false); setStep(0); setErrors({}); }} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {isMobile ? (
        <div style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12 }}>
          <RecordCardList>
            {students.map((student) => (
              <RecordCard
                key={student.id}
                title={student.name}
                subtitle={student.nameEn}
                fields={[
                  { label: t.students.class, value: student.class },
                  { label: t.students.roll, value: student.roll },
                ]}
                actions={
                  <>
                    <button type="button" onClick={() => openView(student)} style={{ flex: 1, border: "none", background: C.skyL, color: C.skyD, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>{t.students.view}</button>
                    <button type="button" onClick={() => startEdit(student)} style={{ flex: 1, border: "none", background: C.emeraldL, color: C.emeraldD, borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>{t.common.edit}</button>
                  </>
                }
              />
            ))}
          </RecordCardList>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 4px 0", flexWrap: "wrap" }}>
            <div style={{ color: C.muted, fontSize: 12 }}>{tr("students.totalStudentsLine", { count: total })}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ border: `1px solid ${C.border}`, background: C.card, color: page <= 1 ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}>Prev</button>
              <span style={{ color: C.muted, fontSize: 12 }}>{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ border: `1px solid ${C.border}`, background: C.card, color: page >= totalPages ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12 }}>Next</button>
            </div>
          </div>
        </div>
      ) : (
      <div className="table-wrap" style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {[t.students.name, t.students.class, t.students.roll, t.common.actions].map((header, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => (
              <tr key={student.id} style={{ borderBottom: `1px solid ${C.border}`, background: index % 2 === 0 ? C.card : "var(--row-alt)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: C.text }}>
                  <div>{student.name}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{student.nameEn}</div>
                </td>
                <td style={{ padding: "10px 12px", color: C.muted }}>{student.class}</td>
                <td style={{ padding: "10px 12px", color: C.text }}>{student.roll}</td>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                  <button type="button" onClick={() => openView(student)} style={{ border: "none", background: C.skyL, color: C.skyD, borderRadius: 6, padding: "5px 10px", cursor: "pointer", marginRight: 6, fontWeight: 700 }}>{t.students.view}</button>
                  <button type="button" onClick={() => startEdit(student)} style={{ border: "none", background: C.emeraldL, color: C.emeraldD, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 700 }}>{t.common.edit}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          <div style={{ color: C.muted, fontSize: 12 }}>{tr("students.totalStudentsLine", { count: total })}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ border: `1px solid ${C.border}`, background: C.card, color: page <= 1 ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}>Prev</button>
            <span style={{ color: C.muted, fontSize: 12 }}>{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ border: `1px solid ${C.border}`, background: C.card, color: page >= totalPages ? C.muted : C.text, borderRadius: 6, padding: "6px 10px", cursor: page >= totalPages ? "not-allowed" : "pointer", fontSize: 12 }}>Next</button>
          </div>
        </div>
      </div>
      )}

      {viewing && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setViewing(null)}>
          <div className="modal-content" style={{ background: C.card, borderRadius: 8, padding: 24, width: 920, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
              {viewing.studentPhoto ? <img src={viewing.studentPhoto} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} /> : null}
              <div>
                <h3 style={{ margin: 0, color: C.text, fontSize: 20 }}>{viewing.name}</h3>
                <div style={{ color: C.muted, fontSize: 13 }}>{viewing.nameEn} | {viewing.admissionNumber || t.students.noAdmissionNumber}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={printHistory} style={{ border: "none", background: C.sky, color: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>{t.common.print} হিস্ট্রি</button>
                <button type="button" onClick={() => startEdit(viewing)} style={{ border: "none", background: C.emeraldL, color: C.emeraldD, borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>{t.students.editStudent}</button>
                <button type="button" onClick={() => setViewing(null)} style={{ border: `1px solid ${C.border}`, background: C.card, color: C.muted, borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>{t.common.close}</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginBottom: 18 }}>
              <div style={{ background: C.slateL, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: C.muted }}>মোট হাজিরা</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{attendanceSummary.total}</div>
              </div>
              <div style={{ background: C.slateL, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: C.muted }}>উপস্থিত</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{attendanceSummary.present}</div>
              </div>
              <div style={{ background: C.slateL, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: C.muted }}>অনুপস্থিত</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{attendanceSummary.absent}</div>
              </div>
              <div style={{ background: C.slateL, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: C.muted }}>দেরিতে</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{attendanceSummary.late}</div>
              </div>
            </div>

            {historyError && <div style={{ color: C.rose, marginBottom: 12 }}>{historyError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {detailSections.map((section) => (
                <div key={section.title} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: C.slateL, padding: "8px 12px", fontWeight: 800, color: C.text }}>{section.title}</div>
                  <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, padding: 10 }}>
                    {section.rows.map(([label, value]) => (
                      <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 700, whiteSpace: "pre-wrap" }}>{textValue(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <h4 style={{ margin: 0, color: C.text }}>{t.students.attendanceMonth}</h4>
                <div style={{ color: C.muted, fontSize: 12 }}>{attendanceHistory.length ? `মোট ${attendanceHistory.length}টি রেকর্ড` : ""}</div>
              </div>
              <div className="table-wrap" style={{ background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
                  <thead>
                    <tr style={{ background: C.slateL }}>
                      {[
                        "তারিখ",
                        t.students.status,
                      ].map((header, i) => (
                        <th key={i} style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading && <SkeletonTableRows rows={5} columns={2} />}
                    {attendanceHistory.map((row, index) => (
                      <tr key={`${row.date}-${index}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "10px 12px", color: C.text }}>{row.date}</td>
                        <td style={{ padding: "10px 12px", color: C.text }}>{row.status}</td>
                      </tr>
                    ))}
                    {!attendanceHistory.length && !historyLoading && (
                      <tr>
                        <td colSpan={2} style={{ padding: 14, color: C.muted, textAlign: "center" }}>কোনো হাজিরা ইতিহাস নেই</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

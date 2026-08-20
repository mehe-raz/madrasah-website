import { useCallback, useEffect, useMemo, useState } from "react";
import { SkeletonTableRows } from "../components/Skeleton";
import { RecordCard, RecordCardList } from "../components/RecordCard";
import { Badge } from "../components/Badge";
import { ScanEnrollButton } from "../components/ScanEnrollModal";
import { Button, Card, ClassCascadeSelect, Field, Input, ReadonlyValue, Select, Textarea } from "../components/ui";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../lib/api";
import { classTreeLabel, deptFilterOptions, findClassTreePath } from "../lib/classTree";
import { fmt } from "../lib/fmt";
import { deptCodeFromTreeTopLevel, deptLabel, typeLabel } from "../lib/labels";
import { getOutboxEntriesFor, removeOutboxEntry, type OutboxEntry } from "../lib/offlineDb";
import { printAdmissionForm, printAdmissionSummary, printReportTable, printStudentIdCard } from "../lib/printReport";
import { C } from "../theme/colors";
import type { Student, StudentDocuments } from "../types";
import { useAppSettings } from "../context/AppSettingsContext";
import { usePlanFeatures } from "../context/PlanContext";
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
  // docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2B
  fingerprintId: "",
  cardUid: "",
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
  // docs/GENERAL_MODE_PLAN.md, Phase 4 — was hardcoded "Hifz"; left blank
  // now since this field is always auto-derived from the chosen class/jamaat
  // (handleClassChange below) before the form can be submitted (step3Required
  // still requires it), and a "general" institution_type tenant's tree never
  // has a "Hifz" branch to derive from. ReadonlyValue below already shows
  // t.common.select as a placeholder when this is blank.
  dept: "",
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

const bloodOptions = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const genderOptions = ["Male", "Female"];
const religionOptions = ["Islam"];

// "চলতি বছর + পরের বছর" dynamically, instead of hardcoding years that go
// stale — matches server/src/models/studentAdmission.js, which only
// validates the 4-digit format and leaves the actual allowed range to the
// frontend.
function academicYearOptions(currentValue?: string) {
  const year = new Date().getFullYear();
  const options = [String(year), String(year + 1)];
  // Keep an older/edited record's existing year selectable even if it falls
  // outside the current/next-year window, so opening it for edit never
  // silently changes the value.
  if (currentValue && !options.includes(currentValue)) options.unshift(currentValue);
  return options;
}

function sectionTitle(title: string) {
  return <h3 className="section-title">{title}</h3>;
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
  const { t, tr, classTree } = useAppSettings();
  const isMobile = useMediaQuery("(max-width: 768px)");
  // docs/GENERAL_MODE_PLAN.md, Phase 4 — department filter tabs, derived
  // from this tenant's own class/jamaat tree top-level departments (see
  // deptFilterOptions) instead of a hardcoded madrasah-only list, so a
  // "general" institution_type tenant's school/college departments show up
  // here too.
  const departmentFilterOptions = useMemo(() => deptFilterOptions(classTree), [classTree]);
  // docs/GENERAL_MODE_PLAN.md, Phase 5 — "para" (Quran memorization
  // progress) shown/editable only when hifzTracking is on, bound to the
  // exact same flag Phase 3 already gates the whole Hifz Tracking module
  // and route with (usePlanFeatures/PlanFeatureGate) — no separate new
  // condition. isLocked() fails open (returns false) while plan features
  // are still loading or for a single-tenant deployment, same as
  // PlanFeatureGate elsewhere, so this never flashes hidden->shown.
  const { isLocked } = usePlanFeatures();
  const hifzEnabled = !isLocked("hifzTracking");
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
  const [guardianAccountResult, setGuardianAccountResult] = useState<{ mobile: string; password: string | null; message: string } | null>(null);
  const [guardianAccountError, setGuardianAccountError] = useState("");
  const [guardianAccountLoading, setGuardianAccountLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRow[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState({ total: 0, present: 0, absent: 0, late: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [pendingAdmissions, setPendingAdmissions] = useState<OutboxEntry[]>([]);
  const [queuedMessage, setQueuedMessage] = useState("");
  // View modal shows only the summary (name/class/roll/attendance) by
  // default; the 5 detail sections (admission, student, guardian, address,
  // previous education) only render once this is toggled on, so opening a
  // record for a quick look doesn't dump the entire admission form at once.
  const [showFullDetails, setShowFullDetails] = useState(false);

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

  // Locally-queued admissions (not yet on the server) and any that came
  // back with a definitive error (e.g. duplicate admission number) at sync
  // time — see offlineDb.ts / offlineSync.ts. Polled rather than event-
  // driven for the same reason as useOnlineStatus's pendingCount: the
  // outbox changes from several independent places (this screen's own
  // submit, and the background flush on "online"), and polling is simpler
  // than a pub/sub layer at this queue size.
  //
  // A .then()/.catch() chain rather than async/await so the effect below
  // never calls setState synchronously in its own body (react-hooks
  // set-state-in-effect) — same shape as useOnlineStatus.ts's refresh().
  const loadPendingAdmissions = useCallback(() => {
    getOutboxEntriesFor("/students", "POST")
      .then((entries) => setPendingAdmissions(entries))
      .catch(() => {
        // IndexedDB unavailable (private browsing etc.) — not critical.
      });
  }, []);

  useEffect(() => {
    loadPendingAdmissions();
    const interval = window.setInterval(loadPendingAdmissions, 5000);
    window.addEventListener("online", loadPendingAdmissions);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", loadPendingAdmissions);
    };
  }, [loadPendingAdmissions]);

  const discardOutboxEntry = async (clientRequestId: string) => {
    await removeOutboxEntry(clientRequestId);
    loadPendingAdmissions();
  };

  // Any filter change should restart from page 1, since the current page
  // number may no longer exist under the new filter (see setSearch/
  // setDepartment/setStatus handlers below, which reset page alongside it).
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!viewing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting attendance-history state when the detail modal closes (viewing becomes null); nothing to derive during render since the modal is gone
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
  }, [viewing, t.common.requestFailed]);

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
    setShowFullDetails(false);
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
    setQueuedMessage("");
    if (Object.keys(nextErrors).length) return;

    const printWindow = window.open("", "_blank", "width=980,height=760");
    setSaving(true);
    try {
      const payload = { ...form, studentPhoto: form.documents.studentPhoto || form.studentPhoto || "" };
      if (editing) {
        const saved = await api.updateStudent(editing.id, payload);
        await load();
        setEditing(saved);
        setViewing(saved);
        setShowForm(false);
        setStep(0);
        if (printWindow) printAdmissionForm(saved, printWindow);
        return;
      }

      // New admission: offline-first Phase 4. The server assigns the real
      // roll/admission number at sync time, so a queued entry has nothing
      // to print yet — the popup opened above (needed synchronously, before
      // any await, so browsers don't block it as a popup) is closed unused.
      const result = await api.createStudentOrQueue(payload);
      if (result.queued) {
        if (printWindow && !printWindow.closed) printWindow.close();
        loadPendingAdmissions();
        setShowForm(false);
        setStep(0);
        setQueuedMessage(t.students.admissionQueued);
      } else if (result.data) {
        await load();
        setEditing(result.data);
        setViewing(result.data);
        setShowForm(false);
        setStep(0);
        // New admission: print the official Admission Form the moment the
        // account is created — same popup opened synchronously above
        // (before the await), so the browser doesn't treat it as a blocked
        // popup.
        if (printWindow) printAdmissionForm(result.data, printWindow);
      }
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

  // Setting the class via the cascading tree picker also auto-derives
  // `dept` from the chosen top-level department, replacing the old manual
  // dept Select (see the read-only dept field in step 2 of the form below)
  // — see deptCodeFromTreeTopLevel in lib/labels.ts for the exact mapping.
  const handleClassChange = (en: string) => {
    setField("class", en);
    const path = findClassTreePath(classTree, en);
    if (path && path.length) setField("dept", deptCodeFromTreeTopLevel(path[0].en));
  };

  const renderInput = (label: string, field: AdmissionField, type = "text") => (
    <Field label={label}>
      <Input
        type={type}
        value={String(form[field] ?? "")}
        onChange={(event) => setField(field, type === "number" ? Number(event.target.value) : event.target.value)}
        error={!!errors[String(field)]}
      />
      {errors[String(field)] && <span className="field-error">{errors[String(field)]}</span>}
    </Field>
  );

  const renderSelect = (
    label: string,
    field: AdmissionField,
    options: string[],
    labelFor?: (option: string) => string
  ) => (
    <Field label={label}>
      <Select value={String(form[field] ?? "")} onChange={(event) => setField(field, event.target.value)} error={!!errors[String(field)]}>
        {options.map((option) => (
          <option key={option} value={option}>
            {(option && labelFor ? labelFor(option) : option) || t.common.select}
          </option>
        ))}
      </Select>
      {errors[String(field)] && <span className="field-error">{errors[String(field)]}</span>}
    </Field>
  );

  const renderTextArea = (label: string, field: AdmissionField) => (
    <Field label={label}>
      <Textarea value={String(form[field] ?? "")} onChange={(event) => setField(field, event.target.value)} rows={3} error={!!errors[String(field)]} />
      {errors[String(field)] && <span className="field-error">{errors[String(field)]}</span>}
    </Field>
  );

  const renderUpload = (label: string, key: keyof StudentDocuments, optional = false) => {
    const photoPreview = key === "studentPhoto" ? form.documents.studentPhoto || form.studentPhoto : "";
    return (
      <Field label={optional ? `${label} (${t.students.optional})` : label}>
        <div className="row row--gap-8 row--wrap">
          {photoPreview && <img src={photoPreview} alt="" className="avatar-64" />}
          <Input
            type="file"
            accept={key === "studentPhoto" ? "image/*" : "image/*,application/pdf"}
            onChange={(event) => uploadDocument(key, event.target.files?.[0])}
          />
        </div>
        {form.documents[key] && <span className="field-hint-success">{t.common.uploaded}</span>}
      </Field>
    );
  };

  const detailSections: DetailSection[] = viewing
    ? [
        {
          title: t.students.admissionInfo,
          rows: [
            [t.students.admissionNo, viewing.admissionNumber],
            [t.students.admissionDate, viewing.admissionDate],
            [t.students.academicYear, viewing.academicYear],
            [t.students.session, viewing.session],
            [t.students.classJamaat, viewing.class ? classTreeLabel(classTree, viewing.class) : viewing.class],
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
            [t.students.fingerprintId, viewing.fingerprintId || t.students.optional],
            [t.students.cardUid, viewing.cardUid || t.students.optional],
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
            ...(hifzEnabled ? [[t.students.memorizedQuran, viewing.para] as [string, string | number | null | undefined]] : []),
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
      title: `হাজিরা ইতিহাস - ${viewing?.name || "শিক্ষার্থী"}`,
      subtitle: `মোট ${attendanceSummary.total} দিন | উপস্থিত ${attendanceSummary.present} | অনুপস্থিত ${attendanceSummary.absent} | দেরিতে ${attendanceSummary.late}`,
      headers: ["তারিখ", "স্ট্যাটাস"],
      rows: attendanceHistory.map((row) => [row.date, row.status]),
    });
  };

  const connectGuardian = async () => {
    if (!viewing) return;
    setGuardianAccountError("");
    setGuardianAccountLoading(true);
    try {
      const res = await api.createGuardianAccountForStudent(viewing.id);
      setGuardianAccountResult({ mobile: res.mobile, password: res.password, message: res.message });
    } catch (err) {
      setGuardianAccountError(err instanceof Error ? err.message : "যুক্ত করা যায়নি");
    } finally {
      setGuardianAccountLoading(false);
    }
  };

  const queuedAdmissions = pendingAdmissions.filter((entry) => entry.status !== "failed");
  const failedAdmissions = pendingAdmissions.filter((entry) => entry.status === "failed");

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-header__title">{t.students.admissionTitle}</h2>
          <p className="page-header__subtitle">{t.students.admissionSubtitle}</p>
        </div>
        <Button variant="emerald" solid onClick={startCreate}>
          {t.students.newAdmission}
        </Button>
      </div>

      <div className="filter-bar">
        <Input
          className="filter-bar__search"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder={t.students.admissionSearch}
        />
        <Select className="filter-bar__select" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>
          <option value="All">{t.common.all}</option>
          {departmentFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select className="filter-bar__select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          {(["All", t.students.active, t.students.inactive] as string[]).map((option) => (
            <option key={option} value={option === t.students.active ? "Active" : option === t.students.inactive ? "Inactive" : option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      {queuedMessage && <div className="alert alert--amber">{queuedMessage}</div>}
      {message && <div className="alert alert--rose">{message}</div>}

      {queuedAdmissions.length > 0 && (
        <div className="alert alert--amber">
          <div className="sync-panel__title">
            {t.students.pendingAdmissionsTitle} ({queuedAdmissions.length})
          </div>
          {queuedAdmissions.map((entry) => {
            const body = entry.body as Partial<Student>;
            return (
              <div key={entry.clientRequestId} className="row row--gap-8 row--wrap sync-panel__row">
                <Badge label={t.students.temporary} color={C.amber} />
                <span>{body.name || "—"}</span>
                <span className="table-pagination__info">{body.class}</span>
              </div>
            );
          })}
        </div>
      )}

      {failedAdmissions.length > 0 && (
        <div className="alert alert--rose">
          <div className="sync-panel__title">{t.students.syncIssuesTitle}</div>
          <div className="sync-panel__hint">{t.students.syncIssueHint}</div>
          {failedAdmissions.map((entry) => {
            const body = entry.body as Partial<Student>;
            return (
              <div key={entry.clientRequestId} className="row row--gap-8 row--wrap sync-panel__row">
                <span>{body.name || "—"}</span>
                <span className="table-pagination__info">{entry.lastError}</span>
                <Button variant="outline" onClick={() => discardOutboxEntry(entry.clientRequestId)}>
                  {t.students.discardEntry}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="form-section">
          <div className="form-section__head">
            <div>
              <h3 className="form-section__head-title">{editing ? t.students.editAdmission : t.students.admissionForm}</h3>
              <div className="form-section__step-label">{wizardSteps[step]}</div>
            </div>
            <div className="wizard-steps">
              {wizardSteps.map((label, index) => (
                <span key={label} className={`wizard-step-badge ${index === step ? "wizard-step-badge--active" : ""}`}>
                  {index + 1}. {label}
                </span>
              ))}
            </div>
          </div>

          {step === 0 && (
            <>
              {sectionTitle(t.students.admissionInfo)}
              <div className="form-grid">
                {renderInput(t.students.admissionNumber, "admissionNumber")}
                {renderInput(t.students.admissionDate, "admissionDate", "date")}
                {renderSelect(t.students.academicYear, "academicYear", academicYearOptions(String(form.academicYear || "")))}
                {renderInput(t.students.session, "session")}
                <ClassCascadeSelect
                  tree={classTree}
                  value={String(form.class || "")}
                  onChange={handleClassChange}
                  error={!!errors.class}
                />
                {renderInput(t.students.section, "section")}
                {renderInput(t.students.rollNumber, "roll")}
                {renderSelect(t.students.studentType, "type", ["Day", "Residential"], typeLabel)}
              </div>

              {sectionTitle(t.students.studentInfo)}
              <div className="form-grid">
                {renderInput(t.students.bengaliName, "name")}
                {renderInput(t.students.englishName, "nameEn")}
                {renderInput(t.students.dateOfBirth, "dateOfBirth", "date")}
                {renderInput(`${t.students.birthRegistration} (${t.students.optional})`, "birthRegistrationNumber")}
                <div className="field-with-action">
                  {renderInput(`${t.students.fingerprintId} (${t.students.optional})`, "fingerprintId")}
                  <ScanEnrollButton onCaptured={(value) => setField("fingerprintId", value)} />
                </div>
                <div className="field-with-action">
                  {renderInput(`${t.students.cardUid} (${t.students.optional})`, "cardUid")}
                  <ScanEnrollButton onCaptured={(value) => setField("cardUid", value)} />
                </div>
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
              <div className="form-grid">
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
              <div className="form-grid form-grid--wide">
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
              <div className="form-grid">
                {renderInput(t.students.previousInstitution, "previousInstitution")}
                {renderInput(t.students.previousClass, "previousClass")}
              </div>

              {sectionTitle(t.students.madrasaInfo)}
              <div className="form-grid">
                <Field label={t.students.department}>
                  <ReadonlyValue>{form.dept ? deptLabel(form.dept) : t.common.select}</ReadonlyValue>
                </Field>
                {hifzEnabled && renderInput(t.students.memorizedQuran, "para", "number")}
              </div>

              {sectionTitle(t.students.feeInfo)}
              <div className="form-grid">
                {renderInput(t.students.admissionFee, "admissionFee", "number")}
                {renderInput(t.students.monthlyFee, "fee", "number")}
                {renderInput(t.students.discount, "discount", "number")}
                {renderInput(t.students.previousDue, "due", "number")}
              </div>
              <div className="info-box">
                <div className="info-box__value">{t.students.previousDueHint}</div>
              </div>

              {sectionTitle(t.students.documents)}
              <div className="form-grid form-grid--wide">
                {renderUpload(t.students.birthCertificate, "birthCertificate")}
                {renderUpload(t.students.guardianNid, "guardianNid")}
                {renderUpload(t.students.previousCertificate, "previousCertificate", true)}
              </div>
            </>
          )}

          <div className="wizard-actions">
            {step > 0 && (
              <Button variant="outline" onClick={goBack}>
                পেছনে
              </Button>
            )}
            {step < 2 ? (
              <Button variant="sky" solid onClick={goNext}>
                পরবর্তী
              </Button>
            ) : (
              <Button variant="emerald" solid disabled={saving} onClick={saveAdmission}>
                {saving ? t.students.saving : editing ? `${t.students.saveChanges} & ${t.common.print}` : `${t.students.saveAdmission} & ${t.common.print}`}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setShowForm(false); setStep(0); setErrors({}); }}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      )}

      {isMobile ? (
        <Card className="table-card" style={{ padding: 12 }}>
          <RecordCardList>
            {students.map((student) => (
              <RecordCard
                key={student.id}
                title={student.name}
                subtitle={student.nameEn}
                fields={[
                  { label: t.students.class, value: student.class ? classTreeLabel(classTree, student.class) : student.class },
                  { label: t.students.roll, value: student.roll },
                ]}
                actions={
                  <>
                    <Button variant="sky" fullWidth onClick={() => openView(student)}>{t.students.view}</Button>
                    <Button variant="emerald" fullWidth onClick={() => startEdit(student)}>{t.common.edit}</Button>
                  </>
                }
              />
            ))}
          </RecordCardList>
          <div className="table-pagination table-pagination--card">
            <div className="table-pagination__info">{tr("students.totalStudentsLine", { count: total })}</div>
            <div className="table-pagination__controls">
              <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
              <span className="table-pagination__info">{page} / {totalPages}</span>
              <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
            </div>
          </div>
        </Card>
      ) : (
      <div className="table-wrap table-card">
        <table className="data-table data-table--wide">
          <thead>
            <tr>
              {[t.students.name, t.students.class, t.students.roll, t.common.actions].map((header, i) => (
                <th key={i}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>
                  <div>{student.name}</div>
                  <div className="table-pagination__info">{student.nameEn}</div>
                </td>
                <td>{student.class ? classTreeLabel(classTree, student.class) : student.class}</td>
                <td>{student.roll}</td>
                <td className="nowrap">
                  <Button variant="sky" onClick={() => openView(student)} style={{ marginRight: 6 }}>{t.students.view}</Button>
                  <Button variant="emerald" onClick={() => startEdit(student)}>{t.common.edit}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-pagination">
          <div className="table-pagination__info">{tr("students.totalStudentsLine", { count: total })}</div>
          <div className="table-pagination__controls">
            <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
            <span className="table-pagination__info">{page} / {totalPages}</span>
            <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      </div>
      )}

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal-content modal-content--wide" onClick={(event) => event.stopPropagation()}>
            <div className="row row--gap-14 row--wrap mb-18">
              {viewing.studentPhoto ? <img src={viewing.studentPhoto} alt="" className="avatar-64" /> : null}
              <div>
                <h3 className="detail-modal__name">{viewing.name}</h3>
                <div className="table-pagination__info">{viewing.nameEn} | {viewing.admissionNumber || t.students.noAdmissionNumber}</div>
                <div className="table-pagination__info">{viewing.class ? classTreeLabel(classTree, viewing.class) : viewing.class} | {t.students.rollNumber}: {viewing.roll}</div>
              </div>
              <div className="row row--gap-8 row--wrap row--ml-auto">
                <Button variant="sky" solid onClick={() => printAdmissionSummary(viewing)}>{t.students.printSummary}</Button>
                <Button variant="violet" solid onClick={() => printStudentIdCard(viewing)}>{t.students.printIdCard}</Button>
                <Button variant="sky" solid onClick={printHistory}>{t.common.print} হিস্ট্রি</Button>
                <Button variant="teal" onClick={connectGuardian} disabled={guardianAccountLoading}>
                  {guardianAccountLoading ? "..." : "গার্ডিয়ান অ্যাকাউন্ট তৈরি করুন"}
                </Button>
                <Button variant="emerald" onClick={() => startEdit(viewing)}>{t.students.editStudent}</Button>
                <Button variant="outline" onClick={() => setViewing(null)}>{t.common.close}</Button>
              </div>
            </div>

            {guardianAccountError && <div className="alert alert--rose">{guardianAccountError}</div>}
            <div className="detail-stats-grid">
              <div className="detail-stat">
                <div className="detail-stat__label">মোট হাজিরা</div>
                <div className="detail-stat__value">{attendanceSummary.total}</div>
              </div>
              <div className="detail-stat">
                <div className="detail-stat__label">উপস্থিত</div>
                <div className="detail-stat__value">{attendanceSummary.present}</div>
              </div>
              <div className="detail-stat">
                <div className="detail-stat__label">অনুপস্থিত</div>
                <div className="detail-stat__value">{attendanceSummary.absent}</div>
              </div>
              <div className="detail-stat">
                <div className="detail-stat__label">দেরিতে</div>
                <div className="detail-stat__value">{attendanceSummary.late}</div>
              </div>
            </div>

            {historyError && <div className="alert alert--rose">{historyError}</div>}

            <div className="row row--justify-center mt-18">
              <Button variant="outline" onClick={() => setShowFullDetails((prev) => !prev)}>
                {showFullDetails ? t.students.hideFullDetails : t.students.viewFullDetails}
              </Button>
            </div>

            {showFullDetails && (
              <div className="detail-sections-grid">
                {detailSections.map((section) => (
                  <div key={section.title} className="detail-section">
                    <div className="detail-section__title">{section.title}</div>
                    <div className="detail-section__grid">
                      {section.rows.map(([label, value]) => (
                        <div key={label} className="detail-field">
                          <div className="detail-field__label">{label}</div>
                          <div className="detail-field__value">{textValue(value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-18">
              <div className="row row--gap-8 row--wrap row--justify-between mb-10">
                <h4 className="detail-modal__subheading">{t.students.attendanceMonth}</h4>
                <div className="table-pagination__info">{attendanceHistory.length ? `মোট ${attendanceHistory.length}টি রেকর্ড` : ""}</div>
              </div>
              <div className="table-wrap table-card">
                <table className="data-table data-table--narrow">
                  <thead>
                    <tr>
                      {["তারিখ", t.students.status].map((header, i) => (
                        <th key={i}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading && <SkeletonTableRows rows={5} columns={2} />}
                    {attendanceHistory.map((row, index) => (
                      <tr key={`${row.date}-${index}`}>
                        <td>{row.date}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                    {!attendanceHistory.length && !historyLoading && (
                      <tr>
                        <td colSpan={2} className="empty-cell">কোনো হাজিরা ইতিহাস নেই</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {guardianAccountResult && (
        <div className="modal-backdrop" onClick={() => setGuardianAccountResult(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3 className="detail-modal__name">অভিভাবক সংযুক্ত হয়েছে</h3>
            <p className="table-pagination__info mb-18">{guardianAccountResult.message}</p>

            <div className="detail-field mb-10">
              <div className="detail-field__label">মোবাইল (লগইন)</div>
              <div className="detail-field__value">{guardianAccountResult.mobile}</div>
            </div>

            {guardianAccountResult.password ? (
              <>
                <div className="detail-field mb-18">
                  <div className="detail-field__label">পাসওয়ার্ড</div>
                  <div className="detail-field__value">{guardianAccountResult.password}</div>
                </div>
                <div className="alert alert--rose mb-18">
                  এই পাসওয়ার্ডটি এখনই অভিভাবককে দিয়ে দিন — পরে আর এখান থেকে দেখা যাবে না। ওয়েবসাইটের "অভিভাবক লগইন" থেকে এই মোবাইল ও পাসওয়ার্ড দিয়ে লগইন করতে বলুন।
                </div>
              </>
            ) : (
              <p className="table-pagination__info mb-18">এই মোবাইল নম্বরে আগে থেকেই একটি অভিভাবক অ্যাকাউন্ট ছিল — সেটা এখন এই শিক্ষার্থীর সাথেও যুক্ত করা হয়েছে। পূর্বের পাসওয়ার্ড দিয়েই লগইন করবেন।</p>
            )}

            <Button variant="outline" onClick={() => setGuardianAccountResult(null)}>{t.common.close}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

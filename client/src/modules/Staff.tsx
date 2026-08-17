// docs/STAFF_ATTENDANCE_PLAN.md, Phase 5 — staff registry UI. Wires
// api.getStaffList/createStaff/updateStaff (Phase 5) against
// routes/staff.js (Phase 2). Modeled directly on AttendanceDevices.tsx's
// "form card + list of cards, same page" layout — this codebase has no
// generic Modal component, so edit reuses the add form in place (same
// pattern Settings.tsx's user section uses) rather than opening a dialog.
//
// Deliberately separate from Settings.tsx's "ব্যবহারকারী" (User) section:
// a Staff row is the actual employee record; linkedUserId is only an
// OPTIONAL pointer at a software-login User for the staff who have one.
// Login creation/editing itself stays in Settings — not duplicated here
// (plan doc §2).
import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { STAFF_DESIGNATIONS } from "../types";
import type { Staff as StaffRecord, User } from "../types";
import { C } from "../theme/colors";

// STAFF_DESIGNATIONS values are Bengali-native (like ATTENDANCE_STATUSES on
// the server) regardless of UI language — same simplification the rest of
// this codebase uses for domain values (dept, attendance status). Pull the
// "teacher"/"other" sentinels from the array itself rather than comparing
// against t.staff.designationOther, which is a translated DISPLAY string
// (e.g. "Other" in English) and would never match the actual stored value.
const TEACHER_DESIGNATION = STAFF_DESIGNATIONS[0];
const OTHER_DESIGNATION = STAFF_DESIGNATIONS[STAFF_DESIGNATIONS.length - 1];

interface FormState {
  name: string;
  phone: string;
  designation: string;
  designationOther: string;
  cls: string;
  joiningDate: string;
  note: string;
  userId: number | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  designation: STAFF_DESIGNATIONS[0],
  designationOther: "",
  cls: "",
  joiningDate: "",
  note: "",
  userId: null,
};

export function Staff() {
  const { t } = useLanguage();
  const c = t.staff;

  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [busyId, setBusyId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Inactive">("Active");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      api.getStaffList(filterStatus === "All" ? undefined : { status: filterStatus }),
      // Users list is only needed to populate the "link a login" dropdown
      // — the same list Settings.tsx's user section already fetches, no
      // new endpoint. Failure here shouldn't block showing the staff list.
      api.getUsers().catch(() => []),
    ])
      .then(([staffRows, userRows]) => {
        setStaff(staffRows);
        setUsers(userRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : c.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError("");
  };

  const startEdit = (row: StaffRecord) => {
    const knownDesignation = (STAFF_DESIGNATIONS as readonly string[]).includes(row.designation);
    setForm({
      name: row.name,
      phone: row.phone,
      designation: knownDesignation ? row.designation : OTHER_DESIGNATION,
      designationOther: knownDesignation ? "" : row.designation,
      cls: row.class,
      joiningDate: row.joiningDate,
      note: row.note,
      userId: row.userId,
    });
    setEditingId(row.id);
    setSaveError("");
  };

  const save = async () => {
    if (!form.name.trim()) {
      setSaveError(c.nameRequired);
      return;
    }
    const designation = form.designation === OTHER_DESIGNATION ? form.designationOther.trim() : form.designation;
    if (!designation) {
      setSaveError(c.designationRequired);
      return;
    }

    setSaving(true);
    setSaveError("");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      designation,
      class: form.cls.trim(),
      joiningDate: form.joiningDate.trim(),
      note: form.note.trim(),
      userId: form.userId,
    };
    try {
      if (editingId != null) {
        await api.updateStaff(editingId, payload);
      } else {
        await api.createStaff(payload);
      }
      resetForm();
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : c.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: StaffRecord) => {
    setBusyId(row.id);
    try {
      await api.updateStaff(row.id, { status: row.status === "Active" ? "Inactive" : "Active" });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const isTeacher = form.designation === TEACHER_DESIGNATION;
  const linkedUserName = (userId: number | null) => users.find((u) => u.id === userId)?.name;

  const visibleStaff = staff.filter((row) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return row.name.toLowerCase().includes(q) || row.phone.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{c.title}</h2>
          <p className="page-subtitle">{c.subtitle}</p>
        </div>
      </div>

      <Card className="class-post-form">
        <h3 className="page-header__title">{editingId != null ? c.editTitle : c.addNew}</h3>
        {saveError && <div className="alert alert--rose">{saveError}</div>}
        <div className="form-grid">
          <Field label={c.nameLabel}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={c.namePlaceholder} />
          </Field>
          <Field label={c.phoneLabel}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={c.designationLabel}>
            <Select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}>
              {STAFF_DESIGNATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          {form.designation === OTHER_DESIGNATION && (
            <Field label={c.designationOtherPlaceholder}>
              <Input value={form.designationOther} onChange={(e) => setForm({ ...form, designationOther: e.target.value })} placeholder={c.designationOtherPlaceholder} />
            </Field>
          )}
          {isTeacher && (
            <Field label={c.classLabel}>
              <Input value={form.cls} onChange={(e) => setForm({ ...form, cls: e.target.value })} />
            </Field>
          )}
          <Field label={c.joiningDateLabel}>
            <Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          </Field>
          <Field label={c.linkedUserLabel}>
            <Select
              value={form.userId == null ? "" : String(form.userId)}
              onChange={(e) => setForm({ ...form, userId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">{c.linkedUserNone}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={c.noteLabel}>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
        <p className="page-subtitle">{c.linkedUserHint}</p>
        <div className="class-post__actions">
          <Button variant="sky" solid onClick={save} disabled={saving}>
            {saving ? c.saving : c.save}
          </Button>
          {editingId != null && (
            <Button variant="outline" onClick={resetForm}>
              {c.cancel}
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <div className="form-grid">
          <Field label={c.searchLabel}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={c.searchPlaceholder} />
          </Field>
          <Field label={c.statusLabel}>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "All" | "Active" | "Inactive")}>
              <option value="All">{c.filterAll}</option>
              <option value="Active">{c.filterActive}</option>
              <option value="Inactive">{c.filterInactive}</option>
            </Select>
          </Field>
        </div>

        {loading && <SkeletonCardList count={3} lines={2} />}
        {!loading && error && <div className="alert alert--rose">{error}</div>}
        {!loading && !error && visibleStaff.length === 0 && <p className="page-subtitle">{c.noStaff}</p>}

        {!loading &&
          !error &&
          visibleStaff.map((row) => (
            <Card key={row.id} tight className="class-post">
              <div className="class-post__head">
                <Badge label={row.status === "Active" ? c.statusActive : c.statusInactive} color={row.status === "Active" ? C.emerald : C.slate} />
                <Badge label={row.designation} color={C.sky} />
                {row.userId != null && <Badge label={linkedUserName(row.userId) ?? c.hasLogin} color={C.violet} />}
                {row.phone && <span className="class-post__meta">{row.phone}</span>}
              </div>
              <div className="class-post__title">{row.name}</div>
              {row.class && <div className="class-post__meta">{row.class}</div>}
              {row.note && <div className="class-post__meta">{row.note}</div>}
              <div className="class-post__actions">
                <Button variant="outline" onClick={() => startEdit(row)}>
                  {c.edit}
                </Button>
                <Button variant={row.status === "Active" ? "amber" : "emerald"} disabled={busyId === row.id} onClick={() => toggleStatus(row)}>
                  {row.status === "Active" ? c.deactivate : c.activate}
                </Button>
              </div>
            </Card>
          ))}
      </Card>
    </div>
  );
}

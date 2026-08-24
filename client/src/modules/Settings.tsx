import { useEffect, useState, type ReactNode } from "react";
import { HudSpinner } from "../components/HudSpinner";
import { SkeletonRows } from "../components/Skeleton";
import { Button, Input, Select } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { addClassTreeNode, removeClassTreeNode, addSubject, editSubject, removeSubject, flattenClassTree } from "../lib/classTree";
import { canBackup, canManageDomain, canManageShifts, canManageUsers } from "../lib/permissions";
import { Icons } from "../lib/icons";
import { USER_ROLES, type BackupConfig, type ClassShiftAssignment, type ClassTreeNode, type ClassTreeSubject, type GoogleDriveFile, type GoogleDriveStatus, type Settings as SettingsType, type Shift, type User } from "../types";

type GuardianApprovalData = Awaited<ReturnType<typeof api.getPendingGuardianApprovals>>;

// Formats a byte count like "1.2 MB" the way the Drive backup list shows it.
function formatFileSize(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="field-block__label">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Per-role accent color, applied as a background tint on the user list row
// and its status dot below — real per-instance data (which role each user
// has), not a fixed design-system value, so it stays a JS lookup rather
// than a CSS class. See AGENTS.md "Design System (mandatory)".
// Mirrors server/src/lib/classOptions.js's EN_SLUG_RE — client-side check is
// just for fast feedback; the server is the real source of truth.
const CLASS_EN_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

const ROLE_COLORS: Record<string, string> = {
  "Super Admin": "#6d28d9", // C.violet
  Admin: "#0f766e", // C.teal
  Accountant: "#10b981", // C.emerald
  Teacher: "#b45309", // C.amber
  "Hostel Manager": "#fb7185", // C.rose
};

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div className={`settings-section-head ${open ? "" : "settings-section-head--collapsed"}`}>
      <h3 className="settings-section-title">{title}</h3>
      <button type="button" onClick={onToggle} title={open ? "Close edit" : "Edit"} className="icon-btn">
        ...
      </button>
    </div>
  );
}

// Total leaf (জামাত/ক্লাস) count under a node, for the count badge next to
// a বিভাগ/নেসাব's name — lets Super Admin gauge a department's size without
// expanding it first.
function countLeaves(node: ClassTreeNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

// One বিষয় (subject) chip under a leaf class — compact pill (name + small
// edit/× actions) rather than a full-width row, so a class with a dozen
// subjects reads as a tag cloud instead of a long stacked list. Same
// remove-button convention as ClassPosts.tsx's guardian chips.
function SubjectChip({
  subject,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  subject: ClassTreeSubject;
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="pill class-tree-subject-chip">
      {subject.bn}
      <button type="button" onClick={onEdit} className="class-tree-subject-chip__edit" title={editLabel} aria-label={editLabel}>
        <Icons.pencil size={12} aria-hidden="true" />
      </button>
      <button type="button" onClick={onDelete} className="class-tree-subject-chip__remove" aria-label={deleteLabel}>
        ×
      </button>
    </span>
  );
}

// Recursive row for the class-tree editor. Three things this fixes vs the
// old flat version:
//  1. Each node with children is its own collapsible accordion (closed by
//     default) instead of the whole tree unfolding at once — opening one
//     বিভাগ no longer dumps every other বিভাগ's classes on screen too.
//  2. The add-child / edit form for a node renders inline right under that
//     node's own row, not in one shared block pinned to the top of the
//     panel — editing something 3 levels deep no longer means scrolling
//     away from it to reach the form.
//  3. A leaf (জামাত/ক্লাস — no children) is expandable too, revealing its
//     own বিষয় (subject) list with the same add/edit/delete/inline-form
//     pattern as the class tree itself, instead of subjects having nowhere
//     to live.
function ClassTreeRow({
  node,
  path,
  depth,
  addLabel,
  editLabel,
  deleteLabel,
  expandLabel,
  collapseLabel,
  activeAddPath,
  activeEditPath,
  onAddChild,
  onEdit,
  onDelete,
  renderAddForm,
  renderEditForm,
  subjectsLabel,
  subjectsEmptyLabel,
  subjectAddLabel,
  subjectEditLabel,
  activeSubjectAddPath,
  activeSubjectEditTarget,
  onAddSubject,
  onEditSubject,
  onDeleteSubject,
  renderSubjectAddForm,
  renderSubjectEditForm,
}: {
  node: ClassTreeNode;
  path: string[];
  depth: number;
  addLabel: string;
  editLabel: string;
  deleteLabel: string;
  expandLabel: string;
  collapseLabel: string;
  activeAddPath: string[] | null;
  activeEditPath: string[] | null;
  onAddChild: (path: string[]) => void;
  onEdit: (path: string[], node: ClassTreeNode) => void;
  onDelete: (path: string[], node: ClassTreeNode) => void;
  renderAddForm: () => ReactNode;
  renderEditForm: () => ReactNode;
  subjectsLabel: string;
  subjectsEmptyLabel: string;
  subjectAddLabel: string;
  subjectEditLabel: string;
  activeSubjectAddPath: string[] | null;
  activeSubjectEditTarget: { path: string[]; en: string } | null;
  onAddSubject: (leafPath: string[]) => void;
  onEditSubject: (leafPath: string[], subject: ClassTreeSubject) => void;
  onDeleteSubject: (leafPath: string[], subject: ClassTreeSubject) => void;
  renderSubjectAddForm: () => ReactNode;
  renderSubjectEditForm: (subject: ClassTreeSubject) => ReactNode;
}) {
  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren;
  // `open` is derived, not effect-driven: it's "the user manually toggled
  // this row open" OR'd with "something is currently being added/edited
  // inside it" (a child class, or — for a leaf — a subject), with no
  // useEffect needed to sync the two — the project's lint config flags
  // setState calls from inside an effect body (see
  // react-hooks/set-state-in-effect).
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const pathKey = path.join("/");
  const isAddTarget = activeAddPath !== null && activeAddPath.join("/") === pathKey;
  const isEditTarget = activeEditPath !== null && activeEditPath.join("/") === pathKey;
  const isSubjectAddTarget = isLeaf && activeSubjectAddPath !== null && activeSubjectAddPath.join("/") === pathKey;
  const isSubjectEditTargetHere =
    isLeaf && activeSubjectEditTarget !== null && activeSubjectEditTarget.path.join("/") === pathKey;
  const open = manuallyOpen || isAddTarget || isSubjectAddTarget || isSubjectEditTargetHere;

  return (
    <div className={`class-tree-row class-tree-row--depth-${Math.min(depth, 3)} ${depth === 0 ? "class-tree-row--top" : ""}`}>
      <div
        className="user-row class-tree-row__header class-tree-row__header--clickable"
        onClick={() => setManuallyOpen(!open)}
      >
        <Icons.chevronDown
          size={16}
          aria-hidden="true"
          className={open ? "class-tree-row__chevron class-tree-row__chevron--open" : "class-tree-row__chevron"}
        />
        {hasChildren ? (
          <Icons.classGroup size={depth === 0 ? 18 : 15} aria-hidden="true" className="class-tree-row__icon" />
        ) : (
          <Icons.classLeaf size={15} aria-hidden="true" className="class-tree-row__icon" />
        )}
        <div className="user-info">
          <div className="user-name">
            {node.bn}
            {hasChildren && <span className="class-tree-row__count">{countLeaves(node)}</span>}
            {isLeaf && (node.subjects || []).length > 0 && (
              <span className="class-tree-row__count class-tree-row__count--subjects">{(node.subjects || []).length}</span>
            )}
          </div>
          <div className="user-meta">{node.en}</div>
        </div>
        {hasChildren && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onAddChild(path); }} className="btn-xs btn-xs--cancel">
            {addLabel}
          </button>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(path, node); }} className="btn-xs">
          {editLabel}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(path, node); }} className="btn-xs btn-xs--delete">
          {deleteLabel}
        </button>
        <span className="sr-only">{open ? collapseLabel : expandLabel}</span>
      </div>

      {isEditTarget && renderEditForm()}
      {isAddTarget && renderAddForm()}

      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <ClassTreeRow
              key={child.en}
              node={child}
              path={[...path, child.en]}
              depth={depth + 1}
              addLabel={addLabel}
              editLabel={editLabel}
              deleteLabel={deleteLabel}
              expandLabel={expandLabel}
              collapseLabel={collapseLabel}
              activeAddPath={activeAddPath}
              activeEditPath={activeEditPath}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              renderAddForm={renderAddForm}
              renderEditForm={renderEditForm}
              subjectsLabel={subjectsLabel}
              subjectsEmptyLabel={subjectsEmptyLabel}
              subjectAddLabel={subjectAddLabel}
              subjectEditLabel={subjectEditLabel}
              activeSubjectAddPath={activeSubjectAddPath}
              activeSubjectEditTarget={activeSubjectEditTarget}
              onAddSubject={onAddSubject}
              onEditSubject={onEditSubject}
              onDeleteSubject={onDeleteSubject}
              renderSubjectAddForm={renderSubjectAddForm}
              renderSubjectEditForm={renderSubjectEditForm}
            />
          ))}
        </div>
      )}

      {open && isLeaf && (
        <div className="class-tree-subjects">
          <div className="class-tree-subjects__head">
            <span className="class-tree-subjects__label">
              <Icons.subjectIcon size={13} aria-hidden="true" />
              {subjectsLabel}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddSubject(path); }}
              className="btn-xs btn-xs--cancel"
            >
              {subjectAddLabel}
            </button>
          </div>

          {isSubjectAddTarget && renderSubjectAddForm()}

          {(node.subjects || []).length === 0 && !isSubjectAddTarget && (
            <p className="field-block__label class-tree-subjects__empty">{subjectsEmptyLabel}</p>
          )}

          {(node.subjects || []).length > 0 && (
            <div className="class-tree-subjects__chips">
              {(node.subjects || []).map((subject) => (
                <SubjectChip
                  key={subject.en}
                  subject={subject}
                  editLabel={subjectEditLabel}
                  deleteLabel={deleteLabel}
                  onEdit={() => onEditSubject(path, subject)}
                  onDelete={() => onDeleteSubject(path, subject)}
                />
              ))}
            </div>
          )}

          {activeSubjectEditTarget !== null &&
            activeSubjectEditTarget.path.join("/") === pathKey &&
            renderSubjectEditForm(
              (node.subjects || []).find((s) => s.en === activeSubjectEditTarget.en) || { id: "", bn: "", en: "" }
            )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <div className="info-row__label">{label}</div>
      <div className="info-row__value">{value || "-"}</div>
    </div>
  );
}

export function Settings() {
  const { user: authUser } = useAuth();
  const {
    settings,
    setSettings,
    saveSettings,
    users,
    refreshUsers,
    classOptions,
    refreshClassOptions,
    saveClassOptions,
    classTree,
    refreshClassTree,
    saveClassTree,
    editClassTreeNode,
  } = useAppSettings();
  const { t, tr } = useLanguage();
  const [saved, setSaved] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [bdLocations, setBdLocations] = useState<{ districts: string[]; upazilasByDistrict: Record<string, string[]> } | null>(null);
  const [bdLocationsError, setBdLocationsError] = useState(false);
  const [userForm, setUserForm] = useState({ name: "", role: "Teacher", email: "", password: "" });
  const [editDraft, setEditDraft] = useState<User | null>(null);
  const [classAssignDraft, setClassAssignDraft] = useState<{ userId: number; classes: string[] } | null>(null);
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[] | null>(null);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [restoringFileId, setRestoringFileId] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    source: { kind: "file"; file: File } | { kind: "drive"; file: GoogleDriveFile };
    exportedAt: string | null;
    backupCounts: Record<string, number>;
    currentCounts: Record<string, number>;
  } | null>(null);
  // Which sections (tables) the admin has ticked in the restore preview —
  // unticking one (e.g. "users") keeps that section's current data
  // untouched instead of overwriting it with the backup's version.
  // Defaults to "everything checked" whenever a new preview loads.
  const [restoreSelectedTables, setRestoreSelectedTables] = useState<Record<string, boolean>>({});
  const [restorePreviewLoading, setRestorePreviewLoading] = useState(false);
  const [restoreConfirming, setRestoreConfirming] = useState(false);
  const [msg, setMsg] = useState("");
  const [editInfo, setEditInfo] = useState(false);
  const [editSystem, setEditSystem] = useState(false);
  const [editBackup, setEditBackup] = useState(false);
  const [editUsers, setEditUsers] = useState(false);
  const [editGuardianApprovals, setEditGuardianApprovals] = useState(false);
  const [guardianApprovals, setGuardianApprovals] = useState<GuardianApprovalData>({ accounts: [], childLinks: [] });
  const [guardianApprovalsLoading, setGuardianApprovalsLoading] = useState(false);
  const [guardianReviewKey, setGuardianReviewKey] = useState<string | null>(null);
  const [editDomain, setEditDomain] = useState(false);
  const [editClasses, setEditClasses] = useState(false);
  const [classForm, setClassForm] = useState({ bn: "", en: "" });
  const [editClassTree, setEditClassTree] = useState(false);
  // null = no "add entry" form open; [] = adding a new top-level department;
  // [...en] = adding a child under that path (see lib/classTree.ts).
  const [classTreeAddTarget, setClassTreeAddTarget] = useState<string[] | null>(null);
  const [classTreeForm, setClassTreeForm] = useState({ bn: "", en: "" });
  // Same idea as classTreeAddTarget, but for renaming an existing node in
  // place: null = no "edit entry" form open; otherwise the full en-slug
  // path (root -> ... -> node) of the node currently being edited.
  const [classTreeEditTarget, setClassTreeEditTarget] = useState<string[] | null>(null);
  const [classTreeEditForm, setClassTreeEditForm] = useState({ bn: "", en: "" });
  const [classTreeEditSaving, setClassTreeEditSaving] = useState(false);
  // Subject (বিষয়) editor state — same null/[]/[...path] shape as the
  // class-tree add/edit state above, just scoped to one leaf's own
  // subjects array. See lib/classTree.ts's addSubject/editSubject/removeSubject.
  const [subjectAddTarget, setSubjectAddTarget] = useState<string[] | null>(null);
  const [subjectForm, setSubjectForm] = useState({ bn: "", en: "" });
  const [subjectEditTarget, setSubjectEditTarget] = useState<{ path: string[]; en: string } | null>(null);
  const [subjectEditForm, setSubjectEditForm] = useState({ bn: "", en: "" });
  const isSuperAdmin = authUser?.role === "Super Admin";
  const manageUsers = authUser ? canManageUsers(authUser.role) : false;
  const allowBackup = authUser ? canBackup(authUser.role) : false;
  const allowDomain = authUser ? canManageDomain(authUser.role) : false;
  const allowShifts = authUser ? canManageShifts(authUser.role) : false;

  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 6 — শিফট ব্যবস্থাপনা section state.
  // Fetched on-demand (section open, like backupConfig above) rather than
  // through AppSettingsContext — shifts are per-item create/PATCH calls
  // (routes/shifts.js), not a single "save the whole list" blob like
  // classOptions/classTree.
  const [editShifts, setEditShifts] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name: "", nameEn: "", startTime: "", endTime: "", graceMinutes: "0" });
  const [shiftEditId, setShiftEditId] = useState<number | null>(null);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [shiftBusyId, setShiftBusyId] = useState<number | null>(null);
  // class -> shiftId draft, keyed by class.en — loaded from GET
  // /api/class-shifts and sent back as a full array on save (Phase 3's
  // "replace the whole map" contract).
  const [classShiftDraft, setClassShiftDraft] = useState<Record<string, number | "">>({});
  const [classShiftSaving, setClassShiftSaving] = useState(false);

  // null while not yet loaded / not multi-tenant (getPlan() 404s outside
  // multi-tenant mode — see requireTenantContext in routes/settings.js), so
  // "undefined vs loaded-but-empty" is distinguishable in the JSX below.
  const [plan, setPlan] = useState<{ plan: string; features: { customDomain: boolean }; customDomain: string | null } | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainMsg, setDomainMsg] = useState("");

  const update = (k: keyof SettingsType, v: string) => {
    setSettings({ ...settings, [k]: v });
    setSaved(false);
  };

  // Settings > namaz > "বর্তমান লোকেশন ব্যবহার করুন" — captures the admin's
  // current device GPS coordinates via the browser Geolocation API and
  // stores them as prayerLat/prayerLng. lib/prayerTimes.js prefers these
  // over the city/country text fields once set, for more precise timings
  // than a city-name lookup can give (down to the exact device location
  // rather than "somewhere in this thana").
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError(t.settings.gpsUnsupported);
      return;
    }
    setGpsError("");
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings({
          ...settings,
          prayerLat: String(pos.coords.latitude),
          prayerLng: String(pos.coords.longitude),
        });
        setSaved(false);
        setLocatingGps(false);
      },
      () => {
        setGpsError(t.settings.gpsDenied);
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleClearGpsLocation = () => {
    setSettings({ ...settings, prayerLat: "", prayerLng: "" });
    setSaved(false);
  };

  // District→upazila picker (Settings > namaz). A single setSettings call
  // per selection — not two chained update() calls — since update() reads
  // `settings` from this render's closure, so a second call right after
  // the first would overwrite it with stale data instead of building on
  // top of the first change.
  const handleSelectDistrict = (district: string) => {
    setSettings({ ...settings, prayerCity: district, prayerCountry: "Bangladesh" });
    setSaved(false);
  };

  const handleSelectUpazila = (upazila: string) => {
    setSettings({ ...settings, prayerCity: upazila, prayerCountry: "Bangladesh" });
    setSaved(false);
  };

  // Client-side mirror of the server's range check (routes/settings.js) —
  // catches an obviously wrong manual entry (typo, swapped lat/lng) before
  // save, rather than the value silently failing to persist server-side.
  const latLngError = (() => {
    const lat = settings.prayerLat;
    const lng = settings.prayerLng;
    if (lat && (!Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90)) return t.settings.invalidLatLng;
    if (lng && (!Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180)) return t.settings.invalidLatLng;
    return "";
  })();

  const refreshDriveStatus = () => api.getGoogleDriveStatus().then(setDriveStatus).catch(() => {});

  const refreshDriveFiles = () => {
    setDriveFilesLoading(true);
    api
      .listGoogleDriveFiles()
      .then(setDriveFiles)
      .catch(() => setDriveFiles([]))
      .finally(() => setDriveFilesLoading(false));
  };

  useEffect(() => {
    if (allowBackup && editBackup) {
      api.getBackupConfig().then(setBackupConfig).catch(() => {});
      refreshDriveStatus();
    }
  }, [allowBackup, editBackup]);

  // District→upazila picker for Settings > namaz (prayer-times widget
  // location) — same on-open-load pattern as editBackup above, loaded only
  // once the প্রতিষ্ঠানের তথ্য section is opened for editing rather than on
  // every Settings page visit.
  const loadBdLocations = () => {
    api
      .getBangladeshLocations()
      .then((data) => {
        setBdLocations(data);
        setBdLocationsError(false);
      })
      .catch(() => setBdLocationsError(true));
  };

  useEffect(() => {
    if (!editInfo || bdLocations || bdLocationsError) return;
    loadBdLocations();
  }, [editInfo, bdLocations, bdLocationsError]);

  // Which district is "selected" is derived from settings.prayerCity
  // rather than tracked in its own state: handleSelectDistrict below
  // writes the district name straight into prayerCity, and
  // handleSelectUpazila writes the upazila name — so whichever district
  // contains (or equals) the current prayerCity IS the selected one. This
  // also means reopening Settings shows the picker already in sync with
  // whatever's saved, with no separate load-time sync effect needed.
  const selectedDistrict = bdLocations
    ? bdLocations.districts.includes(settings.prayerCity || "")
      ? settings.prayerCity || ""
      : Object.entries(bdLocations.upazilasByDistrict).find(([, ups]) => ups.includes(settings.prayerCity || ""))?.[0] || ""
    : "";

  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 6 — load shift list + class-shift
  // map together whenever the শিফট section opens (same on-open-load
  // pattern as editBackup above), so the class-mapping dropdowns always
  // have the current shift list to choose from.
  useEffect(() => {
    if (!allowShifts || !editShifts) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally sets shiftsLoading=true immediately so the section shows a spinner right away; the rest of its state updates land after the request resolves
    setShiftsLoading(true);
    Promise.all([api.shifts.list(), api.classShifts.get()])
      .then(([shiftRows, assignments]) => {
        setShifts(shiftRows);
        const draft: Record<string, number | ""> = {};
        for (const a of assignments) draft[a.class] = a.shiftId;
        setClassShiftDraft(draft);
      })
      .catch((e) => setShiftError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setShiftsLoading(false));
  }, [allowShifts, editShifts]);

  // Once we know Drive is connected, pull the list of backup files sitting
  // in the app's Drive folder so they can be restored with one click.
  useEffect(() => {
    if (manageUsers && editUsers && !users.length) {
      refreshUsers();
    }
  }, [manageUsers, editUsers, users.length, refreshUsers]);

  const refreshGuardianApprovals = async () => {
    if (!manageUsers) return;
    setGuardianApprovalsLoading(true);
    try {
      setGuardianApprovals(await api.getPendingGuardianApprovals());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Guardian approvals could not be loaded");
    } finally {
      setGuardianApprovalsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshGuardianApprovals() intentionally sets guardianApprovalsLoading=true immediately so the section shows a spinner right away; the rest of its state updates land after the request resolves
    if (manageUsers && editGuardianApprovals) refreshGuardianApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageUsers, editGuardianApprovals]);

  useEffect(() => {
    if (isSuperAdmin && editClasses && !classOptions.length) {
      refreshClassOptions();
    }
  }, [isSuperAdmin, editClasses, classOptions.length, refreshClassOptions]);

  useEffect(() => {
    if (isSuperAdmin && editClassTree && !classTree.length) {
      refreshClassTree();
    }
  }, [isSuperAdmin, editClassTree, classTree.length, refreshClassTree]);

  useEffect(() => {
    // The Teacher-classes checkbox list below is grouped from the
    // class/jamaat tree (see classDraftForRow rendering) — Admin can manage
    // users (and thus teacher class assignments) without being Super Admin,
    // so this effect isn't gated on isSuperAdmin like the tree-editor one
    // above.
    if (manageUsers && editUsers && !classTree.length) {
      refreshClassTree();
    }
  }, [manageUsers, editUsers, classTree.length, refreshClassTree]);

  useEffect(() => {
    if (allowDomain && editDomain) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally sets planLoading=true immediately so the section shows a spinner right away; the rest of its state updates land after the request resolves
      setPlanLoading(true);
      api
        .getPlan()
        .then((data) => {
          setPlan(data);
          setDomainDraft(data.customDomain || "");
        })
        .catch(() => setPlan(null))
        .finally(() => setPlanLoading(false));
    }
  }, [allowDomain, editDomain]);

  const saveDomain = async (nextValue: string) => {
    setDomainSaving(true);
    setDomainMsg("");
    try {
      const result = await api.setCustomDomain(nextValue);
      setPlan((prev) => (prev ? { ...prev, customDomain: result.customDomain } : prev));
      setDomainDraft(result.customDomain || "");
      setDomainMsg(t.settings.domainSaved);
    } catch (e) {
      setDomainMsg(e instanceof Error ? e.message : t.settings.domainSaveFailed);
    } finally {
      setDomainSaving(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshDriveFiles() intentionally sets driveFilesLoading=true immediately; the rest of its state updates land after the request resolves
    if (driveStatus?.connected) refreshDriveFiles();
  }, [driveStatus?.connected]);

  // After the Google OAuth redirect (routes/backup.js `/google/callback`) sends the
  // browser back to /settings?googleDrive=connected|error, show the result and
  // refresh. If this page is running inside the popup opened by handleConnectDrive,
  // close it so the user lands back on the original tab automatically.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("googleDrive");
    if (!result) return;
    if (result === "connected") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a one-time OAuth redirect result read from the URL (an external system), not a value derivable during render
      setMsg(t.settings.googleDriveConnectedMsg);
      refreshDriveStatus();
    } else if (result === "error") {
      setMsg(params.get("message") || t.settings.googleDriveConnectFailed);
    }
    window.history.replaceState({}, "", window.location.pathname);
    if (window.opener) {
      window.setTimeout(() => window.close(), 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
      setMsg("");
    } catch (e) {
      setSaved(false);
      setMsg(e instanceof Error ? e.message : "Settings could not be saved. Please try again.");
    }
  };

  const handleLogo = (file: File | null) => {
    if (!file) return;
    if (file.size > 500_000) {
      setMsg("Logo max 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { url } = await api.uploadFile(String(reader.result), "settings");
        update("logo", url);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Logo upload failed");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBackup = async () => {
    try {
      await api.downloadBackup();
      setMsg("Backup downloaded");
    } catch {
      setMsg("Backup failed");
    }
  };

  const saveBackupConfig = async () => {
    if (!backupConfig) return;
    try {
      const savedConfig = await api.saveBackupConfig(backupConfig);
      setBackupConfig(savedConfig);
      setMsg("Backup settings saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Backup settings failed");
    }
  };

  const runBackupNow = async () => {
    try {
      const result = await api.runBackupNow();
      setBackupConfig(result.config);
      setMsg("Backup created");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Backup failed");
    }
  };

  const handleConnectDrive = async () => {
    if (authUser?.role !== "Super Admin") {
      setMsg(t.settings.googleDriveOnlySuperAdmin);
      return;
    }
    setDriveConnecting(true);
    try {
      const { url } = await api.getGoogleDriveAuthUrl();
      const popup = window.open(url, "googleDriveAuth", "width=520,height=650");
      if (!popup) {
        setMsg(t.settings.googleDriveConnectFailed);
        setDriveConnecting(false);
        return;
      }
      const poll = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll);
          setDriveConnecting(false);
          refreshDriveStatus();
        }
      }, 800);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t.settings.googleDriveConnectFailed);
      setDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    if (authUser?.role !== "Super Admin") {
      setMsg(t.settings.googleDriveOnlySuperAdmin);
      return;
    }
    if (!confirm(t.settings.googleDriveDisconnectConfirm)) return;
    try {
      const status = await api.disconnectGoogleDrive();
      setDriveStatus(status);
      setMsg(t.settings.googleDriveDisconnectedMsg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  // Step 1 of restore: load a preview (row counts, no DB changes yet) so the
  // Super Admin can see exactly what will be replaced before confirming.
  const handleRestore = async (file: File | null) => {
    if (!file) return;
    if (authUser?.role !== "Super Admin") {
      setMsg("Only Super Admin can restore backup");
      return;
    }
    setRestorePreviewLoading(true);
    setMsg("");
    try {
      const preview = await api.previewBackup(file);
      setRestorePreview({ source: { kind: "file", file }, ...preview });
      setRestoreSelectedTables(Object.fromEntries(Object.keys(preview.backupCounts).map((key) => [key, true])));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read backup file");
    } finally {
      setRestorePreviewLoading(false);
    }
  };

  const handleRestoreFromDrive = async (file: GoogleDriveFile) => {
    if (authUser?.role !== "Super Admin") {
      setMsg("Only Super Admin can restore backup");
      return;
    }
    setRestoringFileId(file.id);
    setRestorePreviewLoading(true);
    setMsg("");
    try {
      const preview = await api.previewGoogleDriveBackup(file.id);
      setRestorePreview({ source: { kind: "drive", file }, ...preview });
      setRestoreSelectedTables(Object.fromEntries(Object.keys(preview.backupCounts).map((key) => [key, true])));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read backup file");
    } finally {
      setRestorePreviewLoading(false);
      setRestoringFileId(null);
    }
  };

  // Step 2: the Super Admin has seen the row-count comparison, ticked which
  // sections they actually want, and confirmed.
  const handleConfirmRestore = async () => {
    if (!restorePreview) return;
    const selectedTables = Object.keys(restoreSelectedTables).filter((key) => restoreSelectedTables[key]);
    if (!selectedTables.length) {
      setMsg(t.settings.restoreNoSectionSelected);
      return;
    }
    setRestoreConfirming(true);
    try {
      const result =
        restorePreview.source.kind === "file"
          ? await api.restoreBackup(restorePreview.source.file, selectedTables)
          : await api.restoreFromGoogleDrive(restorePreview.source.file.id, selectedTables);
      const baseMsg = "Backup restored successfully. Refresh the page (and log in again if needed) to see the restored data.";
      const notes = [
        result.report?.selfAccountRestored ? t.settings.restoreSelfAccountKept : "",
        result.report?.googleDriveAuthStripped ? t.settings.restoreDriveNotCarriedOver : "",
      ].filter(Boolean);
      setMsg(notes.length ? `${baseMsg} ${notes.join(" ")}` : baseMsg);
      setRestorePreview(null);
      setRestoreSelectedTables({});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoreConfirming(false);
    }
  };

  const handleCancelRestore = () => {
    setRestorePreview(null);
    setRestoreSelectedTables({});
  };

  const toggleRestoreTable = (table: string, checked: boolean) =>
    setRestoreSelectedTables((prev) => ({ ...prev, [table]: checked }));

  // Maps a raw table name (as it appears in BACKUP_TABLES on the server)
  // to its translated, human-readable section label for the checkboxes.
  const restoreTableLabel = (table: string): string => {
    const map: Record<string, string> = {
      students: t.settings.restoreTableStudents,
      attendance: t.settings.restoreTableAttendance,
      payments: t.settings.restoreTablePayments,
      income: t.settings.restoreTableIncome,
      expenses: t.settings.restoreTableExpenses,
      hifz_logs: t.settings.restoreTableHifzLogs,
      settings: t.settings.restoreTableSettings,
      users: t.settings.restoreTableUsers,
      password_resets: t.settings.restoreTablePasswordResets,
      delete_requests: t.settings.restoreTableDeleteRequests,
    };
    return map[table] || table;
  };

  const reviewGuardianAccount = async (id: number, action: "approve" | "reject") => {
    const key = `account-${id}`;
    setGuardianReviewKey(key);
    try {
      await api.reviewGuardianAccount(id, action);
      await refreshGuardianApprovals();
      setMsg(action === "approve" ? "Guardian account approved" : "Guardian account rejected");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Review failed");
    } finally {
      setGuardianReviewKey(null);
    }
  };

  const reviewGuardianChildLink = async (guardianId: number, studentId: number, action: "approve" | "reject") => {
    const key = `child-${guardianId}-${studentId}`;
    setGuardianReviewKey(key);
    try {
      await api.reviewGuardianChildLink(guardianId, studentId, action);
      await refreshGuardianApprovals();
      setMsg(action === "approve" ? "Child link approved" : "Child link rejected");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Review failed");
    } finally {
      setGuardianReviewKey(null);
    }
  };

  const handleAddUser = async () => {
    if (!manageUsers || !userForm.name.trim() || !userForm.email || !userForm.password) return;
    try {
      await api.createUser(userForm);
      await refreshUsers();
      setUserForm({ name: "", role: "Teacher", email: "", password: "" });
      setMsg("User added");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleUpdateUser = async () => {
    if (!editDraft || !manageUsers) return;
    try {
      const body: { name?: string; role?: string; email?: string; password?: string } = {
        name: editDraft.name,
        role: editDraft.role,
        email: editDraft.email,
      };
      if ((editDraft as User & { newPassword?: string }).newPassword) {
        body.password = (editDraft as User & { newPassword?: string }).newPassword;
      }
      const result = await api.updateUser(editDraft.id, body);
      await refreshUsers();
      setEditDraft(null);
      setMsg("pendingApproval" in result && result.pendingApproval ? "Permission request sent for approval" : "User updated");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const canEditUser = () => manageUsers && editUsers;

  const toggleClassEditor = (u: User) => {
    setClassAssignDraft((prev) => (prev?.userId === u.id ? null : { userId: u.id, classes: u.assignedClasses ? [...u.assignedClasses] : [] }));
  };

  const toggleDraftClass = (cls: string) => {
    setClassAssignDraft((prev) => {
      if (!prev) return prev;
      const has = prev.classes.includes(cls);
      return { ...prev, classes: has ? prev.classes.filter((c) => c !== cls) : [...prev.classes, cls] };
    });
  };

  const handleSaveClasses = async () => {
    if (!classAssignDraft || !manageUsers) return;
    try {
      await api.updateUserClasses(classAssignDraft.userId, classAssignDraft.classes);
      await refreshUsers();
      setClassAssignDraft(null);
      setMsg(t.settings.teacherClassesSaved);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const canDeleteUser = (u: User) => {
    if (!manageUsers || !editUsers || authUser?.id === u.id) return false;
    if (u.isProtected && authUser?.role !== "Super Admin") return false;
    return true;
  };

  const handleDeleteUser = async (u: User) => {
    if (!canDeleteUser(u)) return;
    if (!confirm("Delete this user?")) return;
    try {
      const result = await api.deleteUser(u.id);
      await refreshUsers();
      setMsg(result.pendingApproval ? "Permission request sent for approval" : "User deleted");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Cannot delete");
    }
  };

  const handleAddClass = async () => {
    if (!isSuperAdmin) return;
    const bnValue = classForm.bn.trim();
    const enValue = classForm.en.trim();
    if (!bnValue || !enValue || !CLASS_EN_SLUG_RE.test(enValue)) return;
    try {
      const next = [...classOptions.map((o) => ({ bn: o.bn, en: o.en })), { bn: bnValue, en: enValue }];
      await saveClassOptions(next);
      setClassForm({ bn: "", en: "" });
      setMsg(t.settings.classAdded);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDeleteClass = async (en: string) => {
    if (!isSuperAdmin) return;
    if (!confirm("Delete this class/jamaat?")) return;
    try {
      const next = classOptions.filter((o) => o.en !== en).map((o) => ({ bn: o.bn, en: o.en }));
      await saveClassOptions(next);
      setMsg(t.settings.classDeleted);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleMoveClass = async (index: number, dir: -1 | 1) => {
    if (!isSuperAdmin) return;
    const target = index + dir;
    if (target < 0 || target >= classOptions.length) return;
    const reordered = classOptions.map((o) => ({ bn: o.bn, en: o.en }));
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await saveClassOptions(reordered);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 6 — shift add/edit/toggle handlers.
  // Unlike classOptions above, each shift is its own row (routes/shifts.js
  // POST/PATCH per-item), so these call the API once per action rather
  // than resending a whole list.
  const resetShiftForm = () => {
    setShiftForm({ name: "", nameEn: "", startTime: "", endTime: "", graceMinutes: "0" });
    setShiftEditId(null);
    setShiftError("");
  };

  const startEditShift = (row: Shift) => {
    setShiftForm({
      name: row.name,
      nameEn: row.nameEn,
      startTime: row.startTime,
      endTime: row.endTime,
      graceMinutes: String(row.graceMinutes),
    });
    setShiftEditId(row.id);
    setShiftError("");
  };

  const saveShift = async () => {
    const name = shiftForm.name.trim();
    if (!name || !shiftForm.startTime || !shiftForm.endTime) {
      setShiftError(t.settings.shiftFieldsRequired);
      return;
    }
    setShiftSaving(true);
    setShiftError("");
    const payload = {
      name,
      nameEn: shiftForm.nameEn.trim(),
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      graceMinutes: Number(shiftForm.graceMinutes) || 0,
    };
    try {
      if (shiftEditId != null) {
        const updated = await api.shifts.update(shiftEditId, payload);
        setShifts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const created = await api.shifts.create(payload);
        setShifts((prev) => [...prev, created]);
      }
      resetShiftForm();
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : t.settings.shiftSaveFailed);
    } finally {
      setShiftSaving(false);
    }
  };

  const toggleShiftActive = async (row: Shift) => {
    setShiftBusyId(row.id);
    try {
      const updated = await api.shifts.update(row.id, { active: !row.active });
      setShifts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : t.settings.shiftSaveFailed);
    } finally {
      setShiftBusyId(null);
    }
  };

  // Sends the whole class->shift draft as one PUT (Phase 3's "replace the
  // entire map" contract) — rows left unset ("") in classShiftDraft are
  // simply omitted, same as a class never having been assigned one.
  const saveClassShifts = async () => {
    setClassShiftSaving(true);
    setShiftError("");
    try {
      const assignments: ClassShiftAssignment[] = Object.entries(classShiftDraft)
        .filter((entry): entry is [string, number] => entry[1] !== "")
        .map(([cls, shiftId]) => ({ class: cls, shiftId }));
      const saved = await api.classShifts.save(assignments);
      const draft: Record<string, number | ""> = {};
      for (const a of saved) draft[a.class] = a.shiftId;
      setClassShiftDraft(draft);
      setMsg(t.settings.classShiftMapSaved);
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : t.settings.classShiftMapSaveFailed);
    } finally {
      setClassShiftSaving(false);
    }
  };

  const handleAddClassTreeNode = async () => {
    if (!isSuperAdmin || !classTreeAddTarget) return;
    const bnValue = classTreeForm.bn.trim();
    const enValue = classTreeForm.en.trim();
    if (!bnValue || !enValue || !CLASS_EN_SLUG_RE.test(enValue)) return;
    try {
      const next = addClassTreeNode(classTree, classTreeAddTarget, { bn: bnValue, en: enValue });
      await saveClassTree(next);
      setClassTreeForm({ bn: "", en: "" });
      setClassTreeAddTarget(null);
      setMsg(t.settings.classTreeNodeAdded);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDeleteClassTreeNode = async (path: string[], node: ClassTreeNode) => {
    if (!isSuperAdmin) return;
    const confirmMsg = node.children.length
      ? t.settings.classTreeDeletePromoteConfirm
      : t.settings.classTreeDeleteConfirm;
    if (!confirm(confirmMsg)) return;
    try {
      const next = removeClassTreeNode(classTree, path);
      await saveClassTree(next);
      setMsg(t.settings.classTreeNodeDeleted);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleStartEditClassTreeNode = (path: string[], node: ClassTreeNode) => {
    if (!isSuperAdmin) return;
    setClassTreeAddTarget(null);
    setClassTreeEditTarget(path);
    setClassTreeEditForm({ bn: node.bn, en: node.en });
    setSubjectAddTarget(null);
    setSubjectEditTarget(null);
  };

  const handleSaveClassTreeNodeEdit = async () => {
    if (!isSuperAdmin || !classTreeEditTarget) return;
    const bnValue = classTreeEditForm.bn.trim();
    const enValue = classTreeEditForm.en.trim().toLowerCase();
    if (!bnValue || !enValue || !CLASS_EN_SLUG_RE.test(enValue)) return;
    const enChangedLocally = enValue !== classTreeEditTarget[classTreeEditTarget.length - 1];
    if (enChangedLocally && !confirm(t.settings.classTreeEditConfirm)) return;
    setClassTreeEditSaving(true);
    try {
      const { migratedCount, enChanged } = await editClassTreeNode(classTreeEditTarget, { bn: bnValue, en: enValue });
      setClassTreeEditTarget(null);
      setClassTreeEditForm({ bn: "", en: "" });
      setMsg(
        enChanged
          ? tr("settings.classTreeNodeEdited", { count: migratedCount })
          : t.settings.classTreeNodeEditedLabelOnly
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setClassTreeEditSaving(false);
    }
  };

  const handleAddSubject = async () => {
    if (!isSuperAdmin || !subjectAddTarget) return;
    const bnValue = subjectForm.bn.trim();
    const enValue = subjectForm.en.trim().toLowerCase();
    if (!bnValue || !enValue || !CLASS_EN_SLUG_RE.test(enValue)) return;
    try {
      const next = addSubject(classTree, subjectAddTarget, { bn: bnValue, en: enValue });
      await saveClassTree(next);
      setSubjectForm({ bn: "", en: "" });
      setSubjectAddTarget(null);
      setMsg(t.settings.subjectAdded);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleStartEditSubject = (path: string[], subject: ClassTreeSubject) => {
    if (!isSuperAdmin) return;
    setSubjectAddTarget(null);
    setSubjectEditTarget({ path, en: subject.en });
    setSubjectEditForm({ bn: subject.bn, en: subject.en });
  };

  const handleSaveSubjectEdit = async () => {
    if (!isSuperAdmin || !subjectEditTarget) return;
    const bnValue = subjectEditForm.bn.trim();
    const enValue = subjectEditForm.en.trim().toLowerCase();
    if (!bnValue || !enValue || !CLASS_EN_SLUG_RE.test(enValue)) return;
    try {
      const next = editSubject(classTree, subjectEditTarget.path, subjectEditTarget.en, { bn: bnValue, en: enValue });
      await saveClassTree(next);
      setSubjectEditTarget(null);
      setSubjectEditForm({ bn: "", en: "" });
      setMsg(t.settings.subjectEdited);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDeleteSubject = async (path: string[], subject: ClassTreeSubject) => {
    if (!isSuperAdmin) return;
    if (!confirm(t.settings.subjectDeleteConfirm)) return;
    try {
      const next = removeSubject(classTree, path, subject.en);
      await saveClassTree(next);
      setMsg(t.settings.subjectDeleted);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div>
      <h2 className="page-header__title mb-24">{t.settings.title}</h2>
      {msg && <p className="msg-line">{msg}</p>}

      <div className="settings-grid">
        <div className="settings-col">
          <div className="settings-card">
            <SectionHeader title={t.settings.madrasaInfo} open={editInfo} onToggle={() => setEditInfo((v) => !v)} />
            {!editInfo && (
              <div>
                <InfoRow label={t.settings.name} value={settings.name} />
                <InfoRow label={t.settings.address} value={settings.address} />
                <InfoRow label={t.settings.phone} value={settings.phone} />
                <InfoRow label={t.settings.email} value={settings.email} />
                <InfoRow label={t.settings.footer} value={settings.footer} />
                <div className="info-row">
                  <div className="info-row__label mb-6">{t.settings.brandColor}</div>
                  <div className="row row--gap-8">
                    {/* Swatch color is the institution's own chosen brand color
                        (settings.brandColor) — real per-instance data, can't be a
                        static class. Documented exception, see AGENTS.md. */}
                    {/* eslint-disable-next-line no-restricted-syntax -- dynamic user-chosen brand color */}
                    <span className="brand-swatch" style={{ background: settings.brandColor || "#0ea5e9" }} />
                    <span className="info-row__value">{settings.brandColor || "#0ea5e9"}</span>
                  </div>
                </div>
                <InfoRow label={t.settings.prayerCity} value={settings.prayerCity || "Dhaka"} />
                <InfoRow label={t.settings.prayerCountry} value={settings.prayerCountry || "Bangladesh"} />
                {settings.prayerLat && settings.prayerLng && <InfoRow label={t.settings.gpsLocationSet} value={t.settings.gpsLocationActive} />}
                {settings.logo && <img src={settings.logo} alt="Logo" loading="lazy" decoding="async" className="logo-preview mt-12" />}
              </div>
            )}
            <div className={`field-block--gap ${editInfo ? "" : "field-block--hidden"}`}>
              <Field label={t.settings.name} value={settings.name} onChange={(v) => update("name", v)} />
              <Field label={t.settings.address} value={settings.address} onChange={(v) => update("address", v)} />
              <Field label={t.settings.phone} value={settings.phone} onChange={(v) => update("phone", v)} />
              <Field label={t.settings.email} value={settings.email} onChange={(v) => update("email", v)} type="email" />
              <div>
                <label className="field-block__label">{t.settings.footer}</label>
                <textarea value={settings.footer} rows={2} onChange={(e) => update("footer", e.target.value)} className="ds-textarea ds-textarea--noresize" />
              </div>
              <div>
                <label className="field-block__label mb-8">{t.settings.logo}</label>
                {settings.logo && <img src={settings.logo} alt="Logo" className="logo-preview--edit" />}
                <input type="file" accept="image/*" onChange={(e) => handleLogo(e.target.files?.[0] || null)} className="file-input-sm" />
              </div>
              <div>
                <label className="field-block__label">{t.settings.brandColor}</label>
                <div className="row row--gap-10">
                  <input type="color" value={settings.brandColor || "#0ea5e9"} onChange={(e) => update("brandColor", e.target.value)} className="color-input" />
                  <Input
                    type="text"
                    value={settings.brandColor || "#0ea5e9"}
                    onChange={(e) => update("brandColor", e.target.value)}
                    placeholder="#0ea5e9"
                    style={{ flex: 1, fontFamily: "monospace" }}
                  />
                </div>
                <p className="hint-text">{t.settings.brandColorHint}</p>
              </div>
              <div>
                {bdLocationsError && (
                  <p className="hint-text hint-text--error mt-8">
                    {t.settings.locationLoadError}{" "}
                    <button type="button" className="link-button" onClick={loadBdLocations}>
                      {t.settings.locationLoadRetry}
                    </button>
                  </p>
                )}
                {bdLocations && (
                  <>
                    <label className="field-block__label">{t.settings.selectDistrict}</label>
                    <Select value={selectedDistrict} onChange={(e) => handleSelectDistrict(e.target.value)}>
                      <option value="">{t.settings.selectDistrictPlaceholder}</option>
                      {bdLocations.districts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                    {selectedDistrict && (
                      <>
                        <label className="field-block__label mt-8">{t.settings.selectUpazila}</label>
                        <Select value={settings.prayerCity || ""} onChange={(e) => handleSelectUpazila(e.target.value)}>
                          <option value={selectedDistrict}>{t.settings.selectUpazilaWholeDistrict}</option>
                          {(bdLocations.upazilasByDistrict[selectedDistrict] || []).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}
                    <p className="hint-text mt-8">{t.settings.districtPickerHint}</p>
                  </>
                )}
                <Field label={t.settings.prayerCity} value={settings.prayerCity || ""} onChange={(v) => update("prayerCity", v)} />
                <Field label={t.settings.prayerCountry} value={settings.prayerCountry || ""} onChange={(v) => update("prayerCountry", v)} />
                <Button variant="outline" onClick={handleUseCurrentLocation} disabled={locatingGps} className="mt-8">
                  {locatingGps ? t.settings.locatingGps : t.settings.useCurrentLocation}
                </Button>
                {settings.prayerLat && settings.prayerLng && (
                  <p className="hint-text">
                    {t.settings.gpsLocationActive}{" "}
                    <button type="button" onClick={handleClearGpsLocation} className="link-btn">
                      {t.settings.clearGpsLocation}
                    </button>
                  </p>
                )}
                {gpsError && <p className="drive-error">{gpsError}</p>}
                <p className="hint-text mt-8">{t.settings.manualLocationHint}</p>
                <Field label={t.settings.manualLat} value={settings.prayerLat || ""} onChange={(v) => update("prayerLat", v)} />
                <Field label={t.settings.manualLng} value={settings.prayerLng || ""} onChange={(v) => update("prayerLng", v)} />
                {latLngError && <p className="drive-error">{latLngError}</p>}
                <p className="hint-text">{t.settings.prayerHint}</p>
              </div>
            </div>
          </div>

          {allowBackup && (
            <div className="settings-card">
              <SectionHeader title={t.settings.backup} open={editBackup} onToggle={() => setEditBackup((v) => !v)} />
              <p className="backup-hint">Download a full database backup as JSON (encrypted if configured).</p>
              {!editBackup && backupConfig && (
                <div className="mt-12">
                  <InfoRow label="Automatic backup" value={backupConfig.enabled ? "Enabled" : "Disabled"} />
                  <InfoRow label="Interval" value={`${backupConfig.intervalHours} hours`} />
                  <InfoRow label="Keep Drive copies" value={String(backupConfig.keepDriveCopies ?? 14)} />
                  <InfoRow label="Last backup" value={backupConfig.lastRunAt ? new Date(backupConfig.lastRunAt).toLocaleString() : "-"} />
                  {driveStatus?.configured && (
                    <InfoRow
                      label={t.settings.googleDriveTitle}
                      value={driveStatus.connected ? t.settings.googleDriveConnected.replace("{email}", driveStatus.accountEmail) : t.settings.googleDriveNotConnected}
                    />
                  )}
                </div>
              )}
              <Button variant="violet" solid onClick={handleBackup}>
                {t.settings.downloadBackup}
              </Button>
              {editBackup && authUser?.role === "Super Admin" && (
                <div className="restore-box">
                  <label className="field-block__label mb-6">Restore backup database (.json / .enc)</label>
                  <input
                    type="file"
                    accept=".json,.enc,application/octet-stream,application/json"
                    disabled={restorePreviewLoading}
                    onChange={(e) => {
                      handleRestore(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                    className="file-input-sm"
                  />
                  <p className="hint-text hint-text--tight">Upload a downloaded madrasah backup to restore old students, income, users and settings.</p>
                  {restorePreviewLoading && !restorePreview && (
                    <div className="flex-mt-8">
                      <HudSpinner size={18} />
                    </div>
                  )}
                </div>
              )}

              {restorePreview && (
                <div className="restore-warn-box">
                  <p className="restore-warn-box__title">
                    Confirm restore{restorePreview.source.kind === "drive" ? `: "${restorePreview.source.file.name}"` : ""}
                  </p>
                  {restorePreview.exportedAt && (
                    <p className="restore-warn-box__meta">
                      Backup taken: {new Date(restorePreview.exportedAt).toLocaleString()}
                    </p>
                  )}
                  <p className="restore-warn-box__meta restore-warn-box__meta--strong">{t.settings.restoreSectionsTitle}</p>
                  <div className="row row--gap-8 mb-6">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setRestoreSelectedTables(Object.fromEntries(Object.keys(restorePreview.backupCounts).map((key) => [key, true])))}
                    >
                      {t.settings.restoreSelectAll}
                    </button>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setRestoreSelectedTables(Object.fromEntries(Object.keys(restorePreview.backupCounts).map((key) => [key, false])))}
                    >
                      {t.settings.restoreSelectNone}
                    </button>
                  </div>
                  <p className="hint-text hint-text--tight mb-6">{t.settings.restoreSectionsHint}</p>
                  <div className="restore-counts-list">
                    {Object.keys(restorePreview.backupCounts).map((table) => {
                      const backupCount = restorePreview.backupCounts[table];
                      const currentCount = restorePreview.currentCounts[table];
                      const changed = backupCount !== currentCount;
                      const checked = restoreSelectedTables[table] !== false;
                      const sensitive = table === "users";
                      return (
                        <label
                          key={table}
                          className={`restore-diff-row restore-diff-row--checkbox ${changed ? "restore-diff-row--changed" : ""}`}
                        >
                          <span className="restore-diff-row__label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleRestoreTable(table, e.target.checked)}
                              disabled={restoreConfirming}
                            />
                            <span>
                              {restoreTableLabel(table)}
                              {sensitive && <span className="restore-diff-row__sensitive"> — {t.settings.restoreSensitiveNote}</span>}
                            </span>
                          </span>
                          <span>
                            {currentCount} → {backupCount}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="restore-warn-box__notice">
                    This will permanently replace all current data in the checked sections above with the numbers on the right. This cannot be undone from the app (a safety backup of the current data is taken automatically, but restoring it requires repeating this process).
                  </p>
                  <div className="row row--gap-8">
                    <Button
                      variant="rose"
                      solid
                      onClick={handleConfirmRestore}
                      disabled={restoreConfirming || Object.keys(restoreSelectedTables).every((key) => !restoreSelectedTables[key])}
                    >
                      {restoreConfirming ? "Restoring…" : "Confirm restore"}
                    </Button>
                    <Button variant="outline" onClick={handleCancelRestore} disabled={restoreConfirming}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {editBackup && backupConfig && (
                <div className="stack--gap-10-mt-16">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={backupConfig.enabled} onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })} />
                    Automatic backup
                  </label>
                  <div className="form-grid form-grid--tight">
                    <Field label="Backup interval (hours)" value={String(backupConfig.intervalHours)} onChange={(v) => setBackupConfig({ ...backupConfig, intervalHours: Number(v) || 24 })} type="number" />
                    <Field label="Keep local copies" value={String(backupConfig.keepLocalCopies)} onChange={(v) => setBackupConfig({ ...backupConfig, keepLocalCopies: Number(v) || 14 })} type="number" />
                    <Field label="Keep Drive copies" value={String(backupConfig.keepDriveCopies ?? 14)} onChange={(v) => setBackupConfig({ ...backupConfig, keepDriveCopies: Number(v) || 14 })} type="number" />
                  </div>
                  {[0, 1, 2].map((i) => (
                    <Field
                      key={i}
                      label={`Local sync folder ${i + 1} (e.g. Google Drive desktop app folder)`}
                      value={backupConfig.destinations[i] || ""}
                      onChange={(v) => {
                        const destinations = [...backupConfig.destinations];
                        destinations[i] = v;
                        setBackupConfig({ ...backupConfig, destinations });
                      }}
                    />
                  ))}
                  {backupConfig.lastRunAt && <p className="hint-text hint-text--no-mt">Last auto backup: {new Date(backupConfig.lastRunAt).toLocaleString()}</p>}
                  <div className="backup-actions">
                    <Button variant="emerald" solid onClick={saveBackupConfig} style={{ fontSize: 13 }}>Save backup settings</Button>
                    <Button variant="teal" solid onClick={runBackupNow} style={{ fontSize: 13 }}>Run backup now</Button>
                  </div>

                  {driveStatus?.configured && (
                    <div className="drive-box">
                      <div className="drive-box__title">{t.settings.googleDriveTitle}</div>
                      {driveStatus.connected ? (
                        <div className="drive-connected">
                          <p className="drive-meta">
                            {t.settings.googleDriveConnected.replace("{email}", driveStatus.accountEmail)}
                          </p>
                          <p className={`drive-encryption-status ${backupConfig?.driveEncryptionEnabled ? "drive-encryption-status--on" : "drive-encryption-status--off"}`}>
                            {backupConfig?.driveEncryptionEnabled
                              ? (<><Icons.lock size={13} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />Drive backups are encrypted (BACKUP_ENCRYPTION_KEY is set)</>)
                              : (<><Icons.alertTriangle size={13} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />Drive backups are NOT encrypted — set BACKUP_ENCRYPTION_KEY on the server to protect them</>)}
                          </p>
                          {driveStatus.lastUploadAt && (
                            <p className="drive-meta">
                              {t.settings.googleDriveLastUpload.replace("{date}", new Date(driveStatus.lastUploadAt).toLocaleString())}
                            </p>
                          )}
                          {driveStatus.lastUploadError && (
                            <p className="drive-error">
                              {t.settings.googleDriveUploadError.replace("{message}", driveStatus.lastUploadError)}
                            </p>
                          )}
                          <div className="drive-link-row">
                            {driveStatus.folderLink && (
                              <a href={driveStatus.folderLink} target="_blank" rel="noreferrer" className="drive-link">
                                {t.settings.googleDriveOpenFolder}
                              </a>
                            )}
                            {authUser?.role === "Super Admin" && (
                              <button type="button" onClick={handleDisconnectDrive} className="btn-disconnect">
                                {t.settings.googleDriveDisconnect}
                              </button>
                            )}
                          </div>

                          {authUser?.role === "Super Admin" && (
                            <div className="drive-files-box">
                              <div className="drive-files-head">
                                <span className="drive-files-title">{t.settings.driveFilesTitle}</span>
                                <button type="button" onClick={refreshDriveFiles} disabled={driveFilesLoading} className="link-btn">
                                  {t.settings.driveFilesRefresh}
                                </button>
                              </div>
                              {driveFilesLoading && <SkeletonRows count={3} />}
                              {!driveFilesLoading && driveFiles?.length === 0 && (
                                <p className="drive-meta">{t.settings.driveFilesEmpty}</p>
                              )}
                              {!driveFilesLoading && driveFiles && driveFiles.length > 0 && (
                                <div className="drive-files-list">
                                  {driveFiles.map((f) => (
                                    <div key={f.id} className="drive-file-row">
                                      <div className="min-w-0">
                                        <div className="drive-file-name">{f.name}</div>
                                        <div className="drive-file-meta">
                                          {formatFileSize(f.size)} · {new Date(f.createdTime).toLocaleString()}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreFromDrive(f)}
                                        disabled={restoringFileId !== null}
                                        className={`btn-restore-file ${restoringFileId === f.id ? "btn-restore-file--busy" : ""}`}
                                      >
                                        {restoringFileId === f.id ? t.settings.driveFileRestoring : t.settings.driveFileRestore}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="not-connected-hint">{t.settings.googleDriveNotConnected}</p>
                          {authUser?.role === "Super Admin" ? (
                            <Button variant="violet" solid disabled={driveConnecting} onClick={handleConnectDrive} style={{ fontSize: 13 }}>
                              {driveConnecting ? t.settings.googleDriveConnecting : t.settings.googleDriveConnect}
                            </Button>
                          ) : (
                            <p className="drive-meta">{t.settings.googleDriveOnlySuperAdmin}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {allowDomain && (
            <div className="settings-card">
              <SectionHeader title={t.settings.domainSection} open={editDomain} onToggle={() => setEditDomain((v) => !v)} />
              {editDomain && (
                <div className="mt-12">
                  <p className="hint-text">{t.settings.domainHint}</p>
                  {planLoading && <SkeletonRows count={2} />}
                  {!planLoading && plan && !plan.features.customDomain && (
                    <div className="mt-12">
                      <InfoRow label={t.settings.domainUpgradeTitle} value="" />
                      <p className="hint-text">{t.settings.domainUpgradeMsg}</p>
                    </div>
                  )}
                  {!planLoading && plan && plan.features.customDomain && (
                    <div className="mt-12">
                      <InfoRow label={t.settings.domainCurrentLabel} value={plan.customDomain || t.settings.domainNone} />
                      <div className="field-block--gap mt-12">
                        <div>
                          <label className="field-block__label">{t.settings.domainInputLabel}</label>
                          <Input
                            type="text"
                            value={domainDraft}
                            onChange={(e) => setDomainDraft(e.target.value)}
                            placeholder={t.settings.domainInputPlaceholder}
                          />
                          <p className="hint-text">{t.settings.domainInvalidHint}</p>
                        </div>
                        <div className="row row--gap-8">
                          <Button variant="sky" solid disabled={domainSaving || !domainDraft.trim()} onClick={() => saveDomain(domainDraft.trim())}>
                            {t.settings.domainSave}
                          </Button>
                          {plan.customDomain && (
                            <Button variant="rose" disabled={domainSaving} onClick={() => saveDomain("")}>
                              {t.settings.domainClear}
                            </Button>
                          )}
                        </div>
                        {domainMsg && <p className="msg-line">{domainMsg}</p>}
                      </div>
                      <div className="mt-12">
                        <p className="field-block__label">{t.settings.domainCnameTitle}</p>
                        <p className="hint-text">{t.settings.domainCnameSteps}</p>
                      </div>
                    </div>
                  )}
                  {!planLoading && !plan && <p className="hint-text">{t.settings.domainUnavailable}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="settings-col">
          <div className="settings-card">
            <SectionHeader title={t.settings.systemSettings} open={editSystem} onToggle={() => setEditSystem((v) => !v)} />
            {!editSystem && (
              <div>
                <InfoRow label={t.settings.language} value={settings.lang === "en" ? t.settings.langEn : t.settings.langBn} />
                <InfoRow label={t.settings.theme} value={settings.theme === "dark" ? t.settings.themeDark : t.settings.themeLight} />
                <InfoRow label={t.settings.currency} value={settings.currency} />
              </div>
            )}
            <div className={`field-block--gap ${editSystem ? "" : "field-block--hidden"}`}>
              <div>
                <label className="field-block__label">{t.settings.language}</label>
                <Select value={settings.lang} onChange={(e) => update("lang", e.target.value)}>
                  <option value="bn">{t.settings.langBn}</option>
                  <option value="en">{t.settings.langEn}</option>
                </Select>
              </div>
              <div>
                <label className="field-block__label">{t.settings.theme}</label>
                <Select value={settings.theme} onChange={(e) => update("theme", e.target.value)}>
                  <option value="light">{t.settings.themeLight}</option>
                  <option value="dark">{t.settings.themeDark}</option>
                </Select>
              </div>
              <div>
                <label className="field-block__label">{t.settings.currency}</label>
                <Select value={settings.currency} onChange={(e) => update("currency", e.target.value)}>
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
            </div>
          </div>

          {manageUsers && (
            <div className="settings-card">
              <SectionHeader
                title={`Pending Guardian Approvals (${guardianApprovals.accounts.length + guardianApprovals.childLinks.length})`}
                open={editGuardianApprovals}
                onToggle={() => setEditGuardianApprovals((v) => !v)}
              />
              {editGuardianApprovals && (
                <div className="user-list">
                  {guardianApprovalsLoading && <SkeletonRows count={3} />}

                  {!guardianApprovalsLoading && guardianApprovals.accounts.map((item) => {
                    const key = `account-${item.id}`;
                    return (
                      <div key={key} className="user-row">
                        <div className="user-info">
                          <div className="user-name">{item.name}</div>
                          <div className="user-meta">
                            Account signup · {item.mobile || item.email || "No contact"}
                            {item.students.map((student) => ` · ${student.name} (${student.class}, Roll ${student.roll}) · ${student.matchCount ?? 2}/4 matched`).join("")}
                          </div>
                        </div>
                        <button type="button" disabled={guardianReviewKey === key} onClick={() => reviewGuardianAccount(item.id, "approve")} className="btn-xs btn-xs--save">Approve</button>
                        <button type="button" disabled={guardianReviewKey === key} onClick={() => reviewGuardianAccount(item.id, "reject")} className="btn-xs btn-xs--delete">Reject</button>
                      </div>
                    );
                  })}

                  {!guardianApprovalsLoading && guardianApprovals.childLinks.map((item) => {
                    const key = `child-${item.guardianId}-${item.studentId}`;
                    return (
                      <div key={key} className="user-row">
                        <div className="user-info">
                          <div className="user-name">{item.guardianName} → {item.studentName}</div>
                          <div className="user-meta">
                            Add child · {item.studentClass}, Roll {item.studentRoll} · {item.matchCount ?? 2}/4 matched
                          </div>
                        </div>
                        <button type="button" disabled={guardianReviewKey === key} onClick={() => reviewGuardianChildLink(item.guardianId, item.studentId, "approve")} className="btn-xs btn-xs--save">Approve</button>
                        <button type="button" disabled={guardianReviewKey === key} onClick={() => reviewGuardianChildLink(item.guardianId, item.studentId, "reject")} className="btn-xs btn-xs--delete">Reject</button>
                      </div>
                    );
                  })}

                  {!guardianApprovalsLoading && !guardianApprovals.accounts.length && !guardianApprovals.childLinks.length && (
                    <p className="field-block__label">No pending guardian requests.</p>
                  )}
                </div>
              )}
            </div>
          )}


          {manageUsers && (
            <div className="settings-card">
              <SectionHeader title={t.settings.userRoles} open={editUsers} onToggle={() => setEditUsers((v) => !v)} />
              <div className={`user-form-grid ${editUsers ? "" : "user-form-grid--hidden"}`}>
                <Input placeholder={t.settings.userName} value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }} />
                <Input placeholder={t.settings.loginEmail} type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }} />
                <Input placeholder={t.settings.userPassword} type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }} />
                <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }}>
                  {USER_ROLES.filter((r) => authUser?.role === "Super Admin" || r !== "Super Admin").map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
              <Button variant="teal" solid onClick={handleAddUser} className={editUsers ? "" : "add-user-btn--hidden"} style={{ fontSize: 13, marginBottom: 14 }}>
                + {t.settings.addUser}
              </Button>

              <div className="user-list">
                {users.map((u) => {
                  const color = ROLE_COLORS[u.role] || "#0f766e";
                  const editing = editDraft?.id === u.id;
                  const draft = editing ? editDraft! : u;
                  const classDraftForRow = classAssignDraft && classAssignDraft.userId === u.id ? classAssignDraft : null;
                  return (
                    <div key={u.id}>
                      {/* Row tint is per-user-role data (color + "10"/"30" alpha),
                          same documented dynamic-color exception as above. */}
                      {/* eslint-disable-next-line no-restricted-syntax -- dynamic per-role accent color */}
                      <div className="user-row" style={{ background: color + "10", border: `1px solid ${color}30` }}>
                        {/* eslint-disable-next-line no-restricted-syntax -- dynamic per-role accent color */}
                        <span className="user-row-dot" style={{ background: color }} />
                        {editing ? (
                          <>
                            <Input value={draft.name} onChange={(e) => setEditDraft({ ...draft, name: e.target.value })} style={{ flex: 1, minWidth: 90, fontSize: 13, padding: "8px 10px" }} />
                            <Input value={draft.email || ""} onChange={(e) => setEditDraft({ ...draft, email: e.target.value })} style={{ flex: 1, minWidth: 90, fontSize: 13, padding: "8px 10px" }} />
                            <Select value={draft.role} disabled={!!u.isProtected && (authUser?.role !== "Super Admin" || authUser?.id === u.id)} onChange={(e) => setEditDraft({ ...draft, role: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }}>
                              {USER_ROLES.filter((r) => authUser?.role === "Super Admin" || r !== "Super Admin").map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </Select>
                            <Input placeholder="New password (optional)" type="password" onChange={(e) => setEditDraft({ ...draft, newPassword: e.target.value } as User & { newPassword?: string })} style={{ minWidth: 120, fontSize: 13, padding: "8px 10px" }} />
                            <button type="button" onClick={handleUpdateUser} className="btn-xs btn-xs--save">{t.common.save}</button>
                            <button type="button" onClick={() => setEditDraft(null)} className="btn-xs btn-xs--cancel">{t.common.cancel}</button>
                          </>
                        ) : (
                          <>
                            <div className="user-info">
                              <div className="user-name">{u.name}{u.isProtected ? <Icons.lock size={12} aria-hidden="true" style={{ verticalAlign: "-1px", marginLeft: 4 }} /> : ""}</div>
                              <div className="user-meta">
                                {u.role} · {u.email || "—"}
                                {u.role === "Teacher" && (
                                  <> · {u.assignedClasses?.length ? u.assignedClasses.join(", ") : t.settings.teacherClassesNone}</>
                                )}
                              </div>
                            </div>
                            {canEditUser() && u.role === "Teacher" && (
                              <button type="button" onClick={() => toggleClassEditor(u)} className="btn-xs btn-xs--edit">{t.settings.teacherClasses}</button>
                            )}
                            {canEditUser() && (
                              <button type="button" onClick={() => setEditDraft({ ...u })} className="btn-xs btn-xs--edit"><Icons.pencil size={13} aria-hidden="true" /></button>
                            )}
                            {canDeleteUser(u) && (
                              <button type="button" onClick={() => handleDeleteUser(u)} className="btn-xs btn-xs--delete">{t.common.delete}</button>
                            )}
                          </>
                        )}
                      </div>
                      {classDraftForRow && (
                        <div className="user-row">
                          {classTree.length === 0 && <span className="field-block__label">{t.settings.classEmptyList}</span>}
                          {classTree.map((dept) => (
                            <div key={dept.en} className="class-tree-checkbox-group">
                              <div className="class-tree-checkbox-group__title">{dept.bn}</div>
                              {flattenClassTree([dept]).map((leaf) => (
                                <label key={leaf.en} className="user-meta">
                                  <input
                                    type="checkbox"
                                    checked={classDraftForRow.classes.includes(leaf.en)}
                                    onChange={() => toggleDraftClass(leaf.en)}
                                  />
                                  {" "}{leaf.bn}
                                </label>
                              ))}
                            </div>
                          ))}
                          <button type="button" onClick={handleSaveClasses} className="btn-xs btn-xs--save">{t.common.save}</button>
                          <button type="button" onClick={() => setClassAssignDraft(null)} className="btn-xs btn-xs--cancel">{t.common.cancel}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isSuperAdmin && (
            <div className="settings-card">
              <SectionHeader title={t.settings.classManagement} open={editClasses} onToggle={() => setEditClasses((v) => !v)} />
              {editClasses && (
                <>
                  <p className="field-block__label mb-10">{t.settings.classManagementHint}</p>
                  <div className="user-form-grid">
                    <Input
                      placeholder={t.settings.classBnLabel}
                      value={classForm.bn}
                      onChange={(e) => setClassForm({ ...classForm, bn: e.target.value })}
                      style={{ fontSize: 13, padding: "8px 10px" }}
                    />
                    <div>
                      <Input
                        placeholder={t.settings.classEnLabel}
                        value={classForm.en}
                        onChange={(e) => setClassForm({ ...classForm, en: e.target.value })}
                        style={{ fontSize: 13, padding: "8px 10px" }}
                      />
                      <p className="field-block__label">{t.settings.classEnHint}</p>
                    </div>
                  </div>
                  <Button variant="teal" solid onClick={handleAddClass} style={{ fontSize: 13, marginBottom: 14 }}>
                    + {t.settings.addClass}
                  </Button>

                  <div className="user-list">
                    {classOptions.map((option, index) => (
                      <div key={option.en} className="user-row">
                        <div className="user-info">
                          <div className="user-name">{option.bn}</div>
                          <div className="user-meta">{option.en}</div>
                        </div>
                        <button type="button" onClick={() => handleMoveClass(index, -1)} disabled={index === 0} className="btn-xs btn-xs--cancel">↑</button>
                        <button type="button" onClick={() => handleMoveClass(index, 1)} disabled={index === classOptions.length - 1} className="btn-xs btn-xs--cancel">↓</button>
                        <button type="button" onClick={() => handleDeleteClass(option.en)} className="btn-xs btn-xs--delete">{t.common.delete}</button>
                      </div>
                    ))}
                    {!classOptions.length && <p className="field-block__label">{t.settings.classEmptyList}</p>}
                  </div>
                </>
              )}
            </div>
          )}

          {isSuperAdmin && (
            <div className="settings-card">
              <SectionHeader
                title={t.settings.classTreeManagement}
                open={editClassTree}
                onToggle={() => setEditClassTree((v) => !v)}
              />
              {editClassTree && (
                <>
                  <p className="field-block__label mb-10">{t.settings.classTreeManagementHint}</p>
                  <p className="class-tree-warning">{t.settings.classTreeWarning}</p>

                  <Button
                    variant="teal"
                    solid
                    onClick={() => {
                      setClassTreeEditTarget(null);
                      setClassTreeAddTarget([]);
                      setClassTreeForm({ bn: "", en: "" });
                    }}
                    className="mb-10"
                  >
                    {t.settings.classTreeAddTopLevel}
                  </Button>

                  {/* Only the "add a brand-new বিভাগ" form lives up here —
                      it has no existing row to attach to. Add-child and
                      edit forms for existing nodes render inline via
                      renderAddForm/renderEditForm below, right next to the
                      node they belong to. */}
                  {classTreeAddTarget !== null && classTreeAddTarget.length === 0 && (
                    <div className="user-form-grid mb-10">
                      <div className="field-block__label class-tree-add-parent-label">
                        {t.settings.classTreeParentLabel}: {t.settings.classTreeAddTopLevel}
                      </div>
                      <Input
                        placeholder={t.settings.classBnLabel}
                        value={classTreeForm.bn}
                        onChange={(e) => setClassTreeForm({ ...classTreeForm, bn: e.target.value })}
                      />
                      <div>
                        <Input
                          placeholder={t.settings.classEnLabel}
                          value={classTreeForm.en}
                          onChange={(e) => setClassTreeForm({ ...classTreeForm, en: e.target.value })}
                        />
                        <p className="field-block__label">{t.settings.classEnHint}</p>
                      </div>
                      <Button variant="teal" solid onClick={handleAddClassTreeNode}>
                        {t.settings.addClass}
                      </Button>
                      <Button variant="rose" onClick={() => setClassTreeAddTarget(null)}>
                        {t.settings.classTreeCancel}
                      </Button>
                    </div>
                  )}

                  <div className="user-list">
                    {classTree.map((node) => (
                      <ClassTreeRow
                        key={node.en}
                        node={node}
                        path={[node.en]}
                        depth={0}
                        addLabel={t.settings.classTreeAddChild}
                        editLabel={t.settings.classTreeEdit}
                        deleteLabel={t.common.delete}
                        expandLabel={t.settings.classTreeExpand}
                        collapseLabel={t.settings.classTreeCollapse}
                        activeAddPath={classTreeAddTarget !== null && classTreeAddTarget.length > 0 ? classTreeAddTarget : null}
                        activeEditPath={classTreeEditTarget}
                        onAddChild={(path) => {
                          setClassTreeEditTarget(null);
                          setClassTreeAddTarget(path);
                          setClassTreeForm({ bn: "", en: "" });
                          setSubjectAddTarget(null);
                          setSubjectEditTarget(null);
                        }}
                        onEdit={handleStartEditClassTreeNode}
                        onDelete={handleDeleteClassTreeNode}
                        renderAddForm={() => (
                          <div className="user-form-grid mb-10 class-tree-inline-form">
                            <div className="field-block__label class-tree-add-parent-label">
                              {t.settings.classTreeParentLabel}: {classTreeAddTarget?.join(" / ")}
                            </div>
                            <Input
                              placeholder={t.settings.classBnLabel}
                              value={classTreeForm.bn}
                              onChange={(e) => setClassTreeForm({ ...classTreeForm, bn: e.target.value })}
                            />
                            <div>
                              <Input
                                placeholder={t.settings.classEnLabel}
                                value={classTreeForm.en}
                                onChange={(e) => setClassTreeForm({ ...classTreeForm, en: e.target.value })}
                              />
                              <p className="field-block__label">{t.settings.classEnHint}</p>
                            </div>
                            <Button variant="teal" solid onClick={handleAddClassTreeNode}>
                              {t.settings.addClass}
                            </Button>
                            <Button variant="rose" onClick={() => setClassTreeAddTarget(null)}>
                              {t.settings.classTreeCancel}
                            </Button>
                          </div>
                        )}
                        renderEditForm={() => (
                          <div className="user-form-grid mb-10 class-tree-inline-form">
                            <div className="field-block__label class-tree-add-parent-label">
                              {t.settings.classTreeEditingLabel}: {classTreeEditTarget?.join(" / ")}
                            </div>
                            <Input
                              placeholder={t.settings.classBnLabel}
                              value={classTreeEditForm.bn}
                              onChange={(e) => setClassTreeEditForm({ ...classTreeEditForm, bn: e.target.value })}
                            />
                            <div>
                              <Input
                                placeholder={t.settings.classEnLabel}
                                value={classTreeEditForm.en}
                                onChange={(e) => setClassTreeEditForm({ ...classTreeEditForm, en: e.target.value })}
                              />
                              <p className="field-block__label">{t.settings.classEnHint}</p>
                            </div>
                            <Button variant="teal" solid onClick={handleSaveClassTreeNodeEdit} disabled={classTreeEditSaving}>
                              {classTreeEditSaving ? t.settings.classTreeEditSaving : t.settings.classTreeEditSave}
                            </Button>
                            <Button variant="rose" onClick={() => setClassTreeEditTarget(null)} disabled={classTreeEditSaving}>
                              {t.settings.classTreeCancel}
                            </Button>
                          </div>
                        )}
                        subjectsLabel={t.settings.subjectsLabel}
                        subjectsEmptyLabel={t.settings.subjectsEmpty}
                        subjectAddLabel={t.settings.subjectAdd}
                        subjectEditLabel={t.settings.subjectEdit}
                        activeSubjectAddPath={subjectAddTarget}
                        activeSubjectEditTarget={subjectEditTarget}
                        onAddSubject={(path) => {
                          setClassTreeAddTarget(null);
                          setClassTreeEditTarget(null);
                          setSubjectEditTarget(null);
                          setSubjectAddTarget(path);
                          setSubjectForm({ bn: "", en: "" });
                        }}
                        onEditSubject={(path, subject) => {
                          setClassTreeAddTarget(null);
                          setClassTreeEditTarget(null);
                          setSubjectAddTarget(null);
                          handleStartEditSubject(path, subject);
                        }}
                        onDeleteSubject={handleDeleteSubject}
                        renderSubjectAddForm={() => (
                          <div className="user-form-grid mb-10 class-tree-inline-form">
                            <div className="field-block__label class-tree-add-parent-label">
                              {t.settings.subjectParentLabel}: {subjectAddTarget?.join(" / ")}
                            </div>
                            <Input
                              placeholder={t.settings.subjectBnLabel}
                              value={subjectForm.bn}
                              onChange={(e) => setSubjectForm({ ...subjectForm, bn: e.target.value })}
                            />
                            <div>
                              <Input
                                placeholder={t.settings.subjectEnLabel}
                                value={subjectForm.en}
                                onChange={(e) => setSubjectForm({ ...subjectForm, en: e.target.value })}
                              />
                              <p className="field-block__label">{t.settings.subjectEnHint}</p>
                            </div>
                            <Button variant="teal" solid onClick={handleAddSubject}>
                              {t.settings.addClass}
                            </Button>
                            <Button variant="rose" onClick={() => setSubjectAddTarget(null)}>
                              {t.settings.classTreeCancel}
                            </Button>
                          </div>
                        )}
                        renderSubjectEditForm={() => (
                          <div className="user-form-grid mb-10 class-tree-inline-form">
                            <div className="field-block__label class-tree-add-parent-label">
                              {t.settings.subjectEditingLabel}: {subjectEditForm.bn}
                            </div>
                            <Input
                              placeholder={t.settings.subjectBnLabel}
                              value={subjectEditForm.bn}
                              onChange={(e) => setSubjectEditForm({ ...subjectEditForm, bn: e.target.value })}
                            />
                            <div>
                              <Input
                                placeholder={t.settings.subjectEnLabel}
                                value={subjectEditForm.en}
                                onChange={(e) => setSubjectEditForm({ ...subjectEditForm, en: e.target.value })}
                              />
                              <p className="field-block__label">{t.settings.subjectEnHint}</p>
                            </div>
                            <Button variant="teal" solid onClick={handleSaveSubjectEdit}>
                              {t.settings.classTreeEditSave}
                            </Button>
                            <Button variant="rose" onClick={() => setSubjectEditTarget(null)}>
                              {t.settings.classTreeCancel}
                            </Button>
                          </div>
                        )}
                      />
                    ))}
                    {!classTree.length && <p className="field-block__label">{t.settings.classEmptyList}</p>}
                  </div>
                </>
              )}
            </div>
          )}

          {allowShifts && (
            <div className="settings-card">
              <SectionHeader title={t.settings.shiftManagement} open={editShifts} onToggle={() => setEditShifts((v) => !v)} />
              {editShifts && (
                <>
                  <p className="field-block__label mb-10">{t.settings.shiftManagementHint}</p>
                  {shiftError && <div className="alert alert--rose">{shiftError}</div>}

                  <h4 className="page-header__title">{shiftEditId != null ? t.settings.shiftEditTitle : t.settings.shiftAddTitle}</h4>
                  <div className="user-form-grid">
                    <Field label={t.settings.shiftNameLabel} value={shiftForm.name} onChange={(v) => setShiftForm({ ...shiftForm, name: v })} />
                    <Field label={t.settings.shiftNameEnLabel} value={shiftForm.nameEn} onChange={(v) => setShiftForm({ ...shiftForm, nameEn: v })} />
                    <Field label={t.settings.shiftStartLabel} value={shiftForm.startTime} onChange={(v) => setShiftForm({ ...shiftForm, startTime: v })} type="time" />
                    <Field label={t.settings.shiftEndLabel} value={shiftForm.endTime} onChange={(v) => setShiftForm({ ...shiftForm, endTime: v })} type="time" />
                    <Field label={t.settings.shiftGraceLabel} value={shiftForm.graceMinutes} onChange={(v) => setShiftForm({ ...shiftForm, graceMinutes: v })} type="number" />
                  </div>
                  <div className="class-post__actions">
                    <Button variant="teal" solid onClick={saveShift} disabled={shiftSaving}>
                      {shiftSaving ? t.settings.shiftSaving : t.settings.shiftSave}
                    </Button>
                    {shiftEditId != null && (
                      <Button variant="outline" onClick={resetShiftForm}>
                        {t.settings.shiftCancel}
                      </Button>
                    )}
                  </div>

                  {shiftsLoading && <p className="field-block__label mb-10">…</p>}
                  <div className="user-list">
                    {!shiftsLoading &&
                      shifts.map((row) => (
                        <div key={row.id} className="user-row">
                          <div className="user-info">
                            <div className="user-name">{row.name}</div>
                            <div className="user-meta">
                              {row.startTime}–{row.endTime} · {t.settings.shiftGraceLabel}: {row.graceMinutes}
                            </div>
                          </div>
                          <button type="button" onClick={() => startEditShift(row)} className="btn-xs btn-xs--cancel">
                            {t.settings.shiftEdit}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleShiftActive(row)}
                            disabled={shiftBusyId === row.id}
                            className={row.active ? "btn-xs btn-xs--delete" : "btn-xs btn-xs--cancel"}
                          >
                            {row.active ? t.settings.shiftDeactivate : t.settings.shiftActivate}
                          </button>
                        </div>
                      ))}
                    {!shiftsLoading && !shifts.length && <p className="field-block__label">{t.settings.shiftEmptyList}</p>}
                  </div>

                  <h4 className="page-header__title mt-18">{t.settings.classShiftMapTitle}</h4>
                  <p className="field-block__label mb-10">{t.settings.classShiftMapHint}</p>
                  <div className="user-list">
                    {classOptions.map((option) => (
                      <div key={option.en} className="user-row">
                        <div className="user-info">
                          <div className="user-name">{option.bn}</div>
                          <div className="user-meta">{option.en}</div>
                        </div>
                        <Select
                          value={classShiftDraft[option.en] === undefined || classShiftDraft[option.en] === "" ? "" : String(classShiftDraft[option.en])}
                          onChange={(e) =>
                            setClassShiftDraft({
                              ...classShiftDraft,
                              [option.en]: e.target.value ? Number(e.target.value) : "",
                            })
                          }
                        >
                          <option value="">{t.settings.classShiftMapNone}</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.startTime}-{s.endTime})
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                    {!classOptions.length && <p className="field-block__label">{t.settings.classEmptyList}</p>}
                  </div>
                  <Button variant="teal" solid onClick={saveClassShifts} disabled={classShiftSaving} className="mt-18">
                    {classShiftSaving ? t.settings.shiftSaving : t.settings.classShiftMapSave}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <button type="button" onClick={handleSave} className={`save-settings-btn ${saved ? "save-settings-btn--saved" : ""}`}>
        {saved ? t.settings.savedMsg : t.settings.saveChanges}
      </button>
    </div>
  );
}

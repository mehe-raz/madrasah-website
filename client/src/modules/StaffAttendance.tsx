// docs/STAFF_ATTENDANCE_PLAN.md, Phase 6 — daily staff attendance UI.
// Wires api.getStaffAttendance/saveStaffAttendance (Phase 6) against
// routes/staffAttendance.js (Phase 3). Structurally the staff-side twin of
// modules/Attendance.tsx (student attendance) — same 3-state
// present/absent/late vocabulary and the same offline-outbox save via
// requestOrQueue (see api.ts) — but rebuilt with design-system components
// instead of Attendance.tsx's legacy inline styles, since this is a brand
// new file (AGENTS.md's Design System rule applies in full here, unlike
// Attendance.tsx which is grandfathered).
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import type { StaffAttendanceRow } from "../types";
import { C } from "../theme/colors";

// Same literal Bengali values as ATTENDANCE_STATUSES in
// server/src/lib/opsSchemas.js — the status column is language-independent
// of the UI locale, matching how modules/Attendance.tsx already works.
const PRESENT = "উপস্থিত";
const ABSENT = "অনুপস্থিত";
const LATE = "দেরিতে";

export function StaffAttendance() {
  const { t } = useLanguage();
  const c = t.staffAttendance;

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<StaffAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .getStaffAttendance(date)
      .then((res) => {
        setRows(res.staff);
        setDate(res.date);
      })
      .catch((err) => setError(err instanceof Error ? err.message : c.loadFailed))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- c intentionally excluded, same reasoning as CallListView.tsx's load()
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
  }, [load]);

  const setStatus = (id: number, status: string) => setRows(rows.map((r) => (r.id === id ? { ...r, att: status } : r)));

  const markAll = (status: string) => setRows(rows.map((r) => ({ ...r, att: status })));

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const result = await api.saveStaffAttendance(
        rows.map((r) => ({ staffId: r.id, status: r.att || PRESENT })),
        date
      );
      if (result.queued) {
        // Same reasoning as Attendance.tsx: nothing reached the server
        // yet, so reloading now would overwrite these selections with
        // stale server state — the outbox flushes on its own once the
        // connection returns.
        setQueued(true);
        setTimeout(() => setQueued(false), 3000);
      } else {
        load();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : c.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const statusVariant = (row: StaffAttendanceRow, status: string): "sky" | "outline" => (row.att === status ? "sky" : "outline");

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{c.title}</h2>
          <p className="page-subtitle">{c.subtitle}</p>
        </div>
        {saved && <Badge label={c.saved} color={C.emerald} />}
        {queued && <Badge label={c.queued} color={C.amber} />}
      </div>

      <Card>
        <div className="form-grid">
          <Field label={c.date}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        {saveError && <div className="alert alert--rose">{saveError}</div>}

        <div className="staff-attendance-toolbar">
          <span className="page-subtitle">{c.markAll}:</span>
          <Button variant="emerald" onClick={() => markAll(PRESENT)}>
            {c.present}
          </Button>
          <Button variant="amber" onClick={() => markAll(LATE)}>
            {c.late}
          </Button>
          <Button variant="rose" onClick={() => markAll(ABSENT)}>
            {c.absent}
          </Button>
        </div>
      </Card>

      <Card>
        {loading && <SkeletonCardList count={3} lines={2} />}
        {!loading && error && <div className="alert alert--rose">{error}</div>}
        {!loading && !error && rows.length === 0 && <p className="page-subtitle">{c.noStaff}</p>}

        {!loading &&
          !error &&
          rows.map((row) => (
            <Card key={row.id} tight className="class-post">
              <div className="class-post__head">
                <Badge label={row.designation} color={C.sky} />
                {row.class && <span className="class-post__meta">{row.class}</span>}
              </div>
              <div className="class-post__title">{row.name}</div>
              <div className="class-post__actions">
                <Button variant={statusVariant(row, PRESENT)} onClick={() => setStatus(row.id, PRESENT)}>
                  {c.present}
                </Button>
                <Button variant={statusVariant(row, LATE)} onClick={() => setStatus(row.id, LATE)}>
                  {c.late}
                </Button>
                <Button variant={statusVariant(row, ABSENT)} onClick={() => setStatus(row.id, ABSENT)}>
                  {c.absent}
                </Button>
              </div>
            </Card>
          ))}
      </Card>

      {!loading && !error && rows.length > 0 && (
        <div className="class-post__actions">
          <Button variant="sky" solid onClick={handleSave} disabled={saving}>
            {saving ? c.saving : c.save}
          </Button>
        </div>
      )}
    </div>
  );
}

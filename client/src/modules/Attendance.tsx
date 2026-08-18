import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import { useAppSettings } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { classTreeLabel } from "../lib/classTree";
import { deptLabel } from "../lib/labels";
import { isoToTimeInput, timeInputToIso } from "../lib/attendanceTime";
import { C } from "../theme/colors";
import type { Student } from "../types";

const DEPTS = ["Hifz", "Kitab", "Nazera", "Nurani", "General", "All"] as const;

export function Attendance() {
  const { t, classTree } = useAppSettings();
  const [dept, setDept] = useState<string>("All");
  const [att, setAtt] = useState<Student[]>([]);
  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // docs/SHIFT_SCHEDULE_PLAN.md, Phase 7 — manual entry/exit time inputs,
  // keyed by studentId. Kept separate from `att`'s entryTime/exitTime
  // (ISO strings from the server) because the <input type="time"> needs a
  // plain "HH:MM" string — see lib/attendanceTime.ts's isoToTimeInput.
  const [entryInputs, setEntryInputs] = useState<Record<number, string>>({});
  const [exitInputs, setExitInputs] = useState<Record<number, string>>({});

  // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 5 — manual "নির্বাচিত শিক্ষার্থী"
  // reminder flow. No new endpoint: this reuses the existing
  // POST /api/guardian-reminders with targetType:"selectedStudents" +
  // scheduleType:"once", which the server already dispatches immediately
  // on create (see routes/guardianReminders.js). New UI state only, kept
  // local to this component per AGENTS.md's Design System rule — every
  // element added here uses components/ui/*, no raw style={{}} on native
  // elements, since existing inline styles in this file are legacy and not
  // to be imitated in new code.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderBody, setReminderBody] = useState("");
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [reminderError, setReminderError] = useState("");

  const load = useCallback(() => {
    api.getAttendance({ dept, date }).then((res) => {
      setAtt(res.students);
      setDate(res.date);
      const entries: Record<number, string> = {};
      const exits: Record<number, string> = {};
      res.students.forEach((s) => {
        entries[s.id] = isoToTimeInput(s.entryTime);
        exits[s.id] = isoToTimeInput(s.exitTime);
      });
      setEntryInputs(entries);
      setExitInputs(exits);
    });
  }, [dept, date]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: number, val: string) =>
    setAtt(att.map((s) => (s.id === id ? { ...s, att: val } : s)));

  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stats = {
    present: att.filter((s) => s.att === "উপস্থিত").length,
    absent: att.filter((s) => s.att === "অনুপস্থিত").length,
    late: att.filter((s) => s.att === "দেরিতে").length,
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await api.saveAttendance(
        att.map((s) => ({
          studentId: s.id,
          status: s.att || "উপস্থিত",
          entryTime: timeInputToIso(date, entryInputs[s.id] || ""),
          exitTime: timeInputToIso(date, exitInputs[s.id] || ""),
        })),
        date
      );
      if (result.queued) {
        // Nothing actually reached the server yet — reloading now would
        // just overwrite these selections with the (stale) server state.
        // The outbox flushes automatically once the connection returns.
        setQueued(true);
        setTimeout(() => setQueued(false), 3000);
      } else {
        load();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      // Previously this was swallowed and the button still flashed "Saved"
      // even when nothing reached the server — a teacher could believe
      // attendance was recorded when it silently wasn't. Now a real save
      // failure surfaces as an error and never claims success.
      setError(err instanceof Error ? err.message : t.common.requestFailed);
    } finally {
      setSaving(false);
    }
  };

  const bulkMark = (v: string) => setAtt(att.map((s) => ({ ...s, att: v })));

  const sendSelectedReminder = async () => {
    if (!reminderTitle.trim() || selectedIds.size === 0) return;
    setReminderSending(true);
    setReminderSent(false);
    setReminderError("");
    try {
      await api.createGuardianReminder({
        title: reminderTitle.trim(),
        body: reminderBody.trim(),
        targetType: "selectedStudents",
        selectedStudentIds: Array.from(selectedIds),
        scheduleType: "once",
      });
      setReminderSent(true);
      setReminderTitle("");
      setReminderBody("");
      setSelectedIds(new Set());
      window.setTimeout(() => {
        setReminderSent(false);
        setShowReminderForm(false);
      }, 1800);
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : t.attendance.reminderSendFailed);
    } finally {
      setReminderSending(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{t.attendance.title}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.muted }}>{t.attendance.date}:</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontSize: 13, color: C.text, background: C.card }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {queued && <Badge label={t.offline.queuedForSync} color={C.amber} />}
          <button type="button" disabled={saving} onClick={handleSave} style={{ background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: 14, opacity: saving ? 0.7 : 1 }}>
            {saving ? "…" : saved ? t.common.saved : t.common.save}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: C.rose, background: C.roseL, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {DEPTS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDept(d)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${dept === d ? C.teal : C.border}`,
              background: dept === d ? C.tealL : C.card,
              color: dept === d ? C.tealD : C.muted,
              fontWeight: dept === d ? 700 : 400,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {d === "All" ? t.common.all : deptLabel(d)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {([["উপস্থিত", stats.present, C.emerald], ["অনুপস্থিত", stats.absent, C.rose], ["দেরিতে", stats.late, C.amber]] as const).map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: col + "18", border: `1px solid ${col}40`, borderRadius: 10, padding: "10px 18px", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</span>
            <span style={{ fontSize: 13, color: col }}>{lbl}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: C.muted, alignSelf: "center" }}>{t.attendance.markAll}:</span>
        {[
          { value: "উপস্থিত", label: t.attendance.markPresent },
          { value: "অনুপস্থিত", label: t.attendance.markAbsent },
          { value: "দেরিতে", label: t.attendance.markLate },
        ].map(({ value, label }) => (
          <button key={value} type="button" onClick={() => bulkMark(value)} style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: C.text }}>
            {label}
          </button>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <Card className="guardian-reminder-attendance-banner">
          <div className="guardian-reminder-dispatch__row">
            <span className="class-post__meta">
              {t.attendance.selectedCount.replace("{count}", String(selectedIds.size))}
            </span>
            <Button variant="amber" solid onClick={() => setShowReminderForm((v) => !v)}>
              {t.attendance.sendReminderToSelected}
            </Button>
          </div>

          {showReminderForm && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field label={t.attendance.reminderTitleLabel}>
                <Input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} />
              </Field>
              <Field label={t.attendance.reminderBodyLabel}>
                <Textarea value={reminderBody} onChange={(e) => setReminderBody(e.target.value)} rows={3} />
              </Field>
              {reminderError && <div className="alert alert--rose">{reminderError}</div>}
              <Button
                variant={reminderSent ? "emerald" : "sky"}
                solid
                onClick={sendSelectedReminder}
                disabled={reminderSending || !reminderTitle.trim()}
              >
                {reminderSending
                  ? t.attendance.sendingReminder
                  : reminderSent
                    ? t.attendance.reminderSent
                    : t.attendance.sendReminder}
              </Button>
            </div>
          )}
        </Card>
      )}

      <div className="table-wrap" style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
          <thead>
            <tr style={{ background: C.slateL }}>
              {["#", t.attendance.select, t.attendance.roll, t.attendance.name, t.attendance.class, t.attendance.dept, t.attendance.status, t.attendance.entryTimeLabel, t.attendance.exitTimeLabel].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {att.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : "var(--row-alt)" }}>
                <td style={{ padding: "10px 14px", color: C.muted }}>{i + 1}</td>
                <td style={{ padding: "10px 14px" }}>
                  <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelected(s.id)} />
                </td>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: C.muted }}>{s.roll}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{s.name}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{classTreeLabel(classTree, s.class)}</td>
                <td style={{ padding: "10px 14px" }}><Badge label={deptLabel(s.dept)} color={C.teal} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {["উপস্থিত", "অনুপস্থিত", "দেরিতে"].map((v) => {
                      const active = s.att === v;
                      const col = v === "উপস্থিত" ? C.emerald : v === "অনুপস্থিত" ? C.rose : C.amber;
                      const colL = v === "উপস্থিত" ? C.emeraldL : v === "অনুপস্থিত" ? C.roseL : C.amberL;
                      const colD = v === "উপস্থিত" ? C.emeraldD : v === "অনুপস্থিত" ? C.roseD : C.amberD;
                      return (
                        <button key={v} type="button" onClick={() => toggle(s.id, v)} style={{ border: `1px solid ${active ? col : C.border}40`, background: active ? colL : "transparent", color: active ? colD : C.muted, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400 }}>
                          {v}
                        </button>
                      );
                    })}
                    {/* docs/SHIFT_SCHEDULE_PLAN.md, Phase 7 — server-computed
                        minutes-late badge (routes/attendance.js's
                        lateMinutesFor); only rendered when positive, so a
                        student with no shift/no entry/on-time shows nothing
                        extra here. */}
                    {!!s.lateMinutes && s.lateMinutes > 0 && (
                      <Badge label={t.attendance.lateByMinutes.replace("{count}", String(s.lateMinutes))} color={C.amber} />
                    )}
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <input
                    type="time"
                    value={entryInputs[s.id] || ""}
                    onChange={(e) => setEntryInputs({ ...entryInputs, [s.id]: e.target.value })}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontSize: 13, color: C.text, background: C.card }}
                  />
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <input
                    type="time"
                    value={exitInputs[s.id] || ""}
                    onChange={(e) => setExitInputs({ ...exitInputs, [s.id]: e.target.value })}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontSize: 13, color: C.text, background: C.card }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

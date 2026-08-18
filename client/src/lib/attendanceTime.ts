// client/src/lib/attendanceTime.ts
//
// docs/SHIFT_SCHEDULE_PLAN.md, Phase 7 — attendance.entryTime/exitTime are
// stored as full ISO-8601 timestamps (same as devicePunch.js's punchAt),
// but the manual-entry UI only wants a plain <input type="time"> ("HH:MM").
// These two helpers are the only place that conversion happens, so the
// attendance date (the row's `date` state, not necessarily today) and the
// device-punch format stay in sync no matter which screen edits the value.

// ISO timestamp -> "HH:MM" in the browser's local time, for populating a
// time input. Returns "" for an unset/invalid value so the input shows
// empty rather than "Invalid Date".
export function isoToTimeInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// dateStr ("YYYY-MM-DD", the attendance sheet's date, not necessarily
// today) + timeStr ("HH:MM" from the input) -> full ISO timestamp in local
// time. Returns undefined for an empty timeStr, so a row whose time input
// was left blank sends nothing and the server's COALESCE-preserve logic
// (routes/attendance.js/staffAttendance.js POST) keeps whatever a device
// punch already recorded instead of getting nulled out.
export function timeInputToIso(dateStr: string, timeStr: string): string | undefined {
  if (!timeStr) return undefined;
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

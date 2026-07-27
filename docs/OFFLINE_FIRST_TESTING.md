# Offline-First: Testing & Staged Rollout (ভাগ ৬)

Covers the outbox/sync system built across Phases 1–5:
`client/src/lib/offlineDb.ts`, `offlineSync.ts`, `offlineCache.ts`,
`api.ts`'s `requestOrQueue()`, and the three screens wired into it —
Attendance (Phase 3), Student Admission (Phase 4), Fee Collection (Phase 5).

## 1. Simulating offline in DevTools

Chrome/Edge DevTools → **Network** tab → throttling dropdown → **Offline**.
(Turning off Wi-Fi also works but is slower to toggle mid-test.)

For each flow below: go offline, submit, confirm it queues instead of
failing outright, go back online, confirm it syncs.

### Attendance (upsert-safe — lowest risk)
1. Go offline. Mark attendance for a class, submit.
2. Confirm the UI shows a "pending sync" state (no hard error).
3. Go online. Within ~5s (poll interval) it should flush automatically —
   check `Attendance.tsx`'s pending indicator clears, and the record
   appears in the server's attendance list.
4. Re-submit the SAME date/class while online — should upsert cleanly
   (no duplicate row), since the route uses `ON CONFLICT`.

### Admission (temporary numbers, possible 409)
1. Go offline. Fill out a new admission, submit.
2. Confirm it shows in Students.tsx's "সিঙ্ক বাকি ভর্তি" panel with a
   temporary badge, not a real roll/admission number.
3. Go online, wait for sync. Confirm it gets a real number and moves into
   the normal student list.
4. **Duplicate case:** while still offline, submit the same admission
   twice (two clientRequestIds). On sync, confirm ONE succeeds and the
   other lands in "সিঙ্ক সমস্যা" (failed) with the server's 409 message —
   not silently dropped or double-created.

### Fee collection (highest risk — money)
1. Go offline. Collect a fee for a student with due > 0. Submit.
2. Confirm it shows in the "সিঙ্ক বাকি বেতন" panel as a provisional
   acknowledgment — **no printable receipt yet**, no receipt number shown.
3. Go online, wait for sync. Confirm a real receipt now exists in
   "পেমেন্ট ইতিহাস" and the student's due dropped correctly.
4. **Conflict case (the main thing Phase 5 exists for):** with a student
   whose due is fully paid off (due = 0), submit another payment for them
   while offline. On sync it should NOT silently succeed — confirm it
   shows up in the "পর্যালোচনা প্রয়োজন" panel (visible only to
   Admin/Super Admin) with status `Flagged`, and that:
   - it did **not** add to the income totals on the dashboard yet
   - "নিশ্চিত করুন" books it (income entry appears, due updates)
   - "বাতিল করুন" marks it `Voided` (nothing added, row kept for audit)
5. **Two-device race:** simulate two staff collecting the same student's
   fee offline at the same time (two browser profiles/tabs, both offline,
   both submit before either syncs). On reconnect, confirm exactly one
   processes normally and the second is flagged — not both silently
   accepted.

## 2. Trial rollout

1. Deploy with `VITE_OFFLINE_QUEUE_ENABLED` unset (defaults to on).
2. Have ONE trial staff member use the app normally, including at least
   one real offline moment (e.g. spotty mobile data), for a few days.
3. Check `audit_logs` for `payment.flagged` / `payment.flag-confirmed` /
   `payment.flag-voided` and the "সিঙ্ক সমস্যা" panels daily during the
   trial — these are exactly the cases that need a human to look normal.
4. Only after that period looks clean, roll out to all staff.

## 3. Rollback

If something looks wrong with the sync/flag mechanism itself during the
trial (not just an individual flagged payment, which is working as
intended):

1. Set `VITE_OFFLINE_QUEUE_ENABLED=false` in the client's environment and
   redeploy. This reverts attendance/admission/fee forms to the
   pre-Phase-3 behavior — they fail normally when offline, nothing queues
   — with no code change (see the kill-switch in `client/src/lib/api.ts`).
2. Any entries already sitting in a device's IndexedDB outbox stay there
   (harmless — `flushOutbox()` just never gets called with the flag off)
   until the flag is turned back on.
3. This does not touch already-synced data — `Flagged`/`Voided` payments
   already recorded stay exactly as they are and still need manual review
   via the "পর্যালোচনা প্রয়োজন" panel.

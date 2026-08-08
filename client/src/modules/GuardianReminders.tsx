import { useEffect, useState } from "react";
import { SkeletonCardList } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { StudentPicker } from "../components/StudentPicker";
import { Button, Card, Field, Input, Select, Textarea } from "../components/ui";
import { api } from "../lib/api";
import { useLanguage } from "../context/AppSettingsContext";
import { C } from "../theme/colors";
import type { GuardianReminder, Student } from "../types";

const TARGET_COLOR: Record<GuardianReminder["targetType"], string> = {
  all: C.sky,
  class: C.violet,
  student: C.emerald,
  feeDue: C.rose,
  lateArrival: C.amber,
  attendanceMissing: C.teal,
  selectedStudents: C.slate,
};

const SCHEDULE_COLOR: Record<GuardianReminder["scheduleType"], string> = {
  once: C.slate,
  daily: C.amber,
  specificDate: C.teal,
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "এইমাত্র";
  if (minutes < 60) return `${minutes} মিনিট আগে`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} দিন আগে`;
  return String(iso).slice(0, 10);
}

export function GuardianReminders() {
  const { t } = useLanguage();
  const targetLabel: Record<GuardianReminder["targetType"], string> = {
    all: t.guardianReminders.targetAll,
    class: t.guardianReminders.targetClass,
    student: t.guardianReminders.targetStudent,
    feeDue: t.guardianReminders.targetFeeDue,
    lateArrival: t.guardianReminders.targetLateArrival,
    attendanceMissing: t.guardianReminders.targetAttendanceMissing,
    selectedStudents: t.guardianReminders.targetSelectedStudents,
  };
  const scheduleLabel: Record<GuardianReminder["scheduleType"], string> = {
    once: t.guardianReminders.scheduleOnce,
    daily: t.guardianReminders.scheduleDaily,
    specificDate: t.guardianReminders.scheduleSpecificDate,
  };

  const [classes, setClasses] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<GuardianReminder["targetType"]>("all");
  const [targetClass, setTargetClass] = useState("");
  const [targetStudent, setTargetStudent] = useState<Student | null>(null);
  const [scheduleType, setScheduleType] = useState<GuardianReminder["scheduleType"]>("once");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [intervalDays, setIntervalDays] = useState(1);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [composeError, setComposeError] = useState("");

  const [reminders, setReminders] = useState<GuardianReminder[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");

  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState("");

  // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 5 — feeDue/lateArrival/
  // attendanceMissing are the three "conditional/automatic" types that
  // always run on the generalized interval+time schedule (Phase 3), so the
  // schedule-type dropdown is hidden for them and scheduleType is forced to
  // "daily" instead. 'selectedStudents' isn't offered in this dropdown at
  // all — it's only ever created from the Attendance page's "send now" flow
  // below, via scheduleType: "once" (see §7 of the plan).
  const isConditionalType = targetType === "feeDue" || targetType === "lateArrival" || targetType === "attendanceMissing";
  const classRequired = targetType === "class" || targetType === "lateArrival" || targetType === "attendanceMissing";
  const classApplicable = classRequired || targetType === "feeDue";

  useEffect(() => {
    api.getAssignmentClasses().then(setClasses).catch(() => setClasses([]));
  }, []);

  const refreshList = () => {
    setLoadingList(true);
    setListError("");
    api
      .getGuardianReminders()
      .then(setReminders)
      .catch((err) => setListError(err instanceof Error ? err.message : t.guardianReminders.noReminders))
      .finally(() => setLoadingList(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshList() intentionally sets loading=true immediately so the list shows a loading state right away; the rest of its state updates land after the request resolves
  useEffect(refreshList, []);

  const resetForm = () => {
    setTitle("");
    setBody("");
    setTargetClass("");
    setTargetStudent(null);
    setScheduleDate("");
    setScheduleTime("");
    setIntervalDays(1);
  };

  const send = async () => {
    if (!title.trim()) {
      setComposeError(t.guardianReminders.enterTitle);
      return;
    }
    if (classRequired && !targetClass) {
      setComposeError(t.guardianReminders.selectClassFirst);
      return;
    }
    if (targetType === "student" && !targetStudent) {
      setComposeError(t.guardianReminders.selectStudentFirst);
      return;
    }
    if (scheduleType === "specificDate" && !scheduleDate) {
      setComposeError(t.guardianReminders.selectDateFirst);
      return;
    }
    if (isConditionalType && !scheduleTime) {
      setComposeError(t.guardianReminders.selectTimeFirst);
      return;
    }
    setSending(true);
    setSent(false);
    setComposeError("");
    try {
      await api.createGuardianReminder({
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetClass: classApplicable ? targetClass || undefined : undefined,
        targetStudentId: targetType === "student" ? targetStudent?.id : undefined,
        scheduleType,
        scheduleDate: scheduleType === "specificDate" ? scheduleDate : undefined,
        scheduleTime: isConditionalType ? scheduleTime : undefined,
        intervalDays: isConditionalType ? intervalDays : undefined,
      });
      resetForm();
      setSent(true);
      window.setTimeout(() => setSent(false), 2200);
      refreshList();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : t.guardianReminders.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const toggleActive = async (reminder: GuardianReminder) => {
    try {
      await api.toggleGuardianReminder(reminder.id, !reminder.active);
      refreshList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : t.guardianReminders.toggleFailed);
    }
  };

  const remove = async (reminder: GuardianReminder) => {
    try {
      await api.deleteGuardianReminder(reminder.id);
      refreshList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : t.guardianReminders.deleteFailed);
    }
  };

  const dispatchNow = async () => {
    setDispatching(true);
    setDispatchMsg("");
    try {
      const result = await api.dispatchGuardianReminders();
      const count = result.dispatched.reduce((sum, d) => sum + d.count, 0);
      setDispatchMsg(t.guardianReminders.dispatchedCount.replace("{count}", String(count)));
      refreshList();
    } catch (err) {
      setDispatchMsg(err instanceof Error ? err.message : t.guardianReminders.dispatchFailed);
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">{t.guardianReminders.title}</h2>
      <p className="page-subtitle">{t.guardianReminders.subtitle}</p>

      {composeError && <div className="alert alert--rose">{composeError}</div>}

      <Card className="guardian-reminder-form">
        <div className="form-grid">
          <Field label={t.guardianReminders.postTitle}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.guardianReminders.postTitlePlaceholder}
            />
          </Field>

          <Field label={t.guardianReminders.targetTypeLabel}>
            <Select
              value={targetType}
              onChange={(e) => {
                const next = e.target.value as GuardianReminder["targetType"];
                setTargetType(next);
                // docs/CONDITIONAL_REMINDERS_PLAN.md Phase 5 — feeDue/lateArrival/
                // attendanceMissing always run on the generalized interval+time
                // schedule (Phase 3), so scheduleType is forced to "daily" the
                // moment one of them is picked. Set directly in the event handler
                // (not a useEffect) to avoid a synchronous setState-in-effect
                // cascading render.
                if (next === "feeDue" || next === "lateArrival" || next === "attendanceMissing") {
                  setScheduleType("daily");
                }
              }}
            >
              <option value="all">{t.guardianReminders.targetAll}</option>
              <option value="class">{t.guardianReminders.targetClass}</option>
              <option value="student">{t.guardianReminders.targetStudent}</option>
              <option value="feeDue">{t.guardianReminders.targetFeeDue}</option>
              <option value="lateArrival">{t.guardianReminders.targetLateArrival}</option>
              <option value="attendanceMissing">{t.guardianReminders.targetAttendanceMissing}</option>
              {/* 'selectedStudents' isn't offered here — created only from the
                  Attendance page's checkbox selection (see §7 of the plan). */}
            </Select>
          </Field>

          {!isConditionalType && (
            <Field label={t.guardianReminders.scheduleTypeLabel}>
              <Select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as GuardianReminder["scheduleType"])}
              >
                <option value="once">{t.guardianReminders.scheduleOnce}</option>
                <option value="daily">{t.guardianReminders.scheduleDaily}</option>
                <option value="specificDate">{t.guardianReminders.scheduleSpecificDate}</option>
              </Select>
            </Field>
          )}

          {isConditionalType && (
            <>
              <Field label={t.guardianReminders.intervalDaysLabel}>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                />
              </Field>
              <Field label={t.guardianReminders.scheduleTimeLabel}>
                <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {(targetType === "class" || targetType === "lateArrival" || targetType === "attendanceMissing") && (
          <Field label={t.guardianReminders.selectClass}>
            <Select value={targetClass} onChange={(e) => setTargetClass(e.target.value)}>
              <option value="">{t.guardianReminders.selectClass}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {targetType === "feeDue" && (
          <Field label={t.guardianReminders.selectClassOptional}>
            <Select value={targetClass} onChange={(e) => setTargetClass(e.target.value)}>
              <option value="">{t.guardianReminders.selectClassOptional}</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {targetType === "student" && (
          <Field label={t.guardianReminders.selectStudent}>
            <StudentPicker value={targetStudent} onSelect={setTargetStudent} />
          </Field>
        )}

        {scheduleType === "specificDate" && !isConditionalType && (
          <Field label={t.guardianReminders.scheduleDateLabel}>
            <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          </Field>
        )}

        <Field label={t.guardianReminders.body}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </Field>

        <Button variant={sent ? "emerald" : "sky"} solid onClick={send} disabled={sending}>
          {sending ? t.guardianReminders.sending : sent ? t.guardianReminders.sent : t.guardianReminders.send}
        </Button>
      </Card>

      <Card className="guardian-reminder-dispatch">
        <div className="guardian-reminder-dispatch__row">
          <div>
            <div className="class-post__title">{t.guardianReminders.dispatchTitle}</div>
            <div className="class-post__meta">{t.guardianReminders.dispatchSubtitle}</div>
          </div>
          <Button variant="amber" solid onClick={dispatchNow} disabled={dispatching}>
            {dispatching ? t.guardianReminders.dispatching : t.guardianReminders.dispatchNow}
          </Button>
        </div>
        {dispatchMsg && <div className="class-post__meta guardian-reminder-dispatch__msg">{dispatchMsg}</div>}
      </Card>

      <Card>
        <h3 className="page-header__title">{t.guardianReminders.listTitle}</h3>

        {loadingList && <SkeletonCardList count={3} lines={2} />}
        {!loadingList && listError && <div className="alert alert--rose">{listError}</div>}
        {!loadingList && !listError && reminders.length === 0 && (
          <p className="page-subtitle">{t.guardianReminders.noReminders}</p>
        )}

        {!loadingList &&
          !listError &&
          reminders.map((r) => (
            <Card key={r.id} tight className="class-post guardian-reminder-item">
              <div className="class-post__head">
                <Badge label={targetLabel[r.targetType]} color={TARGET_COLOR[r.targetType]} />
                <Badge label={scheduleLabel[r.scheduleType]} color={SCHEDULE_COLOR[r.scheduleType]} />
                <span className="class-post__meta">{relativeTime(r.createdAt)}</span>
              </div>
              <div className="class-post__title">{r.title}</div>
              {r.body && <div className="class-post__body">{r.body}</div>}
              {r.scheduleTime && (
                <div className="class-post__meta">
                  {t.guardianReminders.scheduleTimeLabel}: {r.scheduleTime} · {t.guardianReminders.intervalDaysLabel}: {r.intervalDays}
                </div>
              )}
              <div className="class-post__meta guardian-reminder-item__last-sent">
                {r.lastSentAt
                  ? `${t.guardianReminders.lastSentAt} ${relativeTime(r.lastSentAt)}`
                  : t.guardianReminders.neverSent}
              </div>
              <div className="guardian-reminder-item__actions">
                <Button variant={r.active ? "emerald" : "outline"} onClick={() => toggleActive(r)}>
                  {r.active ? t.guardianReminders.active : t.guardianReminders.inactive}
                </Button>
                <Button variant="rose" onClick={() => remove(r)}>
                  {t.guardianReminders.delete}
                </Button>
              </div>
            </Card>
          ))}
      </Card>
    </div>
  );
}

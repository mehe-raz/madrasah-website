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

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [composeError, setComposeError] = useState("");

  const [reminders, setReminders] = useState<GuardianReminder[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");

  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState("");

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
  };

  const send = async () => {
    if (!title.trim()) {
      setComposeError(t.guardianReminders.enterTitle);
      return;
    }
    if (targetType === "class" && !targetClass) {
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
    setSending(true);
    setSent(false);
    setComposeError("");
    try {
      await api.createGuardianReminder({
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetClass: targetType === "class" ? targetClass : undefined,
        targetStudentId: targetType === "student" ? targetStudent?.id : undefined,
        scheduleType,
        scheduleDate: scheduleType === "specificDate" ? scheduleDate : undefined,
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
            <Select value={targetType} onChange={(e) => setTargetType(e.target.value as GuardianReminder["targetType"])}>
              <option value="all">{t.guardianReminders.targetAll}</option>
              <option value="class">{t.guardianReminders.targetClass}</option>
              <option value="student">{t.guardianReminders.targetStudent}</option>
            </Select>
          </Field>

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
        </div>

        {targetType === "class" && (
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

        {targetType === "student" && (
          <Field label={t.guardianReminders.selectStudent}>
            <StudentPicker value={targetStudent} onSelect={setTargetStudent} />
          </Field>
        )}

        {scheduleType === "specificDate" && (
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

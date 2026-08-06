import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { SmsTransaction, SmsWallet } from "../types";

const STATUS_COLOR: Record<SmsTransaction["status"], string> = {
  pending: C.amber,
  confirmed: C.emerald,
  rejected: C.rose,
};

export function SmsSettings() {
  const { t, lang } = useLanguage();

  const [wallet, setWallet] = useState<SmsWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [amountTaka, setAmountTaka] = useState("");
  const [trxId, setTrxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .getSmsWallet()
      .then(setWallet)
      .catch((err) => setError(err instanceof Error ? err.message : t.sms.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePref = async (key: "feeDueReminder" | "resultPublished", value: boolean) => {
    if (!wallet) return;
    const prevPrefs = wallet.notificationPrefs;
    setWallet({ ...wallet, notificationPrefs: { ...prevPrefs, [key]: value } });
    setSavingPrefs(true);
    try {
      const res = await api.updateSmsNotificationPrefs({ [key]: value });
      setWallet((w) => (w ? { ...w, notificationPrefs: res.notificationPrefs } : w));
    } catch {
      setWallet((w) => (w ? { ...w, notificationPrefs: prevPrefs } : w));
    } finally {
      setSavingPrefs(false);
    }
  };

  const submitTopup = async () => {
    const amount = Number(amountTaka);
    if (!(amount > 0) || !trxId.trim()) {
      setSubmitError(t.sms.topupValidation);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.requestSmsTopup({ amountTaka: amount, trxId: trxId.trim() });
      setAmountTaka("");
      setTrxId("");
      setSubmitted(true);
      window.setTimeout(() => setSubmitted(false), 2500);
      load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t.sms.topupFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel: Record<SmsTransaction["status"], string> = {
    pending: t.sms.statusPending,
    confirmed: t.sms.statusConfirmed,
    rejected: t.sms.statusRejected,
  };
  const typeLabel: Record<SmsTransaction["type"], string> = {
    topup: t.sms.typeTopup,
    deduct: t.sms.typeDeduct,
  };

  return (
    <div>
      <h2 className="page-title">{t.sms.title}</h2>
      <p className="page-subtitle">{t.sms.subtitle}</p>

      {loading && <SkeletonCardList count={3} lines={2} />}
      {!loading && error && <div className="alert alert--rose">{error}</div>}

      {!loading && !error && wallet && (
        <>
          <Card>
            <div className="sms-balance">
              <div className="sms-balance__amount">{fmt(wallet.balanceTaka)}</div>
              <div className="sms-balance__label">{t.sms.currentBalance}</div>
              {wallet.updatedAt && (
                <div className="sms-balance__meta">
                  {t.sms.lastUpdated}: {new Date(wallet.updatedAt).toLocaleString(lang === "en" ? "en-US" : "bn-BD")}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="page-header__title">{t.sms.notificationsTitle}</h3>
            <p className="page-subtitle">{t.sms.notificationsSubtitle}</p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wallet.notificationPrefs.feeDueReminder}
                disabled={savingPrefs}
                onChange={(e) => togglePref("feeDueReminder", e.target.checked)}
              />
              {t.sms.notifyFeeDue}
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={wallet.notificationPrefs.resultPublished}
                disabled={savingPrefs}
                onChange={(e) => togglePref("resultPublished", e.target.checked)}
              />
              {t.sms.notifyResultPublished}
            </label>
          </Card>

          <Card>
            <h3 className="page-header__title">{t.sms.topupTitle}</h3>
            <p className="page-subtitle">
              {wallet.topupBkashNumber
                ? `${t.sms.topupInstructionsWithNumber} ${wallet.topupBkashNumber}`
                : t.sms.topupInstructionsNoNumber}
            </p>
            {submitError && <div className="alert alert--rose">{submitError}</div>}
            <div className="form-grid">
              <Field label={t.sms.amountLabel}>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amountTaka}
                  onChange={(e) => setAmountTaka(e.target.value)}
                  placeholder={t.sms.amountPlaceholder}
                />
              </Field>
              <Field label={t.sms.trxIdLabel}>
                <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder={t.sms.trxIdPlaceholder} />
              </Field>
            </div>
            <Button variant={submitted ? "emerald" : "sky"} solid onClick={submitTopup} disabled={submitting}>
              {submitting ? t.sms.submitting : submitted ? t.sms.submitted : t.sms.submitTopup}
            </Button>
          </Card>

          <Card>
            <h3 className="page-header__title">{t.sms.historyTitle}</h3>
            {wallet.transactions.length === 0 && <p className="page-subtitle">{t.sms.noTransactions}</p>}
            {wallet.transactions.length > 0 && (
              <div className="table-wrap table-card">
                <table className="data-table data-table--wide">
                  <thead>
                    <tr>
                      <th>{t.sms.colDate}</th>
                      <th>{t.sms.colType}</th>
                      <th>{t.sms.colAmount}</th>
                      <th>{t.sms.colReference}</th>
                      <th>{t.sms.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="sms-cell--muted">{new Date(tx.createdAt).toLocaleString(lang === "en" ? "en-US" : "bn-BD")}</td>
                        <td>{typeLabel[tx.type]}</td>
                        <td>
                          {tx.type === "deduct" ? "-" : "+"}
                          {fmt(tx.amountTaka)}
                        </td>
                        <td className="sms-cell--mono">{tx.reference}</td>
                        <td>
                          <Badge label={statusLabel[tx.status]} color={STATUS_COLOR[tx.status]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

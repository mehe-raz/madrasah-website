// ============================================================================
// InstitutionBilling.tsx — প্রতিষ্ঠান নিজে প্ল্যাটফর্মের মাসিক সাবস্ক্রিপশন
// বিল বিকাশে পরিশোধ করে (ad-hoc, docs/CURRENT_TASK.md-এ পূর্ণ লেখা আছে)।
// ============================================================================
// SmsSettings.tsx-এর গেটওয়ে-টপআপ অংশের ঠিক same create→redirect→execute-on-
// return প্যাটার্ন (Phase 8F), শুধু দিকটা উল্টো: এখানে টাকা যাচ্ছে
// প্রতিষ্ঠানের নিজের bKash থেকে প্ল্যাটফর্ম অপারেটরের bKash-এ, প্রতিষ্ঠানের
// নিজের ওয়ালেটে না। routes/institutionBilling.js শুধু multi-tenant মোডে
// 404 না দিয়ে কাজ করে — status লোড ব্যর্থ হলে (single-tenant deployment)
// একটা নিরীহ "এই ফিচার এখানে নেই" বার্তা দেখানো হয়, ক্র্যাশ না।
// ============================================================================

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { fmt } from "../lib/fmt";
import { C } from "../theme/colors";
import type { InstitutionBillingStatus } from "../types";

export function InstitutionBilling() {
  const { t, lang } = useLanguage();

  const [status, setStatus] = useState<InstitutionBillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [amount, setAmount] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  const load = () => {
    setLoading(true);
    api
      .getInstitutionBillingStatus()
      .then((res) => {
        setStatus(res);
        setUnavailable(false);
        if (res.priceAmount) setAmount(String(res.priceAmount));
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately, same reasoning as SmsSettings.tsx
    load();
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  // bKash এই পেজে ?paymentID=... দিয়ে ফিরিয়ে আনে — SmsSettings.tsx-এর
  // execute-on-return effect-এর ঠিক same reasoning: redirect query string
  // কখনো বিশ্বাস করা হয় না, শুধু paymentID একটা lookup key হিসেবে ব্যবহার
  // হয়, আসল সফল/ব্যর্থ সিদ্ধান্ত সার্ভারের bKash execute কল থেকে আসে।
  useEffect(() => {
    const paymentID = searchParams.get("paymentID") || sessionStorage.getItem("institutionBillingPaymentId");
    if (!paymentID) return;
    sessionStorage.removeItem("institutionBillingPaymentId");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("paymentID");
      return next;
    });
    api
      .executeInstitutionBillingPayment(paymentID)
      .then((res) => {
        if (!res.ok) setPayError(res.error || t.institutionBilling.payFailed);
        load();
      })
      .catch((err) => setPayError(err instanceof Error ? err.message : t.institutionBilling.payFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPayment = async () => {
    const amountValue = Number(amount);
    const periodValue = Number(periodDays);
    if (!(amountValue > 0) || !(periodValue > 0)) {
      setPayError(t.institutionBilling.validation);
      return;
    }
    setPayLoading(true);
    setPayError("");
    try {
      const { bkashURL, paymentID } = await api.createInstitutionBillingPayment(amountValue, periodValue);
      sessionStorage.setItem("institutionBillingPaymentId", paymentID);
      window.location.href = bkashURL;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : t.institutionBilling.payFailed);
      setPayLoading(false);
    }
  };

  if (unavailable) return null; // single-tenant deployment — this page simply doesn't apply, hide it rather than show an error

  return (
    <div>
      <h2 className="page-title">{t.institutionBilling.title}</h2>
      <p className="page-subtitle">{t.institutionBilling.subtitle}</p>

      {loading && <SkeletonCardList count={2} lines={2} />}

      {!loading && status && (
        <>
          <Card>
            <div className="sms-balance">
              <div className="sms-balance__label">{t.institutionBilling.currentStatus}</div>
              <div className="mt-8 mb-8">
                {status.status === "active" && <Badge label={t.institutionBilling.statusActive} color={C.emerald} />}
                {status.status === "trial" && <Badge label={t.institutionBilling.statusTrial} color={C.amber} />}
                {status.status === "suspended" && <Badge label={t.institutionBilling.statusSuspended} color={C.rose} />}
                {!status.status && <Badge label="—" color={C.slate} />}
              </div>
              {status.subscriptionEndsAt && (
                <div className="sms-balance__meta">
                  {t.institutionBilling.subscriptionEndsAt}:{" "}
                  {new Date(status.subscriptionEndsAt).toLocaleDateString(lang === "en" ? "en-US" : "bn-BD")}
                </div>
              )}
              {status.trialEndsAt && !status.subscriptionEndsAt && (
                <div className="sms-balance__meta">
                  {t.institutionBilling.trialEndsAt}:{" "}
                  {new Date(status.trialEndsAt).toLocaleDateString(lang === "en" ? "en-US" : "bn-BD")}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="page-header__title">{t.institutionBilling.payTitle}</h3>
            <p className="page-subtitle">{t.institutionBilling.paySubtitle}</p>

            {!status.platformGatewayConnected && (
              <div className="alert alert--amber">{t.institutionBilling.gatewayNotReady}</div>
            )}

            {status.platformGatewayConnected && (
              <>
                <Field label={t.institutionBilling.amountLabel}>
                  <Input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={payLoading}
                  />
                </Field>
                <Field label={t.institutionBilling.periodLabel}>
                  <Input
                    type="number"
                    min={1}
                    value={periodDays}
                    onChange={(e) => setPeriodDays(e.target.value)}
                    disabled={payLoading}
                  />
                </Field>
                {payError && <div className="alert alert--rose">{payError}</div>}
                <Button variant="emerald" solid onClick={startPayment} disabled={payLoading}>
                  {payLoading ? t.institutionBilling.redirecting : t.institutionBilling.payNow}
                </Button>
                <p className="page-subtitle mt-8">
                  {fmt(Number(amount) || 0)} — {t.institutionBilling.payNote}
                </p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

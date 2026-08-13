// docs/OWN_SIM_BULK_SMS_GATEWAY_PLAN.md, Phase 4 — গেটওয়ে-কানেক্ট সেকশন।
// প্রতিষ্ঠানের নিজের Android ফোনকে SMSGate (sms-gate.app) অ্যাপ দিয়ে একটা
// SMS গেটওয়ে হিসেবে কানেক্ট করার status card + connect form + ধাপে-ধাপে
// নির্দেশনা। PaymentGatewaySettings.tsx (bKash self-connect, Phase 8E)-এর
// ভিজ্যুয়াল প্যাটার্ন অনুসরণ করা হয়েছে — কোনো টাকা/লেনদেন এখানে নেই,
// শুধু SMS পাঠানোর জন্য ফোন-গেটওয়ে কানেক্ট করা।
//
// এই কম্পোনেন্ট এখনো কোনো রুট/নেভে ওয়্যার করা হয়নি — Phase 6-এ চূড়ান্ত
// মডিউল-গঠন সিদ্ধান্ত (একটাই BulkSms.tsx-এ কন্টাক্ট/কম্পোজ সেকশনের সাথে
// মেশানো, না এই ফাইলই আলাদা থাকবে) অনুযায়ী App.tsx/Sidebar.tsx-এ যোগ হবে।
import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { OwnSmsGatewayStatus } from "../types";

function InstructionStep({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <Card tight className="device-guide__step">
      <div className="device-guide__step-num">{number}</div>
      <div>
        <div className="device-guide__step-title">{title}</div>
        <p className="device-guide__step-body">{body}</p>
      </div>
    </Card>
  );
}

export function BulkSmsGateway() {
  const { t, lang } = useLanguage();
  const b = t.bulkSms;

  const [status, setStatus] = useState<OwnSmsGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .getOwnSmsGatewayStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : b.gatewayLoadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (!username.trim() || !password.trim()) {
      setConnectError(b.gatewayValidation);
      return;
    }
    setConnecting(true);
    setConnectError("");
    try {
      const res = await api.connectOwnSmsGateway({ username: username.trim(), password: password.trim() });
      if (!res.connected) {
        setConnectError(res.error || b.gatewayConnectFailed);
      } else {
        setUsername("");
        setPassword("");
      }
      load();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : b.gatewayConnectFailed);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectOwnSmsGateway();
      load();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">{b.gatewayTitle}</h2>
      <p className="page-subtitle">{b.gatewaySubtitle}</p>

      {loading && <SkeletonCardList count={2} lines={2} />}
      {!loading && error && <div className="alert alert--rose">{error}</div>}

      {!loading && !error && status && (
        <>
          <Card>
            <div className="sms-balance">
              <Badge
                label={status.connected ? b.gatewayStatusConnected : b.gatewayStatusNotConnected}
                color={status.connected ? C.emerald : C.rose}
              />
              {status.lastCheckedAt && (
                <div className="sms-balance__meta">
                  {b.gatewayLastChecked}: {new Date(status.lastCheckedAt).toLocaleString(lang === "en" ? "en-US" : "bn-BD")}
                </div>
              )}
              {!status.connected && status.lastError && <div className="sms-balance__meta">{status.lastError}</div>}
            </div>
            {!status.configured && <div className="alert alert--amber">{b.gatewayNotConfigured}</div>}
            {status.connected && (
              <Button variant="rose" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? b.gatewayDisconnecting : b.gatewayDisconnect}
              </Button>
            )}
          </Card>

          {!status.connected && status.configured && (
            <>
              <Card>
                <h3 className="page-header__title">{b.gatewayInstructionsTitle}</h3>
                <InstructionStep number={1} title={b.gatewayStep1Title} body={b.gatewayStep1Body} />
                <InstructionStep number={2} title={b.gatewayStep2Title} body={b.gatewayStep2Body} />
                <InstructionStep number={3} title={b.gatewayStep3Title} body={b.gatewayStep3Body} />
                <InstructionStep number={4} title={b.gatewayStep4Title} body={b.gatewayStep4Body} />
                <InstructionStep number={5} title={b.gatewayStep5Title} body={b.gatewayStep5Body} />
              </Card>

              <Card>
                <h3 className="page-header__title">{b.gatewayFormTitle}</h3>
                <p className="page-subtitle">{b.gatewayFormSubtitle}</p>
                {connectError && <div className="alert alert--rose">{connectError}</div>}
                <div className="form-grid">
                  <Field label={b.gatewayUsernameLabel}>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={b.gatewayUsernamePlaceholder} />
                  </Field>
                  <Field label={b.gatewayPasswordLabel}>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={b.gatewayPasswordPlaceholder} />
                  </Field>
                </div>
                <Button variant="sky" solid onClick={connect} disabled={connecting}>
                  {connecting ? b.gatewayConnecting : b.gatewayConnect}
                </Button>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

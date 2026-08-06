import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type { PaymentGatewayStatus } from "../types";

export function PaymentGatewaySettings() {
  const { t, lang } = useLanguage();

  const [status, setStatus] = useState<PaymentGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .getPaymentGatewayStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : t.gateway.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    if (!appKey.trim() || !appSecret.trim() || !username.trim() || !password.trim()) {
      setConnectError(t.gateway.validation);
      return;
    }
    setConnecting(true);
    setConnectError("");
    try {
      const res = await api.connectPaymentGateway({
        appKey: appKey.trim(),
        appSecret: appSecret.trim(),
        username: username.trim(),
        password: password.trim(),
      });
      if (!res.connected) {
        setConnectError(res.error || t.gateway.connectFailed);
      } else {
        setAppKey("");
        setAppSecret("");
        setUsername("");
        setPassword("");
      }
      load();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : t.gateway.connectFailed);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.disconnectPaymentGateway();
      load();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">{t.gateway.title}</h2>
      <p className="page-subtitle">{t.gateway.subtitle}</p>

      {loading && <SkeletonCardList count={2} lines={2} />}
      {!loading && error && <div className="alert alert--rose">{error}</div>}

      {!loading && !error && status && (
        <>
          <Card>
            <div className="sms-balance">
              <Badge
                label={status.connected ? t.gateway.statusConnected : t.gateway.statusNotConnected}
                color={status.connected ? C.emerald : C.rose}
              />
              {status.lastCheckedAt && (
                <div className="sms-balance__meta">
                  {t.gateway.lastChecked}: {new Date(status.lastCheckedAt).toLocaleString(lang === "en" ? "en-US" : "bn-BD")}
                </div>
              )}
              {!status.connected && status.lastError && <div className="sms-balance__meta">{status.lastError}</div>}
            </div>
            {!status.configured && <div className="alert alert--amber">{t.gateway.notConfigured}</div>}
            {status.connected && (
              <Button variant="rose" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? t.gateway.disconnecting : t.gateway.disconnect}
              </Button>
            )}
          </Card>

          {!status.connected && status.configured && (
            <Card>
              <h3 className="page-header__title">{t.gateway.formTitle}</h3>
              <p className="page-subtitle">{t.gateway.formSubtitle}</p>
              {connectError && <div className="alert alert--rose">{connectError}</div>}
              <div className="form-grid">
                <Field label={t.gateway.appKeyLabel}>
                  <Input value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder={t.gateway.appKeyPlaceholder} />
                </Field>
                <Field label={t.gateway.appSecretLabel}>
                  <Input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={t.gateway.appSecretPlaceholder} />
                </Field>
                <Field label={t.gateway.usernameLabel}>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.gateway.usernamePlaceholder} />
                </Field>
                <Field label={t.gateway.passwordLabel}>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.gateway.passwordPlaceholder} />
                </Field>
              </div>
              <Button variant="sky" solid onClick={connect} disabled={connecting}>
                {connecting ? t.gateway.connecting : t.gateway.connect}
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

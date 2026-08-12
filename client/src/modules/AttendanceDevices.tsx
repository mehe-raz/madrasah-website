// docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 1B — admin-facing
// device management UI. Wires the four endpoints already exposed by
// server/src/routes/attendanceDevices.js (Phase 2 of
// docs/ATTENDANCE_DEVICE_PLAN.md) via api.attendanceDevices (Phase 1A).
// No new backend code — this file is purely the missing frontend.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/Badge";
import { SkeletonCardList } from "../components/Skeleton";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type {
  AttendanceDevice,
  AttendanceDeviceCreateResponse,
  AttendanceDeviceProtocol,
  AttendanceDeviceSecretResponse,
} from "../types";

// docs/ATTENDANCE_DEVICE_CENTRALIZED_INGESTION_PLAN.md, Phase 1 — order
// matches the plan doc's table in section 2 (most-common first).
const PROTOCOL_OPTIONS: AttendanceDeviceProtocol[] = ["push_adms", "key_reader", "pull_sdk"];

// Shown once right after creation or a regenerate-secret call — never
// re-fetchable afterwards (the server never returns an existing secret in
// GET /, same "shown once" contract as an API key). Kept as a small local
// component rather than a shared Modal (this codebase has no generic Modal
// component yet, see ConfirmModal.tsx for the same inline pattern).
function SecretModal({
  deviceId,
  secretKey,
  onClose,
}: {
  deviceId: string;
  secretKey: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="soft-panel-strong modal-content confirm-modal__panel">
        <h3 className="confirm-modal__title">{t.attendanceDevices.secretModalTitle}</h3>
        <p className="confirm-modal__message">{t.attendanceDevices.secretModalWarning}</p>
        <div className="ds-field">
          <span className="ds-label">{t.attendanceDevices.deviceIdLabel}</span>
          <ReadonlyRow value={deviceId} />
        </div>
        <div className="ds-field ds-field--spaced">
          <span className="ds-label">{t.attendanceDevices.secretKeyLabel}</span>
          <ReadonlyRow value={secretKey} />
        </div>
        <div className="confirm-modal__actions">
          <Button variant="outline" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button variant="emerald" solid onClick={copy}>
            {copied ? t.attendanceDevices.copied : t.attendanceDevices.copy}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReadonlyRow({ value }: { value: string }) {
  return <div className="ds-readonly ds-readonly--mono">{value}</div>;
}

export function AttendanceDevices() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [protocol, setProtocol] = useState<AttendanceDeviceProtocol>("push_adms");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [busyId, setBusyId] = useState<number | null>(null);
  const [secret, setSecret] = useState<{ deviceId: string; secretKey: string } | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    api.attendanceDevices
      .list()
      .then(setDevices)
      .catch((err) => setError(err instanceof Error ? err.message : t.attendanceDevices.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() intentionally sets loading=true immediately so the page shows a loading state right away; the rest of its state updates land after the request resolves
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!deviceId.trim()) {
      setCreateError(t.attendanceDevices.deviceIdRequired);
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res: AttendanceDeviceCreateResponse = await api.attendanceDevices.create({
        deviceId: deviceId.trim(),
        name: name.trim() || undefined,
        location: location.trim() || undefined,
        protocol,
      });
      setSecret({ deviceId: res.deviceId, secretKey: res.secretKey });
      setDeviceId("");
      setName("");
      setLocation("");
      setProtocol("push_adms");
      load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t.attendanceDevices.createFailed);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (device: AttendanceDevice) => {
    setBusyId(device.id);
    try {
      await api.attendanceDevices.update(device.id, { active: !device.active });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const regenerate = async (device: AttendanceDevice) => {
    if (!window.confirm(t.attendanceDevices.regenerateConfirm)) return;
    setBusyId(device.id);
    try {
      const res: AttendanceDeviceSecretResponse = await api.attendanceDevices.regenerateSecret(device.id);
      setSecret({ deviceId: res.deviceId, secretKey: res.secretKey });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{t.attendanceDevices.title}</h2>
          <p className="page-subtitle">{t.attendanceDevices.subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/attendance-devices/guide")}>
          {t.attendanceDevices.guideLink}
        </Button>
      </div>

      <Card className="class-post-form">
        <h3 className="page-header__title">{t.attendanceDevices.formTitle}</h3>
        {createError && <div className="alert alert--rose">{createError}</div>}
        <div className="form-grid">
          <Field label={t.attendanceDevices.deviceIdLabel}>
            <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder={t.attendanceDevices.deviceIdPlaceholder} />
          </Field>
          <Field label={t.attendanceDevices.nameLabel}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.attendanceDevices.namePlaceholder} />
          </Field>
          <Field label={t.attendanceDevices.locationLabel}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t.attendanceDevices.locationPlaceholder} />
          </Field>
          <Field label={t.attendanceDevices.protocolLabel}>
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value as AttendanceDeviceProtocol)}>
              {PROTOCOL_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {t.attendanceDevices.protocolLabels[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="sky" solid onClick={create} disabled={creating}>
          {creating ? t.attendanceDevices.creating : t.attendanceDevices.create}
        </Button>
      </Card>

      <Card>
        <h3 className="page-header__title">{t.attendanceDevices.listTitle}</h3>

        {loading && <SkeletonCardList count={2} lines={2} />}
        {!loading && error && <div className="alert alert--rose">{error}</div>}
        {!loading && !error && devices.length === 0 && <p className="page-subtitle">{t.attendanceDevices.noDevices}</p>}

        {!loading &&
          !error &&
          devices.map((d) => (
            <Card key={d.id} tight className="class-post">
              <div className="class-post__head">
                <Badge label={d.active ? t.attendanceDevices.active : t.attendanceDevices.inactive} color={d.active ? C.emerald : C.slate} />
                <Badge label={t.attendanceDevices.protocolLabels[d.protocol]} color={C.sky} />
                <span className="class-post__meta">{d.deviceId}</span>
              </div>
              <div className="class-post__title">{d.name || t.attendanceDevices.unnamed}</div>
              {d.location && <div className="class-post__meta">{d.location}</div>}
              <div className="class-post__actions">
                <Button variant={d.active ? "outline" : "emerald"} disabled={busyId === d.id} onClick={() => toggleActive(d)}>
                  {d.active ? t.attendanceDevices.deactivate : t.attendanceDevices.activate}
                </Button>
                <Button variant="amber" disabled={busyId === d.id} onClick={() => regenerate(d)}>
                  {t.attendanceDevices.regenerateSecret}
                </Button>
              </div>
            </Card>
          ))}
      </Card>

      {secret && (
        <SecretModal deviceId={secret.deviceId} secretKey={secret.secretKey} onClose={() => setSecret(null)} />
      )}
    </div>
  );
}

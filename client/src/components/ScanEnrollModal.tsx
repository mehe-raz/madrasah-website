// docs/ATTENDANCE_DEVICE_SELFSERVICE_PLAN.md, Phase 2C — "স্ক্যান করে বসান"
// button used next to Students.tsx's fingerprintId/cardUid inputs (Phase
// 2B). Self-contained: renders its own trigger button + modal, so the
// caller only needs `<ScanEnrollButton onCaptured={(v) => setField(...)} />`.
// Polls the staff-only GET /attendance-devices/:id/latest-scan (Phase 2C
// backend) every 2s while waiting — same cadence as the kiosk's public
// polling in pages/kiosk/Kiosk.tsx, but this one is authenticated and
// returns the raw scan identifier instead of matched-student info.
import { useEffect, useRef, useState } from "react";
import { HudSpinner } from "./HudSpinner";
import { Button, Select } from "./ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import type { AttendanceDevice } from "../types";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 30_000;

type Status = "idle" | "loadingDevices" | "waiting" | "timeout";

export function ScanEnrollButton({ onCaptured }: { onCaptured: (identifier: string) => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [deviceId, setDeviceId] = useState<number | "">("");
  const [status, setStatus] = useState<Status>("idle");
  // Scans at/before this instant are ignored — otherwise an old scan
  // already sitting in attendance_logs from before the modal opened would
  // get captured immediately instead of waiting for a fresh one.
  const sinceRef = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    api.attendanceDevices
      .list()
      .then((list) => {
        setDevices(list.filter((d) => d.active));
        setStatus("idle");
      })
      .catch(() => {
        setDevices([]);
        setStatus("idle");
      });
  }, [open]);

  useEffect(() => {
    if (status !== "waiting" || !deviceId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const res = await api.attendanceDevices.getLatestScan(Number(deviceId));
        if (cancelled) return;
        if (res.punchAt && res.identifier && res.punchAt > sinceRef.current) {
          onCaptured(res.identifier);
          setOpen(false);
          return;
        }
      } catch {
        // Transient network error — keep polling until the 30s timeout
        // below rather than aborting on the first failed request.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setStatus("timeout");
        return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCaptured is a setField closure from the parent form; including it would restart polling on every keystroke elsewhere in the form
  }, [status, deviceId]);

  const start = () => {
    sinceRef.current = new Date().toISOString();
    setStatus("waiting");
  };

  const openModal = () => {
    setStatus("loadingDevices");
    setDeviceId("");
    setOpen(true);
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={openModal}>
        {t.attendanceDevices.scanToFill}
      </Button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" onClick={() => setOpen(false)} className="modal-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="soft-panel-strong modal-content confirm-modal__panel">
        <h3 className="confirm-modal__title">{t.attendanceDevices.scanModalTitle}</h3>

        {(status === "idle" || status === "loadingDevices") && (
          <>
            <div className="ds-field">
              <span className="ds-label">{t.attendanceDevices.deviceIdLabel}</span>
              <Select
                value={String(deviceId)}
                onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : "")}
                disabled={status === "loadingDevices"}
              >
                <option value="">{t.common.select}</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.deviceId}
                  </option>
                ))}
              </Select>
            </div>
            {status === "idle" && devices.length === 0 && (
              <p className="confirm-modal__message">{t.attendanceDevices.scanNoDevices}</p>
            )}
            <div className="confirm-modal__actions">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button variant="sky" solid disabled={!deviceId} onClick={start}>
                {t.attendanceDevices.scanStart}
              </Button>
            </div>
          </>
        )}

        {status === "waiting" && (
          <>
            <p className="confirm-modal__message">{t.attendanceDevices.scanWaiting}</p>
            <HudSpinner size={40} />
            <div className="confirm-modal__actions">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
            </div>
          </>
        )}

        {status === "timeout" && (
          <>
            <p className="confirm-modal__message">{t.attendanceDevices.scanTimeout}</p>
            <div className="confirm-modal__actions">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t.common.close}
              </Button>
              <Button variant="sky" solid onClick={start}>
                {t.attendanceDevices.scanRetry}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

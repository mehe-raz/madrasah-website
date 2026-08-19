// docs/CCTV_INTEGRATION_PLAN.md, Phase 6 — admin-facing camera bridge +
// camera management UI. Wires routes/cameras.js (Phase 2) via api.cameras.
// Phase 7 adds a live-view grid at the top using CameraFeed (hls.js).

import { useEffect, useState } from "react";
import { CameraFeed } from "../components/CameraFeed";
import { SkeletonCardList } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { Button, Card, Field, Input } from "../components/ui";
import { useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { C } from "../theme/colors";
import type {
  Camera,
  CameraBridge,
  CameraBridgeCreateResponse,
  CameraBridgeRegenResponse,
  CameraEvent,
} from "../types";

// ── Secret modal ──────────────────────────────────────────────────────────────
// Shown exactly once after bridge creation or a regen-key call. Same pattern
// as AttendanceDevices.tsx's SecretModal.

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
  const c = t.cameras;
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
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="modal-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="soft-panel-strong modal-content confirm-modal__panel"
      >
        <h3 className="confirm-modal__title">{c.secretModalTitle}</h3>
        <p className="confirm-modal__message">{c.secretModalWarning}</p>
        <div className="ds-field">
          <span className="ds-label">{c.bridgeIdLabel}</span>
          <div className="ds-readonly ds-readonly--mono">{deviceId}</div>
        </div>
        <div className="ds-field ds-field--spaced">
          <span className="ds-label">{c.secretKeyLabel}</span>
          <div className="ds-readonly ds-readonly--mono">{secretKey}</div>
        </div>
        <div className="device-guide__note">{c.secretModalNote}</div>
        <div className="confirm-modal__actions">
          <Button variant="outline" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button variant="emerald" solid onClick={copy}>
            {copied ? c.copied : c.copy}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Bridge section ────────────────────────────────────────────────────────────

function BridgesSection({
  t,
  bridges,
  loadingBridges,
  errorBridges,
  onReload,
  onSecret,
}: {
  t: ReturnType<typeof useLanguage>["t"];
  bridges: CameraBridge[];
  loadingBridges: boolean;
  errorBridges: string;
  onReload: () => void;
  onSecret: (deviceId: string, secretKey: string) => void;
}) {
  const c = t.cameras;

  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editTunnelUrl, setEditTunnelUrl] = useState("");

  const createBridge = async () => {
    if (!deviceId.trim()) {
      setCreateError(c.bridgeIdRequired);
      return;
    }
    if (!name.trim()) {
      setCreateError(c.nameRequired);
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res: CameraBridgeCreateResponse = await api.cameras.createBridge({
        deviceId: deviceId.trim(),
        name: name.trim(),
        location: location.trim() || undefined,
        tunnelUrl: tunnelUrl.trim() || undefined,
      });
      onSecret(res.deviceId, res.secretKey);
      setDeviceId("");
      setName("");
      setLocation("");
      setTunnelUrl("");
      onReload();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : c.createFailed
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (bridge: CameraBridge) => {
    setBusyId(bridge.id);
    try {
      await api.cameras.updateBridge(bridge.id, { active: !bridge.active });
      onReload();
    } finally {
      setBusyId(null);
    }
  };

  const regenKey = async (bridge: CameraBridge) => {
    if (!window.confirm(c.regenConfirm)) return;
    setBusyId(bridge.id);
    try {
      const res: CameraBridgeRegenResponse = await api.cameras.regenBridgeKey(bridge.id);
      onSecret(res.deviceId, res.secretKey);
    } finally {
      setBusyId(null);
    }
  };

  const saveTunnelUrl = async (bridge: CameraBridge) => {
    setBusyId(bridge.id);
    try {
      await api.cameras.updateBridge(bridge.id, {
        tunnelUrl: editTunnelUrl.trim(),
      });
      setEditId(null);
      onReload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Card className="class-post-form">
        <h3 className="page-header__title">{c.bridgeFormTitle}</h3>
        {createError && (
          <div className="alert alert--rose">{createError}</div>
        )}
        <div className="form-grid">
          <Field label={c.bridgeIdLabel}>
            <Input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder={c.bridgeIdPlaceholder}
            />
          </Field>
          <Field label={c.nameLabel}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.namePlaceholder}
            />
          </Field>
          <Field label={c.locationLabel}>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={c.locationPlaceholder}
            />
          </Field>
          <Field label={c.tunnelUrlLabel}>
            <Input
              value={tunnelUrl}
              onChange={(e) => setTunnelUrl(e.target.value)}
              placeholder={c.tunnelUrlPlaceholder}
            />
          </Field>
        </div>
        <Button variant="sky" solid onClick={createBridge} disabled={creating}>
          {creating ? c.creating : c.createBridge}
        </Button>
      </Card>

      <Card>
        <h3 className="page-header__title">{c.bridgeListTitle}</h3>
        {loadingBridges && <SkeletonCardList count={2} lines={2} />}
        {!loadingBridges && errorBridges && (
          <div className="alert alert--rose">{errorBridges}</div>
        )}
        {!loadingBridges && !errorBridges && bridges.length === 0 && (
          <p className="page-subtitle">{c.noBridges}</p>
        )}
        {!loadingBridges &&
          !errorBridges &&
          bridges.map((b) => (
            <Card key={b.id} tight className="class-post">
              <div className="class-post__head">
                <Badge
                  label={b.active ? c.active : c.inactive}
                  color={b.active ? C.emerald : C.slate}
                />
                <span className="class-post__meta">{b.deviceId}</span>
              </div>
              <div className="class-post__title">{b.name}</div>
              {b.location && (
                <div className="class-post__meta">{b.location}</div>
              )}
              {editId === b.id ? (
                <div className="form-grid mt-18">
                  <Field label={c.tunnelUrlLabel}>
                    <Input
                      value={editTunnelUrl}
                      onChange={(e) => setEditTunnelUrl(e.target.value)}
                      placeholder={c.tunnelUrlPlaceholder}
                    />
                  </Field>
                </div>
              ) : (
                b.tunnelUrl && (
                  <div className="class-post__meta ds-readonly--mono">
                    {b.tunnelUrl}
                  </div>
                )
              )}
              <div className="class-post__actions">
                {editId === b.id ? (
                  <>
                    <Button
                      variant="emerald"
                      disabled={busyId === b.id}
                      onClick={() => saveTunnelUrl(b)}
                    >
                      {t.common.save}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditId(null)}
                    >
                      {t.common.cancel}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={busyId === b.id}
                      onClick={() => {
                        setEditId(b.id);
                        setEditTunnelUrl(b.tunnelUrl || "");
                      }}
                    >
                      {c.editTunnelUrl}
                    </Button>
                    <Button
                      variant={b.active ? "outline" : "emerald"}
                      disabled={busyId === b.id}
                      onClick={() => toggleActive(b)}
                    >
                      {b.active ? c.deactivate : c.activate}
                    </Button>
                    <Button
                      variant="amber"
                      disabled={busyId === b.id}
                      onClick={() => regenKey(b)}
                    >
                      {c.regenKey}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
      </Card>
    </>
  );
}

// ── Camera section ────────────────────────────────────────────────────────────

function CamerasSection({
  t,
  cameras,
  bridges,
  loadingCameras,
  errorCameras,
  onReload,
}: {
  t: ReturnType<typeof useLanguage>["t"];
  cameras: Camera[];
  bridges: CameraBridge[];
  loadingCameras: boolean;
  errorCameras: string;
  onReload: () => void;
}) {
  const c = t.cameras;

  const activeBridges = bridges.filter((b) => b.active);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [bridgeDeviceId, setBridgeDeviceId] = useState("");

  // Derive the active selection without a setState-in-effect pattern:
  // if the user hasn't picked a bridge yet, fall back to the first active one.
  const effectiveBridgeId = bridgeDeviceId || activeBridges[0]?.deviceId || "";

  const [streamPath, setStreamPath] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const createCamera = async () => {
    if (!name.trim()) {
      setCreateError(c.nameRequired);
      return;
    }
    if (!effectiveBridgeId) {
      setCreateError(c.bridgeRequired);
      return;
    }
    if (!streamPath.trim()) {
      setCreateError(c.streamPathRequired);
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await api.cameras.create({
        name: name.trim(),
        location: location.trim() || undefined,
        bridgeDeviceId: effectiveBridgeId,
        streamPath: streamPath.trim(),
      });
      setName("");
      setLocation("");
      setStreamPath("");
      onReload();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : c.createFailed
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (cam: Camera) => {
    setBusyId(cam.id);
    try {
      await api.cameras.update(cam.id, { active: !cam.active });
      onReload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Card className="class-post-form">
        <h3 className="page-header__title">{c.cameraFormTitle}</h3>
        {activeBridges.length === 0 && (
          <div className="alert alert--amber">{c.noBridgesForCamera}</div>
        )}
        {createError && (
          <div className="alert alert--rose">{createError}</div>
        )}
        <div className="form-grid">
          <Field label={c.nameLabel}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.cameraNamePlaceholder}
            />
          </Field>
          <Field label={c.locationLabel}>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={c.locationPlaceholder}
            />
          </Field>
          <Field label={c.bridgeLabel}>
            <select
              className="ds-select"
              value={effectiveBridgeId}
              onChange={(e) => setBridgeDeviceId(e.target.value)}
              disabled={activeBridges.length === 0}
            >
              <option value="">{c.selectBridge}</option>
              {activeBridges.map((b) => (
                <option key={b.deviceId} value={b.deviceId}>
                  {b.name} ({b.deviceId})
                </option>
              ))}
            </select>
          </Field>
          <Field label={c.streamPathLabel}>
            <Input
              value={streamPath}
              onChange={(e) => setStreamPath(e.target.value)}
              placeholder={c.streamPathPlaceholder}
            />
          </Field>
        </div>
        <Button
          variant="sky"
          solid
          onClick={createCamera}
          disabled={creating || activeBridges.length === 0}
        >
          {creating ? c.creating : c.createCamera}
        </Button>
      </Card>

      <Card>
        <h3 className="page-header__title">{c.cameraListTitle}</h3>
        {loadingCameras && <SkeletonCardList count={2} lines={2} />}
        {!loadingCameras && errorCameras && (
          <div className="alert alert--rose">{errorCameras}</div>
        )}
        {!loadingCameras && !errorCameras && cameras.length === 0 && (
          <p className="page-subtitle">{c.noCameras}</p>
        )}
        {!loadingCameras &&
          !errorCameras &&
          cameras.map((cam) => (
            <Card key={cam.id} tight className="class-post">
              <div className="class-post__head">
                <Badge
                  label={cam.active ? c.active : c.inactive}
                  color={cam.active ? C.emerald : C.slate}
                />
                <span className="class-post__meta">{cam.bridgeDeviceId}</span>
              </div>
              <div className="class-post__title">{cam.name}</div>
              {cam.location && (
                <div className="class-post__meta">{cam.location}</div>
              )}
              <div className="class-post__meta ds-readonly--mono">
                {c.streamPathLabel}: {cam.streamPath}
              </div>
              <div className="class-post__actions">
                <Button
                  variant={cam.active ? "outline" : "emerald"}
                  disabled={busyId === cam.id}
                  onClick={() => toggleActive(cam)}
                >
                  {cam.active ? c.deactivate : c.activate}
                </Button>
              </div>
            </Card>
          ))}
      </Card>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────


// ── EventsSection ─────────────────────────────────────────────────────────────
// Phase 8: detection event timeline with per-event acknowledge button.
// Shows newest events first (server returns them that way).
// Filtering: all cameras vs single camera dropdown + unacknowledged-only toggle.

function EventTypeTag({ type, c }: { type: CameraEvent["type"]; c: ReturnType<typeof useLanguage>["t"]["cameras"] }) {
  const label = type === "human" ? c.typeHuman : type === "vehicle" ? c.typeVehicle : c.typeMotion;
  const color =
    type === "human"
      ? "#ef4444"   // red — person
      : type === "vehicle"
      ? "#f97316"   // orange — vehicle
      : "#6b7280";  // grey — motion
  return (
    <span
      className="event-type-tag"
      // eslint-disable-next-line no-restricted-syntax -- color is runtime-computed from event type
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

function EventsSection({
  t,
  cameras,
}: {
  t: ReturnType<typeof useLanguage>["t"];
  cameras: Camera[];
}) {
  const c = t.cameras;
  const [events, setEvents] = useState<CameraEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);
  const [filterCameraId, setFilterCameraId] = useState<number | undefined>(undefined);
  const [ackingId, setAckingId] = useState<number | null>(null);

  const loadEvents = (unackOnly = unacknowledgedOnly, camId = filterCameraId) => {
    setLoading(true);
    setError("");
    api.cameras
      .listEvents({ unacknowledgedOnly: unackOnly, cameraId: camId, limit: 100 })
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : c.eventsLoadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) resets spinner at start of each fetch; initial state is already true so no cascading-render on mount
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAcknowledge = async (id: number) => {
    setAckingId(id);
    try {
      const updated = await api.cameras.acknowledgeEvent(id);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch {
      alert(c.acknowledgeFailed);
    } finally {
      setAckingId(null);
    }
  };

  const handleFilterChange = (camId: number | undefined, unackOnly: boolean) => {
    setFilterCameraId(camId);
    setUnacknowledgedOnly(unackOnly);
    loadEvents(unackOnly, camId);
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <Card>
      {/* Filter bar */}
      <div className="events-filter-bar">
        <select
          className="events-filter-select"
          value={filterCameraId ?? ""}
          onChange={(e) =>
            handleFilterChange(e.target.value ? Number(e.target.value) : undefined, unacknowledgedOnly)
          }
        >
          <option value="">{c.filterAllCameras}</option>
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.name}
            </option>
          ))}
        </select>

        <label className="events-filter-toggle">
          <input
            type="checkbox"
            checked={unacknowledgedOnly}
            onChange={(e) => handleFilterChange(filterCameraId, e.target.checked)}
          />
          <span>{c.eventsUnacknowledgedOnly}</span>
        </label>

        <Button
          variant="outline"
          onClick={() => loadEvents()}
        >
          {c.eventsRefresh}
        </Button>
      </div>

      {/* Timeline */}
      {loading && <SkeletonCardList count={4} />}
      {!loading && error && <p className="error-text">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="muted-text">{c.eventsEmpty}</p>
      )}
      {!loading && !error && events.length > 0 && (
        <ul className="event-timeline">
          {events.map((ev) => (
            <li
              key={ev.id}
              className={`event-timeline__item${ev.acknowledged ? " event-timeline__item--acked" : ""}`}
            >
              <div className="event-timeline__left">
                <EventTypeTag type={ev.type} c={c} />
                <div className="event-timeline__meta">
                  <span className="event-timeline__camera">
                    {ev.cameraName ?? "—"}
                    {ev.cameraLocation ? ` · ${ev.cameraLocation}` : ""}
                  </span>
                  <span className="event-timeline__time">{formatTime(ev.detectedAt)}</span>
                </div>
              </div>
              <div className="event-timeline__right">
                {ev.clipPath && (
                  <a
                    href={ev.clipPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="event-timeline__clip-link"
                  >
                    {c.clipAvailable}
                  </a>
                )}
                {ev.acknowledged ? (
                  <span className="event-timeline__acked-badge">{c.acknowledged}</span>
                ) : (
                  <Button
                    variant="outline"
                    disabled={ackingId === ev.id}
                    onClick={() => handleAcknowledge(ev.id)}
                  >
                    {c.acknowledge}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Cameras() {
  const { t } = useLanguage();
  const c = t.cameras;

  const [bridges, setBridges] = useState<CameraBridge[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loadingBridges, setLoadingBridges] = useState(true);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [errorBridges, setErrorBridges] = useState("");
  const [errorCameras, setErrorCameras] = useState("");
  const [secret, setSecret] = useState<{
    deviceId: string;
    secretKey: string;
  } | null>(null);

  const loadBridges = () => {
    setLoadingBridges(true);
    setErrorBridges("");
    api.cameras
      .listBridges()
      .then(setBridges)
      .catch((err) =>
        setErrorBridges(err instanceof Error ? err.message : c.loadFailed)
      )
      .finally(() => setLoadingBridges(false));
  };

  const loadCameras = () => {
    setLoadingCameras(true);
    setErrorCameras("");
    api.cameras
      .list()
      .then(setCameras)
      .catch((err) =>
        setErrorCameras(err instanceof Error ? err.message : c.loadFailed)
      )
      .finally(() => setLoadingCameras(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadBridges/loadCameras each set loading=true synchronously then resolve async; spinners are already shown via initial state (useState(true)), so no cascading-render concern
    loadBridges();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- same rationale as above
    loadCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => {
    loadBridges();
    loadCameras();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{c.title}</h2>
          <p className="page-subtitle">{c.subtitle}</p>
        </div>
      </div>

      {/* ── Phase 7: Live-view grid ── */}
      {cameras.length > 0 && (
        <>
          <h3 className="section-heading mt-18">{c.liveViewTitle}</h3>
          <div className="camera-grid">
            {cameras.map((cam) => (
              <CameraFeed
                key={cam.id}
                cameraId={cam.id}
                name={cam.name}
                location={cam.location}
                active={cam.active}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Bridge management ── */}
      <h3 className="section-heading mt-18">{c.bridgeSectionTitle}</h3>
      <BridgesSection
        t={t}
        bridges={bridges}
        loadingBridges={loadingBridges}
        errorBridges={errorBridges}
        onReload={reload}
        onSecret={(deviceId, secretKey) => setSecret({ deviceId, secretKey })}
      />

      {/* ── Camera management ── */}
      <h3 className="section-heading mt-18">{c.cameraSectionTitle}</h3>
      <CamerasSection
        t={t}
        cameras={cameras}
        bridges={bridges}
        loadingCameras={loadingCameras}
        errorCameras={errorCameras}
        onReload={reload}
      />

      {/* ── Phase 8: Event timeline ── */}
      <h3 className="section-heading mt-18">{c.eventsSectionTitle}</h3>
      <p className="page-subtitle">{c.eventsSubtitle}</p>
      <EventsSection t={t} cameras={cameras} />

      {secret && (
        <SecretModal
          deviceId={secret.deviceId}
          secretKey={secret.secretKey}
          onClose={() => setSecret(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { HudSpinner } from "../components/HudSpinner";
import { SkeletonRows } from "../components/Skeleton";
import { Button, Input, Select } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { api } from "../lib/api";
import { canBackup, canManageUsers } from "../lib/permissions";
import { USER_ROLES, type BackupConfig, type GoogleDriveFile, type GoogleDriveStatus, type Settings as SettingsType, type User } from "../types";

// Formats a byte count like "1.2 MB" the way the Drive backup list shows it.
function formatFileSize(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="field-block__label">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Per-role accent color, applied as a background tint on the user list row
// and its status dot below — real per-instance data (which role each user
// has), not a fixed design-system value, so it stays a JS lookup rather
// than a CSS class. See AGENTS.md "Design System (mandatory)".
const ROLE_COLORS: Record<string, string> = {
  "Super Admin": "#6d28d9", // C.violet
  Admin: "#0f766e", // C.teal
  Accountant: "#10b981", // C.emerald
  Teacher: "#b45309", // C.amber
  "Hostel Manager": "#fb7185", // C.rose
};

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div className={`settings-section-head ${open ? "" : "settings-section-head--collapsed"}`}>
      <h3 className="settings-section-title">{title}</h3>
      <button type="button" onClick={onToggle} title={open ? "Close edit" : "Edit"} className="icon-btn">
        ...
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <div className="info-row__label">{label}</div>
      <div className="info-row__value">{value || "-"}</div>
    </div>
  );
}

export function Settings() {
  const { user: authUser } = useAuth();
  const { settings, setSettings, saveSettings, users, refreshUsers } = useAppSettings();
  const { t } = useLanguage();
  const [saved, setSaved] = useState(false);
  const [userForm, setUserForm] = useState({ name: "", role: "Teacher", email: "", password: "" });
  const [editDraft, setEditDraft] = useState<User | null>(null);
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[] | null>(null);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [restoringFileId, setRestoringFileId] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    source: { kind: "file"; file: File } | { kind: "drive"; file: GoogleDriveFile };
    exportedAt: string | null;
    backupCounts: Record<string, number>;
    currentCounts: Record<string, number>;
  } | null>(null);
  const [restorePreviewLoading, setRestorePreviewLoading] = useState(false);
  const [restoreConfirming, setRestoreConfirming] = useState(false);
  const [msg, setMsg] = useState("");
  const [editInfo, setEditInfo] = useState(false);
  const [editSystem, setEditSystem] = useState(false);
  const [editBackup, setEditBackup] = useState(false);
  const [editUsers, setEditUsers] = useState(false);
  const manageUsers = authUser ? canManageUsers(authUser.role) : false;
  const allowBackup = authUser ? canBackup(authUser.role) : false;

  const update = (k: keyof SettingsType, v: string) => {
    setSettings({ ...settings, [k]: v });
    setSaved(false);
  };

  const refreshDriveStatus = () => api.getGoogleDriveStatus().then(setDriveStatus).catch(() => {});

  const refreshDriveFiles = () => {
    setDriveFilesLoading(true);
    api
      .listGoogleDriveFiles()
      .then(setDriveFiles)
      .catch(() => setDriveFiles([]))
      .finally(() => setDriveFilesLoading(false));
  };

  useEffect(() => {
    if (allowBackup && editBackup) {
      api.getBackupConfig().then(setBackupConfig).catch(() => {});
      refreshDriveStatus();
    }
  }, [allowBackup, editBackup]);

  // Once we know Drive is connected, pull the list of backup files sitting
  // in the app's Drive folder so they can be restored with one click.
  useEffect(() => {
    if (manageUsers && editUsers && !users.length) {
      refreshUsers();
    }
  }, [manageUsers, editUsers, users.length, refreshUsers]);

  useEffect(() => {
    if (driveStatus?.connected) refreshDriveFiles();
  }, [driveStatus?.connected]);

  // After the Google OAuth redirect (routes/backup.js `/google/callback`) sends the
  // browser back to /settings?googleDrive=connected|error, show the result and
  // refresh. If this page is running inside the popup opened by handleConnectDrive,
  // close it so the user lands back on the original tab automatically.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("googleDrive");
    if (!result) return;
    if (result === "connected") {
      setMsg(t.settings.googleDriveConnectedMsg);
      refreshDriveStatus();
    } else if (result === "error") {
      setMsg(params.get("message") || t.settings.googleDriveConnectFailed);
    }
    window.history.replaceState({}, "", window.location.pathname);
    if (window.opener) {
      window.setTimeout(() => window.close(), 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
      setMsg("");
    } catch (e) {
      setSaved(false);
      setMsg(e instanceof Error ? e.message : "Settings could not be saved. Please try again.");
    }
  };

  const handleLogo = (file: File | null) => {
    if (!file) return;
    if (file.size > 500_000) {
      setMsg("Logo max 500KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { url } = await api.uploadFile(String(reader.result), "settings");
        update("logo", url);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Logo upload failed");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBackup = async () => {
    try {
      await api.downloadBackup();
      setMsg("Backup downloaded");
    } catch {
      setMsg("Backup failed");
    }
  };

  const saveBackupConfig = async () => {
    if (!backupConfig) return;
    try {
      const savedConfig = await api.saveBackupConfig(backupConfig);
      setBackupConfig(savedConfig);
      setMsg("Backup settings saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Backup settings failed");
    }
  };

  const runBackupNow = async () => {
    try {
      const result = await api.runBackupNow();
      setBackupConfig(result.config);
      setMsg("Backup created");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Backup failed");
    }
  };

  const handleConnectDrive = async () => {
    if (authUser?.role !== "Super Admin") {
      setMsg(t.settings.googleDriveOnlySuperAdmin);
      return;
    }
    setDriveConnecting(true);
    try {
      const { url } = await api.getGoogleDriveAuthUrl();
      const popup = window.open(url, "googleDriveAuth", "width=520,height=650");
      if (!popup) {
        setMsg(t.settings.googleDriveConnectFailed);
        setDriveConnecting(false);
        return;
      }
      const poll = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll);
          setDriveConnecting(false);
          refreshDriveStatus();
        }
      }, 800);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t.settings.googleDriveConnectFailed);
      setDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    if (authUser?.role !== "Super Admin") {
      setMsg(t.settings.googleDriveOnlySuperAdmin);
      return;
    }
    if (!confirm(t.settings.googleDriveDisconnectConfirm)) return;
    try {
      const status = await api.disconnectGoogleDrive();
      setDriveStatus(status);
      setMsg(t.settings.googleDriveDisconnectedMsg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  // Step 1 of restore: load a preview (row counts, no DB changes yet) so the
  // Super Admin can see exactly what will be replaced before confirming.
  const handleRestore = async (file: File | null) => {
    if (!file) return;
    if (authUser?.role !== "Super Admin") {
      setMsg("Only Super Admin can restore backup");
      return;
    }
    setRestorePreviewLoading(true);
    setMsg("");
    try {
      const preview = await api.previewBackup(file);
      setRestorePreview({ source: { kind: "file", file }, ...preview });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read backup file");
    } finally {
      setRestorePreviewLoading(false);
    }
  };

  const handleRestoreFromDrive = async (file: GoogleDriveFile) => {
    if (authUser?.role !== "Super Admin") {
      setMsg("Only Super Admin can restore backup");
      return;
    }
    setRestoringFileId(file.id);
    setRestorePreviewLoading(true);
    setMsg("");
    try {
      const preview = await api.previewGoogleDriveBackup(file.id);
      setRestorePreview({ source: { kind: "drive", file }, ...preview });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not read backup file");
    } finally {
      setRestorePreviewLoading(false);
      setRestoringFileId(null);
    }
  };

  // Step 2: the Super Admin has seen the row-count comparison and confirmed.
  const handleConfirmRestore = async () => {
    if (!restorePreview) return;
    setRestoreConfirming(true);
    try {
      if (restorePreview.source.kind === "file") {
        await api.restoreBackup(restorePreview.source.file);
      } else {
        await api.restoreFromGoogleDrive(restorePreview.source.file.id);
      }
      setMsg("Backup restored successfully. Refresh the page (and log in again if needed) to see the restored data.");
      setRestorePreview(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoreConfirming(false);
    }
  };

  const handleCancelRestore = () => setRestorePreview(null);

  const handleAddUser = async () => {
    if (!manageUsers || !userForm.name.trim() || !userForm.email || !userForm.password) return;
    try {
      await api.createUser(userForm);
      await refreshUsers();
      setUserForm({ name: "", role: "Teacher", email: "", password: "" });
      setMsg("User added");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleUpdateUser = async () => {
    if (!editDraft || !manageUsers) return;
    try {
      const body: { name?: string; role?: string; email?: string; password?: string } = {
        name: editDraft.name,
        role: editDraft.role,
        email: editDraft.email,
      };
      if ((editDraft as User & { newPassword?: string }).newPassword) {
        body.password = (editDraft as User & { newPassword?: string }).newPassword;
      }
      const result = await api.updateUser(editDraft.id, body);
      await refreshUsers();
      setEditDraft(null);
      setMsg("pendingApproval" in result && result.pendingApproval ? "Permission request sent for approval" : "User updated");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const canEditUser = () => manageUsers && editUsers;

  const canDeleteUser = (u: User) => {
    if (!manageUsers || !editUsers || authUser?.id === u.id) return false;
    if (u.isProtected && authUser?.role !== "Super Admin") return false;
    return true;
  };

  const handleDeleteUser = async (u: User) => {
    if (!canDeleteUser(u)) return;
    if (!confirm("Delete this user?")) return;
    try {
      const result = await api.deleteUser(u.id);
      await refreshUsers();
      setMsg(result.pendingApproval ? "Permission request sent for approval" : "User deleted");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Cannot delete");
    }
  };

  return (
    <div>
      <h2 className="page-header__title mb-24">{t.settings.title}</h2>
      {msg && <p className="msg-line">{msg}</p>}

      <div className="settings-grid">
        <div className="settings-col">
          <div className="settings-card">
            <SectionHeader title={t.settings.madrasaInfo} open={editInfo} onToggle={() => setEditInfo((v) => !v)} />
            {!editInfo && (
              <div>
                <InfoRow label={t.settings.name} value={settings.name} />
                <InfoRow label={t.settings.address} value={settings.address} />
                <InfoRow label={t.settings.phone} value={settings.phone} />
                <InfoRow label={t.settings.email} value={settings.email} />
                <InfoRow label={t.settings.footer} value={settings.footer} />
                <div className="info-row">
                  <div className="info-row__label mb-6">{t.settings.brandColor}</div>
                  <div className="row row--gap-8">
                    {/* Swatch color is the institution's own chosen brand color
                        (settings.brandColor) — real per-instance data, can't be a
                        static class. Documented exception, see AGENTS.md. */}
                    {/* eslint-disable-next-line no-restricted-syntax -- dynamic user-chosen brand color */}
                    <span className="brand-swatch" style={{ background: settings.brandColor || "#0ea5e9" }} />
                    <span className="info-row__value">{settings.brandColor || "#0ea5e9"}</span>
                  </div>
                </div>
                {settings.logo && <img src={settings.logo} alt="Logo" loading="lazy" decoding="async" className="logo-preview mt-12" />}
              </div>
            )}
            <div className={`field-block--gap ${editInfo ? "" : "field-block--hidden"}`}>
              <Field label={t.settings.name} value={settings.name} onChange={(v) => update("name", v)} />
              <Field label={t.settings.address} value={settings.address} onChange={(v) => update("address", v)} />
              <Field label={t.settings.phone} value={settings.phone} onChange={(v) => update("phone", v)} />
              <Field label={t.settings.email} value={settings.email} onChange={(v) => update("email", v)} type="email" />
              <div>
                <label className="field-block__label">{t.settings.footer}</label>
                <textarea value={settings.footer} rows={2} onChange={(e) => update("footer", e.target.value)} className="ds-textarea ds-textarea--noresize" />
              </div>
              <div>
                <label className="field-block__label mb-8">{t.settings.logo}</label>
                {settings.logo && <img src={settings.logo} alt="Logo" className="logo-preview--edit" />}
                <input type="file" accept="image/*" onChange={(e) => handleLogo(e.target.files?.[0] || null)} className="file-input-sm" />
              </div>
              <div>
                <label className="field-block__label">{t.settings.brandColor}</label>
                <div className="row row--gap-10">
                  <input type="color" value={settings.brandColor || "#0ea5e9"} onChange={(e) => update("brandColor", e.target.value)} className="color-input" />
                  <Input
                    type="text"
                    value={settings.brandColor || "#0ea5e9"}
                    onChange={(e) => update("brandColor", e.target.value)}
                    placeholder="#0ea5e9"
                    style={{ flex: 1, fontFamily: "monospace" }}
                  />
                </div>
                <p className="hint-text">{t.settings.brandColorHint}</p>
              </div>
            </div>
          </div>

          {allowBackup && (
            <div className="settings-card">
              <SectionHeader title={t.settings.backup} open={editBackup} onToggle={() => setEditBackup((v) => !v)} />
              <p className="backup-hint">Download a full database backup as JSON (encrypted if configured).</p>
              {!editBackup && backupConfig && (
                <div className="mt-12">
                  <InfoRow label="Automatic backup" value={backupConfig.enabled ? "Enabled" : "Disabled"} />
                  <InfoRow label="Interval" value={`${backupConfig.intervalHours} hours`} />
                  <InfoRow label="Keep Drive copies" value={String(backupConfig.keepDriveCopies ?? 14)} />
                  <InfoRow label="Last backup" value={backupConfig.lastRunAt ? new Date(backupConfig.lastRunAt).toLocaleString() : "-"} />
                  {driveStatus?.configured && (
                    <InfoRow
                      label={t.settings.googleDriveTitle}
                      value={driveStatus.connected ? t.settings.googleDriveConnected.replace("{email}", driveStatus.accountEmail) : t.settings.googleDriveNotConnected}
                    />
                  )}
                </div>
              )}
              <Button variant="violet" solid onClick={handleBackup}>
                {t.settings.downloadBackup}
              </Button>
              {editBackup && authUser?.role === "Super Admin" && (
                <div className="restore-box">
                  <label className="field-block__label mb-6">Restore backup database (.json / .enc)</label>
                  <input
                    type="file"
                    accept=".json,.enc,application/octet-stream,application/json"
                    disabled={restorePreviewLoading}
                    onChange={(e) => {
                      handleRestore(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                    className="file-input-sm"
                  />
                  <p className="hint-text hint-text--tight">Upload a downloaded madrasah backup to restore old students, income, users and settings.</p>
                  {restorePreviewLoading && !restorePreview && (
                    <div className="flex-mt-8">
                      <HudSpinner size={18} />
                    </div>
                  )}
                </div>
              )}

              {restorePreview && (
                <div className="restore-warn-box">
                  <p className="restore-warn-box__title">
                    Confirm restore{restorePreview.source.kind === "drive" ? `: "${restorePreview.source.file.name}"` : ""}
                  </p>
                  {restorePreview.exportedAt && (
                    <p className="restore-warn-box__meta">
                      Backup taken: {new Date(restorePreview.exportedAt).toLocaleString()}
                    </p>
                  )}
                  <div className="restore-counts-list">
                    {Object.keys(restorePreview.backupCounts).map((table) => {
                      const backupCount = restorePreview.backupCounts[table];
                      const currentCount = restorePreview.currentCounts[table];
                      const changed = backupCount !== currentCount;
                      return (
                        <div key={table} className={`restore-diff-row ${changed ? "restore-diff-row--changed" : ""}`}>
                          <span>{table}</span>
                          <span>
                            {currentCount} → {backupCount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="restore-warn-box__notice">
                    This will permanently replace all current data in the tables above with the numbers on the right. This cannot be undone from the app (a safety backup of the current data is taken automatically, but restoring it requires repeating this process).
                  </p>
                  <div className="row row--gap-8">
                    <Button variant="rose" solid onClick={handleConfirmRestore} disabled={restoreConfirming}>
                      {restoreConfirming ? "Restoring…" : "Confirm restore"}
                    </Button>
                    <Button variant="outline" onClick={handleCancelRestore} disabled={restoreConfirming}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {editBackup && backupConfig && (
                <div className="stack--gap-10-mt-16">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={backupConfig.enabled} onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })} />
                    Automatic backup
                  </label>
                  <div className="form-grid form-grid--tight">
                    <Field label="Backup interval (hours)" value={String(backupConfig.intervalHours)} onChange={(v) => setBackupConfig({ ...backupConfig, intervalHours: Number(v) || 24 })} type="number" />
                    <Field label="Keep local copies" value={String(backupConfig.keepLocalCopies)} onChange={(v) => setBackupConfig({ ...backupConfig, keepLocalCopies: Number(v) || 14 })} type="number" />
                    <Field label="Keep Drive copies" value={String(backupConfig.keepDriveCopies ?? 14)} onChange={(v) => setBackupConfig({ ...backupConfig, keepDriveCopies: Number(v) || 14 })} type="number" />
                  </div>
                  {[0, 1, 2].map((i) => (
                    <Field
                      key={i}
                      label={`Local sync folder ${i + 1} (e.g. Google Drive desktop app folder)`}
                      value={backupConfig.destinations[i] || ""}
                      onChange={(v) => {
                        const destinations = [...backupConfig.destinations];
                        destinations[i] = v;
                        setBackupConfig({ ...backupConfig, destinations });
                      }}
                    />
                  ))}
                  {backupConfig.lastRunAt && <p className="hint-text hint-text--no-mt">Last auto backup: {new Date(backupConfig.lastRunAt).toLocaleString()}</p>}
                  <div className="backup-actions">
                    <Button variant="emerald" solid onClick={saveBackupConfig} style={{ fontSize: 13 }}>Save backup settings</Button>
                    <Button variant="teal" solid onClick={runBackupNow} style={{ fontSize: 13 }}>Run backup now</Button>
                  </div>

                  {driveStatus?.configured && (
                    <div className="drive-box">
                      <div className="drive-box__title">{t.settings.googleDriveTitle}</div>
                      {driveStatus.connected ? (
                        <div className="drive-connected">
                          <p className="drive-meta">
                            {t.settings.googleDriveConnected.replace("{email}", driveStatus.accountEmail)}
                          </p>
                          <p className={`drive-encryption-status ${backupConfig?.driveEncryptionEnabled ? "drive-encryption-status--on" : "drive-encryption-status--off"}`}>
                            {backupConfig?.driveEncryptionEnabled
                              ? "🔒 Drive backups are encrypted (BACKUP_ENCRYPTION_KEY is set)"
                              : "⚠️ Drive backups are NOT encrypted — set BACKUP_ENCRYPTION_KEY on the server to protect them"}
                          </p>
                          {driveStatus.lastUploadAt && (
                            <p className="drive-meta">
                              {t.settings.googleDriveLastUpload.replace("{date}", new Date(driveStatus.lastUploadAt).toLocaleString())}
                            </p>
                          )}
                          {driveStatus.lastUploadError && (
                            <p className="drive-error">
                              {t.settings.googleDriveUploadError.replace("{message}", driveStatus.lastUploadError)}
                            </p>
                          )}
                          <div className="drive-link-row">
                            {driveStatus.folderLink && (
                              <a href={driveStatus.folderLink} target="_blank" rel="noreferrer" className="drive-link">
                                {t.settings.googleDriveOpenFolder}
                              </a>
                            )}
                            {authUser?.role === "Super Admin" && (
                              <button type="button" onClick={handleDisconnectDrive} className="btn-disconnect">
                                {t.settings.googleDriveDisconnect}
                              </button>
                            )}
                          </div>

                          {authUser?.role === "Super Admin" && (
                            <div className="drive-files-box">
                              <div className="drive-files-head">
                                <span className="drive-files-title">{t.settings.driveFilesTitle}</span>
                                <button type="button" onClick={refreshDriveFiles} disabled={driveFilesLoading} className="link-btn">
                                  {t.settings.driveFilesRefresh}
                                </button>
                              </div>
                              {driveFilesLoading && <SkeletonRows count={3} />}
                              {!driveFilesLoading && driveFiles?.length === 0 && (
                                <p className="drive-meta">{t.settings.driveFilesEmpty}</p>
                              )}
                              {!driveFilesLoading && driveFiles && driveFiles.length > 0 && (
                                <div className="drive-files-list">
                                  {driveFiles.map((f) => (
                                    <div key={f.id} className="drive-file-row">
                                      <div className="min-w-0">
                                        <div className="drive-file-name">{f.name}</div>
                                        <div className="drive-file-meta">
                                          {formatFileSize(f.size)} · {new Date(f.createdTime).toLocaleString()}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreFromDrive(f)}
                                        disabled={restoringFileId !== null}
                                        className={`btn-restore-file ${restoringFileId === f.id ? "btn-restore-file--busy" : ""}`}
                                      >
                                        {restoringFileId === f.id ? t.settings.driveFileRestoring : t.settings.driveFileRestore}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="not-connected-hint">{t.settings.googleDriveNotConnected}</p>
                          {authUser?.role === "Super Admin" ? (
                            <Button variant="violet" solid disabled={driveConnecting} onClick={handleConnectDrive} style={{ fontSize: 13 }}>
                              {driveConnecting ? t.settings.googleDriveConnecting : t.settings.googleDriveConnect}
                            </Button>
                          ) : (
                            <p className="drive-meta">{t.settings.googleDriveOnlySuperAdmin}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="settings-col">
          <div className="settings-card">
            <SectionHeader title={t.settings.systemSettings} open={editSystem} onToggle={() => setEditSystem((v) => !v)} />
            {!editSystem && (
              <div>
                <InfoRow label={t.settings.language} value={settings.lang === "en" ? t.settings.langEn : t.settings.langBn} />
                <InfoRow label={t.settings.theme} value={settings.theme === "dark" ? t.settings.themeDark : t.settings.themeLight} />
                <InfoRow label={t.settings.currency} value={settings.currency} />
              </div>
            )}
            <div className={`field-block--gap ${editSystem ? "" : "field-block--hidden"}`}>
              <div>
                <label className="field-block__label">{t.settings.language}</label>
                <Select value={settings.lang} onChange={(e) => update("lang", e.target.value)}>
                  <option value="bn">{t.settings.langBn}</option>
                  <option value="en">{t.settings.langEn}</option>
                </Select>
              </div>
              <div>
                <label className="field-block__label">{t.settings.theme}</label>
                <Select value={settings.theme} onChange={(e) => update("theme", e.target.value)}>
                  <option value="light">{t.settings.themeLight}</option>
                  <option value="dark">{t.settings.themeDark}</option>
                </Select>
              </div>
              <div>
                <label className="field-block__label">{t.settings.currency}</label>
                <Select value={settings.currency} onChange={(e) => update("currency", e.target.value)}>
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
            </div>
          </div>

          {manageUsers && (
            <div className="settings-card">
              <SectionHeader title={t.settings.userRoles} open={editUsers} onToggle={() => setEditUsers((v) => !v)} />
              <div className={`user-form-grid ${editUsers ? "" : "user-form-grid--hidden"}`}>
                <Input placeholder={t.settings.userName} value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }} />
                <Input placeholder={t.settings.loginEmail} type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }} />
                <Input placeholder={t.settings.userPassword} type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }} />
                <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }}>
                  {USER_ROLES.filter((r) => authUser?.role === "Super Admin" || r !== "Super Admin").map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
              <Button variant="teal" solid onClick={handleAddUser} className={editUsers ? "" : "add-user-btn--hidden"} style={{ fontSize: 13, marginBottom: 14 }}>
                + {t.settings.addUser}
              </Button>

              <div className="user-list">
                {users.map((u) => {
                  const color = ROLE_COLORS[u.role] || "#0f766e";
                  const editing = editDraft?.id === u.id;
                  const draft = editing ? editDraft! : u;
                  return (
                    // Row tint is per-user-role data (color + "10"/"30" alpha),
                    // same documented dynamic-color exception as above.
                    // eslint-disable-next-line no-restricted-syntax -- dynamic per-role accent color
                    <div key={u.id} className="user-row" style={{ background: color + "10", border: `1px solid ${color}30` }}>
                      {/* eslint-disable-next-line no-restricted-syntax -- dynamic per-role accent color */}
                      <span className="user-row-dot" style={{ background: color }} />
                      {editing ? (
                        <>
                          <Input value={draft.name} onChange={(e) => setEditDraft({ ...draft, name: e.target.value })} style={{ flex: 1, minWidth: 90, fontSize: 13, padding: "8px 10px" }} />
                          <Input value={draft.email || ""} onChange={(e) => setEditDraft({ ...draft, email: e.target.value })} style={{ flex: 1, minWidth: 90, fontSize: 13, padding: "8px 10px" }} />
                          <Select value={draft.role} disabled={!!u.isProtected && (authUser?.role !== "Super Admin" || authUser?.id === u.id)} onChange={(e) => setEditDraft({ ...draft, role: e.target.value })} style={{ fontSize: 13, padding: "8px 10px" }}>
                            {USER_ROLES.filter((r) => authUser?.role === "Super Admin" || r !== "Super Admin").map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </Select>
                          <Input placeholder="New password (optional)" type="password" onChange={(e) => setEditDraft({ ...draft, newPassword: e.target.value } as User & { newPassword?: string })} style={{ minWidth: 120, fontSize: 13, padding: "8px 10px" }} />
                          <button type="button" onClick={handleUpdateUser} className="btn-xs btn-xs--save">{t.common.save}</button>
                          <button type="button" onClick={() => setEditDraft(null)} className="btn-xs btn-xs--cancel">{t.common.cancel}</button>
                        </>
                      ) : (
                        <>
                          <div className="user-info">
                            <div className="user-name">{u.name}{u.isProtected ? " 🔒" : ""}</div>
                            <div className="user-meta">{u.role} · {u.email || "—"}</div>
                          </div>
                          {canEditUser() && (
                            <button type="button" onClick={() => setEditDraft({ ...u })} className="btn-xs btn-xs--edit">✏️</button>
                          )}
                          {canDeleteUser(u) && (
                            <button type="button" onClick={() => handleDeleteUser(u)} className="btn-xs btn-xs--delete">{t.common.delete}</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <button type="button" onClick={handleSave} className={`save-settings-btn ${saved ? "save-settings-btn--saved" : ""}`}>
        {saved ? t.settings.savedMsg : t.settings.saveChanges}
      </button>
    </div>
  );
}

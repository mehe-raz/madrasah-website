import { useEffect, useState } from "react";
import { HudSpinner } from "../components/HudSpinner";
import { useAuth } from "../context/AuthContext";
import { useAppSettings, useLanguage } from "../context/AppSettingsContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { api } from "../lib/api";
import { canBackup, canManageUsers } from "../lib/permissions";
import { C } from "../theme/colors";
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
      <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box", color: C.text, background: C.card }}
      />
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  "Super Admin": C.violet,
  Admin: C.teal,
  Accountant: C.emerald,
  Teacher: C.amber,
  "Hostel Manager": C.rose,
};

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: open ? 16 : 0 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
      <button
        type="button"
        onClick={onToggle}
        title={open ? "Close edit" : "Edit"}
        style={{ width: 34, height: 34, border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, color: C.text, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
      >
        ...
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: C.text, fontWeight: 600, wordBreak: "break-word" }}>{value || "-"}</div>
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
  const isMobile = useMediaQuery("(max-width: 768px)");
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
      <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 24 }}>{t.settings.title}</h2>
      {msg && <p style={{ color: C.teal, fontSize: 13, marginBottom: 12 }}>{msg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
            <SectionHeader title={t.settings.madrasaInfo} open={editInfo} onToggle={() => setEditInfo((v) => !v)} />
            {!editInfo && (
              <div>
                <InfoRow label={t.settings.name} value={settings.name} />
                <InfoRow label={t.settings.address} value={settings.address} />
                <InfoRow label={t.settings.phone} value={settings.phone} />
                <InfoRow label={t.settings.email} value={settings.email} />
                <InfoRow label={t.settings.footer} value={settings.footer} />
                {settings.logo && <img src={settings.logo} alt="Logo" loading="lazy" decoding="async" style={{ maxHeight: 64, marginTop: 12, borderRadius: 8 }} />}
              </div>
            )}
            <div style={{ display: editInfo ? "flex" : "none", flexDirection: "column", gap: 14 }}>
              <Field label={t.settings.name} value={settings.name} onChange={(v) => update("name", v)} />
              <Field label={t.settings.address} value={settings.address} onChange={(v) => update("address", v)} />
              <Field label={t.settings.phone} value={settings.phone} onChange={(v) => update("phone", v)} />
              <Field label={t.settings.email} value={settings.email} onChange={(v) => update("email", v)} type="email" />
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>{t.settings.footer}</label>
                <textarea value={settings.footer} rows={2} onChange={(e) => update("footer", e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box", resize: "none", fontFamily: "inherit", color: C.text, background: C.card }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>{t.settings.logo}</label>
                {settings.logo && <img src={settings.logo} alt="Logo" style={{ maxHeight: 64, marginBottom: 8, borderRadius: 8 }} />}
                <input type="file" accept="image/*" onChange={(e) => handleLogo(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
              </div>
            </div>
          </div>

          {allowBackup && (
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
              <SectionHeader title={t.settings.backup} open={editBackup} onToggle={() => setEditBackup((v) => !v)} />
                            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Download a full database backup as JSON (encrypted if configured).</p>
              {!editBackup && backupConfig && (
                <div style={{ marginTop: 12 }}>
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
              <button type="button" onClick={handleBackup} style={{ background: C.violet, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
                {t.settings.downloadBackup}
              </button>
              {editBackup && authUser?.role === "Super Admin" && (
                <div style={{ marginTop: 14, padding: 12, background: C.slateL, borderRadius: 8 }}>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>Restore backup database (.json / .enc)</label>
                  <input
                    type="file"
                    accept=".json,.enc,application/octet-stream,application/json"
                    disabled={restorePreviewLoading}
                    onChange={(e) => {
                      handleRestore(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                    style={{ fontSize: 13, maxWidth: "100%" }}
                  />
                  <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0" }}>Upload a downloaded madrasah backup to restore old students, income, users and settings.</p>
                  {restorePreviewLoading && !restorePreview && (
                    <div style={{ display: "flex", marginTop: 8 }}>
                      <HudSpinner size={18} />
                    </div>
                  )}
                </div>
              )}

              {restorePreview && (
                <div style={{ marginTop: 14, padding: 14, background: "#FEF3F2", border: `1px solid ${C.rose}`, borderRadius: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>
                    Confirm restore{restorePreview.source.kind === "drive" ? `: "${restorePreview.source.file.name}"` : ""}
                  </p>
                  {restorePreview.exportedAt && (
                    <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>
                      Backup taken: {new Date(restorePreview.exportedAt).toLocaleString()}
                    </p>
                  )}
                  <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>
                    {Object.keys(restorePreview.backupCounts).map((table) => {
                      const backupCount = restorePreview.backupCounts[table];
                      const currentCount = restorePreview.currentCounts[table];
                      const changed = backupCount !== currentCount;
                      return (
                        <div key={table} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: changed ? C.rose : C.muted }}>
                          <span>{table}</span>
                          <span>
                            {currentCount} → {backupCount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 12, color: C.rose, margin: "0 0 10px", fontWeight: 600 }}>
                    This will permanently replace all current data in the tables above with the numbers on the right. This cannot be undone from the app (a safety backup of the current data is taken automatically, but restoring it requires repeating this process).
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleConfirmRestore}
                      disabled={restoreConfirming}
                      style={{ background: C.rose, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 600, cursor: restoreConfirming ? "default" : "pointer" }}
                    >
                      {restoreConfirming ? "Restoring…" : "Confirm restore"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelRestore}
                      disabled={restoreConfirming}
                      style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontWeight: 600, cursor: restoreConfirming ? "default" : "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {editBackup && backupConfig && (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text }}>
                    <input type="checkbox" checked={backupConfig.enabled} onChange={(e) => setBackupConfig({ ...backupConfig, enabled: e.target.checked })} />
                    Automatic backup
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
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
                  {backupConfig.lastRunAt && <p style={{ fontSize: 12, color: C.muted }}>Last auto backup: {new Date(backupConfig.lastRunAt).toLocaleString()}</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={saveBackupConfig} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Save backup settings</button>
                    <button type="button" onClick={runBackupNow} style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Run backup now</button>
                  </div>

                  {driveStatus?.configured && (
                    <div style={{ marginTop: 6, padding: 12, background: C.slateL, borderRadius: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>{t.settings.googleDriveTitle}</div>
                      {driveStatus.connected ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                            {t.settings.googleDriveConnected.replace("{email}", driveStatus.accountEmail)}
                          </p>
                          <p style={{ fontSize: 12, margin: 0, color: backupConfig?.driveEncryptionEnabled ? C.emerald : "#dc2626", fontWeight: 600 }}>
                            {backupConfig?.driveEncryptionEnabled
                              ? "🔒 Drive backups are encrypted (BACKUP_ENCRYPTION_KEY is set)"
                              : "⚠️ Drive backups are NOT encrypted — set BACKUP_ENCRYPTION_KEY on the server to protect them"}
                          </p>
                          {driveStatus.lastUploadAt && (
                            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                              {t.settings.googleDriveLastUpload.replace("{date}", new Date(driveStatus.lastUploadAt).toLocaleString())}
                            </p>
                          )}
                          {driveStatus.lastUploadError && (
                            <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>
                              {t.settings.googleDriveUploadError.replace("{message}", driveStatus.lastUploadError)}
                            </p>
                          )}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {driveStatus.folderLink && (
                              <a href={driveStatus.folderLink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.violet }}>
                                {t.settings.googleDriveOpenFolder}
                              </a>
                            )}
                            {authUser?.role === "Super Admin" && (
                              <button
                                type="button"
                                onClick={handleDisconnectDrive}
                                style={{ background: "transparent", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                              >
                                {t.settings.googleDriveDisconnect}
                              </button>
                            )}
                          </div>

                          {authUser?.role === "Super Admin" && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.settings.driveFilesTitle}</span>
                                <button
                                  type="button"
                                  onClick={refreshDriveFiles}
                                  disabled={driveFilesLoading}
                                  style={{ background: "transparent", border: "none", color: C.violet, fontSize: 12, cursor: driveFilesLoading ? "default" : "pointer", padding: 0 }}
                                >
                                  {t.settings.driveFilesRefresh}
                                </button>
                              </div>
                              {driveFilesLoading && (
                                <div style={{ display: "flex" }}>
                                  <HudSpinner size={18} />
                                </div>
                              )}
                              {!driveFilesLoading && driveFiles?.length === 0 && (
                                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{t.settings.driveFilesEmpty}</p>
                              )}
                              {!driveFilesLoading && driveFiles && driveFiles.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                                  {driveFiles.map((f) => (
                                    <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 12, color: C.text, fontWeight: 600, wordBreak: "break-word" }}>{f.name}</div>
                                        <div style={{ fontSize: 11, color: C.muted }}>
                                          {formatFileSize(f.size)} · {new Date(f.createdTime).toLocaleString()}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreFromDrive(f)}
                                        disabled={restoringFileId !== null}
                                        style={{
                                          flexShrink: 0,
                                          background: restoringFileId === f.id ? C.slateL : C.teal,
                                          color: restoringFileId === f.id ? C.muted : "#fff",
                                          border: "none",
                                          borderRadius: 6,
                                          padding: "6px 10px",
                                          fontWeight: 600,
                                          fontSize: 11,
                                          cursor: restoringFileId !== null ? "default" : "pointer",
                                          opacity: restoringFileId !== null && restoringFileId !== f.id ? 0.5 : 1,
                                        }}
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
                          <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>{t.settings.googleDriveNotConnected}</p>
                          {authUser?.role === "Super Admin" ? (
                            <button
                              type="button"
                              disabled={driveConnecting}
                              onClick={handleConnectDrive}
                              style={{ background: C.violet, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: driveConnecting ? "default" : "pointer", fontSize: 13, opacity: driveConnecting ? 0.7 : 1 }}
                            >
                              {driveConnecting ? t.settings.googleDriveConnecting : t.settings.googleDriveConnect}
                            </button>
                          ) : (
                            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{t.settings.googleDriveOnlySuperAdmin}</p>
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

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
            <SectionHeader title={t.settings.systemSettings} open={editSystem} onToggle={() => setEditSystem((v) => !v)} />
            {!editSystem && (
              <div>
                <InfoRow label={t.settings.language} value={settings.lang === "en" ? t.settings.langEn : t.settings.langBn} />
                <InfoRow label={t.settings.theme} value={settings.theme === "dark" ? t.settings.themeDark : t.settings.themeLight} />
                <InfoRow label={t.settings.currency} value={settings.currency} />
              </div>
            )}
            <div style={{ display: editSystem ? "flex" : "none", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>{t.settings.language}</label>
                <select value={settings.lang} onChange={(e) => update("lang", e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, background: C.card, color: C.text }}>
                  <option value="bn">{t.settings.langBn}</option>
                  <option value="en">{t.settings.langEn}</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>{t.settings.theme}</label>
                <select value={settings.theme} onChange={(e) => update("theme", e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, background: C.card, color: C.text }}>
                  <option value="light">{t.settings.themeLight}</option>
                  <option value="dark">{t.settings.themeDark}</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 5 }}>{t.settings.currency}</label>
                <select value={settings.currency} onChange={(e) => update("currency", e.target.value)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, background: C.card, color: C.text }}>
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          </div>

          {manageUsers && (
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
              <SectionHeader title={t.settings.userRoles} open={editUsers} onToggle={() => setEditUsers((v) => !v)} />
              <div style={{ display: editUsers ? "grid" : "none", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <input placeholder={t.settings.userName} value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} style={inputSmall} />
                <input placeholder={t.settings.loginEmail} type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} style={inputSmall} />
                <input placeholder={t.settings.userPassword} type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} style={inputSmall} />
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} style={inputSmall}>
                  {USER_ROLES.filter((r) => authUser?.role === "Super Admin" || r !== "Super Admin").map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={handleAddUser} style={{ display: editUsers ? "inline-block" : "none", background: C.teal, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13, marginBottom: 14 }}>
                + {t.settings.addUser}
              </button>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {users.map((u) => {
                  const color = ROLE_COLORS[u.role] || C.teal;
                  const editing = editDraft?.id === u.id;
                  const draft = editing ? editDraft! : u;
                  return (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: color + "10", borderRadius: 8, border: `1px solid ${color}30`, flexWrap: "wrap" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      {editing ? (
                        <>
                          <input value={draft.name} onChange={(e) => setEditDraft({ ...draft, name: e.target.value })} style={{ ...inputSmall, flex: 1, minWidth: 90 }} />
                          <input value={draft.email || ""} onChange={(e) => setEditDraft({ ...draft, email: e.target.value })} style={{ ...inputSmall, flex: 1, minWidth: 90 }} />
                          <select value={draft.role} disabled={!!u.isProtected && (authUser?.role !== "Super Admin" || authUser?.id === u.id)} onChange={(e) => setEditDraft({ ...draft, role: e.target.value })} style={inputSmall}>
                            {USER_ROLES.filter((r) => authUser?.role === "Super Admin" || r !== "Super Admin").map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <input placeholder="New password (optional)" type="password" onChange={(e) => setEditDraft({ ...draft, newPassword: e.target.value } as User & { newPassword?: string })} style={{ ...inputSmall, minWidth: 120 }} />
                          <button type="button" onClick={handleUpdateUser} style={{ background: C.emerald, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>{t.common.save}</button>
                          <button type="button" onClick={() => setEditDraft(null)} style={{ background: C.slateL, color: C.muted, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>{t.common.cancel}</button>
                        </>
                      ) : (
                        <>
                          <div style={{ flex: 1, minWidth: 100 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.name}{u.isProtected ? " 🔒" : ""}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>{u.role} · {u.email || "—"}</div>
                          </div>
                          {canEditUser() && (
                            <button type="button" onClick={() => setEditDraft({ ...u })} style={{ background: C.tealL, color: C.tealD, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>✏️</button>
                          )}
                          {canDeleteUser(u) && (
                            <button type="button" onClick={() => handleDeleteUser(u)} style={{ background: C.roseL, color: C.rose, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>{t.common.delete}</button>
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

      <button type="button" onClick={handleSave} style={{ marginTop: 20, background: saved ? C.emerald : C.teal, color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
        {saved ? t.settings.savedMsg : t.settings.saveChanges}
      </button>
    </div>
  );
}

const inputSmall: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: C.card,
  color: C.text,
  boxSizing: "border-box",
};




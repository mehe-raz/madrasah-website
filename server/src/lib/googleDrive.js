const fs = require("fs");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { JWT_SECRET } = require("../middleware/auth");

// Settings-table key used to persist the connection (refresh token, folder, etc).
// Follows the same pattern as backupConfig in routes/backup.js.
const CONFIG_KEY = "googleDriveAuth";
const FOLDER_NAME = "Madrasah ERP Backups";
const STATE_PURPOSE = "google-drive-oauth";

// drive.file: app can only see/manage files & folders it creates itself.
// This is the least-privilege scope for this use case (no access to the
// user's other Drive content), which also keeps the app outside Google's
// "restricted scope" verification requirements.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REDIRECT_URI
  );
}

function createOAuthClient() {
  if (!isConfigured()) {
    throw new Error("Google Drive integration is not configured on the server");
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );
}

function defaultAuthState() {
  return {
    connected: false,
    refreshToken: "",
    accountEmail: "",
    folderId: "",
    folderLink: "",
    connectedAt: "",
    lastUploadAt: "",
    lastUploadError: "",
  };
}

async function getAuthState() {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [CONFIG_KEY]);
  if (!row) return defaultAuthState();
  try {
    return { ...defaultAuthState(), ...JSON.parse(row.value) };
  } catch {
    return defaultAuthState();
  }
}

async function saveAuthState(patch) {
  const current = await getAuthState();
  const next = { ...current, ...patch };
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [CONFIG_KEY, JSON.stringify(next)]
  );
  return next;
}

// Short-lived signed state token instead of server-side session storage,
// to protect the OAuth redirect against CSRF while staying stateless. Also
// carries the origin (e.g. https://some-tenant.example.com) the connect
// flow was started from, so the callback below can send the popup back to
// that same tenant site instead of one hardcoded CLIENT_ORIGIN — this app
// is multi-tenant (one subdomain per institution), so a single fixed
// redirect target is wrong for anyone not on that one origin. Signing the
// origin into the token (rather than trusting a query param on the
// callback) means it can't be tampered with to build an open redirect.
function buildStateToken(userId, origin) {
  return jwt.sign({ uid: userId, purpose: STATE_PURPOSE, origin: origin || "" }, JWT_SECRET, { expiresIn: "10m" });
}

// Verifies signature + shape only, without throwing — used by the callback
// route to recover the return origin even before/regardless of whether the
// fuller verifyStateToken() check below (uid match, etc.) passes, so error
// redirects can also go back to the right tenant site.
function decodeState(state) {
  try {
    return jwt.verify(state, JWT_SECRET);
  } catch {
    return null;
  }
}

function verifyStateToken(state, userId) {
  const payload = decodeState(state);
  if (!payload) {
    throw new Error("Google Drive connection link expired. Please try connecting again.");
  }
  if (payload.purpose !== STATE_PURPOSE || payload.uid !== userId) {
    throw new Error("Invalid Google Drive connection request");
  }
  return payload;
}

function getAuthUrl(userId, returnOrigin) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // Force the consent screen so Google reliably issues a refresh_token,
    // even if this user authorized the app once before.
    prompt: "consent",
    scope: SCOPES,
    state: buildStateToken(userId, returnOrigin),
  });
}

async function ensureFolder(drive, existingFolderId) {
  if (existingFolderId) {
    try {
      const found = await drive.files.get({
        fileId: existingFolderId,
        fields: "id, name, webViewLink, trashed",
      });
      if (found.data && !found.data.trashed) return found.data;
    } catch {
      // Folder missing/inaccessible (e.g. deleted by user) — fall through and recreate it.
    }
  }

  const existing = await drive.files.list({
    q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name, webViewLink)",
    spaces: "drive",
  });
  if (existing.data.files?.length) return existing.data.files[0];

  const created = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id, webViewLink",
  });
  return created.data;
}

async function handleCallback(code, state, userId) {
  verifyStateToken(state, userId);
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Remove the app's access at https://myaccount.google.com/permissions and try connecting again."
    );
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  const drive = google.drive({ version: "v3", auth: client });
  const folder = await ensureFolder(drive, null);

  return saveAuthState({
    connected: true,
    refreshToken: tokens.refresh_token,
    accountEmail: profile.email || "",
    folderId: folder.id,
    folderLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    connectedAt: new Date().toISOString(),
    lastUploadAt: "",
    lastUploadError: "",
  });
}

async function getDriveClient() {
  const state = await getAuthState();
  if (!state.connected || !state.refreshToken) return null;
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: state.refreshToken });
  return { client, drive: google.drive({ version: "v3", auth: client }), state };
}

async function getStatus() {
  const state = await getAuthState();
  return {
    configured: isConfigured(),
    connected: Boolean(state.connected),
    accountEmail: state.accountEmail || "",
    folderLink: state.folderLink || "",
    connectedAt: state.connectedAt || "",
    lastUploadAt: state.lastUploadAt || "",
    lastUploadError: state.lastUploadError || "",
  };
}

async function disconnect() {
  const state = await getAuthState();
  if (state.refreshToken) {
    try {
      const client = createOAuthClient();
      await client.revokeToken(state.refreshToken);
    } catch (err) {
      console.warn("Google Drive token revoke failed:", err.message);
    }
  }
  await saveAuthState(defaultAuthState());
}

// Uploads a backup file to the app's Drive folder. No-ops (returns null)
// when Google Drive isn't connected, so callers can treat it the same way
// the existing local-folder destinations are treated (best-effort).
async function uploadBackupFile(localPath, filename, mimeType) {
  const conn = await getDriveClient();
  if (!conn) return null;

  try {
    const folder = await ensureFolder(conn.drive, conn.state.folderId);
    if (folder.id !== conn.state.folderId || folder.webViewLink !== conn.state.folderLink) {
      await saveAuthState({ folderId: folder.id, folderLink: folder.webViewLink });
    }

    const res = await conn.drive.files.create({
      requestBody: { name: filename, parents: [folder.id] },
      media: { mimeType, body: fs.createReadStream(localPath) },
      fields: "id, webViewLink",
    });
    await saveAuthState({ lastUploadAt: new Date().toISOString(), lastUploadError: "" });
    return res.data;
  } catch (err) {
    await saveAuthState({ lastUploadError: err.message || String(err) });
    throw err;
  }
}

// Lists backup files sitting in the app's Drive folder, newest first, with
// size and created date so the UI can show something like WhatsApp's
// "last backed up X, size Y" list. Returns [] when Drive isn't connected.
async function listBackupFiles() {
  const conn = await getDriveClient();
  if (!conn) return [];

  const folder = await ensureFolder(conn.drive, conn.state.folderId);
  if (folder.id !== conn.state.folderId || folder.webViewLink !== conn.state.folderLink) {
    await saveAuthState({ folderId: folder.id, folderLink: folder.webViewLink });
  }

  const res = await conn.drive.files.list({
    q: `'${folder.id}' in parents and trashed = false`,
    fields: "files(id, name, size, createdTime, mimeType)",
    orderBy: "createdTime desc",
    pageSize: 100,
    spaces: "drive",
  });
  return (res.data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size || 0),
    createdTime: f.createdTime,
  }));
}

// Downloads a single backup file's raw content by its Drive file id, so it
// can be fed into the same restore logic used for a manually uploaded file.
async function downloadBackupFile(fileId) {
  const conn = await getDriveClient();
  if (!conn) throw new Error("Google Drive is not connected");

  const res = await conn.drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

module.exports = {
  isConfigured,
  getAuthUrl,
  decodeState,
  handleCallback,
  getStatus,
  disconnect,
  uploadBackupFile,
  listBackupFiles,
  downloadBackupFile,
};

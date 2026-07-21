/**
 * Encrypts backup files before they leave the server for Google Drive.
 *
 * Local backups (backupDir, and the "local sync folder" destinations in
 * routes/backup.js) stay in plain JSON/SQL — they never leave a trust
 * boundary the app doesn't already share with the database itself. The
 * Google Drive copy is different: its confidentiality depends entirely on
 * that Drive account's own access controls (who's logged into it, whether
 * the folder ever gets shared), which the app has no control over. So, the
 * same way WhatsApp encrypts a chat backup on-device before it ever reaches
 * Google Drive/iCloud, we encrypt here — with AES-256-GCM — before calling
 * googleDrive.uploadBackupFile().
 *
 * BACKUP_ENCRYPTION_KEY (set in .env) is the secret. It never leaves this
 * server and is never itself uploaded anywhere, so a compromised or
 * accidentally-shared Drive folder yields only unreadable ciphertext.
 * (This does NOT protect against someone who compromises the server
 * itself — they'd have the key, the database, and everything else too.
 * It protects the one thing that leaves the server's control: the Drive
 * copy.)
 */
const crypto = require("crypto");
const fs = require("fs");

const ALGO = "aes-256-gcm";
const SALT_LEN = 16;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function isConfigured() {
  return Boolean(process.env.BACKUP_ENCRYPTION_KEY);
}

function deriveKey(salt) {
  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    throw new Error("BACKUP_ENCRYPTION_KEY is not set");
  }
  // scrypt turns the (possibly short/guessable) env value into a proper
  // 32-byte key, salted per-file so two backups never reuse the same key
  // material even if BACKUP_ENCRYPTION_KEY never changes.
  return crypto.scryptSync(process.env.BACKUP_ENCRYPTION_KEY, salt, 32);
}

/**
 * Encrypts inputPath and writes the result to outputPath.
 * File layout: [16-byte salt][12-byte iv][16-byte auth tag][ciphertext]
 */
function encryptFile(inputPath, outputPath) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const plaintext = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  fs.writeFileSync(outputPath, Buffer.concat([salt, iv, authTag, ciphertext]));
}

/** Reverses encryptFile(). Throws if the key is wrong or the data isn't ours. */
function decryptBuffer(buffer) {
  if (buffer.length < SALT_LEN + IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Not an encrypted backup file");
  }
  const salt = buffer.subarray(0, SALT_LEN);
  const iv = buffer.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = buffer.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const ciphertext = buffer.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);

  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { isConfigured, encryptFile, decryptBuffer };

/**
 * Encrypts payment-gateway credentials (bKash agent/merchant App Key/
 * Secret/Username/Password, Phase 8E) before they're written to
 * institution_payment_gateways. Same AES-256-GCM approach as
 * lib/backupEncryption.js, but operating on short strings that go into DB
 * text columns instead of whole files on disk — kept as a separate module
 * (rather than reusing that file's encryptFile/decryptBuffer) so the two
 * secrets never get mixed up: BACKUP_ENCRYPTION_KEY protects the Google
 * Drive backup copy, GATEWAY_CREDENTIAL_KEY protects these credentials. A
 * leak of one key alone never exposes what the other protects.
 *
 * Output is a single base64 string: [16-byte salt][12-byte iv]
 * [16-byte auth tag][ciphertext], base64-encoded so it fits a text column
 * without any binary/encoding fuss.
 */
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const SALT_LEN = 16;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function isConfigured() {
  return Boolean(process.env.GATEWAY_CREDENTIAL_KEY);
}

function deriveKey(salt) {
  if (!process.env.GATEWAY_CREDENTIAL_KEY) {
    throw new Error("GATEWAY_CREDENTIAL_KEY is not set");
  }
  return crypto.scryptSync(process.env.GATEWAY_CREDENTIAL_KEY, salt, 32);
}

/** Encrypts a plaintext string. Returns a base64 string, or null if given a falsy input (so callers can pass an optional field straight through). */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encrypt(). Returns null for a null/empty input; throws if the key is wrong or the data isn't ours. */
function decrypt(encoded) {
  if (!encoded) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < SALT_LEN + IV_LEN + AUTH_TAG_LEN) {
    throw new Error("Not an encrypted credential value");
  }
  const salt = buffer.subarray(0, SALT_LEN);
  const iv = buffer.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = buffer.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const ciphertext = buffer.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);

  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

module.exports = { isConfigured, encrypt, decrypt };

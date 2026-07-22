const db = require("./../db");

// The full `settings` table (currency, backupConfig, receipt footer text,
// etc.) is only ever readable through the auth-protected /api/settings
// route. This is a deliberately small whitelist of the identity/contact
// fields that are safe to expose to a logged-out visitor, so the public
// page can show the institution's real name/logo/address/phone/email
// instead of placeholder text — without ever risking a future settings
// field leaking publicly by accident.
const PUBLIC_KEYS = ["name", "logo", "address", "phone", "email", "footer"];

async function getPublicSettings() {
  const rows = await db.all(
    `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
    [PUBLIC_KEYS]
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: map.name || "",
    logo: map.logo || "",
    address: map.address || "",
    phone: map.phone || "",
    email: map.email || "",
    footer: map.footer || "",
  };
}

module.exports = { getPublicSettings, PUBLIC_KEYS };

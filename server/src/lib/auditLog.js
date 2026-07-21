const db = require("../db");

function stringifyDetails(details) {
  if (details == null) return "";
  if (typeof details === "string") return details.slice(0, 5000);
  try {
    return JSON.stringify(details).slice(0, 5000);
  } catch {
    return String(details).slice(0, 5000);
  }
}

async function recordAudit({
  action,
  actor,
  entityType = "",
  entityId = null,
  label = "",
  details = "",
}) {
  try {
    if (!action) return;
    await db.run(
      `INSERT INTO audit_logs
       ("action", "actorId", "actorName", "actorRole", "entityType", "entityId", label, details, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        String(action),
        actor?.id || null,
        actor?.name || "",
        actor?.role || "",
        entityType ? String(entityType) : "",
        entityId == null ? null : Number(entityId),
        label ? String(label) : "",
        stringifyDetails(details),
        new Date().toISOString(),
      ]
    );
  } catch (e) {
    console.error("Audit log write failed:", e.message);
  }
}

module.exports = { recordAudit };

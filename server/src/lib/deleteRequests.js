const db = require("../db");

function isApprovalRole(role) {
  return role === "Super Admin" || role === "Admin";
}

function publicRequest(row) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    label: row.label,
    amount: row.amount,
    requestedBy: row.requestedBy,
    requestedByName: row.requestedByName,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    payload: row.payload || "",
  };
}

function createDeleteRequest({ entityType, entityId, label, amount, user, payload }) {
  const existing = db
    .prepare("SELECT * FROM delete_requests WHERE entityType = ? AND entityId = ? AND status = 'pending'")
    .get(entityType, entityId);
  if (existing) return publicRequest(existing);

  const result = db
    .prepare(
      `INSERT INTO delete_requests
       (entityType, entityId, label, amount, requestedBy, requestedByName, status, createdAt, payload)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      entityType,
      entityId,
      label,
      Number(amount) || 0,
      user?.id || null,
      user?.name || "",
      new Date().toISOString(),
      payload ? JSON.stringify(payload) : ""
    );
  return publicRequest(db.prepare("SELECT * FROM delete_requests WHERE id = ?").get(result.lastInsertRowid));
}

function deleteEntity(entityType, entityId) {
  if (entityType === "income") {
    const result = db.prepare("DELETE FROM income WHERE id = ?").run(entityId);
    return result.changes > 0;
  }
  if (entityType === "expense") {
    const result = db.prepare("DELETE FROM expenses WHERE id = ?").run(entityId);
    return result.changes > 0;
  }
  if (entityType === "user-delete") {
    const result = db.prepare("DELETE FROM users WHERE id = ?").run(entityId);
    return result.changes > 0;
  }
  return false;
}

function applyUserUpdate(entityId, payload) {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(entityId);
  if (!existing) return false;
  const update = { ...payload };
  if (update.name !== undefined) {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(String(update.name).trim(), entityId);
  }
  if (update.email !== undefined) {
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(String(update.email).trim().toLowerCase(), entityId);
  }
  if (update.role !== undefined) {
    db.prepare("UPDATE users SET role = ?, isProtected = ? WHERE id = ?").run(
      update.role,
      update.role === "Super Admin" ? 1 : 0,
      entityId
    );
  }
  if (update.passwordHash !== undefined) {
    db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?").run(update.passwordHash, entityId);
  }
  return true;
}

module.exports = { applyUserUpdate, createDeleteRequest, deleteEntity, isApprovalRole, publicRequest };

const db = require("../db");
const { createNotification } = require("./notifications");

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

async function createDeleteRequest({ entityType, entityId, label, amount, user, payload }) {
  const existing = await db.get(
    `SELECT * FROM delete_requests WHERE "entityType" = $1 AND "entityId" = $2 AND status = 'pending'`,
    [entityType, entityId]
  );
  if (existing) return publicRequest(existing);

  const result = await db.run(
    `INSERT INTO delete_requests
     ("entityType", "entityId", label, amount, "requestedBy", "requestedByName", status, "createdAt", payload)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8) RETURNING id`,
    [
      entityType,
      entityId,
      label,
      Number(amount) || 0,
      user?.id || null,
      user?.name || "",
      new Date().toISOString(),
      payload ? JSON.stringify(payload) : "",
    ]
  );
  const row = await db.get("SELECT * FROM delete_requests WHERE id = $1", [result.insertId]);

  await createNotification({
    type: "delete-request",
    title: "নতুন ডিলিট রিকোয়েস্ট",
    body: label,
    entityType: "delete-request",
    entityId: row.id,
    link: "/",
    targetRoles: ["Admin", "Super Admin"],
  });

  return publicRequest(row);
}

async function deleteEntity(entityType, entityId) {
  if (entityType === "income") {
    const income = await db.get("SELECT * FROM income WHERE id = $1", [entityId]);
    if (!income) return false;
    // Same shared-receipt invariant as the immediate-delete path in
    // routes/income.js: a Student-Fee income row's receipt matches its
    // mirrored payments row 1:1 (see income.js's POST /), so approving a
    // delete request for one must remove both — otherwise a request
    // submitted by a non-approval-role user and approved later would leave
    // exactly the same orphaned payments row the direct-delete path was
    // fixed to avoid.
    return db.withTransaction(async (tx) => {
      const result = await tx.run("DELETE FROM income WHERE id = $1", [entityId]);
      if (result.rowCount > 0 && income.category === "Student Fee") {
        if (income.studentId) {
          await tx.run("UPDATE students SET due = due + $1 WHERE id = $2", [income.amount, income.studentId]);
        }
        if (income.receipt) {
          await tx.run("DELETE FROM payments WHERE receipt = $1", [income.receipt]);
        }
      }
      return result.rowCount > 0;
    });
  }

  if (entityType === "payment-delete") {
    const payment = await db.get("SELECT * FROM payments WHERE id = $1", [entityId]);
    if (!payment) return false;
    await db.withTransaction(async (tx) => {
      if (payment.studentId) {
        await tx.run("UPDATE students SET due = due + $1 WHERE id = $2", [payment.amount, payment.studentId]);
      }
      await tx.run("DELETE FROM income WHERE receipt = $1 AND category = 'Student Fee'", [payment.receipt]);
      await tx.run("DELETE FROM payments WHERE id = $1", [entityId]);
    });
    return true;
  }

  if (entityType === "expense") {
    const result = await db.run("DELETE FROM expenses WHERE id = $1", [entityId]);
    return result.rowCount > 0;
  }

  if (entityType === "user-delete") {
    const result = await db.run("DELETE FROM users WHERE id = $1", [entityId]);
    return result.rowCount > 0;
  }
  return false;
}

async function applyUserUpdate(entityId, payload) {
  const existing = await db.get("SELECT * FROM users WHERE id = $1", [entityId]);
  if (!existing) return false;
  const update = { ...payload };
  if (update.name !== undefined) {
    await db.run("UPDATE users SET name = $1 WHERE id = $2", [String(update.name).trim(), entityId]);
  }
  if (update.email !== undefined) {
    await db.run("UPDATE users SET email = $1 WHERE id = $2", [String(update.email).trim().toLowerCase(), entityId]);
  }
  if (update.role !== undefined) {
    await db.run('UPDATE users SET role = $1, "isProtected" = $2 WHERE id = $3', [
      update.role,
      update.role === "Super Admin" ? 1 : 0,
      entityId,
    ]);
  }
  if (update.passwordHash !== undefined) {
    await db.run('UPDATE users SET "passwordHash" = $1 WHERE id = $2', [update.passwordHash, entityId]);
  }
  return true;
}

module.exports = { applyUserUpdate, createDeleteRequest, deleteEntity, isApprovalRole, publicRequest };

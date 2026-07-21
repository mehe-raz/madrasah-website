const db = require('../db');

async function recordBackupEvent({ event, status, user = null, backupVersion = null, backupFormat = '', report = {}, error = '' }) {
  try {
    await db.run(
      `INSERT INTO backup_restore_events
       (event, status, "requestedBy", "requestedByName", "backupVersion", "backupFormat", report, error, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)` ,
      [
        event,
        status,
        user?.id || null,
        user?.name || '',
        backupVersion,
        backupFormat,
        JSON.stringify(report || {}),
        error || '',
        new Date().toISOString(),
      ]
    );
  } catch (e) {
    console.warn('backup audit log failed:', e.message);
  }
}

module.exports = { recordBackupEvent };

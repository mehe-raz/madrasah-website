let activeRestore = null;

class RestoreLockError extends Error {
  constructor(message = 'Another restore is already running') {
    super(message);
    this.name = 'RestoreLockError';
    this.code = 'RESTORE_LOCKED';
  }
}

async function withRestoreLock(task) {
  if (activeRestore) throw new RestoreLockError();
  const startedAt = Date.now();
  activeRestore = { startedAt };
  try {
    return await task();
  } finally {
    activeRestore = null;
  }
}

function isRestoreLocked() {
  return Boolean(activeRestore);
}

module.exports = { withRestoreLock, RestoreLockError, isRestoreLocked };

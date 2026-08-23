const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.js"],
    // dbFailover.js throws synchronously at require-time when DATABASE_URL
    // isn't set (see server/src/dbFailover.js) — correct fail-fast behavior
    // for a real boot (src/index.js), but it also means any test file that
    // merely imports something which transitively requires ../db (e.g.
    // lib/results.js, lib/teacherScope.js, or any route pulling in
    // middleware/idempotency.js, lib/deleteRequests.js, lib/notifications.js,
    // lib/guardianSms.js) crashes at import time — even when that test
    // never touches a real database. A fake connection string is enough:
    // node-pg's Pool only opens a real connection on first query, and the
    // db-touching code paths these tests actually exercise are already
    // mocked with vi.mock(...).
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
  },
});

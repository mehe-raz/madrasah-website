// ============================================================================
// tenantContext.js  (Part 3 / 6 — Tenant Resolution Middleware)
// ============================================================================
// A thin AsyncLocalStorage wrapper. The tenant-resolution middleware checks
// out a dedicated pg client for the current request, sets its search_path to
// the resolved tenant's schema, and stores that client here for the
// lifetime of the request (including everything awaited inside route
// handlers, since ALS follows the async call chain automatically).
//
// pg.js reads from this context on every query/get/all/run/withTransaction
// call: if a tenant client is present, it's used instead of the shared pool.
// This is the whole reason NOT ONE of the ~20 existing route files needed to
// change for multi-tenancy — they all just call db.query()/pg.get()/etc.,
// which already funnel through pg.js.
// ============================================================================

const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

// Runs fn() inside a context where get() returns `context` for the rest of
// the (async) call chain — including code in other files that pg.js calls
// into, as long as it's reached via awaits/callbacks originating here.
function run(context, fn) {
  return storage.run(context, fn);
}

// Returns the current context ({ client, institution }) or undefined if
// called outside any tenant-resolution middleware run (e.g. at server boot,
// or in single-tenant/MULTI_TENANT_MODE=false deployments — this is what
// lets pg.js fall back to its old pool-based behavior unchanged).
function get() {
  return storage.getStore();
}

module.exports = { run, get };

const db = require("../db");

/**
 * Wraps a mutating route handler so that if the same request is resent
 * (identified by the client-generated X-Client-Request-Id header), the
 * second attempt returns the ORIGINAL response instead of re-running the
 * handler.
 *
 * This is the server half of the offline-first foundation: a request
 * queued in the browser's IndexedDB outbox (see client/src/lib/offlineDb.ts)
 * while offline may get resent — e.g. the app thinks a sync attempt failed
 * because the connection dropped mid-response, but the server actually
 * finished processing it — and without this, that retry would create a
 * second student, a second payment, etc.
 *
 * Opt-in per header: requests with no X-Client-Request-Id (anything not yet
 * going through the offline queue) pass through unchanged, so wiring this
 * onto a route today changes nothing for normal online traffic — see
 * client/src/lib/api.ts, which now sends this header on every mutating
 * request regardless of whether it's actually queued.
 */
function idempotent(handler) {
  return async function idempotentHandler(req, res, next) {
    const clientRequestId = req.get("X-Client-Request-Id");
    if (!clientRequestId) return handler(req, res, next);

    try {
      const existing = await db.get(
        `SELECT "statusCode", response FROM sync_requests WHERE "clientRequestId" = $1`,
        [clientRequestId]
      );
      if (existing) {
        return res.status(existing.statusCode).json(existing.response);
      }
    } catch (e) {
      // If the idempotency check itself fails (e.g. table not migrated yet
      // on an older deployment), don't block the real request over it —
      // fall through to normal (non-deduplicated) processing.
      console.warn("Idempotency lookup failed, proceeding without it:", e.message);
      return handler(req, res, next);
    }

    // Intercept res.json() so whatever the handler sends can be persisted
    // AFTER a real response goes out, without changing how any route below
    // constructs its response.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode;
      // Only cache responses worth replaying verbatim: successful creates
      // and "expected" client errors (e.g. 409 duplicate admission number)
      // are both a definitive, safe-to-repeat answer. A 5xx is almost
      // always transient/environmental — NOT cached, so a retry after a
      // real server hiccup gets a fresh attempt instead of a frozen error.
      if (statusCode < 500) {
        db.run(
          `INSERT INTO sync_requests ("clientRequestId", route, "statusCode", response, "createdAt")
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT ("clientRequestId") DO NOTHING`,
          [clientRequestId, req.originalUrl, statusCode, JSON.stringify(body ?? {}), new Date().toISOString()]
        ).catch((e) => console.warn("Idempotency save failed:", e.message));
      }
      return originalJson(body);
    };

    return handler(req, res, next);
  };
}

module.exports = { idempotent };

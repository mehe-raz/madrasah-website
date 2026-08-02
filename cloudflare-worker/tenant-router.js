/**
 * tenant-router.js — Cloudflare Worker
 *
 * Free replacement for a GCP external HTTPS Load Balancer + reserved static
 * IP. Terminates *.{ROOT_DOMAIN} traffic at Cloudflare's edge (free
 * Universal SSL covers one wildcard level) and forwards every request to
 * this project's Cloud Run service's default *.run.app URL — the app
 * itself already resolves the tenant from the hostname, so nothing else
 * changes.
 *
 * SETUP
 * 1. Cloudflare dashboard -> your zone (oriluxbd.com) -> Workers Routes:
 *      *.oriluxbd.com/*   ->  this worker
 *      oriluxbd.com/*     ->  this worker   (optional, if you want the
 *                                            apex/marketing page through
 *                                            the same path too)
 * 2. DNS: add a proxied (orange-cloud) "A" record for "*" pointing to any
 *    dummy IP (e.g. 192.0.2.1) — the IP is never actually used, since the
 *    Worker route intercepts the request before Cloudflare would reach it.
 * 3. Worker -> Settings -> Variables and Secrets: add
 *      CF_WORKER_SHARED_SECRET   (a long random string; put the SAME value
 *                                  in the backend's env as
 *                                  CF_WORKER_SHARED_SECRET)
 * 4. Edit CLOUD_RUN_ORIGIN below to your service's default run.app URL
 *    (Cloud Run console -> madrasah-erp -> URL field).
 */

const CLOUD_RUN_ORIGIN = "https://madrasah-erp-624173976846.asia-northeast1.run.app";

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);
    const originalHost = incomingUrl.hostname;

    const targetUrl = new URL(CLOUD_RUN_ORIGIN);
    targetUrl.pathname = incomingUrl.pathname;
    targetUrl.search = incomingUrl.search;

    const forwardedHeaders = new Headers(request.headers);
    // The Fetch API forbids setting "Host" directly, so the original
    // hostname is passed via a custom header instead. The shared secret
    // stops anyone from spoofing this header by calling the run.app URL
    // directly — without it, the backend falls back to normal Host-based
    // resolution, which will not match any tenant for a raw run.app host.
    forwardedHeaders.set("x-original-host", originalHost);
    forwardedHeaders.set("x-worker-secret", env.CF_WORKER_SHARED_SECRET);
    // Preserve the real client IP for logging/rate-limiting on the backend.
    forwardedHeaders.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "");

    const proxiedRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardedHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    return fetch(proxiedRequest);
  },
};

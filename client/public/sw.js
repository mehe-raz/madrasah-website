/** Service worker for offline shell + static asset caching | PWA অফলাইন শেল */
const SHELL_CACHE = "madrasah-erp-shell-v2";
const ASSET_CACHE = "madrasah-erp-assets-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(["/", "/index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // Drop caches from older versions of this service worker so upgrades
  // don't leave stale assets sitting around forever.
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    (/\.(js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|avif|ico)$/i.test(url.pathname) ||
      url.pathname.startsWith("/assets/"))
  );
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Cross-origin requests (Cloudinary images, Google Fonts, etc.) should
  // never be re-fetched from inside the service worker: a fetch() issued
  // here is checked against the page's connect-src CSP directive (not
  // img-src/style-src), so unless every third-party host is also added to
  // connect-src, the SW's own fetch gets CSP-blocked and the resource
  // appears broken even though the browser could have loaded it directly.
  // Simplest, most future-proof fix: don't intercept these at all — let
  // the browser handle them natively.
  if (url.origin !== self.location.origin) return;

  // API responses must always be fresh (attendance, fees, dashboard data
  // etc.) — never let the service worker serve a cached copy of these.
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(e.request)) {
    // Cache-first with stale-while-revalidate: hashed JS/CSS/image assets
    // load instantly from cache on repeat visits, while a background
    // refetch keeps the cache updated for the *next* visit.
    e.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request)
          .then((res) => {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Navigations/HTML: network-first, falling back to the cached shell when
  // offline (unchanged behaviour from before).
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});

// ---------------------------------------------------------------------------
// Guardian Push Notifications (docs/PUSH_NOTIFICATION_PLAN.md — Phase 3).
// The payload is whatever JSON lib/guardianPush.js's notifyGuardians()
// sent — { title, body, url }. This listener never talks to the app's own
// fetch/cache logic above; a push can arrive even with the app fully
// closed, which is the entire point.
// ---------------------------------------------------------------------------

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    // Not valid JSON — fall back to an empty payload rather than crash the
    // event, so at minimum no notification silently disappears.
  }
  const title = data.title || "নোটিফিকেশন";
  const options = {
    body: data.body || "",
    icon: "/icon.svg",
    data: { url: data.url || "/" },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      // Reuse an already-open tab if one exists (same-origin), instead of
      // always opening a new one — same-origin `focus()` + `navigate()` is
      // allowed from a service worker without extra permissions.
      for (const client of clientsList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});


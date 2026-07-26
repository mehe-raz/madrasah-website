(function () {
  // External, same-origin script (not inline) — this app's CSP is
  // script-src 'self' with no 'unsafe-inline', so an inline <script> block
  // would be silently blocked by the browser and never run.

  // Only show the splash on an actual browser reload (F5 / refresh) — never
  // on first visit to the panel or normal in-app navigation.
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    var isReload =
      (nav && nav.type === "reload") ||
      (window.performance && window.performance.navigation && window.performance.navigation.type === 1);
    if (isReload) document.documentElement.classList.add("rs-reload");
  } catch (e) {}

  function hideSplash() {
    var el = document.getElementById("reload-splash");
    if (!el) return;
    el.classList.add("rs-hide");
    setTimeout(function () {
      el.style.display = "none";
    }, 400);
  }

  // app.js dispatches "app:ready" once the panel has rendered; a timeout
  // fallback guarantees the splash can never get stuck if that's missed.
  window.addEventListener("app:ready", hideSplash, { once: true });
  setTimeout(hideSplash, 4000);
})();

(function () {
  // Runs as an external, same-origin script (not inline) because this app's
  // CSP is script-src 'self' with no 'unsafe-inline' — an inline <script>
  // block would be silently blocked by the browser and never execute.

  // Match the app's saved theme before first paint, so the splash background
  // doesn't flash the wrong color.
  try {
    var cached = localStorage.getItem("madrasah-settings");
    if (cached) {
      var theme = JSON.parse(cached).theme;
      document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    }
  } catch (e) {}

  // Only show the splash on an actual browser reload (F5 / refresh) of this
  // page — never on first visit, first login, or normal in-app navigation.
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

  // The app fires "app:ready" once its shell has mounted; a timeout fallback
  // guarantees the splash can never get stuck if that event is missed.
  window.addEventListener("app:ready", hideSplash, { once: true });
  setTimeout(hideSplash, 4000);
})();

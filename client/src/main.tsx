import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppSettingsProvider } from "./context/AppSettingsContext";
import { PublicSiteProvider } from "./context/PublicSiteContext";
import "./index.css";

const cached = localStorage.getItem("madrasah-settings");
if (cached) {
  try {
    const { theme } = JSON.parse(cached);
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  } catch {
    /* ignore */
  }
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // hadController: false on a visitor's very first-ever visit (nothing was
  // controlling the page yet, so there's nothing to "update" — no reload
  // needed). true on every later deploy, once a previous Service Worker is
  // already active — that's the case this reload is actually for: without
  // it, a tab left open across a deploy silently keeps running the old
  // build until the person happens to refresh on their own.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppSettingsProvider>
      <PublicSiteProvider>
        <App />
      </PublicSiteProvider>
    </AppSettingsProvider>
  </StrictMode>
);

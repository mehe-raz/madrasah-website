import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppSettingsProvider } from "./context/AppSettingsContext";
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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppSettingsProvider>
      <App />
    </AppSettingsProvider>
  </StrictMode>
);

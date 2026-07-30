/**
 * Madrasa name & title sitewide | সাইটজুড়ে মাদ্রাসার নাম
 */
import { useEffect } from "react";
import { useAppSettings } from "../context/AppSettingsContext";

export function useMadrasaBranding() {
  const { settings } = useAppSettings();
  const name = settings.name || "Madrasah ERP";

  useEffect(() => {
    document.title = `${name} — ERP`;

    // Every page that uses this hook (Login + all authenticated admin
    // pages via Layout/Sidebar) is either a login gate or requires auth —
    // none of it belongs in search results, unlike the public marketing
    // pages (Home/About/Admission/...), which set their own "index, follow"
    // via useSeoMeta.
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex, nofollow");
  }, [name]);

  return { name, logo: settings.logo, settings };
}

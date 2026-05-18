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
  }, [name]);

  return { name, logo: settings.logo, settings };
}

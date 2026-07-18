import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_SETTINGS } from "../data/mockData";
import { bn, type Dict } from "../i18n/bn";
import { en } from "../i18n/en";
import { api } from "../lib/api";
import type { Settings, User } from "../types";

type Lang = "bn" | "en";

interface AppSettingsContextValue {
  settings: Settings;
  setSettings: (s: Settings) => void;
  saveSettings: (s?: Settings) => Promise<void>;
  lang: Lang;
  t: Dict;
  tr: (key: string, values?: Record<string, string | number>) => string;
  theme: "light" | "dark";
  users: User[];
  refreshUsers: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

function applyTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}

function loadCachedSettings(): Settings {
  try {
    const raw = localStorage.getItem("madrasah-settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadCachedSettings);
  const [users, setUsers] = useState<User[]>([]);

  const lang = (settings.lang === "en" ? "en" : "bn") as Lang;
  const theme: "light" | "dark" = settings.theme === "dark" ? "dark" : "light";
  const t = lang === "en" ? en : bn;
  const tr = useCallback(
    (key: string, values?: Record<string, string | number>) => {
      const read = (path: string) =>
        path.split(".").reduce<unknown>((acc, part) => {
          if (acc && typeof acc === "object" && part in acc) return (acc as Record<string, unknown>)[part];
          return undefined;
        }, t);
      const count = Number(values?.count);
      const pluralKey = values && Number.isFinite(count) && count !== 1 ? `${key}_plural` : key;
      const template = read(pluralKey) ?? read(key);
      const text = typeof template === "string" ? template : key;
      return text.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
    },
    [t]
  );

  const refreshUsers = useCallback(async () => {
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch {
      setUsers([]);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.getSettings();
      const merged = { ...DEFAULT_SETTINGS, ...s } as Settings;
      setSettings(merged);
      applyTheme(merged.theme);
      localStorage.setItem("madrasah-settings", JSON.stringify(merged));
    } catch {
      /* use cached / defaults until logged in */
    }
  }, []);

  useEffect(() => {
    refreshSettings();
    refreshUsers();
  }, [refreshSettings, refreshUsers]);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("madrasah-settings", JSON.stringify(settings));
  }, [theme, settings]);

  const saveSettings = useCallback(
    async (next?: Settings) => {
      const payload = next ?? settings;
      try {
        const updated = { ...DEFAULT_SETTINGS, ...(await api.saveSettings(payload)) } as Settings;
        setSettings(updated);
        applyTheme(updated.theme);
        localStorage.setItem("madrasah-settings", JSON.stringify(updated));
      } catch {
        setSettings(payload);
        applyTheme(payload.theme);
        localStorage.setItem("madrasah-settings", JSON.stringify(payload));
      }
    },
    [settings]
  );

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      saveSettings,
      lang,
      t,
      tr,
      theme,
      users,
      refreshUsers,
      refreshSettings,
    }),
    [settings, saveSettings, lang, t, tr, theme, users, refreshUsers, refreshSettings]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error("useAppSettings must be used within AppSettingsProvider");
  return ctx;
}

export function useLanguage() {
  const { lang, t, tr } = useAppSettings();
  return { lang, t, tr };
}

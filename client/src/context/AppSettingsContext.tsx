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
import type { ClassOption, Settings, User } from "../types";

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
  // Tenant's class/jamaat master list (bn label + en data-slug), managed by
  // Super Admin from Settings and consumed by the admission form's class
  // dropdown. See server/src/lib/classOptions.js.
  classOptions: ClassOption[];
  refreshClassOptions: () => Promise<void>;
  saveClassOptions: (options: Pick<ClassOption, "bn" | "en">[]) => Promise<void>;
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
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);

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

  const refreshClassOptions = useCallback(async () => {
    try {
      setClassOptions(await api.getClassOptions());
    } catch {
      setClassOptions([]);
    }
  }, []);

  const saveClassOptionsFn = useCallback(async (options: Pick<ClassOption, "bn" | "en">[]) => {
    const updated = await api.saveClassOptions(options);
    setClassOptions(updated);
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
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      refreshSettings();
      refreshClassOptions();
    };

    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const handle = win.requestIdleCallback
      ? win.requestIdleCallback(run, { timeout: 2000 })
      : window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      if (win.cancelIdleCallback && typeof handle === "number") win.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [refreshSettings, refreshClassOptions]);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("madrasah-settings", JSON.stringify(settings));
  }, [theme, settings]);

  const saveSettings = useCallback(
    async (next?: Settings) => {
      const payload = next ?? settings;
      // Previously a failed save (network error, permission denied, etc.)
      // still applied `payload` to local state/localStorage in the catch
      // branch below, so the UI showed "Saved" even though the server
      // never persisted it — the real settings would then silently
      // reappear on the next refresh/login with no explanation. Now a
      // failure is rethrown so the caller (Settings.tsx) can show an
      // actual error instead of a false "Saved" message.
      const updated = { ...DEFAULT_SETTINGS, ...(await api.saveSettings(payload)) } as Settings;
      setSettings(updated);
      applyTheme(updated.theme);
      localStorage.setItem("madrasah-settings", JSON.stringify(updated));
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
      classOptions,
      refreshClassOptions,
      saveClassOptions: saveClassOptionsFn,
    }),
    [
      settings,
      saveSettings,
      lang,
      t,
      tr,
      theme,
      users,
      refreshUsers,
      refreshSettings,
      classOptions,
      refreshClassOptions,
      saveClassOptionsFn,
    ]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives with its provider/context; splitting would touch ~19 unrelated consumer files (AGENTS.md Rule 1: minimal diff)
export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error("useAppSettings must be used within AppSettingsProvider");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components -- see useAppSettings above
export function useLanguage() {
  const { lang, t, tr } = useAppSettings();
  return { lang, t, tr };
}

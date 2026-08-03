import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import type { GuardianUser } from "../types";

interface GuardianAuthContextValue {
  user: GuardianUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const GuardianAuthContext = createContext<GuardianAuthContextValue | null>(null);

export function GuardianAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GuardianUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.guardian.me();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time async session check on mount, same pattern as AuthContext
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const { user: u } = await api.guardian.login(identifier, password);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api.guardian.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);

  return <GuardianAuthContext.Provider value={value}>{children}</GuardianAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives with its provider/context, same as useAuth in AuthContext.tsx
export function useGuardianAuth() {
  const ctx = useContext(GuardianAuthContext);
  if (!ctx) throw new Error("useGuardianAuth must be used within GuardianAuthProvider");
  return ctx;
}

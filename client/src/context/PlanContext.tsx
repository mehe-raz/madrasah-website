import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";

export interface PlanFeatureMeta {
  label: string;
  comingSoon: boolean;
  minPlan: string | null;
}

interface PlanContextValue {
  // null before the first fetch resolves AND whenever GET /api/plan 404s
  // (single-tenant deployment — no plan concept at all). Either way,
  // isLocked() below always returns false while features is null, so a
  // single-tenant deployment (or a still-loading tenant one) never shows a
  // lock screen it shouldn't.
  plan: string | null;
  features: Record<string, boolean> | null;
  featureMeta: Record<string, PlanFeatureMeta>;
  loading: boolean;
  // True only once features has actually loaded AND that specific key is
  // explicitly false. Never true while features is null (still loading, or
  // this deployment has no plan concept — see comment on `features` above).
  isLocked: (feature: string) => boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<string | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [featureMeta, setFeatureMeta] = useState<Record<string, PlanFeatureMeta>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getPlanFeatures()
      .then((data) => {
        if (cancelled) return;
        setPlan(data.plan);
        setFeatures(data.features);
        setFeatureMeta(data.featureMeta);
      })
      .catch(() => {
        // 404 (single-tenant deployment, no plan concept) or a network/auth
        // hiccup — either way, fail open: leave features null so isLocked()
        // never blocks anything. A real permission gate still sits behind
        // every gated server route regardless of what this UI shows.
        if (!cancelled) {
          setPlan(null);
          setFeatures(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<PlanContextValue>(
    () => ({
      plan,
      features,
      featureMeta,
      loading,
      isLocked: (feature: string) => features !== null && features[feature] === false,
    }),
    [plan, features, featureMeta, loading]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives with its provider/context, same pattern as useAppSettings in AppSettingsContext.tsx
export function usePlanFeatures() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlanFeatures must be used within PlanProvider");
  return ctx;
}

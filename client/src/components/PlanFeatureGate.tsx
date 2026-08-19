import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/AppSettingsContext";
import { usePlanFeatures } from "../context/PlanContext";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Icons } from "../lib/icons";

const TIER_LABEL_KEY: Record<string, "tierBasic" | "tierStandard" | "tierPro" | "tierPremium"> = {
  basic: "tierBasic",
  standard: "tierStandard",
  pro: "tierPro",
  premium: "tierPremium",
};

interface PlanFeatureGateProps {
  /** Key matching server/src/config/planFeatures.js (e.g. "feesCollection"). */
  feature: string;
  children: ReactNode;
}

/**
 * Renders `children` normally unless the current institution's plan doesn't
 * include `feature` — in which case it renders an upgrade card instead.
 * Feature labels/comingSoon/minPlan all come from GET /api/plan's
 * featureMeta (server/src/config/planFeatures.js's FEATURE_META), so this
 * component never hand-duplicates that mapping.
 *
 * Single-tenant deployments (no plan concept) and the brief loading window
 * both fall through to "unlocked" via usePlanFeatures().isLocked() — see
 * PlanContext.tsx.
 */
export function PlanFeatureGate({ feature, children }: PlanFeatureGateProps) {
  const { isLocked, featureMeta, plan } = usePlanFeatures();
  const { t: lang, tr } = useLanguage();

  if (!isLocked(feature)) return <>{children}</>;

  const meta = featureMeta[feature];
  const label = meta?.label ?? feature;
  const currentPlanLabel = plan && TIER_LABEL_KEY[plan] ? lang.pricing[TIER_LABEL_KEY[plan]] : plan ?? "-";
  const requiredPlanLabel =
    meta?.minPlan && TIER_LABEL_KEY[meta.minPlan] ? lang.pricing[TIER_LABEL_KEY[meta.minPlan]] : lang.pricing.priceUnknown;

  return (
    <Card className="plan-lock">
      <div className="plan-lock__icon" aria-hidden="true">
        <Icons.lock size={36} />
      </div>
      <h2 className="plan-lock__title">{lang.planLock.title}</h2>
      <p className="plan-lock__message">
        {meta?.comingSoon
          ? tr("planLock.comingSoonMessage", { feature: label })
          : meta?.minPlan
          ? tr("planLock.message", { feature: label, currentPlan: currentPlanLabel, requiredPlan: requiredPlanLabel })
          : tr("planLock.notAvailableMessage", { feature: label })}
      </p>
      <div className="plan-lock__actions">
        <Link to="/pricing">
          <Button variant="sky" solid>
            {lang.planLock.pricingCta}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

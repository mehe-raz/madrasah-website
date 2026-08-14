import { useEffect, useState } from "react";
import { usePublicSite } from "../hooks/usePublicSite";
import { useSeoMeta } from "../hooks/useSeoMeta";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { PublicPageSkeleton } from "../components/PublicPageSkeleton";
import { api } from "../lib/api";
import { Icons } from "../lib/icons";

const TIER_LABELS: Record<string, string> = {
  basic: "বেসিক",
  standard: "স্ট্যান্ডার্ড",
  pro: "প্রো",
  premium: "প্রিমিয়াম",
};

// Order matters for display — matches server/src/config/planFeatures.js's
// key order. Kept as a fixed list (rather than Object.keys(featureMeta),
// whose order isn't guaranteed to match) so the checklist reads top-to-
// bottom in the same order across all 4 cards.
const ALWAYS_ON_FEATURE_ORDER = ["feesCollection", "expenses", "hifzTracking", "reportsExport", "assignmentsBroadcast", "auditLogs", "customDomain"];
const COMING_SOON_FEATURE_ORDER = ["payroll", "library", "idCards", "hostel", "sms", "bkash"];

interface PlanTiersData {
  planFeatures: Record<string, Record<string, boolean>>;
  planOrder: string[];
  featureMeta: Record<string, { label: string; comingSoon: boolean }>;
}

export function Pricing() {
  const { site, content, loading } = usePublicSite();
  const [tiers, setTiers] = useState<PlanTiersData | null>(null);
  const [tiersLoading, setTiersLoading] = useState(true);

  useSeoMeta({
    title: `প্ল্যান ও মূল্য — ${site.name}`,
    description: `${site.name} পরিচালনার জন্য উপযুক্ত প্ল্যান বেছে নিন — বেসিক, স্ট্যান্ডার্ড, প্রো ও প্রিমিয়াম।`,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicPlanTiers()
      .then((data) => {
        if (!cancelled) setTiers(data);
      })
      .catch(() => {
        if (!cancelled) setTiers(null);
      })
      .finally(() => {
        if (!cancelled) setTiersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PublicPageSkeleton />;

  return (
    <div className="app-shell page-shell">
      <div className="pattern-bg" aria-hidden />
      <PublicHeader site={site} classes={content.classes} />

      <section className="section-shell hero-shell section-pop">
        <div className="soft-panel-strong legal-content">
          <span className="pill legal-page__badge">মূল্য পরিকল্পনা</span>
          <h1 className="section-heading legal-page__heading">প্ল্যান ও মূল্য</h1>
          <p className="pricing-core-note">
            সব প্ল্যানেই বিনামূল্যে থাকছে: শিক্ষার্থী ব্যবস্থাপনা, হাজিরা, ফলাফল, নোটিশ/ওয়েবসাইট ও অভিভাবক পোর্টাল। নিচের
            ফিচারগুলো প্ল্যানভেদে যুক্ত হয়।
          </p>
        </div>
      </section>

      <section className="section-shell page-section section-pop">
        {tiersLoading && <PublicPageSkeleton />}
        {!tiersLoading && !tiers && <p className="hint-text">প্ল্যান তথ্য লোড করা যায়নি — একটু পরে আবার চেষ্টা করুন।</p>}
        {!tiersLoading && tiers && (
          <div className="pricing-grid">
            {tiers.planOrder.map((tier) => {
              const features = tiers.planFeatures[tier] || {};
              const isPremium = tier === "premium";
              return (
                <div key={tier} className={`ds-card pricing-card ${isPremium ? "pricing-card--highlight" : ""}`}>
                  <h2 className="pricing-card__tier">{TIER_LABELS[tier] || tier}</h2>
                  <p className="pricing-card__price">যোগাযোগ করুন — মূল্য শীঘ্রই</p>
                  <ul className="pricing-card__features">
                    {ALWAYS_ON_FEATURE_ORDER.map((key) => {
                      const meta = tiers.featureMeta[key];
                      if (!meta) return null;
                      const included = !!features[key];
                      return (
                        <li key={key} className="pricing-card__feature">
                          <span className="pricing-card__feature-icon" aria-hidden="true">
                            {included ? <Icons.checkCircle size={16} /> : "—"}
                          </span>
                          <span>{meta.label}</span>
                        </li>
                      );
                    })}
                    {isPremium &&
                      COMING_SOON_FEATURE_ORDER.map((key) => {
                        const meta = tiers.featureMeta[key];
                        if (!meta) return null;
                        return (
                          <li key={key} className="pricing-card__feature pricing-card__feature--comingsoon">
                            <span className="pricing-card__feature-icon" aria-hidden="true">
                              <Icons.clock size={16} />
                            </span>
                            <span>
                              {meta.label} <span className="pill">শীঘ্রই আসছে</span>
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PublicFooter site={site} />
    </div>
  );
}

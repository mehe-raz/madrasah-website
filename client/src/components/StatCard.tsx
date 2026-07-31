import { Card } from "./ui";

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
  sub?: string;
}

export function StatCard({ label, value, color, icon, sub }: StatCardProps) {
  return (
    <Card className="stat-card">
      <div className="stat-card__head">
        <span className="stat-card__label">{label}</span>
        {/* Icon tint is per-instance data (a category color passed by the
            caller), not a fixed design-system value, so it can't be a CSS
            class — this is the narrow, documented inline-style exception
            described in AGENTS.md's Design System section. */}
        {/* eslint-disable-next-line no-restricted-syntax -- dynamic per-instance color, see comment above */}
        <span className="stat-card__icon" style={{ background: color + "18" }}>
          {icon}
        </span>
      </div>
      <div className="stat-card__value">{value}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </Card>
  );
}

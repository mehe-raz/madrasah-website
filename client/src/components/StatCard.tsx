import type { KeyboardEvent } from "react";
import { Card } from "./ui";
import { Icons, type IconKey } from "../lib/icons";

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  icon: IconKey;
  sub?: string;
  // Optional — most stat cards are display-only. When provided, the card
  // becomes clickable (mouse + keyboard). Existing call sites that don't
  // pass this prop are unaffected (no role/tabIndex/cursor change).
  onClick?: () => void;
}

export function StatCard({ label, value, color, icon, sub, onClick }: StatCardProps) {
  const Icon = Icons[icon];
  const clickableProps = onClick
    ? {
        onClick,
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return (
    <Card
      className={`stat-card${onClick ? " stat-card--clickable" : ""}`}
      {...clickableProps}
    >
      <div className="stat-card__head">
        <span className="stat-card__label">{label}</span>
        {/* Icon tint is per-instance data (a category color passed by the
            caller), not a fixed design-system value, so it can't be a CSS
            class — this is the narrow, documented inline-style exception
            described in AGENTS.md's Design System section. */}
        {/* eslint-disable-next-line no-restricted-syntax -- dynamic per-instance color, see comment above */}
        <span className="stat-card__icon" style={{ background: color + "18" }}>
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
      <div className="stat-card__value">{value}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </Card>
  );
}

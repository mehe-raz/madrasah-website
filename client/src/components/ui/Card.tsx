import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Smaller radius/padding — for nested cards (e.g. a stat tile inside a
   * modal), as opposed to the page-level section card. */
  tight?: boolean;
}

export function Card({ tight, className = "", ...rest }: CardProps) {
  const cls = ["ds-card", tight ? "ds-card--tight" : "", className].filter(Boolean).join(" ");
  return <div className={cls} {...rest} />;
}

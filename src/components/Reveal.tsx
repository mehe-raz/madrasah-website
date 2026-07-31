import type { CSSProperties, ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

interface RevealProps {
  children: ReactNode;
  /** "image" = slides up further + scales in slightly (for photos/illustrations); "text" = subtle fade+rise (for headings/paragraphs). */
  variant?: "image" | "text";
  className?: string;
  style?: CSSProperties;
}

/**
 * Wraps children in a scroll-triggered reveal animation (see useReveal.ts).
 * Safe to use inside .map() — each <Reveal> instance owns its own ref/hook call,
 * so this doesn't violate the rules of hooks the way calling useReveal() directly
 * inside a loop callback would.
 */
export function Reveal({ children, variant = "text", className = "", style }: RevealProps) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal reveal-${variant} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

import type { CSSProperties } from "react";

type HudSpinnerProps = {
  /** Diameter in pixels. Defaults to 64. */
  size?: number;
  /** Extra class names, e.g. for margin/positioning where it's used. */
  className?: string;
};

/**
 * The site's one reusable loading spinner — a small HUD-style cluster of
 * rotating rings in the theme's accent color. Same design as the reload
 * splash in index.html, so it should be the only spinner used anywhere in
 * the app (page-section loaders, dialogs, buttons, etc.) rather than each
 * spot inventing its own.
 */
export function HudSpinner({ size = 64, className }: HudSpinnerProps) {
  return (
    <div
      className={"hud-spinner" + (className ? ` ${className}` : "")}
      style={{ "--hud-size": `${size}px` } as CSSProperties}
      role="status"
      aria-label="লোড হচ্ছে"
    >
      <div className="hud-spinner__ring hud-spinner__ring--r1" />
      <div className="hud-spinner__ring hud-spinner__ring--r2">
        <span className="hud-spinner__dot" />
        <span className="hud-spinner__dot" />
        <span className="hud-spinner__dot" />
        <span className="hud-spinner__dot" />
      </div>
      <div className="hud-spinner__ring hud-spinner__ring--r3" />
      <div className="hud-spinner__ring hud-spinner__ring--r4" />
      <div className="hud-spinner__ring hud-spinner__ring--r5" />
    </div>
  );
}

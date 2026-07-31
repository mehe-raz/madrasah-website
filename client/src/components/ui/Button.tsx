import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "sky" | "emerald" | "rose" | "amber" | "violet" | "teal" | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Color of the button. "outline" (default) is the neutral/secondary look
   * used for things like Prev/Next/Close. */
  variant?: ButtonVariant;
  /** Filled/solid background instead of the light tint — for the one primary
   * action on a screen (e.g. the main "Save"). Has no effect on "outline". */
  solid?: boolean;
  fullWidth?: boolean;
}

/**
 * Design-system button. See client/src/index.css (".ds-btn*") for the
 * variant colors and AGENTS.md → "Design System (mandatory)" for the rule
 * this exists to satisfy: modules should not hand-write
 * `style={{ border: "none", background: C.emeraldL, ... }}` per button.
 */
export function Button({ variant = "outline", solid, fullWidth, className = "", type = "button", ...rest }: ButtonProps) {
  const variantClass = variant === "outline" ? "ds-btn--outline" : `ds-btn--${variant}${solid ? "-solid" : ""}`;
  const cls = ["ds-btn", variantClass, fullWidth ? "ds-btn--full" : "", className].filter(Boolean).join(" ");
  return <button type={type} className={cls} {...rest} />;
}

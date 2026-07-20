/**
 * ═══════════════════════════════════════════════════════════════
 * PREMIUM DESIGN SYSTEM — inspired by high-end watchmaking houses
 * (deep ink & charcoal cases, brushed brass/gold accents, cream
 * dials, jewel-tone complications). Token names are kept stable
 * so existing call-sites continue to work unchanged.
 * ═══════════════════════════════════════════════════════════════
 */

export const C = {
  // Brand / primary accent — antique brass & gold (was "teal")
  teal: "#a9812f",
  tealL: "#f6efdc",
  tealD: "#5c4415",

  // Success / income — deep bottle emerald (was "emerald")
  emerald: "#1d6b4f",
  emeraldL: "#dcece3",
  emeraldD: "#0f3f2e",

  // Warning / caution — cognac amber (was "amber")
  amber: "#b0741e",
  amberL: "#f6e8ce",
  amberD: "#6b4310",

  // Danger / expense — deep oxblood (was "rose")
  rose: "#9c3b3b",
  roseL: "#f3dede",
  roseD: "#601f1f",

  // Special / admin accents — deep plum (was "violet")
  violet: "#6a3f6a",
  violetL: "#ece0ea",
  violetD: "#3a1f3a",

  // Info — steel blue-grey (was "sky")
  sky: "#456186",
  skyL: "#dde5ee",
  skyD: "#233247",

  // Neutral ink tones (was "slate")
  slate: "#3a352c",
  slateD: "#141210",

  // Surfaces & structure (theme-aware, see index.css)
  bg: "var(--bg)",
  card: "var(--card)",
  border: "var(--border)",
  text: "var(--text)",
  muted: "var(--muted)",
  slateL: "var(--slate-l)",

  // Links / inline emphasis
  link: "#8a6a2f",
} as const;

export const PIE_COLORS = [C.teal, C.emerald, C.amber, C.violet];

/* ── Design tokens ─────────────────────────────────────────── */

export const RADIUS = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const SPACE = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const SHADOW = {
  card: "0 1px 2px rgba(20,16,10,0.04), 0 6px 20px rgba(20,16,10,0.06)",
  cardHover: "0 2px 6px rgba(20,16,10,0.06), 0 12px 28px rgba(20,16,10,0.10)",
  raised: "0 10px 40px rgba(20,16,10,0.12)",
  gold: "0 4px 14px rgba(169,129,47,0.28)",
  inset: "inset 0 1px 2px rgba(20,16,10,0.05)",
} as const;

export const FONT = {
  heading: "'Playfair Display', 'Noto Serif Bengali', Georgia, serif",
  body: "'Noto Sans Bengali', 'Inter', -apple-system, sans-serif",
} as const;

/* ── Reusable style fragments (spread into inline styles) ───── */

export const cardStyle = {
  background: C.card,
  borderRadius: RADIUS.lg,
  border: `1px solid ${C.border}`,
  boxShadow: SHADOW.card,
} as const;

export const sectionTitleStyle = {
  fontFamily: FONT.heading,
  fontSize: 16,
  fontWeight: 700,
  color: C.text,
  letterSpacing: 0.2,
} as const;

export const inputStyle = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.sm,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box" as const,
  background: C.card,
  color: C.text,
};

export function btnPrimary(color: string = C.teal) {
  return {
    background: color,
    color: "#fdfbf6",
    border: "none",
    borderRadius: RADIUS.sm,
    padding: "10px 18px",
    fontWeight: 700,
    cursor: "pointer" as const,
    fontSize: 13,
    letterSpacing: 0.3,
    boxShadow: SHADOW.gold,
  };
}

export const btnSecondary = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.sm,
  padding: "9px 16px",
  fontWeight: 600,
  cursor: "pointer" as const,
  fontSize: 13,
};

export const C = {
  emerald: "#10b981",
  emeraldL: "#dcfce7",
  emeraldD: "#047857",

  teal: "#14b8a6",
  tealL: "#ccfbf1",
  tealD: "#0f766e",

  amber: "#f59e0b",
  amberL: "#fef3c7",
  amberD: "#b45309",

  rose: "#fb7185",
  roseL: "#ffe4e6",
  roseD: "#be123c",

  violet: "#8b5cf6",
  violetL: "#ede9fe",
  violetD: "#6d28d9",

  sky: "#0ea5e9",
  skyL: "#e0f2fe",
  skyD: "#075985",

  slate: "#64748b",
  slateD: "#0f172a",

  bg: "var(--bg)",
  card: "var(--card)",
  surface: "var(--surface)",
  border: "var(--border)",
  text: "var(--text)",
  muted: "var(--muted)",
  slateL: "var(--slate-l)",
  link: "#0ea5e9",

  // Public-site-only: the institution's own accent color (Settings >
  // brandColor), applied as --brand by PublicSiteContext. Falls back to the
  // same sky-blue used everywhere else until an institution picks its own.
  // brandL/brandD are derived with CSS color-mix() (no extra JS/deps) for
  // light-tint badges and a darker hover/pressed state.
  brand: "var(--brand)",
  brandL: "color-mix(in srgb, var(--brand) 16%, white)",
  brandD: "color-mix(in srgb, var(--brand) 80%, black)",
} as const;

export const PIE_COLORS = [C.sky, C.emerald, C.amber, C.violet];

import type { CSSProperties } from "react";
import { C } from "../theme/colors";

type SkeletonBlockProps = {
  /** Width of the placeholder bar. Number = px, string = any CSS width. */
  width?: number | string;
  /** Height of the placeholder bar. Number = px, string = any CSS height. */
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
};

/**
 * A single shimmering placeholder bar. The building block for every
 * skeleton in the app — compose these into row/card/table skeletons
 * rather than reaching for HudSpinner when the shape of the content
 * being loaded is already known (a list, a table, a card grid).
 * HudSpinner stays reserved for unknown-duration, unknown-shape waits
 * (app boot, auth-check, a single file being read).
 */
export function SkeletonBlock({ width = "100%", height = 13, radius = 6, style }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className="skeleton-block"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * Drop-in replacement for a table's loading state — renders `rows` of
 * placeholder `<tr>`s with `columns` cells each, matching the padding of
 * the real rows so the table doesn't jump in height once data arrives.
 * Use inside <tbody>, e.g. `{loading && items.length === 0 ? <SkeletonTableRows rows={6} columns={5} /> : ...}`.
 */
export function SkeletonTableRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} style={{ borderBottom: `1px solid ${C.border}` }} aria-hidden="true">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} style={{ padding: "10px 14px" }}>
              <SkeletonBlock height={12} width={c === 0 ? "36%" : "72%"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Placeholder for a vertical list of bordered cards/rows — the pattern
 * used for admission applications, saved results, drive-file lists, etc.
 * `lines` controls how many detail lines each placeholder card shows
 * below its title bar.
 */
export function SkeletonCardList({ count = 4, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <SkeletonBlock width="42%" height={14} />
            <SkeletonBlock width={64} height={14} radius={8} />
          </div>
          {lines > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Array.from({ length: lines }).map((_, l) => (
                <SkeletonBlock key={l} width={l === lines - 1 ? "55%" : "85%"} height={11} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Compact single-line row skeleton — for slim lists (e.g. Drive files). */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "6px 8px",
            background: C.card,
            borderRadius: 6,
            border: `1px solid ${C.border}`,
          }}
        >
          <SkeletonBlock width="55%" height={11} />
          <SkeletonBlock width={70} height={10} />
        </div>
      ))}
    </div>
  );
}

import type { ReactNode } from "react";
import { C } from "../theme/colors";

export interface RecordCardField {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
}

interface RecordCardProps {
  /** Main heading of the card (e.g. student name, receipt no.) */
  title: ReactNode;
  /** Secondary line under the title (e.g. roll no., english name) */
  subtitle?: ReactNode;
  /** Optional element aligned to the right of the title (e.g. amount, status badge) */
  headerRight?: ReactNode;
  /** Label/value pairs rendered in a 2-column grid */
  fields?: RecordCardField[];
  /** Action buttons rendered at the bottom of the card */
  actions?: ReactNode;
}

/**
 * A single record rendered as a card. Used as the mobile fallback for
 * table rows so wide data tables don't need horizontal scrolling on
 * small screens.
 */
export function RecordCard({ title, subtitle, headerRight, fields, actions }: RecordCardProps) {
  return (
    <div
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 14, wordBreak: "break-word" }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        {headerRight ? <div style={{ flexShrink: 0, textAlign: "right" }}>{headerRight}</div> : null}
      </div>

      {fields && fields.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {fields.map((f, i) => (
            <div key={i} style={f.fullWidth ? { gridColumn: "1 / -1" } : undefined}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{f.label}</div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, wordBreak: "break-word" }}>{f.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {actions ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4, borderTop: `1px solid ${C.border}`, marginTop: 2 }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Vertical stack wrapper for a list of RecordCards. */
export function RecordCardList({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>;
}

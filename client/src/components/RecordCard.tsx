import type { ReactNode } from "react";

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
    <div className="record-card">
      <div className="record-card__head">
        <div className="record-card__title-wrap">
          <div className="record-card__title">{title}</div>
          {subtitle ? <div className="record-card__subtitle">{subtitle}</div> : null}
        </div>
        {headerRight ? <div className="record-card__header-right">{headerRight}</div> : null}
      </div>

      {fields && fields.length > 0 ? (
        <div className="record-card__fields">
          {fields.map((f, i) => (
            <div key={i} className={f.fullWidth ? "record-card__field--full" : undefined}>
              <div className="record-card__field-label">{f.label}</div>
              <div className="record-card__field-value">{f.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {actions ? <div className="record-card__actions">{actions}</div> : null}
    </div>
  );
}

/** Vertical stack wrapper for a list of RecordCards. */
export function RecordCardList({ children }: { children: ReactNode }) {
  return <div className="record-card-list">{children}</div>;
}

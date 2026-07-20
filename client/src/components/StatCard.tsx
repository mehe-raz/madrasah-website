import { C, RADIUS, SHADOW } from "../theme/colors";

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
  sub?: string;
}

export function StatCard({ label, value, color, icon, sub }: StatCardProps) {
  return (
    <div
      style={{
        background: C.card,
        borderRadius: RADIUS.lg,
        border: `1px solid ${C.border}`,
        boxShadow: SHADOW.card,
        padding: "20px 22px",
        minWidth: 0,
        borderTop: `2px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
        <span
          style={{
            fontSize: 20,
            background: color + "16",
            borderRadius: RADIUS.sm,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <div style={{ fontSize: 25, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', 'Noto Serif Bengali', serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

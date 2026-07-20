import { C } from "../theme/colors";

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
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        padding: "18px 20px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
        <span
          style={{
            fontSize: 22,
            background: color + "18",
            borderRadius: 8,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

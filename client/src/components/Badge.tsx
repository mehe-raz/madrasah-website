interface BadgeProps {
  label: string;
  color: string;
}

export function Badge({ label, color }: BadgeProps) {
  return (
    <span
      style={{
        background: color + "1c",
        color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        padding: "3px 10px",
        borderRadius: 20,
        border: `1px solid ${color}33`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

interface BadgeProps {
  label: string;
  color: string;
}

export function Badge({ label, color }: BadgeProps) {
  return (
    <span
      style={{
        background: color + "22",
        color,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 20,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

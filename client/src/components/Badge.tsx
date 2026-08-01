interface BadgeProps {
  label: string;
  color: string;
}

export function Badge({ label, color }: BadgeProps) {
  return (
    <span
      className="badge"
      // eslint-disable-next-line no-restricted-syntax -- color is per-instance data (caller-provided), can't be a static class
      style={{ background: color + "22", color }}
    >
      {label}
    </span>
  );
}

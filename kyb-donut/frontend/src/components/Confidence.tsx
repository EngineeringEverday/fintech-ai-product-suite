export function ConfidenceBadge({
  value,
  size = "sm",
}: {
  value: number;
  size?: "sm" | "md";
}) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.9 ? "bg-conf-high/10 text-conf-high border-conf-high/30"
    : value >= 0.75 ? "bg-conf-mid/10 text-conf-mid border-conf-mid/30"
    : "bg-conf-low/10 text-conf-low border-conf-low/30";
  return (
    <span
      data-testid={`confidence-badge-${pct}`}
      className={`pill border ${tone} font-mono ${size === "md" ? "text-sm px-2.5 py-1" : ""}`}
    >
      {pct}%
    </span>
  );
}

export function confidenceColor(value: number) {
  if (value >= 0.9) return "text-conf-high";
  if (value >= 0.75) return "text-conf-mid";
  return "text-conf-low";
}

import clsx from "clsx";

const map: Record<string, string> = {
  Low: "bg-emerald-900/40 text-emerald-300 border-emerald-900/60",
  Medium: "bg-amber-900/40 text-amber-300 border-amber-900/60",
  High: "bg-orange-900/40 text-orange-300 border-orange-900/60",
  Critical: "bg-red-900/40 text-red-300 border-red-900/60",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={clsx("pill border", map[tier] || map.Low)}
      data-testid={`tier-badge-${tier.toLowerCase()}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {tier}
    </span>
  );
}

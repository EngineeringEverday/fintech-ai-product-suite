import { useMemo } from "react";
import type { ClusterSynthesis, ThemeCluster } from "@/lib/types";
import { clusterColor, sentimentColor } from "@/lib/clusters";
import { Check, Bell, X } from "lucide-react";

interface BubbleGridProps {
  clusters: ClusterSynthesis[];
  statuses: Record<string, string | null>;
  onSelect: (cluster: ThemeCluster) => void;
}

export function BubbleGrid({ clusters, statuses, onSelect }: BubbleGridProps) {
  // Scale bubble diameter by review_count
  const { minD, maxD, scale } = useMemo(() => {
    const counts = clusters.map((c) => c.review_count);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const minD = 110;
    const maxD = 220;
    const scale = (n: number) => {
      if (max === min) return (minD + maxD) / 2;
      return minD + ((n - min) / (max - min)) * (maxD - minD);
    };
    return { minD, maxD, scale };
  }, [clusters]);

  if (clusters.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 py-8 sm:py-12 px-4"
      data-testid="bubble-grid"
    >
      {clusters.map((c, i) => {
        const d = scale(c.review_count);
        const sentColor = sentimentColor(c.avg_sentiment_score, 1);
        const sentColorDim = sentimentColor(c.avg_sentiment_score, 0.25);
        const accent = clusterColor(c.cluster_name, 1);
        const status = statuses[c.cluster_name];
        return (
          <button
            key={c.cluster_name}
            data-testid={`bubble-${c.cluster_name.replace(/[^a-zA-Z]/g, "")}`}
            onClick={() => onSelect(c.cluster_name)}
            className="group relative rounded-full bubble-in transition-transform duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-emerald-400/60"
            style={{
              width: d,
              height: d,
              animationDelay: `${i * 80}ms`,
            }}
            aria-label={`${c.cluster_name} cluster, ${c.review_count} reviews, average sentiment ${c.avg_sentiment_score.toFixed(2)}`}
          >
            {/* outer glow */}
            <span
              className="absolute inset-0 rounded-full blur-2xl opacity-60 group-hover:opacity-90 transition-opacity"
              style={{ background: sentColorDim }}
              aria-hidden
            />
            {/* main disc */}
            <span
              className="absolute inset-0 rounded-full pulse-soft"
              style={{
                background: `radial-gradient(circle at 32% 28%, ${sentColor} 0%, transparent 70%), radial-gradient(circle at 70% 80%, ${accent} 0%, transparent 75%), hsl(222 24% 9%)`,
                boxShadow: `inset 0 0 0 1px hsl(222 18% 22%), 0 8px 24px hsl(0 0% 0% / 0.5)`,
              }}
              aria-hidden
            />
            {/* status badge */}
            {status && (
              <span
                className="absolute -top-1.5 -right-1.5 z-20 grid place-items-center w-7 h-7 rounded-full bg-background border border-border"
                aria-hidden
              >
                {status === "roadmap" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                {status === "monitor" && <Bell className="w-3.5 h-3.5 text-amber-400" />}
                {status === "dismissed" && <X className="w-3.5 h-3.5 text-rose-400" />}
              </span>
            )}
            {/* content */}
            <span className="relative z-10 grid place-items-center w-full h-full px-3 text-center">
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/60">
                  {c.cluster_name}
                </span>
                <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-foreground">
                  {c.review_count}
                </span>
                <span
                  className="text-[11px] font-mono tabular-nums"
                  style={{ color: sentColor }}
                >
                  {c.avg_sentiment_score >= 0 ? "+" : ""}
                  {c.avg_sentiment_score.toFixed(2)}
                </span>
                <span className="text-[10px] text-foreground/50 mt-0.5">
                  P{c.priority_score.toFixed(1)} · {c.trend}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

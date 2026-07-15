import type { ClusterSynthesis, TaggedReview } from "@/lib/types";
import { ArrowDown, ArrowUp, Minus, Flame } from "lucide-react";
import { sentimentColor } from "@/lib/clusters";

interface Props {
  tagged: TaggedReview[];
  synthesis: ClusterSynthesis[];
}

export function SummaryPanel({ tagged, synthesis }: Props) {
  if (tagged.length === 0 || synthesis.length === 0) return null;

  const overall =
    tagged.reduce((s, t) => s + t.sentiment_score, 0) / tagged.length;
  const sc = sentimentColor(overall);

  // Compute a directional trend by comparing first/second half sentiment
  const sorted = [...tagged];
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid);
  const second = sorted.slice(mid);
  const firstAvg = first.length ? first.reduce((s, t) => s + t.sentiment_score, 0) / first.length : 0;
  const secondAvg = second.length ? second.reduce((s, t) => s + t.sentiment_score, 0) / second.length : 0;
  const delta = secondAvg - firstAvg;

  const top3 = [...synthesis].sort((a, b) => b.priority_score - a.priority_score).slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4" data-testid="summary-panel">
      {/* Overall sentiment */}
      <div className="md:col-span-2 glass rounded-2xl p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-foreground/50 mb-3">
          Overall sentiment
        </div>
        <div className="flex items-baseline gap-3">
          <div
            className="text-5xl font-semibold tabular-nums tracking-tight"
            style={{ color: sc }}
            data-testid="metric-overall-sentiment"
          >
            {overall >= 0 ? "+" : ""}
            {overall.toFixed(2)}
          </div>
          <div className="flex items-center gap-1 text-xs">
            {delta > 0.05 ? (
              <>
                <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-mono">+{delta.toFixed(2)}</span>
              </>
            ) : delta < -0.05 ? (
              <>
                <ArrowDown className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-400 font-mono">{delta.toFixed(2)}</span>
              </>
            ) : (
              <>
                <Minus className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-mono">flat</span>
              </>
            )}
            <span className="text-foreground/40 ml-1">vs. earlier window</span>
          </div>
        </div>
        <div className="mt-5 flex items-end gap-6">
          <div>
            <div className="text-3xl font-semibold tabular-nums" data-testid="metric-total-reviews">
              {tagged.length}
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-foreground/50">
              reviews analyzed
            </div>
          </div>
          <div>
            <div className="text-3xl font-semibold tabular-nums">{synthesis.length}</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-foreground/50">
              clusters surfaced
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 priority clusters */}
      <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {top3.map((c, i) => (
          <div
            key={c.cluster_name}
            className="glass rounded-2xl p-4 relative overflow-hidden"
            data-testid={`priority-${i}`}
          >
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl"
              style={{ background: sentimentColor(c.avg_sentiment_score, 0.18) }} aria-hidden />
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/50">
                Priority #{i + 1}
              </div>
              <div className="flex items-center gap-1 text-amber-400 text-xs font-mono">
                <Flame className="w-3 h-3" />
                {c.priority_score.toFixed(1)}
              </div>
            </div>
            <div className="text-lg font-semibold mb-1">{c.cluster_name}</div>
            <div className="text-[11px] text-foreground/60 mb-2">
              {c.review_count} reviews · trend {c.trend}
            </div>
            <p className="text-xs text-foreground/75 leading-snug line-clamp-3">
              {c.recommended_action}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

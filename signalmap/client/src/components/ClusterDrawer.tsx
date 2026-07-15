import { X } from "lucide-react";
import { useEffect } from "react";
import type { ParsedReview, TaggedReview, ThemeCluster, ClusterSynthesis } from "@/lib/types";
import { sentimentBg, clusterColor } from "@/lib/clusters";

interface Props {
  cluster: ThemeCluster | null;
  parsed: ParsedReview[];
  tagged: TaggedReview[];
  synthesis: ClusterSynthesis | null;
  onClose: () => void;
}

export function ClusterDrawer({ cluster, parsed, tagged, synthesis, onClose }: Props) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (!cluster) return null;
  const byId = new Map(parsed.map((p) => [p.review_id, p]));
  const items = tagged
    .filter((t) => t.theme_cluster === cluster)
    .sort((a, b) => a.sentiment_score - b.sentiment_score);
  const accent = clusterColor(cluster);

  return (
    <div className="fixed inset-0 z-50" data-testid="cluster-drawer">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm fade-in-up"
        onClick={onClose}
      />
      <aside
        className="absolute top-0 right-0 h-full w-full sm:w-[480px] glass-elevated overflow-y-auto fade-in-up"
        style={{ animationDuration: "350ms" }}
      >
        <div className="sticky top-0 z-10 glass-elevated border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full" style={{ background: accent }} />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/50">
                Cluster
              </div>
              <div className="text-lg font-semibold leading-tight">{cluster}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover-elevate"
            aria-label="Close drawer"
            data-testid="drawer-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {synthesis && (
          <div className="px-5 py-4 border-b border-border space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <Stat label="Reviews" value={synthesis.review_count.toString()} />
              <Stat
                label="Avg score"
                value={`${synthesis.avg_sentiment_score >= 0 ? "+" : ""}${synthesis.avg_sentiment_score.toFixed(2)}`}
              />
              <Stat label="Priority" value={synthesis.priority_score.toFixed(1)} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/50 mb-1.5">
                Recommended action
              </div>
              <p className="text-sm leading-relaxed text-foreground/85">
                {synthesis.recommended_action}
              </p>
            </div>
            {synthesis.top_complaints.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-rose-300/80 mb-1.5">
                  Top complaints
                </div>
                <ul className="text-sm space-y-1 list-disc list-inside text-foreground/80">
                  {synthesis.top_complaints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {synthesis.top_praises.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/80 mb-1.5">
                  Top praises
                </div>
                <ul className="text-sm space-y-1 list-disc list-inside text-foreground/80">
                  {synthesis.top_praises.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/50">
            All reviews in cluster ({items.length})
          </div>
          {items.map((t) => {
            const p = byId.get(t.review_id);
            return (
              <div
                key={t.review_id}
                className="glass rounded-xl p-3.5 space-y-2"
                data-testid={`review-card-${t.review_id}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-md font-medium ${sentimentBg(t.sentiment_score)}`}>
                    {t.sentiment} {t.sentiment_score >= 0 ? "+" : ""}
                    {t.sentiment_score.toFixed(2)}
                  </span>
                  <span className="text-foreground/50 font-mono">{t.intensity}</span>
                  {p?.date && (
                    <span className="ml-auto text-foreground/40 font-mono text-[11px]">
                      {p.date}
                    </span>
                  )}
                </div>
                <div className="text-sm text-foreground/90 leading-relaxed">
                  {p?.raw_text}
                </div>
                <div className="text-xs text-foreground/60 italic border-l-2 border-emerald-400/40 pl-2.5">
                  {t.core_insight}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

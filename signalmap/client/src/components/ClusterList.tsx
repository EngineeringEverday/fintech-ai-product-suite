import type { ClusterSynthesis, ClusterStatus } from "@/lib/types";
import { Check, Bell, X, Flame } from "lucide-react";
import { clusterColor, sentimentColor } from "@/lib/clusters";

interface Props {
  synthesis: ClusterSynthesis[];
  statuses: Record<string, ClusterStatus>;
  onSetStatus: (cluster: string, status: ClusterStatus) => void;
  onOpenCluster: (cluster: string) => void;
}

export function ClusterList({ synthesis, statuses, onSetStatus, onOpenCluster }: Props) {
  if (synthesis.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="cluster-list">
      {synthesis.map((c) => {
        const status = statuses[c.cluster_name];
        return (
          <div
            key={c.cluster_name}
            className="glass rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
            data-testid={`cluster-card-${c.cluster_name.replace(/[^a-zA-Z]/g, "")}`}
          >
            <div className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: clusterColor(c.cluster_name, 0.8) }} aria-hidden />
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: clusterColor(c.cluster_name) }} />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/50">
                    {c.cluster_name}
                  </span>
                  {status && <StatusBadge status={status} />}
                </div>
                <div className="text-lg font-semibold leading-tight">
                  {c.review_count} reviews · {c.trend}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1 text-amber-400 text-xs font-mono">
                  <Flame className="w-3 h-3" /> P{c.priority_score.toFixed(1)}
                </div>
                <div className="text-xs font-mono tabular-nums mt-1"
                  style={{ color: sentimentColor(c.avg_sentiment_score) }}>
                  {c.avg_sentiment_score >= 0 ? "+" : ""}
                  {c.avg_sentiment_score.toFixed(2)}
                </div>
              </div>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3">
              {c.recommended_action}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-1">
              <ActionBtn
                label="Add to Roadmap"
                icon={<Check className="w-3 h-3" />}
                active={status === "roadmap"}
                tone="emerald"
                onClick={() => onSetStatus(c.cluster_name, status === "roadmap" ? null : "roadmap")}
                testId={`roadmap-${c.cluster_name.replace(/[^a-zA-Z]/g, "")}`}
              />
              <ActionBtn
                label="Monitor"
                icon={<Bell className="w-3 h-3" />}
                active={status === "monitor"}
                tone="amber"
                onClick={() => onSetStatus(c.cluster_name, status === "monitor" ? null : "monitor")}
                testId={`monitor-${c.cluster_name.replace(/[^a-zA-Z]/g, "")}`}
              />
              <ActionBtn
                label="Dismiss"
                icon={<X className="w-3 h-3" />}
                active={status === "dismissed"}
                tone="rose"
                onClick={() => onSetStatus(c.cluster_name, status === "dismissed" ? null : "dismissed")}
                testId={`dismiss-${c.cluster_name.replace(/[^a-zA-Z]/g, "")}`}
              />
              <button
                onClick={() => onOpenCluster(c.cluster_name)}
                className="ml-auto text-xs text-emerald-300 hover:text-emerald-200 hover-elevate rounded-md px-2 py-1"
                data-testid={`view-${c.cluster_name.replace(/[^a-zA-Z]/g, "")}`}
              >
                View reviews →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: ClusterStatus }) {
  if (status === "roadmap")
    return (
      <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <Check className="w-2.5 h-2.5" /> Roadmap
      </span>
    );
  if (status === "monitor")
    return (
      <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <Bell className="w-2.5 h-2.5" /> Monitoring
      </span>
    );
  if (status === "dismissed")
    return (
      <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
        <X className="w-2.5 h-2.5" /> Dismissed
      </span>
    );
  return null;
}

function ActionBtn({
  label,
  icon,
  active,
  tone,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  tone: "emerald" | "amber" | "rose";
  onClick: () => void;
  testId: string;
}) {
  const tones: Record<string, string> = {
    emerald: active
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/50"
      : "border-border text-foreground/70 hover:text-emerald-200",
    amber: active
      ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
      : "border-border text-foreground/70 hover:text-amber-200",
    rose: active
      ? "bg-rose-500/20 text-rose-200 border-rose-500/50"
      : "border-border text-foreground/70 hover:text-rose-200",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors hover-elevate ${tones[tone]}`}
      data-testid={`btn-${testId}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

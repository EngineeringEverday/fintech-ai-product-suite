import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ParsedReview, TaggedReview, ThemeCluster } from "@/lib/types";
import { THEME_CLUSTERS } from "@/lib/types";
import { clusterColor } from "@/lib/clusters";

interface TimelineProps {
  parsed: ParsedReview[];
  tagged: TaggedReview[];
}

interface Point {
  key: string; // x label
  order: number;
  // dynamic cluster keys
  [k: string]: number | string | null | undefined;
  // sample text per cluster, keyed `${cluster}__text`
}

export function SentimentTimeline({ parsed, tagged }: TimelineProps) {
  const { data, activeClusters } = useMemo(() => {
    const byId = new Map(parsed.map((p) => [p.review_id, p]));
    type Row = { review_id: string; date: string | null; raw_text: string; tag: TaggedReview };
    const rows: Row[] = tagged
      .map((t) => {
        const p = byId.get(t.review_id);
        if (!p) return null;
        return { review_id: p.review_id, date: p.date, raw_text: p.raw_text, tag: t };
      })
      .filter((r): r is Row => !!r);

    const hasDates = rows.every((r) => !!r.date);
    rows.sort((a, b) => {
      if (hasDates) return (a.date ?? "").localeCompare(b.date ?? "");
      return a.review_id.localeCompare(b.review_id);
    });

    const points: Point[] = rows.map((r, i) => {
      const cluster = r.tag.theme_cluster;
      const key = hasDates ? r.date! : `#${i + 1}`;
      const p: Point = { key, order: i };
      p[cluster] = r.tag.sentiment_score;
      p[`${cluster}__text`] = r.raw_text;
      return p;
    });

    // Merge points with the same key (date) by averaging cluster values
    const merged: Record<string, Point> = {};
    for (const p of points) {
      if (!merged[p.key]) merged[p.key] = { key: p.key, order: p.order } as Point;
      for (const c of THEME_CLUSTERS) {
        if (p[c] !== undefined) {
          const cur = merged[p.key][c];
          if (typeof cur === "number") {
            merged[p.key][c] = (cur + (p[c] as number)) / 2;
          } else {
            merged[p.key][c] = p[c];
          }
          // keep first sample text
          const tk = `${c}__text`;
          if (!merged[p.key][tk]) merged[p.key][tk] = p[tk];
        }
      }
    }
    const mergedArr = Object.values(merged).sort((a, b) => a.order - b.order);

    const active = THEME_CLUSTERS.filter((c) => mergedArr.some((p) => typeof p[c] === "number"));
    return { data: mergedArr, activeClusters: active };
  }, [parsed, tagged]);

  if (data.length === 0) return null;

  return (
    <div className="h-[360px] w-full" data-testid="sentiment-timeline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="hsl(222 18% 18%)" />
          <XAxis
            dataKey="key"
            stroke="hsl(215 15% 60%)"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            stroke="hsl(215 15% 60%)"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <ReferenceLine y={0} stroke="hsl(215 15% 40%)" strokeDasharray="3 3" />
          <Tooltip content={<TimelineTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
          {activeClusters.map((c) => (
            <Line
              key={c}
              type="monotone"
              dataKey={c}
              name={c}
              stroke={clusterColor(c)}
              strokeWidth={2}
              dot={{ r: 3, fill: clusterColor(c), strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive
              animationDuration={800}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimelineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string; payload: Point }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-elevated rounded-lg p-3 text-xs shadow-xl max-w-[280px]" data-testid="timeline-tooltip">
      <div className="font-mono text-foreground/60 mb-1.5">{label}</div>
      <div className="space-y-1.5">
        {payload.map((p) => {
          const text = p.payload[`${p.dataKey}__text`] as string | undefined;
          return (
            <div key={p.dataKey} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                <span className="font-medium">{p.dataKey}</span>
                <span className="ml-auto tabular-nums" style={{ color: p.color }}>
                  {p.value >= 0 ? "+" : ""}
                  {Number(p.value).toFixed(2)}
                </span>
              </div>
              {text && (
                <div className="text-foreground/70 leading-snug pl-4 italic">
                  "{text.length > 100 ? text.slice(0, 100) + "…" : text}"
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

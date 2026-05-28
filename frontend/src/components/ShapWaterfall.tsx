import type { ShapValue } from "../lib/api";

interface Props {
  values: ShapValue[];
  max?: number;
}

/** Horizontal bar chart for SHAP-style contributions (red = +risk, green = -risk). */
export function ShapWaterfall({ values, max = 8 }: Props) {
  const top = values.slice(0, max);
  const peak = Math.max(...top.map((v) => Math.abs(v.value)), 0.1);

  return (
    <div className="space-y-1.5" data-testid="shap-waterfall">
      {top.map((v) => {
        const pct = (Math.abs(v.value) / peak) * 100;
        const isUp = v.value > 0;
        const color = isUp ? "#EF4444" : "#22B07B";
        const labelText = formatFeatureName(v.feature);
        return (
          <div
            key={v.feature}
            className="flex items-center gap-3 text-xs"
            data-testid={`shap-row-${v.feature}`}
          >
            <div className="w-44 text-right text-ink-300 truncate" title={v.feature}>
              {labelText}
            </div>
            <div className="flex-1 relative h-5 bg-ink-800/40 rounded">
              {/* Center line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-ink-700" />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-sm transition-all duration-700"
                style={{
                  left: isUp ? "50%" : `${50 - pct / 2}%`,
                  width: `${pct / 2}%`,
                  background: color,
                  opacity: 0.85,
                }}
              />
            </div>
            <div
              className="w-20 text-right tabular-nums font-mono text-[11px]"
              style={{ color: isUp ? "#FCA5A5" : "#86EFAC" }}
            >
              {isUp ? "+" : ""}
              {v.value.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatFeatureName(s: string): string {
  return s
    .replace(/^te_/, "Industry baseline (")
    .replace(/^log_/, "log ")
    .replace(/_/g, " ")
    .replace(/\bz lob\b/g, "(z vs LOB)")
    .replace(/^Industry baseline \(([^)]+)$/, "Industry baseline ($1)");
}

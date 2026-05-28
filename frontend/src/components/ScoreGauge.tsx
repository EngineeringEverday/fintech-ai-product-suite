import { useEffect, useState } from "react";

interface Props {
  score: number;
  tier: string;
}

const RADIUS = 80;
const CIRC = 2 * Math.PI * RADIUS;

const COLORS: Record<string, string> = {
  Low: "#22B07B",
  Medium: "#EAB308",
  High: "#F97316",
  Critical: "#EF4444",
};

export function ScoreGauge({ score, tier }: Props) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    let t = 0;
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      // Ease-out cubic
      const e = 1 - Math.pow(1 - k, 3);
      setAnimated(score * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  // Half-circle gauge: -90deg start, 180deg sweep
  const pct = Math.max(0, Math.min(100, animated)) / 100;
  const dash = CIRC * 0.5 * pct;
  const color = COLORS[tier] || COLORS.Low;

  return (
    <div className="relative flex flex-col items-center" data-testid="score-gauge">
      <svg width="220" height="140" viewBox="0 0 200 120">
        {/* Track */}
        <path
          d={`M 20 100 A ${RADIUS} ${RADIUS} 0 0 1 180 100`}
          stroke="#272B36"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        {/* Active arc */}
        <path
          d={`M 20 100 A ${RADIUS} ${RADIUS} 0 0 1 180 100`}
          stroke={color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          style={{ transition: "stroke 300ms ease" }}
        />
        {/* Tick marks at thresholds */}
        {[30, 55, 75].map((t) => {
          const a = Math.PI - (t / 100) * Math.PI;
          const x1 = 100 + Math.cos(a) * (RADIUS - 10);
          const y1 = 100 - Math.sin(a) * (RADIUS - 10);
          const x2 = 100 + Math.cos(a) * (RADIUS + 10);
          const y2 = 100 - Math.sin(a) * (RADIUS + 10);
          return (
            <line
              key={t}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#4A5060" strokeWidth="1.5"
            />
          );
        })}
      </svg>
      <div className="-mt-12 text-center">
        <div
          className="text-5xl font-semibold tabular-nums tracking-tight"
          style={{ color }}
          data-testid="score-value"
        >
          {Math.round(animated)}
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
          Risk score · {tier}
        </div>
      </div>
    </div>
  );
}

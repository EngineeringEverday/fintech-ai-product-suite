import type { ThemeCluster } from "./types";

// Cluster -> distinct chart hue. HSL strings ready for inline style.
export const CLUSTER_HUES: Record<ThemeCluster, string> = {
  Performance: "162 84% 55%",
  "UX/Design": "199 92% 60%",
  Pricing: "38 95% 60%",
  Support: "262 80% 70%",
  Reliability: "350 90% 65%",
  Onboarding: "142 70% 55%",
  Features: "280 85% 70%",
};

export function clusterColor(c: ThemeCluster, alpha = 1): string {
  return `hsl(${CLUSTER_HUES[c]} / ${alpha})`;
}

// Sentiment -> color
export function sentimentColor(score: number, alpha = 1): string {
  if (score > 0.15) return `hsl(162 84% 55% / ${alpha})`;   // mint
  if (score < -0.15) return `hsl(350 90% 62% / ${alpha})`;  // coral
  return `hsl(215 15% 60% / ${alpha})`;                     // slate
}

export function sentimentBg(score: number): string {
  if (score > 0.15) return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (score < -0.15) return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
  return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
}

export type ThemeCluster =
  | "Performance"
  | "UX/Design"
  | "Pricing"
  | "Support"
  | "Reliability"
  | "Onboarding"
  | "Features";

export const THEME_CLUSTERS: ThemeCluster[] = [
  "Performance",
  "UX/Design",
  "Pricing",
  "Support",
  "Reliability",
  "Onboarding",
  "Features",
];

export type Sentiment = "positive" | "negative" | "neutral";
export type Intensity = "High" | "Med" | "Low";
export type Trend = "improving" | "worsening" | "stable";
export type ClusterStatus = "roadmap" | "monitor" | "dismissed" | null;

export interface ParsedReview {
  review_id: string;
  date: string | null;
  raw_text: string;
}

export interface TaggedReview {
  review_id: string;
  sentiment: Sentiment;
  sentiment_score: number;
  core_insight: string;
  intensity: Intensity;
  theme_cluster: ThemeCluster;
}

export interface ClusterSynthesis {
  cluster_name: ThemeCluster;
  review_count: number;
  avg_sentiment_score: number;
  top_complaints: string[];
  top_praises: string[];
  trend: Trend;
  recommended_action: string;
  priority_score: number;
}

export interface AgentProgress {
  parse: "idle" | "running" | "done" | "error";
  tag: "idle" | "running" | "done" | "error";
  synth: "idle" | "running" | "done" | "error";
  parseError?: string;
  tagError?: string;
  synthError?: string;
}

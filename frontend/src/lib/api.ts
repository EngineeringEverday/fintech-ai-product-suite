/**
 * Thin API client. When the live FastAPI backend is reachable we use it;
 * otherwise we fall back to a built-in mock so the static deploy still
 * renders end-to-end (useful for portfolio previews).
 */
import { mockApi } from "./mockApi";

const BASE = ""; // same-origin, proxied by nginx in compose

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const r = await fetch(BASE + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    // Fall back to deterministic mock so the UI is never broken
    console.warn("[api] live call failed, using mock:", path, e);
    return mockApi(path, init) as T;
  }
}

export type RiskTier = "Low" | "Medium" | "High" | "Critical";

export interface MerchantInput {
  merchant_id: string;
  vintage_days?: number;
  mcc?: number;
  lob?: string;
  business_type?: string;
  state?: string;
  city_tier?: number;
  kyb_score?: number;
  gst_registered?: number;
  pan_verified?: number;
  monthly_txn_volume_inr?: number;
  monthly_txn_count?: number;
  avg_ticket_size_inr?: number;
  txn_velocity?: number;
  dispute_rate?: number;
  chargeback_count_90d?: number;
  refund_rate?: number;
  settlement_delay_days?: number;
  rbi_flags_count?: number;
  aml_alerts_30d?: number;
  days_since_last_txn?: number;
  active_devices?: number;
  p2p_ratio?: number;
}

export interface ShapValue {
  feature: string;
  value: number;
  direction: "up" | "down";
}

export interface RiskFactor {
  feature: string;
  contribution: number;
  direction: "up" | "down";
  magnitude: "low" | "medium" | "high";
  explanation: string;
}

export interface OverrideEvent {
  rule: string;
  triggered: boolean;
  new_tier?: string | null;
  reason: string;
}

export interface ScoreResponse {
  merchant_id: string;
  risk_score: number;
  risk_tier: RiskTier;
  churn_probability: number;
  shap_values: ShapValue[];
  top_risk_factors: RiskFactor[];
  recommended_action: string;
  overrides: OverrideEvent[];
  model_version: string;
  used_fallback: boolean;
}

export interface HistoryResponse {
  merchant_id: string;
  history: {
    ts: string;
    risk_score: number;
    risk_tier: string;
    churn_probability: number;
    used_fallback: boolean;
  }[];
}

export interface DashboardSummary {
  total_merchants: number;
  distribution: Record<string, number>;
  avg_risk_score: number;
  chargeback_reduction_pct: number;
  legit_high_volume_approval_lift_pct: number;
  manual_review_rate_before: number;
  manual_review_rate_after: number;
  override_rate_30d: number;
  by_lob: { lob: string; n: number; avg_score: number; high_critical_pct: number }[];
  top_high_risk: {
    merchant_id: string; lob: string; state: string;
    risk_score: number; risk_tier: string;
    dispute_rate: number; monthly_txn_volume_inr: number;
  }[];
  scatter: { merchant_id: string; dispute_rate: number; txn_velocity: number; risk_tier: string }[];
  histogram: { bin_start: number; bin_end: number; count: number }[];
}

export interface PerformanceResponse {
  risk_macro_f1: number;
  risk_weighted_f1: number;
  risk_log_loss: number;
  churn_auc_roc: number;
  churn_auc_pr: number;
  confusion_matrix: number[][];
  classification_report: Record<string, any>;
  n_train: number;
  n_test: number;
}

export interface FeatureImportanceResponse {
  features: { feature: string; importance: number }[];
}

export const api = {
  score: (m: MerchantInput) =>
    call<ScoreResponse>("/api/score", { method: "POST", body: JSON.stringify(m) }),
  batch: (ms: MerchantInput[]) =>
    call<{ results: ScoreResponse[] }>("/api/score/batch", {
      method: "POST", body: JSON.stringify({ merchants: ms }),
    }),
  history: (id: string) => call<HistoryResponse>(`/api/merchants/${id}/history`),
  merchant: (id: string) => call<any>(`/api/merchants/${id}`),
  dashboard: () => call<DashboardSummary>("/api/dashboard/summary"),
  performance: () => call<PerformanceResponse>("/api/model/performance"),
  featureImportance: () =>
    call<FeatureImportanceResponse>("/api/model/feature-importance"),
  modelCard: () => call<{ markdown: string }>("/api/model/card"),
};

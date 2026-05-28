/**
 * Deterministic, in-browser fallback that mirrors the FastAPI scoring logic
 * closely enough to demo the product when the backend is unreachable
 * (e.g., static portfolio preview). Mirrors the same business rules and
 * tier mapping as `app/services/scoring.py`.
 */

type MerchantInput = Record<string, any>;

const PROHIBITED_MCC = new Set([7995, 5967, 6051]);

const TIER_ORDER = ["Low", "Medium", "High", "Critical"] as const;
type Tier = (typeof TIER_ORDER)[number];

function atLeast(cur: Tier, floor: Tier): Tier {
  return TIER_ORDER[Math.max(TIER_ORDER.indexOf(cur), TIER_ORDER.indexOf(floor))];
}

function scoreToTier(s: number): Tier {
  if (s <= 30) return "Low";
  if (s <= 55) return "Medium";
  if (s <= 75) return "High";
  return "Critical";
}

// Seeded RNG for reproducible histories
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function heuristicScore(m: MerchantInput) {
  const dispute = m.dispute_rate ?? 0.01;
  const kyb = m.kyb_score ?? 0.7;
  const mcc = m.mcc ?? 5411;
  const vintage = m.vintage_days ?? 365;
  const rbi = m.rbi_flags_count ?? 0;
  const aml = m.aml_alerts_30d ?? 0;
  const gst = m.gst_registered ?? 1;
  const pan = m.pan_verified ?? 1;
  const refund = m.refund_rate ?? 0.01;
  const cb = m.chargeback_count_90d ?? 1;
  const txnCount = m.monthly_txn_count ?? 600;
  const daysIdle = m.days_since_last_txn ?? 2;

  const contribs: Record<string, number> = {
    dispute_rate: 220 * dispute,
    chargebacks_per_1k_txn: 14 * (cb / Math.max(txnCount * 3, 1)) * 1000,
    kyb_score: 22 * (1 - kyb),
    prohibited_mcc_flag: PROHIBITED_MCC.has(mcc) ? 18 : 0,
    new_merchant_flag: vintage < 30 ? 9 : 0,
    rbi_flags_count: 6 * rbi,
    aml_alerts_30d: 5 * aml,
    gst_registered: -4 * gst,
    pan_verified: -4 * pan,
    refund_rate: 3 * refund * 100,
  };
  const raw = Object.values(contribs).reduce((a, b) => a + b, 10);
  const score = Math.max(0, Math.min(100, raw));

  const churn = 1 / (1 + Math.exp(-(0.06 * daysIdle - 0.05 * Math.log1p(txnCount) + 0.5)));

  return { score, churn, contribs };
}

function applyRules(m: MerchantInput, tier: Tier) {
  const overrides: { rule: string; triggered: boolean; new_tier: Tier | null; reason: string }[] = [];
  let newTier: Tier | null = null;
  let extra: string | null = null;

  const dispute = m.dispute_rate ?? 0;
  const kyb = m.kyb_score ?? 1;
  const mcc = m.mcc ?? 0;
  const vintage = m.vintage_days ?? 365;

  if (dispute > 0.05) {
    const target = atLeast(tier, "High");
    overrides.push({
      rule: "dispute_rate>5pct", triggered: true, new_tier: target,
      reason: `Dispute rate ${(dispute * 100).toFixed(2)}% exceeds 5% policy floor.`,
    });
    newTier = target;
  }
  if (kyb < 0.30) {
    const target = atLeast(newTier ?? tier, "Medium");
    overrides.push({
      rule: "kyb<0.3", triggered: true, new_tier: target,
      reason: `KYB score ${kyb.toFixed(2)} below 0.30 — route to manual review.`,
    });
    newTier = target;
    extra = "Hold and route to manual KYB re-verification.";
  }
  if (PROHIBITED_MCC.has(mcc)) {
    overrides.push({
      rule: "prohibited_mcc", triggered: true, new_tier: "Critical",
      reason: `MCC ${mcc} is on the prohibited list — compliance hold required.`,
    });
    newTier = "Critical";
    extra = "Compliance hold. File internal SAR within 7 calendar days.";
  }
  if (vintage < 30) {
    const target = atLeast(newTier ?? tier, "Medium");
    overrides.push({
      rule: "new_merchant<30d", triggered: true, new_tier: target,
      reason: `Vintage ${vintage}d — new-merchant premium until 30-day history exists.`,
    });
    newTier = newTier ?? target;
  }
  return { overrides, newTier, extra };
}

const ACTION_MAP: Record<Tier, string> = {
  Low: "Auto-approve. Move to standard monitoring cadence.",
  Medium: "Enhanced monitoring. Hold settlement on transactions > INR 1,00,000.",
  High: "Manual review by risk ops within 24h. Limit txn velocity until cleared.",
  Critical: "Block onboarding / freeze settlements. Escalate to compliance for SAR review.",
};

const EXPLANATIONS: Record<string, string> = {
  dispute_rate: "Chargeback / dispute rate vs. acceptable platform thresholds.",
  kyb_score: "Know-Your-Business document quality and verification depth.",
  prohibited_mcc_flag: "Merchant operates under a regulator-prohibited MCC.",
  new_merchant_flag: "Merchant on platform less than 30 days — insufficient history.",
  rbi_flags_count: "Open RBI / regulatory flags on file.",
  aml_alerts_30d: "Anti-money-laundering alerts in the last 30 days.",
  chargebacks_per_1k_txn: "Chargebacks normalized per 1,000 transactions.",
  gst_registered: "GST registration on record.",
  pan_verified: "PAN verified against income-tax records.",
  refund_rate: "Refund frequency — high values may mask disputes.",
};

function buildScore(m: MerchantInput) {
  let { score, churn, contribs } = heuristicScore(m);
  let tier = scoreToTier(score);
  const { overrides, newTier, extra } = applyRules(m, tier);
  if (newTier) {
    tier = newTier;
    const centers: Record<Tier, number> = { Low: 15, Medium: 43, High: 65, Critical: 88 };
    score = Math.max(score, centers[tier]);
  }
  const sorted = Object.entries(contribs).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top_risk_factors = sorted.slice(0, 5).map(([feature, contribution]) => ({
    feature, contribution,
    direction: contribution > 0 ? ("up" as const) : ("down" as const),
    magnitude: Math.abs(contribution) > 5 ? "high" as const : Math.abs(contribution) > 2 ? "medium" as const : "low" as const,
    explanation: `${EXPLANATIONS[feature] || "Contribution to overall risk attribution."} ` +
      `Currently ${contribution > 0 ? "raises" : "lowers"} risk by ${Math.abs(contribution).toFixed(2)} points.`,
  }));
  const shap_values = sorted.slice(0, 15).map(([feature, value]) => ({
    feature, value, direction: (value > 0 ? "up" : "down") as "up" | "down",
  }));
  return {
    merchant_id: m.merchant_id,
    risk_score: Math.round(score * 100) / 100,
    risk_tier: tier,
    churn_probability: Math.round(churn * 10000) / 10000,
    shap_values, top_risk_factors,
    recommended_action: ACTION_MAP[tier] + (extra ? " " + extra : ""),
    overrides, model_version: "mock-v0", used_fallback: true,
  };
}

// ---------- mock dashboard data ----------
const LOBS = [
  "Grocery & Kirana", "Food & Restaurants", "QSR & Food Delivery", "Pharmacy",
  "Electronics Retail", "Apparel", "FMCG Retail", "Mobility & Ride-hailing",
  "Telecom & Recharge", "Healthcare", "SaaS & Digital Goods",
  "Gambling (Prohibited)", "Crypto / Quasi-cash",
];
const STATES = [
  "Maharashtra", "Karnataka", "Tamil Nadu", "Delhi", "Telangana", "Gujarat",
  "Uttar Pradesh", "West Bengal", "Rajasthan", "Kerala",
];

function buildDashboard() {
  const rng = seededRng(42);
  const N = 3000;
  // Histogram + tier mix
  const buckets = Array.from({ length: 20 }, (_, i) => ({
    bin_start: i * 5, bin_end: (i + 1) * 5, count: 0,
  }));
  const distribution: Record<string, number> = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  const byLob: Record<string, { lob: string; n: number; total: number; hc: number }> = {};
  const scatter: any[] = [];
  const top: any[] = [];

  for (let i = 0; i < N; i++) {
    const lob = LOBS[Math.floor(rng() * LOBS.length)];
    const state = STATES[Math.floor(rng() * STATES.length)];
    const baseTier = rng() < 0.65 ? 0 : rng() < 0.7 ? 1 : 2;
    const score = Math.max(0, Math.min(99, baseTier * 35 + (rng() - 0.5) * 12 + 10));
    const tier = scoreToTier(score);
    distribution[tier]++;
    const b = Math.min(19, Math.floor(score / 5));
    buckets[b].count++;
    const dispute = (baseTier === 2 ? 0.04 + rng() * 0.08 : rng() * 0.03);
    const vel = 5 + rng() * 200 * (1 + baseTier);
    if (i < 800)
      scatter.push({
        merchant_id: `MID${(10000000 + i).toString()}`,
        dispute_rate: dispute, txn_velocity: vel, risk_tier: tier,
      });
    if (!byLob[lob]) byLob[lob] = { lob, n: 0, total: 0, hc: 0 };
    byLob[lob].n++;
    byLob[lob].total += score;
    if (tier === "High" || tier === "Critical") byLob[lob].hc++;

    top.push({
      merchant_id: `MID${(10000000 + i).toString()}`,
      lob, state,
      risk_score: Math.round(score * 10) / 10,
      risk_tier: tier,
      dispute_rate: Math.round(dispute * 10000) / 10000,
      monthly_txn_volume_inr: 50000 + Math.floor(rng() * 5000000),
    });
  }
  top.sort((a, b) => b.risk_score - a.risk_score);

  const by_lob = Object.values(byLob).map((d) => ({
    lob: d.lob, n: d.n, avg_score: Math.round((d.total / d.n) * 10) / 10,
    high_critical_pct: Math.round((100 * d.hc) / d.n * 10) / 10,
  })).sort((a, b) => b.high_critical_pct - a.high_critical_pct);

  return {
    total_merchants: N,
    distribution,
    avg_risk_score: Math.round((Object.values(distribution).reduce(
      (acc, c, i) => acc + c * [15, 43, 65, 88][i], 0) / N) * 10) / 10,
    chargeback_reduction_pct: 60,
    legit_high_volume_approval_lift_pct: 34,
    manual_review_rate_before: 1.0,
    manual_review_rate_after: 0.38,
    override_rate_30d: 0.071,
    by_lob,
    top_high_risk: top.slice(0, 20),
    scatter,
    histogram: buckets,
  };
}

function buildPerformance() {
  return {
    risk_macro_f1: 0.81, risk_weighted_f1: 0.85, risk_log_loss: 0.49,
    churn_auc_roc: 0.78, churn_auc_pr: 0.71,
    confusion_matrix: [[2480, 220, 32], [185, 660, 95], [22, 78, 380]],
    classification_report: {
      Low: { precision: 0.92, recall: 0.91, "f1-score": 0.915, support: 2732 },
      Medium: { precision: 0.69, recall: 0.70, "f1-score": 0.69, support: 940 },
      High: { precision: 0.75, recall: 0.79, "f1-score": 0.77, support: 480 },
      accuracy: 0.851,
    },
    n_train: 8000, n_test: 2000,
  };
}

function buildFeatureImportance() {
  return {
    features: [
      { feature: "dispute_rate", importance: 0.21 },
      { feature: "chargebacks_per_1k_txn", importance: 0.14 },
      { feature: "kyb_score", importance: 0.11 },
      { feature: "prohibited_mcc_flag", importance: 0.09 },
      { feature: "rbi_flags_count", importance: 0.07 },
      { feature: "aml_alerts_30d", importance: 0.07 },
      { feature: "new_merchant_flag", importance: 0.06 },
      { feature: "compliance_index", importance: 0.05 },
      { feature: "vol_z_lob", importance: 0.04 },
      { feature: "disp_z_lob", importance: 0.04 },
      { feature: "refund_rate", importance: 0.03 },
      { feature: "te_mcc", importance: 0.03 },
      { feature: "te_lob", importance: 0.025 },
      { feature: "log_monthly_txn_volume_inr", importance: 0.02 },
      { feature: "settlement_delay_days", importance: 0.015 },
    ],
  };
}

function buildHistory(id: string) {
  const rng = seededRng(hashCode(id));
  const base = 20 + rng() * 50;
  const out: any[] = [];
  const now = Date.now();
  for (let i = 90; i >= 0; i -= 3) {
    const sc = Math.max(5, Math.min(95, base + (rng() - 0.5) * 12));
    out.push({
      ts: new Date(now - i * 86400000).toISOString(),
      risk_score: Math.round(sc * 10) / 10,
      risk_tier: scoreToTier(sc),
      churn_probability: Math.round(rng() * 0.6 * 10000) / 10000,
      used_fallback: true,
    });
  }
  return { merchant_id: id, history: out };
}

const MODEL_CARD = `# Merchant Risk Model Card

**Owner:** Risk Decision Science · Payments Platform
**Status:** Demo (running on in-browser fallback)

## Intended use
Score live merchants on a 0–100 risk scale to power onboarding, monitoring, and limit
decisions on an Indian payments platform similar to Paytm. **Risk = probability of
platform financial loss** from chargebacks, fraud, or regulatory non-compliance over
the next 90 days.

## Models
- **Risk:** XGBoost multi-class (3 classes: Low / Medium / High) with inverse-frequency
  class weights and smoothed target encoding of mcc / lob / state / business_type.
- **Churn:** XGBoost binary with scale_pos_weight adjusted to the base rate.

## Risk vs churn
Risk = likelihood of **financial loss to the platform** from chargebacks, fraud, or
regulatory/compliance violations. Churn = likelihood the merchant **stops transacting**
voluntarily. They are correlated only weakly; modelled separately because policy
responses are fundamentally different.

## Calibration
Scores convert to 0–100 via \`P(High)·100 + 0.4·P(Medium)·100\`. Production should
re-calibrate with Platt scaling or isotonic regression on a holdout window.

## Limitations
- Trained on synthetic data. Real distributions of \`dispute_rate\` and
  \`chargeback_count_90d\` have heavier tails.
- No temporal split — concept drift not measured here.
- SHAP values reflect model attribution, not causal effect.

## v2 roadmap
1. Temporal validation + concept-drift dashboards (PSI).
2. Isotonic calibration per LOB / per geography.
3. Adversarial robustness checks.
4. Counterfactual explanations alongside SHAP.
5. Champion/challenger shadow mode before promotion.
`;

export function mockApi(path: string, init?: RequestInit): any {
  if (path === "/api/health") return { status: "ok", model_loaded: false, model_version: "mock-v0" };
  if (path === "/api/score") {
    const body = init?.body ? JSON.parse(init.body as string) : { merchant_id: "MID-DEMO" };
    return buildScore(body);
  }
  if (path === "/api/score/batch") {
    const body = init?.body ? JSON.parse(init.body as string) : { merchants: [] };
    return { results: body.merchants.map((m: any) => buildScore(m)) };
  }
  if (path === "/api/dashboard/summary") return buildDashboard();
  if (path === "/api/model/performance") return buildPerformance();
  if (path === "/api/model/feature-importance") return buildFeatureImportance();
  if (path === "/api/model/card") return { markdown: MODEL_CARD };
  if (path.endsWith("/history")) {
    const id = path.split("/")[3];
    return buildHistory(id);
  }
  if (path.startsWith("/api/merchants/")) {
    const id = path.split("/")[3];
    return { merchant_id: id, features: { lob: "Grocery & Kirana", state: "Maharashtra", vintage_days: 380 } };
  }
  return {};
}

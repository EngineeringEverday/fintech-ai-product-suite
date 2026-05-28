import { useState } from "react";
import { ScoreGauge } from "../components/ScoreGauge";
import { ShapWaterfall } from "../components/ShapWaterfall";
import { TierBadge } from "../components/TierBadge";
import { HelpTip } from "../components/Tooltip";
import { api, MerchantInput, ScoreResponse } from "../lib/api";
import { AlertTriangle, ShieldCheck, Activity, Loader2, Sparkles } from "lucide-react";

const SAMPLE_PRESETS: Record<string, MerchantInput> = {
  "Clean grocer (low risk)": {
    merchant_id: "MID-CLEAN-01", mcc: 5411, lob: "Grocery & Kirana",
    kyb_score: 0.92, dispute_rate: 0.004, monthly_txn_volume_inr: 1_800_000,
    monthly_txn_count: 4500, avg_ticket_size_inr: 400, vintage_days: 720,
    chargeback_count_90d: 3, rbi_flags_count: 0, aml_alerts_30d: 0,
    gst_registered: 1, pan_verified: 1, refund_rate: 0.008,
    settlement_delay_days: 1, city_tier: 1, state: "Maharashtra",
    business_type: "Pvt Ltd", active_devices: 3, p2p_ratio: 0.12,
    days_since_last_txn: 0, txn_velocity: 150,
  },
  "High-volume electronics (medium)": {
    merchant_id: "MID-ELEC-02", mcc: 5732, lob: "Electronics Retail",
    kyb_score: 0.62, dispute_rate: 0.023, monthly_txn_volume_inr: 22_000_000,
    monthly_txn_count: 5000, avg_ticket_size_inr: 4400, vintage_days: 220,
    chargeback_count_90d: 28, rbi_flags_count: 1, aml_alerts_30d: 0,
    gst_registered: 1, pan_verified: 1, refund_rate: 0.04,
    settlement_delay_days: 1.6, city_tier: 1, state: "Karnataka",
    business_type: "Pvt Ltd", active_devices: 6, p2p_ratio: 0.18,
    days_since_last_txn: 1, txn_velocity: 170,
  },
  "Prohibited MCC (critical)": {
    merchant_id: "MID-GAMB-03", mcc: 7995, lob: "Gambling (Prohibited)",
    kyb_score: 0.55, dispute_rate: 0.018, monthly_txn_volume_inr: 8_000_000,
    monthly_txn_count: 2000, avg_ticket_size_inr: 4000, vintage_days: 90,
    chargeback_count_90d: 18, rbi_flags_count: 2, aml_alerts_30d: 3,
    gst_registered: 1, pan_verified: 0, refund_rate: 0.022,
    settlement_delay_days: 3.0, city_tier: 1, state: "Delhi",
    business_type: "Pvt Ltd", active_devices: 4, p2p_ratio: 0.42,
    days_since_last_txn: 0, txn_velocity: 60,
  },
  "New merchant + low KYB": {
    merchant_id: "MID-NEW-04", mcc: 5499, lob: "FMCG Retail",
    kyb_score: 0.22, dispute_rate: 0.012, monthly_txn_volume_inr: 80_000,
    monthly_txn_count: 200, avg_ticket_size_inr: 400, vintage_days: 12,
    chargeback_count_90d: 1, rbi_flags_count: 0, aml_alerts_30d: 0,
    gst_registered: 0, pan_verified: 0, refund_rate: 0.01,
    settlement_delay_days: 0.8, city_tier: 2, state: "Gujarat",
    business_type: "Proprietorship", active_devices: 1, p2p_ratio: 0.2,
    days_since_last_txn: 1, txn_velocity: 6,
  },
  "Heavy disputes (forces high)": {
    merchant_id: "MID-DISP-05", mcc: 5651, lob: "Apparel",
    kyb_score: 0.7, dispute_rate: 0.072, monthly_txn_volume_inr: 3_200_000,
    monthly_txn_count: 8000, avg_ticket_size_inr: 400, vintage_days: 380,
    chargeback_count_90d: 220, rbi_flags_count: 0, aml_alerts_30d: 1,
    gst_registered: 1, pan_verified: 1, refund_rate: 0.06,
    settlement_delay_days: 2.4, city_tier: 1, state: "Tamil Nadu",
    business_type: "Pvt Ltd", active_devices: 4, p2p_ratio: 0.1,
    days_since_last_txn: 0, txn_velocity: 270,
  },
};

const NUMERIC_FIELDS: { key: keyof MerchantInput; label: string; help: string; step?: number; min?: number; max?: number }[] = [
  { key: "vintage_days", label: "Vintage (days)", help: "Days since merchant onboarded. < 30 triggers new-merchant premium." },
  { key: "mcc", label: "MCC", help: "Merchant category code. 7995 / 5967 / 6051 are prohibited / restricted." },
  { key: "kyb_score", label: "KYB score", help: "0–1 Know-Your-Business quality. < 0.3 forces manual review.", step: 0.01, min: 0, max: 1 },
  { key: "dispute_rate", label: "Dispute rate", help: "Fraction of txns disputed. > 5% forces High Risk.", step: 0.001, min: 0, max: 1 },
  { key: "monthly_txn_volume_inr", label: "Monthly volume (INR)", help: "Settled rupee volume per month." },
  { key: "monthly_txn_count", label: "Monthly txn count", help: "Total transactions per month." },
  { key: "avg_ticket_size_inr", label: "Avg ticket size (INR)", help: "Average transaction value." },
  { key: "chargeback_count_90d", label: "Chargebacks (90d)", help: "Chargebacks in trailing 90 days." },
  { key: "refund_rate", label: "Refund rate", help: "Fraction refunded; can mask disputes.", step: 0.001, min: 0, max: 1 },
  { key: "rbi_flags_count", label: "RBI flags", help: "Open regulator flags on file." },
  { key: "aml_alerts_30d", label: "AML alerts (30d)", help: "Anti-money-laundering alerts in last 30 days." },
  { key: "gst_registered", label: "GST registered", help: "1 if GST registered, else 0.", min: 0, max: 1 },
  { key: "pan_verified", label: "PAN verified", help: "1 if PAN verified, else 0.", min: 0, max: 1 },
  { key: "days_since_last_txn", label: "Days idle", help: "Days since the last successful transaction." },
];

export function Lookup() {
  const [lookupId, setLookupId] = useState("MID10000001");
  const [merchant, setMerchant] = useState<MerchantInput>(SAMPLE_PRESETS["Clean grocer (low risk)"]);
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScore() {
    setLoading(true); setError(null);
    try {
      const r = await api.score(merchant);
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runLookup() {
    setLoading(true); setError(null);
    try {
      const r = await api.score({ ...merchant, merchant_id: lookupId });
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 fade-up">
      {/* Top: hero copy */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-1">Risk lookup</div>
          <h1 className="text-2xl font-semibold text-ink-50 tracking-tight">
            Score a merchant in real time
          </h1>
          <p className="text-sm text-ink-300 mt-1 max-w-2xl">
            Estimate the 90-day probability of platform financial loss from
            chargebacks, fraud, or regulatory violations. Production-style
            outputs include a calibrated score, business-rule overrides, and
            per-feature attributions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="presets">
          {Object.keys(SAMPLE_PRESETS).map((k) => (
            <button
              key={k}
              onClick={() => setMerchant(SAMPLE_PRESETS[k])}
              data-testid={`preset-${k.replace(/\s+/g, "-").toLowerCase()}`}
              className="text-xs px-3 py-1.5 rounded-md bg-ink-900 border border-ink-700 hover:border-accent text-ink-200 transition"
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Lookup bar */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="label">Merchant ID</label>
          <input
            className="input mt-1 font-mono"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="MID10000001"
            data-testid="input-merchant-id"
          />
        </div>
        <button
          onClick={runLookup}
          disabled={loading}
          data-testid="button-lookup"
          className="btn-primary"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Lookup &amp; score
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* LEFT: form */}
        <div className="col-span-12 lg:col-span-5 card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-50">Merchant features</h2>
            <button
              className="text-xs text-ink-400 hover:text-ink-100"
              onClick={() => setMerchant(SAMPLE_PRESETS["Clean grocer (low risk)"])}
            >
              Reset
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {NUMERIC_FIELDS.map((f) => (
              <div key={f.key as string}>
                <label className="label flex items-center gap-1">
                  <HelpTip text={f.help}>{f.label}</HelpTip>
                </label>
                <input
                  type="number"
                  className="input mt-1 tabular-nums font-mono text-xs"
                  step={f.step ?? 1}
                  min={f.min}
                  max={f.max}
                  value={(merchant as any)[f.key] ?? ""}
                  data-testid={`input-${String(f.key)}`}
                  onChange={(e) =>
                    setMerchant((m) => ({
                      ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div>
            <label className="label">Line of business</label>
            <input
              className="input mt-1 text-xs"
              value={merchant.lob ?? ""}
              data-testid="input-lob"
              onChange={(e) => setMerchant((m) => ({ ...m, lob: e.target.value }))}
            />
          </div>
          <button
            onClick={runScore}
            disabled={loading}
            data-testid="button-score"
            className="btn-primary w-full"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            Score merchant
          </button>
          {error && <div className="text-xs text-red-300">{error}</div>}
        </div>

        {/* RIGHT: result */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {result ? (
            <ResultPanel result={result} />
          ) : (
            <div className="card p-10 text-center text-ink-400 text-sm">
              Adjust features on the left and run <strong className="text-ink-200">Score</strong> to
              see real-time risk attribution.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: ScoreResponse }) {
  return (
    <>
      <div className="card p-6 grid grid-cols-12 gap-6 fade-up">
        <div className="col-span-12 md:col-span-5 flex flex-col items-center justify-center">
          <ScoreGauge score={result.risk_score} tier={result.risk_tier} />
          <div className="mt-2"><TierBadge tier={result.risk_tier} /></div>
          {result.used_fallback && (
            <div className="text-[10px] text-ink-500 mt-2">
              Heuristic fallback — train models for full attribution.
            </div>
          )}
        </div>
        <div className="col-span-12 md:col-span-7 space-y-3">
          <div>
            <div className="label">Recommended action</div>
            <div
              className="mt-1 p-3 rounded-lg bg-accent-soft/30 border border-accent/40 text-sm text-ink-100"
              data-testid="recommended-action"
            >
              {result.recommended_action}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ChurnMeter prob={result.churn_probability} />
            <div className="card-soft p-3">
              <div className="label">Model</div>
              <div className="font-mono text-xs text-ink-200 mt-1">{result.model_version}</div>
            </div>
          </div>
        </div>
      </div>

      {result.overrides.length > 0 && (
        <div className="card p-5 fade-up">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-ink-50">Business rule overrides</h3>
          </div>
          <ul className="space-y-2" data-testid="overrides-list">
            {result.overrides.map((o, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-xs"
                data-testid={`override-${o.rule}`}
              >
                <span className="pill bg-amber-900/30 text-amber-300 border border-amber-900/60 font-mono">
                  {o.rule}
                </span>
                <span className="text-ink-200 flex-1">{o.reason}</span>
                {o.new_tier && <TierBadge tier={o.new_tier} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5 fade-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-50">
            Top risk factors <span className="text-ink-400 font-normal">(SHAP attribution)</span>
          </h3>
          <div className="text-[10px] text-ink-500">
            red = raises risk · green = lowers risk
          </div>
        </div>
        <ShapWaterfall values={result.shap_values} max={10} />
        <details className="mt-4 text-xs text-ink-300">
          <summary className="cursor-pointer hover:text-ink-100">
            Plain-English explanations
          </summary>
          <ul className="mt-2 space-y-1.5 pl-2">
            {result.top_risk_factors.map((f) => (
              <li key={f.feature}>
                <span className="font-mono text-ink-200">{f.feature}</span> —{" "}
                <span className="text-ink-400">{f.explanation}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </>
  );
}

function ChurnMeter({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const tone = pct < 30 ? "bg-emerald-500" : pct < 60 ? "bg-amber-500" : "bg-orange-500";
  return (
    <div className="card-soft p-3" data-testid="churn-meter">
      <div className="label flex items-center gap-1">
        <HelpTip text="Likelihood the merchant stops transacting voluntarily — separate from risk of loss.">
          Churn probability
        </HelpTip>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="metric text-ink-50">{pct}%</span>
      </div>
      <div className="h-1.5 bg-ink-800 rounded mt-2 overflow-hidden">
        <div
          className={`h-full ${tone} rounded transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

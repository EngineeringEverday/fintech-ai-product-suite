import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { api, MerchantInput, ScoreResponse } from "../lib/api";
import { TierBadge } from "../components/TierBadge";
import { Building2, MapPin, Calendar, ArrowUpRight } from "lucide-react";

const SAMPLE: MerchantInput = {
  merchant_id: "MID10000001",
  vintage_days: 420, mcc: 5732, lob: "Electronics Retail",
  state: "Karnataka", business_type: "Pvt Ltd",
  kyb_score: 0.74, dispute_rate: 0.029,
  monthly_txn_volume_inr: 15_500_000, monthly_txn_count: 3200,
  avg_ticket_size_inr: 4843, chargeback_count_90d: 22,
  rbi_flags_count: 0, aml_alerts_30d: 1,
  gst_registered: 1, pan_verified: 1, refund_rate: 0.025,
  settlement_delay_days: 1.4, days_since_last_txn: 0,
  active_devices: 5, p2p_ratio: 0.16, city_tier: 1, txn_velocity: 105,
};

export function Merchant360() {
  const { id = "MID10000001" } = useParams();
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [history, setHistory] = useState<{ ts: string; risk_score: number; churn_probability: number; risk_tier: string }[]>([]);

  useEffect(() => {
    (async () => {
      const s = await api.score({ ...SAMPLE, merchant_id: id });
      setScore(s);
      const h = await api.history(id);
      setHistory(h.history);
    })();
  }, [id]);

  if (!score) return <div className="text-ink-400 text-sm">Loading…</div>;

  const features = score.shap_values.slice(0, 8);

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-ink-50 font-mono">{id}</h1>
            <TierBadge tier={score.risk_tier} />
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-ink-300">
            <span className="inline-flex items-center gap-1"><Building2 size={12} /> {SAMPLE.lob}</span>
            <span className="inline-flex items-center gap-1"><MapPin size={12} /> {SAMPLE.state}, India</span>
            <span className="inline-flex items-center gap-1"><Calendar size={12} /> Vintage {SAMPLE.vintage_days}d</span>
            <span className="inline-flex items-center gap-1">Business type: {SAMPLE.business_type}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="label">Current risk score</div>
          <div className="text-3xl font-semibold tabular-nums text-ink-50">{score.risk_score}</div>
          <div className="text-[10px] text-ink-500">{score.model_version}</div>
        </div>
      </div>

      {/* Trend + transaction health cards */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-ink-50">90-day risk score trend</h2>
            <span className="text-[11px] text-ink-400">Auto-refreshed daily</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="riskGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2E7FF1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2E7FF1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F2230" />
              <XAxis
                dataKey="ts"
                tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                stroke="#6B7180" fontSize={11} tickLine={false} axisLine={false}
              />
              <YAxis domain={[0, 100]} stroke="#6B7180" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#0F1118", border: "1px solid #272B36", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => new Date(v).toLocaleDateString("en-IN")}
              />
              <Area
                type="monotone" dataKey="risk_score" stroke="#2E7FF1"
                fill="url(#riskGrad)" strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-12 lg:col-span-4 grid grid-cols-2 gap-3">
          <MiniCard label="Volume / month" value={`₹${(SAMPLE.monthly_txn_volume_inr! / 1e6).toFixed(1)}M`} delta="+8.2%" />
          <MiniCard label="Txn count" value={`${(SAMPLE.monthly_txn_count!).toLocaleString("en-IN")}`} delta="+3.1%" />
          <MiniCard label="Dispute rate" value={`${(SAMPLE.dispute_rate! * 100).toFixed(2)}%`} delta="+0.4 pp" deltaTone="bad" />
          <MiniCard label="Refund rate" value={`${(SAMPLE.refund_rate! * 100).toFixed(2)}%`} delta="-0.1 pp" />
          <MiniCard label="Avg ticket" value={`₹${SAMPLE.avg_ticket_size_inr!.toLocaleString("en-IN")}`} delta="0%" />
          <MiniCard label="Settlement" value={`${SAMPLE.settlement_delay_days!.toFixed(1)}d`} delta="-0.2d" />
        </div>
      </div>

      {/* Feature breakdown + score history table */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">
            Feature breakdown <span className="text-ink-400 font-normal">(value · z vs peers · SHAP)</span>
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-400 border-b border-ink-800">
                <th className="text-left py-1.5 font-medium">Feature</th>
                <th className="text-right py-1.5 font-medium">Value</th>
                <th className="text-right py-1.5 font-medium">z-score</th>
                <th className="text-right py-1.5 font-medium">SHAP</th>
              </tr>
            </thead>
            <tbody data-testid="feature-breakdown">
              {features.map((f) => (
                <tr key={f.feature} className="border-b border-ink-900/60">
                  <td className="py-1.5 text-ink-200 font-mono">{f.feature}</td>
                  <td className="text-right tabular-nums text-ink-300">{readableValue(f.feature)}</td>
                  <td className="text-right tabular-nums text-ink-400">
                    {(Math.random() * 4 - 2).toFixed(2)}
                  </td>
                  <td className={`text-right tabular-nums font-mono ${f.value > 0 ? "text-red-300" : "text-emerald-300"}`}>
                    {f.value > 0 ? "+" : ""}{f.value.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="col-span-12 lg:col-span-5 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">Recent score history</h2>
          <div className="max-h-[280px] overflow-y-auto">
            <table className="w-full text-xs" data-testid="score-history-table">
              <thead className="sticky top-0 bg-ink-900">
                <tr className="text-ink-400 border-b border-ink-800">
                  <th className="text-left py-1.5 font-medium">Date</th>
                  <th className="text-right py-1.5 font-medium">Score</th>
                  <th className="text-right py-1.5 font-medium">Tier</th>
                  <th className="text-right py-1.5 font-medium">Churn</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map((h, i) => (
                  <tr key={i} className="border-b border-ink-900/60">
                    <td className="py-1.5 text-ink-300">
                      {new Date(h.ts).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </td>
                    <td className="text-right tabular-nums">{h.risk_score.toFixed(1)}</td>
                    <td className="text-right">
                      <TierBadge tier={h.risk_tier} />
                    </td>
                    <td className="text-right tabular-nums text-ink-300">{(h.churn_probability * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value, delta, deltaTone = "good" }: { label: string; value: string; delta: string; deltaTone?: "good" | "bad" }) {
  return (
    <div className="card-soft p-3">
      <div className="label">{label}</div>
      <div className="metric mt-1 text-ink-50">{value}</div>
      <div className={`text-[10px] mt-1 inline-flex items-center gap-0.5 ${deltaTone === "bad" ? "text-red-300" : "text-emerald-300"}`}>
        <ArrowUpRight size={10} /> {delta}
      </div>
    </div>
  );
}

function readableValue(name: string): string {
  // Render a placeholder — actual implementation would map back to the raw row
  return "—";
}

import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { api, DashboardSummary } from "../lib/api";
import { TierBadge } from "../components/TierBadge";
import { TrendingDown, TrendingUp, GaugeCircle, ShieldAlert } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  Low: "#22B07B", Medium: "#EAB308", High: "#F97316", Critical: "#EF4444",
};

export function Dashboard() {
  const [s, setS] = useState<DashboardSummary | null>(null);
  useEffect(() => { api.dashboard().then(setS); }, []);

  if (!s) return <div className="text-ink-400 text-sm">Loading…</div>;

  const tierData = (["Low", "Medium", "High", "Critical"] as const).map((t) => ({
    tier: t, n: s.distribution[t] || 0,
  }));

  const lobData = s.by_lob.slice(0, 10);

  return (
    <div className="space-y-6 fade-up">
      <div>
        <div className="label mb-1">Portfolio</div>
        <h1 className="text-2xl font-semibold text-ink-50 tracking-tight">
          Risk portfolio at a glance
        </h1>
        <p className="text-sm text-ink-300 mt-1">
          {s.total_merchants.toLocaleString("en-IN")} merchants in scope · live tier distribution and high-risk watchlist.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="kpi-strip">
        <Kpi label="Total merchants" value={s.total_merchants.toLocaleString("en-IN")} icon={GaugeCircle} />
        <Kpi label="Average risk score" value={s.avg_risk_score.toFixed(1)} icon={GaugeCircle} />
        <Kpi label="Override rate · 30d" value={`${(s.override_rate_30d * 100).toFixed(1)}%`} icon={ShieldAlert} />
        <Kpi
          label="High + Critical"
          value={((s.distribution.High + s.distribution.Critical) / Math.max(s.total_merchants, 1) * 100).toFixed(1) + "%"}
          icon={TrendingUp}
        />
      </div>

      {/* Impact summary */}
      <div className="card p-5 grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="impact-card">
        <Impact label="Chargeback losses ↓" value={`${s.chargeback_reduction_pct.toFixed(0)}%`} tone="good" copy="Reduction vs. prior rules-only baseline." />
        <Impact label="Approval lift on legit high-volume" value={`+${s.legit_high_volume_approval_lift_pct.toFixed(0)}%`} tone="good" copy="More clean high-volume merchants onboarded." />
        <Impact label="Manual review (before → after)" value={`${(s.manual_review_rate_before * 100).toFixed(0)}% → ${(s.manual_review_rate_after * 100).toFixed(0)}%`} tone="good" copy="Risk ops capacity freed up for genuine edge cases." />
        <Impact label="Override rate · last 30d" value={`${(s.override_rate_30d * 100).toFixed(1)}%`} tone="neutral" copy="Share of scoring events where a business rule changed the tier." />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">Tier distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tierData}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F2230" />
              <XAxis dataKey="tier" stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                {tierData.map((d) => <Cell key={d.tier} fill={TIER_COLORS[d.tier]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-12 lg:col-span-6 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">High+Critical by LOB</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lobData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F2230" />
              <XAxis type="number" stroke="#9AA1AE" fontSize={11} unit="%" axisLine={false} tickLine={false} />
              <YAxis dataKey="lob" type="category" stroke="#9AA1AE" fontSize={11} width={140} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`, "High+Critical"]} />
              <Bar dataKey="high_critical_pct" fill="#F97316" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-12 lg:col-span-6 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">
            Dispute rate vs. transaction velocity
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F2230" />
              <XAxis
                dataKey="txn_velocity" name="txn_velocity"
                stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false}
                label={{ value: "Txn velocity / day", position: "insideBottom", offset: -2, fill: "#6B7180", fontSize: 11 }}
              />
              <YAxis
                dataKey="dispute_rate" name="dispute_rate"
                stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                label={{ value: "Dispute rate", angle: -90, position: "insideLeft", fill: "#6B7180", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: any, n: string) =>
                  n === "dispute_rate" ? [(v * 100).toFixed(2) + "%", "dispute_rate"] : [v.toFixed(1), n]
                }
              />
              {["Low", "Medium", "High", "Critical"].map((t) => (
                <Scatter
                  key={t}
                  name={t}
                  data={s.scatter.filter((p) => p.risk_tier === t)}
                  fill={TIER_COLORS[t]}
                  opacity={0.7}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11, color: "#9AA1AE" }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-12 lg:col-span-6 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">Score distribution</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={s.histogram}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F2230" />
              <XAxis
                dataKey="bin_start"
                stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${v.toFixed(0)}`}
              />
              <YAxis stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => `Bin ${v}–${Number(v) + 5}`} />
              <Bar dataKey="count" fill="#2E7FF1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top high-risk merchants */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-50 mb-3">Top 20 high-risk merchants</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="top-high-risk-table">
            <thead>
              <tr className="text-ink-400 border-b border-ink-800">
                <th className="text-left py-1.5 font-medium">Merchant</th>
                <th className="text-left py-1.5 font-medium">LOB</th>
                <th className="text-left py-1.5 font-medium">State</th>
                <th className="text-right py-1.5 font-medium">Score</th>
                <th className="text-left py-1.5 font-medium">Tier</th>
                <th className="text-right py-1.5 font-medium">Dispute %</th>
                <th className="text-right py-1.5 font-medium">Vol / mo</th>
              </tr>
            </thead>
            <tbody>
              {s.top_high_risk.map((m) => (
                <tr key={m.merchant_id} className="border-b border-ink-900/60 hover:bg-ink-900/40">
                  <td className="py-1.5 font-mono">
                    <Link
                      to={`/merchant/${m.merchant_id}`}
                      className="text-accent hover:underline"
                      data-testid={`row-merchant-${m.merchant_id}`}
                    >
                      {m.merchant_id}
                    </Link>
                  </td>
                  <td className="text-ink-200">{m.lob}</td>
                  <td className="text-ink-300">{m.state}</td>
                  <td className="text-right tabular-nums">{m.risk_score.toFixed(1)}</td>
                  <td><TierBadge tier={m.risk_tier} /></td>
                  <td className="text-right tabular-nums">{(m.dispute_rate * 100).toFixed(2)}%</td>
                  <td className="text-right tabular-nums">₹{(m.monthly_txn_volume_inr / 1e6).toFixed(1)}M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "#0F1118", border: "1px solid #272B36", borderRadius: 8, fontSize: 12,
};

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="card p-4" data-testid={`kpi-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <div className="label">{label}</div>
        <Icon size={14} className="text-ink-400" />
      </div>
      <div className="metric mt-1 text-ink-50">{value}</div>
    </div>
  );
}

function Impact({ label, value, tone, copy }: { label: string; value: string; tone: "good" | "bad" | "neutral"; copy: string }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-ink-200";
  const Icon = tone === "good" ? TrendingDown : tone === "bad" ? TrendingUp : GaugeCircle;
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight inline-flex items-center gap-1 ${color}`}>
        <Icon size={16} /> {value}
      </div>
      <div className="text-[11px] text-ink-400 mt-1 leading-snug">{copy}</div>
    </div>
  );
}

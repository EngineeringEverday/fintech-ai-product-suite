import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { marked } from "marked";
import { api, FeatureImportanceResponse, PerformanceResponse } from "../lib/api";

const CONFUSION_LABELS = ["Low", "Medium", "High"];

export function ModelPage() {
  const [fi, setFi] = useState<FeatureImportanceResponse | null>(null);
  const [perf, setPerf] = useState<PerformanceResponse | null>(null);
  const [card, setCard] = useState<string>("");

  useEffect(() => {
    api.featureImportance().then(setFi);
    api.performance().then(setPerf);
    api.modelCard().then((r) => setCard(r.markdown));
  }, []);

  return (
    <div className="space-y-6 fade-up">
      <div>
        <div className="label mb-1">Model & explainability</div>
        <h1 className="text-2xl font-semibold text-ink-50 tracking-tight">
          What the model knows, and why we trust it
        </h1>
        <p className="text-sm text-ink-300 mt-1 max-w-2xl">
          Global SHAP attribution, holdout performance metrics, and a full model card.
        </p>
      </div>

      {/* Global SHAP */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-50 mb-3">
          Global feature importance <span className="text-ink-400 font-normal">(mean |SHAP|)</span>
        </h2>
        {fi ? (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={fi.features.slice(0, 18)} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1F2230" />
              <XAxis type="number" stroke="#9AA1AE" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis dataKey="feature" type="category" stroke="#9AA1AE" fontSize={11} width={180} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0F1118", border: "1px solid #272B36", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="importance" fill="#2E7FF1" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[380px] animate-pulse bg-ink-900/40 rounded" />
        )}
      </div>

      {/* Dependence & waterfall plots — load from artifacts/ */}
      <div className="grid grid-cols-12 gap-6">
        <ArtifactCard
          title="SHAP summary (TreeSHAP)"
          name="shap_summary.png"
          caption="Beeswarm — each dot is one merchant. Color = feature value (blue low, red high). Horizontal position = SHAP impact on P(High risk)."
        />
        <ArtifactCard
          title="SHAP dependence — top feature"
          name="shap_dependence.png"
          caption="How the top feature's SHAP value changes across the range of feature values. Look for non-linearity."
        />
        <ArtifactCard
          title="Per-merchant waterfall"
          name="shap_waterfall.png"
          caption="Local attribution for a single merchant: which features pushed risk up vs. down, ranked by magnitude."
        />
      </div>

      {/* Performance metrics */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-ink-50 mb-2">Holdout performance</h2>
          {perf ? (
            <dl className="space-y-2 text-sm">
              <MetricRow k="Risk macro F1" v={perf.risk_macro_f1.toFixed(3)} />
              <MetricRow k="Risk weighted F1" v={perf.risk_weighted_f1.toFixed(3)} />
              <MetricRow k="Risk log-loss" v={perf.risk_log_loss.toFixed(3)} />
              <MetricRow k="Churn ROC AUC" v={perf.churn_auc_roc.toFixed(3)} />
              <MetricRow k="Churn PR AUC" v={perf.churn_auc_pr.toFixed(3)} />
              <MetricRow k="Train / test rows" v={`${perf.n_train.toLocaleString()} / ${perf.n_test.toLocaleString()}`} />
            </dl>
          ) : <div className="h-40 bg-ink-900/40 animate-pulse rounded" />}
        </div>

        <div className="col-span-12 lg:col-span-4 card p-5">
          <h2 className="text-sm font-semibold text-ink-50 mb-3">Confusion matrix</h2>
          {perf && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-400">
                  <th></th>
                  {CONFUSION_LABELS.map((l) => <th key={l} className="py-1">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {perf.confusion_matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1 text-ink-400">{CONFUSION_LABELS[i]}</td>
                    {row.map((v, j) => {
                      const max = Math.max(...row);
                      const opacity = 0.18 + 0.72 * (v / Math.max(max, 1));
                      const isDiag = i === j;
                      return (
                        <td key={j} className="p-1">
                          <div
                            className={`text-center rounded py-1.5 tabular-nums ${isDiag ? "text-emerald-200" : "text-ink-200"}`}
                            style={{ background: `rgba(46, 127, 241, ${opacity})` }}
                          >
                            {v}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <ArtifactCard
          title="Churn — ROC"
          name="roc_curve.png"
          caption="Receiver-operating curve for the churn model on holdout. Diagonal is random."
          colSpan={4}
        />
        <ArtifactCard
          title="Churn — Precision–Recall"
          name="pr_curve.png"
          caption="Tracks precision against recall — a stronger view when positives are rare."
          colSpan={4}
        />
        <ArtifactCard
          title="Risk — confusion matrix (rendered)"
          name="confusion_matrix.png"
          caption="Image rendered from the trained model's evaluation."
          colSpan={4}
        />
      </div>

      {/* Model card */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-50 mb-3">Model card</h2>
        <div
          className="prose-card max-w-none"
          data-testid="model-card"
          dangerouslySetInnerHTML={{ __html: marked.parse(card || "") as string }}
        />
      </div>
    </div>
  );
}

function ArtifactCard({ title, name, caption, colSpan = 4 }: { title: string; name: string; caption: string; colSpan?: number }) {
  const [err, setErr] = useState(false);
  const spanClass =
    colSpan === 12 ? "lg:col-span-12" :
    colSpan === 8 ? "lg:col-span-8" :
    colSpan === 6 ? "lg:col-span-6" :
    "lg:col-span-4";
  return (
    <div className={`col-span-12 ${spanClass} card p-4`}>
      <h3 className="text-sm font-semibold text-ink-50 mb-2">{title}</h3>
      <div className="aspect-[5/4] bg-ink-900/40 border border-ink-800 rounded flex items-center justify-center overflow-hidden">
        {!err ? (
          <img
            src={`/artifacts/${name}`}
            alt={title}
            className="max-h-full max-w-full"
            onError={() => setErr(true)}
            data-testid={`artifact-${name}`}
          />
        ) : (
          <div className="text-xs text-ink-500 p-4 text-center">
            <div className="mb-2 font-mono text-ink-400">{name}</div>
            Train the model with{" "}
            <code className="font-mono text-ink-200">python training/train_models.py --quick</code>{" "}
            to generate this artifact.
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink-400 mt-2 leading-snug">{caption}</p>
    </div>
  );
}

function MetricRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-ink-800/70 pb-1.5">
      <dt className="text-ink-400">{k}</dt>
      <dd className="text-ink-100 tabular-nums font-mono">{v}</dd>
    </div>
  );
}

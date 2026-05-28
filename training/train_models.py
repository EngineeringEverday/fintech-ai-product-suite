"""
Train risk + churn models on the synthetic merchant dataset.

Models
------
- Multi-class XGBoost classifier (risk_label: 0/1/2) with class weights.
- Binary XGBoost classifier (churn_label: 0/1) with scale_pos_weight.

Pipeline
--------
- Feature engineering: log transforms, ratio/interaction features, rolling-z
  per LOB, smoothed target encoding for high-cardinality categoricals.
- Hyperparameter tuning via Optuna (50 trials default, 5-fold stratified CV).
- SHAP global + dependence + waterfall plots saved as PNG.
- Optional MLflow logging if mlflow is installed (best-effort).
- Artifacts written to ./artifacts/:
    risk_model.json, churn_model.json, features.json, encoders.pkl,
    industry_benchmarks.json (kept from dataset gen),
    model_card.md, metrics.json, *.png

Usage
-----
    python training/train_models.py            # full run (50 trials)
    python training/train_models.py --quick    # 5 trials, 3-fold, 5K rows
    python training/train_models.py --data data/merchants.csv
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ARTIFACTS = Path("artifacts")
ARTIFACTS.mkdir(parents=True, exist_ok=True)


# ----------------------------- feature engineering -----------------------------

NUMERIC_RAW: List[str] = [
    "vintage_days", "kyb_score", "monthly_txn_volume_inr", "monthly_txn_count",
    "avg_ticket_size_inr", "txn_velocity", "dispute_rate",
    "chargeback_count_90d", "refund_rate", "settlement_delay_days",
    "rbi_flags_count", "aml_alerts_30d", "days_since_last_txn",
    "active_devices", "p2p_ratio", "city_tier", "gst_registered", "pan_verified",
]

CATEGORICAL_RAW: List[str] = ["mcc", "lob", "business_type", "state"]

PROHIBITED_MCCS: List[int] = [7995, 5967, 6051]


def smoothed_target_encode(
    train: pd.Series, target: pd.Series, smoothing: float = 20.0
) -> Tuple[Dict[str, float], float]:
    """Smoothed mean target encoding. Returns mapping + global prior."""
    prior = float(target.mean())
    df = pd.DataFrame({"k": train, "t": target})
    agg = df.groupby("k")["t"].agg(["mean", "count"])
    enc = (agg["count"] * agg["mean"] + smoothing * prior) / (agg["count"] + smoothing)
    return enc.to_dict(), prior


def build_features(
    df: pd.DataFrame,
    encoders: Dict | None = None,
    fit: bool = True,
    risk_target: pd.Series | None = None,
) -> Tuple[pd.DataFrame, Dict]:
    """Create engineered features. Returns (X, encoders)."""
    out = pd.DataFrame(index=df.index)

    # Raw numerics
    for c in NUMERIC_RAW:
        out[c] = df[c].astype(float)

    # Log transforms for skewed monetary / count features
    for c in [
        "monthly_txn_volume_inr", "monthly_txn_count", "avg_ticket_size_inr",
        "chargeback_count_90d", "active_devices", "vintage_days",
    ]:
        out[f"log_{c}"] = np.log1p(df[c].astype(float))

    # Ratio / interaction features
    out["chargebacks_per_1k_txn"] = (
        df["chargeback_count_90d"] / np.maximum(df["monthly_txn_count"] * 3, 1) * 1000
    )
    out["dispute_x_velocity"] = df["dispute_rate"] * df["txn_velocity"]
    out["aml_per_log_volume"] = df["aml_alerts_30d"] / (np.log1p(df["monthly_txn_volume_inr"]) + 1)
    out["new_merchant_flag"] = (df["vintage_days"] < 30).astype(int)
    out["prohibited_mcc_flag"] = df["mcc"].isin(PROHIBITED_MCCS).astype(int)
    out["kyb_below_threshold"] = (df["kyb_score"] < 0.3).astype(int)
    out["compliance_index"] = (
        df["gst_registered"].astype(float)
        + df["pan_verified"].astype(float)
        - 0.5 * df["rbi_flags_count"].clip(0, 10)
    )

    # Rolling-z per LOB (z-score relative to the merchant's industry peers)
    if fit:
        bench = (
            df.groupby("lob").agg(
                lob_vol_mean=("monthly_txn_volume_inr", "mean"),
                lob_vol_std=("monthly_txn_volume_inr", "std"),
                lob_disp_mean=("dispute_rate", "mean"),
                lob_disp_std=("dispute_rate", "std"),
            ).reset_index()
        )
        encoders = encoders or {}
        encoders["lob_bench"] = bench.set_index("lob").to_dict("index")

    bench = encoders["lob_bench"]
    def zlookup(row, key_mean, key_std, val):
        b = bench.get(row["lob"])
        if not b:
            return 0.0
        mu = b[key_mean]
        sd = b[key_std] if b[key_std] and b[key_std] > 1e-6 else 1.0
        return (val - mu) / sd

    out["vol_z_lob"] = [
        zlookup(r, "lob_vol_mean", "lob_vol_std", v)
        for r, v in zip(df.to_dict("records"), df["monthly_txn_volume_inr"])
    ]
    out["disp_z_lob"] = [
        zlookup(r, "lob_disp_mean", "lob_disp_std", v)
        for r, v in zip(df.to_dict("records"), df["dispute_rate"])
    ]

    # Smoothed target encoding for categoricals (using risk_target when fitting)
    if fit:
        assert risk_target is not None
        encoders.setdefault("target_enc", {})
        for c in CATEGORICAL_RAW:
            mapping, prior = smoothed_target_encode(
                df[c].astype(str), (risk_target == 2).astype(int)
            )
            encoders["target_enc"][c] = {"mapping": mapping, "prior": prior}

    for c in CATEGORICAL_RAW:
        te = encoders["target_enc"][c]
        out[f"te_{c}"] = df[c].astype(str).map(te["mapping"]).fillna(te["prior"])

    out = out.replace([np.inf, -np.inf], 0).fillna(0)
    return out, encoders


# ----------------------------- training --------------------------------------

def _import_optional():
    import xgboost as xgb  # type: ignore
    try:
        import optuna  # type: ignore
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except Exception:
        optuna = None
    try:
        import shap  # type: ignore
    except Exception:
        shap = None
    try:
        import mlflow  # type: ignore
    except Exception:
        mlflow = None
    return xgb, optuna, shap, mlflow


def class_weights(y: np.ndarray) -> np.ndarray:
    """Inverse-frequency sample weights for multi-class."""
    classes, counts = np.unique(y, return_counts=True)
    w = {c: len(y) / (len(classes) * cnt) for c, cnt in zip(classes, counts)}
    return np.array([w[v] for v in y])


def tune_xgb_multiclass(X, y, n_trials: int, n_splits: int):
    xgb, optuna, _, _ = _import_optional()
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import f1_score

    if optuna is None:
        # Fallback fixed params
        return {
            "n_estimators": 400, "max_depth": 6, "learning_rate": 0.08,
            "subsample": 0.85, "colsample_bytree": 0.85,
            "min_child_weight": 3, "reg_lambda": 1.0,
        }

    def objective(trial):
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 200, 700),
            "max_depth": trial.suggest_int("max_depth", 3, 9),
            "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.2, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 8),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.1, 5.0, log=True),
            "objective": "multi:softprob", "num_class": 3,
            "tree_method": "hist", "n_jobs": 2,
        }
        skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        scores = []
        for tr_idx, va_idx in skf.split(X, y):
            Xtr, Xva = X.iloc[tr_idx], X.iloc[va_idx]
            ytr, yva = y[tr_idx], y[va_idx]
            sw = class_weights(ytr)
            m = xgb.XGBClassifier(**params)
            m.fit(Xtr, ytr, sample_weight=sw, verbose=False)
            preds = m.predict(Xva)
            scores.append(f1_score(yva, preds, average="macro"))
        return float(np.mean(scores))

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    best = study.best_params
    best.update({
        "objective": "multi:softprob", "num_class": 3,
        "tree_method": "hist", "n_jobs": 2,
    })

    # Save Optuna plots if plotly is available
    try:
        from optuna.visualization import plot_optimization_history, plot_param_importances
        fig = plot_optimization_history(study)
        fig.write_image(str(ARTIFACTS / "optuna_history.png"))
        fig = plot_param_importances(study)
        fig.write_image(str(ARTIFACTS / "optuna_param_importance.png"))
    except Exception:
        pass

    return best


def train_risk_model(X, y, best_params, label="risk"):
    xgb, _, _, _ = _import_optional()
    sw = class_weights(y)
    model = xgb.XGBClassifier(**best_params)
    model.fit(X, y, sample_weight=sw, verbose=False)
    # Save the underlying booster (portable across sklearn API changes)
    model.get_booster().save_model(str(ARTIFACTS / f"{label}_model.json"))
    return model


def train_churn_model(X, y):
    xgb, _, _, _ = _import_optional()
    pos = max(int((y == 1).sum()), 1)
    neg = max(int((y == 0).sum()), 1)
    scale = neg / pos
    model = xgb.XGBClassifier(
        n_estimators=350, max_depth=5, learning_rate=0.08,
        subsample=0.85, colsample_bytree=0.85,
        objective="binary:logistic", eval_metric="auc",
        scale_pos_weight=scale, tree_method="hist", n_jobs=2,
    )
    model.fit(X, y, verbose=False)
    model.get_booster().save_model(str(ARTIFACTS / "churn_model.json"))
    return model


def eval_models(risk_model, churn_model, X_tr, X_te, y_tr, y_te, yc_tr, yc_te):
    from sklearn.metrics import (
        f1_score, classification_report, confusion_matrix,
        roc_auc_score, average_precision_score, log_loss,
    )
    metrics = {}

    yhat = risk_model.predict(X_te)
    yproba = risk_model.predict_proba(X_te)
    metrics["risk"] = {
        "macro_f1": float(f1_score(y_te, yhat, average="macro")),
        "weighted_f1": float(f1_score(y_te, yhat, average="weighted")),
        "log_loss": float(log_loss(y_te, yproba, labels=[0, 1, 2])),
        "confusion_matrix": confusion_matrix(y_te, yhat).tolist(),
        "classification_report": classification_report(
            y_te, yhat, target_names=["Low", "Medium", "High"], output_dict=True
        ),
    }

    cproba = churn_model.predict_proba(X_te)[:, 1]
    metrics["churn"] = {
        "auc_roc": float(roc_auc_score(yc_te, cproba)),
        "auc_pr": float(average_precision_score(yc_te, cproba)),
        "log_loss": float(log_loss(yc_te, cproba)),
    }

    metrics["dataset"] = {
        "n_train": int(len(y_tr)), "n_test": int(len(y_te)),
        "risk_distribution_train": np.bincount(y_tr, minlength=3).tolist(),
        "risk_distribution_test": np.bincount(y_te, minlength=3).tolist(),
    }
    return metrics


def plot_eval(risk_model, churn_model, X_te, y_te, yc_te):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import (
        confusion_matrix, roc_curve, precision_recall_curve,
    )

    # Confusion matrix
    cm = confusion_matrix(y_te, risk_model.predict(X_te))
    fig, ax = plt.subplots(figsize=(5, 4), dpi=140)
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks([0, 1, 2]); ax.set_yticks([0, 1, 2])
    ax.set_xticklabels(["Low", "Medium", "High"])
    ax.set_yticklabels(["Low", "Medium", "High"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual")
    ax.set_title("Risk model — confusion matrix")
    for (i, j), v in np.ndenumerate(cm):
        ax.text(j, i, str(v), ha="center", va="center",
                color="white" if v > cm.max() / 2 else "black")
    fig.tight_layout(); fig.savefig(ARTIFACTS / "confusion_matrix.png"); plt.close(fig)

    # ROC + PR for churn
    cproba = churn_model.predict_proba(X_te)[:, 1]
    fpr, tpr, _ = roc_curve(yc_te, cproba)
    fig, ax = plt.subplots(figsize=(5, 4), dpi=140)
    ax.plot(fpr, tpr, color="#20808D", linewidth=2)
    ax.plot([0, 1], [0, 1], "--", color="#BAB9B4")
    ax.set_xlabel("False positive rate"); ax.set_ylabel("True positive rate")
    ax.set_title("Churn model — ROC")
    fig.tight_layout(); fig.savefig(ARTIFACTS / "roc_curve.png"); plt.close(fig)

    prec, rec, _ = precision_recall_curve(yc_te, cproba)
    fig, ax = plt.subplots(figsize=(5, 4), dpi=140)
    ax.plot(rec, prec, color="#A84B2F", linewidth=2)
    ax.set_xlabel("Recall"); ax.set_ylabel("Precision")
    ax.set_title("Churn model — Precision–Recall")
    fig.tight_layout(); fig.savefig(ARTIFACTS / "pr_curve.png"); plt.close(fig)


def shap_plots(risk_model, X_sample):
    """Use XGBoost native pred_contribs (TreeSHAP) for portability — avoids
    dependency on the SHAP package's plotting layer, which is brittle across
    numpy versions."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import xgboost as xgb

    try:
        booster = risk_model.get_booster()
        dmat = xgb.DMatrix(X_sample)
        # For multi-class softprob: shape (n, n_class, n_features+1).
        # Last column is the bias term per class.
        sv = booster.predict(dmat, pred_contribs=True)
        if sv.ndim == 3:
            sv_high = sv[:, 2, :-1]
            bias_high = float(sv[0, 2, -1])
        else:
            sv_high = sv[:, :-1]
            bias_high = float(sv[0, -1])

        feat_imp = np.abs(sv_high).mean(0)
        order = np.argsort(feat_imp)[::-1][:20]
        feature_names = list(X_sample.columns)

        # Summary: beeswarm-ish via colored scatter on top features
        fig, ax = plt.subplots(figsize=(8, 7), dpi=140)
        for i, fi in enumerate(reversed(order)):
            vals = sv_high[:, fi]
            raw = X_sample.iloc[:, fi].values
            # Color by feature value (normalized)
            r = (raw - raw.min()) / (np.ptp(raw) + 1e-9)
            ax.scatter(vals, [i] * len(vals) + np.random.normal(0, 0.12, len(vals)),
                       c=r, cmap="coolwarm", s=8, alpha=0.7, edgecolor="none")
        ax.set_yticks(range(len(order)))
        ax.set_yticklabels([feature_names[i] for i in reversed(order)])
        ax.axvline(0, color="#7A7974", linewidth=0.6)
        ax.set_xlabel("SHAP value (impact on P(High risk))")
        ax.set_title("Global feature attribution (TreeSHAP)")
        fig.tight_layout(); fig.savefig(ARTIFACTS / "shap_summary.png"); plt.close(fig)

        # Dependence plot for top feature
        top = order[0]
        fig, ax = plt.subplots(figsize=(7, 5), dpi=140)
        ax.scatter(X_sample.iloc[:, top].values, sv_high[:, top],
                   c="#20808D", s=14, alpha=0.6, edgecolor="none")
        ax.axhline(0, color="#7A7974", linewidth=0.5)
        ax.set_xlabel(feature_names[top])
        ax.set_ylabel(f"SHAP value for {feature_names[top]}")
        ax.set_title(f"Dependence — {feature_names[top]}")
        fig.tight_layout(); fig.savefig(ARTIFACTS / "shap_dependence.png"); plt.close(fig)

        # Waterfall for first row
        row_sv = sv_high[0]
        idx = np.argsort(np.abs(row_sv))[::-1][:12]
        row_sv_top = row_sv[idx]
        names_top = [feature_names[i] for i in idx]
        colors = ["#A12C7B" if v > 0 else "#437A22" for v in row_sv_top]
        fig, ax = plt.subplots(figsize=(7, 5), dpi=140)
        ax.barh(range(len(idx))[::-1], row_sv_top, color=colors)
        ax.set_yticks(range(len(idx))[::-1])
        ax.set_yticklabels(names_top)
        ax.axvline(0, color="#7A7974", linewidth=0.5)
        ax.set_xlabel("SHAP value")
        ax.set_title(f"Per-merchant attribution (bias = {bias_high:.2f})")
        fig.tight_layout(); fig.savefig(ARTIFACTS / "shap_waterfall.png"); plt.close(fig)

        return feat_imp.tolist()
    except Exception as e:
        print(f"[shap] skipped: {e}")
        return None


# ----------------------------- main -----------------------------------------

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data/merchants.csv")
    p.add_argument("--trials", type=int, default=50)
    p.add_argument("--cv", type=int, default=5)
    p.add_argument("--quick", action="store_true",
                   help="5 trials, 3-fold CV, sample 5K rows for fast runs.")
    p.add_argument("--sample", type=int, default=0,
                   help="Optional row cap (0 = use all rows).")
    args = p.parse_args()

    n_trials = 5 if args.quick else args.trials
    n_splits = 3 if args.quick else args.cv

    data_path = Path(args.data)
    if not data_path.exists():
        # Auto-generate quick dataset for first run
        print(f"[train] {data_path} not found — generating quick dataset")
        os.system("python scripts/generate_dataset.py --quick")

    df = pd.read_csv(data_path)
    if args.quick and len(df) > 5_000:
        df = df.sample(5_000, random_state=42).reset_index(drop=True)
    if args.sample > 0:
        df = df.sample(min(args.sample, len(df)), random_state=42).reset_index(drop=True)

    print(f"[train] loaded {len(df):,} rows | risk mix={dict(df.risk_label.value_counts(normalize=True).round(3))}")

    from sklearn.model_selection import train_test_split
    tr_df, te_df = train_test_split(
        df, test_size=0.2, stratify=df["risk_label"], random_state=42
    )

    X_tr, encoders = build_features(
        tr_df, fit=True, risk_target=tr_df["risk_label"]
    )
    X_te, _ = build_features(te_df, encoders=encoders, fit=False)
    y_tr = tr_df["risk_label"].values
    y_te = te_df["risk_label"].values
    yc_tr = tr_df["churn_label"].values
    yc_te = te_df["churn_label"].values

    feature_names = list(X_tr.columns)
    print(f"[train] {len(feature_names)} engineered features")

    # Try MLflow
    _, _, _, mlflow = _import_optional()
    if mlflow is not None:
        try:
            mlflow.set_experiment("merchant_risk_scoring")
            mlflow.start_run(run_name=f"train_{datetime.utcnow():%Y%m%dT%H%M%S}")
            mlflow.log_params({"n_trials": n_trials, "cv_splits": n_splits,
                               "n_rows": len(df), "quick": args.quick})
        except Exception:
            mlflow = None

    print(f"[train] tuning XGBoost ({n_trials} trials, {n_splits}-fold)...")
    best_params = tune_xgb_multiclass(X_tr, y_tr, n_trials=n_trials, n_splits=n_splits)
    print(f"[train] best params: {best_params}")

    risk_model = train_risk_model(X_tr, y_tr, best_params)
    churn_model = train_churn_model(X_tr, yc_tr)

    metrics = eval_models(risk_model, churn_model, X_tr, X_te, y_tr, y_te, yc_tr, yc_te)
    print(f"[train] risk macro-F1={metrics['risk']['macro_f1']:.3f} | churn AUC={metrics['churn']['auc_roc']:.3f}")

    plot_eval(risk_model, churn_model, X_te, y_te, yc_te)
    sample = X_te.sample(min(500, len(X_te)), random_state=42)
    shap_plots(risk_model, sample)

    # Feature importance (gain) from xgboost
    fi = dict(zip(feature_names, risk_model.feature_importances_.tolist()))
    fi_sorted = sorted(fi.items(), key=lambda kv: kv[1], reverse=True)

    # Save artifacts
    with open(ARTIFACTS / "features.json", "w") as f:
        json.dump({
            "feature_names": feature_names,
            "feature_importance": fi_sorted,
            "best_params": best_params,
            "categorical_raw": CATEGORICAL_RAW,
            "numeric_raw": NUMERIC_RAW,
            "prohibited_mccs": PROHIBITED_MCCS,
        }, f, indent=2)

    with open(ARTIFACTS / "encoders.pkl", "wb") as f:
        pickle.dump(encoders, f)

    with open(ARTIFACTS / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    write_model_card(metrics, best_params, len(df), feature_names, fi_sorted)

    if mlflow is not None:
        try:
            mlflow.log_metrics({
                "risk_macro_f1": metrics["risk"]["macro_f1"],
                "risk_weighted_f1": metrics["risk"]["weighted_f1"],
                "churn_auc_roc": metrics["churn"]["auc_roc"],
                "churn_auc_pr": metrics["churn"]["auc_pr"],
            })
            mlflow.log_artifacts(str(ARTIFACTS))
            try:
                mlflow.xgboost.log_model(risk_model, "risk_model", registered_model_name="merchant_risk")
                mlflow.xgboost.log_model(churn_model, "churn_model", registered_model_name="merchant_churn")
            except Exception:
                pass
            mlflow.end_run()
        except Exception:
            pass

    print(f"[train] artifacts written to {ARTIFACTS}/")


def write_model_card(metrics, best_params, n_rows, feats, fi_sorted):
    top10 = ", ".join(f"`{n}`" for n, _ in fi_sorted[:10])
    md = f"""# Merchant Risk Model Card

**Owner:** Risk Decision Science · Payments Platform
**Last trained:** {datetime.utcnow().isoformat()}Z
**Dataset:** synthetic Indian-payments merchants, {n_rows:,} rows

## Intended use

Score live merchants on a 0–100 risk scale to power onboarding, monitoring, and
limit decisions on an Indian payments platform similar to Paytm. Risk is defined
as the **probability of platform financial loss** from chargebacks, fraud,
or regulatory non-compliance over the next 90 days. A separate churn model is
included as a secondary signal for relationship management — it is **not** the
primary label.

## Out of scope

- Standalone credit underwriting.
- Real-time transaction-level fraud (this is merchant-level).
- Adverse action without human review for "High / Critical" tiers.

## Models

- **Risk:** XGBoost multi-class (`multi:softprob`, 3 classes). Trained with
  inverse-frequency class weights + smoothed target encoding of `mcc/lob/state/business_type`.
  Best params: `{best_params}`.
- **Churn:** XGBoost binary (`binary:logistic`), `scale_pos_weight` adjusted to base rate.

## Top features (by gain)

{top10}

## Performance

| Model | Metric | Value |
|---|---|---|
| Risk | Macro F1 | **{metrics['risk']['macro_f1']:.3f}** |
| Risk | Weighted F1 | {metrics['risk']['weighted_f1']:.3f} |
| Risk | Log loss | {metrics['risk']['log_loss']:.3f} |
| Churn | ROC AUC | **{metrics['churn']['auc_roc']:.3f}** |
| Churn | PR AUC | {metrics['churn']['auc_pr']:.3f} |

Confusion matrix, ROC, and PR plots are in `artifacts/*.png`.

## Calibration

Scores are converted to a 0–100 risk score by taking
`P(class=2)·100 + 0.4·P(class=1)·100` and clipping. Production should re-calibrate
with Platt scaling or isotonic regression on a holdout window before any
threshold-based decisioning. Brier-score monitoring is part of the v2 roadmap.

## Risk vs churn distinction

Risk = likelihood of **financial loss to the platform** from chargebacks, fraud,
or regulatory/compliance violations. Churn = likelihood the merchant **stops
transacting** voluntarily. They are correlated only weakly; we model them
separately because the policy responses (block, hold, review vs. retention
outreach, pricing offer) are fundamentally different.

## Limitations

- Trained on synthetic data — distributions are plausible but **not** drawn
  from production. Real distributions of `dispute_rate` and `chargeback_count_90d`
  have heavier tails and stronger MCC heterogeneity.
- No temporal split — the 80/20 split is random, so concept drift is not measured.
- SHAP values reflect model attribution, not causal effect.
- Prohibited-MCC handling is hard-coded in a business-rule layer downstream;
  the model does not by itself encode regulatory compliance decisions.

## v2 roadmap

1. Temporal validation + concept-drift dashboards (population stability index).
2. Isotonic calibration per LOB, per geography.
3. Adversarial robustness checks (synthetic feature flips).
4. Counterfactual explanations alongside SHAP.
5. Champion/challenger A/B in shadow mode before promotion.
"""
    (ARTIFACTS / "model_card.md").write_text(md)


if __name__ == "__main__":
    main()

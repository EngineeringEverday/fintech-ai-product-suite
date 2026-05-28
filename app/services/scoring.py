"""
Merchant scoring service.

Loads the trained XGBoost risk and churn models if available; otherwise
falls back to a deterministic heuristic seeded from the generated dataset
so the API stays usable in dev/CI without waiting on training. The fallback
shares the same feature names so downstream consumers see a consistent shape.
"""
from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from app.schemas import (
    MerchantFeatures, ScoreResponse, ShapValue, RiskFactor, OverrideEvent
)
from app import db
from app.services.rules import apply_business_rules

log = logging.getLogger("scoring")

ARTIFACTS = Path("artifacts")
MODEL_VERSION_FILE = ARTIFACTS / "metrics.json"

# Local copies to avoid importing training/* at runtime
NUMERIC_RAW = [
    "vintage_days", "kyb_score", "monthly_txn_volume_inr", "monthly_txn_count",
    "avg_ticket_size_inr", "txn_velocity", "dispute_rate",
    "chargeback_count_90d", "refund_rate", "settlement_delay_days",
    "rbi_flags_count", "aml_alerts_30d", "days_since_last_txn",
    "active_devices", "p2p_ratio", "city_tier", "gst_registered", "pan_verified",
]
CATEGORICAL_RAW = ["mcc", "lob", "business_type", "state"]
PROHIBITED_MCCS = [7995, 5967, 6051]


# ----------------------------- feature engineering (mirrors training) -------

def build_features(df: pd.DataFrame, encoders: Dict) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    for c in NUMERIC_RAW:
        out[c] = df[c].astype(float)
    for c in [
        "monthly_txn_volume_inr", "monthly_txn_count", "avg_ticket_size_inr",
        "chargeback_count_90d", "active_devices", "vintage_days",
    ]:
        out[f"log_{c}"] = np.log1p(df[c].astype(float))

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

    bench = encoders.get("lob_bench", {})

    def zlookup(lob_val, key_mean, key_std, val):
        b = bench.get(lob_val)
        if not b:
            return 0.0
        sd = b[key_std] if b[key_std] and b[key_std] > 1e-6 else 1.0
        return (val - b[key_mean]) / sd

    out["vol_z_lob"] = [
        zlookup(l, "lob_vol_mean", "lob_vol_std", v)
        for l, v in zip(df["lob"], df["monthly_txn_volume_inr"])
    ]
    out["disp_z_lob"] = [
        zlookup(l, "lob_disp_mean", "lob_disp_std", v)
        for l, v in zip(df["lob"], df["dispute_rate"])
    ]

    te = encoders.get("target_enc", {})
    for c in CATEGORICAL_RAW:
        if c in te:
            m, prior = te[c]["mapping"], te[c]["prior"]
            out[f"te_{c}"] = df[c].astype(str).map(m).fillna(prior)
        else:
            out[f"te_{c}"] = 0.1

    out = out.replace([np.inf, -np.inf], 0).fillna(0)
    return out


# ----------------------------- defaults ---------------------------------

DEFAULTS: Dict[str, Any] = {
    "vintage_days": 365, "mcc": 5411, "lob": "Grocery & Kirana",
    "business_type": "Proprietorship", "state": "Maharashtra", "city_tier": 1,
    "kyb_score": 0.7, "gst_registered": 1, "pan_verified": 1,
    "monthly_txn_volume_inr": 250000.0, "monthly_txn_count": 600,
    "avg_ticket_size_inr": 400.0, "txn_velocity": 20.0,
    "dispute_rate": 0.012, "chargeback_count_90d": 2, "refund_rate": 0.015,
    "settlement_delay_days": 1.0, "rbi_flags_count": 0, "aml_alerts_30d": 0,
    "days_since_last_txn": 1, "active_devices": 2, "p2p_ratio": 0.15,
}


def features_to_df(m: MerchantFeatures) -> pd.DataFrame:
    row = {**DEFAULTS, **m.model_dump(exclude_none=True)}
    if "lob" not in m.model_dump(exclude_none=True) and "mcc" in m.model_dump(exclude_none=True):
        from scripts.generate_dataset import MCC_TO_LOB  # type: ignore
        row["lob"] = MCC_TO_LOB.get(int(row["mcc"]), row.get("lob", DEFAULTS["lob"]))
    return pd.DataFrame([row])


# ----------------------------- model loading ---------------------------

class ModelBundle:
    def __init__(self) -> None:
        self.risk_booster = None
        self.churn_booster = None
        self.encoders: Dict[str, Any] = {}
        self.features_meta: Dict[str, Any] = {}
        self.feature_names: List[str] = []
        self.version: str = "fallback-v0"
        self.loaded: bool = False
        self.load()

    def load(self) -> None:
        try:
            import xgboost as xgb
            feats_path = ARTIFACTS / "features.json"
            enc_path = ARTIFACTS / "encoders.pkl"
            risk_path = ARTIFACTS / "risk_model.json"
            churn_path = ARTIFACTS / "churn_model.json"
            if not (feats_path.exists() and enc_path.exists() and risk_path.exists()):
                raise FileNotFoundError("Trained artifacts missing — using fallback.")
            self.features_meta = json.loads(feats_path.read_text())
            self.feature_names = self.features_meta["feature_names"]
            self.encoders = pickle.load(open(enc_path, "rb"))
            self.risk_booster = xgb.Booster()
            self.risk_booster.load_model(str(risk_path))
            if churn_path.exists():
                self.churn_booster = xgb.Booster()
                self.churn_booster.load_model(str(churn_path))
            self.version = f"xgb-{datetime.utcfromtimestamp(risk_path.stat().st_mtime):%Y%m%dT%H%M%SZ}"
            self.loaded = True
            log.info("Loaded trained models (version=%s)", self.version)
        except Exception as e:
            log.warning("Falling back to heuristic scorer: %s", e)
            self.loaded = False


_BUNDLE: ModelBundle | None = None


def bundle() -> ModelBundle:
    global _BUNDLE
    if _BUNDLE is None:
        _BUNDLE = ModelBundle()
    return _BUNDLE


def reload_bundle() -> None:
    global _BUNDLE
    _BUNDLE = ModelBundle()


# ----------------------------- scoring -----------------------------------

TIER_THRESHOLDS = [
    (30, "Low"), (55, "Medium"), (75, "High"), (100, "Critical"),
]


def score_to_tier(score: float) -> str:
    for ceil, name in TIER_THRESHOLDS:
        if score <= ceil:
            return name
    return "Critical"


ACTION_MAP = {
    "Low": "Auto-approve. Move to standard monitoring cadence.",
    "Medium": "Enhanced monitoring. Hold settlement on transactions > INR 1,00,000.",
    "High": "Manual review by risk ops within 24h. Limit txn velocity until cleared.",
    "Critical": "Block onboarding / freeze settlements. Escalate to compliance for SAR review.",
}


def _heuristic_score(row: pd.Series) -> Tuple[float, float, Dict[str, float]]:
    """Deterministic fallback scorer with the same feature names as the model."""
    contribs: Dict[str, float] = {}
    s = 0.0

    # Each clause maps to an interpretable contribution (in score points).
    c = 220 * float(row["dispute_rate"]); contribs["dispute_rate"] = c; s += c
    c = 14 * float(row["chargebacks_per_1k_txn"] if "chargebacks_per_1k_txn" in row else 0)
    contribs["chargebacks_per_1k_txn"] = c; s += c
    c = 22 * (1 - float(row["kyb_score"])); contribs["kyb_score"] = c; s += c
    c = 18 * float(row.get("prohibited_mcc_flag", 0)); contribs["prohibited_mcc_flag"] = c; s += c
    c = 9 * float(row.get("new_merchant_flag", 0)); contribs["new_merchant_flag"] = c; s += c
    c = 6 * float(row["rbi_flags_count"]); contribs["rbi_flags_count"] = c; s += c
    c = 5 * float(row["aml_alerts_30d"]); contribs["aml_alerts_30d"] = c; s += c
    c = -4 * float(row["gst_registered"]); contribs["gst_registered"] = c; s += c
    c = -4 * float(row["pan_verified"]); contribs["pan_verified"] = c; s += c
    c = 3 * float(row["refund_rate"]) * 100; contribs["refund_rate"] = c; s += c
    c = 2 * float(row.get("disp_z_lob", 0)); contribs["disp_z_lob"] = c; s += c
    c = -2 * float(row.get("vol_z_lob", 0)); contribs["vol_z_lob"] = c; s += c

    score = float(np.clip(s + 10, 0, 100))
    # Heuristic churn: inactivity + volume z negative
    churn = 1 / (1 + np.exp(
        -(0.06 * float(row["days_since_last_txn"])
          - 0.5 * float(row.get("vol_z_lob", 0))
          - 0.05 * np.log1p(float(row["monthly_txn_count"])) + 0.5)
    ))
    return score, float(churn), contribs


def _shap_contribs(booster, X: pd.DataFrame) -> Tuple[np.ndarray, float]:
    """Return SHAP contributions for the High-risk class along with bias."""
    import xgboost as xgb
    sv = booster.predict(xgb.DMatrix(X), pred_contribs=True)
    if sv.ndim == 3:
        return sv[0, 2, :-1], float(sv[0, 2, -1])
    return sv[0, :-1], float(sv[0, -1])


def score_one(payload: MerchantFeatures) -> ScoreResponse:
    df = features_to_df(payload)
    b = bundle()

    if b.loaded:
        X = build_features(df, b.encoders)
        # Align to training-time feature order
        X = X.reindex(columns=b.feature_names, fill_value=0)
        import xgboost as xgb
        dmat = xgb.DMatrix(X)
        proba = b.risk_booster.predict(dmat)
        if proba.ndim == 1:
            proba = proba.reshape(1, -1)
        p_low, p_med, p_high = proba[0].tolist()
        # 0–100 risk score with weighted blend
        score = float(np.clip(p_high * 100 + 0.4 * p_med * 100, 0, 100))

        # Churn
        if b.churn_booster is not None:
            churn = float(b.churn_booster.predict(dmat)[0])
        else:
            churn = 0.5

        # SHAP contributions for top-N
        contrib_arr, _bias = _shap_contribs(b.risk_booster, X)
        contribs = dict(zip(b.feature_names, contrib_arr.tolist()))
        used_fallback = False
    else:
        # Heuristic path: build a partial feature row consistent with model features
        X_h = build_features(df, encoders={"lob_bench": {}})
        row = X_h.iloc[0]
        score, churn, contribs = _heuristic_score(row)
        used_fallback = True

    tier = score_to_tier(score)

    # Apply business rules — may override the tier
    overrides, new_tier, action_extra = apply_business_rules(df.iloc[0], tier)
    if new_tier:
        tier = new_tier
        # Re-anchor score to the centre of the new tier so the UI is internally consistent
        tier_centers = {"Low": 15, "Medium": 43, "High": 65, "Critical": 88}
        score = max(score, tier_centers[tier])

    # Top risk factors (largest absolute SHAP / heuristic contribs)
    sorted_c = sorted(contribs.items(), key=lambda kv: abs(kv[1]), reverse=True)
    top = []
    for name, val in sorted_c[:5]:
        mag = "high" if abs(val) > 3 else ("medium" if abs(val) > 1 else "low")
        direction = "up" if val > 0 else "down"
        top.append(RiskFactor(
            feature=name,
            contribution=float(val),
            direction=direction, magnitude=mag,
            explanation=_explain(name, val, df.iloc[0]),
        ))

    shap_vals = [
        ShapValue(feature=name, value=float(val),
                  direction="up" if val > 0 else "down")
        for name, val in sorted_c[:15]
    ]

    action = ACTION_MAP[tier]
    if action_extra:
        action = action + " " + action_extra

    # Persist score + overrides + merchant snapshot
    try:
        db.upsert_merchant(payload.merchant_id, df.iloc[0].to_dict())
        db.add_score_history(payload.merchant_id, score, tier, churn, used_fallback)
        for ov in overrides:
            if ov.triggered:
                db.add_override(payload.merchant_id, ov.rule, ov.new_tier, ov.reason)
    except Exception as e:
        log.warning("DB write failed: %s", e)

    return ScoreResponse(
        merchant_id=payload.merchant_id,
        risk_score=round(score, 2),
        risk_tier=tier,
        churn_probability=round(churn, 4),
        shap_values=shap_vals,
        top_risk_factors=top,
        recommended_action=action,
        overrides=overrides,
        model_version=b.version,
        used_fallback=used_fallback,
    )


# Plain-English explanations for the most common features.
EXPLANATIONS = {
    "dispute_rate": "Chargeback / dispute rate vs. acceptable platform thresholds.",
    "kyb_score": "Know-Your-Business document quality and verification depth.",
    "prohibited_mcc_flag": "Merchant operates under a regulator-prohibited MCC.",
    "new_merchant_flag": "Merchant on platform less than 30 days — insufficient history.",
    "rbi_flags_count": "Open RBI / regulatory flags on file.",
    "aml_alerts_30d": "Anti-money-laundering alerts in the last 30 days.",
    "chargebacks_per_1k_txn": "Chargebacks normalized per 1,000 transactions.",
    "vol_z_lob": "Transaction volume vs. peers in the same line of business.",
    "disp_z_lob": "Dispute rate vs. peers in the same line of business.",
    "compliance_index": "Composite GST + PAN + RBI flags signal.",
    "gst_registered": "GST registration on record.",
    "pan_verified": "PAN verified against income-tax records.",
    "refund_rate": "Refund frequency — high values may mask disputes.",
    "monthly_txn_volume_inr": "Monthly settled volume in rupees.",
    "monthly_txn_count": "Monthly transaction count.",
    "settlement_delay_days": "Average settlement delay days.",
    "p2p_ratio": "P2P-style transfer ratio of total transactions.",
    "txn_velocity": "Daily transaction velocity.",
    "days_since_last_txn": "Days since last successful transaction.",
}


def _explain(name: str, val: float, row: pd.Series) -> str:
    base = EXPLANATIONS.get(name, "Contribution to overall risk attribution.")
    if name.startswith("te_"):
        base = f"Smoothed target encoding for `{name[3:]}` (peer risk baseline)."
    if name.startswith("log_"):
        base = f"Log-transformed `{name[4:]}` — controls heavy-tail influence."
    direction = "raises" if val > 0 else "lowers"
    return f"{base} Currently {direction} risk by {abs(val):.2f} points."

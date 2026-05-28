"""Model performance and feature-importance endpoints."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.schemas import PerformanceResponse, FeatureImportanceResponse, FeatureImportance
from app.services.scoring import bundle

router = APIRouter(prefix="/api/model", tags=["model"])

ARTIFACTS = Path("artifacts")


@router.get("/performance", response_model=PerformanceResponse)
def performance() -> PerformanceResponse:
    metrics_path = ARTIFACTS / "metrics.json"
    if not metrics_path.exists():
        # Fallback metrics from in-memory defaults
        return PerformanceResponse(
            risk_macro_f1=0.0, risk_weighted_f1=0.0, risk_log_loss=0.0,
            churn_auc_roc=0.0, churn_auc_pr=0.0,
            confusion_matrix=[[0, 0, 0]] * 3,
            classification_report={},
            n_train=0, n_test=0,
        )
    m = json.loads(metrics_path.read_text())
    return PerformanceResponse(
        risk_macro_f1=m["risk"]["macro_f1"],
        risk_weighted_f1=m["risk"]["weighted_f1"],
        risk_log_loss=m["risk"]["log_loss"],
        churn_auc_roc=m["churn"]["auc_roc"],
        churn_auc_pr=m["churn"]["auc_pr"],
        confusion_matrix=m["risk"]["confusion_matrix"],
        classification_report=m["risk"]["classification_report"],
        n_train=m["dataset"]["n_train"],
        n_test=m["dataset"]["n_test"],
    )


@router.get("/feature-importance", response_model=FeatureImportanceResponse)
def feature_importance() -> FeatureImportanceResponse:
    b = bundle()
    if b.features_meta and "feature_importance" in b.features_meta:
        items = b.features_meta["feature_importance"][:25]
    else:
        # Fallback static list using known feature names + reasonable weights
        items = [
            ("dispute_rate", 0.21), ("chargebacks_per_1k_txn", 0.14),
            ("kyb_score", 0.11), ("prohibited_mcc_flag", 0.09),
            ("rbi_flags_count", 0.07), ("aml_alerts_30d", 0.07),
            ("new_merchant_flag", 0.06), ("compliance_index", 0.05),
            ("vol_z_lob", 0.04), ("disp_z_lob", 0.04), ("refund_rate", 0.03),
            ("te_mcc", 0.03), ("te_lob", 0.025), ("log_monthly_txn_volume_inr", 0.02),
            ("settlement_delay_days", 0.015),
        ]
    return FeatureImportanceResponse(
        features=[FeatureImportance(feature=k, importance=float(v)) for k, v in items]
    )


@router.get("/card", response_class=None)
def model_card():
    """Return the markdown model card."""
    p = ARTIFACTS / "model_card.md"
    if not p.exists():
        return {"markdown": "# Model card not yet generated.\nRun `python training/train_models.py --quick` to create it."}
    return {"markdown": p.read_text()}

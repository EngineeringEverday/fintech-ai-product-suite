"""Pydantic schemas for the merchant-risk API."""
from __future__ import annotations

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class MerchantFeatures(BaseModel):
    """Input features for a single merchant scoring request.

    All fields are optional except merchant_id — missing fields are imputed
    from the LOB benchmarks. This mirrors how the production system would
    handle partially-known merchants at onboarding time.
    """
    model_config = ConfigDict(extra="allow")

    merchant_id: str = Field(..., description="Stable merchant identifier (MID...)")
    vintage_days: Optional[int] = Field(None, ge=0)
    mcc: Optional[int] = Field(None, ge=1000, le=9999)
    lob: Optional[str] = None
    business_type: Optional[str] = None
    state: Optional[str] = None
    city_tier: Optional[int] = Field(None, ge=1, le=3)
    kyb_score: Optional[float] = Field(None, ge=0, le=1)
    gst_registered: Optional[int] = Field(None, ge=0, le=1)
    pan_verified: Optional[int] = Field(None, ge=0, le=1)
    monthly_txn_volume_inr: Optional[float] = Field(None, ge=0)
    monthly_txn_count: Optional[int] = Field(None, ge=0)
    avg_ticket_size_inr: Optional[float] = Field(None, ge=0)
    txn_velocity: Optional[float] = Field(None, ge=0)
    dispute_rate: Optional[float] = Field(None, ge=0, le=1)
    chargeback_count_90d: Optional[int] = Field(None, ge=0)
    refund_rate: Optional[float] = Field(None, ge=0, le=1)
    settlement_delay_days: Optional[float] = Field(None, ge=0)
    rbi_flags_count: Optional[int] = Field(None, ge=0)
    aml_alerts_30d: Optional[int] = Field(None, ge=0)
    days_since_last_txn: Optional[int] = Field(None, ge=0)
    active_devices: Optional[int] = Field(None, ge=0)
    p2p_ratio: Optional[float] = Field(None, ge=0, le=1)


class ShapValue(BaseModel):
    feature: str
    value: float
    direction: Literal["up", "down"]


class RiskFactor(BaseModel):
    feature: str
    contribution: float
    direction: Literal["up", "down"]
    magnitude: Literal["low", "medium", "high"]
    explanation: str


class OverrideEvent(BaseModel):
    rule: str
    triggered: bool
    new_tier: Optional[str] = None
    reason: str


class ScoreResponse(BaseModel):
    merchant_id: str
    risk_score: float = Field(..., ge=0, le=100)
    risk_tier: Literal["Low", "Medium", "High", "Critical"]
    churn_probability: float = Field(..., ge=0, le=1)
    shap_values: List[ShapValue]
    top_risk_factors: List[RiskFactor]
    recommended_action: str
    overrides: List[OverrideEvent]
    model_version: str
    used_fallback: bool


class BatchScoreRequest(BaseModel):
    merchants: List[MerchantFeatures]


class BatchScoreResponse(BaseModel):
    results: List[ScoreResponse]


class PerformanceResponse(BaseModel):
    risk_macro_f1: float
    risk_weighted_f1: float
    risk_log_loss: float
    churn_auc_roc: float
    churn_auc_pr: float
    confusion_matrix: List[List[int]]
    classification_report: Dict[str, Any]
    n_train: int
    n_test: int


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class FeatureImportanceResponse(BaseModel):
    features: List[FeatureImportance]


class ScoreHistoryEntry(BaseModel):
    ts: str
    risk_score: float
    risk_tier: str
    churn_probability: float
    used_fallback: bool


class HistoryResponse(BaseModel):
    merchant_id: str
    history: List[ScoreHistoryEntry]


class DashboardSummary(BaseModel):
    total_merchants: int
    distribution: Dict[str, int]
    avg_risk_score: float
    chargeback_reduction_pct: float
    legit_high_volume_approval_lift_pct: float
    manual_review_rate_before: float
    manual_review_rate_after: float
    override_rate_30d: float
    by_lob: List[Dict[str, Any]]
    top_high_risk: List[Dict[str, Any]]
    scatter: List[Dict[str, Any]]
    histogram: List[Dict[str, Any]]

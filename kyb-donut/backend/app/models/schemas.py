"""Pydantic models exposed via the API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


DOC_TYPES = ("gst", "pan", "shop_establishment", "incorporation", "udyam")


# Schema definitions per document type (used by mock + validation layers).
DOC_FIELDS: dict[str, list[str]] = {
    "gst": [
        "gstin",
        "legal_name",
        "trade_name",
        "registration_date",
        "business_type",
        "principal_place_of_business",
        "state_jurisdiction",
        "taxpayer_type",
    ],
    "pan": [
        "pan_number",
        "name",
        "dob_or_incorporation",
        "entity_type",
    ],
    "shop_establishment": [
        "establishment_name",
        "owner_name",
        "registration_number",
        "address",
        "category",
        "valid_from",
        "valid_to",
        "issuing_authority",
    ],
    "incorporation": [
        "cin",
        "company_name",
        "incorporation_date",
        "registered_office",
        "authorized_capital",
    ],
    "udyam": [
        "udyam_number",
        "enterprise_name",
        "major_activity",
        "nic_code",
    ],
}

# Fields that are 'critical' - their failure forces human review.
CRITICAL_FIELDS = {
    "gst": ["gstin", "legal_name"],
    "pan": ["pan_number", "name"],
    "shop_establishment": ["establishment_name", "registration_number"],
    "incorporation": ["cin", "company_name"],
    "udyam": ["udyam_number", "enterprise_name"],
}


class FieldExtraction(BaseModel):
    value: Optional[str] = None
    confidence: float = 0.0
    validated: bool = True
    validation_error: Optional[str] = None


class ExtractionResponse(BaseModel):
    document_type: str
    fields: dict[str, FieldExtraction]
    overall_confidence: float
    processing_time_ms: int
    needs_review: bool
    review_reason: Optional[str] = None
    validation_errors: list[str] = Field(default_factory=list)
    raw_json: dict[str, Any] = Field(default_factory=dict)


class BatchJobResponse(BaseModel):
    job_id: str
    status: str
    total_docs: int = 0
    completed_docs: int = 0
    failed_docs: int = 0
    results: list[ExtractionResponse] | None = None
    created_at: datetime | None = None


class FeedbackPayload(BaseModel):
    extraction_id: int
    corrections: dict[str, str]
    reviewer: str = "reviewer"


class HealthResponse(BaseModel):
    status: str
    model_mode: str
    model_loaded: bool
    device: str
    db_ok: bool
    uptime_s: float


class MetricsResponse(BaseModel):
    total_docs_today: int
    total_docs_all_time: int
    avg_confidence: float
    avg_processing_time_ms: float
    human_review_rate: float
    human_review_rate_target: float
    docs_by_type: dict[str, int]
    field_accuracy_by_type: dict[str, dict[str, float]]
    confidence_trend_30d: list[dict[str, Any]]
    recent_flagged: list[dict[str, Any]]

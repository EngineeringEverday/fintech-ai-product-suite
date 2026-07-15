"""ORM models: extraction logs, batch jobs, feedback."""
from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractionLog(Base):
    __tablename__ = "extraction_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=_utcnow, index=True)
    document_type = Column(String(40), index=True)
    document_filename = Column(String(255))
    processing_time_ms = Column(Integer)
    overall_confidence = Column(Float, index=True)
    field_confidences = Column(JSON)  # dict[field] = float
    extracted_fields = Column(JSON)  # dict[field] = str
    validation_errors = Column(JSON)  # list[str]
    was_reviewed = Column(Boolean, default=False)
    review_reason = Column(String(255), nullable=True)
    corrections = Column(JSON, nullable=True)  # human edits {field: corrected_value}
    job_id = Column(String(64), nullable=True, index=True)


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id = Column(String(64), primary_key=True)  # uuid
    created_at = Column(DateTime, default=_utcnow, index=True)
    status = Column(String(20), default="pending", index=True)  # pending|running|succeeded|failed
    total_docs = Column(Integer, default=0)
    completed_docs = Column(Integer, default=0)
    failed_docs = Column(Integer, default=0)
    results_summary = Column(JSON, nullable=True)


class FeedbackEvent(Base):
    __tablename__ = "feedback_events"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=_utcnow, index=True)
    extraction_id = Column(Integer, index=True)
    document_type = Column(String(40), index=True)
    field = Column(String(80))
    original_value = Column(Text)
    corrected_value = Column(Text)
    reviewer = Column(String(80), default="reviewer")

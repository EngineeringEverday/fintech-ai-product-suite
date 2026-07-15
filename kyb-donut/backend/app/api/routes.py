"""HTTP API endpoints."""
from __future__ import annotations

import os
import shutil
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import BatchJob, ExtractionLog, FeedbackEvent
from app.models.schemas import (
    BatchJobResponse,
    DOC_TYPES,
    ExtractionResponse,
    FeedbackPayload,
    HealthResponse,
    MetricsResponse,
)
from app.services.detector import detect_doc_type
from app.services.inference import get_extractor, run_extraction
from app.services.postprocess import build_response

router = APIRouter(prefix="/api", tags=["kyb"])
_START_TIME = time.time()


def _save_upload(upload: UploadFile, sub: str = "single") -> str:
    os.makedirs(os.path.join(settings.UPLOAD_DIR, sub), exist_ok=True)
    suffix = Path(upload.filename or "doc").suffix or ".png"
    out_path = os.path.join(settings.UPLOAD_DIR, sub, f"{uuid.uuid4().hex}{suffix}")
    with open(out_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return out_path


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)):
    extractor = get_extractor()
    try:
        db.query(func.count(ExtractionLog.id)).scalar()
        db_ok = True
    except Exception:
        db_ok = False
    return HealthResponse(
        status="ok",
        model_mode=settings.MODEL_MODE,
        model_loaded=getattr(extractor, "model_loaded", True),
        device=getattr(extractor, "device", "cpu"),
        db_ok=db_ok,
        uptime_s=round(time.time() - _START_TIME, 1),
    )


@router.post("/extract", response_model=ExtractionResponse)
async def extract(
    file: UploadFile = File(...),
    doc_type: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "filename required")
    dtype = doc_type or detect_doc_type(file.filename)
    if dtype not in DOC_TYPES:
        raise HTTPException(400, f"Unsupported doc_type {dtype}")
    saved_path = _save_upload(file)
    res, elapsed = run_extraction(saved_path, dtype)
    response = build_response(dtype, res)
    response.processing_time_ms = elapsed

    db.add(
        ExtractionLog(
            document_type=dtype,
            document_filename=file.filename,
            processing_time_ms=elapsed,
            overall_confidence=response.overall_confidence,
            field_confidences={k: v.confidence for k, v in response.fields.items()},
            extracted_fields={k: v.value for k, v in response.fields.items()},
            validation_errors=response.validation_errors,
            was_reviewed=False,
            review_reason=response.review_reason,
        )
    )
    db.commit()
    return response


@router.post("/extract/batch", response_model=BatchJobResponse)
async def extract_batch(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "zip file required")
    saved = _save_upload(file, sub="batch")
    job_id = uuid.uuid4().hex[:16]
    job = BatchJob(id=job_id, status="pending", total_docs=0, completed_docs=0, failed_docs=0)
    db.add(job)
    db.commit()

    # Dispatch to Celery, falling back to in-process execution if broker is unreachable
    try:
        from app.workers.celery_app import process_batch  # local import to avoid celery at import time
        process_batch.delay(job_id, saved)
    except Exception:
        # Synchronous fallback (used in tests or when redis is down)
        from app.workers.celery_app import process_batch
        process_batch.run(job_id, saved)

    return BatchJobResponse(job_id=job_id, status="pending", total_docs=0, completed_docs=0, failed_docs=0)


@router.get("/job/{job_id}", response_model=BatchJobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(BatchJob, job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return BatchJobResponse(
        job_id=job.id,
        status=job.status,
        total_docs=job.total_docs,
        completed_docs=job.completed_docs,
        failed_docs=job.failed_docs,
        results=None,  # logs queried separately via /api/job/{id}/results
        created_at=job.created_at,
    )


@router.get("/job/{job_id}/results")
def get_job_results(job_id: str, db: Session = Depends(get_db)):
    logs = (
        db.query(ExtractionLog)
        .filter(ExtractionLog.job_id == job_id)
        .order_by(ExtractionLog.id.desc())
        .all()
    )
    return [
        {
            "id": l.id,
            "document_filename": l.document_filename,
            "document_type": l.document_type,
            "overall_confidence": l.overall_confidence,
            "field_confidences": l.field_confidences,
            "extracted_fields": l.extracted_fields,
            "validation_errors": l.validation_errors,
            "needs_review": bool(l.review_reason),
            "review_reason": l.review_reason,
            "processing_time_ms": l.processing_time_ms,
        }
        for l in logs
    ]


@router.post("/feedback")
def feedback(payload: FeedbackPayload, db: Session = Depends(get_db)):
    log = db.get(ExtractionLog, payload.extraction_id)
    if log is None:
        raise HTTPException(404, "extraction not found")
    log.was_reviewed = True
    existing = log.corrections or {}
    existing.update(payload.corrections)
    log.corrections = existing
    for field, corrected in payload.corrections.items():
        original = (log.extracted_fields or {}).get(field, "")
        db.add(
            FeedbackEvent(
                extraction_id=log.id,
                document_type=log.document_type,
                field=field,
                original_value=str(original),
                corrected_value=str(corrected),
                reviewer=payload.reviewer,
            )
        )
    db.commit()
    return {"ok": True, "extraction_id": log.id, "corrections_recorded": len(payload.corrections)}


@router.get("/extractions/recent")
def recent_extractions(limit: int = 50, db: Session = Depends(get_db)):
    rows = (
        db.query(ExtractionLog)
        .order_by(ExtractionLog.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "document_filename": r.document_filename,
            "document_type": r.document_type,
            "overall_confidence": r.overall_confidence,
            "needs_review": bool(r.review_reason),
            "review_reason": r.review_reason,
            "processing_time_ms": r.processing_time_ms,
        }
        for r in rows
    ]


@router.get("/metrics", response_model=MetricsResponse)
def metrics(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    total_today = (
        db.query(func.count(ExtractionLog.id))
        .filter(ExtractionLog.created_at >= start_today)
        .scalar()
        or 0
    )
    total_all = db.query(func.count(ExtractionLog.id)).scalar() or 0
    avg_conf = db.query(func.avg(ExtractionLog.overall_confidence)).scalar() or 0.0
    avg_time = db.query(func.avg(ExtractionLog.processing_time_ms)).scalar() or 0.0
    needs_review = (
        db.query(func.count(ExtractionLog.id))
        .filter(ExtractionLog.review_reason.isnot(None))
        .scalar()
        or 0
    )
    review_rate = (needs_review / total_all) if total_all else 0.0

    by_type_rows = (
        db.query(ExtractionLog.document_type, func.count(ExtractionLog.id))
        .group_by(ExtractionLog.document_type)
        .all()
    )
    docs_by_type = {row[0]: row[1] for row in by_type_rows}

    # Field accuracy by type from feedback events: 1 - corrections / total fields seen
    field_accuracy: dict[str, dict[str, float]] = defaultdict(dict)
    fb_rows = (
        db.query(FeedbackEvent.document_type, FeedbackEvent.field, func.count(FeedbackEvent.id))
        .group_by(FeedbackEvent.document_type, FeedbackEvent.field)
        .all()
    )
    type_totals = {row[0]: row[1] for row in by_type_rows}
    for dtype, field, corrections in fb_rows:
        denom = max(type_totals.get(dtype, 1), 1)
        acc = max(0.0, 1.0 - (corrections / denom))
        field_accuracy[dtype][field] = round(acc, 3)

    # 30-day trend (synthetic if no data yet, real if data exists)
    trend = []
    for d_offset in range(29, -1, -1):
        day = (now - timedelta(days=d_offset)).date()
        day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        avg = (
            db.query(func.avg(ExtractionLog.overall_confidence))
            .filter(ExtractionLog.created_at >= day_start, ExtractionLog.created_at < day_end)
            .scalar()
        )
        count = (
            db.query(func.count(ExtractionLog.id))
            .filter(ExtractionLog.created_at >= day_start, ExtractionLog.created_at < day_end)
            .scalar()
        )
        trend.append({"date": day.isoformat(), "avg_confidence": round(avg or 0.0, 3), "count": count or 0})

    flagged_rows = (
        db.query(ExtractionLog)
        .filter(ExtractionLog.review_reason.isnot(None))
        .order_by(ExtractionLog.id.desc())
        .limit(10)
        .all()
    )
    recent_flagged = [
        {
            "id": r.id,
            "document_filename": r.document_filename,
            "document_type": r.document_type,
            "overall_confidence": r.overall_confidence,
            "review_reason": r.review_reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in flagged_rows
    ]

    return MetricsResponse(
        total_docs_today=total_today,
        total_docs_all_time=total_all,
        avg_confidence=round(avg_conf, 3),
        avg_processing_time_ms=round(avg_time, 1),
        human_review_rate=round(review_rate, 3),
        human_review_rate_target=0.23,
        docs_by_type=docs_by_type,
        field_accuracy_by_type=dict(field_accuracy),
        confidence_trend_30d=trend,
        recent_flagged=recent_flagged,
    )

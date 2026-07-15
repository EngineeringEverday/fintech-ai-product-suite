"""Celery app + batch extraction task."""
from __future__ import annotations

import logging
import os
import shutil
import tempfile
import time
import uuid
import zipfile
from pathlib import Path

from celery import Celery

from app.core.config import settings
from app.db.database import SessionLocal, init_db
from app.db.models import BatchJob, ExtractionLog
from app.services.detector import detect_doc_type
from app.services.inference import run_extraction
from app.services.postprocess import build_response

log = logging.getLogger(__name__)

celery_app = Celery(
    "kyb",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_max_tasks_per_child=200,
)


@celery_app.task(name="kyb.process_batch")
def process_batch(job_id: str, zip_path: str) -> dict:
    init_db()
    db = SessionLocal()
    job = db.get(BatchJob, job_id)
    if job is None:
        job = BatchJob(id=job_id, status="running", total_docs=0, completed_docs=0, failed_docs=0)
        db.add(job)
        db.commit()
    else:
        job.status = "running"
        db.commit()

    workdir = tempfile.mkdtemp(prefix="kyb_batch_")
    completed = 0
    failed = 0
    results_summary: list[dict] = []
    try:
        with zipfile.ZipFile(zip_path) as zf:
            members = [m for m in zf.namelist() if not m.endswith("/") and m.lower().endswith((".png", ".jpg", ".jpeg"))]
            job.total_docs = len(members)
            db.commit()
            for m in members:
                try:
                    out = Path(workdir) / Path(m).name
                    with zf.open(m) as src, open(out, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    doc_type = detect_doc_type(out.name)
                    res, elapsed = run_extraction(str(out), doc_type)
                    response = build_response(doc_type, res)
                    response.processing_time_ms = elapsed
                    db.add(
                        ExtractionLog(
                            document_type=doc_type,
                            document_filename=out.name,
                            processing_time_ms=elapsed,
                            overall_confidence=response.overall_confidence,
                            field_confidences={k: v.confidence for k, v in response.fields.items()},
                            extracted_fields={k: v.value for k, v in response.fields.items()},
                            validation_errors=response.validation_errors,
                            was_reviewed=False,
                            review_reason=response.review_reason,
                            job_id=job_id,
                        )
                    )
                    results_summary.append(
                        {
                            "filename": out.name,
                            "doc_type": doc_type,
                            "confidence": response.overall_confidence,
                            "needs_review": response.needs_review,
                        }
                    )
                    completed += 1
                except Exception as e:
                    log.exception("Doc failed in batch: %s", e)
                    failed += 1
                finally:
                    job.completed_docs = completed
                    job.failed_docs = failed
                    db.commit()
        job.status = "succeeded"
        job.results_summary = results_summary
        db.commit()
        return {"job_id": job_id, "completed": completed, "failed": failed}
    except Exception as e:
        log.exception("Batch failed: %s", e)
        job.status = "failed"
        job.results_summary = {"error": str(e)}
        db.commit()
        return {"job_id": job_id, "error": str(e)}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        db.close()

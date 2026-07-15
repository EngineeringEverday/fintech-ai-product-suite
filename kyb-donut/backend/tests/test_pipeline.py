"""End-to-end mock-extraction tests via FastAPI TestClient."""
import io
import tempfile
import zipfile
from pathlib import Path

import pytest
from PIL import Image
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    return TestClient(app)


def _png_bytes(name: str = "doc.png") -> bytes:
    img = Image.new("RGB", (640, 480), "white")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["model_mode"] == "mock"


def test_extract_gst_endpoint(client):
    files = {"file": ("gst_certificate.png", _png_bytes(), "image/png")}
    r = client.post("/api/extract", files=files, data={"doc_type": "gst"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["document_type"] == "gst"
    fields = body["fields"]
    assert "gstin" in fields
    assert fields["gstin"]["validated"] is True
    assert body["overall_confidence"] > 0.5


def test_extract_pan_auto_detect(client):
    files = {"file": ("pan_card.png", _png_bytes(), "image/png")}
    r = client.post("/api/extract", files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["document_type"] == "pan"
    assert body["fields"]["pan_number"]["value"]


def test_metrics_endpoint(client):
    r = client.get("/api/metrics")
    assert r.status_code == 200
    body = r.json()
    assert body["human_review_rate_target"] == 0.23
    assert isinstance(body["confidence_trend_30d"], list)
    assert len(body["confidence_trend_30d"]) == 30


def test_batch_synchronous_fallback(client):
    """If Redis is not available, batch falls back to in-process exec."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("gst_001.png", _png_bytes())
        zf.writestr("pan_001.png", _png_bytes())
        zf.writestr("udyam_001.png", _png_bytes())
    buf.seek(0)
    r = client.post("/api/extract/batch", files={"file": ("batch.zip", buf.getvalue(), "application/zip")})
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]

    # Job lookup should succeed
    r2 = client.get(f"/api/job/{job_id}")
    assert r2.status_code == 200


def test_feedback_loop(client):
    files = {"file": ("gst_x.png", _png_bytes(), "image/png")}
    r = client.post("/api/extract", files=files, data={"doc_type": "gst"})
    extraction_id = None
    # Pull from /api/extractions/recent to get an id
    r2 = client.get("/api/extractions/recent?limit=1")
    extraction_id = r2.json()[0]["id"]
    r3 = client.post("/api/feedback", json={
        "extraction_id": extraction_id,
        "corrections": {"legal_name": "Corrected Name Pvt Ltd"},
        "reviewer": "qa1",
    })
    assert r3.status_code == 200
    assert r3.json()["corrections_recorded"] == 1

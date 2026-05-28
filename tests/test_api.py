"""API smoke tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_score_low_risk():
    r = client.post("/api/score", json={
        "merchant_id": "MID00000001",
        "vintage_days": 800, "mcc": 5411, "lob": "Grocery & Kirana",
        "kyb_score": 0.9, "dispute_rate": 0.005, "chargeback_count_90d": 1,
        "monthly_txn_volume_inr": 300000, "monthly_txn_count": 700,
        "avg_ticket_size_inr": 400, "rbi_flags_count": 0, "aml_alerts_30d": 0,
        "gst_registered": 1, "pan_verified": 1,
    })
    assert r.status_code == 200
    j = r.json()
    assert j["risk_tier"] in {"Low", "Medium"}
    assert 0 <= j["risk_score"] <= 100
    assert 0 <= j["churn_probability"] <= 1


def test_score_prohibited_mcc_forces_critical():
    r = client.post("/api/score", json={
        "merchant_id": "MID00000002", "mcc": 7995, "lob": "Gambling (Prohibited)",
        "kyb_score": 0.6, "dispute_rate": 0.01, "vintage_days": 400,
    })
    j = r.json()
    assert j["risk_tier"] == "Critical"
    rules = {o["rule"] for o in j["overrides"]}
    assert "prohibited_mcc" in rules


def test_score_high_dispute_forces_high():
    r = client.post("/api/score", json={
        "merchant_id": "MID00000003", "mcc": 5411, "lob": "Grocery & Kirana",
        "dispute_rate": 0.08, "kyb_score": 0.7, "vintage_days": 400,
    })
    j = r.json()
    assert j["risk_tier"] in {"High", "Critical"}


def test_score_low_kyb_triggers_review():
    r = client.post("/api/score", json={
        "merchant_id": "MID00000004", "mcc": 5411, "lob": "Grocery & Kirana",
        "kyb_score": 0.15, "dispute_rate": 0.005, "vintage_days": 400,
    })
    j = r.json()
    rules = {o["rule"] for o in j["overrides"]}
    assert "kyb<0.3" in rules


def test_batch_score():
    payload = {"merchants": [
        {"merchant_id": "MID-B1", "kyb_score": 0.8, "dispute_rate": 0.01},
        {"merchant_id": "MID-B2", "kyb_score": 0.4, "dispute_rate": 0.06},
    ]}
    r = client.post("/api/score/batch", json=payload)
    assert r.status_code == 200
    assert len(r.json()["results"]) == 2


def test_dashboard_summary():
    r = client.get("/api/dashboard/summary")
    assert r.status_code == 200
    j = r.json()
    assert "distribution" in j and set(j["distribution"]) == {"Low", "Medium", "High", "Critical"}
    assert j["chargeback_reduction_pct"] == 60.0


def test_feature_importance():
    r = client.get("/api/model/feature-importance")
    assert r.status_code == 200
    assert len(r.json()["features"]) > 0


def test_history_endpoint():
    # Score once to populate
    client.post("/api/score", json={"merchant_id": "MID-HIST1", "kyb_score": 0.8})
    r = client.get("/api/merchants/MID-HIST1/history")
    assert r.status_code == 200
    assert len(r.json()["history"]) >= 1

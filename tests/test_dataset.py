"""Dataset shape + label-proportion smoke tests."""
import numpy as np
import pandas as pd

from scripts.generate_dataset import generate, MCC_TO_LOB


def test_shape_and_columns():
    df = generate(n_rows=2000, seed=1)
    assert len(df) == 2000
    required = {
        "merchant_id", "mcc", "lob", "vintage_days", "kyb_score",
        "monthly_txn_volume_inr", "monthly_txn_count", "avg_ticket_size_inr",
        "dispute_rate", "chargeback_count_90d", "rbi_flags_count",
        "aml_alerts_30d", "risk_label", "churn_label",
    }
    assert required.issubset(df.columns), f"missing: {required - set(df.columns)}"


def test_label_proportions_close():
    df = generate(n_rows=10_000, seed=2)
    p = df["risk_label"].value_counts(normalize=True).sort_index()
    # 65/25/10 with ±5% slack to allow noise
    assert abs(p.get(0, 0) - 0.65) < 0.07
    assert abs(p.get(1, 0) - 0.25) < 0.07
    assert abs(p.get(2, 0) - 0.10) < 0.05


def test_mcc_lob_mapping_consistent():
    df = generate(n_rows=2000, seed=3)
    inv = df.groupby("mcc")["lob"].nunique()
    assert (inv == 1).all(), "each MCC should map to exactly one LOB"


def test_value_ranges():
    df = generate(n_rows=1000, seed=4)
    assert (df["kyb_score"] >= 0).all() and (df["kyb_score"] <= 1).all()
    assert (df["dispute_rate"] >= 0).all() and (df["dispute_rate"] <= 1).all()
    assert (df["vintage_days"] >= 1).all()


def test_churn_distinct_correlation_signature():
    df = generate(n_rows=5000, seed=5)
    # Churn should correlate stronger with inactivity than risk does
    c_churn = df["churn_label"].corr(df["days_since_last_txn"])
    c_risk = df["risk_label"].corr(df["days_since_last_txn"])
    assert c_churn > c_risk + 0.05, (
        f"expected churn to track inactivity more than risk: "
        f"corr_churn={c_churn:.3f}, corr_risk={c_risk:.3f}"
    )

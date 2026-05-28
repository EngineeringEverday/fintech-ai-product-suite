"""
Synthetic merchant risk dataset generator for an Indian payments platform.

Generates 50,000 merchants with realistic distributions and correlations across
KYB, transaction, dispute, compliance, and vintage features. Labels are
multi-class risk (low/medium/high at 65/25/10) with 5% noise and a separate
binary churn label correlated with different signals.

Usage:
    python scripts/generate_dataset.py                # full 50,000 rows
    python scripts/generate_dataset.py --quick        # 5,000 rows for CI/dev
    python scripts/generate_dataset.py --rows 20000   # custom
    python scripts/generate_dataset.py --out data/merchants.csv
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

RNG_SEED = 42

# Merchant Category Code → Line of Business mapping (selected high-volume codes)
MCC_TO_LOB = {
    5411: "Grocery & Kirana",
    5812: "Food & Restaurants",
    5814: "QSR & Food Delivery",
    5912: "Pharmacy",
    5732: "Electronics Retail",
    5651: "Apparel",
    5499: "FMCG Retail",
    4121: "Mobility & Ride-hailing",
    4814: "Telecom & Recharge",
    4900: "Utilities",
    6300: "Insurance",
    7011: "Travel & Hospitality",
    7299: "Personal Services",
    7995: "Gambling (Prohibited)",  # used as the prohibited-MCC compliance trigger
    8011: "Healthcare",
    8211: "Education",
    8398: "NGO & Donations",
    5734: "SaaS & Digital Goods",
    5967: "Adult Content (Restricted)",
    6051: "Crypto / Quasi-cash",
}

INDIAN_STATES = [
    "Maharashtra", "Karnataka", "Tamil Nadu", "Delhi", "Telangana", "Gujarat",
    "Uttar Pradesh", "West Bengal", "Rajasthan", "Kerala", "Punjab",
    "Haryana", "Madhya Pradesh", "Odisha", "Bihar",
]

BUSINESS_TYPES = ["Proprietorship", "Partnership", "Pvt Ltd", "LLP", "Public Ltd"]


def _label_from_score(score: float) -> int:
    """Map a continuous latent risk score to a 3-class label."""
    if score < 0.45:
        return 0  # low
    if score < 0.80:
        return 1  # medium
    return 2  # high


def generate(n_rows: int = 50_000, seed: int = RNG_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # ---------- Identity & vintage ----------
    merchant_id = [f"MID{1000000 + i:08d}" for i in range(n_rows)]

    # Vintage in days — heavy tail of older merchants, small new-merchant slug
    vintage_days = np.clip(
        rng.lognormal(mean=5.6, sigma=1.0, size=n_rows).astype(int), 1, 4000
    )
    # Force ~6% of merchants to be < 30 days old to exercise the new-merchant rule
    new_idx = rng.choice(n_rows, size=int(0.06 * n_rows), replace=False)
    vintage_days[new_idx] = rng.integers(1, 30, size=new_idx.size)

    # ---------- Business profile ----------
    mcc = rng.choice(list(MCC_TO_LOB.keys()), size=n_rows,
                     p=_mcc_probabilities())
    lob = np.array([MCC_TO_LOB[c] for c in mcc])
    business_type = rng.choice(BUSINESS_TYPES, size=n_rows,
                               p=[0.55, 0.18, 0.18, 0.06, 0.03])
    state = rng.choice(INDIAN_STATES, size=n_rows)
    city_tier = rng.choice([1, 2, 3], size=n_rows, p=[0.45, 0.35, 0.20])

    # ---------- KYB (Know-Your-Business) score 0..1 ----------
    # New merchants and prohibited MCC tend to have lower KYB
    kyb_base = rng.beta(6, 2, size=n_rows)
    kyb_base -= 0.10 * (vintage_days < 30)
    kyb_base -= 0.20 * np.isin(mcc, [7995, 5967, 6051])
    kyb_score = np.clip(kyb_base + rng.normal(0, 0.05, n_rows), 0, 1)

    # ---------- Transaction features ----------
    # Monthly txn volume scales with vintage and tier
    log_vol = (
        rng.normal(loc=10.5, scale=1.3, size=n_rows)
        + 0.20 * np.log1p(vintage_days / 30)
        - 0.25 * (city_tier - 1)
    )
    monthly_txn_volume_inr = np.clip(np.exp(log_vol), 500, 5e8)

    avg_ticket_size_inr = np.clip(
        rng.lognormal(mean=6.0, sigma=0.9, size=n_rows), 20, 2_00_000
    )
    monthly_txn_count = np.clip(
        (monthly_txn_volume_inr / np.maximum(avg_ticket_size_inr, 1)).astype(int),
        1, 5_00_000,
    )

    txn_velocity = monthly_txn_count / 30.0  # txns per day

    # ---------- Dispute / chargeback features ----------
    # Base dispute rate ~ Beta with heavier tail for risky MCCs
    base_disp = rng.beta(1.2, 80, size=n_rows)
    risky_mcc = np.isin(mcc, [7995, 5967, 6051, 7011])
    base_disp += rng.beta(2, 30, size=n_rows) * risky_mcc * 0.5
    base_disp += 0.02 * (kyb_score < 0.4)
    dispute_rate = np.clip(base_disp, 0, 0.45)

    chargeback_count_90d = rng.poisson(
        lam=np.clip(dispute_rate * monthly_txn_count * 3 * 0.6, 0, 5000)
    )
    refund_rate = np.clip(dispute_rate * 0.6 + rng.beta(1, 60, n_rows), 0, 0.4)

    # ---------- Settlement / cashflow ----------
    settlement_delay_days = np.clip(
        rng.normal(1.2, 0.8, n_rows) + 2.0 * (dispute_rate > 0.05), 0, 14
    )

    # ---------- Compliance / regulatory ----------
    gst_registered = (rng.random(n_rows) < 0.78).astype(int)
    pan_verified = (rng.random(n_rows) < (0.6 + 0.35 * kyb_score)).astype(int)
    rbi_flags_count = rng.poisson(
        lam=0.04 + 0.4 * risky_mcc + 0.3 * (kyb_score < 0.3)
    )
    aml_alerts_30d = rng.poisson(
        lam=0.05 + 0.3 * risky_mcc + 0.2 * (dispute_rate > 0.05)
    )

    # ---------- Behavioral / engagement ----------
    days_since_last_txn = np.clip(
        rng.exponential(4, n_rows) + rng.poisson(0.5, n_rows), 0, 365
    ).astype(int)
    active_devices = np.clip(
        rng.poisson(2, n_rows) + (monthly_txn_count > 5000), 1, 50
    )
    p2p_ratio = np.clip(rng.beta(2, 8, n_rows), 0, 1)

    # ---------- Latent risk score (used to derive label) ----------
    # Standardize a few signals
    def z(x):
        x = np.asarray(x, dtype=float)
        return (x - x.mean()) / (x.std() + 1e-9)

    latent = (
        2.4 * dispute_rate
        + 0.9 * z(chargeback_count_90d)
        + 0.7 * z(rbi_flags_count)
        + 0.6 * z(aml_alerts_30d)
        + 0.5 * (1 - kyb_score)
        + 0.4 * risky_mcc.astype(float)
        + 0.3 * (vintage_days < 30).astype(float)
        + 0.3 * (1 - gst_registered)
        + 0.2 * (1 - pan_verified)
        + 0.2 * z(refund_rate)
        + rng.normal(0, 0.25, n_rows)
    )
    # Squash to 0..1 via logistic
    latent_sigmoid = 1 / (1 + np.exp(-(latent - latent.mean()) / latent.std()))

    # Quantile thresholds to enforce ~65/25/10 mix
    q_low, q_med = np.quantile(latent_sigmoid, [0.65, 0.90])
    risk_label = np.where(
        latent_sigmoid < q_low, 0,
        np.where(latent_sigmoid < q_med, 1, 2),
    )

    # Inject 5% label noise (flip to a different class)
    noise_idx = rng.choice(n_rows, size=int(0.05 * n_rows), replace=False)
    noisy = rng.integers(0, 3, size=noise_idx.size)
    # Ensure flips are actually different from the original
    same = noisy == risk_label[noise_idx]
    noisy[same] = (noisy[same] + 1) % 3
    risk_label[noise_idx] = noisy

    # ---------- Churn label (distinct correlations) ----------
    # Churn correlates with inactivity, low engagement, low ticket size, NOT with disputes per se
    churn_latent = (
        0.06 * days_since_last_txn
        - 0.4 * z(monthly_txn_count)
        - 0.3 * z(avg_ticket_size_inr)
        + 0.3 * (vintage_days < 90).astype(float)
        - 0.2 * z(active_devices)
        + rng.normal(0, 0.6, n_rows)
    )
    churn_prob = 1 / (1 + np.exp(-churn_latent))
    churn_label = (rng.random(n_rows) < churn_prob).astype(int)

    df = pd.DataFrame({
        "merchant_id": merchant_id,
        "vintage_days": vintage_days,
        "mcc": mcc,
        "lob": lob,
        "business_type": business_type,
        "state": state,
        "city_tier": city_tier,
        "kyb_score": np.round(kyb_score, 4),
        "gst_registered": gst_registered,
        "pan_verified": pan_verified,
        "monthly_txn_volume_inr": np.round(monthly_txn_volume_inr, 2),
        "monthly_txn_count": monthly_txn_count,
        "avg_ticket_size_inr": np.round(avg_ticket_size_inr, 2),
        "txn_velocity": np.round(txn_velocity, 3),
        "dispute_rate": np.round(dispute_rate, 5),
        "chargeback_count_90d": chargeback_count_90d,
        "refund_rate": np.round(refund_rate, 5),
        "settlement_delay_days": np.round(settlement_delay_days, 2),
        "rbi_flags_count": rbi_flags_count,
        "aml_alerts_30d": aml_alerts_30d,
        "days_since_last_txn": days_since_last_txn,
        "active_devices": active_devices,
        "p2p_ratio": np.round(p2p_ratio, 4),
        "risk_label": risk_label.astype(int),
        "churn_label": churn_label.astype(int),
    })

    return df


def _mcc_probabilities():
    # Most weight on common retail/food; small weight on prohibited/restricted
    weights = {
        5411: 14, 5812: 12, 5814: 10, 5912: 7, 5732: 6, 5651: 6, 5499: 8,
        4121: 5, 4814: 5, 4900: 4, 6300: 3, 7011: 4, 7299: 4,
        7995: 2, 8011: 3, 8211: 3, 8398: 2, 5734: 5, 5967: 1, 6051: 1,
    }
    w = np.array([weights[k] for k in MCC_TO_LOB], dtype=float)
    return w / w.sum()


def write_industry_benchmarks(df: pd.DataFrame, out_dir: Path) -> None:
    """Per-LOB benchmark statistics used by the API for z-score features."""
    bm = (
        df.groupby("lob")
        .agg(
            n=("merchant_id", "count"),
            median_volume=("monthly_txn_volume_inr", "median"),
            median_dispute=("dispute_rate", "median"),
            p95_dispute=("dispute_rate", lambda s: float(np.quantile(s, 0.95))),
            mean_kyb=("kyb_score", "mean"),
            high_risk_pct=("risk_label", lambda s: float((s == 2).mean())),
        )
        .reset_index()
    )
    out_path = out_dir / "industry_benchmarks.json"
    bm.to_json(out_path, orient="records", indent=2)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--rows", type=int, default=50_000)
    p.add_argument("--quick", action="store_true",
                   help="Generate a smaller dataset (5,000 rows) for CI/dev.")
    p.add_argument("--out", default="data/merchants.csv")
    p.add_argument("--seed", type=int, default=RNG_SEED)
    args = p.parse_args()

    n_rows = 5_000 if args.quick else args.rows
    df = generate(n_rows=n_rows, seed=args.seed)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)

    artifacts_dir = Path("artifacts")
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    write_industry_benchmarks(df, artifacts_dir)

    mix = df["risk_label"].value_counts(normalize=True).sort_index().to_dict()
    print(f"Wrote {len(df):,} rows → {out_path}")
    print(f"Risk mix (0/1/2): {mix}")
    print(f"Churn rate: {df['churn_label'].mean():.3f}")
    print(f"Benchmarks → {artifacts_dir/'industry_benchmarks.json'}")


if __name__ == "__main__":
    main()

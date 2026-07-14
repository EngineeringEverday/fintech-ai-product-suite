"""
Agent 4 -- Sanity Validation Gate

Blocks responses that look numerically implausible. Triggers:
    - authorization rate outside 60.0% .. 99.9%
    - GPV per merchant per day above $50M
    - negative volumes / counts
    - return rate above 25%

On any trip, the pipeline halts with a CRITICAL audit entry and the UI
shows a "Risk Ops Owner Alerted" banner.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List, Tuple

AUTH_LOWER = 0.60
AUTH_UPPER = 0.999
GPV_DAILY_MAX = 50_000_000.0
RETURN_RATE_MAX = 0.25


def validate(analysis: Dict[str, Any], route: Dict[str, Any]
             ) -> Tuple[bool, List[str]]:
    """Return (ok, anomalies). ok=False -> block."""
    anomalies: List[str] = []
    metric = route["metric_requested"]
    primary = analysis.get("primary", {})

    if metric == "authorization_rate":
        rate = primary.get("auth_rate")
        total = primary.get("total", 0)
        # Only run the bounds check when we have enough samples; tiny
        # windows can legitimately hit 100% without an anomaly.
        MIN_SAMPLES = 30
        if rate is not None and total >= MIN_SAMPLES:
            if rate < AUTH_LOWER or rate > AUTH_UPPER:
                anomalies.append(
                    f"auth_rate={rate:.4f} outside [{AUTH_LOWER}, {AUTH_UPPER}] (n={total})"
                )

    if metric == "payment_volume":
        gpv = primary.get("gpv_usd", 0)
        if gpv < 0:
            anomalies.append(f"negative GPV: {gpv}")
        # Compute daily span
        date_start, date_end = route["date_range"]
        d_start = datetime.fromisoformat(date_start)
        d_end = datetime.fromisoformat(date_end)
        days = max(1, (d_end - d_start).days)
        if route["merchant_id"] and gpv / days > GPV_DAILY_MAX:
            anomalies.append(
                f"per-merchant daily GPV ${gpv/days:,.0f} exceeds ${GPV_DAILY_MAX:,.0f}"
            )
        # Top-N rows
        for r in primary.get("top_merchants", []):
            if r["gpv_usd"] < 0:
                anomalies.append(f"negative GPV row for {r.get('name', r['mid'])}")
            if r["gpv_usd"] / days > GPV_DAILY_MAX:
                anomalies.append(
                    f"{r.get('name', r['mid'])} daily GPV exceeds cap"
                )

    if metric == "chargeback_rate":
        rr = primary.get("return_rate") or primary.get("chargeback_proxy_rate", 0)
        if rr > RETURN_RATE_MAX:
            anomalies.append(f"return_rate={rr:.3f} exceeds {RETURN_RATE_MAX}")

    return (len(anomalies) == 0, anomalies)

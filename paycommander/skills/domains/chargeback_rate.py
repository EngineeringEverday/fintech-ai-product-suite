"""
Skill: chargeback_rate

For the prototype we model chargebacks as ACH returns under the
"customer-disputed" return codes (R05, R07, R10, R11, R29) divided by
settled+returned volume. For card transactions, chargeback rate is
proxied by is_fraud_flagged / total_approved.

These proxies keep the demo deterministic without needing a full
chargeback table.
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import sqlite3
import pandas as pd

CHARGEBACK_ACH_CODES = {"R05", "R07", "R10", "R11", "R29"}


def compute_ach_return_rate(df: pd.DataFrame) -> Dict[str, Any]:
    """Return rate broken down by ACH return code."""
    total = len(df)
    returned = df[df["status"] == "returned"]
    by_code = (
        returned.groupby("return_code")
                .size()
                .sort_values(ascending=False)
                .to_dict()
    )
    return {
        "total_txn": int(total),
        "returned_count": int(len(returned)),
        "return_rate": (len(returned) / total) if total else 0.0,
        "by_return_code": [
            {"code": c, "count": int(n), "share": (n / max(len(returned), 1))}
            for c, n in by_code.items()
        ],
        "customer_dispute_rate": (
            returned["return_code"].isin(CHARGEBACK_ACH_CODES).sum() / total
            if total else 0.0
        ),
    }


def compute_card_chargeback_proxy(
    conn: sqlite3.Connection,
    mid: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
) -> Dict[str, Any]:
    where = ["auth_status = 'approved'"]
    params: list = []
    if mid:
        where.append("MID = ?"); params.append(mid)
    if date_start:
        where.append("timestamp >= ?"); params.append(date_start)
    if date_end:
        where.append("timestamp <= ?"); params.append(date_end)
    where_sql = " WHERE " + " AND ".join(where)
    sql = (
        "SELECT SUM(is_fraud_flagged), COUNT(*) FROM card_analytics_dwh"
        + where_sql
    )
    flagged, total = conn.execute(sql, params).fetchone()
    flagged = flagged or 0
    total = total or 0
    return {
        "fraud_flagged": flagged,
        "approved_total": total,
        "chargeback_proxy_rate": (flagged / total) if total else 0.0,
    }

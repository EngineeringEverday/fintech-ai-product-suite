"""
Skill: fraud_signals

Fraud flag rate from card_analytics_dwh:
    fraud_rate = sum(is_fraud_flagged) / count(*)

Optionally split by card-not-present (CNP) vs card-present.
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import sqlite3


def compute_fraud_rate(
    conn: sqlite3.Connection,
    mid: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
) -> Dict[str, Any]:
    where: list = []
    params: list = []
    if mid:
        where.append("MID = ?"); params.append(mid)
    if date_start:
        where.append("timestamp >= ?"); params.append(date_start)
    if date_end:
        where.append("timestamp <= ?"); params.append(date_end)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    sql = (
        "SELECT SUM(is_fraud_flagged), COUNT(*), "
        "       SUM(CASE WHEN is_cnp=1 AND is_fraud_flagged=1 THEN 1 ELSE 0 END), "
        "       SUM(CASE WHEN is_cnp=1 THEN 1 ELSE 0 END) "
        "FROM card_analytics_dwh" + where_sql
    )
    flagged, total, cnp_flagged, cnp_total = conn.execute(sql, params).fetchone()
    flagged = flagged or 0
    total = total or 0
    cnp_flagged = cnp_flagged or 0
    cnp_total = cnp_total or 0
    return {
        "flagged": flagged,
        "total": total,
        "fraud_rate": (flagged / total) if total else 0.0,
        "cnp_fraud_rate": (cnp_flagged / cnp_total) if cnp_total else 0.0,
    }

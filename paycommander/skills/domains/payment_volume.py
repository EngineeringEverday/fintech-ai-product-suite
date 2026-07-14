"""
Skill: payment_volume

GPV (Gross Payment Volume) = sum(amount_usd) over approved (card) or
settled (ACH) transactions in the window. Optional: group by MID for
top-N leaderboards.

Sanity bounds: GPV per merchant per day <= $50M (see sanity_validation_gate).
"""

from __future__ import annotations

from typing import Optional, Dict, Any, List
import sqlite3
import pandas as pd


def compute_card_gpv(
    conn: sqlite3.Connection,
    mid: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    card_network: Optional[str] = None,
    top_n: Optional[int] = None,
) -> Dict[str, Any]:
    """GPV from card_analytics_dwh, approved transactions only."""
    where = ["auth_status = 'approved'"]
    params: list = []
    if mid:
        where.append("MID = ?"); params.append(mid)
    if date_start:
        where.append("timestamp >= ?"); params.append(date_start)
    if date_end:
        where.append("timestamp <= ?"); params.append(date_end)
    if card_network:
        where.append("card_network = ?"); params.append(card_network)
    where_sql = " WHERE " + " AND ".join(where)

    if top_n:
        sql = (
            "SELECT MID, ROUND(SUM(amount_usd), 2) AS gpv, COUNT(*) AS txn_count "
            "FROM card_analytics_dwh" + where_sql +
            " GROUP BY MID ORDER BY gpv DESC LIMIT ?"
        )
        rows = conn.execute(sql, params + [top_n]).fetchall()
        return {"top_merchants": [
            {"mid": r[0], "gpv_usd": r[1], "txn_count": r[2]} for r in rows
        ]}

    sql = "SELECT ROUND(SUM(amount_usd), 2), COUNT(*) FROM card_analytics_dwh" + where_sql
    gpv, n = conn.execute(sql, params).fetchone()
    return {"gpv_usd": gpv or 0.0, "txn_count": n or 0}


def compute_ach_gpv(df: pd.DataFrame) -> Dict[str, Any]:
    """GPV from an ACH dataframe; 'settled' rows only."""
    settled = df[df["status"] == "settled"]
    return {
        "gpv_usd": round(float(settled["amount_usd"].sum()), 2),
        "txn_count": int(len(settled)),
    }

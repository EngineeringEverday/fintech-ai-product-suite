"""
Skill: authorization_rate

Formula:
    auth_rate = approved_txn_count / total_attempted_txn_count

Source: card_analytics_dwh (SQLite). Filter: optional MID, optional date range,
optional card_network. Group: by card_network if requested. Output: decimal
0.0-1.0 plus approved/total counts.

Sanity bounds: 0.60-0.999 (see sanity_validation_gate).
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import sqlite3


def compute_authorization_rate(
    conn: sqlite3.Connection,
    mid: Optional[str] = None,
    date_start: Optional[str] = None,   # ISO 'YYYY-MM-DDTHH:MM:SS+00:00'
    date_end: Optional[str] = None,
    card_network: Optional[str] = None,
    group_by_network: bool = False,
) -> Dict[str, Any]:
    where = []
    params: list = []
    if mid:
        where.append("MID = ?"); params.append(mid)
    if date_start:
        where.append("timestamp >= ?"); params.append(date_start)
    if date_end:
        where.append("timestamp <= ?"); params.append(date_end)
    if card_network:
        where.append("card_network = ?"); params.append(card_network)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    if group_by_network:
        sql = (
            "SELECT card_network, "
            "       SUM(CASE WHEN auth_status='approved' THEN 1 ELSE 0 END) AS approved, "
            "       COUNT(*) AS total "
            "FROM card_analytics_dwh" + where_sql +
            " GROUP BY card_network ORDER BY total DESC"
        )
        rows = conn.execute(sql, params).fetchall()
        groups = []
        for net, approved, total in rows:
            rate = (approved / total) if total else 0.0
            groups.append({
                "card_network": net,
                "approved": approved,
                "total": total,
                "auth_rate": rate,
            })
        overall = {
            "approved": sum(g["approved"] for g in groups),
            "total": sum(g["total"] for g in groups),
        }
        overall["auth_rate"] = (overall["approved"] / overall["total"]) if overall["total"] else 0.0
        return {"overall": overall, "by_network": groups}

    sql = (
        "SELECT SUM(CASE WHEN auth_status='approved' THEN 1 ELSE 0 END) AS approved, "
        "       COUNT(*) AS total "
        "FROM card_analytics_dwh" + where_sql
    )
    approved, total = conn.execute(sql, params).fetchone()
    approved = approved or 0
    total = total or 0
    rate = (approved / total) if total else 0.0
    return {"approved": approved, "total": total, "auth_rate": rate}

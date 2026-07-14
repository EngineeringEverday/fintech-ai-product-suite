"""
Skill: decline_analysis

Breakdown of card declines by decline_code. Returns the top codes with
counts, percentage of declined volume, and human-readable description.
"""

from __future__ import annotations

from typing import Optional, Dict, Any, List
import sqlite3

DECLINE_LABELS = {
    "00": "Approved",
    "05": "Do Not Honor",
    "14": "Invalid Card Number",
    "41": "Lost Card",
    "43": "Stolen Card",
    "51": "Insufficient Funds",
    "54": "Expired Card",
    "57": "Transaction Not Permitted",
    "61": "Exceeds Withdrawal Limit",
    "65": "Activity Limit Exceeded",
    "91": "Issuer Unavailable",
}


def compute_decline_breakdown(
    conn: sqlite3.Connection,
    mid: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    top_n: int = 5,
) -> Dict[str, Any]:
    where = ["auth_status = 'declined'"]
    params: list = []
    if mid:
        where.append("MID = ?"); params.append(mid)
    if date_start:
        where.append("timestamp >= ?"); params.append(date_start)
    if date_end:
        where.append("timestamp <= ?"); params.append(date_end)
    where_sql = " WHERE " + " AND ".join(where)

    sql = (
        "SELECT decline_code, COUNT(*) AS n FROM card_analytics_dwh"
        + where_sql +
        " GROUP BY decline_code ORDER BY n DESC LIMIT ?"
    )
    rows = conn.execute(sql, params + [top_n]).fetchall()
    total = sum(r[1] for r in rows) or 1
    return {
        "top_codes": [
            {
                "decline_code": code,
                "label": DECLINE_LABELS.get(code, "Unknown"),
                "count": n,
                "share": n / total,
            }
            for code, n in rows
        ],
        "total_declined_in_window": total,
    }

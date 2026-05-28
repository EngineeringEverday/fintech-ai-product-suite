"""SQLite helpers for merchant snapshots, score history, and override log."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

DB_PATH = Path("data/risk.db")


SCHEMA = """
CREATE TABLE IF NOT EXISTS merchants (
    merchant_id TEXT PRIMARY KEY,
    features_json TEXT NOT NULL,
    lob TEXT,
    state TEXT,
    vintage_days INTEGER,
    monthly_txn_volume_inr REAL,
    dispute_rate REAL,
    risk_label INTEGER,
    churn_label INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    risk_score REAL NOT NULL,
    risk_tier TEXT NOT NULL,
    churn_probability REAL NOT NULL,
    used_fallback INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_score_history_mid ON score_history(merchant_id);

CREATE TABLE IF NOT EXISTS overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_id TEXT NOT NULL,
    rule TEXT NOT NULL,
    new_tier TEXT,
    reason TEXT NOT NULL,
    ts TEXT DEFAULT (datetime('now'))
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def cursor():
    conn = connect()
    try:
        yield conn.cursor()
        conn.commit()
    finally:
        conn.close()


def upsert_merchant(merchant_id: str, features: dict, risk_label: int | None = None,
                    churn_label: int | None = None) -> None:
    with cursor() as cur:
        cur.execute(
            """INSERT OR REPLACE INTO merchants
            (merchant_id, features_json, lob, state, vintage_days,
             monthly_txn_volume_inr, dispute_rate, risk_label, churn_label)
            VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                merchant_id, json.dumps(features),
                features.get("lob"), features.get("state"),
                features.get("vintage_days"),
                features.get("monthly_txn_volume_inr"),
                features.get("dispute_rate"),
                risk_label, churn_label,
            ),
        )


def get_merchant(merchant_id: str) -> dict | None:
    with cursor() as cur:
        row = cur.execute(
            "SELECT * FROM merchants WHERE merchant_id = ?", (merchant_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["features"] = json.loads(d.pop("features_json"))
    return d


def add_score_history(merchant_id: str, score: float, tier: str,
                      churn: float, used_fallback: bool, ts: str | None = None) -> None:
    ts = ts or datetime.utcnow().isoformat()
    with cursor() as cur:
        cur.execute(
            """INSERT INTO score_history
            (merchant_id, ts, risk_score, risk_tier, churn_probability, used_fallback)
            VALUES (?,?,?,?,?,?)""",
            (merchant_id, ts, score, tier, churn, int(used_fallback)),
        )


def get_score_history(merchant_id: str, days: int = 90) -> list[dict]:
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    with cursor() as cur:
        rows = cur.execute(
            """SELECT ts, risk_score, risk_tier, churn_probability, used_fallback
            FROM score_history
            WHERE merchant_id = ? AND ts >= ?
            ORDER BY ts ASC""",
            (merchant_id, cutoff),
        ).fetchall()
    return [
        {**dict(r), "used_fallback": bool(r["used_fallback"])} for r in rows
    ]


def add_override(merchant_id: str, rule: str, new_tier: str | None, reason: str) -> None:
    with cursor() as cur:
        cur.execute(
            """INSERT INTO overrides (merchant_id, rule, new_tier, reason)
            VALUES (?,?,?,?)""",
            (merchant_id, rule, new_tier, reason),
        )


def override_rate_30d() -> float:
    """Fraction of distinct scoring events in the last 30 days that fired any rule."""
    cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
    with cursor() as cur:
        scored = cur.execute(
            "SELECT COUNT(*) AS c FROM score_history WHERE ts >= ?", (cutoff,)
        ).fetchone()["c"] or 0
        # Count distinct (merchant_id, ts-truncated-to-minute) override events,
        # since one score event may fire multiple rules.
        overridden = cur.execute(
            """SELECT COUNT(*) AS c FROM (
                SELECT DISTINCT merchant_id, substr(ts, 1, 16) AS ts_min
                FROM overrides WHERE ts >= ?
            )""",
            (cutoff,),
        ).fetchone()["c"] or 0
    return float(min(overridden, scored)) / max(scored, 1)


def seed_from_csv(csv_path: Path, limit: int = 2000) -> int:
    """Seed the merchants table from generate_dataset.py output, if present."""
    import csv as csvmod
    if not csv_path.exists():
        return 0
    count = 0
    with csv_path.open() as f, cursor() as cur:
        reader = csvmod.DictReader(f)
        for i, row in enumerate(reader):
            if i >= limit:
                break
            risk_label = int(row.pop("risk_label", 0))
            churn_label = int(row.pop("churn_label", 0))
            mid = row["merchant_id"]
            features = {k: _coerce(v) for k, v in row.items()}
            cur.execute(
                """INSERT OR REPLACE INTO merchants
                (merchant_id, features_json, lob, state, vintage_days,
                 monthly_txn_volume_inr, dispute_rate, risk_label, churn_label)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    mid, json.dumps(features),
                    features.get("lob"), features.get("state"),
                    features.get("vintage_days"),
                    features.get("monthly_txn_volume_inr"),
                    features.get("dispute_rate"),
                    risk_label, churn_label,
                ),
            )
            count += 1
    return count


def _coerce(v):
    if v is None or v == "":
        return None
    try:
        if "." in v:
            return float(v)
        return int(v)
    except (TypeError, ValueError):
        return v

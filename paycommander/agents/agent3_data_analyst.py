"""
Agent 3 -- Data Analyst

Lazy-loads the appropriate skill file from the DOMAIN_REGISTRY, then
either queries the card SQLite warehouse or reads ACH CSVs depending on
the route. Returns a structured analysis dict + the prior-period delta
for trend arrows.
"""

from __future__ import annotations

import importlib.util
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MOCK_DIR = ROOT / "data" / "mock"
DWH_FILE = MOCK_DIR / "card_analytics.db"
REGISTRY_FILE = MOCK_DIR / "DOMAIN_REGISTRY.json"
MERCHANT_FILE = MOCK_DIR / "merchant_profile.json"


# ---------------------------------------------------------------------------
# Lazy skill loader
# ---------------------------------------------------------------------------
_skill_cache: Dict[str, Any] = {}


def load_skill(metric: str):
    """Lazy-load skills/domains/<file>.py based on DOMAIN_REGISTRY."""
    if metric in _skill_cache:
        return _skill_cache[metric]
    with open(REGISTRY_FILE) as f:
        registry = json.load(f)
    rel = registry.get(metric)
    if not rel:
        raise ValueError(f"No skill registered for metric '{metric}'")
    path = ROOT / rel
    spec = importlib.util.spec_from_file_location(f"skill_{metric}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    _skill_cache[metric] = module
    return module


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    return sqlite3.connect(DWH_FILE)


def _prior_window(date_start: str, date_end: str) -> Tuple[str, str]:
    s = datetime.fromisoformat(date_start)
    e = datetime.fromisoformat(date_end)
    span = e - s
    prior_end = s - timedelta(seconds=1)
    prior_start = prior_end - span
    return prior_start.isoformat(), prior_end.isoformat()


def _load_ach_window(date_start: str, date_end: str,
                     merchant_id: Optional[str]) -> pd.DataFrame:
    s = datetime.fromisoformat(date_start)
    e = datetime.fromisoformat(date_end)
    frames = []
    for csv_file in sorted(MOCK_DIR.glob("ach_tx_*.csv")):
        # File covers a single calendar day; quick string check
        day_str = csv_file.stem.replace("ach_tx_", "")
        day = datetime.strptime(day_str, "%Y_%m_%d").replace(tzinfo=timezone.utc)
        if day < s - timedelta(days=1) or day > e + timedelta(days=1):
            continue
        df = pd.read_csv(csv_file)
        frames.append(df)
    if not frames:
        return pd.DataFrame(columns=[
            "MID", "transaction_id", "timestamp", "status",
            "amount_usd", "bank_routing", "return_code", "device_type",
        ])
    df = pd.concat(frames, ignore_index=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df[(df["timestamp"] >= s) & (df["timestamp"] <= e)]
    if merchant_id:
        df = df[df["MID"] == merchant_id]
    return df


# ---------------------------------------------------------------------------
# Main analyse routine
# ---------------------------------------------------------------------------
def analyse(route: Dict[str, Any]) -> Dict[str, Any]:
    metric = route["metric_requested"]
    skill = load_skill(metric)
    date_start, date_end = route["date_range"]
    prior_start, prior_end = _prior_window(date_start, date_end)
    mid = route["merchant_id"]
    filters = route["filters"] or {}
    network = filters.get("card_network")

    if route["route"] == "card":
        return _analyse_card(metric, skill, mid, route, date_start, date_end,
                             prior_start, prior_end, network, filters)
    return _analyse_ach(metric, mid, route, date_start, date_end,
                        prior_start, prior_end)


def _analyse_card(metric: str, skill, mid: Optional[str], route: Dict[str, Any],
                  date_start: str, date_end: str,
                  prior_start: str, prior_end: str,
                  network: Optional[str],
                  filters: Dict[str, Any]) -> Dict[str, Any]:
    conn = _connect()
    try:
        result: Dict[str, Any] = {"data_source": "card_analytics_dwh"}
        if metric == "authorization_rate":
            primary = skill.compute_authorization_rate(
                conn, mid=mid, date_start=date_start, date_end=date_end,
                card_network=network,
            )
            prior = skill.compute_authorization_rate(
                conn, mid=mid, date_start=prior_start, date_end=prior_end,
                card_network=network,
            )
            # Special: low-auth screening across all merchants
            if filters.get("auth_rate_below") is not None and not mid:
                threshold = filters["auth_rate_below"]
                # Aggregate per MID
                where = ["timestamp >= ?", "timestamp <= ?"]
                params = [date_start, date_end]
                if network:
                    where.append("card_network = ?"); params.append(network)
                sql = (
                    "SELECT MID, "
                    " SUM(CASE WHEN auth_status='approved' THEN 1 ELSE 0 END) AS a, "
                    " COUNT(*) AS t "
                    "FROM card_analytics_dwh WHERE " + " AND ".join(where) +
                    " GROUP BY MID HAVING t >= 50"
                )
                rows = conn.execute(sql, params).fetchall()
                merchants_idx = _merchant_lookup()
                bad = []
                for m_id, a, t in rows:
                    rate = a / t if t else 0
                    if rate < threshold:
                        bad.append({
                            "mid": m_id,
                            "name": merchants_idx.get(m_id, {}).get("name", m_id),
                            "auth_rate": rate,
                            "txn_count": t,
                        })
                bad.sort(key=lambda r: r["auth_rate"])
                result["screening"] = {
                    "threshold": threshold,
                    "merchants_below": bad[:25],
                    "n_total": len(bad),
                }
            result["primary"] = primary
            result["prior"] = prior

        elif metric == "payment_volume":
            primary = skill.compute_card_gpv(
                conn, mid=mid, date_start=date_start, date_end=date_end,
                card_network=network, top_n=route["top_n"],
            )
            prior = skill.compute_card_gpv(
                conn, mid=mid, date_start=prior_start, date_end=prior_end,
                card_network=network, top_n=route["top_n"],
            )
            # Decorate top-N rows with merchant names
            if route["top_n"]:
                idx = _merchant_lookup()
                for r in primary.get("top_merchants", []):
                    r["name"] = idx.get(r["mid"], {}).get("name", r["mid"])
            result["primary"] = primary
            result["prior"] = prior

        elif metric == "decline_analysis":
            primary = skill.compute_decline_breakdown(
                conn, mid=mid, date_start=date_start, date_end=date_end,
                top_n=5,
            )
            prior = skill.compute_decline_breakdown(
                conn, mid=mid, date_start=prior_start, date_end=prior_end,
                top_n=5,
            )
            result["primary"] = primary
            result["prior"] = prior

        elif metric == "chargeback_rate":
            primary = skill.compute_card_chargeback_proxy(
                conn, mid=mid, date_start=date_start, date_end=date_end,
            )
            prior = skill.compute_card_chargeback_proxy(
                conn, mid=mid, date_start=prior_start, date_end=prior_end,
            )
            result["primary"] = primary
            result["prior"] = prior

        elif metric == "fraud_signals":
            primary = skill.compute_fraud_rate(
                conn, mid=mid, date_start=date_start, date_end=date_end,
            )
            prior = skill.compute_fraud_rate(
                conn, mid=mid, date_start=prior_start, date_end=prior_end,
            )
            result["primary"] = primary
            result["prior"] = prior

        return result
    finally:
        conn.close()


def _analyse_ach(metric: str, mid: Optional[str], route: Dict[str, Any],
                 date_start: str, date_end: str,
                 prior_start: str, prior_end: str) -> Dict[str, Any]:
    df_now = _load_ach_window(date_start, date_end, mid)
    df_prior = _load_ach_window(prior_start, prior_end, mid)
    result: Dict[str, Any] = {"data_source": "ach_csv_files"}

    pv = load_skill("payment_volume")
    cb = load_skill("chargeback_rate")

    if metric == "payment_volume":
        result["primary"] = pv.compute_ach_gpv(df_now)
        result["prior"] = pv.compute_ach_gpv(df_prior)
    else:
        # Default ACH metric = return/chargeback rate
        result["primary"] = cb.compute_ach_return_rate(df_now)
        result["prior"] = cb.compute_ach_return_rate(df_prior)
    return result


def _merchant_lookup() -> Dict[str, Dict[str, Any]]:
    with open(MERCHANT_FILE) as f:
        return {m["mid"]: m for m in json.load(f)}

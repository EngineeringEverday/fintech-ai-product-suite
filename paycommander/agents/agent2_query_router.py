"""
Agent 2 -- Query Router

Takes the raw user query plus the merchant catalog and resolves it to a
structured dict the data analyst can act on:

    {
        "merchant_id":     "MID01023" | None | list,
        "merchant_name":   "DoorDash"  | None,
        "date_range":      (iso_start, iso_end),
        "date_range_label":"this week",
        "route":           "card" | "ach",
        "metric_requested":"authorization_rate" | "payment_volume" |
                           "decline_analysis"   | "chargeback_rate"  |
                           "fraud_signals",
        "filters":         { "card_network": "Visa", ... },
        "top_n":           5,
    }

Everything is deterministic; no LLM is involved.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from rapidfuzz import process, fuzz

ROOT = Path(__file__).resolve().parent.parent
MERCHANT_FILE = ROOT / "data" / "mock" / "merchant_profile.json"


def _load_merchants() -> List[Dict[str, Any]]:
    with open(MERCHANT_FILE) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Date resolution
# ---------------------------------------------------------------------------
def _today_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def resolve_date_range(query: str) -> Tuple[str, str, str]:
    """Returns (iso_start, iso_end, label)."""
    q = query.lower()
    now = _today_utc()
    today_start = now.replace(hour=0, minute=0, second=0)

    if "yesterday" in q:
        start = today_start - timedelta(days=1)
        end = today_start - timedelta(seconds=1)
        return start.isoformat(), end.isoformat(), "yesterday"

    if "today" in q:
        return today_start.isoformat(), now.isoformat(), "today"

    if "last 30 days" in q or "past 30 days" in q or "last month" in q:
        start = today_start - timedelta(days=30)
        return start.isoformat(), now.isoformat(), "last 30 days"

    if "last 7 days" in q or "past 7 days" in q or "past week" in q:
        start = today_start - timedelta(days=7)
        return start.isoformat(), now.isoformat(), "last 7 days"

    if "last week" in q:
        # ISO week: Monday to Sunday
        weekday = today_start.weekday()  # Monday=0
        this_monday = today_start - timedelta(days=weekday)
        last_monday = this_monday - timedelta(days=7)
        last_sunday_end = this_monday - timedelta(seconds=1)
        return last_monday.isoformat(), last_sunday_end.isoformat(), "last week"

    if "this week" in q:
        weekday = today_start.weekday()
        this_monday = today_start - timedelta(days=weekday)
        return this_monday.isoformat(), now.isoformat(), "this week"

    if "this month" in q:
        first = today_start.replace(day=1)
        return first.isoformat(), now.isoformat(), "this month"

    # Default = last 7 days
    start = today_start - timedelta(days=7)
    return start.isoformat(), now.isoformat(), "last 7 days (default)"


# ---------------------------------------------------------------------------
# Merchant resolution
# ---------------------------------------------------------------------------
def fuzzy_match_merchant(query: str, merchants: List[Dict[str, Any]],
                         threshold: int = 88) -> Optional[Dict[str, Any]]:
    qlow = query.lower()
    # 1) Word-boundary substring match (case-insensitive) -- longest name wins
    candidates: List[Dict[str, Any]] = []
    for m in merchants:
        name_low = m["name"].lower()
        # Require word boundaries so 'Ro' doesn't match 'across'
        pattern = r"\b" + re.escape(name_low) + r"\b"
        if re.search(pattern, qlow):
            candidates.append(m)
    if candidates:
        # Prefer longest match -- 'doordash' beats 'do'
        candidates.sort(key=lambda m: len(m["name"]), reverse=True)
        return candidates[0]
    # 2) Fall back to fuzzy match only for tokens >= 4 chars
    tokens = [t for t in re.findall(r"\w+", qlow) if len(t) >= 4]
    if not tokens:
        return None
    names = [m["name"] for m in merchants if len(m["name"]) >= 4]
    best = None
    for tok in tokens:
        match = process.extractOne(tok, names, scorer=fuzz.WRatio)
        if match and (best is None or match[1] > best[1]):
            best = match
    if best and best[1] >= threshold:
        return next((m for m in merchants if m["name"] == best[0]), None)
    return None


# ---------------------------------------------------------------------------
# Metric + route detection
# ---------------------------------------------------------------------------
METRIC_PATTERNS = [
    ("authorization_rate", [r"\bauth(orization)?\s*rate\b", r"\bapproval\s*rate\b"]),
    ("payment_volume",     [r"\bgpv\b", r"\bvolume\b", r"\btop\s+\d+\s+merchants?\b",
                            r"\brevenue\b"]),
    ("decline_analysis",   [r"\bdecline(d)?\b", r"\btop\s+decline\s*codes?\b",
                            r"\breasons?\s+for\s+decline\b"]),
    ("chargeback_rate",    [r"\bchargeback\b", r"\bach\s+return\b", r"\breturn\s+rate\b",
                            r"\bdisputes?\b"]),
    ("fraud_signals",      [r"\bfraud\b", r"\brisk\s+flag\b", r"\bsuspicious\b"]),
]

CARD_NETWORK_PATTERNS = {
    "Visa": r"\bvisa\b",
    "Mastercard": r"\bmastercard\b",
    "Amex": r"\b(amex|american\s+express)\b",
    "Discover": r"\bdiscover\b",
}


def detect_metric(query: str) -> str:
    q = query.lower()
    for metric, pats in METRIC_PATTERNS:
        for p in pats:
            if re.search(p, q):
                return metric
    # Default
    return "payment_volume"


def detect_route(metric: str, merchant: Optional[Dict[str, Any]], query: str) -> str:
    q = query.lower()
    if "ach" in q or metric in ("chargeback_rate",) and merchant and merchant["primary_payment_method"] == "ACH":
        return "ach"
    if merchant and merchant["primary_payment_method"] == "ACH" and metric != "authorization_rate":
        return "ach"
    return "card"


def detect_top_n(query: str) -> Optional[int]:
    m = re.search(r"\btop\s+(\d+)\b", query.lower())
    if m:
        return int(m.group(1))
    if re.search(r"\btop\s+merchants?\b", query.lower()):
        return 5
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def route_query(query: str) -> Dict[str, Any]:
    merchants = _load_merchants()

    matched = fuzzy_match_merchant(query, merchants)
    metric = detect_metric(query)
    route = detect_route(metric, matched, query)
    top_n = detect_top_n(query)

    date_start, date_end, date_label = resolve_date_range(query)

    filters: Dict[str, Any] = {}
    for net, pat in CARD_NETWORK_PATTERNS.items():
        if re.search(pat, query.lower()):
            filters["card_network"] = net
            break

    # Low-auth screening pattern: "auth rate below 85%"
    m_below = re.search(r"below\s+(\d{1,3})\s*%", query.lower())
    if m_below:
        filters["auth_rate_below"] = float(m_below.group(1)) / 100.0

    return {
        "merchant_id":     matched["mid"] if matched else None,
        "merchant_name":   matched["name"] if matched else None,
        "merchant_vertical": matched["vertical"] if matched else None,
        "date_range":      (date_start, date_end),
        "date_range_label": date_label,
        "route":           route,
        "metric_requested": metric,
        "filters":         filters,
        "top_n":           top_n,
    }

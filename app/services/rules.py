"""Business rule overrides applied after model scoring.

Rules
-----
1. dispute_rate > 5%  → force High Risk (or higher).
2. kyb_score < 0.3    → force Manual Review (Medium tier minimum).
3. mcc == 7995        → prohibited MCC compliance hold.
4. vintage_days < 30  → new-merchant premium (bump tier).
"""
from __future__ import annotations

from typing import List, Optional, Tuple

import pandas as pd

from app.schemas import OverrideEvent

PROHIBITED_MCCS = {7995, 5967, 6051}

TIER_ORDER = ["Low", "Medium", "High", "Critical"]


def _at_least(current: str, floor: str) -> str:
    return TIER_ORDER[max(TIER_ORDER.index(current), TIER_ORDER.index(floor))]


def apply_business_rules(row: pd.Series, current_tier: str) -> Tuple[List[OverrideEvent], Optional[str], Optional[str]]:
    """Returns (override events, new tier or None, extra action text)."""
    overrides: List[OverrideEvent] = []
    new_tier: Optional[str] = None
    extra: Optional[str] = None

    dispute_rate = float(row.get("dispute_rate", 0) or 0)
    kyb = float(row.get("kyb_score", 1) or 1)
    mcc = int(row.get("mcc", 0) or 0)
    vintage = float(row.get("vintage_days", 365) or 365)

    if dispute_rate > 0.05:
        target = _at_least(current_tier, "High")
        overrides.append(OverrideEvent(
            rule="dispute_rate>5pct", triggered=True, new_tier=target,
            reason=f"Dispute rate {dispute_rate*100:.2f}% exceeds 5% policy floor."
        ))
        new_tier = target

    if kyb < 0.30:
        target = _at_least(new_tier or current_tier, "Medium")
        overrides.append(OverrideEvent(
            rule="kyb<0.3", triggered=True, new_tier=target,
            reason=f"KYB score {kyb:.2f} below 0.30 — route to manual review."
        ))
        new_tier = target
        extra = "Hold and route to manual KYB re-verification."

    if mcc in PROHIBITED_MCCS:
        target = "Critical"
        overrides.append(OverrideEvent(
            rule="prohibited_mcc", triggered=True, new_tier=target,
            reason=f"MCC {mcc} is on the prohibited list — compliance hold required."
        ))
        new_tier = target
        extra = "Compliance hold. File internal SAR within 7 calendar days."

    if vintage < 30:
        target = _at_least(new_tier or current_tier, "Medium")
        overrides.append(OverrideEvent(
            rule="new_merchant<30d", triggered=True, new_tier=target,
            reason=f"Vintage {int(vintage)}d — new-merchant premium until 30-day history exists."
        ))
        new_tier = target if target != (new_tier or current_tier) else new_tier

    return overrides, new_tier, extra

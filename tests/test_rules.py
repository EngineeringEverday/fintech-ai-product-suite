"""Business-rule overrides."""
import pandas as pd

from app.services.rules import apply_business_rules


def _row(**kw):
    base = {"dispute_rate": 0.01, "kyb_score": 0.7, "mcc": 5411, "vintage_days": 365}
    base.update(kw)
    return pd.Series(base)


def test_no_overrides_clean_merchant():
    ov, nt, _ = apply_business_rules(_row(), "Low")
    assert ov == []
    assert nt is None


def test_dispute_forces_high():
    ov, nt, _ = apply_business_rules(_row(dispute_rate=0.07), "Low")
    assert nt == "High"
    assert any(o.rule == "dispute_rate>5pct" for o in ov)


def test_kyb_below_threshold():
    ov, nt, _ = apply_business_rules(_row(kyb_score=0.2), "Low")
    assert nt in ("Medium", "High", "Critical")
    assert any(o.rule == "kyb<0.3" for o in ov)


def test_prohibited_mcc_forces_critical():
    ov, nt, extra = apply_business_rules(_row(mcc=7995), "Low")
    assert nt == "Critical"
    assert "Compliance hold" in extra


def test_new_merchant_premium():
    ov, nt, _ = apply_business_rules(_row(vintage_days=10), "Low")
    assert nt == "Medium"
    assert any(o.rule == "new_merchant<30d" for o in ov)

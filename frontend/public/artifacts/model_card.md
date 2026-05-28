# Merchant Risk Model Card

**Owner:** Risk Decision Science · Payments Platform
**Last trained:** 2026-05-27T05:47:16.146906Z
**Dataset:** synthetic Indian-payments merchants, 5,000 rows

## Intended use

Score live merchants on a 0–100 risk scale to power onboarding, monitoring, and
limit decisions on an Indian payments platform similar to Paytm. Risk is defined
as the **probability of platform financial loss** from chargebacks, fraud,
or regulatory non-compliance over the next 90 days. A separate churn model is
included as a secondary signal for relationship management — it is **not** the
primary label.

## Out of scope

- Standalone credit underwriting.
- Real-time transaction-level fraud (this is merchant-level).
- Adverse action without human review for "High / Critical" tiers.

## Models

- **Risk:** XGBoost multi-class (`multi:softprob`, 3 classes). Trained with
  inverse-frequency class weights + smoothed target encoding of `mcc/lob/state/business_type`.
  Best params: `{'n_estimators': 289, 'max_depth': 9, 'learning_rate': 0.043322148880621254, 'subsample': 0.7226176528107469, 'colsample_bytree': 0.9676583226120019, 'min_child_weight': 7, 'reg_lambda': 0.3210381300841128, 'objective': 'multi:softprob', 'num_class': 3, 'tree_method': 'hist', 'n_jobs': 2}`.
- **Churn:** XGBoost binary (`binary:logistic`), `scale_pos_weight` adjusted to base rate.

## Top features (by gain)

`rbi_flags_count`, `aml_alerts_30d`, `log_chargeback_count_90d`, `chargeback_count_90d`, `aml_per_log_volume`, `new_merchant_flag`, `compliance_index`, `dispute_rate`, `gst_registered`, `refund_rate`

## Performance

| Model | Metric | Value |
|---|---|---|
| Risk | Macro F1 | **0.771** |
| Risk | Weighted F1 | 0.804 |
| Risk | Log loss | 0.540 |
| Churn | ROC AUC | **0.556** |
| Churn | PR AUC | 0.598 |

Confusion matrix, ROC, and PR plots are in `artifacts/*.png`.

## Calibration

Scores are converted to a 0–100 risk score by taking
`P(class=2)·100 + 0.4·P(class=1)·100` and clipping. Production should re-calibrate
with Platt scaling or isotonic regression on a holdout window before any
threshold-based decisioning. Brier-score monitoring is part of the v2 roadmap.

## Risk vs churn distinction

Risk = likelihood of **financial loss to the platform** from chargebacks, fraud,
or regulatory/compliance violations. Churn = likelihood the merchant **stops
transacting** voluntarily. They are correlated only weakly; we model them
separately because the policy responses (block, hold, review vs. retention
outreach, pricing offer) are fundamentally different.

## Limitations

- Trained on synthetic data — distributions are plausible but **not** drawn
  from production. Real distributions of `dispute_rate` and `chargeback_count_90d`
  have heavier tails and stronger MCC heterogeneity.
- No temporal split — the 80/20 split is random, so concept drift is not measured.
- SHAP values reflect model attribution, not causal effect.
- Prohibited-MCC handling is hard-coded in a business-rule layer downstream;
  the model does not by itself encode regulatory compliance decisions.

## v2 roadmap

1. Temporal validation + concept-drift dashboards (population stability index).
2. Isotonic calibration per LOB, per geography.
3. Adversarial robustness checks (synthetic feature flips).
4. Counterfactual explanations alongside SHAP.
5. Champion/challenger A/B in shadow mode before promotion.

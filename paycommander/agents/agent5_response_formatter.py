"""
Agent 5 -- Response Formatter

Produces clean markdown for the chat panel: USD currency formatting,
percentages, deltas vs prior period with trend arrows.
"""

from __future__ import annotations

from typing import Dict, Any, List, Optional


def _usd(amount: float) -> str:
    if amount is None:
        return "$0"
    if abs(amount) >= 1_000_000:
        return f"${amount/1_000_000:,.2f}M"
    if abs(amount) >= 1_000:
        return f"${amount/1_000:,.1f}K"
    return f"${amount:,.2f}"


def _pct(x: float) -> str:
    return f"{x*100:.2f}%"


def _arrow(delta: float) -> str:
    if delta > 0.001:
        return "▲"
    if delta < -0.001:
        return "▼"
    return "■"


def _delta_str(curr: float, prior: float, kind: str = "pct") -> str:
    if prior in (0, None):
        return "(no prior baseline)"
    delta = curr - prior
    arrow = _arrow(delta)
    if kind == "pct":
        return f"{arrow} {(delta*100):+.2f} pp vs prior"
    if kind == "usd":
        pct = (delta / prior) * 100 if prior else 0
        return f"{arrow} {pct:+.1f}% vs prior ({_usd(delta)})"
    return f"{arrow} {(delta):+.2f}"


def format_response(query: str, route: Dict[str, Any],
                    analysis: Dict[str, Any]) -> str:
    metric = route["metric_requested"]
    label = route["date_range_label"]
    merchant = route.get("merchant_name") or "across all merchants"
    primary = analysis.get("primary", {})
    prior = analysis.get("prior", {})

    if metric == "authorization_rate":
        return _fmt_auth(primary, prior, merchant, label, route)
    if metric == "payment_volume":
        return _fmt_gpv(primary, prior, merchant, label, route)
    if metric == "decline_analysis":
        return _fmt_decline(primary, prior, merchant, label)
    if metric == "chargeback_rate":
        return _fmt_chargeback(primary, prior, merchant, label, analysis.get("data_source", ""))
    if metric == "fraud_signals":
        return _fmt_fraud(primary, prior, merchant, label)
    return "_No formatter for this metric yet._"


# ---------------------------------------------------------------------------
def _fmt_auth(primary, prior, merchant, label, route) -> str:
    if route["filters"].get("auth_rate_below") is not None and "screening" in route.get("_inject_screening", {}):
        pass  # handled below using analysis dict

    if "screening" in primary:
        # Not actually set on primary; the caller injects it via analysis. Skip.
        pass

    rate = primary.get("auth_rate", 0)
    approved = primary.get("approved", 0)
    total = primary.get("total", 0)
    prior_rate = prior.get("auth_rate", 0)
    net = route["filters"].get("card_network")
    net_str = f" on **{net}** cards" if net else ""
    lines = [
        f"### Authorization Rate {net_str} -- {merchant}, {label}",
        "",
        f"- **Auth rate:** {_pct(rate)}  {_delta_str(rate, prior_rate, 'pct')}",
        f"- Approved transactions: {approved:,} of {total:,}",
    ]
    return "\n".join(lines)


def _fmt_low_auth(screening, label, route) -> str:
    threshold = screening["threshold"]
    rows = screening["merchants_below"]
    lines = [
        f"### Merchants with auth rate below {_pct(threshold)} -- {label}",
        "",
        f"_{screening['n_total']} merchants tripped the threshold; top offenders shown._",
        "",
        "| Merchant | MID | Auth Rate | Txn Count |",
        "|---|---|---|---|",
    ]
    for r in rows[:15]:
        lines.append(
            f"| {r['name']} | `{r['mid']}` | {_pct(r['auth_rate'])} | {r['txn_count']:,} |"
        )
    if not rows:
        lines.append("| _None_ | -- | -- | -- |")
    return "\n".join(lines)


def _fmt_gpv(primary, prior, merchant, label, route) -> str:
    if route["top_n"]:
        rows = primary.get("top_merchants", [])
        net = route["filters"].get("card_network")
        net_str = f" ({net})" if net else " (all card networks)"
        lines = [
            f"### Top {route['top_n']} Merchants by GPV{net_str} -- {label}",
            "",
            "| Rank | Merchant | MID | GPV | Txns |",
            "|---|---|---|---|---|",
        ]
        for i, r in enumerate(rows, 1):
            lines.append(
                f"| {i} | {r['name']} | `{r['mid']}` | {_usd(r['gpv_usd'])} | {r['txn_count']:,} |"
            )
        return "\n".join(lines)

    gpv = primary.get("gpv_usd", 0)
    prior_gpv = prior.get("gpv_usd", 0)
    n = primary.get("txn_count", 0)
    lines = [
        f"### GPV -- {merchant}, {label}",
        "",
        f"- **GPV:** {_usd(gpv)}  {_delta_str(gpv, prior_gpv, 'usd')}",
        f"- Transactions: {n:,}",
    ]
    return "\n".join(lines)


def _fmt_decline(primary, prior, merchant, label) -> str:
    rows = primary.get("top_codes", [])
    lines = [
        f"### Top Decline Codes -- {merchant}, {label}",
        "",
        f"_{primary.get('total_declined_in_window', 0):,} declined transactions in window._",
        "",
        "| # | Code | Reason | Count | Share |",
        "|---|---|---|---|---|",
    ]
    for i, r in enumerate(rows, 1):
        lines.append(
            f"| {i} | `{r['decline_code']}` | {r['label']} | {r['count']:,} | {_pct(r['share'])} |"
        )
    if not rows:
        lines.append("| _No declined transactions in window_ |")
    return "\n".join(lines)


def _fmt_chargeback(primary, prior, merchant, label, source) -> str:
    if "return_rate" in primary:  # ACH
        rate = primary["return_rate"]
        prior_rate = prior.get("return_rate", 0)
        if primary.get("total_txn", 0) == 0:
            return (
                f"### ACH Return Rate -- {merchant}, {label}\n\n"
                f"_No ACH transactions found for **{merchant}** in this window._\n\n"
                f"This merchant's primary payment method may not be ACH. "
                f"Try a fintech merchant (PayPal, Venmo, Cash App, Robinhood, Coinbase, Chime)."
            )
        lines = [
            f"### ACH Return Rate -- {merchant}, {label}",
            "",
            f"- **Return rate:** {_pct(rate)}  {_delta_str(rate, prior_rate, 'pct')}",
            f"- Returned: {primary['returned_count']:,} of {primary['total_txn']:,} txns",
            f"- Customer-dispute returns (R05/R07/R10/R11/R29): {_pct(primary['customer_dispute_rate'])}",
        ]
        codes = primary.get("by_return_code", [])
        if codes:
            lines.append("")
            lines.append("| Code | Count | Share of returns |")
            lines.append("|---|---|---|")
            for c in codes[:5]:
                lines.append(f"| `{c['code']}` | {c['count']:,} | {_pct(c['share'])} |")
        return "\n".join(lines)
    # Card chargeback proxy
    rate = primary.get("chargeback_proxy_rate", 0)
    prior_rate = prior.get("chargeback_proxy_rate", 0)
    return (
        f"### Chargeback Proxy Rate (fraud-flag proxy) -- {merchant}, {label}\n\n"
        f"- **Rate:** {_pct(rate)}  {_delta_str(rate, prior_rate, 'pct')}\n"
        f"- Fraud-flagged: {primary.get('fraud_flagged', 0):,} / {primary.get('approved_total', 0):,}"
    )


def _fmt_fraud(primary, prior, merchant, label) -> str:
    rate = primary.get("fraud_rate", 0)
    prior_rate = prior.get("fraud_rate", 0)
    return (
        f"### Fraud Flag Rate -- {merchant}, {label}\n\n"
        f"- **Fraud rate:** {_pct(rate)}  {_delta_str(rate, prior_rate, 'pct')}\n"
        f"- CNP fraud rate: {_pct(primary.get('cnp_fraud_rate', 0))}\n"
        f"- Flagged: {primary.get('flagged', 0):,} / {primary.get('total', 0):,}"
    )


# Helper exported so pipeline can use it directly when screening
def format_low_auth_screening(screening, label, route) -> str:
    return _fmt_low_auth(screening, label, route)

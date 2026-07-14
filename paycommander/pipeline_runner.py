"""
PayCommander pipeline runner.

Orchestrates the 6-agent flow:
    Agent 1 Main Classifier   (deterministic regex gate)
    Agent 2 Query Router      (date + merchant + metric resolution)
    Agent 3 Data Analyst      (loads skill, queries DWH or ACH CSVs)
    Agent 4 Sanity Gate       (numeric plausibility)
    Agent 5 Response Formatter(markdown for chat)
    Agent 6 Auditor Logger    (writes full trace to SQLite + returns trace)

Returns:
    {
        "answer_markdown": "...",
        "blocked":         bool,
        "anomaly":         bool,
        "trace":           {...},     # agent-by-agent steps
        "route":           {...},
        "analysis":        {...},
        "run_id":          "..."
    }
"""

from __future__ import annotations

import os
import time
from typing import Dict, Any

from agents import (
    agent1_main_classifier as a1,
    agent2_query_router as a2,
    agent3_data_analyst as a3,
    agent4_sanity_gate as a4,
    agent5_response_formatter as a5,
    agent6_auditor_logger as a6,
)


# Optional .env toggle for real LLM APIs. Default: deterministic mock path.
USE_REAL_LLM = os.environ.get("PAYCOMMANDER_USE_LLM", "0") == "1"


def run_pipeline(query: str) -> Dict[str, Any]:
    auditor = a6.Auditor()

    # ----- Agent 1 -----
    auditor.start("agent1")
    cls = a1.classify(query)
    auditor.finish("agent1", cls, status="done", mock_tokens=180)

    if cls["hard_stop"]:
        bucket = cls["bucket"]
        # Mark downstream agents as skipped
        for a in ("agent2", "agent3", "agent4", "agent5"):
            auditor.mark_skipped(a, f"hard-stop at agent1 bucket={bucket}")
        msg = (
            "## Request Blocked by Agent 1\n\n"
            f"**Bucket:** `{bucket}`\n\n"
            f"{cls['safe_message']}\n"
        )
        if bucket == "injection_attempt":
            msg += "\n> 🚨 **Risk Ops Owner Alerted.** Event logged with CRITICAL level."
        auditor.start("agent6")
        auditor.finalize(msg)
        auditor.finish("agent6", auditor.to_dict(),
                       status="anomaly" if bucket == "injection_attempt" else "blocked",
                       mock_tokens=60)
        return {
            "answer_markdown": msg,
            "blocked": True,
            "anomaly": bucket == "injection_attempt",
            "trace": auditor.to_dict(),
            "route": None,
            "analysis": None,
            "run_id": auditor.run_id,
        }

    if cls["bucket"] == "concept":
        # Lightweight concept answer -- deterministic.
        for a in ("agent3", "agent4"):
            auditor.mark_skipped(a, "concept query")
        auditor.start("agent2")
        auditor.finish("agent2", {"concept_query": True}, status="done", mock_tokens=120)

        msg = _concept_answer(query)
        auditor.start("agent5")
        auditor.finish("agent5", {"length": len(msg)}, status="done", mock_tokens=140)

        auditor.start("agent6")
        auditor.finalize(msg)
        auditor.finish("agent6", auditor.to_dict(), status="done", mock_tokens=60)
        return {
            "answer_markdown": msg,
            "blocked": False,
            "anomaly": False,
            "trace": auditor.to_dict(),
            "route": None,
            "analysis": None,
            "run_id": auditor.run_id,
        }

    # ----- Agent 2 -----
    auditor.start("agent2")
    route = a2.route_query(query)
    auditor.finish("agent2", route, status="done", mock_tokens=240)

    # ----- Agent 3 -----
    auditor.start("agent3")
    analysis = a3.analyse(route)
    auditor.finish("agent3", _summarize_analysis(analysis), status="done",
                   mock_tokens=420)

    # ----- Agent 4 -----
    auditor.start("agent4")
    ok, anomalies = a4.validate(analysis, route)
    auditor.finish(
        "agent4",
        {"ok": ok, "anomalies": anomalies},
        status="done" if ok else "anomaly",
        mock_tokens=90,
    )

    if not ok:
        msg = (
            "## 🚨 Sanity Validation Failed\n\n"
            "Agent 4 detected numeric anomalies and halted the response. "
            "**Risk Ops Owner Alerted.**\n\n"
            "**Anomalies:**\n"
            + "\n".join(f"- `{a}`" for a in anomalies)
        )
        auditor.mark_skipped("agent5", "halted by agent4")
        auditor.start("agent6")
        auditor.finalize(msg)
        auditor.finish("agent6", auditor.to_dict(), status="anomaly", mock_tokens=60)
        return {
            "answer_markdown": msg,
            "blocked": True,
            "anomaly": True,
            "trace": auditor.to_dict(),
            "route": route,
            "analysis": analysis,
            "run_id": auditor.run_id,
        }

    # ----- Agent 5 -----
    auditor.start("agent5")
    # Low-auth screening is a special table-shaped response
    primary = analysis.get("primary", {}) or {}
    if route["metric_requested"] == "authorization_rate" and route["filters"].get("auth_rate_below") is not None and not route["merchant_id"]:
        # Screening lives at analysis['primary']['screening'] (we injected via _analyse_card)
        screening = primary.get("screening") or analysis.get("screening")
        # In current implementation we put it on `result["screening"]` in agent 3,
        # but `result` becomes `analysis`. Make sure we look there.
        if not screening:
            screening = analysis.get("screening")
        # Fallback: also look on primary
        screening = screening or primary.get("screening")
        if screening:
            answer = a5.format_low_auth_screening(screening, route["date_range_label"], route)
        else:
            answer = a5.format_response(query, route, analysis)
    else:
        answer = a5.format_response(query, route, analysis)
    auditor.finish("agent5", {"chars": len(answer)}, status="done", mock_tokens=320)

    # ----- Agent 6 -----
    auditor.start("agent6")
    auditor.finalize(answer)
    auditor.finish("agent6", auditor.to_dict(), status="done", mock_tokens=80)

    return {
        "answer_markdown": answer,
        "blocked": False,
        "anomaly": False,
        "trace": auditor.to_dict(),
        "route": route,
        "analysis": _summarize_analysis(analysis),
        "run_id": auditor.run_id,
    }


# ---------------------------------------------------------------------------
def _summarize_analysis(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Trim huge SQL rows for the observer payload."""
    out = {"data_source": analysis.get("data_source")}
    if "primary" in analysis:
        out["primary"] = analysis["primary"]
    if "prior" in analysis:
        out["prior"] = analysis["prior"]
    if "screening" in analysis:
        scr = analysis["screening"].copy()
        scr["merchants_below"] = scr.get("merchants_below", [])[:5]
        out["screening"] = scr
    return out


def _concept_answer(query: str) -> str:
    q = query.lower()
    if "ach" in q:
        return (
            "### What is ACH?\n\n"
            "ACH (Automated Clearing House) is the US batch payment "
            "network operated by Nacha. Funds settle in batches "
            "(usually next-day), and failed debits return with a "
            "code like `R01` (Insufficient Funds) or `R10` "
            "(Customer Advises Not Authorized)."
        )
    return (
        "### PayCommander Concept Answer\n\n"
        "Ask about authorization rate, GPV, declines, chargebacks, "
        "fraud, or ACH returns for any of the 80+ merchants on file."
    )


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json, sys
    q = " ".join(sys.argv[1:]) or "What is DoorDash's authorization rate on Visa cards this week?"
    print(f">>> {q}")
    res = run_pipeline(q)
    print(res["answer_markdown"])
    print("\n--- TRACE ---")
    print(json.dumps(res["trace"], indent=2)[:2000])

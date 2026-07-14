"""
FastAPI backend for PayCommander.

Endpoints:
    GET  /api/health              -- service heartbeat
    GET  /api/merchants           -- merchant catalog
    POST /api/query               -- run a query through the 6-agent pipeline
    GET  /api/mis-report.pdf      -- download mock daily MIS summary
    GET  /api/stats               -- top stats bar numbers
"""

from __future__ import annotations

import io
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

# Allow `import pipeline_runner` whether we are run from /paycommander or its parent
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data.generate_mock_data import generate_all
import pipeline_runner

# Generate mock data on import (safe / idempotent)
_GEN_INFO = generate_all(force=False)

app = FastAPI(title="PayCommander", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DWH = ROOT / "data" / "mock" / "card_analytics.db"
MERCHANT_FILE = ROOT / "data" / "mock" / "merchant_profile.json"


class QueryIn(BaseModel):
    query: str


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "data": _GEN_INFO}


@app.get("/api/merchants")
def merchants() -> List[Dict[str, Any]]:
    with open(MERCHANT_FILE) as f:
        return json.load(f)


@app.get("/api/stats")
def stats() -> Dict[str, Any]:
    with open(MERCHANT_FILE) as f:
        n_merchants = len(json.load(f))
    conn = sqlite3.connect(DWH)
    n_rows = conn.execute("SELECT COUNT(*) FROM card_analytics_dwh").fetchone()[0]
    conn.close()
    return {
        "merchants_tracked": n_merchants,
        "response_target": "<30s",
        "agents": 6,
        "data_sources": 2,
        "card_rows": n_rows,
    }


@app.post("/api/query")
def query(payload: QueryIn) -> Dict[str, Any]:
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="query is empty")
    result = pipeline_runner.run_pipeline(payload.query)
    return result


@app.get("/api/mis-report.pdf")
def mis_report() -> Response:
    pdf_bytes = _build_mis_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=paycommander_mis_{datetime.utcnow():%Y%m%d}.pdf"
        },
    )


# ---------------------------------------------------------------------------
def _build_mis_pdf() -> bytes:
    """Render the daily MIS PDF: top-10 GPV, avg auth rate by network,
    top-5 decline codes."""
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from reportlab.lib.units import inch

    conn = sqlite3.connect(DWH)
    today = datetime.now(timezone.utc).replace(microsecond=0, second=0, minute=0, hour=0)
    since = (today - timedelta(days=1)).isoformat()

    # Top 10 merchants by GPV yesterday
    top_rows = conn.execute(
        "SELECT MID, ROUND(SUM(amount_usd), 2) AS gpv, COUNT(*) "
        "FROM card_analytics_dwh "
        "WHERE auth_status='approved' AND timestamp >= ? "
        "GROUP BY MID ORDER BY gpv DESC LIMIT 10",
        (since,),
    ).fetchall()
    # Average auth rate by network last 24h
    net_rows = conn.execute(
        "SELECT card_network, "
        "       ROUND(100.0 * SUM(CASE WHEN auth_status='approved' THEN 1 ELSE 0 END) / COUNT(*), 2), "
        "       COUNT(*) "
        "FROM card_analytics_dwh "
        "WHERE timestamp >= ? GROUP BY card_network",
        (since,),
    ).fetchall()
    # Top 5 decline codes
    dec_rows = conn.execute(
        "SELECT decline_code, COUNT(*) AS n FROM card_analytics_dwh "
        "WHERE auth_status='declined' AND timestamp >= ? "
        "GROUP BY decline_code ORDER BY n DESC LIMIT 5",
        (since,),
    ).fetchall()
    conn.close()

    with open(MERCHANT_FILE) as f:
        idx = {m["mid"]: m["name"] for m in json.load(f)}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.6*inch, rightMargin=0.6*inch,
        topMargin=0.6*inch, bottomMargin=0.6*inch,
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=colors.HexColor("#0F2740"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor("#0F2740"))
    foot = ParagraphStyle("foot", parent=styles["Normal"], fontSize=8,
                          textColor=colors.HexColor("#5B6B7F"))

    flow = []
    flow.append(Paragraph("PayCommander -- Daily MIS Report", h1))
    flow.append(Paragraph(
        f"Window: last 24 hours (since {since}) "
        f"&middot; Generated {datetime.utcnow():%Y-%m-%d %H:%M UTC}",
        styles["Italic"],
    ))
    flow.append(Spacer(1, 18))

    # Top 10 GPV
    flow.append(Paragraph("Top 10 Merchants by GPV", h2))
    data = [["#", "Merchant", "MID", "GPV (USD)", "Txns"]]
    for i, (mid, gpv, n) in enumerate(top_rows, 1):
        data.append([str(i), idx.get(mid, mid), mid, f"${gpv:,.2f}", str(n)])
    t = Table(data, colWidths=[0.4*inch, 2.6*inch, 1.1*inch, 1.3*inch, 0.8*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2740")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("ALIGN",      (3, 1), (4, -1), "RIGHT"),
        ("GRID",       (0, 0), (-1, -1), 0.25, colors.HexColor("#B7C0CC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#F3F6FA")]),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 18))

    # Auth rate by network
    flow.append(Paragraph("Average Authorization Rate by Card Network", h2))
    data = [["Network", "Auth Rate", "Txns"]]
    for net, rate, n in net_rows:
        data.append([net, f"{rate}%", str(n)])
    t = Table(data, colWidths=[2*inch, 1.5*inch, 1.5*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2740")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("ALIGN",      (1, 1), (-1, -1), "RIGHT"),
        ("GRID",       (0, 0), (-1, -1), 0.25, colors.HexColor("#B7C0CC")),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 18))

    # Top 5 decline codes
    flow.append(Paragraph("Top 5 Decline Codes", h2))
    DECLINE_LABELS = {
        "05": "Do Not Honor", "14": "Invalid Card Number",
        "41": "Lost Card", "43": "Stolen Card",
        "51": "Insufficient Funds", "54": "Expired Card",
        "57": "Transaction Not Permitted",
        "61": "Exceeds Withdrawal Limit",
        "65": "Activity Limit Exceeded",
        "91": "Issuer Unavailable",
    }
    data = [["Code", "Reason", "Count"]]
    for code, n in dec_rows:
        data.append([code, DECLINE_LABELS.get(code, "Unknown"), str(n)])
    t = Table(data, colWidths=[0.8*inch, 3.2*inch, 1*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2740")),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("ALIGN",      (2, 1), (-1, -1), "RIGHT"),
        ("GRID",       (0, 0), (-1, -1), 0.25, colors.HexColor("#B7C0CC")),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 24))

    flow.append(Paragraph(
        "Built by Prabhjot Singh Ahluwalia | Georgia Tech MSCS (AI Specialization) "
        "| PayCommander Architecture Demo | github.com/PrabhjotAhluwalia",
        foot,
    ))

    doc.build(flow)
    buf.seek(0)
    return buf.read()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("dashboard.api:app", host="0.0.0.0", port=8000, reload=False)

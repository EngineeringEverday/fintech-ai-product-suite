"""
Agent 6 -- Auditor Logger

Persists a full trace of every run to the pipeline_events SQLite table.
Also returns the in-memory trace so the dashboard can render the
observer portal without round-tripping to the DB.

Mock token cost and latency are tracked per agent step.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

ROOT = Path(__file__).resolve().parent.parent
DWH_FILE = ROOT / "data" / "mock" / "card_analytics.db"


# Mock token pricing -- deterministic, matches GPT-4o-mini class numbers
_MOCK_PRICE_PER_1K = 0.00015


@dataclass
class StepTrace:
    agent: str
    label: str
    status: str = "idle"            # idle | running | done | anomaly | blocked
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    latency_ms: Optional[float] = None
    token_cost_usd: Optional[float] = None
    payload: Dict[str, Any] = field(default_factory=dict)


class Auditor:
    def __init__(self):
        self.run_id = str(uuid.uuid4())
        self.steps: List[StepTrace] = [
            StepTrace("agent1", "Main Classifier"),
            StepTrace("agent2", "Query Router"),
            StepTrace("agent3", "Data Analyst"),
            StepTrace("agent4", "Sanity Validation Gate"),
            StepTrace("agent5", "Response Formatter"),
            StepTrace("agent6", "Auditor Logger"),
        ]
        self.final_response: str = ""
        self.response_hash: str = ""

    # ------------------------------------------------------------------
    def _step(self, agent: str) -> StepTrace:
        for s in self.steps:
            if s.agent == agent:
                return s
        raise KeyError(agent)

    def start(self, agent: str):
        s = self._step(agent)
        s.status = "running"
        s.started_at = time.time()

    def finish(self, agent: str, payload: Dict[str, Any],
               status: str = "done", mock_tokens: int = 320):
        s = self._step(agent)
        s.finished_at = time.time()
        if s.started_at is not None:
            s.latency_ms = round((s.finished_at - s.started_at) * 1000, 2)
        s.payload = payload
        s.status = status
        s.token_cost_usd = round(mock_tokens / 1000 * _MOCK_PRICE_PER_1K, 6)

    def mark_skipped(self, agent: str, reason: str):
        s = self._step(agent)
        s.status = "skipped"
        s.payload = {"reason": reason}
        s.latency_ms = 0.0
        s.token_cost_usd = 0.0

    # ------------------------------------------------------------------
    def finalize(self, response_md: str):
        self.final_response = response_md
        self.response_hash = hashlib.sha256(response_md.encode("utf-8")).hexdigest()[:16]
        self._persist()

    def _persist(self):
        ts = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(DWH_FILE)
        try:
            for s in self.steps:
                conn.execute(
                    "INSERT INTO pipeline_events (ts, run_id, agent, level, payload_json) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        ts, self.run_id, s.agent,
                        "CRITICAL" if s.status == "anomaly" else
                        ("WARN" if s.status == "blocked" else "INFO"),
                        json.dumps(asdict(s), default=str),
                    ),
                )
            conn.execute(
                "INSERT INTO pipeline_events (ts, run_id, agent, level, payload_json) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    ts, self.run_id, "summary", "INFO",
                    json.dumps({
                        "response_hash": self.response_hash,
                        "total_latency_ms": sum(
                            (s.latency_ms or 0) for s in self.steps
                        ),
                        "total_token_cost_usd": round(sum(
                            (s.token_cost_usd or 0) for s in self.steps
                        ), 6),
                    }),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------------
    def to_dict(self) -> Dict[str, Any]:
        return {
            "run_id": self.run_id,
            "response_hash": self.response_hash,
            "steps": [asdict(s) for s in self.steps],
            "total_latency_ms": round(sum((s.latency_ms or 0) for s in self.steps), 2),
            "total_token_cost_usd": round(sum((s.token_cost_usd or 0) for s in self.steps), 6),
        }

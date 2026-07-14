"""
Agent 1 -- Main Classifier (deterministic, pre-LLM gate)

Buckets every incoming user query into:
    - "data_query"        :: payment-analytics intent (auth rate, GPV, declines, ...)
    - "concept"           :: definitional / how-does-X-work
    - "injection_attempt" :: prompt injection / jailbreak / database-destruction
    - "out_of_scope"      :: not payments-related

For injection or out_of_scope we hard-stop with a safe canned message.
"""

from __future__ import annotations

import re
from typing import Dict, Any

INJECTION_PATTERNS = [
    r"\bignore (all )?previous (instructions|prompts|directives)\b",
    r"\bdisregard (the )?(above|prior|previous)\b",
    r"\bdrop\s+(the\s+)?(database|table|schema)\b",
    r"\bdelete\s+(all|every)\b",
    r"\btruncate\s+table\b",
    r"\bsystem\s*prompt\b",
    r"\bjailbreak\b",
    r"\byou are now\b",
    r"\bact as\b.*\b(admin|root|developer mode)\b",
    r";\s*--",
    r"--\s*$",
    r"<\s*script\b",
]

DATA_QUERY_KEYWORDS = [
    "auth", "authorization", "approval", "decline", "declined",
    "gpv", "volume", "revenue", "settlement", "settled",
    "chargeback", "return", "fraud", "risk",
    "merchant", "network", "visa", "mastercard", "amex", "discover",
    "ach", "card", "issuer", "bank", "cnp", "card-not-present",
    "top", "lowest", "highest", "bottom", "below", "above",
    "this week", "last week", "yesterday", "today", "this month",
    "last 7 days", "last 30 days", "last month",
]

CONCEPT_KEYWORDS = [
    "what is", "what's", "define", "explain", "how does",
    "difference between", "meaning of",
]

# Payments lexicon used to decide if a "concept" question is still in-scope.
PAYMENTS_LEXICON = [
    "auth", "authorization", "decline", "chargeback", "interchange",
    "ach", "card", "settlement", "fraud", "merchant", "issuer",
    "acquirer", "network", "cnp", "mid", "scheme", "visa", "mastercard",
    "amex", "discover", "return code", "r01", "r10", "ecommerce",
    "ecomm", "payment",
]


SAFE_INJECTION_MESSAGE = (
    "This request appears to attempt to override system safety rules or "
    "modify backend state. PayCommander's classifier blocked it at "
    "Agent 1. No data was queried. Risk Ops has been notified."
)

OUT_OF_SCOPE_MESSAGE = (
    "PayCommander only answers questions about payment analytics "
    "(authorization rate, GPV, declines, chargebacks, fraud, ACH). "
    "Try one of the preset queries on the left."
)


def classify(query: str) -> Dict[str, Any]:
    """Returns {bucket, confidence, hard_stop, safe_message, matched_signal}."""
    q = (query or "").strip()
    q_lower = q.lower()

    # 1) Injection takes priority
    for pat in INJECTION_PATTERNS:
        if re.search(pat, q_lower):
            return {
                "bucket": "injection_attempt",
                "confidence": 0.99,
                "hard_stop": True,
                "safe_message": SAFE_INJECTION_MESSAGE,
                "matched_signal": pat,
            }

    # 2) Data query signals
    hits = [kw for kw in DATA_QUERY_KEYWORDS if kw in q_lower]
    if hits:
        return {
            "bucket": "data_query",
            "confidence": min(0.99, 0.55 + 0.05 * len(hits)),
            "hard_stop": False,
            "safe_message": None,
            "matched_signal": hits,
        }

    # 3) Concept question?
    if any(c in q_lower for c in CONCEPT_KEYWORDS):
        if any(t in q_lower for t in PAYMENTS_LEXICON):
            return {
                "bucket": "concept",
                "confidence": 0.7,
                "hard_stop": False,
                "safe_message": None,
                "matched_signal": "concept+payments-lexicon",
            }
        return {
            "bucket": "out_of_scope",
            "confidence": 0.8,
            "hard_stop": True,
            "safe_message": OUT_OF_SCOPE_MESSAGE,
            "matched_signal": "concept-without-payments-lexicon",
        }

    # 4) Fallback -- out of scope
    return {
        "bucket": "out_of_scope",
        "confidence": 0.6,
        "hard_stop": True,
        "safe_message": OUT_OF_SCOPE_MESSAGE,
        "matched_signal": "no-signal",
    }

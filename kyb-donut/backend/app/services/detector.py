"""Heuristic document-type detection from filename hints."""
from __future__ import annotations

import re
from pathlib import Path

# Order matters - check the most specific patterns first.
PATTERNS = [
    (re.compile(r"udyam|msme", re.I), "udyam"),
    (re.compile(r"shop|estab|gumast", re.I), "shop_establishment"),
    (re.compile(r"incorporat|mca|coi|\bcin\b", re.I), "incorporation"),
    (re.compile(r"(^|[^a-z])pan([^a-z]|$)|pancard", re.I), "pan"),
    (re.compile(r"gst|gstin|gstn", re.I), "gst"),
]


def detect_doc_type(filename: str) -> str:
    name = Path(filename).stem
    for pat, label in PATTERNS:
        if pat.search(name):
            return label
    return "gst"  # safe default for KYB pipeline

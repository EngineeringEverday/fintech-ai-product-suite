"""Field-level validators for KYB extraction.

Reference for GSTIN checksum: GSTN public documentation - the 15th character is
a checksum computed on the first 14 characters using a base-36 weighted sum.
PAN: ABCDE1234F format, 4th character encodes entity type.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Optional

from dateutil import parser as dtparser
from rapidfuzz import fuzz


# ---------- GSTIN ----------
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def gstin_checksum(gstin14: str) -> str:
    """Compute the 15th GSTIN check character given the first 14.

    Algorithm (GSTN public spec):
        For each char at position i (1..14), multiply its base-36 value by
        factor (1 if i odd else 2). Take digit-sum in base-36 (floor + mod).
        Sum across all chars. Check digit = (36 - sum % 36) % 36.
    """
    if len(gstin14) != 14:
        raise ValueError("GSTIN prefix must be 14 chars")
    code_point_chars = _GSTIN_CHARS
    total = 0
    for i, ch in enumerate(gstin14):
        if ch not in code_point_chars:
            raise ValueError(f"Invalid GSTIN char: {ch}")
        val = code_point_chars.index(ch)
        factor = 2 if (i + 1) % 2 == 0 else 1
        prod = val * factor
        total += (prod // 36) + (prod % 36)
    check = (36 - (total % 36)) % 36
    return code_point_chars[check]


def validate_gstin(value: str | None) -> tuple[bool, Optional[str]]:
    if not value:
        return False, "missing"
    v = value.strip().upper()
    if not GSTIN_RE.match(v):
        return False, "regex_mismatch"
    try:
        expected = gstin_checksum(v[:14])
    except ValueError as e:
        return False, f"invalid_chars:{e}"
    if expected != v[14]:
        return False, "checksum_failed"
    return True, None


# ---------- PAN ----------
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
PAN_ENTITY_MAP = {
    "P": "Individual",
    "C": "Company",
    "H": "HUF",
    "F": "Firm",
    "A": "AOP",
    "T": "Trust",
    "B": "BOI",
    "L": "Local Authority",
    "J": "Artificial Juridical Person",
    "G": "Government",
}


def validate_pan(value: str | None, expected_entity_type: str | None = None) -> tuple[bool, Optional[str], Optional[str]]:
    if not value:
        return False, "missing", None
    v = value.strip().upper()
    if not PAN_RE.match(v):
        return False, "regex_mismatch", None
    inferred = PAN_ENTITY_MAP.get(v[3])
    if inferred is None:
        return False, "unknown_entity_code", None
    if expected_entity_type and inferred.lower() != expected_entity_type.lower():
        return False, f"entity_mismatch:expected={expected_entity_type}:found={inferred}", inferred
    return True, None, inferred


# ---------- CIN ----------
CIN_RE = re.compile(r"^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$")


def validate_cin(value: str | None) -> tuple[bool, Optional[str]]:
    if not value:
        return False, "missing"
    if not CIN_RE.match(value.strip().upper()):
        return False, "regex_mismatch"
    return True, None


# ---------- Udyam ----------
UDYAM_RE = re.compile(r"^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$")


def validate_udyam(value: str | None) -> tuple[bool, Optional[str]]:
    if not value:
        return False, "missing"
    if not UDYAM_RE.match(value.strip().upper()):
        return False, "regex_mismatch"
    return True, None


# ---------- Dates ----------
def parse_date(value: str | None) -> Optional[date]:
    if not value:
        return None
    try:
        return dtparser.parse(value, dayfirst=True).date()
    except (ValueError, TypeError, OverflowError):
        return None


def is_expiring_soon(value: str | None, days: int = 30) -> tuple[bool, Optional[str]]:
    d = parse_date(value)
    if d is None:
        return False, None
    delta = (d - datetime.utcnow().date()).days
    if delta < 0:
        return True, f"expired_{abs(delta)}d_ago"
    if delta <= days:
        return True, f"expiring_in_{delta}d"
    return False, None


# ---------- Name matching ----------
def name_similarity(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    return fuzz.token_set_ratio(a.lower().strip(), b.lower().strip()) / 100.0

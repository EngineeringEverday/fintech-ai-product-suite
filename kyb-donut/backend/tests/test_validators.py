"""Validator + GSTIN checksum tests."""
from app.services.validators import (
    gstin_checksum,
    validate_gstin,
    validate_pan,
    validate_cin,
    validate_udyam,
    name_similarity,
    is_expiring_soon,
)


def test_gstin_checksum_roundtrip():
    # We generate a body and then verify it.
    body = "27ABCDE1234F1Z"
    chk = gstin_checksum(body)
    ok, err = validate_gstin(body + chk)
    assert ok, err


def test_gstin_checksum_changes_with_input():
    a = gstin_checksum("27ABCDE1234F1Z")
    b = gstin_checksum("27ABCDE1234F2Z")
    assert a != b


def test_gstin_regex_reject():
    ok, err = validate_gstin("INVALID")
    assert not ok and err == "regex_mismatch"


def test_pan_individual_consistency():
    ok, err, kind = validate_pan("ABCPK1234A", expected_entity_type="Individual")
    assert ok and kind == "Individual", err


def test_pan_entity_mismatch_detected():
    ok, err, kind = validate_pan("ABCPK1234A", expected_entity_type="Company")
    assert not ok and err.startswith("entity_mismatch")


def test_pan_regex_reject():
    ok, err, _ = validate_pan("12345ABCDE")
    assert not ok and err == "regex_mismatch"


def test_cin_valid_format():
    ok, err = validate_cin("U12345MH2020PTC123456")
    assert ok, err


def test_cin_invalid_format():
    ok, err = validate_cin("INVALID")
    assert not ok


def test_udyam_valid_format():
    ok, err = validate_udyam("UDYAM-MH-15-1234567")
    assert ok, err


def test_name_similarity_basic():
    assert name_similarity("Lotus Foods Pvt Ltd", "Lotus Foods Private Limited") > 0.7
    assert name_similarity("Lotus Foods", "Nimbus Traders") < 0.5


def test_expiry_flag():
    # Past date is flagged
    flagged, code = is_expiring_soon("01/01/2000", days=30)
    assert flagged and code.startswith("expired")
    # Far future is not flagged
    flagged, code = is_expiring_soon("01/01/2099", days=30)
    assert not flagged

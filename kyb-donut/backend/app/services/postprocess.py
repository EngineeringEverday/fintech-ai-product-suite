"""Combine inference output with validators -> ExtractionResponse."""
from __future__ import annotations

from typing import Optional

from app.core.config import settings
from app.models.schemas import (
    CRITICAL_FIELDS,
    DOC_FIELDS,
    ExtractionResponse,
    FieldExtraction,
)
from app.services import validators as V
from app.services.inference import InferenceResult


def _validate_field(doc_type: str, field: str, value: str, sibling: dict[str, str]) -> tuple[bool, Optional[str]]:
    if field == "gstin":
        ok, err = V.validate_gstin(value)
        return ok, err
    if field == "pan_number":
        ok, err, _ = V.validate_pan(value, expected_entity_type=sibling.get("entity_type"))
        return ok, err
    if field == "cin":
        return V.validate_cin(value)
    if field == "udyam_number":
        return V.validate_udyam(value)
    if field in ("valid_to",):
        expiring, code = V.is_expiring_soon(value, settings.EXPIRY_DAYS_FLAG)
        if expiring:
            return False, code
        return True, None
    # Date sanity
    if field.endswith("_date") or field in ("dob_or_incorporation", "valid_from", "incorporation_date", "registration_date"):
        return (V.parse_date(value) is not None), None if V.parse_date(value) else "unparsable_date"
    # default: non-empty
    return bool(value and value.strip()), None if (value and value.strip()) else "empty"


def build_response(
    doc_type: str,
    inference: InferenceResult,
    cross_doc_names: Optional[dict[str, str]] = None,
) -> ExtractionResponse:
    fields_out: dict[str, FieldExtraction] = {}
    validation_errors: list[str] = []

    for f in DOC_FIELDS[doc_type]:
        raw_value = inference.fields.get(f, "")
        ok, err = _validate_field(doc_type, f, raw_value, inference.fields)
        # Confidence combines model probability with validation outcome.
        base = inference.field_probs.get(f, 0.5)
        # If validation fails, attenuate confidence.
        confidence = base * (1.0 if ok else 0.55)
        fields_out[f] = FieldExtraction(
            value=raw_value or None,
            confidence=round(confidence, 4),
            validated=ok,
            validation_error=err,
        )
        if not ok and err:
            validation_errors.append(f"{f}:{err}")

    # Overall confidence = weighted avg, critical fields counted 2x
    crit = set(CRITICAL_FIELDS.get(doc_type, []))
    total_w = 0.0
    total_s = 0.0
    for f, fe in fields_out.items():
        w = 2.0 if f in crit else 1.0
        total_w += w
        total_s += w * fe.confidence
    overall = round(total_s / max(total_w, 1.0), 4)

    # Review decision: any critical field unvalidated OR overall conf below threshold
    needs_review = False
    review_reason: Optional[str] = None
    failed_crit = [f for f in crit if not fields_out[f].validated]
    if failed_crit:
        needs_review = True
        review_reason = f"critical_validation_failed:{','.join(failed_crit)}"
    elif overall < settings.DOC_REVIEW_THRESHOLD:
        needs_review = True
        review_reason = f"low_confidence:{overall:.2f}<{settings.DOC_REVIEW_THRESHOLD}"

    # Cross-document name consistency check (when caller provides reference names)
    if cross_doc_names:
        primary = (
            inference.fields.get("legal_name")
            or inference.fields.get("company_name")
            or inference.fields.get("enterprise_name")
            or inference.fields.get("establishment_name")
            or inference.fields.get("name")
        )
        if primary:
            for other_doc, other_name in cross_doc_names.items():
                sim = V.name_similarity(primary, other_name)
                if sim < settings.NAME_MATCH_THRESHOLD:
                    validation_errors.append(f"name_mismatch_with_{other_doc}:{sim:.2f}")
                    needs_review = True
                    review_reason = review_reason or f"name_mismatch:{other_doc}"

    return ExtractionResponse(
        document_type=doc_type,
        fields=fields_out,
        overall_confidence=overall,
        processing_time_ms=0,  # filled in by caller
        needs_review=needs_review,
        review_reason=review_reason,
        validation_errors=validation_errors,
        raw_json={k: v.value for k, v in fields_out.items()},
    )

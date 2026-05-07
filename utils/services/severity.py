from __future__ import annotations

CONFIDENCE_HIGH = 0.80
CONFIDENCE_MEDIUM = 0.50

SeverityLevel = str

_DETECTION_DEFAULTS: dict[str, SeverityLevel] = {
    "deterministic_field": "medium",
    "deterministic_structural": "medium",
    "cross_document_rule": "high",
    "llm_inference": "low",
    "hybrid": "medium",
}

_HIGH_IMPACT_FLAGS = {
    "approval",
    "critical_activity",
    "deadline",
    "evidence",
    "executive_signoff",
    "financial_integrity",
    "regulatory",
    "repeated_exception",
    "segregation_of_duties",
    "sla",
}

_CRITICAL_IMPACT_FLAGS = {
    "customer_impact",
    "executive_signoff",
    "financial_integrity",
    "material_process_break",
    "recovery",
    "regulatory_breach",
    "system_recovery",
}


def confidence_band(score: float) -> str:
    value = float(score)
    if value < 0.0 or value > 1.0:
        raise ValueError("confidence score must be between 0.0 and 1.0")
    if value >= CONFIDENCE_HIGH:
        return "high"
    if value >= CONFIDENCE_MEDIUM:
        return "medium"
    return "low"


def default_severity_for_detection(method: str) -> SeverityLevel:
    return _DETECTION_DEFAULTS.get(str(method or "").strip(), "informational")


def calculate_finding_severity(
    detection_method: str,
    confidence: float,
    impact_flags: set[str] | None = None,
) -> SeverityLevel:
    band = confidence_band(confidence)
    flags = {flag.strip().lower() for flag in (impact_flags or set()) if flag}
    if band == "low":
        return "informational"

    severity = default_severity_for_detection(detection_method)
    if band == "medium" and severity == "high":
        severity = "medium"

    if flags.intersection(_HIGH_IMPACT_FLAGS) and band in {"medium", "high"}:
        severity = _max_severity(severity, "high" if band == "high" else "medium")

    if flags.intersection(_CRITICAL_IMPACT_FLAGS) and band == "high":
        severity = "critical"

    if detection_method == "llm_inference" and severity in {"high", "critical"}:
        return "medium"
    return severity


def _max_severity(left: SeverityLevel, right: SeverityLevel) -> SeverityLevel:
    rank = {
        "informational": 0,
        "low": 1,
        "medium": 2,
        "high": 3,
        "critical": 4,
    }
    return left if rank.get(left, 0) >= rank.get(right, 0) else right

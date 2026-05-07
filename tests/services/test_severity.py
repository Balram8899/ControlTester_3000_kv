from __future__ import annotations

import pytest


def test_confidence_band_thresholds() -> None:
    from utils.services.severity import confidence_band

    assert confidence_band(0.95) == "high"
    assert confidence_band(0.80) == "high"
    assert confidence_band(0.79) == "medium"
    assert confidence_band(0.50) == "medium"
    assert confidence_band(0.49) == "low"


def test_default_severity_for_detection_method() -> None:
    from utils.services.severity import default_severity_for_detection

    assert default_severity_for_detection("deterministic_field") == "medium"
    assert default_severity_for_detection("deterministic_structural") == "medium"
    assert default_severity_for_detection("cross_document_rule") == "high"
    assert default_severity_for_detection("llm_inference") == "low"
    assert default_severity_for_detection("hybrid") == "medium"
    assert default_severity_for_detection("unknown") == "informational"


def test_impact_flags_escalate_severity() -> None:
    from utils.services.severity import calculate_finding_severity

    assert (
        calculate_finding_severity(
            "deterministic_field",
            confidence=0.91,
            impact_flags={"approval", "regulatory"},
        )
        == "high"
    )
    assert (
        calculate_finding_severity(
            "cross_document_rule",
            confidence=0.94,
            impact_flags={"customer_impact", "recovery"},
        )
        == "critical"
    )


def test_low_confidence_guardrail_prevents_high_or_critical() -> None:
    from utils.services.severity import calculate_finding_severity

    assert (
        calculate_finding_severity(
            "cross_document_rule",
            confidence=0.42,
            impact_flags={"regulatory", "customer_impact"},
        )
        == "informational"
    )
    assert (
        calculate_finding_severity(
            "llm_inference",
            confidence=0.62,
            impact_flags={"regulatory"},
        )
        == "medium"
    )


def test_invalid_confidence_is_rejected() -> None:
    from utils.services.severity import confidence_band

    with pytest.raises(ValueError, match="between 0.0 and 1.0"):
        confidence_band(1.2)

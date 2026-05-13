from utils.control_assurance.ct_models import (
    CreateControlRequest,
    CreateSessionRequest,
    ControlStepInput,
    TestingPeriod as CtTestingPeriod,
)


def test_create_session_request_parses():
    data = {
        "title": "Q1 ITGC",
        "entity": "Technology",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX s.404",
    }

    req = CreateSessionRequest.model_validate(data)

    assert req.title == "Q1 ITGC"
    assert req.testing_period.from_ == "2026-01-01"
    assert req.testing_period.to == "2026-03-31"
    assert req.description == ""
    assert req.preparer == ""


def test_create_session_request_defaults_framework_when_omitted():
    data = {
        "title": "Q1 ITGC",
        "entity": "Technology",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
    }

    req = CreateSessionRequest.model_validate(data)

    assert req.framework == "Controls Assurance"


def test_create_control_request_defaults():
    data = {
        "control_id": "ITGC-001",
        "control_name": "Password Policy",
        "control_type": "Preventive",
        "test_steps": [
            {
                "label": "A",
                "description": "Inspect policy",
                "evidence_required": "Screenshot",
            }
        ],
    }

    req = CreateControlRequest.model_validate(data)

    assert req.inherent_risk_rating == "Medium"
    assert req.prior_period_result == "N/A"
    assert req.sampling_mode == "sample"
    assert len(req.test_steps) == 1
    assert isinstance(req.test_steps[0], ControlStepInput)
    assert req.test_steps[0].label == "A"


def test_create_control_request_accepts_test_attributes_and_sampling_context():
    data = {
        "control_id": "PWD-001",
        "control_name": "Password Complexity Policy",
        "sampling_mode": "sample",
        "sampling_additional_context": "Exclude tickers beginning with 013, 014, or 105.",
        "test_steps": [
            {
                "attribute_id": "TA-001",
                "label": "TA-001",
                "test_attribute": "Password complexity is enabled",
                "description": "Review the AD configuration screenshot.",
                "evidence_required": "AD configuration screenshot",
            }
        ],
    }

    req = CreateControlRequest.model_validate(data)

    assert req.control_type == ""
    assert req.sampling_additional_context == "Exclude tickers beginning with 013, 014, or 105."
    assert req.test_steps[0].attribute_id == "TA-001"
    assert req.test_steps[0].label == "TA-001"
    assert req.test_steps[0].test_attribute == "Password complexity is enabled"


def test_testing_period_serializes_with_from_alias():
    period = CtTestingPeriod.model_validate({"from": "2026-01-01", "to": "2026-03-31"})

    serialized = period.model_dump(by_alias=True)

    assert "from" in serialized
    assert serialized["from"] == "2026-01-01"

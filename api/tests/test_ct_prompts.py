from __future__ import annotations


def test_case_analysis_prompt_is_string_with_json_schema():
    from utils.control_assurance.prompts.case_analysis import build_case_analysis_prompt

    session = {
        "title": "Q1 ITGC",
        "entity": "Tech",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX",
    }
    controls = [
        {
            "control_id": "ITGC-001",
            "name": "Password Policy",
            "type": "Preventive",
            "risk": "Unauth access",
            "domain": "Access Mgmt",
            "frequency": "Continuous",
            "inherent_risk_rating": "High",
            "prior_period_result": "Effective",
            "walkthrough_performed": False,
            "sampling_mode": "sample",
            "test_steps": [{"label": "A", "description": "Inspect policy"}],
        }
    ]

    prompt = build_case_analysis_prompt(session, controls)

    assert isinstance(prompt, str)
    assert "case_questions" in prompt
    assert "ITGC-001" in prompt


def test_population_ca_prompt_is_string():
    from utils.control_assurance.prompts.ca_verification import build_population_ca_prompt

    control = {"name": "Password Policy", "type": "Preventive", "domain": "Access Mgmt"}
    period = {"from": "2026-01-01", "to": "2026-03-31"}
    file_meta = {
        "filename": "users.xlsx",
        "file_type": "excel",
        "row_count": 250,
        "columns": ["UserID", "Date", "Approver"],
        "date_range_found": {"min": "2026-01-02", "max": "2026-03-28"},
        "file_modified_date": "2026-04-01",
        "sample_rows": [],
    }

    prompt = build_population_ca_prompt(control, period, file_meta)

    assert isinstance(prompt, str)
    assert "completeness_passed" in prompt
    assert "users.xlsx" in prompt


def test_evidence_ca_prompt_is_string():
    from utils.control_assurance.prompts.ca_verification import build_evidence_ca_prompt

    control = {"name": "Password Policy", "type": "Preventive", "domain": "Access Mgmt"}
    period = {"from": "2026-01-01", "to": "2026-03-31"}
    steps = [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}]
    file_meta = {
        "filename": "ad_policy.png",
        "file_type": "image",
        "file_modified_date": "2026-03-15",
        "extracted_text": "Min password length: 12",
        "metadata": {},
    }

    prompt = build_evidence_ca_prompt(control, period, steps, file_meta)

    assert isinstance(prompt, str)
    assert "identified_value" in prompt


def test_sampling_prompt_is_string():
    from utils.control_assurance.prompts.sampling import build_sampling_prompt

    control = {
        "name": "Password Policy",
        "type": "Preventive",
        "frequency": "Continuous",
        "inherent_risk_rating": "High",
        "prior_period_result": "Effective",
    }
    population = {"count": 500, "description": "All active users", "sample_period": "Jan-Mar 2026"}

    prompt = build_sampling_prompt(control, population, user_mode=None)

    assert isinstance(prompt, str)
    assert "recommended_strategy" in prompt


def test_evidence_mapping_prompt_is_string():
    from utils.control_assurance.prompts.evidence_mapping import build_evidence_mapping_prompt

    control = {"name": "Password Policy", "type": "Preventive"}
    steps = [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}]
    file_meta = {
        "filename": "ad_policy.png",
        "file_type": "image",
        "extracted_text": "Min password length: 12",
        "metadata": {},
    }

    prompt = build_evidence_mapping_prompt(control, steps, file_meta)

    assert isinstance(prompt, str)
    assert "mapped_steps" in prompt

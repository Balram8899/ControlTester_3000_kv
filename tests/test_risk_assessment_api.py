# tests/test_risk_assessment_api.py
import pytest
from fastapi.testclient import TestClient
from datetime import datetime
from unittest.mock import patch, MagicMock

# Patch MongoDB before importing app
with patch("pymongo.MongoClient") as _mc:
    _mc.return_value.__getitem__.return_value.__getitem__.return_value = MagicMock()
    from api.main import app

client = TestClient(app)


def test_get_sections_returns_8():
    r = client.get("/risk-assessment/sections")
    assert r.status_code == 200
    data = r.json()
    assert len(data["sections"]) == 8


def test_get_sections_structure():
    r = client.get("/risk-assessment/sections")
    s = r.json()["sections"][0]
    assert "id" in s and "title" in s and "questions" in s


def test_create_assessment_201():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="Test", description="desc",
            status="draft", asset_ids=["a1"],
            responses=[], risks=[], applied_controls=[],
            suggested_controls=[], report_markdown=None,
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.create.return_value = ra
        r = client.post("/risk-assessment", json={
            "title": "Test", "description": "desc", "asset_ids": ["a1"],
        })
    assert r.status_code == 201
    assert r.json()["title"] == "Test"


def test_submit_response_with_section_id():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="Test", description="desc",
            status="in_progress", asset_ids=["a1"],
            responses=[], risks=[], applied_controls=[],
            suggested_controls=[], report_markdown=None,
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        gs.return_value.add_response.return_value = True
        r = client.post("/risk-assessment/ra1/respond", json={
            "asset_id": "a1",
            "section_id": "business_criticality",
            "question_id": "bc_1",
            "answer": "yes",
            "details": "This is our main trading platform.",
        })
    assert r.status_code == 201
    assert r.json()["ok"] is True


def test_submit_response_rejects_unknown_answer():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="Test", description="desc",
            status="in_progress", asset_ids=["a1"],
            responses=[], risks=[], applied_controls=[],
            suggested_controls=[], report_markdown=None,
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        r = client.post("/risk-assessment/ra1/respond", json={
            "asset_id": "a1",
            "section_id": "business_criticality",
            "question_id": "bc_1",
            "answer": "maybe",
            "details": "",
        })
    assert r.status_code == 422


def test_get_assessment_404_when_missing():
    with patch("api.routers.risk_assessment.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.get("/risk-assessment/nonexistent")
    assert r.status_code == 404


def test_suggest_controls_404_unknown_assessment():
    with patch("api.routers.risk_assessment.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post("/risk-assessment/missing/suggest-controls")
    assert r.status_code == 404


def test_suggest_controls_400_no_risks():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="T", description="d", status="in_progress",
            asset_ids=["a1"], responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        r = client.post("/risk-assessment/ra1/suggest-controls")
    assert r.status_code == 400


def test_suggest_controls_returns_llm_suggestions_from_controls_library():
    with (
        patch("api.routers.risk_assessment.get_store") as gs,
        patch("utils.controls_library.MongoControlsStore") as store_cls,
        patch("utils.llm_provider.get_llm") as mock_get_llm,
    ):
        from api.routers.risk_assessment import RiskAssessment

        ra = RiskAssessment(
            id="ra1",
            title="Cloud review",
            description="desc",
            status="risks_identified",
            asset_ids=["a1"],
            responses=[],
            risks=[
                {
                    "id": "risk-1",
                    "asset_id": "a1",
                    "title": "Unauthorized administrative access",
                    "description": "Privileged access is insufficiently restricted.",
                    "risk_category": "Operational",
                    "likelihood_score": 3,
                    "impact_score": 4,
                    "inherent_risk_score": 12,
                    "inherent_risk_band": "High",
                    "residual_risk_score": 12,
                    "residual_risk_band": "High",
                    "source": "llm_generated",
                    "human_rationale": "Administrative access is too broad.",
                    "status": "identified",
                }
            ],
            applied_controls=[],
            suggested_controls=[],
            report_markdown=None,
            created_at="2026-01-01",
            updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        class FakeStore:
            def all_controls(self):
                return [
                    {
                        "control_id": "AC-01",
                        "name": "Privileged access review",
                        "description": "Privileged access must be reviewed and approved.",
                        "domain": "access_control",
                    },
                    {
                        "control_id": "AC-02",
                        "name": "Multi-factor authentication",
                        "description": "Administrative access must require MFA.",
                        "domain": "access_control",
                    },
                ]

        store_cls.side_effect = lambda: FakeStore()
        mock_get_llm.return_value.invoke.return_value.content = """
[
  {
    "risk_id": "risk-1",
    "control_id": "AC-02",
    "control_title": "Multi-factor authentication",
    "rationale": "MFA reduces the chance of unauthorized administrative access.",
    "relevance_score": 5
  }
]
"""

        r = client.post("/risk-assessment/ra1/suggest-controls")

    assert r.status_code == 200
    body = r.json()
    assert body["suggestions"][0]["control_id"] == "AC-02"
    assert body["suggestions"][0]["control_title"] == "Multi-factor authentication"
    gs.return_value.set_suggested_controls.assert_called_once()


def test_suggest_controls_falls_back_to_library_matching_when_llm_fails():
    with (
        patch("api.routers.risk_assessment.get_store") as gs,
        patch("utils.controls_library.MongoControlsStore") as store_cls,
        patch("utils.llm_provider.get_llm", side_effect=EnvironmentError("missing llm config")),
    ):
        from api.routers.risk_assessment import RiskAssessment

        ra = RiskAssessment(
            id="ra1",
            title="Cloud review",
            description="desc",
            status="risks_identified",
            asset_ids=["a1"],
            responses=[],
            risks=[
                {
                    "id": "risk-1",
                    "asset_id": "a1",
                    "title": "Unauthorized administrative access",
                    "description": "Privileged access is insufficiently restricted.",
                    "risk_category": "Operational",
                    "likelihood_score": 3,
                    "impact_score": 4,
                    "inherent_risk_score": 12,
                    "inherent_risk_band": "High",
                    "residual_risk_score": 12,
                    "residual_risk_band": "High",
                    "source": "llm_generated",
                    "human_rationale": "Administrative access is too broad.",
                    "status": "identified",
                }
            ],
            applied_controls=[],
            suggested_controls=[],
            report_markdown=None,
            created_at="2026-01-01",
            updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        class FakeStore:
            def all_controls(self):
                return [
                    {
                        "control_id": "AC-01",
                        "name": "Privileged access review",
                        "description": "Privileged access must be reviewed and approved.",
                        "domain": "access_control",
                    },
                    {
                        "control_id": "AC-02",
                        "name": "Multi-factor authentication",
                        "description": "Administrative access must require MFA.",
                        "domain": "access_control",
                    },
                    {
                        "control_id": "BK-01",
                        "name": "Backup verification",
                        "description": "Backups must be tested regularly.",
                        "domain": "business_continuity",
                    },
                ]

        store_cls.side_effect = lambda: FakeStore()

        r = client.post("/risk-assessment/ra1/suggest-controls")

    assert r.status_code == 200
    body = r.json()
    assert len(body["suggestions"]) >= 1
    assert body["suggestions"][0]["risk_id"] == "risk-1"
    assert body["suggestions"][0]["control_id"] in {"AC-01", "AC-02"}
    gs.return_value.set_suggested_controls.assert_called_once()


def test_generate_report_404_unknown_assessment():
    with patch("api.routers.risk_assessment.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post("/risk-assessment/missing/generate-report")
    assert r.status_code == 404


def test_generate_report_400_no_risks():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="T", description="d", status="in_progress",
            asset_ids=["a1"], responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        r = client.post("/risk-assessment/ra1/generate-report")
    assert r.status_code == 400


def test_generate_report_uses_exact_assessment_facts_and_detailed_breakdown():
    with (
        patch("api.routers.risk_assessment.get_store") as gs,
        patch("api.routers.assets.get_store") as asset_gs,
        patch("utils.llm_provider.get_llm") as mock_get_llm,
        patch("api.routers.risk_assessment.datetime") as mock_datetime,
    ):
        from api.routers.risk_assessment import RiskAssessment

        mock_datetime.utcnow.return_value = datetime(2026, 4, 20, 8, 30, 0)
        mock_get_llm.return_value.invoke.return_value.content = """# Report Header
**Assessment Name:** Test Cloud sec review
**Assessment Description:** Review of AWS assets
**Date of Report:** October 24, 2023

# Application-by-Application Findings
**Application ID: ad-hoc-1**
"""

        ra = RiskAssessment(
            id="ra1",
            title="Test Cloud sec review",
            description="Review of AWS assets",
            status="risks_identified",
            asset_ids=["ad-hoc-1"],
            ad_hoc_applications=[
                {
                    "id": "ad-hoc-1",
                    "name": "AWS EC2 India",
                    "description": "",
                    "assessment_context": "",
                    "business_context": "",
                    "purpose": "",
                    "use": "",
                    "confidentiality": 3,
                    "integrity": 2,
                    "availability": 2,
                    "hosting_type": None,
                    "support_type": None,
                    "owner": "",
                    "custodian": "",
                    "jurisdiction": "",
                    "classification": "",
                    "internet_exposure": False,
                    "data_sensitivity_summary": "",
                    "primary_users": "",
                    "key_integrations": "",
                }
            ],
            responses=[
                {
                    "id": "resp-1",
                    "asset_id": "ad-hoc-1",
                    "section_id": "business_criticality",
                    "question_id": "bc_1",
                    "answer": "yes",
                    "details": "Supports production workloads",
                    "submitted_at": "2026-04-20T06:24:51.806988",
                },
                {
                    "id": "resp-2",
                    "asset_id": "ad-hoc-1",
                    "section_id": "business_criticality",
                    "question_id": "bc_2",
                    "answer": "na",
                    "details": "",
                    "submitted_at": "2026-04-20T06:24:51.806988",
                },
            ],
            risks=[
                {
                    "id": "risk-1",
                    "asset_id": "ad-hoc-1",
                    "title": "Privileged access concentration",
                    "description": "Administrative access is concentrated in too few accounts.",
                    "risk_category": "Operational",
                    "likelihood_score": 3,
                    "impact_score": 2,
                    "inherent_risk_score": 6,
                    "inherent_risk_band": "Medium",
                    "residual_risk_score": 6,
                    "residual_risk_band": "Medium",
                    "source": "human_added",
                    "human_rationale": "Too few administrators support the platform.",
                    "status": "identified",
                }
            ],
            applied_controls=[],
            suggested_controls=[],
            report_markdown=None,
            created_at="2026-04-20T06:23:46.541595",
            updated_at="2026-04-20T06:32:47.120170",
        )
        gs.return_value.get.return_value = ra
        asset_gs.return_value.get.return_value = None

        r = client.post("/risk-assessment/ra1/generate-report")

    assert r.status_code == 200
    report = r.json()["report_markdown"]
    assert "Date of Report: April 20, 2026" in report
    assert "Assessment Created: April 20, 2026" in report
    assert "AWS EC2 India" in report
    assert "Application ID: ad-hoc-1" not in report
    assert "Response Breakdown" in report
    assert "Yes: 1" in report
    assert "N/A: 1" in report


def test_generate_report_treats_ad_hoc_cia_total_12_as_critical():
    with (
        patch("api.routers.risk_assessment.get_store") as gs,
        patch("api.routers.assets.get_store") as asset_gs,
        patch("api.routers.risk_assessment.datetime") as mock_datetime,
    ):
        from api.routers.risk_assessment import RiskAssessment

        mock_datetime.utcnow.return_value = datetime(2026, 4, 20, 8, 30, 0)

        ra = RiskAssessment(
            id="ra-critical",
            title="Critical ad hoc review",
            description="Review ad-hoc criticality",
            status="risks_identified",
            asset_ids=["ad-hoc-critical"],
            ad_hoc_applications=[
                {
                    "id": "ad-hoc-critical",
                    "name": "Ad hoc payments app",
                    "description": "",
                    "confidentiality": 4,
                    "integrity": 4,
                    "availability": 4,
                }
            ],
            responses=[],
            risks=[
                {
                    "id": "risk-1",
                    "asset_id": "ad-hoc-critical",
                    "title": "Payment availability loss",
                    "description": "Payment processing could be disrupted.",
                    "risk_category": "Operational",
                    "likelihood_score": 3,
                    "impact_score": 4,
                    "inherent_risk_score": 12,
                    "inherent_risk_band": "High",
                    "residual_risk_score": 12,
                    "residual_risk_band": "High",
                    "source": "human_added",
                    "human_rationale": "",
                    "status": "identified",
                }
            ],
            applied_controls=[],
            suggested_controls=[],
            report_markdown=None,
            created_at="2026-04-20T06:23:46.541595",
            updated_at="2026-04-20T06:32:47.120170",
        )
        gs.return_value.get.return_value = ra
        asset_gs.return_value.get.return_value = None

        r = client.post("/risk-assessment/ra-critical/generate-report")

    assert r.status_code == 200
    report = r.json()["report_markdown"]
    assert "CIA 4/4/4 (total 12, criticality Critical)" in report
    assert "CIA Profile: C 4 | I 4 | A 4 | Total 12 (Critical)" in report


def test_analyze_treats_ad_hoc_cia_total_12_as_critical():
    with (
        patch("api.routers.risk_assessment.get_store") as gs,
        patch("api.routers.assets.get_store") as asset_gs,
        patch("utils.llm_provider.get_llm") as mock_get_llm,
    ):
        from api.routers.risk_assessment import RiskAssessment

        mock_get_llm.return_value.invoke.return_value.content = """[
          {
            "title": "Payment outage",
            "description": "Payment processing could be disrupted.",
            "risk_category": "Operational",
            "likelihood_score": 3,
            "impact_score": 4,
            "rationale": "CIA impact is material."
          }
        ]"""

        ra = RiskAssessment(
            id="ra-critical",
            title="Critical ad hoc review",
            description="Review ad-hoc criticality",
            status="in_progress",
            asset_ids=["ad-hoc-critical"],
            ad_hoc_applications=[
                {
                    "id": "ad-hoc-critical",
                    "name": "Ad hoc payments app",
                    "description": "",
                    "confidentiality": 4,
                    "integrity": 4,
                    "availability": 4,
                }
            ],
            responses=[
                {
                    "id": "resp-1",
                    "asset_id": "ad-hoc-critical",
                    "section_id": "business_criticality",
                    "question_id": "bc_1",
                    "answer": "yes",
                    "details": "Supports payments.",
                    "submitted_at": "2026-04-20T06:24:51.806988",
                }
            ],
            risks=[],
            applied_controls=[],
            suggested_controls=[],
            report_markdown=None,
            created_at="2026-04-20T06:23:46.541595",
            updated_at="2026-04-20T06:32:47.120170",
        )
        gs.return_value.get.return_value = ra
        asset_gs.return_value.get.return_value = None

        r = client.post("/risk-assessment/ra-critical/analyze")

    assert r.status_code == 200
    prompt = mock_get_llm.return_value.invoke.call_args.args[0][0].content
    assert "CIA Total: 12/15 (Band: Critical)" in prompt


def test_generate_report_normalizes_mojibake_in_risk_titles():
    with (
        patch("api.routers.risk_assessment.get_store") as gs,
        patch("api.routers.assets.get_store") as asset_gs,
        patch("api.routers.risk_assessment.datetime") as mock_datetime,
    ):
        from api.routers.risk_assessment import RiskAssessment

        mock_datetime.utcnow.return_value = datetime(2026, 4, 20, 8, 30, 0)

        ra = RiskAssessment(
            id="ra1",
            title="Encoding cleanup review",
            description="Check display normalization",
            status="risks_identified",
            asset_ids=["ad-hoc-1"],
            ad_hoc_applications=[
                {
                    "id": "ad-hoc-1",
                    "name": "AWS EC2 India",
                    "description": "",
                    "assessment_context": "",
                    "business_context": "",
                    "purpose": "",
                    "use": "",
                    "confidentiality": 3,
                    "integrity": 2,
                    "availability": 2,
                    "hosting_type": None,
                    "support_type": None,
                    "owner": "",
                    "custodian": "",
                    "jurisdiction": "",
                    "classification": "",
                    "internet_exposure": False,
                    "data_sensitivity_summary": "",
                    "primary_users": "",
                    "key_integrations": "",
                }
            ],
            responses=[],
            risks=[
                {
                    "id": "risk-1",
                    "asset_id": "ad-hoc-1",
                    "title": "AWS EC2 India â€” inherent risk",
                    "description": "Risk derived from rule-layer scoring.",
                    "risk_category": "Operational",
                    "likelihood_score": 3,
                    "impact_score": 2,
                    "inherent_risk_score": 6,
                    "inherent_risk_band": "Medium",
                    "residual_risk_score": 6,
                    "residual_risk_band": "Medium",
                    "source": "human_added",
                    "human_rationale": "Text should render cleanly.",
                    "status": "identified",
                }
            ],
            applied_controls=[],
            suggested_controls=[],
            report_markdown=None,
            created_at="2026-04-20T06:23:46.541595",
            updated_at="2026-04-20T06:32:47.120170",
        )
        gs.return_value.get.return_value = ra
        asset_gs.return_value.get.return_value = None

        r = client.post("/risk-assessment/ra1/generate-report")

    assert r.status_code == 200
    report = r.json()["report_markdown"]
    assert "AWS EC2 India - inherent risk" in report
    assert "â€”" not in report

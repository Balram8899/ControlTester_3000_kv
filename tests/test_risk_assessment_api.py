# tests/test_risk_assessment_api.py
import pytest
from fastapi.testclient import TestClient
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

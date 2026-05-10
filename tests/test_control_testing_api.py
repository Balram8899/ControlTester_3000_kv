# tests/test_control_testing_api.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

with patch("pymongo.MongoClient") as _mc:
    _mc.return_value.__getitem__.return_value.__getitem__.return_value = MagicMock()
    from api.main import app

client = TestClient(app)


def _make_session(id="s1", title="Test Session"):
    from api.routers.control_testing import TestingSession
    return TestingSession(
        id=id, title=title, description="",
        status="draft", controls=[], report_markdown=None,
        created_at="2026-01-01", updated_at="2026-01-01",
    )


def test_create_session_201():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.create.return_value = _make_session()
        r = client.post("/control-testing", json={"title": "Test Session", "description": ""})
    assert r.status_code == 201
    assert r.json()["title"] == "Test Session"


def test_list_sessions_200():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.list.return_value = [_make_session()]
        r = client.get("/control-testing")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_session_404():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.get("/control-testing/missing")
    assert r.status_code == 404


def test_delete_session_404():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.delete("/control-testing/missing")
    assert r.status_code == 404


def test_review_evidence_404_unknown_session():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post(
            "/control-testing/missing/controls/c1/review-evidence",
            json={"evidence_text": "Some text", "claim": "MFA is enforced"},
        )
    assert r.status_code == 404


def test_review_evidence_404_unknown_control():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = _make_session()
        r = client.post(
            "/control-testing/s1/controls/no_such_control/review-evidence",
            json={"evidence_text": "Some text", "claim": "MFA is enforced"},
        )
    assert r.status_code == 404


def test_generate_report_404_unknown_session():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post("/control-testing/missing/generate-report")
    assert r.status_code == 404


def test_generate_report_400_no_controls():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = _make_session()
        r = client.post("/control-testing/s1/generate-report")
    assert r.status_code == 400


def test_workpaper_template_path_points_to_packaged_template():
    from api import main

    template_path = main._workpaper_template_path()

    assert template_path.name == "Consolidated_WP_Template.xlsx"
    assert template_path.is_file()


def test_get_report_404_no_report():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = _make_session()
        r = client.get("/control-testing/s1/report")
    assert r.status_code == 404

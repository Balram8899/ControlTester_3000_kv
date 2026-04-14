import pytest
from api.routers.assets import AssetCreate, Asset
from utils.risk_scorer import compute_cia_score, compute_criticality
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def test_asset_create_valid():
    a = AssetCreate(
        name="Customer DB", type="IT", description="Primary customer database",
        confidentiality="high", integrity="high", availability="medium",
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential",
    )
    assert a.name == "Customer DB"
    assert a.confidentiality == "high"


def test_cia_score_for_asset():
    score = compute_cia_score("high", "high", "medium")
    # (3+3+2)/9*5 = 4.444
    assert score == pytest.approx(4.444, abs=0.01)
    assert compute_criticality(score) == "Critical"


def _asset_fixture(**overrides) -> Asset:
    base = dict(
        name="Test Asset", type="IT", description="desc",
        confidentiality="high", integrity="medium", availability="low",
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential", status="Active",
        id="abc", cia_score=3.89, criticality="High",
        assessment_periodicity="Semi-Annual",
        next_assessment_due="2026-10-14",
        last_assessment_id=None,
        created_at="2026-04-14T00:00:00",
        updated_at="2026-04-14T00:00:00",
    )
    return Asset(**{**base, **overrides})


@patch("api.routers.assets.get_store")
def test_create_asset_returns_201(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.create.return_value = _asset_fixture()
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/assets", json=dict(
        name="Test Asset", type="IT", description="desc",
        confidentiality="high", integrity="medium", availability="low",
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential",
    ))
    assert resp.status_code == 201
    assert resp.json()["criticality"] == "High"


@patch("api.routers.assets.get_store")
def test_list_assets_returns_200(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.list.return_value = []
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/assets")
    assert resp.status_code == 200
    assert resp.json() == []


@patch("api.routers.assets.get_store")
def test_get_asset_404(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = None
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/assets/nonexistent")
    assert resp.status_code == 404


@patch("api.routers.assets.get_store")
@patch("api.routers.assets._suggest_controls_llm")
def test_suggest_controls_returns_suggestions(mock_llm, mock_get_store):
    from api.main import app
    mock_store = MagicMock()
    mock_store.get.return_value = _asset_fixture()
    mock_get_store.return_value = mock_store
    mock_llm.return_value = [
        {"control_id": "c1", "name": "Access Control", "source": "controls_library", "rationale": "High C asset"}
    ]
    resp = TestClient(app).post("/assets/abc/suggest-controls")
    assert resp.status_code == 200
    assert resp.json()["suggestions"][0]["source"] == "controls_library"

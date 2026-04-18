import pytest
from api.routers.assets import AssetCreate, Asset
from utils.risk_scorer import compute_cia_total, compute_criticality


def test_asset_create_valid():
    a = AssetCreate(
        name="Customer DB", type="IT", description="Primary customer database",
        confidentiality=5, integrity=5, availability=3,
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential",
    )
    assert a.name == "Customer DB"
    assert a.confidentiality == 5


def test_cia_total_for_asset():
    total = compute_cia_total(5, 5, 3)
    assert total == 13
    assert compute_criticality(total) == "Critical"


from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def _asset_fixture(**overrides) -> Asset:
    base = dict(
        name="Test Asset", type="IT", description="desc",
        confidentiality=4, integrity=3, availability=2,
        owner="Alice", custodian="Bob", location="Cloud",
        jurisdiction="EU", classification="Confidential", status="Active",
        id="abc", cia_total=9, criticality="High",
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
        confidentiality=4, integrity=3, availability=2,
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

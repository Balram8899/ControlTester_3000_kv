import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from api.routers.validation_queue import ValidationQueueCreate, ValidationQueueItem


def test_queue_item_create_valid():
    item = ValidationQueueCreate(
        title="Weak password policy detected",
        description="Password policy does not meet minimum requirements.",
        severity="Medium",
        source_module="Controls Quality",
    )
    assert item.title == "Weak password policy detected"
    assert item.severity == "Medium"
    assert item.asset_ids == []
    assert item.control_ids == []


def test_queue_item_defaults():
    item = ValidationQueueItem(
        id="q-abc",
        title="t", description="d", severity="Low",
        source_module=None,
        asset_ids=[], control_ids=[],
        queue_status="Pending",
        accepted_issue_id=None,
        created_at="2026-04-18T00:00:00",
        updated_at="2026-04-18T00:00:00",
    )
    assert item.queue_status == "Pending"
    assert item.asset_ids == []


def _item_fixture(**overrides) -> ValidationQueueItem:
    base = dict(
        id="q-abc",
        title="Weak password policy", description="Policy gap.",
        severity="Medium", source_module="Controls Quality",
        asset_ids=[], control_ids=[],
        queue_status="Pending",
        accepted_issue_id=None,
        created_at="2026-04-18T00:00:00",
        updated_at="2026-04-18T00:00:00",
    )
    return ValidationQueueItem(**{**base, **overrides})


@patch("api.routers.validation_queue.get_store")
def test_add_to_queue_returns_201(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.create.return_value = _item_fixture()
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/validation-queue", json=dict(
        title="Weak password policy", description="Policy gap.",
        severity="Medium", source_module="Controls Quality",
    ))
    assert resp.status_code == 201
    assert resp.json()["queue_status"] == "Pending"


@patch("api.routers.validation_queue.get_store")
def test_list_queue_returns_200(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.list.return_value = []
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/validation-queue")
    assert resp.status_code == 200
    assert resp.json() == []


@patch("api.routers.validation_queue.get_store")
def test_dismiss_queue_item(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _item_fixture()
    mock.dismiss.return_value = _item_fixture(queue_status="Dismissed")
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/validation-queue/q-abc/dismiss")
    assert resp.status_code == 200
    assert resp.json()["queue_status"] == "Dismissed"


@patch("api.routers.validation_queue.get_store")
def test_dismiss_fails_if_not_pending(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _item_fixture(queue_status="Accepted")
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/validation-queue/q-abc/dismiss")
    assert resp.status_code == 400


@patch("api.routers.validation_queue.get_store")
def test_get_queue_item_404(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = None
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/validation-queue/nonexistent")
    assert resp.status_code == 404

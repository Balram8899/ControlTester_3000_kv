import io
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from api.routers.issues import IssueCreate, Issue


def test_issue_create_valid():
    i = IssueCreate(
        title="Missing MFA on admin accounts",
        description="Admin accounts do not enforce MFA.",
        severity="High",
        raised_by="Alice", assigned_to="Bob", approver="Carol",
    )
    assert i.title == "Missing MFA on admin accounts"
    assert i.severity == "High"


def test_issue_defaults():
    i = Issue(
        title="t", description="d", severity="Low",
        raised_by="A", assigned_to="B", approver="C",
        id="x", status="Open",
        evidences=[], approvals=[],
        created_at="2026-04-18T00:00:00",
        updated_at="2026-04-18T00:00:00",
    )
    assert i.status == "Open"
    assert i.evidences == []
    assert i.approvals == []


def _issue_fixture(**overrides) -> Issue:
    base = dict(
        title="Missing MFA", description="No MFA on admin accounts.",
        severity="High", raised_by="Alice", assigned_to="Bob", approver="Carol",
        id="issue-abc", status="Open",
        evidences=[], approvals=[],
        created_at="2026-04-18T00:00:00",
        updated_at="2026-04-18T00:00:00",
    )
    return Issue(**{**base, **overrides})


# ── Task 3: CRUD endpoints ────────────────────────────────────────────────────

@patch("api.routers.issues.get_store")
def test_create_issue_returns_201(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.create.return_value = _issue_fixture()
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/issues", json=dict(
        title="Missing MFA", description="No MFA on admin accounts.",
        severity="High", raised_by="Alice", assigned_to="Bob", approver="Carol",
    ))
    assert resp.status_code == 201
    assert resp.json()["severity"] == "High"


@patch("api.routers.issues.get_store")
def test_list_issues_returns_200(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.list.return_value = []
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/issues")
    assert resp.status_code == 200
    assert resp.json() == []


@patch("api.routers.issues.get_store")
def test_get_issue_404(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = None
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/issues/nonexistent")
    assert resp.status_code == 404


# ── Task 4: Evidence upload ───────────────────────────────────────────────────

@patch("api.routers.issues.get_store")
def test_upload_evidence_returns_200(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture()
    mock.add_evidence.return_value = _issue_fixture(
        evidences=[{"id": "e1", "filename": "log.txt", "content_b64": "aGVsbG8=",
                    "uploaded_by": "Alice", "uploaded_at": "2026-04-18T00:00:00"}]
    )
    mock_get_store.return_value = mock
    resp = TestClient(app).post(
        "/issues/issue-abc/evidence",
        files={"file": ("log.txt", io.BytesIO(b"hello"), "text/plain")},
        data={"uploaded_by": "Alice"},
    )
    assert resp.status_code == 200
    assert resp.json()["evidences"][0]["filename"] == "log.txt"


# ── Task 5: Submit/Approve workflow ──────────────────────────────────────────

@patch("api.routers.issues.get_store")
def test_submit_transitions_to_pending(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture(status="In Remediation")
    mock.transition.return_value = _issue_fixture(status="Pending Sign-off")
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/issues/issue-abc/submit")
    assert resp.status_code == 200
    assert resp.json()["status"] == "Pending Sign-off"


@patch("api.routers.issues.get_store")
def test_submit_fails_if_already_pending(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture(status="Pending Sign-off")
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/issues/issue-abc/submit")
    assert resp.status_code == 400


@patch("api.routers.issues.get_store")
def test_approve_closes_issue(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture(status="Pending Sign-off")
    mock.add_approval.return_value = _issue_fixture(status="Closed")
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/issues/issue-abc/approve", json={"decision": "approved", "notes": "LGTM"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "Closed"


@patch("api.routers.issues.get_store")
def test_approve_fails_if_not_pending(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture(status="Open")
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/issues/issue-abc/approve", json={"decision": "approved"})
    assert resp.status_code == 400


# ── Task 6: Impact endpoint ───────────────────────────────────────────────────

@patch("api.routers.issues.get_store")
def test_impact_returns_effectiveness(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture(severity="High", status="Open")
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/issues/issue-abc/impact")
    assert resp.status_code == 200
    assert resp.json()["control_effectiveness"] == 0.25


@patch("api.routers.issues.get_store")
def test_impact_closed_issue_full_effectiveness(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = _issue_fixture(severity="High", status="Closed")
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/issues/issue-abc/impact")
    assert resp.status_code == 200
    assert resp.json()["control_effectiveness"] == 1.00

import pytest
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

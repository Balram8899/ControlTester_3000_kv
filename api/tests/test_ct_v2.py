import mongomock
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


@pytest.fixture()
def mock_db():
    client = mongomock.MongoClient()
    return client["trace_db"]


@pytest.fixture()
def api_client(mock_db):
    with patch("utils.control_assurance.ct_db._get_db", return_value=mock_db):
        with patch("utils.control_assurance.ct_gridfs.get_ct_bucket"):
            from api.main import app

            yield TestClient(app)


CREATE_PAYLOAD = {
    "title": "Q1 2026 ITGC",
    "entity": "Technology",
    "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
    "framework": "SOX s.404",
    "preparer": "Jane Doe",
}

CONTROL_PAYLOAD = [
    {
        "control_id": "ITGC-001",
        "control_name": "Password Complexity Policy",
        "control_type": "Preventive",
        "domain": "Access Management",
        "framework_reference": "SOX s.404",
        "inherent_risk_rating": "High",
        "control_owner": "John Smith",
        "frequency": "Continuous",
        "prior_period_result": "Effective",
        "walkthrough_performed": False,
        "risk": "Unauthorised system access",
        "sampling_mode": "sample",
        "test_steps": [
            {
                "label": "A",
                "description": "Inspect AD password policy",
                "evidence_required": "AD policy screenshot",
            },
            {
                "label": "B",
                "description": "Verify lockout settings",
                "evidence_required": "Lockout config",
            },
        ],
    }
]


def test_create_session(api_client, mock_db):
    r = api_client.post("/ct/sessions", json=CREATE_PAYLOAD)

    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Q1 2026 ITGC"
    assert body["stage"] == "input"
    assert body["entity"] == "Technology"
    assert "id" in body
    assert mock_db.ct_sessions.count_documents({}) == 1


def test_list_sessions_empty(api_client):
    r = api_client.get("/ct/sessions")

    assert r.status_code == 200
    assert r.json() == []


def test_list_sessions_returns_created(api_client):
    api_client.post("/ct/sessions", json=CREATE_PAYLOAD)

    r = api_client.get("/ct/sessions")

    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["stage"] == "input"
    assert r.json()[0]["control_count"] == 0


def test_get_session_not_found(api_client):
    r = api_client.get("/ct/sessions/nonexistent-id")

    assert r.status_code == 404


def test_get_session_returns_detail(api_client):
    created = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()

    r = api_client.get(f"/ct/sessions/{created['id']}")

    assert r.status_code == 200
    body = r.json()
    assert body["id"] == created["id"]
    assert body["controls"] == []


def test_delete_session(api_client, mock_db):
    created = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()

    r = api_client.delete(f"/ct/sessions/{created['id']}")

    assert r.status_code == 204
    assert mock_db.ct_sessions.count_documents({"_id": created["id"]}) == 0


def test_delete_session_removes_controls_and_issues(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    _insert_ct_issue(mock_db, sid, cid)

    response = api_client.delete(f"/ct/sessions/{sid}")

    assert response.status_code == 204
    assert mock_db.ct_controls.count_documents({"session_id": sid}) == 0
    assert mock_db.ct_issues.count_documents({"session_id": sid}) == 0


def test_delete_session_removes_all_gridfs_files(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    mock_db.ct_controls.update_one(
        {"_id": cid},
        {
            "$set": {
                "evidence_files": [
                    {"gridfs_id": "evidence-1"},
                    {"gridfs_id": "evidence-2"},
                ],
                "sampling.population_file_id": "population-1",
                "workbook_output_id": "workbook-1",
            }
        },
    )

    with patch("api.routers.ct_v2.delete_from_gridfs") as mock_delete:
        response = api_client.delete(f"/ct/sessions/{sid}")

    assert response.status_code == 204
    assert [call.args[0] for call in mock_delete.call_args_list] == [
        "evidence-1",
        "evidence-2",
        "population-1",
        "workbook-1",
    ]


def test_delete_session_not_found(api_client):
    r = api_client.delete("/ct/sessions/nonexistent-id")

    assert r.status_code == 404


def test_session_status(api_client):
    created = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()

    r = api_client.get(f"/ct/sessions/{created['id']}/status")

    assert r.status_code == 200
    body = r.json()
    assert body["stage"] == "input"
    assert body["stage_checkpoint"] is None
    assert body["celery_task_id"] is None


def test_add_controls(api_client, mock_db):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()

    r = api_client.post(f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD)

    assert r.status_code == 201
    body = r.json()
    assert len(body) == 1
    ctrl = body[0]
    assert ctrl["control_id"] == "ITGC-001"
    assert ctrl["status"] == "pending"
    assert len(ctrl["test_steps"]) == 2
    assert ctrl["sampling"]["mode"] == "sample"
    assert ctrl["sampling"]["population_ca_verification"]["completeness_passed"] is None
    assert mock_db.ct_controls.count_documents({"session_id": session["id"]}) == 1


def test_parse_controls_from_screen_creates_reviewable_draft(api_client, mock_db):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()

    response = api_client.post(
        f"/ct/sessions/{session['id']}/controls/parse",
        json=[
            {
                "control_id": "PWD-001",
                "risk_statement": "Weak passwords could allow unauthorized access to systems",
                "control_title": "Password Complexity Policy",
                "control_description": "Password complexity is configured in Active Directory",
                "sampling_mode": "Walkthrough (1 sample)",
                "test_objectives": "Verify password complexity requirements",
                "test_steps": "1. Review the AD configuration screenshot. 2. Compare minimum length against policy.",
                "evidence_requirements": "",
                "additional_sampling_context": "Exclude tickers beginning with 013, 014, or 105.",
            }
        ],
    )

    assert response.status_code == 201
    ctrl = response.json()[0]
    assert ctrl["control_id"] == "PWD-001"
    assert ctrl["controls_finalized"] is False
    assert ctrl["sampling"]["mode"] == "walkthrough"
    assert ctrl["sampling"]["additional_context"] == "Exclude tickers beginning with 013, 014, or 105."
    assert [step["attribute_id"] for step in ctrl["test_steps"]] == ["TA-001", "TA-002"]
    assert ctrl["test_steps"][0]["evidence_required"] == "AD configuration screenshot"

    stored_session = mock_db.ct_sessions.find_one({"_id": session["id"]})
    assert stored_session["stage"] == "control_review"
    assert stored_session["controls_finalized"] is False


def test_update_control_allows_user_edit_and_marks_sources(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)

    response = api_client.patch(
        f"/ct/sessions/{sid}/controls/{cid}",
        json={
            "risk": "User-approved unauthorized access risk",
            "domain": "Identity and Access Management",
            "test_steps": [
                {
                    "attribute_id": "TA-001",
                    "label": "TA-001",
                    "test_attribute": "Password complexity is enabled",
                    "description": "Review the AD policy screenshot.",
                    "evidence_required": "AD policy screenshot",
                }
            ],
        },
    )

    assert response.status_code == 200
    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert ctrl["risk"] == "User-approved unauthorized access risk"
    assert ctrl["domain"] == "Identity and Access Management"
    assert ctrl["test_steps"][0]["attribute_id"] == "TA-001"
    assert ctrl["field_sources"]["risk"] == "user_edited"
    assert ctrl["field_sources"]["test_steps.0.test_attribute"] == "user_edited"


def test_finalize_controls_moves_session_to_population(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)

    response = api_client.post(f"/ct/sessions/{sid}/finalize-controls")

    assert response.status_code == 200
    assert response.json()["status"] == "controls_finalized"
    session = mock_db.ct_sessions.find_one({"_id": sid})
    control = mock_db.ct_controls.find_one({"_id": cid})
    assert session["stage"] == "population"
    assert session["controls_finalized"] is True
    assert session["stage_checkpoint"]["step"] == "controls_finalized"
    assert control["controls_finalized"] is True
    assert control["finalized_at"]


def test_add_controls_session_not_found(api_client):
    r = api_client.post("/ct/sessions/bad-id/controls", json=CONTROL_PAYLOAD)

    assert r.status_code == 404


def test_get_session_includes_controls(api_client):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    api_client.post(f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD)

    r = api_client.get(f"/ct/sessions/{session['id']}")

    assert r.status_code == 200
    assert len(r.json()["controls"]) == 1
    assert r.json()["controls"][0]["control_name"] == "Password Complexity Policy"


def _make_session_with_control(api_client):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    controls = api_client.post(
        f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD
    ).json()
    return session["id"], controls[0]["id"]


def test_upload_evidence_returns_gridfs_id(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    fake_id = "6642aabbccddeeff00112233"

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value=fake_id, create=True):
        r = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence",
            files=[("files", ("policy.png", b"fake-image-bytes", "image/png"))],
        )

    assert r.status_code == 201
    body = r.json()
    assert len(body) == 1
    assert body[0]["gridfs_id"] == fake_id
    assert body[0]["filename"] == "policy.png"
    assert body[0]["file_type"] == "image"

    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert len(ctrl["evidence_files"]) == 1
    assert ctrl["evidence_files"][0]["gridfs_id"] == fake_id
    assert ctrl["evidence_files"][0]["ca_verification"]["completeness_passed"] is None


def test_evidence_upload_gridfs_metadata(api_client):
    sid, cid = _make_session_with_control(api_client)

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="evidence-gridfs-id") as mock_upload:
        response = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence",
            files=[("files", ("policy.png", b"fake-image-bytes", "image/png"))],
        )

    assert response.status_code == 201
    assert mock_upload.call_args.args[2] == {
        "type": "evidence",
        "session_id": sid,
        "control_id": cid,
    }


def test_upload_evidence_control_not_found(api_client):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()

    r = api_client.post(
        f"/ct/sessions/{session['id']}/controls/bad-ctrl-id/evidence",
        files=[("files", ("policy.png", b"bytes", "image/png"))],
    )

    assert r.status_code == 404


def test_upload_population_stores_gridfs_id(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    fake_id = "6642aabbccddeeff00112244"

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value=fake_id, create=True):
        r = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/population",
            files=[("file", ("pop.xlsx", b"fake-excel", "application/octet-stream"))],
        )

    assert r.status_code == 201
    assert r.json()["gridfs_id"] == fake_id

    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert ctrl["sampling"]["population_file_id"] == fake_id
    assert ctrl["sampling"]["population_filename"] == "pop.xlsx"
    assert ctrl["sampling"]["population_file_type"] == "excel"


def test_population_upload_gridfs_metadata(api_client):
    sid, cid = _make_session_with_control(api_client)

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="population-gridfs-id") as mock_upload:
        response = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/population",
            files=[("file", ("pop.xlsx", b"fake-excel", "application/octet-stream"))],
        )

    assert response.status_code == 201
    assert mock_upload.call_args.args[2] == {
        "type": "population",
        "session_id": sid,
        "control_id": cid,
    }


def test_upload_population_pdf_stores_file_type(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="population-pdf-id"):
        response = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/population",
            files=[("file", ("suim_population.pdf", b"fake-pdf", "application/pdf"))],
        )

    assert response.status_code == 201
    assert response.json()["file_type"] == "pdf"
    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert ctrl["sampling"]["population_file_id"] == "population-pdf-id"
    assert ctrl["sampling"]["population_filename"] == "suim_population.pdf"
    assert ctrl["sampling"]["population_file_type"] == "pdf"


def test_upload_population_support_file_stores_query_context(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="support-image-id") as mock_upload:
        response = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/population/support-files",
            data={
                "support_type": "query_screenshot",
                "comments": "Match unique USER_ID count to screenshot Rows returned.",
                "unique_key_columns": "USER_ID",
                "expected_count": "42",
            },
            files=[("files", ("suim_query.png", b"fake-image", "image/png"))],
        )

    assert response.status_code == 201
    assert response.json()[0]["file_type"] == "image"
    assert mock_upload.call_args.args[2] == {
        "type": "population_support",
        "session_id": sid,
        "control_id": cid,
        "support_type": "query_screenshot",
    }
    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    support = ctrl["sampling"]["population_support_files"][0]
    assert support["gridfs_id"] == "support-image-id"
    assert support["filename"] == "suim_query.png"
    assert support["comments"] == "Match unique USER_ID count to screenshot Rows returned."
    assert support["reconciliation"]["unique_key_columns"] == ["USER_ID"]
    assert support["reconciliation"]["expected_count"] == 42


def test_upload_evidence_support_file_stores_source_context(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="evidence-gridfs-id"):
        evidence_response = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence",
            files=[("files", ("sql_export.xlsx", b"fake-excel", "application/octet-stream"))],
        )
    evidence_id = evidence_response.json()[0]["gridfs_id"]

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="query-shot-id") as mock_upload:
        response = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence/{evidence_id}/support-files",
            data={
                "support_type": "sql_query_screenshot",
                "comments": "Screenshot has query text, filters, timestamp, and rows returned.",
                "unique_key_columns": "DOCUMENT_ID",
                "expected_count": "128",
            },
            files=[("files", ("query_execution.png", b"fake-image", "image/png"))],
        )

    assert response.status_code == 201
    assert mock_upload.call_args.args[2] == {
        "type": "evidence_support",
        "session_id": sid,
        "control_id": cid,
        "evidence_gridfs_id": evidence_id,
        "support_type": "sql_query_screenshot",
    }
    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    support = ctrl["evidence_files"][0]["support_files"][0]
    assert support["gridfs_id"] == "query-shot-id"
    assert support["reconciliation"]["unique_key_columns"] == ["DOCUMENT_ID"]
    assert support["reconciliation"]["expected_count"] == 128


def test_file_type_classification():
    from api.routers.ct_v2 import _classify_file_type

    assert _classify_file_type("png") == "image"
    assert _classify_file_type("jpg") == "image"
    assert _classify_file_type("jpeg") == "image"
    assert _classify_file_type("pdf") == "pdf"
    assert _classify_file_type("xlsx") == "excel"
    assert _classify_file_type("xls") == "excel"
    assert _classify_file_type("csv") == "csv"
    assert _classify_file_type("docx") == "docx"
    assert _classify_file_type("txt") == "txt"
    assert _classify_file_type("conf") == "txt"
    assert _classify_file_type("zip") == "zip"
    assert _classify_file_type("bin") == "other"


def test_delete_evidence_removes_from_control(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    fake_id = "6642aabbccddeeff00112233"

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value=fake_id):
        api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence",
            files=[("files", ("policy.png", b"bytes", "image/png"))],
        )

    with patch("api.routers.ct_v2.delete_from_gridfs"):
        r = api_client.delete(f"/ct/sessions/{sid}/controls/{cid}/evidence/{fake_id}")

    assert r.status_code == 204
    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert ctrl["evidence_files"] == []


def test_workbook_not_yet_generated(api_client):
    sid, cid = _make_session_with_control(api_client)

    r = api_client.get(f"/ct/sessions/{sid}/controls/{cid}/workbook")

    assert r.status_code == 404


def test_template_download_returns_xlsx(api_client, tmp_path, monkeypatch):
    import api.routers.ct_v2 as ct_module

    fake_template = tmp_path / "template.xlsx"
    fake_template.write_bytes(b"PK\x03\x04fake-xlsx")
    monkeypatch.setattr(ct_module, "TEMPLATE_PATH", fake_template)

    r = api_client.get("/ct/template/download")

    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    assert r.content == b"PK\x03\x04fake-xlsx"


def test_template_download_missing_file(api_client, tmp_path, monkeypatch):
    import api.routers.ct_v2 as ct_module

    monkeypatch.setattr(ct_module, "TEMPLATE_PATH", tmp_path / "nonexistent.xlsx")

    r = api_client.get("/ct/template/download")

    assert r.status_code == 404


def test_list_and_get_controls(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    mock_db.ct_controls.update_one(
        {"_id": cid},
        {
            "$set": {
                "status": "complete",
                "sample_results": [
                    {
                        "sample_num": 1,
                        "application": "AD",
                        "item_reference": "POL-001",
                        "step_results": [{"label": "A", "tickmark": "PASS", "notes": "Reviewed."}],
                    }
                ],
            }
        },
    )

    list_response = api_client.get(f"/ct/sessions/{sid}/controls")
    get_response = api_client.get(f"/ct/sessions/{sid}/controls/{cid}")

    assert list_response.status_code == 200
    assert list_response.json()["controls"][0]["id"] == cid
    assert get_response.status_code == 200
    assert get_response.json()["sample_results"][0]["sample_num"] == 1


def _insert_ct_issue(mock_db, session_id: str, control_id: str, issue_id: str = "ct-issue-001"):
    mock_db.ct_issues.insert_one(
        {
            "_id": issue_id,
            "session_id": session_id,
            "control_id": control_id,
            "control_external_id": "ITGC-001",
            "control_name": "Password Complexity Policy",
            "title": "Password baseline not enforced",
            "severity": "High",
            "summary": "One password policy sample failed.",
            "detail": "Sample 2 showed a minimum password length below baseline.",
            "root_cause": "Password baseline was not enforced.",
            "recommendation": "Update and monitor the password policy baseline.",
            "issues_log_ref": "CTI-001",
            "exception_refs": ["X1"],
            "pushed_to_issues": False,
            "issues_module_id": None,
            "created_at": "2026-05-13T00:00:00+00:00",
            "updated_at": "2026-05-13T00:00:00+00:00",
        }
    )
    return issue_id


def test_ct_issue_update_and_push_to_issues_module(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    issue_id = _insert_ct_issue(mock_db, sid, cid)

    patch_response = api_client.patch(
        f"/ct/sessions/{sid}/issues/{issue_id}",
        json={"severity": "Critical", "recommendation": "Apply baseline enforcement and monitoring."},
    )
    push_response = api_client.post(f"/ct/sessions/{sid}/issues/{issue_id}/push")

    assert patch_response.status_code == 200
    assert patch_response.json()["severity"] == "Critical"
    assert push_response.status_code == 200
    body = push_response.json()
    assert body["pushed_to_issues"] is True
    assert body["issues_module_id"]

    main_issue = mock_db.issues.find_one({"_id": body["issues_module_id"]})
    assert main_issue["source_module"] == "control_testing"
    assert main_issue["severity"] == "Critical"
    assert main_issue["control_ids"] == ["ITGC-001"]


def test_push_issue_second_time_is_idempotent(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    issue_id = _insert_ct_issue(mock_db, sid, cid)

    first = api_client.post(f"/ct/sessions/{sid}/issues/{issue_id}/push")
    second = api_client.post(f"/ct/sessions/{sid}/issues/{issue_id}/push")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["issues_module_id"] == first.json()["issues_module_id"]
    assert mock_db.issues.count_documents({"source_module": "control_testing"}) == 1


def test_push_all_and_sign_off(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    _insert_ct_issue(mock_db, sid, cid, "ct-issue-001")
    _insert_ct_issue(mock_db, sid, cid, "ct-issue-002")

    push_all_response = api_client.post(f"/ct/sessions/{sid}/issues/push-all")
    signoff_response = api_client.patch(
        f"/ct/sessions/{sid}/sign-off",
        json={"reviewer": {"name": "Alex Reviewer", "initials": "AR", "date": "2026-05-13"}},
    )

    assert push_all_response.status_code == 200
    assert push_all_response.json()["pushed_count"] == 2
    assert mock_db.issues.count_documents({"source_module": "control_testing"}) == 2
    assert signoff_response.status_code == 200
    session = mock_db.ct_sessions.find_one({"_id": sid})
    assert session["sign_off"]["reviewer"]["name"] == "Alex Reviewer"
    assert session["sign_off"]["reviewer"]["initials"] == "AR"


def test_push_all_skips_already_pushed(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    already_pushed = _insert_ct_issue(mock_db, sid, cid, "ct-issue-001")
    _insert_ct_issue(mock_db, sid, cid, "ct-issue-002")
    _insert_ct_issue(mock_db, sid, cid, "ct-issue-003")
    mock_db.ct_issues.update_one(
        {"_id": already_pushed},
        {"$set": {"pushed_to_issues": True, "issues_module_id": "main-issue-existing"}},
    )

    response = api_client.post(f"/ct/sessions/{sid}/issues/push-all")

    assert response.status_code == 200
    assert response.json()["pushed_count"] == 2
    assert mock_db.issues.count_documents({"source_module": "control_testing"}) == 2

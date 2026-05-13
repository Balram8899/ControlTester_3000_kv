from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from fastapi.testclient import TestClient


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


SESSION_PAYLOAD = {
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
        "inherent_risk_rating": "High",
        "frequency": "Continuous",
        "sampling_mode": "sample",
        "test_steps": [
            {
                "label": "A",
                "description": "Inspect AD password policy",
                "evidence_required": "AD policy screenshot",
            }
        ],
    }
]


def _testing_response() -> str:
    return json.dumps(
        {
            "todi_results": {
                "design": {"conclusion": "Effective", "rationale": "Control design is clear."},
                "implementation": {"conclusion": "Effective", "rationale": "Policy exists."},
            },
            "sample_results": [
                {
                    "sample_num": 1,
                    "application": "AD",
                    "item_reference": "POL-001",
                    "step_results": [{"label": "A", "tickmark": "PASS", "notes": "Reviewed."}],
                },
                {
                    "sample_num": 2,
                    "application": "AD",
                    "item_reference": "POL-002",
                    "step_results": [{"label": "A", "tickmark": "X1", "notes": "Minimum length was 8."}],
                },
            ],
            "exceptions": [
                {
                    "ref": "X1",
                    "sample_num": 2,
                    "description": "Password minimum length was below baseline.",
                    "root_cause": "Password baseline was not enforced.",
                    "auditor_disposition": "Issue drafted",
                    "issues_log_ref": None,
                }
            ],
            "conclusions": {
                "d_and_i": "Effective",
                "oe": "Effective",
                "deficiencies_noted": True,
                "rationale": "One exception noted.",
                "issues_log_refs": [],
            },
            "testing_methods": {
                "inquiry": False,
                "observation": False,
                "inspection": True,
                "reperformance": False,
            },
        }
    )


def _issue_response() -> str:
    return json.dumps(
        {
            "issues": [
                {
                    "title": "Password baseline not enforced",
                    "severity": "High",
                    "summary": "One password policy sample failed.",
                    "detail": "Sample 2 did not meet the password baseline.",
                    "root_cause": "Password baseline was not enforced.",
                    "recommendation": "Update and monitor the password policy baseline.",
                    "issues_log_ref": "CTI-001",
                    "exception_refs": ["X1"],
                }
            ]
        }
    )


def _narrative_response() -> str:
    return json.dumps(
        {
            "testing_summary": "Tested 2 samples and noted one exception.",
            "d_and_i_statement": "D&I was effective based on policy inspection.",
        }
    )


def test_ct_backend_flow_from_mapping_gate_to_workbook_issue_push_and_signoff(api_client, mock_db):
    session = api_client.post("/ct/sessions", json=SESSION_PAYLOAD).json()
    controls = api_client.post(f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD).json()
    control_id = controls[0]["id"]

    with patch("api.routers.ct_v2.upload_to_gridfs", return_value="evidence-gridfs-001"):
        evidence_response = api_client.post(
            f"/ct/sessions/{session['id']}/controls/{control_id}/evidence",
            files=[("files", ("policy.txt", b"Minimum length: 12", "text/plain"))],
        )
    assert evidence_response.status_code == 201

    mock_db.ct_controls.update_one(
        {"_id": control_id},
        {
            "$set": {
                "sampling.population_ca_verification.completeness_passed": True,
                "sampling.population_ca_verification.accuracy_passed": True,
                "sampling.selected_size": 2,
                "sampling.selected_items": [
                    {"sample_num": 1, "application": "AD", "item_reference": "POL-001"},
                    {"sample_num": 2, "application": "AD", "item_reference": "POL-002"},
                ],
                "evidence_files.0.ca_verification.completeness_passed": True,
                "evidence_files.0.ca_verification.accuracy_passed": True,
                "evidence_files.0.mapped_step_labels": ["A"],
            }
        },
    )

    confirm_response = api_client.post(f"/ct/sessions/{session['id']}/confirm-mapping")
    assert confirm_response.status_code == 202

    stage4_llm = MagicMock()
    stage4_llm.invoke.side_effect = [
        MagicMock(content=_testing_response()),
        MagicMock(content=_issue_response()),
    ]
    from utils.control_assurance.pipeline.stage4_testing import _run_testing

    with patch("utils.control_assurance.pipeline.stage4_testing._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage4_testing.get_llm", return_value=stage4_llm):
            _run_testing(session["id"])

    stage5_llm = MagicMock()
    stage5_llm.invoke.return_value = MagicMock(content=_narrative_response())
    from utils.control_assurance.pipeline.stage5_workbook import _generate_workbooks

    with patch("utils.control_assurance.pipeline.stage5_workbook._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage5_workbook.get_llm", return_value=stage5_llm):
            with patch(
                "utils.control_assurance.pipeline.stage5_workbook.download_from_gridfs",
                return_value=b"Minimum length: 12",
            ):
                with patch(
                    "utils.control_assurance.pipeline.stage5_workbook.upload_to_gridfs",
                    return_value="workbook-gridfs-001",
                ):
                    _generate_workbooks(session["id"])

    controls_response = api_client.get(f"/ct/sessions/{session['id']}/controls")
    issues_response = api_client.get(f"/ct/sessions/{session['id']}/issues")
    push_all_response = api_client.post(f"/ct/sessions/{session['id']}/issues/push-all")
    signoff_response = api_client.patch(
        f"/ct/sessions/{session['id']}/sign-off",
        json={"manager": {"name": "Morgan Manager", "initials": "MM", "date": "2026-05-13"}},
    )
    with patch("api.routers.ct_v2.stream_from_gridfs", return_value=iter([b"workbook-bytes"])):
        workbook_response = api_client.get(f"/ct/sessions/{session['id']}/controls/{control_id}/workbook")

    assert controls_response.status_code == 200
    control = controls_response.json()["controls"][0]
    assert control["status"] == "complete"
    assert control["sample_results"][1]["step_results"][0]["tickmark"] == "X1"
    assert control["workbook_output_id"] == "workbook-gridfs-001"

    assert issues_response.status_code == 200
    assert issues_response.json()["issues"][0]["issues_log_ref"] == "CTI-001"
    assert push_all_response.status_code == 200
    assert push_all_response.json()["pushed_count"] == 1
    assert mock_db.issues.count_documents({"source_module": "control_testing"}) == 1

    assert signoff_response.status_code == 200
    assert mock_db.ct_sessions.find_one({"_id": session["id"]})["sign_off"]["manager"]["initials"] == "MM"

    assert workbook_response.status_code == 200
    assert workbook_response.content == b"workbook-bytes"

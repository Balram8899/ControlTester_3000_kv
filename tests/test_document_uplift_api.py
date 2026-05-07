from __future__ import annotations

import os
from unittest.mock import ANY, MagicMock, patch

from fastapi.testclient import TestClient


def client() -> TestClient:
    from api.main import app

    return TestClient(app)


def test_document_uplift_routes_404_when_feature_flag_disabled() -> None:
    with patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "false"}):
        response = client().get("/document-uplift/cases")

    assert response.status_code == 404


def test_get_document_uplift_config_endpoint_reads_budget() -> None:
    mock_col = MagicMock()
    mock_col.find_one.return_value = {
        "_id": "document_uplift_config",
        "max_llm_calls_per_pipeline": 55,
    }

    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        response = client().get("/settings/document-uplift-config")

    assert response.status_code == 200
    assert response.json() == {"max_llm_calls_per_pipeline": 55}


def test_post_document_uplift_config_endpoint_saves_budget() -> None:
    mock_col = MagicMock()
    mock_col.find_one.return_value = {
        "_id": "document_uplift_config",
        "max_llm_calls_per_pipeline": 91,
    }

    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        response = client().post(
            "/settings/document-uplift-config",
            json={"max_llm_calls_per_pipeline": 91},
        )

    assert response.status_code == 200
    assert response.json() == {
        "max_llm_calls_per_pipeline": 91,
        "saved": True,
    }
    mock_col.update_one.assert_called_once_with(
        {"_id": "document_uplift_config"},
        {"$set": {"max_llm_calls_per_pipeline": 91}},
        upsert=True,
    )


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_create_list_and_get_document_uplift_case(mock_get_store: MagicMock) -> None:
    created = {
        "case_id": "case-1",
        "title": "KYC uplift",
        "process_name": "KYC",
        "status": {"stage": "uploading"},
        "document_tags": [],
    }
    mock = MagicMock()
    mock.create_case.return_value = created
    mock.list_cases.return_value = [created]
    mock.get_case.return_value = created
    mock_get_store.return_value = mock

    create_response = client().post(
        "/document-uplift/cases",
        json={"title": "KYC uplift", "process_name": "KYC"},
    )
    list_response = client().get("/document-uplift/cases")
    detail_response = client().get("/document-uplift/cases/case-1")

    assert create_response.status_code == 201
    assert create_response.json()["case_id"] == "case-1"
    assert list_response.json()["cases"][0]["title"] == "KYC uplift"
    assert detail_response.json()["status"]["stage"] == "uploading"


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_upload_stores_raw_input_in_gridfs_and_updates_document_tag(
    mock_get_store: MagicMock,
) -> None:
    stored_case = {
        "case_id": "case-1",
        "title": "KYC uplift",
        "document_tags": [],
    }

    def update_case(_case_id: str, updates: dict) -> dict:
        stored_case.update(updates)
        return stored_case

    mock = MagicMock()
    mock.get_case.return_value = stored_case
    mock.store_input_file.return_value = "gridfs-1"
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = client().post(
        "/document-uplift/cases/case-1/upload",
        data={"tag": "procedure"},
        files={"file": ("kyc.docx", b"docx-bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )

    assert response.status_code == 201
    assert response.json()["filename"] == "kyc.docx"
    assert "content_b64" not in response.json()
    mock.store_input_file.assert_called_once_with(
        "case-1",
        ANY,
        "kyc.docx",
        b"docx-bytes",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert stored_case["document_tags"][0]["tag"] == "procedure"


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true", "TASK_BACKEND": "asyncio"})
@patch("api.routers.document_uplift.dispatch_pipeline")
@patch("api.routers.document_uplift.get_store")
def test_run_pipeline_endpoint_dispatches_stage1(
    mock_get_store: MagicMock,
    mock_dispatch: MagicMock,
) -> None:
    mock = MagicMock()
    mock.get_case.return_value = {"case_id": "case-1", "title": "KYC uplift"}
    mock_get_store.return_value = mock
    mock_dispatch.return_value = {"case_id": "case-1", "status": "review_ready"}

    response = client().post("/document-uplift/cases/case-1/run-pipeline")

    assert response.status_code == 202
    assert response.json()["status"] == "review_ready"
    mock_dispatch.assert_called_once_with("case-1")


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_pipeline_stream_emits_stage_and_complete_events(
    mock_get_store: MagicMock,
) -> None:
    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "status": {"stage": "review_ready"},
        "processing_state": {
            "conversion": {"total": 2, "completed": 2, "failed": 0, "pending": 0},
            "analysis": {"total": 1, "completed": 1, "failed": 0, "pending": 0},
        },
        "suggestions": [
            {"suggestion_id": "sug-1", "review_status": "pending"},
            {"suggestion_id": "sug-2", "review_status": "pending"},
        ],
    }
    mock_get_store.return_value = mock

    response = client().get("/document-uplift/cases/case-1/pipeline/stream")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: stage" in response.text
    assert '"stage":"review_ready"' in response.text
    assert '"total_docs":2' in response.text
    assert '"completed_docs":2' in response.text
    assert "event: complete" in response.text
    assert '"suggestion_count":2' in response.text


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_patch_suggestion_updates_review_state(mock_get_store: MagicMock) -> None:
    stored_case = {
        "case_id": "case-1",
        "suggestions": [
            {
                "suggestion_id": "sug-1",
                "review_status": "pending",
                "proposed_text": "Retain export.",
            }
        ],
    }

    def update_case(_case_id: str, updates: dict) -> dict:
        stored_case.update(updates)
        return stored_case

    mock = MagicMock()
    mock.get_case.return_value = stored_case
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = client().patch(
        "/document-uplift/cases/case-1/suggestions/sug-1",
        json={"review_status": "edited", "edited_proposed_text": "Retain the quarterly export."},
    )

    assert response.status_code == 200
    assert response.json()["review_status"] == "edited"
    assert stored_case["suggestions"][0]["edited_proposed_text"] == "Retain the quarterly export."


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_bulk_review_accepts_all_pending_suggestions(
    mock_get_store: MagicMock,
) -> None:
    stored_case = {
        "case_id": "case-1",
        "suggestions": [
            {"suggestion_id": "sug-1", "review_status": "pending"},
            {"suggestion_id": "sug-2", "review_status": "accepted"},
            {"suggestion_id": "sug-3", "review_status": "pending"},
        ],
    }

    def update_case(_case_id: str, updates: dict) -> dict:
        stored_case.update(updates)
        return stored_case

    mock = MagicMock()
    mock.get_case.return_value = stored_case
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = client().post(
        "/document-uplift/cases/case-1/suggestions/bulk-review",
        json={"action": "accept_all"},
    )

    assert response.status_code == 200
    assert response.json()["updated_count"] == 2
    assert {item["review_status"] for item in stored_case["suggestions"]} == {"accepted"}


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_bulk_review_reject_all_requires_confirmation_token(
    mock_get_store: MagicMock,
) -> None:
    stored_case = {
        "case_id": "case-1",
        "suggestions": [
            {"suggestion_id": "sug-1", "review_status": "pending"},
            {"suggestion_id": "sug-2", "review_status": "pending"},
        ],
    }

    def update_case(_case_id: str, updates: dict) -> dict:
        stored_case.update(updates)
        return stored_case

    mock = MagicMock()
    mock.get_case.return_value = stored_case
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    blocked = client().post(
        "/document-uplift/cases/case-1/suggestions/bulk-review",
        json={"action": "reject_all"},
    )
    accepted = client().post(
        "/document-uplift/cases/case-1/suggestions/bulk-review",
        json={"action": "reject_all", "confirmation_token": "REJECT_ALL"},
    )

    assert blocked.status_code == 400
    assert accepted.status_code == 200
    assert {item["review_status"] for item in stored_case["suggestions"]} == {"rejected"}


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_auto_accept_pending_suggestions_returns_warning(
    mock_get_store: MagicMock,
) -> None:
    from api.routers import document_uplift

    stored_case = {
        "case_id": "case-1",
        "suggestions": [
            {"suggestion_id": "sug-1", "review_status": "pending"},
            {"suggestion_id": "sug-2", "review_status": "accepted"},
        ],
    }

    def update_case(_case_id: str, updates: dict) -> dict:
        stored_case.update(updates)
        return stored_case

    mock = MagicMock()
    mock.get_case.return_value = stored_case
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    result = document_uplift.auto_accept_pending_suggestions("case-1")

    assert result["auto_accepted_count"] == 1
    assert "automatically accepted" in result["warnings"][0]
    assert stored_case["suggestions"][0]["review_status"] == "accepted"


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true", "TASK_BACKEND": "asyncio"})
@patch("api.routers.document_uplift.dispatch_pipeline")
@patch("api.routers.document_uplift.get_store")
def test_generate_outputs_auto_accepts_pending_and_dispatches_stage2(
    mock_get_store: MagicMock,
    mock_dispatch: MagicMock,
) -> None:
    stored_case = {
        "case_id": "case-1",
        "suggestions": [
            {"suggestion_id": "sug-1", "review_status": "pending"},
            {"suggestion_id": "sug-2", "review_status": "accepted"},
        ],
    }

    def update_case(_case_id: str, updates: dict) -> dict:
        stored_case.update(updates)
        return stored_case

    mock = MagicMock()
    mock.get_case.return_value = stored_case
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock
    mock_dispatch.return_value = {"case_id": "case-1", "status": "generating_outputs"}

    response = client().post("/document-uplift/cases/case-1/generate-outputs")

    assert response.status_code == 200
    assert response.json()["status"] == "generating_outputs"
    assert "automatically accepted" in response.json()["warnings"][0]
    assert stored_case["suggestions"][0]["review_status"] == "accepted"
    mock_dispatch.assert_called_once_with("case-1", stage=2)


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.dispatch_pipeline")
@patch("api.routers.document_uplift.get_store")
def test_generate_outputs_returns_501_while_stage2_is_stubbed(
    mock_get_store: MagicMock,
    mock_dispatch: MagicMock,
) -> None:
    mock = MagicMock()
    mock.get_case.return_value = {"case_id": "case-1", "suggestions": []}
    mock_get_store.return_value = mock
    mock_dispatch.side_effect = NotImplementedError("Document Uplift output generation is not implemented")

    response = client().post("/document-uplift/cases/case-1/generate-outputs")

    assert response.status_code == 501
    assert "not implemented" in response.json()["detail"]


@patch.dict(os.environ, {"DOCUMENT_UPLIFT_ENABLED": "true"})
@patch("api.routers.document_uplift.get_store")
def test_download_output_returns_stored_artifact(mock_get_store: MagicMock) -> None:
    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "outputs": [
            {
                "output_id": "out-1",
                "filename": "uplifted-sop.docx",
                "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }
        ],
    }
    mock.get_output_content.return_value = b"docx-bytes"
    mock_get_store.return_value = mock

    response = client().get("/document-uplift/cases/case-1/outputs/out-1")

    assert response.status_code == 200
    assert response.content == b"docx-bytes"
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert response.headers["content-disposition"] == 'attachment; filename="uplifted-sop.docx"'
    mock.get_output_content.assert_called_once_with("case-1", "out-1")

from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from utils.sop_uplift.markdown_ingestion import MarkdownConversion
from utils.sop_uplift.readiness import compute_readiness
from utils.rcm_report_store import RCMReportStore


def test_readiness_not_ready_without_sop_material():
    result = compute_readiness(
        uploaded_files=[
            {"file_id": "f1", "bucket": "evidence", "conversion": {"status": "converted"}},
        ],
        document_tags=[{"file_id": "f1", "confirmed_tag": "evidence"}],
    )

    assert result["status"] == "not_ready"
    assert result["can_analyze"] is False
    assert "risk_control_matrix" in result["missing_recommended_inputs"]


def test_readiness_full_ready_with_sop_controls_risks_and_evidence():
    result = compute_readiness(
        uploaded_files=[
            {"file_id": "sop", "bucket": "sops", "conversion": {"status": "converted"}},
            {"file_id": "rcm", "bucket": "risk_control_matrices", "conversion": {"status": "converted"}},
            {"file_id": "risk", "bucket": "risk_registers", "conversion": {"status": "converted"}},
            {"file_id": "evidence", "bucket": "evidence", "conversion": {"status": "converted"}},
        ],
        document_tags=[
            {"file_id": "sop", "confirmed_tag": "sop"},
            {"file_id": "rcm", "confirmed_tag": "risk_control_matrix"},
            {"file_id": "risk", "confirmed_tag": "risk_register"},
            {"file_id": "evidence", "confirmed_tag": "evidence"},
        ],
    )

    assert result["status"] == "full_ready"
    assert result["can_analyze"] is True
    assert "diagram_generation" in result["analysis_modes"]


@patch("api.routers.sop_uplift.get_store")
def test_create_sop_uplift_case_returns_201(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.create_case.return_value = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "domain_label": "",
        "notes": "",
        "status": "draft",
        "uploaded_files": [],
        "document_tags": [],
        "case_chat": [],
        "suggestions": [],
        "outputs": [],
        "created_at": "2026-04-27T00:00:00",
        "updated_at": "2026-04-27T00:00:00",
    }
    mock_get_store.return_value = mock

    response = TestClient(app).post(
        "/sop-uplift/cases",
        json={"title": "Quarterly access review SOP", "process_name": "Access reviews"},
    )

    assert response.status_code == 201
    assert response.json()["case_id"] == "case-1"


@patch("api.routers.sop_uplift.get_store")
def test_case_chat_is_case_scoped(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {"case_id": "case-1"}
    mock.add_chat_message.return_value = {
        "message_id": "msg-1",
        "role": "user",
        "content": "Operations Risk reviews exceptions weekly.",
        "created_at": "2026-04-27T00:00:00",
        "linked_suggestion_ids": [],
        "captured_context": {
            "type": "frequency",
            "value": "Operations Risk reviews exceptions weekly.",
            "confidence": "medium",
        },
    }
    mock_get_store.return_value = mock

    response = TestClient(app).post(
        "/sop-uplift/cases/case-1/chat",
        json={"role": "user", "content": "Operations Risk reviews exceptions weekly."},
    )

    assert response.status_code == 201
    mock.add_chat_message.assert_called_once()
    assert response.json()["message_id"] == "msg-1"


@patch("api.routers.sop_uplift.get_store")
def test_get_readiness_endpoint_uses_case_documents(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [{"file_id": "sop", "bucket": "sops", "conversion": {"status": "converted"}}],
        "document_tags": [{"file_id": "sop", "confirmed_tag": "sop"}],
    }
    mock_get_store.return_value = mock

    response = TestClient(app).get("/sop-uplift/cases/case-1/readiness")

    assert response.status_code == 200
    assert response.json()["status"] == "minimum_ready"
    assert response.json()["can_analyze"] is True


@patch("api.routers.sop_uplift.convert_bytes_to_markdown", create=True)
@patch("api.routers.sop_uplift.get_store")
def test_convert_endpoint_builds_markdown_anchors_chunks_and_processing_state(mock_get_store, mock_convert):
    from api.main import app

    mock = MagicMock()
    mock_convert.return_value = MarkdownConversion(
        markdown="# Access Reviews\n\nOwner reviews users.\n",
        converter="markitdown",
        warnings=["Converted with layout warning"],
    )
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [
            {
                "file_id": "file-1",
                "filename": "access.md",
                "content_type": "text/markdown",
                "bucket": "sops",
                "raw_content_b64": "IyBBY2Nlc3MgUmV2aWV3cwoKT3duZXIgcmV2aWV3cyB1c2Vycy4K",
            }
        ],
        "markdown_documents": [],
        "anchors": [],
        "chunks": [],
    }
    mock.update_case.return_value = mock.get_case.return_value
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/convert")

    assert response.status_code == 200
    updated = mock.update_case.call_args.args[1]
    assert updated["markdown_documents"][0]["markdown"].startswith("# Access Reviews")
    assert updated["markdown_documents"][0]["conversion"]["converter"] == "markitdown"
    assert updated["markdown_documents"][0]["conversion"]["warnings"] == ["Converted with layout warning"]
    assert updated["anchors"]
    assert updated["chunks"]
    assert updated["processing_state"]["conversion"]["completed"] == 1
    mock_convert.assert_called_once()


@patch("api.routers.sop_uplift.get_store")
def test_analyze_endpoint_processes_limited_sections_and_tracks_pending(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "anchors": [
            {"anchor_id": "a1", "block_type": "paragraph", "text": "Owner reviews users.", "section_path": ["Access Reviews"]},
            {"anchor_id": "a2", "block_type": "paragraph", "text": "Evidence is retained.", "section_path": ["Access Reviews"]},
        ],
        "suggestions": [],
        "processing_state": {},
    }
    mock.update_case.return_value = mock.get_case.return_value
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/analyze", json={"batch_size": 1})

    assert response.status_code == 200
    payload = response.json()
    assert payload["processing_state"]["analysis"]["completed"] == 1
    assert payload["processing_state"]["analysis"]["pending"] == 1
    assert len(payload["suggestions"]) == 1


@patch("api.routers.sop_uplift.get_store")
def test_run_pipeline_endpoint_persists_full_case_artifacts(mock_get_store):
    from api.main import app

    case = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "uploaded_files": [{"file_id": "file-1", "filename": "access_sop.md", "bucket": "sops"}],
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop", "confidence": "high"}],
        "markdown_documents": [{"document_id": "doc_file-1", "file_id": "file-1", "filename": "access_sop.md", "markdown": "# Access\n\nOwner reviews access control evidence and risk exceptions."}],
        "anchors": [
            {"anchor_id": "a1", "document_id": "doc_file-1", "file_id": "file-1", "block_type": "paragraph", "text": "Owner reviews access control evidence and risk exceptions.", "section_path": ["Access"]},
        ],
        "chunks": [{"chunk_id": "c1", "document_id": "doc_file-1", "content": "Owner reviews access control evidence and risk exceptions.", "anchor_ids": ["a1"]}],
        "case_chat": [{"message_id": "msg-1", "role": "user", "content": "Operations Risk reviews exceptions weekly.", "captured_context": {"type": "frequency", "value": "weekly", "confidence": "medium"}}],
        "suggestions": [],
        "processing_state": {},
    }
    stored = dict(case)

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/run-pipeline", json={"use_llm": False})

    assert response.status_code == 202
    updated = mock.update_case.call_args.args[1]
    assert updated["extracted_controls"]
    assert updated["extracted_risks"]
    assert updated["evidence_items"]
    assert updated["diagram_references"]
    assert updated["case_context"]
    assert updated["corpus_map"]["primary_process"] == "Access reviews"
    assert updated["suggestions"]
    assert updated["agent_follow_up_questions"]
    assert updated["diagram_model"]["nodes"]
    assert updated["preview_model"]["highlights"]
    assert updated["processing_state"]["pipeline"]["status"] == "complete"


@patch("api.routers.sop_uplift.get_store")
def test_preview_endpoint_returns_renderable_preview_and_diagram_model(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "markdown_documents": [{"document_id": "doc-1", "markdown": "# Access\n\nOwner reviews users."}],
        "anchors": [{"anchor_id": "a1", "block_type": "paragraph", "text": "Owner reviews users."}],
        "suggestions": [{"suggestion_id": "s1", "anchor_id": "a1", "title": "Add owner"}],
        "diagram_model": {"nodes": [{"node_id": "n1", "lane_id": "business_owner", "label": "Owner reviews users"}], "edges": []},
    }
    mock_get_store.return_value = mock

    response = TestClient(app).get("/sop-uplift/cases/case-1/preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_model"]["highlights"][0]["suggestions"][0]["suggestion_id"] == "s1"
    assert payload["diagram_model"]["nodes"][0]["node_id"] == "n1"


@patch("api.routers.sop_uplift.get_store")
def test_generate_outputs_returns_downloadable_non_placeholder_outputs(mock_get_store):
    from api.main import app

    case = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "anchors": [{"anchor_id": "a1", "block_type": "paragraph", "text": "Original text.", "section_path": ["Access Reviews"]}],
        "suggestions": [{"suggestion_id": "s1", "status": "accepted", "anchor_id": "a1", "suggested_text": "Operations Risk reviews weekly.", "title": "Add owner"}],
        "case_chat": [],
        "outputs": [],
    }
    stored = dict(case)

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/generate-outputs")

    assert response.status_code == 202
    outputs = response.json()["outputs"]
    assert {output["type"] for output in outputs} >= {"docx", "drawio", "diagram_pdf", "changelog_markdown", "changelog_json", "svg"}
    assert all(output.get("content_b64") for output in outputs)


@patch("api.routers.sop_uplift.get_store")
def test_tag_documents_suggests_case_local_tags(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [{"file_id": "file-1", "filename": "access_sop.md", "bucket": "sops"}],
        "document_tags": [],
    }
    mock.set_document_tag.return_value = {"file_id": "file-1", "confirmed_tag": "sop", "confidence": "high"}
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/tag-documents")

    assert response.status_code == 200
    assert response.json()["document_tags"][0]["confirmed_tag"] == "sop"


@patch("api.routers.sop_uplift.get_store")
def test_delete_uploaded_file_removes_case_file_and_derived_artifacts(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {"case_id": "case-1"}
    mock.delete_file.return_value = True
    mock_get_store.return_value = mock

    response = TestClient(app).delete("/sop-uplift/cases/case-1/files/file-1")

    assert response.status_code == 204
    mock.delete_file.assert_called_once_with("case-1", "file-1")


@patch("api.routers.sop_uplift.get_store")
def test_build_corpus_map_summarizes_case_entities(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop"}],
        "suggestions": [{"suggestion_id": "s1", "type": "ownership_gap"}],
        "case_chat": [{"role": "user", "content": "Operations Risk owns exceptions."}],
    }
    mock.update_case.return_value = mock.get_case.return_value
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/build-corpus-map")

    assert response.status_code == 200
    assert response.json()["corpus_map"]["primary_process"] == "Access reviews"


@patch("api.routers.sop_uplift.get_store")
def test_chat_message_can_be_converted_to_suggestion(mock_get_store):
    from api.main import app

    stored = {
        "case_id": "case-1",
        "case_chat": [{"message_id": "msg-1", "role": "user", "content": "Operations Risk reviews exceptions weekly."}],
        "suggestions": [],
    }
    mock = MagicMock()
    mock.get_case.return_value = stored
    mock.update_case.side_effect = lambda _case_id, updates: {**stored, **updates}
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/chat/msg-1/convert-to-suggestion")

    assert response.status_code == 201
    assert response.json()["created_from"] == "case_chat"


@patch("api.routers.sop_uplift.get_store")
def test_bulk_suggestion_update_applies_decisions(mock_get_store):
    from api.main import app

    stored = {
        "case_id": "case-1",
        "suggestions": [
            {"suggestion_id": "s1", "status": "open"},
            {"suggestion_id": "s2", "status": "open"},
        ],
    }
    mock = MagicMock()
    mock.get_case.return_value = stored
    mock.update_case.side_effect = lambda _case_id, updates: {**stored, **updates}
    mock_get_store.return_value = mock

    response = TestClient(app).patch(
        "/sop-uplift/cases/case-1/suggestions/bulk",
        json={"updates": [{"suggestion_id": "s1", "status": "accepted"}, {"suggestion_id": "s2", "status": "rejected"}]},
    )

    assert response.status_code == 200
    assert [item["status"] for item in response.json()["suggestions"]] == ["accepted", "rejected"]


@patch("api.routers.sop_uplift.get_store")
def test_task_endpoint_returns_processing_state(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {"case_id": "case-1", "processing_state": {"analysis": {"pending": 2}}}
    mock_get_store.return_value = mock

    response = TestClient(app).get("/sop-uplift/cases/case-1/tasks/analysis")

    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_save_sop_uplift_report_stores_report_type_and_outputs():
    store = RCMReportStore.__new__(RCMReportStore)
    store._col = MagicMock()

    report_id = store.save_sop_uplift_report(
        {
            "case_id": "case-1",
            "case_title": "Quarterly access review SOP",
            "process_name": "Access reviews",
            "suggestion_counts": {"total": 3, "accepted": 1, "edited": 1, "rejected": 1},
            "case_chat_inputs_captured": 2,
            "output_files": [{"type": "docx", "filename": "uplift.docx"}],
        }
    )

    inserted = store._col.insert_one.call_args.args[0]
    assert report_id == inserted["report_id"]
    assert inserted["report_type"] == "sop_uplift"
    assert inserted["case_title"] == "Quarterly access review SOP"
    assert inserted["output_files"][0]["filename"] == "uplift.docx"

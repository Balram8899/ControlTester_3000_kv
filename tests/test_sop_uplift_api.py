import base64

from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from utils.sop_uplift.llm_orchestrator import PromptRunResult
from utils.sop_uplift.llm_schemas import AgentFollowUpQuestionsResponse, SopSuggestionResponse
from utils.sop_uplift.markdown_ingestion import MarkdownConversion
from utils.sop_uplift.readiness import compute_readiness
from utils.rcm_report_store import RCMReportStore


class ImmediateThread:
    def __init__(self, target=None, args=(), kwargs=None, daemon=None):
        self.target = target
        self.args = args
        self.kwargs = kwargs or {}
        self.daemon = daemon

    def start(self):
        if self.target:
            self.target(*self.args, **self.kwargs)


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


def test_readiness_allows_pending_uploaded_sop_before_conversion():
    result = compute_readiness(
        uploaded_files=[
            {"file_id": "sop", "bucket": "sops", "conversion": {"status": "pending"}},
            {"file_id": "rcm", "bucket": "risk_control_matrices", "conversion": {"status": "pending"}},
        ],
        document_tags=[
            {"file_id": "sop", "confirmed_tag": "sop"},
            {"file_id": "rcm", "confirmed_tag": "risk_control_matrix"},
        ],
    )

    assert result["status"] == "control_ready"
    assert result["can_analyze"] is True


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
def test_case_responses_do_not_include_raw_uploaded_file_content(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "title": "KYC",
        "uploaded_files": [
            {
                "file_id": "file-1",
                "filename": "kyc.docx",
                "raw_content": b"secret",
                "raw_content_b64": base64.b64encode(b"secret").decode("ascii"),
            }
        ],
    }
    mock.list_cases.return_value = [mock.get_case.return_value]
    mock_get_store.return_value = mock

    case_response = TestClient(app).get("/sop-uplift/cases/case-1")
    list_response = TestClient(app).get("/sop-uplift/cases")

    assert "raw_content" not in case_response.json()["uploaded_files"][0]
    assert "raw_content_b64" not in case_response.json()["uploaded_files"][0]
    assert "raw_content" not in list_response.json()["cases"][0]["uploaded_files"][0]
    assert "raw_content_b64" not in list_response.json()["cases"][0]["uploaded_files"][0]


@patch("api.routers.sop_uplift.get_store")
def test_delete_sop_uplift_case_returns_204(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.delete_case.return_value = True
    mock_get_store.return_value = mock

    response = TestClient(app).delete("/sop-uplift/cases/case-1")

    assert response.status_code == 204
    mock.delete_case.assert_called_once_with("case-1")


@patch("api.routers.sop_uplift.get_store")
def test_case_chat_is_case_scoped(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "title": "Access SOP",
        "uploaded_files": [{"file_id": "file-1", "filename": "Access SOP.docx", "bucket": "sops"}],
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop"}],
        "readiness": {"message": "SOP-only analysis is available.", "missing_recommended_inputs": ["risk_control_matrix"]},
    }
    user_message = {
        "message_id": "msg-1",
        "role": "user",
        "content": "Operations Risk reviews exceptions weekly.",
        "context_snapshot": {"workflow_step": "review", "document_filename": "Access SOP.docx"},
        "created_at": "2026-04-27T00:00:00",
        "linked_suggestion_ids": [],
        "captured_context": {
            "type": "frequency",
            "value": "Operations Risk reviews exceptions weekly.",
            "confidence": "medium",
        },
    }
    agent_message = {
        "message_id": "msg-2",
        "role": "agent",
        "content": "I captured that for this case. Current upload readiness: SOP-only analysis is available.",
        "context_snapshot": {"workflow_step": "review", "document_filename": "Access SOP.docx"},
        "created_at": "2026-04-27T00:00:01",
        "linked_suggestion_ids": [],
        "captured_context": None,
    }
    mock.add_chat_message.side_effect = [user_message, agent_message]
    mock_get_store.return_value = mock

    response = TestClient(app).post(
        "/sop-uplift/cases/case-1/chat",
        json={
            "role": "user",
            "content": "Operations Risk reviews exceptions weekly.",
            "context_snapshot": {"workflow_step": "review", "document_filename": "Access SOP.docx"},
        },
    )

    assert response.status_code == 201
    assert mock.add_chat_message.call_count == 2
    mock.add_chat_message.assert_any_call("case-1", "user", "Operations Risk reviews exceptions weekly.", {"workflow_step": "review", "document_filename": "Access SOP.docx"})
    mock.add_chat_message.assert_any_call("case-1", "agent", mock.add_chat_message.call_args_list[1].args[2], {"workflow_step": "review", "document_filename": "Access SOP.docx"})
    assert response.json()["message_id"] == "msg-1"
    assert response.json()["context_snapshot"]["workflow_step"] == "review"
    assert response.json()["agent_message"]["role"] == "agent"


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
            {"anchor_id": "a1", "block_type": "paragraph", "text": "Operations reviews access exceptions before user access is approved.", "section_path": ["Access Reviews"]},
            {"anchor_id": "a2", "block_type": "paragraph", "text": "Evidence is retained.", "section_path": ["Access Reviews"]},
        ],
        "suggestions": [],
        "processing_state": {},
    }
    mock.update_case.return_value = mock.get_case.return_value
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/analyze", json={"batch_size": 1, "use_llm": False})

    assert response.status_code == 200
    payload = response.json()
    assert payload["processing_state"]["analysis"]["completed"] == 1
    assert payload["processing_state"]["analysis"]["pending"] == 1
    assert len(payload["suggestions"]) == 1


@patch("api.routers.sop_uplift.get_store")
def test_analyze_endpoint_targets_only_sop_material_and_uses_supporting_context(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [
            {"file_id": "sop-file", "bucket": "sops"},
            {"file_id": "rcm-file", "bucket": "risk_control_matrices"},
        ],
        "document_tags": [
            {"file_id": "sop-file", "confirmed_tag": "sop"},
            {"file_id": "rcm-file", "confirmed_tag": "risk_control_matrix"},
        ],
        "anchors": [
            {
                "anchor_id": "sop-1",
                "file_id": "sop-file",
                "block_type": "paragraph",
                "text": "Operations reviews high risk client onboarding exceptions before account opening.",
                "section_path": ["Risk assessment"],
            },
            {
                "anchor_id": "rcm-1",
                "file_id": "rcm-file",
                "block_type": "table",
                "text": "Risk ID | Control ID | Frequency | Evidence | Owner",
                "section_path": ["RCM"],
            },
        ],
        "chunks": [
            {
                "chunk_id": "ctx-1",
                "document_id": "doc-rcm",
                "file_id": "rcm-file",
                "content": "Control C-12 requires Compliance approval evidence for high risk onboarding exceptions.",
                "anchor_ids": ["rcm-anchor-1"],
            }
        ],
        "suggestions": [],
        "processing_state": {},
    }
    mock.update_case.return_value = mock.get_case.return_value
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/analyze", json={"batch_size": 10, "use_llm": False})

    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert len(suggestions) == 1
    assert {item["anchor_id"] for item in suggestions} == {"sop-1"}
    sop_suggestion = next(item for item in suggestions if item["anchor_id"] == "sop-1")
    assert sop_suggestion["source_references"][1]["anchor_id"] == "rcm-anchor-1"
    assert "Compliance approval evidence" in sop_suggestion["suggested_text"]
    assert "Source text:" not in sop_suggestion["suggested_text"]


@patch("api.routers.sop_uplift.get_store")
def test_analyze_endpoint_refreshes_stale_open_generated_suggestions(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [{"file_id": "sop-file", "bucket": "sops"}, {"file_id": "rcm-file", "bucket": "risk_control_matrices"}],
        "document_tags": [{"file_id": "sop-file", "confirmed_tag": "sop"}, {"file_id": "rcm-file", "confirmed_tag": "risk_control_matrix"}],
        "anchors": [
            {
                "anchor_id": "sop-1",
                "file_id": "sop-file",
                "block_type": "paragraph",
                "text": "Operations reviews high risk client onboarding exceptions before account opening.",
                "section_path": ["Risk assessment"],
            }
        ],
        "chunks": [
            {
                "chunk_id": "ctx-1",
                "document_id": "doc-rcm",
                "file_id": "rcm-file",
                "content": "Control C-12 requires Compliance approval evidence for high risk onboarding exceptions.",
                "anchor_ids": ["rcm-anchor-1"],
            }
        ],
        "suggestions": [
            {
                "suggestion_id": "sug_sop-1",
                "anchor_id": "sop-1",
                "status": "open",
                "created_from": "analysis",
                "suggested_text": "This should align to the supporting record: | --- | --- |",
            }
        ],
        "processing_state": {},
    }
    mock.update_case.return_value = mock.get_case.return_value
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/analyze", json={"batch_size": 10, "section_ids": ["sop-1"], "use_llm": False})

    assert response.status_code == 200
    suggestions = response.json()["suggestions"]
    assert len([item for item in suggestions if item["suggestion_id"] == "sug_sop-1"]) == 1
    refreshed = next(item for item in suggestions if item["suggestion_id"] == "sug_sop-1")
    assert "| --- |" not in refreshed["suggested_text"]
    assert "Compliance approval evidence" in refreshed["suggested_text"]


@patch("api.routers.sop_uplift.run_json_prompt")
@patch("api.routers.sop_uplift.get_store")
def test_analyze_endpoint_can_generate_llm_suggestions_incrementally(mock_get_store, mock_run_json_prompt):
    from api.main import app

    mock_run_json_prompt.return_value = PromptRunResult(
        parsed=SopSuggestionResponse(
            suggestions=[
                {
                    "suggestion_id": "sug-llm",
                    "type": "evidence_gap",
                    "severity": "high",
                    "anchor_id": "a1",
                    "title": "Add evidence",
                    "summary": "Name the retained evidence.",
                    "suggested_text": "Retain the access review export.",
                    "source_references": [{"anchor_id": "a1"}],
                    "anchor_confidence": "high",
                }
            ]
        ),
        raw="{}",
        record={"stage": "sop_uplift_suggestions", "validation_status": "valid"},
    )
    stored = {
        "case_id": "case-1",
        "anchors": [
            {"anchor_id": "a1", "block_type": "paragraph", "text": "Owner reviews users.", "section_path": ["Access Reviews"]},
            {"anchor_id": "a2", "block_type": "paragraph", "text": "Evidence is retained.", "section_path": ["Access Reviews"]},
        ],
        "corpus_map": {"primary_process": "Access reviews"},
        "chunks": [
            {
                "chunk_id": "ctx-1",
                "document_id": "doc-rcm",
                "file_id": "rcm-file",
                "content": "Control C-12 requires Compliance approval evidence for access review exceptions.",
                "anchor_ids": ["rcm-anchor-1"],
            }
        ],
        "suggestions": [],
        "processing_state": {},
        "prompt_runs": [],
    }

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = TestClient(app).post(
        "/sop-uplift/cases/case-1/analyze",
        json={"batch_size": 1, "section_ids": ["a1"], "use_llm": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["suggestions"][0]["suggestion_id"] == "sug-llm"
    assert payload["suggestions"][0]["created_from"] == "llm"
    assert payload["processing_state"]["analysis"]["completed_section_ids"] == ["a1"]
    updated = mock.update_case.call_args.args[1]
    assert updated["prompt_runs"][0]["stage"] == "sop_uplift_suggestions"
    prompt = mock_run_json_prompt.call_args.args[1]
    assert "Control C-12" in prompt
    mock_run_json_prompt.assert_called_once()


@patch("api.routers.sop_uplift.run_json_prompt")
@patch("api.routers.sop_uplift.get_store")
def test_analyze_endpoint_errors_when_llm_unavailable(mock_get_store, mock_run_json_prompt):
    from api.main import app

    mock_run_json_prompt.return_value = PromptRunResult(
        parsed=None,
        raw="",
        record={
            "stage": "sop_uplift_suggestions",
            "model": "unavailable",
            "validation_status": "invalid",
            "error": "LLM unavailable for sop_uplift_suggestions: OPENAI_API_KEY must be set",
        },
    )
    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "anchors": [{"anchor_id": "a1", "block_type": "paragraph", "text": "Owner reviews users.", "file_id": "file-1"}],
        "uploaded_files": [{"file_id": "file-1", "bucket": "sops"}],
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop"}],
        "chunks": [{"chunk_id": "c1", "file_id": "file-1", "content": "Owner reviews users.", "anchor_ids": ["a1"]}],
        "suggestions": [],
        "processing_state": {},
        "prompt_runs": [],
    }
    mock_get_store.return_value = mock

    response = TestClient(app).post(
        "/sop-uplift/cases/case-1/analyze",
        json={"batch_size": 1, "section_ids": ["a1"], "use_llm": True},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Check LLM settings"
    mock.update_case.assert_not_called()


@patch("api.routers.sop_uplift.run_json_prompt")
@patch("api.routers.sop_uplift.get_store")
def test_follow_up_questions_endpoint_runs_independent_llm_prompt(mock_get_store, mock_run_json_prompt):
    from api.main import app

    mock_run_json_prompt.return_value = PromptRunResult(
        parsed=AgentFollowUpQuestionsResponse(
            questions=[
                {
                    "question_id": "q-1",
                    "question": "Who approves high-risk exceptions?",
                    "priority": "high",
                    "why_it_matters": "Approval ownership is missing.",
                }
            ]
        ),
        raw="{}",
        record={"stage": "agent_follow_up_questions", "validation_status": "valid"},
    )
    stored = {
        "case_id": "case-1",
        "process_name": "Access reviews",
        "case_chat": [{"message_id": "msg-1", "role": "user", "content": "Operations Risk reviews weekly."}],
        "corpus_map": {"coverage_gaps": ["No exception approver"]},
        "suggestions": [],
        "prompt_runs": [],
    }

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.return_value = stored
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/follow-up-questions", json={"use_llm": True})

    assert response.status_code == 200
    assert response.json()["agent_follow_up_questions"][0]["question_id"] == "q-1"
    updated = mock.update_case.call_args.args[1]
    assert updated["agent_follow_up_questions"][0]["question"] == "Who approves high-risk exceptions?"
    assert updated["prompt_runs"][0]["stage"] == "agent_follow_up_questions"
    mock_run_json_prompt.assert_called_once()


@patch("api.routers.sop_uplift.threading.Thread", side_effect=ImmediateThread)
@patch("api.routers.sop_uplift.get_store")
@patch("api.routers.sop_uplift.convert_bytes_to_markdown")
def test_run_pipeline_converts_pending_uploads_before_analysis(mock_convert, mock_get_store, _mock_thread):
    from api.routers.sop_uplift import PipelineRunRequest, run_pipeline

    mock_convert.return_value = MarkdownConversion(
        markdown="# Access\n\nOwner reviews access control evidence and risk exceptions.",
        converter="plain_text",
    )
    case = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "uploaded_files": [
            {
                "file_id": "file-1",
                "filename": "access_sop.md",
                "bucket": "sops",
                "conversion": {"status": "pending"},
                "raw_content_b64": base64.b64encode(b"# Access\n\nOwner reviews access control evidence and risk exceptions.").decode("ascii"),
            }
        ],
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop", "confidence": "high"}],
        "markdown_documents": [],
        "anchors": [],
        "chunks": [],
        "case_chat": [],
        "suggestions": [],
        "processing_state": {},
    }
    stored = dict(case)

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.get_file_content.return_value = b"# Access\n\nOwner reviews access control evidence and risk exceptions."
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = run_pipeline("case-1", PipelineRunRequest(use_llm=False))

    assert response["task_id"] == "pipeline"
    assert response["status"] == "running"
    assert stored["markdown_documents"][0]["file_id"] == "file-1"
    assert stored["processing_state"]["conversion"]["completed"] == 1
    assert stored["processing_state"]["pipeline"]["status"] == "complete"
    mock_convert.assert_called_once()


@patch("api.routers.sop_uplift.threading.Thread", side_effect=ImmediateThread)
@patch("api.routers.sop_uplift.get_store")
def test_run_pipeline_endpoint_persists_full_case_artifacts(mock_get_store, _mock_thread):
    from api.routers.sop_uplift import PipelineRunRequest, run_pipeline

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

    response = run_pipeline("case-1", PipelineRunRequest(use_llm=False))

    assert response["task_id"] == "pipeline"
    updated = stored
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


@patch("api.routers.sop_uplift.threading.Thread", side_effect=ImmediateThread)
@patch("api.routers.sop_uplift.run_full_sop_pipeline", side_effect=RuntimeError("broken extraction"))
@patch("api.routers.sop_uplift.get_store")
def test_run_pipeline_persists_failed_task_state(mock_get_store, _mock_run_pipeline, _mock_thread):
    from api.routers.sop_uplift import PipelineRunRequest, run_pipeline

    stored = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "uploaded_files": [{"file_id": "file-1", "filename": "access_sop.md", "bucket": "sops", "conversion": {"status": "converted"}}],
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop", "confidence": "high"}],
        "markdown_documents": [{"document_id": "doc_file-1", "file_id": "file-1", "filename": "access_sop.md", "markdown": "# Access\n\nOwner reviews access."}],
        "anchors": [{"anchor_id": "a1", "document_id": "doc_file-1", "file_id": "file-1", "block_type": "paragraph", "text": "Owner reviews access.", "section_path": ["Access"]}],
        "chunks": [{"chunk_id": "c1", "document_id": "doc_file-1", "file_id": "file-1", "content": "Owner reviews access.", "anchor_ids": ["a1"]}],
        "case_chat": [],
        "suggestions": [],
        "processing_state": {},
    }

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = run_pipeline("case-1", PipelineRunRequest(use_llm=False))

    assert response["task_id"] == "pipeline"
    assert stored["processing_state"]["pipeline"]["status"] == "failed"
    assert stored["processing_state"]["pipeline"]["error"] == "broken extraction"


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
def test_raw_file_content_endpoint_streams_uploaded_bytes(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [
            {
                "file_id": "file-1",
                "filename": "control_matrix.xlsx",
                "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
        ],
    }
    mock.get_file_content.return_value = b"raw-office-bytes"
    mock_get_store.return_value = mock

    response = TestClient(app).get("/sop-uplift/cases/case-1/files/file-1/content")

    assert response.status_code == 200
    assert response.content == b"raw-office-bytes"
    assert response.headers["content-disposition"].startswith("inline;")
    assert response.headers["x-sop-uplift-filename"] == "control_matrix.xlsx"


@patch("api.routers.sop_uplift.get_store")
def test_preview_endpoint_rebuilds_and_excludes_corrupt_office_markdown(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "markdown_documents": [
            {
                "document_id": "doc-bad",
                "file_id": "file-bad",
                "filename": "bad.docx",
                "markdown": "PK\x03\x04 word/styles.xml ï¿½ï¿½ï¿½ï¿½",
            },
            {
                "document_id": "doc-good",
                "file_id": "file-good",
                "filename": "good.md",
                "markdown": "# Access\n\nOwner reviews users.",
            },
        ],
        "anchors": [
            {"anchor_id": "bad", "document_id": "doc-bad", "file_id": "file-bad", "block_type": "paragraph", "text": "PK word/styles.xml"},
            {"anchor_id": "a1", "document_id": "doc-good", "file_id": "file-good", "block_type": "paragraph", "text": "Owner reviews users."},
        ],
        "suggestions": [{"suggestion_id": "s1", "anchor_id": "a1", "title": "Add owner"}],
        "preview_model": {"highlights": [{"anchor_id": "stale", "text": "PK word/styles.xml"}]},
    }
    mock_get_store.return_value = mock

    response = TestClient(app).get("/sop-uplift/cases/case-1/preview")

    assert response.status_code == 200
    payload = response.json()
    assert [doc["document_id"] for doc in payload["markdown_documents"]] == ["doc-good"]
    assert [anchor["anchor_id"] for anchor in payload["anchors"]] == ["a1"]
    assert payload["preview_model"]["highlights"][0]["anchor_id"] == "a1"
    assert "word/styles.xml" not in str(payload["preview_model"])


@patch("api.routers.sop_uplift.get_store")
def test_generate_outputs_returns_downloadable_non_placeholder_outputs(mock_get_store):
    from api.main import app

    case = {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "anchors": [{"anchor_id": "a1", "block_type": "paragraph", "text": "Original text.", "section_path": ["Access Reviews"]}],
        "suggestions": [{"suggestion_id": "s1", "status": "accepted", "anchor_id": "a1", "suggested_text": "Operations Risk reviews weekly.", "title": "Add owner"}],
        "diagram_model": {
            "title": "Rich Access Review",
            "lanes": [{"lane_id": "risk", "name": "Operations Risk", "order": 1}],
            "nodes": [{"node_id": "review", "lane_id": "risk", "type": "control", "shape": "process", "label": "Review access", "column": 2, "badge": "C1"}],
            "edges": [],
            "control_summary": [{"badge": "C1", "label": "Operations Risk reviews access."}],
            "warnings": ["Diagram generated with repaired layout"],
        },
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
    assert {output["type"] for output in outputs} >= {"docx", "drawio", "mermaid", "diagram_png", "diagram_pdf", "changelog_markdown", "changelog_json", "svg"}
    assert all(output.get("content_b64") for output in outputs)
    assert stored["diagram_model"]["title"] == "Access reviews Swimlane"
    assert stored["diagram_model"]["nodes"][0]["label"] == "Operations Risk reviews weekly."


@patch("api.routers.sop_uplift.get_store")
def test_generate_outputs_rebuilds_final_diagram_from_effective_sop_state(mock_get_store):
    from api.main import app

    case = {
        "case_id": "case-1",
        "title": "Vendor onboarding SOP",
        "process_name": "Vendor onboarding",
        "anchors": [
            {"anchor_id": "a1", "block_type": "paragraph", "text": "Original vendor request step.", "section_path": ["Vendor Review"]},
            {"anchor_id": "a2", "block_type": "paragraph", "text": "Original evidence step.", "section_path": ["Vendor Review"]},
        ],
        "suggestions": [
            {"suggestion_id": "s1", "status": "accepted", "anchor_id": "a1", "suggested_text": "Business Owner submits request.", "title": "Add requester"},
            {"suggestion_id": "s2", "status": "edited", "anchor_id": "a2", "suggested_text": "Retain generic evidence.", "user_text": "Risk stores vendor packet.", "title": "Add evidence"},
            {"suggestion_id": "s3", "status": "rejected", "anchor_id": "a1", "suggested_text": "Rejected board review.", "title": "Rejected path"},
            {"suggestion_id": "s4", "status": "open", "anchor_id": "a2", "suggested_text": "Pending duplicate review.", "title": "Pending path"},
        ],
        "diagram_model": {
            "title": "Stale Preview Diagram",
            "lanes": [{"lane_id": "legacy", "name": "Legacy", "order": 1}],
            "nodes": [{"node_id": "stale", "lane_id": "legacy", "type": "activity", "shape": "process", "label": "Stale preview only", "column": 0}],
            "edges": [],
        },
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
    labels = " ".join(node["label"] for node in stored["diagram_model"]["nodes"])
    warnings = stored["diagram_model"]["warnings"]
    svg_output = next(output for output in response.json()["outputs"] if output["type"] == "svg")
    svg_text = base64.b64decode(svg_output["content_b64"]).decode("utf-8")
    assert "Business Owner submits request." in labels
    assert "Risk stores vendor packet." in labels
    assert "Stale preview only" not in labels
    assert "Rejected board review." not in labels
    assert "Pending duplicate review." not in labels
    assert "Rejected and open suggestions were excluded from the implemented process diagram." in warnings
    assert "Business Owner" in svg_text
    assert "submits request." in svg_text


@patch("api.routers.sop_uplift.get_store")
def test_generate_outputs_warns_when_no_suggestions_are_applied(mock_get_store):
    from api.main import app

    case = {
        "case_id": "case-1",
        "title": "Vendor onboarding SOP",
        "process_name": "Vendor onboarding",
        "anchors": [{"anchor_id": "a1", "block_type": "paragraph", "text": "Original vendor request step.", "section_path": ["Vendor Review"]}],
        "suggestions": [{"suggestion_id": "s1", "status": "open", "anchor_id": "a1", "suggested_text": "Pending duplicate review."}],
        "case_chat": [],
        "outputs": [],
    }
    stored = dict(case)
    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.update_case.side_effect = lambda _case_id, updates: stored.update(updates) or stored
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/generate-outputs")

    assert response.status_code == 202
    assert "No accepted or edited uplift suggestions were applied; diagram reflects the current uploaded SOP." in stored["diagram_model"]["warnings"]


def test_final_diagram_supporting_docs_enrich_without_creating_process_nodes():
    from api.routers.sop_uplift import _diagram_model_for_outputs

    model = _diagram_model_for_outputs(
        {
            "title": "Vendor onboarding SOP",
            "process_name": "Vendor onboarding",
            "revised_sop_sections": [
                {"anchor_id": "a1", "heading": "Vendor Review", "original_text": "Original.", "revised_text": "Business Owner submits request."}
            ],
            "extracted_controls": [{"control_id": "C-12", "description": "Compliance sanctions screening control."}],
            "extracted_risks": [{"risk_id": "R-7", "description": "Sanctions screening bypass."}],
            "evidence_items": [{"evidence_id": "E-3", "evidence_description": "Approved vendor packet."}],
            "diagram_references": [{"description": "Compliance performs sanctions screening as a separate process step."}],
            "suggestions": [{"suggestion_id": "s1", "status": "accepted", "anchor_id": "a1", "suggested_text": "Business Owner submits request."}],
        }
    )

    node_labels = " ".join(node.label for node in model.nodes)
    assert "Business Owner submits request." in node_labels
    assert "Compliance performs sanctions screening" not in node_labels
    assert model.control_summary == [{"badge": "C1", "label": "Compliance sanctions screening control."}]
    assert model.risk_summary == [{"badge": "R1", "label": "Sanctions screening bypass."}]


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
def test_tag_documents_uses_filename_and_markdown_signals_before_bucket(mock_get_store):
    from api.main import app

    stored_tags = []

    def set_document_tag(_case_id, file_id, tag):
        stored = {"file_id": file_id, **tag}
        stored_tags.append(stored)
        return stored

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "uploaded_files": [{"file_id": "file-1", "filename": "WM_Risk_Controls_Matrix.xlsx", "bucket": "sops"}],
        "markdown_documents": [{"file_id": "file-1", "markdown": "Risk ID | Control ID | Frequency"}],
        "document_tags": [],
    }
    mock.set_document_tag.side_effect = set_document_tag
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/tag-documents")

    assert response.status_code == 200
    assert response.json()["document_tags"][0]["confirmed_tag"] == "risk_control_matrix"
    assert stored_tags[0]["suggested_tag"] == "risk_control_matrix"


@patch("api.routers.sop_uplift.get_store")
def test_convert_rebuilds_corrupt_docx_markdown_and_removes_stale_suggestions(mock_get_store):
    from api.main import app

    stored = {
        "case_id": "case-1",
        "uploaded_files": [
            {
                "file_id": "file-1",
                "filename": "bad.docx",
                "bucket": "sops",
                    "raw_content_b64": base64.b64encode(b"PK\x03\x04 word/styles.xml \x00\x01").decode("ascii"),
                "conversion": {"status": "converted", "converter": "utf8_fallback"},
            }
        ],
        "markdown_documents": [
            {
                "document_id": "doc_file-1",
                "file_id": "file-1",
                "filename": "bad.docx",
                "markdown": "PK\x03\x04 word/styles.xml ����",
                "conversion": {"status": "converted", "converter": "utf8_fallback"},
            }
        ],
        "anchors": [{"anchor_id": "stale", "file_id": "file-1", "document_id": "doc_file-1", "text": "PK word/styles.xml"}],
        "chunks": [{"chunk_id": "stale", "document_id": "doc_file-1", "anchor_ids": ["stale"]}],
        "suggestions": [{"suggestion_id": "s1", "anchor_id": "stale", "status": "open"}],
        "processing_state": {},
    }

    def update_case(_case_id, updates):
        stored.update(updates)
        return stored

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.get_file_content.return_value = b"PK\x03\x04 word/styles.xml \x00\x01"
    mock.update_case.side_effect = update_case
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/convert")

    assert response.status_code == 200
    assert response.json()["markdown_documents"] == []
    assert stored["suggestions"] == []
    assert stored["uploaded_files"][0]["conversion"]["status"] == "failed"


@patch("api.routers.sop_uplift.get_store")
def test_build_index_endpoint_persists_case_local_index(mock_get_store):
    from api.main import app

    stored = {
        "case_id": "case-1",
        "process_name": "Vendor onboarding",
        "uploaded_files": [{"file_id": "file-1", "filename": "vendor_sop.md", "bucket": "sops"}],
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop", "confidence": "high"}],
        "chunks": [
            {
                "chunk_id": "chunk-1",
                "document_id": "doc_file-1",
                "content": "Business Owner checks vendor onboarding completeness.",
                "anchor_ids": ["anchor-1"],
            }
        ],
        "case_chat": [],
    }
    mock = MagicMock()
    mock.get_case.return_value = stored
    mock.update_case.side_effect = lambda _case_id, updates: {**stored, **updates}
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/build-index")

    assert response.status_code == 200
    payload = response.json()
    assert payload["case_index"]["source_scope"] == "case_uploads_only"
    assert payload["case_index"]["stats"]["chunks"] == 1
    mock.update_case.assert_called_once()


@patch("api.routers.sop_uplift.get_store")
def test_convert_case_documents_preserves_file_id_on_chunks(mock_get_store):
    from api.main import app

    stored = {
        "case_id": "case-1",
        "uploaded_files": [
            {
                "file_id": "sop-file",
                "filename": "kyc_sop.md",
                "content_type": "text/markdown",
                "bucket": "sops",
                "raw_content_b64": base64.b64encode(b"# KYC\n\nReview source of funds before onboarding.").decode("ascii"),
                "conversion": {"status": "pending"},
            }
        ],
        "markdown_documents": [],
        "anchors": [],
        "chunks": [],
        "processing_state": {},
    }

    mock = MagicMock()
    mock.get_case.side_effect = lambda _case_id: stored
    mock.get_file_content.return_value = b"# KYC\n\nReview source of funds before onboarding."
    mock.update_case.side_effect = lambda _case_id, updates: stored.update(updates) or stored
    mock_get_store.return_value = mock

    response = TestClient(app).post("/sop-uplift/cases/case-1/convert")

    assert response.status_code == 200
    chunks = response.json()["chunks"]
    assert chunks
    assert {chunk["file_id"] for chunk in chunks} == {"sop-file"}


@patch("api.routers.sop_uplift.get_store")
def test_search_index_endpoint_uses_case_local_index_without_platform_graph(mock_get_store):
    from api.main import app

    mock = MagicMock()
    mock.get_case.return_value = {
        "case_id": "case-1",
        "process_name": "Vendor onboarding",
        "case_index": {
            "case_id": "case-1",
            "source_scope": "case_uploads_only",
            "entries": [
                {
                    "entry_id": "chat_msg-1",
                    "case_id": "case-1",
                    "source_type": "chat_message",
                    "source_id": "msg-1",
                    "text": "Operations Risk approves high-risk exceptions weekly.",
                    "search_text": "operations risk approves high risk exceptions weekly",
                    "metadata": {},
                }
            ],
            "stats": {"chunks": 0, "anchors": 0, "chat_messages": 1, "suggestions": 0},
        },
    }
    mock_get_store.return_value = mock

    response = TestClient(app).post(
        "/sop-uplift/cases/case-1/index/search",
        json={"query": "weekly exceptions", "limit": 5},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_scope"] == "case_uploads_only"
    assert payload["results"][0]["source_type"] == "chat_message"


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

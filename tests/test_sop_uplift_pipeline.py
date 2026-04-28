from unittest.mock import patch

from utils.sop_uplift.llm_orchestrator import PromptRunResult
from utils.sop_uplift.llm_schemas import (
    AgentFollowUpQuestionsResponse,
    CaseChatContextExtractionResponse,
    CorpusMapResponse,
    DiagramReferenceExtractionResponse,
    DuplicateConflictMergeResponse,
    EvidenceExtractionResponse,
    FinalSummaryResponse,
    MissingControlRecommendationsResponse,
    PolicyRequirementExtractionResponse,
    RiskControlMatrixExtractionResponse,
    SopStructureExtractionResponse,
    SopSuggestionResponse,
    SwimlaneDiagramModelResponse,
)
from utils.sop_uplift.pipeline import run_full_sop_pipeline


def _case():
    return {
        "case_id": "case-1",
        "title": "Quarterly access review SOP",
        "process_name": "Access reviews",
        "document_tags": [{"file_id": "file-1", "confirmed_tag": "sop", "confidence": "high"}],
        "markdown_documents": [{"document_id": "doc-1", "file_id": "file-1", "filename": "access.md", "markdown": "# Access\n\nOwner reviews users."}],
        "anchors": [{"anchor_id": "a1", "document_id": "doc-1", "file_id": "file-1", "block_type": "paragraph", "text": "Owner reviews users.", "section_path": ["Access"]}],
        "chunks": [{"chunk_id": "c1", "document_id": "doc-1", "content": "Owner reviews users.", "anchor_ids": ["a1"]}],
        "case_chat": [{"message_id": "msg-1", "role": "user", "content": "Operations Risk reviews weekly."}],
        "suggestions": [],
        "processing_state": {},
    }


def _result(stage, parsed):
    return PromptRunResult(
        parsed=parsed,
        raw="{}",
        record={"stage": stage, "model": "FakeLLM", "validation_status": "valid", "attempts": 1},
    )


def test_full_pipeline_consumes_valid_llm_outputs_in_case_state():
    responses = {
        "sop_structure_extraction": SopStructureExtractionResponse(sections=[{"anchor_id": "a1"}], process_steps=[{"step_id": "p1", "text": "Review users"}]),
        "policy_requirement_extraction": PolicyRequirementExtractionResponse(requirements=[{"requirement_id": "req-llm", "text": "Review access quarterly.", "source_anchor_id": "a1"}]),
        "risk_control_matrix_extraction": RiskControlMatrixExtractionResponse(controls=[{"control_id": "ctrl-llm", "description": "Operations Risk reviews exceptions.", "source_anchor_id": "a1"}], risks=[{"risk_id": "risk-llm", "description": "Unauthorized access.", "source_anchor_id": "a1"}]),
        "evidence_extraction": EvidenceExtractionResponse(evidence_items=[{"evidence_id": "ev-llm", "evidence_description": "Access review export.", "source_anchor_id": "a1"}]),
        "diagram_reference_extraction": DiagramReferenceExtractionResponse(diagram_summary="Access review flow", steps=["Start review"], warnings=[]),
        "sop_uplift_suggestions": SopSuggestionResponse(suggestions=[{"suggestion_id": "sug-llm", "type": "evidence_gap", "severity": "high", "anchor_id": "a1", "title": "Add evidence", "summary": "Name retained evidence.", "suggested_text": "Retain access review export.", "source_references": [{"anchor_id": "a1"}], "anchor_confidence": "high"}]),
        "case_chat_context_extraction": CaseChatContextExtractionResponse(captured_context=[{"type": "frequency", "value": "weekly", "confidence": "high"}], agent_follow_up_questions=[]),
        "corpus_map": CorpusMapResponse(primary_process="LLM Access Reviews", processes_identified=["Access reviews"], actors=["Operations Risk"], systems=["IAM"], coverage_gaps=[]),
        "missing_control_recommendations": MissingControlRecommendationsResponse(missing_control_recommendations=[{"recommendation_id": "mc-1", "gap_summary": "No exception control", "suggested_sop_insert": "Add exception approval control.", "severity": "medium", "anchor_id": "a1", "source_references": [{"risk_id": "risk-llm"}]}]),
        "duplicate_conflict_merge": DuplicateConflictMergeResponse(duplicate_groups=[{"group_id": "dup-1", "suggestion_ids": ["sug_a1", "sug-llm"], "recommended_primary_suggestion_id": "sug-llm", "merge_rationale": "LLM suggestion is more specific."}], conflicting_suggestions=[]),
        "agent_follow_up_questions": AgentFollowUpQuestionsResponse(questions=[{"question_id": "q-llm", "question": "Who approves exceptions?", "priority": "high"}]),
        "swimlane_diagram_model": SwimlaneDiagramModelResponse(title="LLM Swimlane", lanes=[{"lane_id": "risk", "name": "Operations Risk", "order": 1}], nodes=[{"node_id": "n1", "lane_id": "risk", "type": "control", "label": "Approve exceptions"}], edges=[]),
        "final_summary_change_log": FinalSummaryResponse(executive_summary="LLM summary complete.", limitations=["Uploaded corpus only."]),
    }

    def fake_run(stage, _prompt, _schema):
        return _result(stage, responses[stage])

    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        updates = run_full_sop_pipeline(_case(), use_llm=True)

    assert updates["extracted_requirements"][0]["requirement_id"] == "req-llm"
    assert updates["corpus_map"]["primary_process"] == "LLM Access Reviews"
    assert any(item["suggestion_id"] == "sug-llm" for item in updates["suggestions"])
    assert any(item["type"] == "missing_control" for item in updates["suggestions"])
    assert not any(item["suggestion_id"] == "sug_a1" for item in updates["suggestions"])
    assert updates["agent_follow_up_questions"][0]["question_id"] == "q-llm"
    assert updates["diagram_model"]["title"] == "LLM Swimlane"
    assert updates["final_summary"]["executive_summary"] == "LLM summary complete."
    assert {record["stage"] for record in updates["prompt_runs"]} >= set(responses)

import threading
import time
from unittest.mock import patch

import pytest

from utils.sop_uplift.llm_orchestrator import PromptRunResult
from utils.sop_uplift.llm_orchestrator import run_json_prompt
from utils.sop_uplift.llm_schemas import (
    AgentFollowUpQuestionsResponse,
    CaseFinalizationResponse,
    CaseChatContextExtractionResponse,
    CorpusMapResponse,
    DiagramReferenceExtractionResponse,
    DuplicateConflictMergeResponse,
    EvidenceExtractionResponse,
    FinalSummaryResponse,
    FullDocumentExtractionResponse,
    MissingControlRecommendationsResponse,
    PolicyRequirementExtractionResponse,
    RiskControlMatrixExtractionResponse,
    SopStructureExtractionResponse,
    SopSuggestionResponse,
    SwimlaneDiagramModelResponse,
)
from utils.sop_uplift.pipeline import build_case_suggestion_context, build_diagram_context, build_suggestion_context, run_full_sop_pipeline
from utils.sop_uplift.prompt_templates import build_prompt


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


def _case_with_supporting_context():
    return {
        "case_id": "case-ctx",
        "title": "Client onboarding SOP",
        "process_name": "Client onboarding",
        "domain_label": "Wealth management",
        "document_tags": [
            {"file_id": "sop-file", "confirmed_tag": "sop", "confidence": "high"},
            {"file_id": "rcm-file", "confirmed_tag": "risk_control_matrix", "confidence": "high"},
            {"file_id": "evidence-file", "confirmed_tag": "evidence", "confidence": "high"},
        ],
        "markdown_documents": [
            {"document_id": "doc-sop", "file_id": "sop-file", "filename": "kyc_sop.docx", "markdown": "# KYC\n\nRelationship Manager shall review source of funds before onboarding.\n\nThe Branch Operations team shall validate the NAAF."},
            {"document_id": "doc-rcm", "file_id": "rcm-file", "filename": "risk_controls.xlsx", "markdown": "# RCM\n\nC-12 | Branch Operations | Before account opening | Signed NAAF approval workflow record"},
        ],
        "anchors": [
            {"anchor_id": "sop-1", "document_id": "doc-sop", "file_id": "sop-file", "block_type": "paragraph", "text": "Relationship Manager shall review source of funds before onboarding.", "section_path": ["KYC"]},
            {"anchor_id": "sop-2", "document_id": "doc-sop", "file_id": "sop-file", "block_type": "paragraph", "text": "The Branch Operations team shall validate the NAAF.", "section_path": ["KYC"]},
            {"anchor_id": "rcm-1", "document_id": "doc-rcm", "file_id": "rcm-file", "block_type": "paragraph", "text": "C-12 | Branch Operations | Before account opening | Signed NAAF approval workflow record", "section_path": ["RCM"]},
        ],
        "chunks": [
            {"chunk_id": "c-sop", "document_id": "doc-sop", "file_id": "sop-file", "content": "Relationship Manager shall review source of funds before onboarding.", "anchor_ids": ["sop-1"]},
            {"chunk_id": "c-rcm", "document_id": "doc-rcm", "file_id": "rcm-file", "content": "C-12 | Branch Operations | Before account opening | Signed NAAF approval workflow record", "anchor_ids": ["rcm-1"]},
        ],
        "extracted_controls": [{"control_id": "C-12", "description": "Branch Operations validates NAAF completeness.", "source_anchor_id": "rcm-1"}],
        "extracted_risks": [{"risk_id": "R-1", "description": "Incomplete KYC onboarding."}],
        "evidence_items": [{"evidence_id": "E-1", "evidence_description": "Signed NAAF approval workflow record"}],
        "corpus_map": {"sop_to_control_map": [{"anchor_id": "sop-1", "control_id": "C-12"}], "coverage_gaps": []},
        "case_chat": [],
        "suggestions": [],
        "processing_state": {},
    }


def _case_with_two_sop_documents():
    case = _case_with_supporting_context()
    case["document_tags"].append({"file_id": "policy-file", "confirmed_tag": "policy", "confidence": "high"})
    case["markdown_documents"].append(
        {
            "document_id": "doc-policy",
            "file_id": "policy-file",
            "filename": "kyc_policy.docx",
            "markdown": "# KYC Policy\n\nBranch Operations shall evidence KYC exception closure.",
        }
    )
    case["anchors"].append(
        {
            "anchor_id": "policy-1",
            "document_id": "doc-policy",
            "file_id": "policy-file",
            "block_type": "paragraph",
            "text": "Branch Operations shall evidence KYC exception closure.",
            "section_path": ["KYC Policy"],
        }
    )
    case["chunks"].append(
        {
            "chunk_id": "c-policy",
            "document_id": "doc-policy",
            "file_id": "policy-file",
            "content": "Branch Operations shall evidence KYC exception closure.",
            "anchor_ids": ["policy-1"],
        }
    )
    return case


def _result(stage, parsed):
    return PromptRunResult(
        parsed=parsed,
        raw="{}",
        record={"stage": stage, "model": "FakeLLM", "validation_status": "valid", "attempts": 1},
    )


def test_full_pipeline_consumes_valid_llm_outputs_in_case_state():
    responses = {
        "full_document_extraction": FullDocumentExtractionResponse(
            sections=[{"anchor_id": "a1"}],
            process_steps=[{"step_id": "p1", "text": "Review users"}],
            requirements=[{"requirement_id": "req-llm", "text": "Review access quarterly.", "source_anchor_id": "a1"}],
            controls=[{"control_id": "ctrl-llm", "description": "Operations Risk reviews exceptions.", "source_anchor_id": "a1"}],
            risks=[{"risk_id": "risk-llm", "description": "Unauthorized access.", "source_anchor_id": "a1"}],
            evidence_items=[{"evidence_id": "ev-llm", "evidence_description": "Access review export.", "source_anchor_id": "a1"}],
            diagram_summary="Access review flow",
            steps=["Start review"],
        ),
        "case_sop_uplift_suggestions": SopSuggestionResponse(suggestions=[{"suggestion_id": "sug-llm", "type": "evidence_gap", "severity": "high", "anchor_id": "a1", "title": "Add evidence", "summary": "Name retained evidence.", "suggested_text": "Operations Risk shall retain the access review export.", "source_references": [{"anchor_id": "a1"}], "anchor_confidence": "high"}]),
        "case_chat_context_extraction": CaseChatContextExtractionResponse(captured_context=[{"type": "frequency", "value": "weekly", "confidence": "high"}], agent_follow_up_questions=[]),
        "corpus_map": CorpusMapResponse(primary_process="LLM Access Reviews", processes_identified=["Access reviews"], actors=["Operations Risk"], systems=["IAM"], coverage_gaps=[]),
        "case_finalization": CaseFinalizationResponse(
            missing_control_recommendations=[{"recommendation_id": "mc-1", "gap_summary": "No exception control", "suggested_sop_insert": "Operations Risk shall approve access exceptions before closure.", "severity": "medium", "anchor_id": "a1", "source_references": [{"risk_id": "risk-llm"}]}],
            duplicate_groups=[{"group_id": "dup-1", "suggestion_ids": ["sug_a1", "sug-llm"], "recommended_primary_suggestion_id": "sug-llm", "merge_rationale": "LLM suggestion is more specific."}],
            conflicting_suggestions=[],
            questions=[{"question_id": "q-llm", "question": "Who approves exceptions?", "priority": "high"}],
            diagram_model=SwimlaneDiagramModelResponse(title="LLM Swimlane", lanes=[{"lane_id": "risk", "name": "Operations Risk", "order": 1}], nodes=[{"node_id": "n1", "lane_id": "risk", "type": "control", "label": "Approve exceptions"}], edges=[], warnings=["repaired by test"]),
            final_summary=FinalSummaryResponse(executive_summary="LLM summary complete.", limitations=["Uploaded corpus only."]),
        ),
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
    assert updates["diagram_model"]["nodes"][0]["badge"] == "C1"
    assert updates["diagram_model"]["nodes"][0]["column"] == 0
    assert "repaired by test" in updates["diagram_model"]["warnings"]
    assert updates["final_summary"]["executive_summary"] == "LLM summary complete."
    assert {record["stage"] for record in updates["prompt_runs"]} >= set(responses)


def test_llm_unavailable_records_prompt_warning_instead_of_crashing():
    with patch("utils.sop_uplift.llm_orchestrator.get_llm", side_effect=EnvironmentError("OPENAI_API_KEY must be set")):
        result = run_json_prompt("case_sop_uplift_suggestions", "{}", SopSuggestionResponse)

    assert result.parsed is None
    assert result.record["model"] == "unavailable"
    assert result.record["validation_status"] == "invalid"
    assert "LLM unavailable" in result.record["error"]


def test_full_pipeline_does_not_use_rule_fallback_when_ai_suggestions_unusable():
    def fake_run(stage, _prompt, _schema):
        parsed = {
            "full_document_extraction": FullDocumentExtractionResponse(),
            "case_chat_context_extraction": CaseChatContextExtractionResponse(),
            "corpus_map": CorpusMapResponse(),
            "case_sop_uplift_suggestions": SopSuggestionResponse(),
            "case_finalization": CaseFinalizationResponse(
                diagram_model=SwimlaneDiagramModelResponse(
                    title="Access flow",
                    lanes=[{"lane_id": "owner", "name": "Owner", "order": 1}],
                    nodes=[{"node_id": "start", "lane_id": "owner", "type": "activity", "label": "Start"}],
                    edges=[],
                )
            ),
        }[stage]
        return _result(stage, parsed)

    case = _case()
    case["anchors"][0]["text"] = "Review the onboarding control evidence and submit the approval before onboarding proceeds."
    case["markdown_documents"][0]["markdown"] = "# Access\n\nReview the onboarding control evidence and submit the approval before onboarding proceeds."
    case["chunks"][0]["content"] = "Review the onboarding control evidence and submit the approval before onboarding proceeds."

    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        updates = run_full_sop_pipeline(case, use_llm=True)

    warnings = updates["processing_state"]["pipeline"]["warnings"]
    assert not any("rule fallback suggestions were used" in warning for warning in warnings)
    assert not any(item["created_from"] == "rule_fallback" for item in updates["suggestions"])


def test_full_pipeline_raises_check_llm_settings_when_llm_unavailable():
    unavailable = PromptRunResult(
        parsed=None,
        raw="",
        record={
            "stage": "full_document_extraction",
            "model": "unavailable",
            "validation_status": "invalid",
            "error": "LLM unavailable for full_document_extraction: OPENAI_API_KEY must be set",
            "attempts": 0,
            "errors": ["OPENAI_API_KEY must be set"],
        },
    )

    with patch("utils.sop_uplift.pipeline.run_json_prompt", return_value=unavailable):
        with pytest.raises(RuntimeError, match="Check LLM settings"):
            run_full_sop_pipeline(_case(), use_llm=True)


def test_full_document_extraction_repairs_requirement_text_aliases_and_flags_missing_text():
    parsed = FullDocumentExtractionResponse.model_validate(
        {
            "requirements": [
                {"requirement_id": "REQ-1", "requirement_text": "Review KYC exceptions before onboarding."},
                {"requirement_id": "REQ-2"},
            ]
        }
    )

    payload = parsed.model_dump()

    assert payload["requirements"][0]["text"] == "Review KYC exceptions before onboarding."
    assert payload["requirements"][1]["text"] == ""
    assert "missing" in payload["requirements"][1]["quality_warnings"][0].lower()


def test_suggestion_context_includes_style_reference_and_supporting_material():
    case = _case_with_supporting_context()
    context = build_suggestion_context(case, case["chunks"][0])

    assert context["case"]["process_name"] == "Client onboarding"
    assert context["sop_section"]["anchor_ids"] == ["sop-1"]
    assert context["style_reference"]["modal_style"] == "shall"
    assert "Relationship Manager" in context["style_reference"]["terms_to_preserve"]
    assert context["nearby_sop_context"]
    assert any(item["filename"] == "risk_controls.xlsx" for item in context["supporting_context"])
    assert context["extracted_case_map"]["controls"][0]["control_id"] == "C-12"


def test_diagram_context_includes_all_document_sources_for_prompt():
    case = _case_with_supporting_context()
    collected = {
        "sop_structures": [{"process_steps": [{"step_id": "s1", "text": "Review source of funds"}]}],
        "requirements": [{"requirement_id": "req-1", "text": "Review KYC before onboarding."}],
        "controls": [{"control_id": "C-12", "description": "Branch Operations validates NAAF completeness."}],
        "risks": [{"risk_id": "R-1", "description": "Incomplete KYC onboarding."}],
        "risk_events": [{"risk_event_id": "RE-1", "description": "Client onboarded without approval."}],
        "evidence_items": [{"evidence_id": "E-1", "evidence_description": "Signed NAAF approval workflow record"}],
        "issues_findings": [{"finding_id": "F-1", "description": "Missing approval evidence."}],
        "diagram_references": [{"diagram_id": "D-1", "description": "RM to Branch Operations approval flow."}],
        "case_context": [{"type": "owner", "value": "Branch Operations"}],
        "corpus_map": {"risk_to_control_map": [{"risk_id": "R-1", "control_id": "C-12"}]},
    }

    context = build_diagram_context(case, collected)

    assert context["case"]["process_name"] == "Client onboarding"
    assert context["sop_steps"][0]["text"] == "Review source of funds"
    assert context["controls"][0]["control_id"] == "C-12"
    assert context["risks"][0]["risk_id"] == "R-1"
    assert context["risk_events"][0]["risk_event_id"] == "RE-1"
    assert context["evidence_items"][0]["evidence_id"] == "E-1"
    assert context["diagram_references"][0]["diagram_id"] == "D-1"
    assert context["corpus_map"]["risk_to_control_map"][0]["control_id"] == "C-12"


def test_swimlane_prompt_is_tightened_for_shapes_badges_and_all_doc_context():
    prompt = build_prompt("swimlane_diagram_model", structured_data={"controls": [{"control_id": "C-12"}]})

    assert "effective updated SOP" in prompt
    assert "revised_sop_sections[].revised_text" in prompt
    assert "Supporting documents may enrich" in prompt
    assert "must not override the effective updated SOP" in prompt
    assert "Do not invent controls, risks, or evidence" in prompt
    assert "docs/sop-uplift/reference/swimlane-target-reference.png" in prompt
    assert "large zoom-friendly canvas" in prompt
    assert '"column"' in prompt
    assert '"shape"' in prompt
    assert '"badge"' in prompt
    assert "C1" in prompt
    assert "R1" in prompt
    assert "E1" in prompt
    assert "risk/control matrix" in prompt.lower()
    assert "evidence" in prompt.lower()
    assert "data_store" in prompt
    assert "control_summary" in prompt


def test_suggestion_prompts_require_sop_anchor_grounding_and_source_backed_language():
    prompt = build_prompt("case_sop_uplift_suggestions", suggestion_context={"supporting_facts": [{"fact": "Signed NAAF approval workflow record"}]})

    assert "only for SOP anchors" in prompt
    assert "testability checklist" in prompt
    assert "who performs the step" in prompt
    assert "what evidence is retained" in prompt
    assert "when or how often" in prompt
    assert "how exceptions are handled" in prompt
    assert "insert-ready SOP language" in prompt
    assert "source-backed correction" in prompt
    assert "must not start with" in prompt
    assert "max 12" in prompt
    assert "supporting_facts" in prompt


def test_suggestion_context_tolerates_legacy_string_extracted_items():
    case = _case_with_supporting_context()
    case["extracted_controls"] = ["Branch Operations validates NAAF completeness."]
    case["extracted_risks"] = [None, "Incomplete KYC onboarding."]
    case["evidence_items"] = [{"evidence_id": "E-1", "evidence_description": "Signed NAAF approval workflow record"}, 42]

    context = build_suggestion_context(case, case["chunks"][0])

    assert context["extracted_case_map"]["controls"][0]["text"] == "Branch Operations validates NAAF completeness."
    assert context["extracted_case_map"]["risks"][0]["text"] == "Incomplete KYC onboarding."
    assert context["extracted_case_map"]["evidence_items"][0]["evidence_id"] == "E-1"
    assert context["extracted_case_map"]["evidence_items"][1]["text"] == "42"


def test_case_suggestion_context_marks_sop_anchors_and_supporting_facts():
    case = _case_with_supporting_context()
    sop_only_units = [case["chunks"][0]]
    context = build_case_suggestion_context(case, sop_only_units, {"controls": [], "risks": [], "evidence_items": [], "requirements": [], "corpus_map": {}})

    assert "supporting_facts" in context
    assert context["eligible_sop_anchor_ids"] == ["sop-1", "sop-2"]
    assert any(item["filename"] == "risk_controls.xlsx" for item in context["supporting_context"])
    assert any("Signed NAAF approval workflow record" in str(fact) for fact in context["supporting_facts"])


def test_full_pipeline_feeds_structured_suggestion_context_and_style_to_llm():
    prompts: dict[str, str] = {}

    def fake_run(stage, prompt, _schema):
      prompts[stage] = prompt
      if stage == "case_sop_uplift_suggestions":
          parsed = SopSuggestionResponse(suggestions=[{
              "suggestion_id": "sug-tone",
              "type": "evidence_gap",
              "severity": "medium",
              "anchor_id": "sop-1",
              "title": "Add retained evidence",
              "summary": "Add the named evidence artifact to the SOP step.",
              "suggested_text": "Relationship Manager shall retain the signed NAAF approval workflow record in the onboarding case file.",
              "style_match_notes": "Preserves the SOP's shall-based procedural tone and KYC terminology.",
              "source_references": [{"anchor_id": "rcm-1", "filename": "risk_controls.xlsx"}],
              "anchor_confidence": "high",
          }])
      elif stage == "full_document_extraction":
          parsed = FullDocumentExtractionResponse()
      elif stage == "case_chat_context_extraction":
          parsed = CaseChatContextExtractionResponse()
      elif stage == "corpus_map":
          parsed = CorpusMapResponse()
      elif stage == "case_finalization":
          parsed = CaseFinalizationResponse()
      else:
          parsed = FinalSummaryResponse()
      return _result(stage, parsed)

    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        updates = run_full_sop_pipeline(_case_with_supporting_context(), use_llm=True)

    suggestion_prompt = prompts["case_sop_uplift_suggestions"]
    assert '"style_reference"' in suggestion_prompt
    assert '"sop_anchors"' in suggestion_prompt
    assert '"supporting_context"' in suggestion_prompt
    assert "Signed NAAF approval workflow record" in suggestion_prompt
    assert updates["suggestions"][0]["created_from"] == "llm"
    assert updates["suggestions"][0]["style_match_notes"].startswith("Preserves")


def test_full_pipeline_runs_deep_document_analysis_only_for_sop_and_policy_documents():
    calls: list[str] = []
    prompts: list[str] = []

    def fake_run(stage, prompt, _schema):
        calls.append(stage)
        if stage == "full_document_extraction":
            prompts.append(prompt)
            parsed = FullDocumentExtractionResponse()
        elif stage == "case_sop_uplift_suggestions":
            parsed = SopSuggestionResponse()
        elif stage == "case_chat_context_extraction":
            parsed = CaseChatContextExtractionResponse()
        elif stage == "corpus_map":
            parsed = CorpusMapResponse()
        elif stage == "case_finalization":
            parsed = CaseFinalizationResponse()
        else:
            parsed = FinalSummaryResponse()
        return _result(stage, parsed)

    case = _case_with_supporting_context()
    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        run_full_sop_pipeline(case, use_llm=True)

    assert calls.count("full_document_extraction") == 1
    assert "risk_controls.xlsx" not in prompts[0]
    assert calls.count("case_sop_uplift_suggestions") == 1
    assert calls.count("case_finalization") == 1
    assert "missing_control_recommendations" not in calls
    assert "duplicate_conflict_merge" not in calls
    assert "agent_follow_up_questions" not in calls
    assert "swimlane_diagram_model" not in calls
    assert "final_summary_change_log" not in calls
    assert "sop_structure_extraction" not in calls
    assert "policy_requirement_extraction" not in calls
    assert "sop_uplift_suggestions" not in calls


def test_full_pipeline_skips_deep_document_analysis_when_no_sop_or_policy_is_tagged():
    calls: list[str] = []

    def fake_run(stage, _prompt, _schema):
        calls.append(stage)
        if stage == "case_sop_uplift_suggestions":
            parsed = SopSuggestionResponse()
        elif stage == "case_chat_context_extraction":
            parsed = CaseChatContextExtractionResponse()
        elif stage == "corpus_map":
            parsed = CorpusMapResponse()
        elif stage == "case_finalization":
            parsed = CaseFinalizationResponse()
        else:
            parsed = FullDocumentExtractionResponse()
        return _result(stage, parsed)

    case = _case_with_supporting_context()
    case["document_tags"] = [{"file_id": "rcm-file", "confirmed_tag": "risk_control_matrix", "confidence": "high"}]
    case["markdown_documents"] = [case["markdown_documents"][1]]
    case["anchors"] = [case["anchors"][2]]
    case["chunks"] = [case["chunks"][1]]

    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        updates = run_full_sop_pipeline(case, use_llm=True)

    assert "full_document_extraction" not in calls
    assert any("no SOP or policy documents are tagged" in warning for warning in updates["processing_state"]["pipeline"]["warnings"])


def test_full_pipeline_runs_document_analysis_concurrently():
    active = 0
    max_active = 0
    lock = threading.Lock()

    def fake_run(stage, _prompt, _schema):
        nonlocal active, max_active
        if stage == "full_document_extraction":
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.05)
            with lock:
                active -= 1
            return _result(stage, FullDocumentExtractionResponse())
        if stage == "case_sop_uplift_suggestions":
            parsed = SopSuggestionResponse()
        elif stage == "case_chat_context_extraction":
            parsed = CaseChatContextExtractionResponse()
        elif stage == "corpus_map":
            parsed = CorpusMapResponse()
        elif stage == "case_finalization":
            parsed = CaseFinalizationResponse()
        else:
            parsed = FinalSummaryResponse()
        return _result(stage, parsed)

    with patch.dict("os.environ", {"SOP_UPLIFT_DOCUMENT_LLM_WORKERS": "2"}):
        with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
            run_full_sop_pipeline(_case_with_two_sop_documents(), use_llm=True)

    assert max_active == 2


def test_full_document_prompt_anchor_budget_omits_body_duplicates_and_respects_limits():
    prompts: list[str] = []
    duplicate_anchor_text = "DUPLICATE_ANCHOR_TEXT already appears in the capped body."
    unique_anchor_text = "UNIQUE_ANCHOR_TEXT_LONG_VALUE names an external evidence artifact for review."
    overflow_anchor_text = "OVERFLOW_ANCHOR_TEXT should not fit once the anchor text budget is exhausted."
    body = f"# Access\n\n{duplicate_anchor_text}\n\nShort body text."

    def fake_run(stage, prompt, _schema):
        if stage == "full_document_extraction":
            prompts.append(prompt)
            parsed = FullDocumentExtractionResponse()
        elif stage == "case_sop_uplift_suggestions":
            parsed = SopSuggestionResponse()
        elif stage == "case_chat_context_extraction":
            parsed = CaseChatContextExtractionResponse()
        elif stage == "corpus_map":
            parsed = CorpusMapResponse()
        elif stage == "case_finalization":
            parsed = CaseFinalizationResponse()
        else:
            parsed = FinalSummaryResponse()
        return _result(stage, parsed)

    case = _case()
    case["markdown_documents"][0]["markdown"] = body
    case["chunks"][0]["content"] = body
    case["anchors"] = [
        {"anchor_id": "dup", "document_id": "doc-1", "file_id": "file-1", "block_type": "paragraph", "text": duplicate_anchor_text, "section_path": ["Access"]},
        {"anchor_id": "unique", "document_id": "doc-1", "file_id": "file-1", "block_type": "paragraph", "text": unique_anchor_text, "section_path": ["Access"]},
        {"anchor_id": "overflow", "document_id": "doc-1", "file_id": "file-1", "block_type": "paragraph", "text": overflow_anchor_text, "section_path": ["Access"]},
    ]

    env = {
        "SOP_UPLIFT_MAX_ANCHORS_PER_PROMPT": "2",
        "SOP_UPLIFT_ANCHOR_EXCERPT_CHARS": "24",
        "SOP_UPLIFT_ANCHOR_TEXT_BUDGET_CHARS": "30",
    }
    with patch.dict("os.environ", env):
        with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
            run_full_sop_pipeline(case, use_llm=True, max_chunk_chars=4000)

    assert len(prompts) == 1
    assert prompts[0].count(duplicate_anchor_text) == 1
    assert '"anchor_id": "dup"' in prompts[0]
    assert '"section_path": [' in prompts[0]
    assert "UNIQUE_ANCHOR_TEXT_LONG" in prompts[0]
    assert "artifact for review" not in prompts[0]
    assert '"anchor_id": "overflow"' not in prompts[0]


def test_full_pipeline_caps_full_document_prompt_to_max_chunk_chars():
    prompts: list[str] = []
    marker = "TAIL_MARKER_SHOULD_NOT_BE_SENT"
    long_markdown = "# Access\n\n" + ("Owner reviews access before closure.\n" * 20) + marker

    def fake_run(stage, prompt, _schema):
        if stage == "full_document_extraction":
            prompts.append(prompt)
            parsed = FullDocumentExtractionResponse()
        elif stage == "case_sop_uplift_suggestions":
            parsed = SopSuggestionResponse()
        elif stage == "case_chat_context_extraction":
            parsed = CaseChatContextExtractionResponse()
        elif stage == "corpus_map":
            parsed = CorpusMapResponse()
        elif stage == "case_finalization":
            parsed = CaseFinalizationResponse()
        else:
            parsed = FinalSummaryResponse()
        return _result(stage, parsed)

    case = _case()
    case["markdown_documents"][0]["markdown"] = long_markdown
    case["chunks"][0]["content"] = long_markdown

    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        updates = run_full_sop_pipeline(case, use_llm=True, max_chunk_chars=120)

    assert len(prompts) == 1
    assert marker not in prompts[0]
    assert "Chunk truncated to 120 characters before prompt injection." in updates["processing_state"]["pipeline"]["warnings"]


def test_full_pipeline_uses_supporting_raci_context_for_rule_based_suggestions():
    case = {
        "case_id": "case-1",
        "title": "KYC SOP",
        "process_name": "KYC",
        "document_tags": [
            {"file_id": "sop-file", "confirmed_tag": "sop", "confidence": "high"},
            {"file_id": "raci-file", "confirmed_tag": "risk_control_matrix", "confidence": "high"},
        ],
        "markdown_documents": [
            {"document_id": "doc-sop", "file_id": "sop-file", "filename": "kyc.md", "markdown": "# KYC\n\nReview source of funds before onboarding clients."},
            {"document_id": "doc-raci", "file_id": "raci-file", "filename": "raci.xlsx", "markdown": "# RACI\n\nResponsible - Relationship Manager; Accountable - Branch Operations."},
        ],
        "anchors": [
            {
                "anchor_id": "sop-1",
                "document_id": "doc-sop",
                "file_id": "sop-file",
                "block_type": "paragraph",
                "text": "Review source of funds before onboarding clients.",
                "section_path": ["KYC"],
            },
            {
                "anchor_id": "raci-1",
                "document_id": "doc-raci",
                "file_id": "raci-file",
                "block_type": "paragraph",
                "text": "RACI matrix: Responsible - Relationship Manager; Accountable - Branch Operations.",
                "section_path": ["RACI"],
            },
        ],
        "chunks": [
            {"chunk_id": "c-sop", "document_id": "doc-sop", "file_id": "sop-file", "content": "Review source of funds before onboarding clients.", "anchor_ids": ["sop-1"]},
            {"chunk_id": "c-raci", "document_id": "doc-raci", "file_id": "raci-file", "content": "RACI matrix: Responsible - Relationship Manager; Accountable - Branch Operations.", "anchor_ids": ["raci-1"]},
        ],
        "suggestions": [],
        "case_chat": [],
        "processing_state": {},
    }

    updates = run_full_sop_pipeline(case, use_llm=False)

    assert updates["suggestions"]
    assert updates["suggestions"][0]["type"] == "ownership_gap"
    assert updates["suggestions"][0]["anchor_id"] == "sop-1"
    assert "Relationship Manager shall" in updates["suggestions"][0]["suggested_text"]


def test_full_pipeline_skips_llm_requirements_missing_text_with_concise_warning():
    prompts: dict[str, str] = {}

    def fake_run(stage, prompt, _schema):
        prompts[stage] = prompt
        if stage == "full_document_extraction":
            parsed = FullDocumentExtractionResponse.model_validate(
                {
                    "requirements": [
                        {"requirement_id": "REQ-1"},
                        {"requirement_id": "REQ-2", "text": "Review onboarding exceptions weekly."},
                    ]
                }
            )
        elif stage == "case_sop_uplift_suggestions":
            parsed = SopSuggestionResponse(suggestions=[])
        elif stage == "case_finalization":
            parsed = CaseFinalizationResponse()
        else:
            parsed = _result(stage, None).parsed
        return _result(stage, parsed)

    with patch("utils.sop_uplift.pipeline.run_json_prompt", side_effect=fake_run):
        updates = run_full_sop_pipeline(_case(), use_llm=True)

    assert [item["requirement_id"] for item in updates["extracted_requirements"]] == ["REQ-2"]
    warnings = updates["processing_state"]["pipeline"]["warnings"]
    assert any("Skipped 1 extracted requirement without text" in warning for warning in warnings)
    assert not any("Field required" in warning for warning in warnings)

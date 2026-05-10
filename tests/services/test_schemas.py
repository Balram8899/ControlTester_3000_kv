from __future__ import annotations

import importlib
from types import ModuleType
from typing import get_args

import pytest


def load_schemas() -> ModuleType:
    try:
        return importlib.import_module("utils.services.schemas")
    except ModuleNotFoundError as exc:
        pytest.fail(f"utils.services.schemas is missing: {exc}")


def test_document_identity_literals_match_the_plan() -> None:
    schemas = load_schemas()

    assert set(get_args(schemas.DocumentTag)) == {
        "rcm",
        "policy",
        "procedure",
        "process_doc",
        "risk_data",
        "evidence",
    }
    assert set(get_args(schemas.FileType)) == {
        "docx",
        "pdf",
        "xlsx",
        "txt",
        "unknown",
    }
    assert set(get_args(schemas.PipelineStatus)) == {
        "success",
        "partial",
        "failed",
        "budget_exceeded",
    }
    assert set(get_args(schemas.DocumentStatus)) == {
        "success",
        "partial",
        "failed",
        "skipped",
    }


def test_conversion_and_chunk_results_keep_failure_defaults_empty() -> None:
    schemas = load_schemas()

    style = schemas.StyleProfile()
    failed_conversion = schemas.ConversionResult(
        status="failed",
        error="conversion failed",
    )
    chunk_result = schemas.ChunkResult(status="success")

    assert style.heading1_font is None
    assert failed_conversion.file_id is None
    assert failed_conversion.markdown == ""
    assert failed_conversion.page_count == 0
    assert failed_conversion.looks_corrupt is False
    assert chunk_result.anchors == []
    assert chunk_result.chunks == []


def test_llm_and_cost_models_store_call_records() -> None:
    schemas = load_schemas()

    record = schemas.LLMCallRecord(
        call_id="call-1",
        pipeline_id="pipe-1",
        schema_name="schema_detection",
        prompt_chars=120,
        input_tokens=30,
        output_tokens=12,
        duration_ms=250,
        timestamp="2026-05-06T13:00:00Z",
        status="success",
    )
    llm_result = schemas.LLMResult(
        status="success",
        call_id="call-1",
        output={"ok": True},
        input_tokens=30,
        output_tokens=12,
        duration_ms=250,
        call_record=record,
    )
    cost = schemas.CostSummary(
        provider="ollama",
        model="llama3:8b",
        call_count=1,
        input_tokens=30,
        output_tokens=12,
        total_tokens=42,
        estimated_cost_usd=0.0,
        is_local_provider=True,
        call_records=[record],
    )

    assert llm_result.call_record == record
    assert cost.call_records[0].schema_name == "schema_detection"
    assert cost.total_tokens == 42


def test_excel_pipeline_result_carries_sheet_gaps_and_corpus_map() -> None:
    schemas = load_schemas()

    column = schemas.ColumnClassification(
        column_name="Owner",
        column_index=3,
        classified_as="owner",
        confidence=0.93,
    )
    gap = schemas.RowGap(
        row_index=7,
        missing_columns=["Owner"],
        gap_type="ownership_gap",
    )
    sheet = schemas.SheetResult(
        sheet_name="RCM",
        row_count=10,
        schema=[column],
        gaps=[gap],
        records=[{"control_id": "C-1"}],
    )
    corpus = schemas.CorpusMapContribution(
        risk_to_control_map=[{"risk_id": "R-1", "control_id": "C-1"}],
        sop_to_control_map=[],
        evidence_to_control_map=[],
    )
    result = schemas.ExcelPipelineResult(
        status="partial",
        file_id="file-1",
        sheets=[sheet],
        total_rows_assessed=10,
        total_gaps_found=1,
        corpus_map=corpus,
    )

    assert result.sheets[0].status == "complete"
    assert result.sheets[0].gaps[0].gap_type == "ownership_gap"
    assert result.corpus_map.risk_to_control_map[0]["control_id"] == "C-1"
    assert result.suggestions == []


def test_suggestions_and_analysis_result_start_pending() -> None:
    schemas = load_schemas()

    source = schemas.SourceReference(document_id="doc-1", anchor_id="anchor-1")
    target = schemas.SuggestionEditTarget(
        target_id="sug-1:procedure",
        target_type="procedure_step",
        title="Procedure update",
        proposed_text="The owner reviews the activity monthly.",
        target_anchor_id="anchor-1",
        target_text="The owner performs the activity.",
        source_references=[source],
    )
    extracted = schemas.ExtractedItem(
        item_id="item-1",
        item_type="control",
        text="Access reviews are performed quarterly.",
        source_references=[source],
    )
    suggestion = schemas.Suggestion(
        suggestion_id="sug-1",
        suggestion_type="ownership_clarification",
        severity="medium",
        title="Clarify owner",
        detail="The procedure does not identify the accountable owner.",
        source_references=[source],
        edit_targets=[target],
    )
    result = schemas.AnalysisResult(
        status="partial",
        case_id="case-1",
        extracted_controls=[extracted],
        suggestions=[suggestion],
        llm_calls_used=3,
    )

    assert suggestion.review_status == "pending"
    assert suggestion.queue_finding is False
    assert suggestion.edit_targets[0].target_type == "procedure_step"
    assert suggestion.edit_targets[0].target_text == "The owner performs the activity."
    assert result.extracted_controls[0].source_references[0].anchor_id == "anchor-1"
    assert result.llm_calls_used == 3


def test_domain_agnostic_fact_and_finding_models() -> None:
    schemas = load_schemas()

    source = schemas.SourceReference(
        document_id="doc-1",
        filename="ops.xlsx",
        document_role="risk_issue_event_log",
        sheet_name="Issues",
        row_index=12,
        column_name="Processor",
    )
    fact = schemas.DocumentFact(
        fact_id="fact-1",
        case_id="case-1",
        file_id="doc-1",
        source_ref=source,
        document_role="risk_issue_event_log",
        domain_contexts=["unknown_general"],
        entity_type="activity",
        entity_name="Client review",
        attributes={"owner": ""},
        raw_attributes={"Processor": ""},
        confidence=0.91,
    )
    finding = schemas.NormalizedFinding(
        finding_id="finding-1",
        pattern="missing_owner",
        pattern_bucket="ownership_authorization",
        detection_method="deterministic_field",
        severity="medium",
        confidence=0.91,
        summary="Activity has no accountable owner.",
        rationale="The Processor field is blank.",
        target_anchor_id="sop-a1",
        normalized_entity_name="Client review",
        source_references=[source],
        related_fact_ids=[fact.fact_id],
        suggested_change="Identify the accountable owner for Client review.",
        thresholds_used={"confidence_high": 0.8},
    )

    assert fact.entity_type == "activity"
    assert fact.raw_attributes["Processor"] == ""
    assert finding.confidence == 0.91
    assert finding.target_anchor_id == "sop-a1"
    assert finding.source_references[0].filename == "ops.xlsx"


def test_discovery_candidate_and_corpus_map_extensions_are_optional() -> None:
    schemas = load_schemas()

    source = schemas.SourceReference(document_id="doc-1", anchor_id="a1")
    candidate = schemas.DiscoveryCandidate(
        discovered_pattern="unusual backlog handoff",
        summary="Backlog handoff may be ambiguous.",
        rationale="Raw notes mention a handoff but no target owner.",
        source_references=[source],
        confidence=0.41,
        severity="informational",
        should_be_suggestion=False,
        follow_up_question="Who owns the backlog after triage?",
    )
    corpus = schemas.CorpusMapContribution(
        risk_to_control_map=[],
        sop_to_control_map=[],
        evidence_to_control_map=[],
    )
    suggestion = schemas.Suggestion(
        suggestion_id="sug-critical",
        suggestion_type="process_improvement",
        severity="critical",
        title="Critical recovery gap",
        detail="The recovery step is missing.",
        source_references=[source],
    )

    assert candidate.follow_up_question == "Who owns the backlog after triage?"
    assert corpus.general_relationships == []
    assert corpus.finding_summary == {}
    assert suggestion.severity == "critical"


def test_output_generation_result_accepts_swimlane_spec() -> None:
    schemas = load_schemas()

    lane = schemas.SwimlaneLane(
        lane_id="requestor",
        label="Requestor",
        colour_hex="#005EB8",
    )
    step = schemas.SwimlaneStep(
        step_id="start",
        lane_id="requestor",
        label="Submit request",
        step_type="start",
        next_steps=["approve"],
    )
    spec = schemas.SwimlaneSpec(title="Access Request", lanes=[lane], steps=[step])
    result = schemas.OutputGenerationResult(
        status="success",
        case_id="case-1",
        docx_file_id="docx-1",
        sections_rewritten=2,
        swimlane_spec=spec,
        warnings=["Standalone output used for PDF source."],
    )

    assert result.swimlane_spec.title == "Access Request"
    assert result.swimlane_spec.steps[0].next_steps == ["approve"]
    assert result.warnings == ["Standalone output used for PDF source."]


def test_document_uplift_case_defaults_are_independent() -> None:
    schemas = load_schemas()

    case_a = schemas.DocumentUpliftCase(case_id="case-a", title="Case A")
    case_b = schemas.DocumentUpliftCase(case_id="case-b", title="Case B")
    case_a.document_tags.append(
        schemas.DocumentTagEntry(
            file_id="file-1",
            filename="procedure.docx",
            tag="procedure",
        )
    )
    case_a.processing_state.warnings.append("warning-a")

    assert case_a.status.stage == "uploading"
    assert case_a.schema_version == 2
    assert case_a.processing_state.pipeline_status == "success"
    assert case_a.readiness.ready is False
    assert case_b.document_tags == []
    assert case_b.processing_state.warnings == []

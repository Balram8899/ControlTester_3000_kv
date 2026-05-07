from __future__ import annotations

import importlib
from types import ModuleType
from typing import Any

import pytest

from utils.services.schemas import (
    Anchor,
    CorpusMapContribution,
    ChunkResult,
    ConversionResult,
    ExcelPipelineResult,
    LLMResult,
)


def load_analysis() -> ModuleType:
    try:
        return importlib.import_module("utils.services.analysis")
    except ModuleNotFoundError as exc:
        pytest.fail(f"utils.services.analysis is missing: {exc}")


def test_analyze_documents_skeleton_returns_empty_success() -> None:
    analysis = load_analysis()

    result = analysis.analyze_documents(
        conversions=[],
        chunk_results={},
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=1,
    )

    assert result.status == "success"
    assert result.extracted_controls == []
    assert result.suggestions == []
    assert result.llm_calls_used == 0


def test_analyze_documents_budget_exhausted_returns_partial() -> None:
    analysis = load_analysis()

    result = analysis.analyze_documents(
        conversions=[],
        chunk_results={},
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=0,
    )

    assert result.status == "partial"
    assert result.error == "LLM call budget exhausted"
    assert result.llm_calls_used == 0


def make_conversion(file_id: str, file_type: str = "docx") -> ConversionResult:
    return ConversionResult(
        status="success",
        file_id=file_id,
        filename=f"{file_id}.{file_type}",
        file_type=file_type,
        tag="procedure",
        markdown="converted markdown",
        page_count=3,
    )


def make_anchor(
    anchor_id: str,
    file_id: str,
    heading: str,
    content: str,
) -> Anchor:
    return Anchor(
        anchor_id=anchor_id,
        file_id=file_id,
        section_path=heading,
        heading=heading,
        content=content,
        char_count=len(content),
        page_estimate=1,
    )


def make_chunk_result(file_id: str, anchors: list[Anchor]) -> ChunkResult:
    return ChunkResult(status="success", file_id=file_id, anchors=anchors, chunks=[])


def test_section_classification_called_per_document(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()
    calls: list[str] = []

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        calls.append(schema_name)
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "a1", "section_type": "procedural"}]},
            )
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1"), make_conversion("doc-2", "pdf")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [make_anchor("a1", "doc-1", "Procedure", "Operations performs the review.")],
            ),
            "doc-2": make_chunk_result(
                "doc-2",
                [make_anchor("a1", "doc-2", "Procedure", "Finance approves the review.")],
            ),
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert calls.count("section_classification") == 2


def test_terminology_injected_into_procedural_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()
    procedural_prompts: list[str] = []

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "defs", "section_type": "definitions"},
                        {"anchor_id": "proc", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "terminology_extraction":
            return LLMResult(
                status="success",
                output={
                    "terms": [
                        {
                            "term": "QAR",
                            "definition": "Quarterly access review",
                        }
                    ]
                },
            )
        procedural_prompts.append(prompt)
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [
                    make_anchor("defs", "doc-1", "Definitions", "QAR means quarterly access review."),
                    make_anchor("proc", "doc-1", "Procedure", "The Control Owner performs the QAR."),
                ],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert result.terminology == [{"term": "QAR", "definition": "Quarterly access review"}]
    assert procedural_prompts
    assert "QAR: Quarterly access review" in procedural_prompts[0]


def test_staleness_flag_generated_for_old_review_date(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()
    calls: list[str] = []

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        calls.append(schema_name)
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "hist", "section_type": "document_history"}]},
            )
        return LLMResult(
            status="success",
            output={
                "last_review_date": "2024-01-15",
                "version": "1.0",
                "approved_by": "Process Owner",
                "next_review_date": None,
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)
    monkeypatch.setattr(analysis, "_today_iso", lambda: "2026-05-06")

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [make_anchor("hist", "doc-1", "Document History", "Last reviewed on 2024-01-15.")],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert calls == ["section_classification", "document_metadata"]
    assert [suggestion.suggestion_type for suggestion in result.suggestions] == ["staleness_flag"]
    assert result.suggestions[0].review_status == "pending"


def test_batch_size_respects_provider_context_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()
    procedural_prompts: list[str] = []

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "p1", "section_type": "procedural"},
                        {"anchor_id": "p2", "section_type": "procedural"},
                        {"anchor_id": "p3", "section_type": "procedural"},
                    ]
                },
            )
        procedural_prompts.append(prompt)
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)
    monkeypatch.setattr(analysis, "get_batch_size_chars", lambda: 90)

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [
                    make_anchor("p1", "doc-1", "Step 1", "A" * 80),
                    make_anchor("p2", "doc-1", "Step 2", "B" * 80),
                    make_anchor("p3", "doc-1", "Step 3", "C" * 80),
                ],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert len(procedural_prompts) == 3


def test_cross_synthesis_skipped_when_corpus_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()
    calls: list[str] = []

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        calls.append(schema_name)
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "p1", "section_type": "procedural"}]},
            )
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Control Owner",
                        "action": "performs review",
                        "anchor_id": "p1",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [make_anchor("p1", "doc-1", "Procedure", "The Control Owner performs the review.")],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert "cross_document_synthesis" not in calls


def test_cross_document_owner_conflict_fallback_references_sop_and_matrix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "p1", "section_type": "procedural"}]},
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Relationship Manager",
                        "action": "performs the suitability review before account opening",
                        "evidence": "suitability review checklist",
                        "control_id": "C-04",
                        "anchor_id": "p1",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("sop-1")],
        chunk_results={
            "sop-1": make_chunk_result(
                "sop-1",
                [make_anchor("p1", "sop-1", "Procedure", "The Relationship Manager performs the review.")],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="rcm-1",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-04",
                            "control_id": "C-04",
                            "owner": "Compliance Officer",
                            "description": "Suitability review is completed before account opening.",
                            "file_id": "rcm-1",
                            "sheet": "RCM",
                            "row": 7,
                        }
                    ],
                    sop_to_control_map=[],
                    evidence_to_control_map=[],
                ),
            )
        ],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    conflict = next(
        suggestion
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "ownership_conflict"
    )
    assert conflict.severity == "high"
    assert {ref.document_id for ref in conflict.source_references} == {"sop-1", "rcm-1"}
    assert conflict.source_references[1].sheet_name == "RCM"
    assert conflict.source_references[1].row_index == 7


def test_cross_document_mapping_gap_fallback_references_primary_sop_and_matrix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "sop-anchor", "section_type": "procedural"}]},
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Branch Operations",
                        "action": "reviews the NAAF for completeness",
                        "evidence": "NAAF completeness flag",
                        "control_id": "C-01",
                        "anchor_id": "sop-anchor",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("sop-1")],
        chunk_results={
            "sop-1": make_chunk_result(
                "sop-1",
                [make_anchor("sop-anchor", "sop-1", "Procedure", "Branch Operations reviews the NAAF.")],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="rcm-1",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-01",
                            "control_id": "C-01",
                            "owner": "Branch Operations",
                            "description": "NAAF completeness review.",
                            "file_id": "rcm-1",
                            "sheet": "RCM",
                            "row": 3,
                        },
                        {
                            "risk_id": "R-09",
                            "control_id": "C-09",
                            "owner": "Investment Advisor / RM",
                            "description": "Periodic KYC refresh is completed by risk rating.",
                            "file_id": "rcm-1",
                            "sheet": "RCM",
                            "row": 11,
                        },
                    ],
                    sop_to_control_map=[],
                    evidence_to_control_map=[],
                ),
            )
        ],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    gap = next(
        suggestion
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "mapping_gap"
    )
    assert "C-09" in gap.title
    assert {ref.document_id for ref in gap.source_references} == {"sop-1", "rcm-1"}
    assert gap.source_references[1].sheet_name == "RCM"
    assert gap.source_references[1].row_index == 11


def test_all_suggestions_start_as_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "p1", "section_type": "procedural"}]},
            )
        return LLMResult(
            status="success",
            output={
                "process_steps": [],
                "suggestions": [
                    {
                        "suggestion_type": "evidence_requirement",
                        "severity": "high",
                        "title": "Name retained evidence",
                        "detail": "The SOP does not name the retained artefact.",
                        "proposed_text": "The Control Owner shall retain the access review export.",
                        "anchor_id": "p1",
                    }
                ],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [make_anchor("p1", "doc-1", "Procedure", "The Control Owner performs the review.")],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert len(result.suggestions) == 1
    assert result.suggestions[0].review_status == "pending"


def test_llm_suggestion_severity_preserves_full_vocabulary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "p1", "section_type": "procedural"}]},
            )
        return LLMResult(
            status="success",
            output={
                "process_steps": [],
                "suggestions": [
                    {
                        "suggestion_type": "critical_gap",
                        "severity": "critical",
                        "title": "Define approval authority",
                        "detail": "The procedure does not define approval authority for a material decision.",
                        "anchor_id": "p1",
                    },
                    {
                        "suggestion_type": "context_note",
                        "severity": "informational",
                        "title": "Confirm glossary term",
                        "detail": "A local abbreviation may need user confirmation.",
                        "anchor_id": "p1",
                    },
                ],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("doc-1")],
        chunk_results={
            "doc-1": make_chunk_result(
                "doc-1",
                [make_anchor("p1", "doc-1", "Procedure", "The Control Owner performs the review.")],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert [suggestion.severity for suggestion in result.suggestions] == [
        "critical",
        "informational",
    ]

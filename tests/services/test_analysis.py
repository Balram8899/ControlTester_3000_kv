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
    section_type: str = "unknown",
) -> Anchor:
    return Anchor(
        anchor_id=anchor_id,
        file_id=file_id,
        section_path=heading,
        heading=heading,
        content=content,
        char_count=len(content),
        page_estimate=1,
        section_type=section_type,  # type: ignore[arg-type]
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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "sop-anchor", "section_type": "procedural"},
                        {"anchor_id": "roles-anchor", "section_type": "unknown"},
                    ]
                },
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
                [
                    make_anchor(
                        "roles-anchor",
                        "sop-1",
                        "Roles and Responsibilities",
                        "Branch Operations reviews account setup completeness.",
                    ),
                    make_anchor(
                        "sop-anchor",
                        "sop-1",
                        "Procedure",
                        "Branch Operations reviews the NAAF.",
                    ),
                ],
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
    assert [target.target_type for target in gap.edit_targets] == [
        "procedure_step",
        "role_responsibility",
    ]
    assert all("for control C-09" not in target.proposed_text for target in gap.edit_targets)
    assert gap.edit_targets[0].target_anchor_id == "sop-anchor"
    assert gap.edit_targets[0].target_text == "Branch Operations reviews the NAAF."
    assert gap.edit_targets[1].target_anchor_id == "roles-anchor"
    assert "Investment Advisor / RM" in gap.edit_targets[1].proposed_text
    assert {ref.document_id for ref in gap.source_references} == {"sop-1", "rcm-1"}
    assert gap.source_references[1].sheet_name == "RCM"
    assert gap.source_references[1].row_index == 11


def test_mapping_gap_relevance_filter_rejects_out_of_scope_controls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "scope", "section_type": "purpose_scope"},
                        {"anchor_id": "procedure", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "SOC Analyst",
                        "action": "triages cyber incidents and coordinates containment",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("cyber-sop")],
        chunk_results={
            "cyber-sop": make_chunk_result(
                "cyber-sop",
                [
                    make_anchor(
                        "scope",
                        "cyber-sop",
                        "Purpose and Scope",
                        "This SOP describes how teams detect, assess, contain, eradicate, recover from, and preserve forensic evidence for cyber security incidents affecting compromised systems and exploited vulnerabilities.",
                    ),
                    make_anchor(
                        "procedure",
                        "cyber-sop",
                        "Incident Response Procedure",
                        "The SOC Analyst triages cyber incidents and coordinates containment.",
                    ),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="org-rcm",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-SWIFT",
                            "control_id": "C-SWIFT",
                            "owner": "Treasury IT",
                            "description": "SWIFT Customer Security Programme controls and dual-operator authorisation for outgoing SWIFT messages.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 2,
                        },
                        {
                            "risk_id": "R-PATCH",
                            "control_id": "C-PATCH",
                            "owner": "IT Operations",
                            "description": "Emergency patching for exploited vulnerabilities with CVSS score of 9.0 or higher is completed within 72 hours.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 3,
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

    mapping_titles = [
        suggestion.title
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "mapping_gap"
    ]
    assert any("C-PATCH" in title for title in mapping_titles)
    assert all("C-SWIFT" not in title for title in mapping_titles)


def test_mapping_gap_relevance_uses_responsibility_terms_not_broad_asset_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "purpose", "section_type": "purpose_scope"},
                        {"anchor_id": "scope", "section_type": "purpose_scope"},
                        {"anchor_id": "eradication", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "SOC Analyst",
                        "action": "contains confirmed incidents",
                        "anchor_id": "eradication",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("cyber-sop")],
        chunk_results={
            "cyber-sop": make_chunk_result(
                "cyber-sop",
                [
                    make_anchor(
                        "purpose",
                        "cyber-sop",
                        "Purpose",
                        "This SOP defines the process for detecting, responding to, and recovering from cybersecurity incidents.",
                    ),
                    make_anchor(
                        "scope",
                        "cyber-sop",
                        "Scope",
                        "This SOP applies to incidents affecting the bank's information systems, networks, applications, data, employees, contractors, vendors, and customers.",
                    ),
                    make_anchor(
                        "eradication",
                        "cyber-sop",
                        "Eradication",
                        "The team removes malware, resets compromised credentials, and applies security patches to address exploited vulnerabilities.",
                    ),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="org-rcm",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-DLP",
                            "control_id": "C-DLP",
                            "owner": "Data Security",
                            "description": "Data Loss Prevention solution deployed on email and web gateways.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 2,
                        },
                        {
                            "risk_id": "R-SWIFT",
                            "control_id": "C-SWIFT",
                            "owner": "Treasury IT",
                            "description": "SWIFT Customer Security Programme controls and dual-operator authorisation for outgoing SWIFT messages.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 3,
                        },
                        {
                            "risk_id": "R-PATCH",
                            "control_id": "C-PATCH",
                            "owner": "IT Operations",
                            "description": "Emergency patching for exploited vulnerabilities with CVSS score of 9.0 or higher is completed within 72 hours.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 4,
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

    mapping_titles = [
        suggestion.title
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "mapping_gap"
    ]
    assert any("C-PATCH" in title for title in mapping_titles)
    assert all("C-DLP" not in title for title in mapping_titles)
    assert all("C-SWIFT" not in title for title in mapping_titles)


def test_mapping_gap_accepts_adjacent_metric_at_step_granularity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "scope", "section_type": "purpose_scope"},
                        {"anchor_id": "procedure", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "ESG Team",
                        "action": "collects and reports ESG metrics",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("esg-sop")],
        chunk_results={
            "esg-sop": make_chunk_result(
                "esg-sop",
                [
                    make_anchor(
                        "scope",
                        "esg-sop",
                        "Purpose and Scope",
                        "This SOP covers collection, monitoring, reporting, and escalation of ESG metrics and material deviations.",
                    ),
                    make_anchor(
                        "procedure",
                        "esg-sop",
                        "ESG Reporting Procedure",
                        "The ESG Team collects and reports ESG metrics.",
                    ),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="deviation-log",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-LTIFR",
                            "control_id": "C-LTIFR",
                            "owner": "ESG Team",
                            "description": "LTIFR target threshold breached as a material ESG deviation requiring escalation within 48 hours.",
                            "file_id": "deviation-log",
                            "sheet": "ESG Deviations",
                            "row": 4,
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

    gap = next(
        suggestion
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "mapping_gap"
    )
    assert "C-LTIFR" in gap.title
    assert "LTIFR target threshold" in (gap.proposed_text or "")
    assert not any(marker in (gap.proposed_text or "") for marker in ("1.", "4.2.1", "Escalation Protocol"))


def test_mapping_gap_relevance_filter_allows_cross_cutting_audit_trail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "scope", "section_type": "purpose_scope"},
                        {"anchor_id": "procedure", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "SOC Analyst",
                        "action": "contains compromised systems",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("cyber-sop")],
        chunk_results={
            "cyber-sop": make_chunk_result(
                "cyber-sop",
                [
                    make_anchor(
                        "scope",
                        "cyber-sop",
                        "Purpose and Scope",
                        "This SOP covers cyber incident detection, containment, eradication, and recovery.",
                    ),
                    make_anchor(
                        "procedure",
                        "cyber-sop",
                        "Procedure",
                        "The SOC Analyst contains compromised systems.",
                    ),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="org-rcm",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-AUDIT",
                            "control_id": "C-AUDIT",
                            "owner": "Compliance",
                            "description": "Maintain audit trail for all regulated activities.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 5,
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

    assert any(
        suggestion.suggestion_type == "mapping_gap" and "C-AUDIT" in suggestion.title
        for suggestion in result.suggestions
    )


def test_mapping_gap_relevance_filter_works_for_vendor_management_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "scope", "section_type": "purpose_scope"},
                        {"anchor_id": "procedure", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Procurement",
                        "action": "onboards third-party suppliers",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("vendor-sop")],
        chunk_results={
            "vendor-sop": make_chunk_result(
                "vendor-sop",
                [
                    make_anchor(
                        "scope",
                        "vendor-sop",
                        "Purpose and Scope",
                        "This SOP covers assessing, onboarding, contracting, monitoring, and offboarding third-party vendors and suppliers.",
                    ),
                    make_anchor(
                        "procedure",
                        "vendor-sop",
                        "Vendor Procedure",
                        "Procurement onboards third-party suppliers.",
                    ),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="org-rcm",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-VENDOR",
                            "control_id": "C-VENDOR",
                            "owner": "Vendor Risk",
                            "description": "Vendor onboarding requires contract SLA review and offboarding checklist completion.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 8,
                        },
                        {
                            "risk_id": "R-PATCH",
                            "control_id": "C-PATCH",
                            "owner": "IT Operations",
                            "description": "Emergency patching for exploited vulnerabilities with CVSS score of 9.0 or higher is completed within 72 hours.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 9,
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

    mapping_titles = [
        suggestion.title
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "mapping_gap"
    ]
    assert any("C-VENDOR" in title for title in mapping_titles)
    assert all("C-PATCH" not in title for title in mapping_titles)


def test_mapping_gap_without_scope_is_fail_soft_reviewer_gated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "procedure", "section_type": "procedural"}]},
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Operations",
                        "action": "reviews exceptions",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("unscoped-sop")],
        chunk_results={
            "unscoped-sop": make_chunk_result(
                "unscoped-sop",
                [make_anchor("procedure", "unscoped-sop", "Procedure", "Operations reviews exceptions.")],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="org-rcm",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-SWIFT",
                            "control_id": "C-SWIFT",
                            "owner": "Treasury IT",
                            "description": "SWIFT Customer Security Programme dual-operator authorisation.",
                            "file_id": "org-rcm",
                            "sheet": "RCM",
                            "row": 2,
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

    gap = next(
        suggestion
        for suggestion in result.suggestions
        if suggestion.suggestion_type == "mapping_gap"
    )
    assert "C-SWIFT" in gap.title
    assert gap.requires_explicit_review is True


def test_cross_document_synthesis_prompt_receives_sop_scope_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()
    prompts: dict[str, str] = {}

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        prompts[schema_name] = prompt
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "scope", "section_type": "purpose_scope"},
                        {"anchor_id": "procedure", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "SOC Analyst",
                        "action": "contains compromised systems",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    analysis.analyze_documents(
        conversions=[make_conversion("cyber-sop")],
        chunk_results={
            "cyber-sop": make_chunk_result(
                "cyber-sop",
                [
                    make_anchor(
                        "scope",
                        "cyber-sop",
                        "Purpose and Scope",
                        "This SOP covers cyber incident detection, containment, eradication, recovery, and forensic evidence preservation.",
                    ),
                    make_anchor(
                        "procedure",
                        "cyber-sop",
                        "Procedure",
                        "The SOC Analyst contains compromised systems.",
                    ),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="rcm-1",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-1",
                            "control_id": "C-1",
                            "owner": "SOC",
                            "description": "Containment playbook is executed.",
                            "file_id": "rcm-1",
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

    prompt = prompts["cross_document_synthesis"]
    assert "SOP PURPOSE AND SCOPE:" in prompt
    assert "cyber incident detection, containment, eradication" in prompt
    assert "different organisational function" in prompt


def test_structural_completeness_detects_missing_raci_and_classification_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "roles", "section_type": "procedural"},
                        {"anchor_id": "procedure", "section_type": "procedural"},
                    ]
                },
            )
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {"step_id": "s1", "actor": "Service Desk", "action": "logs P1 events", "anchor_id": "procedure"},
                    {"step_id": "s2", "actor": "Operations Lead", "action": "escalates critical items", "anchor_id": "procedure"},
                    {"step_id": "s3", "actor": "Risk Manager", "action": "reviews closure", "anchor_id": "procedure"},
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("proc-1")],
        chunk_results={
            "proc-1": make_chunk_result(
                "proc-1",
                [
                    make_anchor(
                        "roles",
                        "proc-1",
                        "Roles and Responsibilities",
                        "Service Desk logs events. Operations Lead escalates critical issues. Risk Manager reviews closure.",
                    ),
                    make_anchor(
                        "procedure",
                        "proc-1",
                        "Procedure",
                        "P1 and P2 events are escalated promptly. High and critical items are handled as appropriate.",
                    ),
                ],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    titles = {suggestion.title for suggestion in result.suggestions}
    assert "Add an accountability matrix for multi-role activities" in titles
    assert "Define classification criteria for referenced levels" in titles
    raci = next(
        suggestion
        for suggestion in result.suggestions
        if suggestion.title == "Add an accountability matrix for multi-role activities"
    )
    assert raci.edit_targets[0].target_type == "raci_matrix"
    assert "Responsible" in (raci.proposed_text or "")
    assert "Accountable" in (raci.proposed_text or "")
    assert raci.requires_explicit_review is True


def test_structural_completeness_detects_metric_owner_matrix_from_supporting_facts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "procedure", "section_type": "procedural"}]},
            )
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("proc-1")],
        chunk_results={
            "proc-1": make_chunk_result(
                "proc-1",
                [
                    make_anchor(
                        "procedure",
                        "proc-1",
                        "Procedure",
                        "Teams submit performance information periodically for review.",
                    )
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="metrics-1",
                sheets=[],
                facts=[],
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-1",
                            "control_id": "C-1",
                            "description": "Target metric threshold breached.",
                            "owner": "Operations",
                            "metric": "Completion rate",
                            "target": "95%",
                            "current": "78%",
                            "file_id": "metrics-1",
                            "sheet": "Metrics",
                            "row": 4,
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
    suggestion = next(
        item
        for item in result.suggestions
        if item.title == "Add a metric ownership and validation matrix"
    )
    assert suggestion.edit_targets[0].target_type == "monitoring_reporting"
    assert "Source system" in (suggestion.proposed_text or "")
    assert "Validator" in (suggestion.proposed_text or "")


def test_structural_completeness_detects_missing_response_playbook_matrix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "procedure", "section_type": "procedural"}]},
            )
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Operations Lead",
                        "action": "triages event type and coordinates response",
                        "anchor_id": "procedure",
                    }
                ],
                "suggestions": [],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("proc-1")],
        chunk_results={
            "proc-1": make_chunk_result(
                "proc-1",
                [
                    make_anchor(
                        "procedure",
                        "proc-1",
                        "Event Response Procedure",
                        (
                            "The process covers operational disruption, third-party outage, privacy complaint, "
                            "and safety event categories. The Operations Lead triages the type and responds as appropriate."
                        ),
                    )
                ],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    suggestion = next(
        item
        for item in result.suggestions
        if item.title == "Add a response playbook matrix for material event types"
    )
    assert suggestion.edit_targets[0].target_type == "procedure_step"
    assert "Event / scenario type" in (suggestion.proposed_text or "")
    assert suggestion.requires_explicit_review is True


def test_structural_completeness_detects_missing_evidence_preservation_requirements(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "evidence", "section_type": "procedural"}]},
            )
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("proc-1")],
        chunk_results={
            "proc-1": make_chunk_result(
                "proc-1",
                [
                    make_anchor(
                        "evidence",
                        "proc-1",
                        "Investigation Evidence",
                        (
                            "The team collects logs, records evidence, captures screenshots, and retains artifacts "
                            "after exceptions for later review."
                        ),
                    )
                ],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    suggestion = next(
        item
        for item in result.suggestions
        if item.title == "Define evidence preservation and chain-of-custody requirements"
    )
    assert suggestion.edit_targets[0].target_type == "evidence_requirement"
    assert "chain-of-custody" in (suggestion.proposed_text or "")
    assert "Integrity control" in (suggestion.proposed_text or "")


def test_structural_completeness_detects_missing_oversight_reporting_matrix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "reporting", "section_type": "procedural"}]},
            )
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("proc-1")],
        chunk_results={
            "proc-1": make_chunk_result(
                "proc-1",
                [
                    make_anchor(
                        "reporting",
                        "proc-1",
                        "Oversight Reporting",
                        (
                            "Material results are reported to the Oversight Committee and Board as appropriate. "
                            "Management prepares status updates for steering committee review."
                        ),
                    )
                ],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    suggestion = next(
        item
        for item in result.suggestions
        if item.title == "Add an oversight reporting matrix"
    )
    assert suggestion.edit_targets[0].target_type == "monitoring_reporting"
    assert "Recipient / forum" in (suggestion.proposed_text or "")
    assert "Cadence / trigger" in (suggestion.proposed_text or "")


def test_structural_completeness_detects_missing_category_coverage_matrix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "metrics", "section_type": "procedural"}]},
            )
        return LLMResult(status="success", output={"process_steps": [], "suggestions": []})

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("proc-1")],
        chunk_results={
            "proc-1": make_chunk_result(
                "proc-1",
                [
                    make_anchor(
                        "metrics",
                        "proc-1",
                        "Metric Collection",
                        "Teams collect monthly metrics for in-scope categories and report Scope 1 and Scope 2 values.",
                    )
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="coverage-1",
                corpus_map=CorpusMapContribution(
                    general_relationships=[
                        {
                            "category": "Scope 3 Category 1",
                            "description": "Purchased goods data is required for the coverage universe.",
                            "file_id": "coverage-1",
                            "sheet": "Category Register",
                            "row": 7,
                        },
                        {
                            "category": "Scope 3 Category 2",
                            "description": "Capital goods data is required for the coverage universe.",
                            "file_id": "coverage-1",
                            "sheet": "Category Register",
                            "row": 8,
                        },
                    ],
                ),
            )
        ],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    suggestion = next(
        item
        for item in result.suggestions
        if item.title == "Add a category coverage matrix"
    )
    assert suggestion.edit_targets[0].target_type == "monitoring_reporting"
    assert "Category / population" in (suggestion.proposed_text or "")
    assert "Inclusion decision" in (suggestion.proposed_text or "")


def test_mapping_gap_targets_best_matching_procedure_anchor_not_first_anchor() -> None:
    analysis = load_analysis()
    procedure_conversion = ConversionResult(
        status="success",
        file_id="procedure",
        filename="operations_sop.docx",
        file_type="docx",
        tag="procedure",
    )
    classification_anchor = Anchor(
        anchor_id="classification-anchor",
        file_id="procedure",
        section_path="4. Incident Classification",
        heading="4. Incident Classification",
        content="The team classifies events by severity and impact.",
        char_count=52,
        page_estimate=1,
        section_type="procedural",
    )
    evidence_anchor = Anchor(
        anchor_id="evidence-anchor",
        file_id="procedure",
        section_path="6. Evidence Retention",
        heading="6. Evidence Retention",
        content="The team retains logs, records, and supporting evidence in the repository.",
        char_count=74,
        page_estimate=1,
        section_type="procedural",
    )
    escalation_anchor = Anchor(
        anchor_id="escalation-anchor",
        file_id="procedure",
        section_path="7. Escalation and Notification",
        heading="7. Escalation and Notification",
        content="The team notifies stakeholders and escalates regulatory notifications.",
        char_count=72,
        page_estimate=1,
        section_type="procedural",
    )
    excel_result = ExcelPipelineResult(
        status="success",
        file_id="controls",
        corpus_map=CorpusMapContribution(
            risk_to_control_map=[
                {
                    "control_id": "C-EVIDENCE",
                    "owner": "Records Team",
                    "description": "Retain incident logs and supporting evidence in the repository.",
                    "evidence_ref": "Incident evidence log",
                    "file_id": "controls",
                    "filename": "controls.xlsx",
                    "sheet": "Controls",
                    "row": 4,
                },
                {
                    "control_id": "C-ESCALATION",
                    "owner": "Escalation Team",
                    "description": "Notify stakeholders and escalate regulatory notifications.",
                    "evidence_ref": "Notification register",
                    "file_id": "controls",
                    "filename": "controls.xlsx",
                    "sheet": "Controls",
                    "row": 5,
                },
            ]
        ),
    )

    suggestions = analysis._cross_document_mapping_gap_suggestions(
        process_steps=[],
        anchor_index={
            anchor.anchor_id: anchor
            for anchor in [classification_anchor, evidence_anchor, escalation_anchor]
        },
        excel_results=[excel_result],
        conversions=[procedure_conversion],
    )

    target_by_control = {
        suggestion.title.rsplit(" ", 1)[-1]: suggestion.edit_targets[0].target_anchor_id
        for suggestion in suggestions
    }

    assert target_by_control["C-EVIDENCE"] == "evidence-anchor"
    assert target_by_control["C-ESCALATION"] == "escalation-anchor"
    assert len(set(target_by_control.values())) == 2


def test_senior_oversight_owner_is_routed_to_raci_not_operational_responsibility(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
    ) -> LLMResult:
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={
                    "sections": [
                        {"anchor_id": "sop-anchor", "section_type": "procedural"},
                        {"anchor_id": "roles-anchor", "section_type": "procedural"},
                    ]
                },
            )
        if schema_name == "cross_document_synthesis":
            return LLMResult(status="success", output={"suggestions": []})
        return LLMResult(
            status="success",
            output={
                "process_steps": [
                    {
                        "step_id": "s1",
                        "actor": "Service Desk",
                        "action": "logs events",
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
                [
                    make_anchor("roles-anchor", "sop-1", "Roles and Responsibilities", "The Chief Risk Officer provides oversight."),
                    make_anchor("sop-anchor", "sop-1", "Procedure", "The Service Desk logs events."),
                ],
            )
        },
        excel_results=[
            ExcelPipelineResult(
                status="success",
                file_id="matrix-1",
                corpus_map=CorpusMapContribution(
                    risk_to_control_map=[
                        {
                            "risk_id": "R-01",
                            "control_id": "C-01",
                            "owner": "Service Desk",
                            "description": "Event logging.",
                            "file_id": "matrix-1",
                            "sheet": "Matrix",
                            "row": 2,
                        },
                        {
                            "risk_id": "R-02",
                            "control_id": "C-02",
                            "owner": "Chief Risk Officer",
                            "description": "Investigate endpoint alerts and collect forensic evidence.",
                            "file_id": "matrix-1",
                            "sheet": "Matrix",
                            "row": 3,
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
    gap = next(item for item in result.suggestions if "C-02" in item.title)
    assert [target.target_type for target in gap.edit_targets] == [
        "procedure_step",
        "raci_matrix",
    ]
    assert "Chief Risk Officer performs" not in " ".join(target.proposed_text for target in gap.edit_targets)
    assert "Responsible" in gap.edit_targets[1].proposed_text
    assert "Accountable" in gap.edit_targets[1].proposed_text


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
        temperature: float = 0.2,
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
        temperature: float = 0.2,
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


def test_blank_llm_suggestions_are_filtered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
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
                        "suggestion_type": "process_improvement",
                        "severity": "medium",
                        "title": "Process Improvement",
                        "detail": "",
                        "proposed_text": "",
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
    assert result.suggestions == []


def test_anchor_fallback_source_reference_includes_filename(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = load_analysis()

    def fake_call_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
        temperature: float = 0.2,
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
                        "suggestion_type": "process_improvement",
                        "severity": "medium",
                        "title": "Define escalation timing",
                        "detail": "The procedure mentions escalation but does not define timing.",
                        "proposed_text": "Escalations must be completed within the timeframe defined by the process owner.",
                        "anchor_id": "p1",
                    }
                ],
            },
        )

    monkeypatch.setattr(analysis, "call_llm", fake_call_llm)

    result = analysis.analyze_documents(
        conversions=[make_conversion("cyber_ir_sop", "docx")],
        chunk_results={
            "cyber_ir_sop": make_chunk_result(
                "cyber_ir_sop",
                [make_anchor("p1", "cyber_ir_sop", "Procedure", "The Incident Manager escalates incidents.")],
            )
        },
        excel_results=[],
        pipeline_id="pipe-1",
        budget_remaining=10,
    )

    assert result.status == "success"
    assert result.suggestions[0].source_references[0].document_id == "cyber_ir_sop"
    assert result.suggestions[0].source_references[0].filename == "cyber_ir_sop.docx"


from __future__ import annotations

from datetime import date, datetime
import re
from typing import Any
from uuid import uuid4

from utils.services.llm_orchestrator import call_llm, get_batch_size_chars
from utils.services.schemas import (
    AnalysisResult,
    Anchor,
    ChunkResult,
    CorpusMapContribution,
    ConversionResult,
    ExcelPipelineResult,
    ExtractedItem,
    LLMResult,
    SectionType,
    SourceReference,
    Suggestion,
    SuggestionEditTarget,
)
from utils.sop_processing.content_sanitizer import sanitize_chunk
from utils.sop_processing.prompts import (
    cross_document_synthesis_prompt,
    document_metadata_prompt,
    procedural_extraction_prompt,
    section_classification_prompt,
    terminology_extraction_prompt,
)
from utils.services.role_assignment_guard import apply_role_assignment_guard
from utils.services.structural_completeness import structural_completeness_suggestions


SECTION_CLASSIFICATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "anchor_id": {"type": "string"},
                    "section_type": {"type": "string"},
                },
            },
        }
    },
}

TERMINOLOGY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "terms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "definition": {"type": "string"},
                },
            },
        }
    },
}

DOCUMENT_METADATA_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "last_review_date": {"type": ["string", "null"]},
        "version": {"type": ["string", "null"]},
        "approved_by": {"type": ["string", "null"]},
        "next_review_date": {"type": ["string", "null"]},
    },
}

PROCEDURAL_EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "process_steps": {"type": "array"},
        "suggestions": {"type": "array"},
    },
}

CROSS_DOCUMENT_SYNTHESIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"suggestions": {"type": "array"}},
}

SECTION_TYPES: set[str] = {
    "procedural",
    "definitions",
    "document_history",
    "purpose_scope",
    "references",
    "appendix",
    "unknown",
}

STALE_REVIEW_DAYS = 365
ALLOWED_SUGGESTION_TYPES = {
    "missing_process_step",
    "ownership_clarification",
    "ownership_conflict",
    "ownership_gap",
    "evidence_requirement",
    "evidence_gap",
    "frequency_gap",
    "cross_document_conflict",
    "mapping_gap",
    "staleness_flag",
    "scope_improvement",
    "terminology_inconsistency",
    "regulatory_alignment",
    "process_improvement",
}
ALLOWED_SEVERITIES = {"critical", "high", "medium", "low", "informational"}
SCOPE_RELEVANCE_THRESHOLD = 0.12
SCOPE_GENERIC_TERMS = {
    "about",
    "access",
    "accountable",
    "account",
    "accounts",
    "activity",
    "activities",
    "against",
    "also",
    "all",
    "and",
    "any",
    "application",
    "applications",
    "are",
    "been",
    "being",
    "bank",
    "banks",
    "based",
    "business",
    "customer",
    "customers",
    "data",
    "control",
    "controls",
    "describe",
    "document",
    "documents",
    "evidence",
    "ensure",
    "ensures",
    "external",
    "for",
    "factor",
    "from",
    "has",
    "have",
    "high",
    "includes",
    "includ",
    "into",
    "its",
    "information",
    "maintain",
    "management",
    "must",
    "network",
    "networks",
    "owner",
    "party",
    "parties",
    "performed",
    "policy",
    "procedure",
    "process",
    "record",
    "records",
    "requirement",
    "requir",
    "retained",
    "review",
    "rule",
    "rules",
    "security",
    "service",
    "services",
    "shall",
    "should",
    "standard",
    "standards",
    "system",
    "systems",
    "team",
    "that",
    "the",
    "their",
    "third",
    "this",
    "through",
    "under",
    "using",
    "value",
    "when",
    "where",
    "with",
    "tool",
    "tools",
    "user",
    "users",
}

_RCM_VERB_PREFIX = re.compile(
    r"^(?P<verb>performs?|reviews?|maintains?|monitors?|manages?|conducts?|executes?|"
    r"approves?|validates?|verifies?|tests?|checks?|ensures?|documents?|records?|"
    r"identifies?|escalates?|reports?|coordinates?|implements?|deploys?|"
    r"investigates?|assesses?|submits?|screens?)\s+",
    re.IGNORECASE,
)

_EVIDENCE_PLACEHOLDER = {
    "the relevant evidence",
    "the relevant control evidence",
    "n/a",
    "na",
    "none",
    "not applicable",
    "-",
}
_WEAK_RCM_VERBS = {"perform", "performs"}
_STATE_PARTICIPLES = {
    "approved",
    "completed",
    "configured",
    "deployed",
    "documented",
    "enabled",
    "implemented",
    "integrated",
    "maintained",
    "monitored",
    "recorded",
    "retained",
    "reviewed",
    "shared",
    "validated",
    "verified",
}
_SENIOR_ROLE_SIGNALS = {
    "board",
    "chief",
    "ciso",
    "ceo",
    "cfo",
    "cio",
    "coo",
    "cro",
    "cto",
    "committee",
    "executive",
    "senior management",
}
_OPERATIONAL_ACTION_SIGNALS = {
    "apply",
    "collect",
    "configure",
    "deploy",
    "execute",
    "extract",
    "fix",
    "image",
    "implement",
    "investigate",
    "patch",
    "perform",
    "provision",
    "reconcile",
    "remediate",
    "restore",
    "run",
    "sample",
    "scan",
    "test",
    "triage",
    "validate",
}


def analyze_documents(
    conversions: list[ConversionResult],
    chunk_results: dict[str, ChunkResult],
    excel_results: list[ExcelPipelineResult],
    pipeline_id: str,
    budget_remaining: int,
) -> AnalysisResult:
    """
    Run Stage 1 Document Uplift analysis over prose documents and Excel output.

    The service is stateless: it accepts conversion, chunking, and Excel service
    results, calls the LLM orchestration layer for JSON outputs, and returns
    extracted process steps plus review-ready suggestions.
    """
    if budget_remaining <= 0:
        return AnalysisResult(
            status="partial",
            error="LLM call budget exhausted",
            llm_calls_used=0,
        )

    try:
        llm_calls_used = 0
        process_steps: list[dict] = []
        terminology: list[dict] = []
        suggestions: list[Suggestion] = _excel_suggestions(excel_results)
        extracted_items: list[ExtractedItem] = []
        anchor_index: dict[str, Anchor] = {}
        corpus_context = _corpus_context(excel_results)

        for conversion in _prose_conversions(conversions):
            file_id = conversion.file_id or ""
            chunk_result = chunk_results.get(file_id)
            if not chunk_result or not chunk_result.anchors:
                continue

            classification_result = _call_budgeted(
                prompt=_classification_prompt(chunk_result.anchors),
                schema_name="section_classification",
                response_schema=SECTION_CLASSIFICATION_SCHEMA,
                pipeline_id=pipeline_id,
                budget_remaining=budget_remaining,
                llm_calls_used=llm_calls_used,
                temperature=0.0,
            )
            if classification_result.status == "budget_exceeded":
                return _partial_budget_result(
                    process_steps=process_steps,
                    suggestions=suggestions,
                    terminology=terminology,
                    llm_calls_used=llm_calls_used,
                    extracted_items=extracted_items,
                )
            llm_calls_used += 1
            if classification_result.status == "failed":
                return AnalysisResult(
                    status="partial",
                    error=classification_result.error or "Section classification failed",
                    process_steps=process_steps,
                    suggestions=suggestions,
                    terminology=terminology,
                    llm_calls_used=llm_calls_used,
                )

            classified_anchors = _apply_section_classification(
                chunk_result.anchors,
                classification_result.output,
            )
            anchor_index.update({anchor.anchor_id: anchor for anchor in classified_anchors})

            for anchor in classified_anchors:
                if anchor.section_type == "definitions":
                    result = _run_single_anchor_prompt(
                        anchor=anchor,
                        schema_name="terminology_extraction",
                        response_schema=TERMINOLOGY_SCHEMA,
                        prompt_builder=lambda item: terminology_extraction_prompt(
                            sanitize_chunk(item.content, item.file_id, item.anchor_id)
                        ),
                        pipeline_id=pipeline_id,
                        budget_remaining=budget_remaining,
                        llm_calls_used=llm_calls_used,
                    )
                    llm_calls_used = result["llm_calls_used"]
                    if result["budget_exceeded"]:
                        return _partial_budget_result(
                            process_steps=process_steps,
                            suggestions=suggestions,
                            terminology=terminology,
                            llm_calls_used=llm_calls_used,
                            extracted_items=extracted_items,
                        )
                    terminology.extend(_terms_from_output(result["output"]))

                elif anchor.section_type == "document_history":
                    result = _run_single_anchor_prompt(
                        anchor=anchor,
                        schema_name="document_metadata",
                        response_schema=DOCUMENT_METADATA_SCHEMA,
                        prompt_builder=lambda item: document_metadata_prompt(
                            sanitize_chunk(item.content, item.file_id, item.anchor_id)
                        ),
                        pipeline_id=pipeline_id,
                        budget_remaining=budget_remaining,
                        llm_calls_used=llm_calls_used,
                    )
                    llm_calls_used = result["llm_calls_used"]
                    if result["budget_exceeded"]:
                        return _partial_budget_result(
                            process_steps=process_steps,
                            suggestions=suggestions,
                            terminology=terminology,
                            llm_calls_used=llm_calls_used,
                            extracted_items=extracted_items,
                        )
                    stale_suggestion = _staleness_suggestion(anchor, result["output"])
                    if stale_suggestion:
                        suggestions.append(stale_suggestion)

            procedural_anchors = [
                anchor
                for anchor in classified_anchors
                if anchor.section_type in {"procedural", "purpose_scope", "unknown"}
            ]
            for batch in _batch_anchors(procedural_anchors, get_batch_size_chars()):
                batch_result = _run_procedural_batch(
                    batch=batch,
                    terminology=terminology,
                    corpus_context=corpus_context,
                    max_chars=get_batch_size_chars(),
                    pipeline_id=pipeline_id,
                    budget_remaining=budget_remaining,
                    llm_calls_used=llm_calls_used,
                )
                llm_calls_used = batch_result["llm_calls_used"]
                if batch_result["budget_exceeded"]:
                    return _partial_budget_result(
                        process_steps=process_steps,
                        suggestions=suggestions,
                        terminology=terminology,
                        llm_calls_used=llm_calls_used,
                        extracted_items=extracted_items,
                    )
                batch_output = batch_result["output"]
                process_steps.extend(_process_steps_from_output(batch_output))
                suggestions.extend(
                    _suggestions_from_output(
                        batch_output,
                        batch,
                        filenames_by_file_id=_filenames_by_file_id(conversions),
                    )
                )

        if corpus_context and process_steps and budget_remaining - llm_calls_used > 0:
            procedure_file_ids = _procedure_file_ids(conversions)
            synthesis = _run_cross_document_synthesis(
                process_steps=process_steps,
                excel_results=excel_results,
                sop_scope_text=_sop_scope_text(anchor_index, procedure_file_ids),
                pipeline_id=pipeline_id,
                budget_remaining=budget_remaining,
                llm_calls_used=llm_calls_used,
            )
            llm_calls_used = synthesis["llm_calls_used"]
            if synthesis["budget_exceeded"]:
                return _partial_budget_result(
                    process_steps=process_steps,
                    suggestions=suggestions,
                    terminology=terminology,
                    llm_calls_used=llm_calls_used,
                    extracted_items=extracted_items,
                )
            suggestions.extend(
                _suggestions_from_output(
                    synthesis["output"],
                    [],
                    filenames_by_file_id=_filenames_by_file_id(conversions),
                )
            )
            suggestions.extend(
                _cross_document_fallback_suggestions(
                    process_steps=process_steps,
                    anchor_index=anchor_index,
                    excel_results=excel_results,
                    conversions=conversions,
                )
            )

        suggestions.extend(
            structural_completeness_suggestions(
                conversions=conversions,
                anchor_index=anchor_index,
                process_steps=process_steps,
                excel_results=excel_results,
            )
        )

        return AnalysisResult(
            status="success",
            process_steps=_dedupe_steps(process_steps),
            suggestions=_normalise_suggestions(
                apply_role_assignment_guard(suggestions),
                conversions,
            ),
            terminology=_dedupe_terms(terminology),
            extracted_controls=extracted_items,
            corpus_map=_analysis_corpus_map(process_steps, anchor_index, excel_results),
            llm_calls_used=llm_calls_used,
        )
    except Exception as exc:
        return AnalysisResult(status="failed", error=str(exc), llm_calls_used=0)


def _today_iso() -> str:
    return date.today().isoformat()


def _prose_conversions(conversions: list[ConversionResult]) -> list[ConversionResult]:
    return [
        conversion
        for conversion in conversions
        if conversion.status in {"success", "partial"} and conversion.file_type != "xlsx"
    ]


def _classification_prompt(anchors: list[Anchor]) -> str:
    prompt_items: list[dict[str, str]] = []
    for anchor in anchors:
        sanitized = sanitize_chunk(
            anchor.content,
            file_id=anchor.file_id,
            anchor_id=anchor.anchor_id,
            max_chars=200,
        )
        prompt_items.append(
            {
                "anchor_id": anchor.anchor_id,
                "heading": anchor.heading or anchor.section_path,
                "content_snippet": sanitized.content[:150],
            }
        )
    return section_classification_prompt(prompt_items)


def _call_budgeted(
    prompt: str,
    schema_name: str,
    response_schema: dict[str, Any],
    pipeline_id: str,
    budget_remaining: int,
    llm_calls_used: int,
    temperature: float = 0.2,
) -> LLMResult:
    return call_llm(
        prompt=prompt,
        schema_name=schema_name,
        response_schema=response_schema,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining - llm_calls_used,
        temperature=temperature,
    )


def _apply_section_classification(
    anchors: list[Anchor],
    output: dict[str, Any] | None,
) -> list[Anchor]:
    sections = _array_output(output, "sections")
    section_by_id: dict[str, SectionType] = {}
    for section in sections:
        anchor_id = str(section.get("anchor_id") or "")
        section_type = str(section.get("section_type") or "appendix")
        section_by_id[anchor_id] = (
            section_type if section_type in SECTION_TYPES else "appendix"
        )  # type: ignore[assignment]

    classified: list[Anchor] = []
    for anchor in anchors:
        section_type = section_by_id.get(anchor.anchor_id, anchor.section_type)
        if section_type == "unknown":
            section_type = "procedural"
        classified.append(anchor.model_copy(update={"section_type": section_type}))
    return classified


def _run_single_anchor_prompt(
    anchor: Anchor,
    schema_name: str,
    response_schema: dict[str, Any],
    prompt_builder: Any,
    pipeline_id: str,
    budget_remaining: int,
    llm_calls_used: int,
    temperature: float = 0.0,
) -> dict[str, Any]:
    result = _call_budgeted(
        prompt=prompt_builder(anchor),
        schema_name=schema_name,
        response_schema=response_schema,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining,
        llm_calls_used=llm_calls_used,
        temperature=temperature,
    )
    used = llm_calls_used + (0 if result.status == "budget_exceeded" else 1)
    return {
        "budget_exceeded": result.status == "budget_exceeded",
        "llm_calls_used": used,
        "output": result.output if result.status == "success" else {},
    }


def _run_procedural_batch(
    batch: list[Anchor],
    terminology: list[dict],
    corpus_context: str,
    max_chars: int,
    pipeline_id: str,
    budget_remaining: int,
    llm_calls_used: int,
) -> dict[str, Any]:
    batch_text = "\n\n".join(
        f"## {anchor.heading or anchor.section_path}\n\n{anchor.content}" for anchor in batch
    )
    first_anchor = batch[0]
    prompt = procedural_extraction_prompt(
        sanitize_chunk(
            batch_text,
            first_anchor.file_id,
            first_anchor.anchor_id,
            max_chars=max(4000, max_chars),
        ),
        terminology=terminology,
        corpus_context=corpus_context or "No structured supporting context available.",
    )
    result = _call_budgeted(
        prompt=prompt,
        schema_name="procedural_extraction",
        response_schema=PROCEDURAL_EXTRACTION_SCHEMA,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining,
        llm_calls_used=llm_calls_used,
        temperature=0.3,
    )
    used = llm_calls_used + (0 if result.status == "budget_exceeded" else 1)
    return {
        "budget_exceeded": result.status == "budget_exceeded",
        "llm_calls_used": used,
        "output": result.output if result.status == "success" else {},
    }


def _run_cross_document_synthesis(
    process_steps: list[dict],
    excel_results: list[ExcelPipelineResult],
    sop_scope_text: str,
    pipeline_id: str,
    budget_remaining: int,
    llm_calls_used: int,
) -> dict[str, Any]:
    prompt = cross_document_synthesis_prompt(
        sop_steps=process_steps,
        rcm_controls=_risk_to_control_rows(excel_results),
        risk_items=_risk_rows(excel_results),
        sop_scope_text=sop_scope_text,
    )
    result = _call_budgeted(
        prompt=prompt,
        schema_name="cross_document_synthesis",
        response_schema=CROSS_DOCUMENT_SYNTHESIS_SCHEMA,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining,
        llm_calls_used=llm_calls_used,
        temperature=0.2,
    )
    used = llm_calls_used + (0 if result.status == "budget_exceeded" else 1)
    return {
        "budget_exceeded": result.status == "budget_exceeded",
        "llm_calls_used": used,
        "output": result.output if result.status == "success" else {},
    }


def _batch_anchors(anchors: list[Anchor], max_chars: int) -> list[list[Anchor]]:
    batches: list[list[Anchor]] = []
    current: list[Anchor] = []
    current_chars = 0
    budget = max(1, max_chars)
    for anchor in anchors:
        anchor_chars = max(1, len(anchor.heading) + len(anchor.content) + 8)
        if current and current_chars + anchor_chars > budget:
            batches.append(current)
            current = []
            current_chars = 0
        current.append(anchor)
        current_chars += anchor_chars
    if current:
        batches.append(current)
    return batches


def _terms_from_output(output: dict[str, Any] | None) -> list[dict]:
    terms = _array_output(output, "terms")
    return [
        {"term": str(item.get("term") or ""), "definition": str(item.get("definition") or "")}
        for item in terms
        if item.get("term") and item.get("definition")
    ]


def _process_steps_from_output(output: dict[str, Any] | None) -> list[dict]:
    return [dict(item) for item in _array_output(output, "process_steps")]


def _suggestions_from_output(
    output: dict[str, Any] | None,
    anchors: list[Anchor],
    filenames_by_file_id: dict[str, str] | None = None,
) -> list[Suggestion]:
    anchor_by_id = {anchor.anchor_id: anchor for anchor in anchors}
    return [
        suggestion
        for suggestion in (
            _suggestion_from_raw(item, anchor_by_id, filenames_by_file_id or {})
            for item in _array_output(output, "suggestions")
        )
        if suggestion is not None
    ]


def _suggestion_from_raw(
    raw: dict[str, Any],
    anchor_by_id: dict[str, Anchor],
    filenames_by_file_id: dict[str, str],
) -> Suggestion | None:
    suggestion_type = _normalize_suggestion_type(raw.get("suggestion_type"))
    severity = _normalize_severity(raw.get("severity"))
    anchor_id = str(raw.get("anchor_id") or "")
    anchor = anchor_by_id.get(anchor_id)
    title_raw = str(raw.get("title") or "").strip()
    detail = str(raw.get("detail") or raw.get("summary") or "").strip()
    proposed_text = _optional_text(raw.get("proposed_text"))
    if not _has_material_raw_suggestion(
        suggestion_type=suggestion_type,
        title=title_raw,
        detail=detail,
        proposed_text=proposed_text,
    ):
        return None
    source_refs = _source_references(raw.get("source_references"), filenames_by_file_id)
    if not source_refs:
        source_file = str(raw.get("source_file") or "").strip()
        if source_file:
            file_id = next(
                (fid for fid, fname in filenames_by_file_id.items() if fname == source_file),
                "",
            )
            source_refs = [SourceReference(document_id=file_id, filename=source_file or None)]
    if not source_refs and anchor:
        source_refs = [
            SourceReference(
                document_id=anchor.file_id,
                filename=filenames_by_file_id.get(anchor.file_id),
                anchor_id=anchor.anchor_id,
            )
        ]
    if not source_refs and anchor_id:
        source_refs = [SourceReference(document_id="", anchor_id=anchor_id)]
    if not source_refs:
        return None
    try:
        return Suggestion(
            suggestion_id=str(raw.get("suggestion_id") or uuid4()),
            suggestion_type=suggestion_type,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            title=title_raw or suggestion_type.replace("_", " ").title(),
            detail=detail,
            proposed_text=proposed_text,
            original_text=_optional_text(raw.get("original_text")),
            target_anchor_id=str(raw.get("target_anchor_id") or anchor_id or "") or None,
            review_status="pending",
            source_references=source_refs,
            queue_finding=bool(raw.get("queue_finding", False)),
        )
    except ValueError:
        return None


def _normalize_suggestion_type(value: Any) -> str:
    suggestion_type = str(value or "process_improvement").strip().lower()
    return suggestion_type if suggestion_type in ALLOWED_SUGGESTION_TYPES else "process_improvement"


def _normalize_severity(value: Any) -> str:
    severity = str(value or "medium").strip().lower()
    return severity if severity in ALLOWED_SEVERITIES else "medium"


def _source_references(
    value: Any,
    filenames_by_file_id: dict[str, str] | None = None,
) -> list[SourceReference]:
    if not isinstance(value, list):
        return []
    refs: list[SourceReference] = []
    filenames = filenames_by_file_id or {}
    for item in value:
        if not isinstance(item, dict):
            continue
        document_id = str(item.get("document_id") or item.get("file_id") or "")
        refs.append(
            SourceReference(
                document_id=document_id,
                filename=item.get("filename") or filenames.get(document_id),
                document_role=item.get("document_role"),
                anchor_id=item.get("anchor_id"),
                section_id=item.get("section_id"),
                section_heading=item.get("section_heading"),
                page=item.get("page"),
                sheet_name=item.get("sheet_name"),
                row_index=item.get("row_index"),
                row_number=item.get("row_number"),
                column_name=item.get("column_name"),
                excerpt=item.get("excerpt"),
            )
        )
    return refs


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _has_material_raw_suggestion(
    suggestion_type: str,
    title: str,
    detail: str,
    proposed_text: str | None,
) -> bool:
    if detail or proposed_text:
        return True
    default_title = suggestion_type.replace("_", " ").title().casefold()
    return bool(title and title.casefold() != default_title and len(title) > 8)


def _staleness_suggestion(anchor: Anchor, output: dict[str, Any] | None) -> Suggestion | None:
    if not output:
        return None
    last_review_date = output.get("last_review_date")
    if not isinstance(last_review_date, str) or not last_review_date:
        return None
    try:
        reviewed = datetime.fromisoformat(last_review_date).date()
        today = datetime.fromisoformat(_today_iso()).date()
    except ValueError:
        return None
    if (today - reviewed).days <= STALE_REVIEW_DAYS:
        return None
    return Suggestion(
        suggestion_id=str(uuid4()),
        suggestion_type="staleness_flag",
        severity="medium",
        title="Refresh document review date",
        detail=f"The document was last reviewed on {last_review_date}, which is more than 12 months ago.",
        proposed_text="Update the document history to show the latest review date, approver, and next scheduled review.",
        review_status="pending",
        source_references=[
            SourceReference(document_id=anchor.file_id, anchor_id=anchor.anchor_id)
        ],
    )


def _array_output(output: dict[str, Any] | None, key: str) -> list[dict[str, Any]]:
    if not output:
        return []
    value = output.get(key)
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if key == "sections" and isinstance(output, list):
        return [item for item in output if isinstance(item, dict)]
    return []


def _excel_suggestions(excel_results: list[ExcelPipelineResult]) -> list[Suggestion]:
    suggestions: list[Suggestion] = []
    for result in excel_results:
        suggestions.extend(result.suggestions)
    return suggestions


def _corpus_context(excel_results: list[ExcelPipelineResult]) -> str:
    lines: list[str] = []
    for result in excel_results:
        corpus_map = result.corpus_map
        if not corpus_map:
            continue
        for row in corpus_map.risk_to_control_map[:25]:
            lines.append(f"Risk-control: {row}")
        for row in corpus_map.evidence_to_control_map[:25]:
            lines.append(f"Evidence-control: {row}")
    return "\n".join(lines)


def _risk_to_control_rows(excel_results: list[ExcelPipelineResult]) -> list[dict]:
    rows: list[dict] = []
    for result in excel_results:
        if result.corpus_map:
            rows.extend(result.corpus_map.risk_to_control_map)
    return rows


def _risk_rows(excel_results: list[ExcelPipelineResult]) -> list[dict]:
    rows: list[dict] = []
    for result in excel_results:
        if result.corpus_map:
            for item in result.corpus_map.risk_to_control_map:
                if item.get("risk_id") or item.get("risk_description"):
                    rows.append(
                        {
                            "risk_id": item.get("risk_id"),
                            "description": item.get("risk_description")
                            or item.get("risk")
                            or item.get("description"),
                        }
                    )
    return rows


def _analysis_corpus_map(
    process_steps: list[dict],
    anchor_index: dict[str, Anchor],
    excel_results: list[ExcelPipelineResult],
) -> CorpusMapContribution | None:
    sop_to_control_map = _sop_to_control_map_from_steps(
        process_steps,
        anchor_index,
        excel_results,
    )
    if not sop_to_control_map:
        return None
    return CorpusMapContribution(
        risk_to_control_map=[],
        sop_to_control_map=sop_to_control_map,
        evidence_to_control_map=[],
    )


def _sop_to_control_map_from_steps(
    process_steps: list[dict],
    anchor_index: dict[str, Anchor],
    excel_results: list[ExcelPipelineResult],
) -> list[dict]:
    mappings: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for step in process_steps:
        anchor_id = str(step.get("anchor_id") or "")
        if not anchor_id:
            continue
        anchor = anchor_index.get(anchor_id)
        for control_id in _control_ids_from_step(step) or _infer_control_ids_from_step(step, excel_results):
            key = (anchor_id, control_id, anchor.file_id if anchor else str(step.get("file_id") or ""))
            if key in seen:
                continue
            seen.add(key)
            mappings.append(
                {
                    "sop_section": str(
                        step.get("section")
                        or step.get("section_heading")
                        or step.get("sop_section")
                        or (anchor.heading if anchor else "")
                        or step.get("step_id")
                        or ""
                    ),
                    "anchor_id": anchor_id,
                    "control_id": control_id,
                    "file_id": anchor.file_id if anchor else str(step.get("file_id") or ""),
                }
            )
    return mappings


def _cross_document_fallback_suggestions(
    process_steps: list[dict],
    anchor_index: dict[str, Anchor],
    excel_results: list[ExcelPipelineResult],
    conversions: list[ConversionResult],
) -> list[Suggestion]:
    filenames_by_file_id = _filenames_by_file_id(conversions)
    candidates = {
        str(candidate.get("control_id") or ""): candidate
        for candidate in _excel_control_candidates(excel_results)
        if candidate.get("control_id")
    }
    suggestions: list[Suggestion] = []
    seen: set[tuple[str, str]] = set()
    for step in process_steps:
        anchor_id = str(step.get("anchor_id") or "")
        anchor = anchor_index.get(anchor_id)
        actor = str(step.get("actor") or "").strip()
        if not anchor_id or not anchor or not actor:
            continue
        for control_id in _control_ids_from_step(step) or _infer_control_ids_from_step(step, excel_results):
            candidate = candidates.get(control_id)
            if not candidate:
                continue
            owner = str(candidate.get("owner") or "").strip()
            if not owner or _owner_matches(actor, owner):
                continue
            key = (anchor_id, control_id)
            if key in seen:
                continue
            seen.add(key)
            matrix_ref = SourceReference(
                document_id=str(candidate.get("file_id") or ""),
                filename=candidate.get("filename"),
                sheet_name=candidate.get("sheet"),
                row_index=_as_int(candidate.get("row") or candidate.get("row_index")),
            )
            suggestions.append(
                Suggestion(
                    suggestion_id=str(uuid4()),
                    suggestion_type="ownership_conflict",
                    severity="high",
                    title=f"Resolve owner conflict for {control_id}",
                    detail=(
                        f"The SOP step assigns ownership to {actor}, while the RCM lists "
                        f"{owner} for control {control_id}. This is suggested because "
                        "SOP and RCM ownership must align before the control can be tested consistently."
                    ),
                    original_text=str(step.get("action") or ""),
                    proposed_text=(
                        f"Clarify the accountable owner for control {control_id}. If the RCM is correct, "
                        f"state that {owner} owns the control and describe the hand-off from {actor}; "
                        "otherwise update the RCM owner and keep the SOP wording aligned."
                    ),
                    target_anchor_id=anchor.anchor_id,
                    review_status="pending",
                    source_references=[
                        SourceReference(
                            document_id=anchor.file_id,
                            filename=filenames_by_file_id.get(anchor.file_id),
                            anchor_id=anchor.anchor_id,
                        ),
                        matrix_ref,
                    ],
                    queue_finding=True,
                )
            )
    suggestions.extend(
        _cross_document_mapping_gap_suggestions(
            process_steps=process_steps,
            anchor_index=anchor_index,
            excel_results=excel_results,
            conversions=conversions,
        )
    )
    return suggestions


def _procedure_file_ids(conversions: list[ConversionResult]) -> set[str]:
    return {
        str(conversion.file_id)
        for conversion in conversions
        if conversion.file_id and conversion.tag == "procedure"
    }


def _sop_scope_text(anchor_index: dict[str, Anchor], file_ids: set[str]) -> str:
    selected = _sop_scope_anchors(anchor_index, file_ids)
    return "\n".join(
        " ".join(part for part in (anchor.heading, anchor.content) if part).strip()
        for anchor in selected
        if str(anchor.content or "").strip()
    )


def _sop_scope_term_sets(anchor_index: dict[str, Anchor], file_ids: set[str]) -> list[set[str]]:
    return [
        _scope_terms(" ".join(part for part in (anchor.heading, anchor.content) if part))
        for anchor in _sop_scope_anchors(anchor_index, file_ids)
    ]


def _sop_scope_anchors(anchor_index: dict[str, Anchor], file_ids: set[str]) -> list[Anchor]:
    anchors = [
        anchor
        for anchor in anchor_index.values()
        if anchor.file_id in file_ids
    ]
    purpose_anchors = [
        anchor
        for anchor in anchors
        if _anchor_heading_matches(anchor, r"\b(purpose|objective)\b")
        or (
            anchor.section_type == "purpose_scope"
            and not _anchor_heading_matches(anchor, r"\bscope\b")
        )
    ]
    scope_anchors = [
        anchor
        for anchor in anchors
        if anchor.section_type == "purpose_scope"
        and _anchor_heading_matches(anchor, r"\bscope\b")
    ]
    selected = purpose_anchors or scope_anchors
    if not selected:
        selected = [
            anchor
            for anchor in anchors
            if _anchor_heading_matches(anchor, r"\b(purpose|scope|objective|overview)\b")
        ]
    if not selected:
        return []
    selected.extend(_process_responsibility_anchors(anchors, selected))
    return selected


def _anchor_heading_matches(anchor: Anchor, pattern: str) -> bool:
    return bool(
        re.search(
            pattern,
            f"{anchor.heading} {anchor.section_path}",
            flags=re.IGNORECASE,
        )
    )


def _process_responsibility_anchors(
    anchors: list[Anchor],
    selected_scope_anchors: list[Anchor],
) -> list[Anchor]:
    selected_ids = {anchor.anchor_id for anchor in selected_scope_anchors}
    excluded_heading = re.compile(
        r"\b(appendix|contact|definitions?|document|history|references|roles?|responsibilities|training)\b",
        flags=re.IGNORECASE,
    )
    process_anchors: list[Anchor] = []
    for anchor in anchors:
        if anchor.anchor_id in selected_ids:
            continue
        if anchor.section_type not in {"procedural", "purpose_scope", "unknown"}:
            continue
        if _anchor_heading_matches(anchor, r"\b(purpose|scope|objective|overview)\b"):
            continue
        if excluded_heading.search(f"{anchor.heading} {anchor.section_path}"):
            continue
        process_anchors.append(anchor)
        if len(process_anchors) >= 8:
            break
    return process_anchors


def _has_assessable_scope(sop_scope_text: str) -> bool:
    return len(_scope_terms(sop_scope_text)) >= 4


def _is_control_in_scope(
    control: dict[str, Any],
    sop_scope_text: str,
    threshold: float = SCOPE_RELEVANCE_THRESHOLD,
    scope_term_sets: list[set[str]] | None = None,
) -> bool:
    control_text = _control_scope_text(control)
    if _looks_cross_cutting_control(control_text):
        return True
    scope_terms = _scope_terms(sop_scope_text)
    if len(scope_terms) < 4:
        return True
    control_terms = _scope_terms(control_text)
    if not control_terms:
        return False
    anchor_term_sets = [terms for terms in (scope_term_sets or []) if terms]
    if anchor_term_sets:
        max_overlap = max(len(terms.intersection(control_terms)) for terms in anchor_term_sets)
        max_ratio = max(
            len(terms.intersection(control_terms)) / max(1, len(control_terms))
            for terms in anchor_term_sets
        )
        return max_overlap >= 2 and max_ratio >= threshold
    overlap = scope_terms.intersection(control_terms)
    return len(overlap) >= 2 and len(overlap) / max(1, len(control_terms)) >= threshold


def _control_scope_text(control: dict[str, Any]) -> str:
    keys = (
        "control_name",
        "description",
        "activity",
        "owner",
        "metric",
        "target",
        "status",
        "key_gap",
        "recommended_action",
        "recommendation",
    )
    return " ".join(str(control.get(key) or "") for key in keys)


def _looks_cross_cutting_control(text: str) -> bool:
    lowered = str(text or "").casefold()
    cross_cutting_patterns = (
        r"\baudit\s+trail\b",
        r"\bregulated\s+activit",
        r"\brecord\s+retention\b",
        r"\bevidence\s+retention\b",
    )
    return any(re.search(pattern, lowered) for pattern in cross_cutting_patterns)


def _scope_terms(text: str) -> set[str]:
    terms: set[str] = set()
    for raw in re.findall(r"[a-zA-Z0-9]+", str(text or "").casefold()):
        token = _scope_token(raw)
        if token and len(token) > 2 and token not in SCOPE_GENERIC_TERMS:
            terms.add(token)
    return terms


def _scope_token(token: str) -> str:
    cleaned = str(token or "").strip().casefold()
    if not cleaned:
        return ""
    if cleaned.endswith("ies") and len(cleaned) > 5:
        return f"{cleaned[:-3]}y"
    if cleaned.endswith("ing") and len(cleaned) > 6:
        return cleaned[:-3]
    if cleaned.endswith("ed") and len(cleaned) > 5:
        return cleaned[:-2]
    if cleaned.endswith("s") and len(cleaned) > 4 and not cleaned.endswith(("ss", "us")):
        return cleaned[:-1]
    return cleaned


def _cross_document_mapping_gap_suggestions(
    process_steps: list[dict],
    anchor_index: dict[str, Anchor],
    excel_results: list[ExcelPipelineResult],
    conversions: list[ConversionResult],
) -> list[Suggestion]:
    filenames_by_file_id = _filenames_by_file_id(conversions)
    procedure_file_ids = _procedure_file_ids(conversions)
    if not procedure_file_ids:
        return []
    primary_anchor = _first_anchor_for_files(anchor_index, procedure_file_ids)
    if not primary_anchor:
        return []
    responsibility_anchor = _first_responsibility_anchor_for_files(
        anchor_index,
        procedure_file_ids,
    )

    covered_control_ids = _covered_control_ids_for_files(
        process_steps=process_steps,
        anchor_index=anchor_index,
        excel_results=excel_results,
        file_ids=procedure_file_ids,
    )
    sop_scope_text = _sop_scope_text(anchor_index, procedure_file_ids)
    sop_scope_term_sets = _sop_scope_term_sets(anchor_index, procedure_file_ids)
    has_assessable_scope = _has_assessable_scope(sop_scope_text)
    suggestions: list[Suggestion] = []
    for candidate in _excel_control_candidates(excel_results):
        control_id = str(candidate.get("control_id") or "")
        if not control_id or control_id in covered_control_ids:
            continue
        if has_assessable_scope and not _is_control_in_scope(
            candidate,
            sop_scope_text,
            scope_term_sets=sop_scope_term_sets,
        ):
            continue
        procedure_anchor = _best_anchor_for_control_candidate(
            candidate,
            anchor_index=anchor_index,
            file_ids=procedure_file_ids,
            fallback_anchor=primary_anchor,
        )
        matrix_ref = SourceReference(
            document_id=str(candidate.get("file_id") or ""),
            filename=candidate.get("filename"),
            sheet_name=candidate.get("sheet"),
            row_index=_as_int(candidate.get("row") or candidate.get("row_index")),
        )
        owner = str(candidate.get("owner") or "the accountable owner").strip()
        activity = _sentence_fragment(
            str(candidate.get("description") or "the source activity").strip()
        )
        evidence = _sentence_fragment(
            str(candidate.get("evidence_ref") or "the relevant evidence").strip()
        )
        suggestion_id = str(uuid4())
        edit_targets = [
            SuggestionEditTarget(
                target_id=f"{suggestion_id}:procedure",
                target_type="procedure_step",
                title="Procedure update",
                detail="Add the missing activity to the process narrative.",
                proposed_text=_role_activity_sentence(owner, activity, evidence),
                target_anchor_id=procedure_anchor.anchor_id,
                target_text=procedure_anchor.content,
                source_references=[
                    SourceReference(
                        document_id=procedure_anchor.file_id,
                        filename=filenames_by_file_id.get(procedure_anchor.file_id),
                        anchor_id=procedure_anchor.anchor_id,
                    ),
                    matrix_ref,
                ],
            )
        ]
        if responsibility_anchor and _candidate_supports_responsibility_target(candidate):
            edit_targets.append(
                SuggestionEditTarget(
                    target_id=f"{suggestion_id}:responsibility",
                    target_type="role_responsibility",
                    title="Responsibility update",
                    detail="Reflect the accountable role in the responsibilities area.",
                    proposed_text=_role_activity_sentence(owner, activity, evidence),
                    target_anchor_id=responsibility_anchor.anchor_id,
                    target_text=responsibility_anchor.content,
                    source_references=[
                        SourceReference(
                            document_id=responsibility_anchor.file_id,
                            filename=filenames_by_file_id.get(responsibility_anchor.file_id),
                            anchor_id=responsibility_anchor.anchor_id,
                        ),
                        matrix_ref,
                    ],
                )
            )
        requires_explicit_review = not has_assessable_scope
        suggestions.append(
            Suggestion(
                suggestion_id=suggestion_id,
                suggestion_type="mapping_gap",
                severity="high",
                title=f"Add SOP coverage for {control_id}",
                detail=(
                    f"The RCM contains control {control_id}, but no matching process step was found "
                    "in the primary SOP. This is suggested because the SOP should describe the control "
                    "procedure that auditors will test against the RCM."
                    + (
                        " The SOP scope could not be assessed confidently, so this mapping gap requires "
                        "explicit reviewer confirmation before it is applied."
                        if requires_explicit_review
                        else ""
                    )
                ),
                original_text=None,
                proposed_text=_role_activity_sentence(owner, activity, evidence),
                target_anchor_id=procedure_anchor.anchor_id,
                edit_targets=edit_targets,
                review_status="pending",
                source_references=[
                    SourceReference(
                        document_id=procedure_anchor.file_id,
                        filename=filenames_by_file_id.get(procedure_anchor.file_id),
                        anchor_id=procedure_anchor.anchor_id,
                    ),
                    matrix_ref,
                ],
                queue_finding=True,
                requires_explicit_review=requires_explicit_review,
            )
        )
        if len(suggestions) >= 12:
            break
    return suggestions


def _best_anchor_for_control_candidate(
    candidate: dict,
    *,
    anchor_index: dict[str, Anchor],
    file_ids: set[str],
    fallback_anchor: Anchor,
) -> Anchor:
    query_tokens = _text_tokens(
        " ".join(
            str(candidate.get(key) or "")
            for key in (
                "control_id",
                "description",
                "owner",
                "frequency",
                "evidence_ref",
                "risk_description",
                "risk",
            )
        )
    )
    if len(query_tokens) < 2:
        return fallback_anchor
    best_anchor = fallback_anchor
    best_score = 0
    for anchor in anchor_index.values():
        if anchor.file_id not in file_ids:
            continue
        if anchor.section_type not in {"procedural", "purpose_scope", "unknown"}:
            continue
        if _anchor_looks_like_responsibility_area(anchor):
            continue
        anchor_tokens = _text_tokens(
            f"{anchor.heading} {anchor.section_path} {anchor.content}"
        )
        if not anchor_tokens:
            continue
        overlap = query_tokens.intersection(anchor_tokens)
        score = len(overlap)
        if anchor.anchor_id == fallback_anchor.anchor_id:
            score += 1
        if score > best_score:
            best_score = score
            best_anchor = anchor
    return best_anchor if best_score >= 2 else fallback_anchor


def _filenames_by_file_id(conversions: list[ConversionResult]) -> dict[str, str]:
    return {
        str(conversion.file_id): str(conversion.filename or conversion.file_id or "")
        for conversion in conversions
        if conversion.file_id
    }


def _first_anchor_for_files(
    anchor_index: dict[str, Anchor],
    file_ids: set[str],
) -> Anchor | None:
    for anchor in anchor_index.values():
        if (
            anchor.file_id in file_ids
            and anchor.section_type == "procedural"
            and not _anchor_looks_like_responsibility_area(anchor)
        ):
            return anchor
    for anchor in anchor_index.values():
        if anchor.file_id in file_ids and anchor.section_type == "procedural":
            return anchor
    for anchor in anchor_index.values():
        if anchor.file_id in file_ids:
            return anchor
    return None


def _first_responsibility_anchor_for_files(
    anchor_index: dict[str, Anchor],
    file_ids: set[str],
) -> Anchor | None:
    for anchor in anchor_index.values():
        if anchor.file_id in file_ids and _anchor_looks_like_responsibility_area(anchor):
            return anchor
    return None


def _anchor_looks_like_responsibility_area(anchor: Anchor) -> bool:
    tokens = _text_tokens(f"{anchor.heading} {anchor.section_path} {anchor.content}")
    responsibility_tokens = {
        "accountability",
        "accountable",
        "activity",
        "matrix",
        "owner",
        "ownership",
        "raci",
        "responsibilities",
        "responsibility",
        "role",
        "roles",
    }
    return bool(tokens.intersection(responsibility_tokens))


def _sentence_fragment(value: str) -> str:
    return " ".join(str(value or "").strip().rstrip(".").split())


def _role_activity_sentence(owner: str, activity: str, evidence: str) -> str:
    subject = _role_subject(owner)
    raw = _sentence_fragment(activity) or "the source activity"
    verb_match = _RCM_VERB_PREFIX.match(raw)
    verb = _normalize_rcm_verb(verb_match.group("verb")) if verb_match else ""
    stripped = raw[verb_match.end() :].strip() if verb_match else raw
    source_sentence = _owner_accountability_sentence(subject, owner, stripped)
    state_text = _state_activity_text(stripped)
    if source_sentence:
        action_sentence = source_sentence
    elif verb and verb not in _WEAK_RCM_VERBS:
        action_sentence = f"{subject} {verb} {_lower_first(stripped)}."
    elif state_text:
        action_sentence = f"{subject} ensures that {state_text}."
    else:
        activity_text = _lower_first(stripped or raw)
        if _contains_obligation_or_state(activity_text):
            action_sentence = f"{subject} is responsible for ensuring that {activity_text}."
        else:
            action_sentence = f"{subject} carries out {activity_text}."
    evidence_clean = _sentence_fragment(evidence)
    if evidence_clean and evidence_clean.casefold() not in _EVIDENCE_PLACEHOLDER:
        return f"{action_sentence} Retained evidence includes {evidence_clean}."
    return action_sentence


def _candidate_supports_responsibility_target(candidate: dict[str, Any]) -> bool:
    text = " ".join(
        str(candidate.get(key) or "")
        for key in (
            "description",
            "activity",
            "key_gap",
            "recommended_action",
            "recommendation",
        )
    )
    has_explicit_responsibility = bool(
        re.search(
            r"\b(accountab(?:le|ility)|responsib(?:le|ility)|owns?|ownership|duty|duties|authority|raci)\b",
            text,
            flags=re.IGNORECASE,
        )
    )
    if has_explicit_responsibility:
        return True
    owner = str(candidate.get("owner") or "")
    return _mentions_senior_role(owner) and _mentions_operational_action(text)


def _mentions_senior_role(text: str) -> bool:
    normalized = _normalize_signal_text(text)
    return any(signal in normalized for signal in _SENIOR_ROLE_SIGNALS)


def _mentions_operational_action(text: str) -> bool:
    tokens = set(_normalize_signal_text(text).split())
    if tokens.intersection(_OPERATIONAL_ACTION_SIGNALS):
        return True
    singularized = {
        token[:-1]
        for token in tokens
        if token.endswith("s") and len(token) > 4
    }
    return bool(singularized.intersection(_OPERATIONAL_ACTION_SIGNALS))


def _normalize_signal_text(text: str) -> str:
    return (
        str(text or "")
        .casefold()
        .replace("/", " ")
        .replace("-", " ")
        .replace("_", " ")
    )


def _normalize_rcm_verb(verb: str) -> str:
    cleaned = str(verb or "").strip().casefold()
    if not cleaned:
        return ""
    if cleaned in _WEAK_RCM_VERBS:
        return cleaned
    if cleaned.endswith("s"):
        return cleaned
    if cleaned.endswith("y"):
        return f"{cleaned[:-1]}ies"
    return f"{cleaned}s"


def _owner_accountability_sentence(subject: str, owner: str, text: str) -> str:
    owner_clean = _sentence_fragment(owner)
    if not owner_clean:
        return ""
    owner_pattern = re.escape(owner_clean)
    match = re.match(
        rf"^(?:the\s+)?{owner_pattern}\s+(?P<verb>is|are)\s+"
        rf"(?P<kind>accountable|responsible)\b(?P<rest>.*)$",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return _ensure_period(
            f"{subject} {match.group('verb').casefold()} "
            f"{match.group('kind').casefold()}{match.group('rest')}"
        )
    match = re.match(
        rf"^(?:the\s+)?{owner_pattern}\s+owns?\b(?P<rest>.*)$",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return _ensure_period(f"{subject} owns{match.group('rest')}")
    return ""


def _state_activity_text(text: str) -> str:
    clauses = [clause.strip() for clause in re.split(r"\s*;\s*", str(text or "")) if clause.strip()]
    if not clauses:
        return ""
    normalized: list[str] = []
    for clause in clauses:
        state_clause = _state_clause_text(clause)
        if not state_clause:
            return ""
        normalized.append(state_clause)
    return "; ".join(normalized)


def _state_clause_text(clause: str) -> str:
    match = re.match(
        r"^(?P<subject>.+?)\s+(?P<participle>"
        + "|".join(sorted(_STATE_PARTICIPLES))
        + r")\b(?P<rest>.*)$",
        clause,
        flags=re.IGNORECASE,
    )
    if not match:
        return ""
    phrase_subject = _lower_first(match.group("subject").strip())
    participle = match.group("participle").casefold()
    rest = match.group("rest").strip()
    auxiliary = "are" if _looks_plural_phrase(phrase_subject) else "is"
    return " ".join(part for part in (phrase_subject, auxiliary, participle, rest) if part)


def _looks_plural_phrase(text: str) -> bool:
    tokens = re.findall(r"[A-Za-z0-9]+", str(text or ""))
    if not tokens:
        return False
    last = tokens[-1].casefold()
    if last in {"data", "criteria"}:
        return True
    if last in {"edr", "siem", "soc"}:
        return False
    return last.endswith("s") and not last.endswith(("ss", "us"))


def _ensure_period(text: str) -> str:
    cleaned = _sentence_fragment(text)
    if not cleaned:
        return ""
    return cleaned if cleaned.endswith((".", "!", "?")) else f"{cleaned}."


def _role_subject(owner: str) -> str:
    cleaned = _sentence_fragment(owner) or "accountable owner"
    if cleaned.casefold().startswith(("the ", "a ", "an ")):
        return cleaned[0].upper() + cleaned[1:]
    return f"The {cleaned}"


def _contains_obligation_or_state(text: str) -> bool:
    tokens = {
        token.strip(".,;:()[]{}").casefold()
        for token in str(text or "").replace("/", " ").replace("-", " ").split()
    }
    return bool(tokens.intersection({"are", "completed", "is", "must", "shall", "should", "will"}))


def _lower_first(text: str) -> str:
    first_token = re.match(r"[A-Za-z0-9][A-Za-z0-9&/-]*", str(text or ""))
    if first_token:
        token = first_token.group(0)
        if len(token) > 1 and token.upper() == token:
            return text
    return text[:1].lower() + text[1:] if text else text


def _covered_control_ids_for_files(
    process_steps: list[dict],
    anchor_index: dict[str, Anchor],
    excel_results: list[ExcelPipelineResult],
    file_ids: set[str],
) -> set[str]:
    covered: set[str] = set()
    for step in process_steps:
        anchor = anchor_index.get(str(step.get("anchor_id") or ""))
        if not anchor or anchor.file_id not in file_ids:
            continue
        covered.update(_control_ids_from_step(step) or _infer_control_ids_from_step(step, excel_results))
    return covered


def _owner_matches(actor: str, owner: str) -> bool:
    actor_tokens = _text_tokens(actor)
    owner_tokens = _text_tokens(owner)
    if not actor_tokens or not owner_tokens:
        return True
    overlap = actor_tokens.intersection(owner_tokens)
    if overlap:
        return True
    shorter = min(len(actor_tokens), len(owner_tokens))
    return shorter > 0 and (len(overlap) / shorter) >= 0.5


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _infer_control_ids_from_step(
    step: dict,
    excel_results: list[ExcelPipelineResult],
) -> list[str]:
    candidates = _excel_control_candidates(excel_results)
    if not candidates:
        return []
    scored = [
        (_control_match_score(step, candidate), str(candidate.get("control_id") or ""))
        for candidate in candidates
        if candidate.get("control_id") and _has_control_coverage_signal(step, candidate)
    ]
    scored = [(score, control_id) for score, control_id in scored if score >= 3]
    if not scored:
        return []
    best_score = max(score for score, _control_id in scored)
    return [
        control_id
        for score, control_id in scored
        if score == best_score
    ][:2]


def _has_control_coverage_signal(step: dict, candidate: dict) -> bool:
    action_tokens = _text_tokens(str(step.get("action") or ""))
    evidence_tokens = _text_tokens(str(step.get("evidence") or ""))
    description_tokens = _text_tokens(str(candidate.get("description") or ""))
    evidence_ref_tokens = _text_tokens(str(candidate.get("evidence_ref") or ""))
    frequency_tokens = _text_tokens(str(candidate.get("frequency") or ""))
    activity_overlap = (action_tokens | evidence_tokens).intersection(
        description_tokens | evidence_ref_tokens | frequency_tokens
    )
    return len(activity_overlap) >= 2


def _excel_control_candidates(excel_results: list[ExcelPipelineResult]) -> list[dict]:
    by_control_id: dict[str, dict] = {}
    for result in excel_results:
        corpus_map = result.corpus_map
        if not corpus_map:
            continue
        for row in corpus_map.risk_to_control_map:
            control_id = str(row.get("control_id") or "")
            if not control_id:
                continue
            candidate = by_control_id.setdefault(control_id, {"control_id": control_id})
            candidate.update({key: value for key, value in row.items() if value})
        for row in corpus_map.evidence_to_control_map:
            control_id = str(row.get("control_id") or "")
            if not control_id:
                continue
            candidate = by_control_id.setdefault(control_id, {"control_id": control_id})
            if row.get("evidence_ref"):
                candidate["evidence_ref"] = row["evidence_ref"]
    return list(by_control_id.values())


def _control_match_score(step: dict, candidate: dict) -> int:
    actor_tokens = _text_tokens(str(step.get("actor") or ""))
    action_tokens = _text_tokens(str(step.get("action") or ""))
    evidence_tokens = _text_tokens(str(step.get("evidence") or ""))
    step_tokens = actor_tokens | action_tokens | evidence_tokens
    owner_tokens = _text_tokens(str(candidate.get("owner") or ""))
    evidence_ref_tokens = _text_tokens(str(candidate.get("evidence_ref") or ""))
    description_tokens = _text_tokens(str(candidate.get("description") or ""))
    frequency_tokens = _text_tokens(str(candidate.get("frequency") or ""))
    score = 0
    score += len(actor_tokens.intersection(owner_tokens)) * 4
    score += len(evidence_tokens.intersection(evidence_ref_tokens)) * 4
    score += len(action_tokens.intersection(description_tokens)) * 2
    score += len(step_tokens.intersection(description_tokens))
    score += len(step_tokens.intersection(frequency_tokens))
    return score


def _text_tokens(text: str) -> set[str]:
    normalized = (
        text.casefold()
        .replace("/", " ")
        .replace("-", " ")
        .replace("_", " ")
        .replace("(", " ")
        .replace(")", " ")
        .replace(";", " ")
        .replace(",", " ")
        .replace(".", " ")
    )
    stop_words = {
        "and",
        "the",
        "for",
        "with",
        "from",
        "into",
        "must",
        "shall",
        "using",
        "record",
        "records",
        "documented",
    }
    return {
        token
        for token in normalized.split()
        if token and (len(token) > 2 or token.isdigit()) and token not in stop_words
    }


def _control_ids_from_step(step: dict) -> list[str]:
    raw_values = [
        step.get("control_id"),
        step.get("matched_control_id"),
        step.get("control_reference"),
    ]
    control_ids: list[str] = []
    for value in raw_values:
        if isinstance(value, str) and value.strip():
            control_ids.append(value.strip())
    for key in ("control_ids", "matched_control_ids", "matched_controls"):
        value = step.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    control_ids.append(item.strip())
                elif isinstance(item, dict) and item.get("control_id"):
                    control_ids.append(str(item["control_id"]).strip())
    return list(dict.fromkeys(control_ids))


def _dedupe_terms(terms: list[dict]) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    deduped: list[dict] = []
    for term in terms:
        key = (str(term.get("term") or "").lower(), str(term.get("definition") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(term)
    return deduped


def _dedupe_steps(steps: list[dict]) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for step in steps:
        key = str(step.get("step_id") or step)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(step)
    return deduped


def _dedupe_suggestions(suggestions: list[Suggestion]) -> list[Suggestion]:
    seen: set[tuple[str, str, str | None]] = set()
    deduped: list[Suggestion] = []
    for suggestion in suggestions:
        key = (
            suggestion.suggestion_type,
            suggestion.title.strip().lower(),
            suggestion.proposed_text.strip().lower() if suggestion.proposed_text else None,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(suggestion)
    return deduped


def _normalise_suggestions(
    suggestions: list[Suggestion],
    conversions: list[ConversionResult],
) -> list[Suggestion]:
    filenames_by_file_id = _filenames_by_file_id(conversions)
    normalised: list[Suggestion] = []
    for suggestion in suggestions:
        if not _suggestion_has_material_content(suggestion):
            continue
        source_references = [
            _source_reference_with_filename(ref, filenames_by_file_id)
            for ref in suggestion.source_references
        ]
        if not source_references:
            continue
        edit_targets = [
            target.model_copy(
                update={
                    "source_references": [
                        _source_reference_with_filename(ref, filenames_by_file_id)
                        for ref in target.source_references
                    ]
                }
            )
            for target in suggestion.edit_targets
        ]
        normalised.append(
            suggestion.model_copy(
                update={
                    "source_references": source_references,
                    "edit_targets": edit_targets,
                }
            )
        )
    return _dedupe_suggestions(normalised)


def _source_reference_with_filename(
    ref: SourceReference,
    filenames_by_file_id: dict[str, str],
) -> SourceReference:
    if ref.filename:
        return ref
    filename = filenames_by_file_id.get(ref.document_id)
    if not filename:
        return ref
    return ref.model_copy(update={"filename": filename})


def _suggestion_has_material_content(suggestion: Suggestion) -> bool:
    title = str(suggestion.title or "").strip()
    detail = str(suggestion.detail or "").strip()
    proposed_text = str(suggestion.proposed_text or "").strip()
    if detail or proposed_text:
        return True
    default_title = suggestion.suggestion_type.replace("_", " ").title().casefold()
    return bool(title and title.casefold() != default_title and len(title) > 8)


def _partial_budget_result(
    process_steps: list[dict],
    suggestions: list[Suggestion],
    terminology: list[dict],
    llm_calls_used: int,
    extracted_items: list[ExtractedItem],
) -> AnalysisResult:
    return AnalysisResult(
        status="partial",
        error="LLM call budget exhausted",
        process_steps=_dedupe_steps(process_steps),
        suggestions=_dedupe_suggestions(suggestions),
        terminology=_dedupe_terms(terminology),
        extracted_controls=extracted_items,
        llm_calls_used=llm_calls_used,
    )

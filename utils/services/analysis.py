from __future__ import annotations

from datetime import date, datetime
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
)
from utils.sop_processing.content_sanitizer import sanitize_chunk
from utils.sop_processing.prompts import (
    cross_document_synthesis_prompt,
    document_metadata_prompt,
    procedural_extraction_prompt,
    section_classification_prompt,
    terminology_extraction_prompt,
)


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
                suggestions.extend(_suggestions_from_output(batch_output, batch))

        if corpus_context and process_steps and budget_remaining - llm_calls_used > 0:
            synthesis = _run_cross_document_synthesis(
                process_steps=process_steps,
                excel_results=excel_results,
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
            suggestions.extend(_suggestions_from_output(synthesis["output"], []))
            suggestions.extend(
                _cross_document_fallback_suggestions(
                    process_steps=process_steps,
                    anchor_index=anchor_index,
                    excel_results=excel_results,
                    conversions=conversions,
                )
            )

        return AnalysisResult(
            status="success",
            process_steps=_dedupe_steps(process_steps),
            suggestions=_dedupe_suggestions(suggestions),
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
) -> LLMResult:
    return call_llm(
        prompt=prompt,
        schema_name=schema_name,
        response_schema=response_schema,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining - llm_calls_used,
    )


def _apply_section_classification(
    anchors: list[Anchor],
    output: dict[str, Any] | None,
) -> list[Anchor]:
    sections = _array_output(output, "sections")
    section_by_id: dict[str, SectionType] = {}
    for section in sections:
        anchor_id = str(section.get("anchor_id") or "")
        section_type = str(section.get("section_type") or "procedural")
        section_by_id[anchor_id] = (
            section_type if section_type in SECTION_TYPES else "procedural"
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
) -> dict[str, Any]:
    result = _call_budgeted(
        prompt=prompt_builder(anchor),
        schema_name=schema_name,
        response_schema=response_schema,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining,
        llm_calls_used=llm_calls_used,
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
    pipeline_id: str,
    budget_remaining: int,
    llm_calls_used: int,
) -> dict[str, Any]:
    prompt = cross_document_synthesis_prompt(
        sop_steps=process_steps,
        rcm_controls=_risk_to_control_rows(excel_results),
        risk_items=_risk_rows(excel_results),
    )
    result = _call_budgeted(
        prompt=prompt,
        schema_name="cross_document_synthesis",
        response_schema=CROSS_DOCUMENT_SYNTHESIS_SCHEMA,
        pipeline_id=pipeline_id,
        budget_remaining=budget_remaining,
        llm_calls_used=llm_calls_used,
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
) -> list[Suggestion]:
    anchor_by_id = {anchor.anchor_id: anchor for anchor in anchors}
    return [
        suggestion
        for suggestion in (
            _suggestion_from_raw(item, anchor_by_id)
            for item in _array_output(output, "suggestions")
        )
        if suggestion is not None
    ]


def _suggestion_from_raw(
    raw: dict[str, Any],
    anchor_by_id: dict[str, Anchor],
) -> Suggestion | None:
    suggestion_type = _normalize_suggestion_type(raw.get("suggestion_type"))
    severity = _normalize_severity(raw.get("severity"))
    anchor_id = str(raw.get("anchor_id") or "")
    anchor = anchor_by_id.get(anchor_id)
    source_refs = _source_references(raw.get("source_references"))
    if not source_refs and anchor:
        source_refs = [
            SourceReference(document_id=anchor.file_id, anchor_id=anchor.anchor_id)
        ]
    if not source_refs and anchor_id:
        source_refs = [SourceReference(document_id="", anchor_id=anchor_id)]
    try:
        return Suggestion(
            suggestion_id=str(raw.get("suggestion_id") or uuid4()),
            suggestion_type=suggestion_type,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            title=str(raw.get("title") or suggestion_type.replace("_", " ").title()),
            detail=str(raw.get("detail") or raw.get("summary") or ""),
            proposed_text=raw.get("proposed_text"),
            original_text=raw.get("original_text"),
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


def _source_references(value: Any) -> list[SourceReference]:
    if not isinstance(value, list):
        return []
    refs: list[SourceReference] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        refs.append(
            SourceReference(
                document_id=str(item.get("document_id") or item.get("file_id") or ""),
                filename=item.get("filename"),
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


def _cross_document_mapping_gap_suggestions(
    process_steps: list[dict],
    anchor_index: dict[str, Anchor],
    excel_results: list[ExcelPipelineResult],
    conversions: list[ConversionResult],
) -> list[Suggestion]:
    filenames_by_file_id = _filenames_by_file_id(conversions)
    procedure_file_ids = {
        str(conversion.file_id)
        for conversion in conversions
        if conversion.file_id and conversion.tag == "procedure"
    }
    if not procedure_file_ids:
        return []
    primary_anchor = _first_anchor_for_files(anchor_index, procedure_file_ids)
    if not primary_anchor:
        return []

    covered_control_ids = _covered_control_ids_for_files(
        process_steps=process_steps,
        anchor_index=anchor_index,
        excel_results=excel_results,
        file_ids=procedure_file_ids,
    )
    suggestions: list[Suggestion] = []
    for candidate in _excel_control_candidates(excel_results):
        control_id = str(candidate.get("control_id") or "")
        if not control_id or control_id in covered_control_ids:
            continue
        matrix_ref = SourceReference(
            document_id=str(candidate.get("file_id") or ""),
            filename=candidate.get("filename"),
            sheet_name=candidate.get("sheet"),
            row_index=_as_int(candidate.get("row") or candidate.get("row_index")),
        )
        suggestions.append(
            Suggestion(
                suggestion_id=str(uuid4()),
                suggestion_type="mapping_gap",
                severity="high",
                title=f"Add SOP coverage for {control_id}",
                detail=(
                    f"The RCM contains control {control_id}, but no matching process step was found "
                    "in the primary SOP. This is suggested because the SOP should describe the control "
                    "procedure that auditors will test against the RCM."
                ),
                original_text=None,
                proposed_text=(
                    f"Add a procedure step for control {control_id} owned by "
                    f"{candidate.get('owner') or 'the accountable control owner'}. The step should describe "
                    f"{candidate.get('description') or 'the control activity'} and identify retained evidence: "
                    f"{candidate.get('evidence_ref') or 'the relevant control evidence'}."
                ),
                target_anchor_id=primary_anchor.anchor_id,
                review_status="pending",
                source_references=[
                    SourceReference(
                        document_id=primary_anchor.file_id,
                        filename=filenames_by_file_id.get(primary_anchor.file_id),
                        anchor_id=primary_anchor.anchor_id,
                    ),
                    matrix_ref,
                ],
                queue_finding=True,
            )
        )
        if len(suggestions) >= 12:
            break
    return suggestions


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
        if anchor.file_id in file_ids:
            return anchor
    return None


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
        if candidate.get("control_id")
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

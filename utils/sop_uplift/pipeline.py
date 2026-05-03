from __future__ import annotations

import os
import json
from typing import Any, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

import re

from utils.sop_uplift.analysis_engine import generate_rule_based_suggestions, mark_rule_fallback_suggestions, quality_gate_suggestions
from utils.sop_uplift.content_sanitizer import sanitize_chunk
from utils.sop_uplift.corpus_map import build_case_corpus_map
from utils.sop_uplift.diagram_model import DiagramEdge, DiagramLane, DiagramMeta, DiagramModel, DiagramNode
from utils.sop_uplift.extractors import extract_controls, extract_evidence, extract_risks, extract_sop_structure
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
from utils.sop_uplift.preview_renderer import build_preview_model
from utils.sop_uplift.prompt_templates import build_prompt
from utils.sop_uplift.retrieval import retrieve_context


ProgressCallback = Callable[[str, str, int, int, int], None]


def run_full_sop_pipeline(
    case: dict[str, Any],
    use_llm: bool = False,
    max_chunk_chars: int = 4000,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    def progress(phase: str, message: str, completed: int, total: int, percent: int) -> None:
        if progress_callback:
            progress_callback(phase, message, completed, total, percent)

    progress("parsing", "Reading uploaded document structure...", 1, 100, 20)
    anchors = list(case.get("anchors", []))
    content_anchors = [anchor for anchor in anchors if anchor.get("block_type") != "heading"]
    sop_file_ids = {
        tag.get("file_id")
        for tag in case.get("document_tags", [])
        if tag.get("confirmed_tag") in {"sop", "policy"}
    }
    if not sop_file_ids:
        sop_file_ids = {
            file_meta.get("file_id")
            for file_meta in case.get("uploaded_files", [])
            if file_meta.get("bucket") in {"sops", "procedures"}
        }
    chunks = list(case.get("chunks", []))
    sop_content_anchors = [
        anchor
        for anchor in content_anchors
        if not sop_file_ids or anchor.get("file_id") in sop_file_ids
    ]
    supporting_chunks = [
        chunk
        for chunk in chunks
        if sop_file_ids and chunk.get("file_id") and chunk.get("file_id") not in sop_file_ids
    ]
    prompt_runs = list(case.get("prompt_runs", []))
    warnings: list[str] = []

    sop_structures: list[dict[str, Any]] = []
    controls: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    risk_events: list[dict[str, Any]] = []
    requirements: list[dict[str, Any]] = []
    evidence_items: list[dict[str, Any]] = []
    issues_findings: list[dict[str, Any]] = []
    diagram_references: list[dict[str, Any]] = []

    anchors_by_document: dict[str, list[dict[str, Any]]] = {}
    for anchor in anchors:
        anchors_by_document.setdefault(anchor.get("document_id", ""), []).append(anchor)

    for document in case.get("markdown_documents", []):
        document_anchors = anchors_by_document.get(document.get("document_id", ""), [])
        markdown = document.get("markdown", "")
        sop_structure = extract_sop_structure(markdown, document_anchors)
        sop_structures.append({"document_id": document.get("document_id"), **sop_structure})
        controls.extend(_with_document(extract_controls(markdown, document_anchors), document))
        risks.extend(_with_document(extract_risks(markdown, document_anchors), document))
        evidence_items.extend(_with_document(extract_evidence(markdown, document_anchors), document))
        issues_findings.extend(_extract_findings(document_anchors, document))
        diagram_references.extend(_extract_diagram_references(document_anchors, document))

    progress("extracting", "Extracting SOP sections, controls, risks, and evidence...", 35, 100, 35)
    if use_llm:
        llm_result = _run_llm_pipeline(
            case=case,
            chunks=chunks,
            prompt_runs=prompt_runs,
            max_chunk_chars=max_chunk_chars,
            progress_callback=progress_callback,
        )
        if _llm_unavailable(llm_result.get("prompt_runs", [])):
            raise RuntimeError("Check LLM settings")
        prompt_runs = llm_result["prompt_runs"]
        warnings.extend(llm_result["warnings"])
        sop_structures.extend(llm_result["sop_structures"])
        controls.extend(llm_result["controls"])
        risks.extend(llm_result["risks"])
        risk_events.extend(llm_result["risk_events"])
        requirements.extend(llm_result["requirements"])
        evidence_items.extend(llm_result["evidence_items"])
        issues_findings.extend(llm_result["issues_findings"])
        diagram_references.extend(llm_result["diagram_references"])
    else:
        llm_result = {}

    if not requirements:
        requirements = [
            {
                "requirement_id": f"req_{anchor.get('anchor_id')}",
                "text": anchor.get("text", ""),
                "source_anchor_id": anchor.get("anchor_id", ""),
                "source_anchor_ids": [anchor.get("anchor_id", "")],
            }
            for anchor in content_anchors
            if anchor.get("text")
        ]

    case_context = llm_result.get("case_context") or _extract_case_context(case.get("case_chat", []))
    corpus_map = llm_result.get("corpus_map") or build_case_corpus_map(
        case,
        document_tags=list(case.get("document_tags", [])),
        controls=controls,
        risks=risks,
        requirements=requirements,
        evidence_items=evidence_items,
        issues_findings=issues_findings,
        diagram_references=diagram_references,
        case_chat_context=case_context,
    )
    corpus_map.setdefault("coverage_gaps", _coverage_gaps(controls, risks, evidence_items, diagram_references))
    progress("quality_gate", "Preparing and validating suggestions...", 85, 100, 85)
    preserved_suggestions = _preserved_suggestions(case.get("suggestions", []))
    quality_context = suggestion_quality_context(
        case,
        {
            "controls": controls,
            "risks": risks,
            "evidence_items": evidence_items,
            "requirements": requirements,
            "corpus_map": corpus_map,
        },
    )
    raw_llm_suggestions = llm_result.get("suggestions", [])
    llm_suggestions = quality_gate_suggestions(
        raw_llm_suggestions,
        eligible_anchor_ids=quality_context["eligible_sop_anchor_ids"],
        concrete_terms=quality_context["concrete_terms"],
        anchor_text_by_id=quality_context["anchor_text_by_id"],
        require_source_references=True,
        max_suggestions=12,
    )
    fallback_suggestions: list[dict[str, Any]] = []
    if not use_llm:
        fallback_context_chunks = [*supporting_chunks, *_case_context_chunks(case_context)]
        fallback_suggestions = mark_rule_fallback_suggestions(generate_rule_based_suggestions(sop_content_anchors, context_chunks=fallback_context_chunks))
        if fallback_suggestions:
            warnings.append("AI suggestion generation was not requested; rule fallback suggestions were used.")
    elif raw_llm_suggestions and not llm_suggestions:
        warnings.append("AI suggestion generation returned no usable suggestions after quality checks.")
    suggestions = _merge_suggestions(
        preserved_suggestions,
        llm_suggestions,
        fallback_suggestions,
        _missing_control_suggestions(sop_content_anchors, controls, risks, created_from="rule_fallback" if not use_llm else "llm"),
        _missing_control_prompt_suggestions(llm_result.get("missing_control_recommendations", [])),
    )
    suggestions = _apply_duplicate_merge(suggestions, llm_result.get("duplicate_groups", []))
    gate_kwargs: dict[str, Any] = {
        "eligible_anchor_ids": quality_context["eligible_sop_anchor_ids"],
        "max_suggestions": 12,
    }
    if use_llm:
        gate_kwargs.update(
            {
                "concrete_terms": quality_context["concrete_terms"],
                "anchor_text_by_id": quality_context["anchor_text_by_id"],
                "require_source_references": True,
            }
        )
    suggestions = quality_gate_suggestions(suggestions, **gate_kwargs)
    follow_up_questions = llm_result.get("agent_follow_up_questions") or _follow_up_questions(corpus_map, controls, risks, evidence_items, diagram_references)
    diagram_model = _diagram_model_from_payload(llm_result.get("diagram_model"), case) or _build_diagram_model(case, content_anchors, controls, risks, evidence_items, diagram_references)
    progress("indexing", "Building document preview and case index...", 92, 100, 92)
    preview_model = build_preview_model(case.get("markdown_documents", []), anchors, suggestions)

    processing_state = {
        **case.get("processing_state", {}),
        "pipeline": {
            "status": "complete",
            "total": len(chunks) or len(content_anchors),
            "completed": len(chunks) or len(content_anchors),
            "failed": 0,
            "pending": 0,
            "warnings": warnings,
        },
    }
    final_summary = llm_result.get("final_summary") or {
        "executive_summary": f"SOP Uplift pipeline completed for {case.get('process_name', 'the selected process')}.",
        "accepted_change_summary": [],
        "edited_change_summary": [],
        "rejected_change_summary": [],
        "risk_and_control_impact": corpus_map.get("coverage_gaps", []),
        "case_chat_context_summary": [item.get("value", "") for item in case_context],
        "open_items": [question.get("question", "") for question in follow_up_questions],
        "limitations": warnings,
    }
    return {
        "sop_structures": sop_structures,
        "extracted_controls": _dedupe_by_text(controls, "description"),
        "extracted_risks": _dedupe_by_text(risks, "description"),
        "extracted_risk_events": risk_events,
        "extracted_requirements": _dedupe_by_text(requirements, "text"),
        "evidence_items": _dedupe_by_text(evidence_items, "evidence_description"),
        "issues_findings": _dedupe_by_text(issues_findings, "description"),
        "diagram_references": _dedupe_by_text(diagram_references, "description"),
        "case_context": case_context,
        "corpus_map": corpus_map,
        "suggestions": suggestions,
        "agent_follow_up_questions": follow_up_questions,
        "duplicate_groups": llm_result.get("duplicate_groups", []),
        "conflicting_suggestions": llm_result.get("conflicting_suggestions", []),
        "diagram_model": diagram_model.model_dump(),
        "preview_model": preview_model,
        "final_summary": final_summary,
        "prompt_runs": prompt_runs,
        "processing_state": processing_state,
        "status": "review_ready",
    }


def _filename_by_document(case: dict[str, Any]) -> dict[str, str]:
    return {document.get("document_id", ""): document.get("filename", "") for document in case.get("markdown_documents", [])}


def _file_tag_by_id(case: dict[str, Any]) -> dict[str, str]:
    tags = {tag.get("file_id", ""): tag.get("confirmed_tag", "") for tag in case.get("document_tags", [])}
    bucket_map = {
        "sops": "sop",
        "procedures": "policy",
        "risk_control_matrices": "risk_control_matrix",
        "risk_registers": "risk_register",
        "control_inventories": "control_inventory",
        "evidence": "evidence",
        "diagrams": "process_diagram",
        "audit_reports": "audit_report",
    }
    for file_meta in case.get("uploaded_files", []):
        tags.setdefault(file_meta.get("file_id", ""), bucket_map.get(file_meta.get("bucket", ""), file_meta.get("bucket", "other")))
    return tags


def _anchors_for_chunk(case: dict[str, Any], chunk: dict[str, Any]) -> list[dict[str, Any]]:
    anchor_ids = set(chunk.get("anchor_ids") or [])
    return [anchor for anchor in case.get("anchors", []) if anchor.get("anchor_id") in anchor_ids]


def _anchors_for_unit(case: dict[str, Any], unit: dict[str, Any]) -> list[dict[str, Any]]:
    anchor_ids = set(unit.get("anchor_ids") or [])
    if anchor_ids:
        return [anchor for anchor in case.get("anchors", []) if anchor.get("anchor_id") in anchor_ids]
    document_id = unit.get("document_id", "")
    return [anchor for anchor in case.get("anchors", []) if anchor.get("document_id") == document_id]


def _anchor_summary(anchor: dict[str, Any]) -> dict[str, Any]:
    return {
        "anchor_id": anchor.get("anchor_id", ""),
        "section_path": anchor.get("section_path", []),
        "text": anchor.get("text", ""),
    }


def _nearby_sop_context(case: dict[str, Any], target_anchors: list[dict[str, Any]], limit: int = 2) -> list[dict[str, Any]]:
    if not target_anchors:
        return []
    target_file_id = target_anchors[0].get("file_id")
    target_ids = {anchor.get("anchor_id") for anchor in target_anchors}
    same_file = [anchor for anchor in case.get("anchors", []) if anchor.get("file_id") == target_file_id and anchor.get("block_type") != "heading"]
    nearby: list[dict[str, Any]] = []
    for index, anchor in enumerate(same_file):
        if anchor.get("anchor_id") not in target_ids:
            continue
        candidates = [item for item in same_file[max(0, index - limit):index] + same_file[index + 1:index + 1 + limit] if item.get("anchor_id") not in target_ids]
        nearby.extend(_anchor_summary(item) for item in candidates)
    deduped = []
    seen = set()
    for item in nearby:
        if item["anchor_id"] in seen:
            continue
        seen.add(item["anchor_id"])
        deduped.append(item)
    return deduped[: limit * 2]


def _style_reference(texts: list[str]) -> dict[str, Any]:
    joined = "\n".join(text for text in texts if text)
    lower = joined.lower()
    modal_candidates = ["shall", "must", "will", "should"]
    modal_style = next((modal for modal in modal_candidates if re.search(rf"\b{modal}\b", lower)), "")
    verbs = []
    for verb in ["review", "validate", "retain", "approve", "perform", "verify", "document", "escalate", "complete", "assess"]:
        if re.search(rf"\b{verb}\w*\b", lower):
            verbs.append(verb)
    terms = re.findall(r"\b[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\b|\b[A-Z]{2,}\b", joined)
    terms_to_preserve = []
    for term in terms:
        clean = " ".join(term.split())
        if len(clean) < 3 or clean in terms_to_preserve:
            continue
        terms_to_preserve.append(clean)
    sentence_examples = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", joined) if len(sentence.strip()) > 25][:3]
    return {
        "voice": "formal procedural",
        "common_verbs": verbs[:8],
        "modal_style": modal_style,
        "sentence_pattern_examples": sentence_examples,
        "terms_to_preserve": terms_to_preserve[:12],
    }


def _compact_items(items: list[Any], limit: int = 5) -> list[dict[str, Any]]:
    compacted = []
    allowed = {
        "control_id",
        "risk_id",
        "risk_event_id",
        "evidence_id",
        "requirement_id",
        "finding_id",
        "diagram_id",
        "step_id",
        "description",
        "text",
        "evidence_description",
        "source_anchor_id",
        "source_anchor_ids",
        "owner",
        "frequency",
        "cadence",
        "artifact",
        "system",
    }
    for item in (items or [])[:limit]:
        if isinstance(item, dict):
            compacted.append({key: value for key, value in item.items() if key in allowed})
        elif item is not None:
            text = " ".join(str(item).split())
            if text:
                compacted.append({"text": text})
    return compacted


def _requirements_with_text(requirements: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str]:
    retained = [item for item in requirements if str(item.get("text") or "").strip()]
    skipped = len(requirements) - len(retained)
    if not skipped:
        return retained, ""
    noun = "requirement" if skipped == 1 else "requirements"
    return retained, f"Skipped {skipped} extracted {noun} without text."


def _sop_file_ids(case: dict[str, Any]) -> set[str]:
    file_ids = {
        tag.get("file_id")
        for tag in case.get("document_tags", [])
        if tag.get("confirmed_tag") in {"sop", "policy"}
    }
    if file_ids:
        return {file_id for file_id in file_ids if file_id}
    return {
        file_meta.get("file_id")
        for file_meta in case.get("uploaded_files", [])
        if file_meta.get("bucket") in {"sops", "procedures"}
    }


def _supporting_facts(case: dict[str, Any], collected: dict[str, Any] | None = None, limit: int = 40) -> list[dict[str, Any]]:
    collected = collected or {}
    facts: list[dict[str, Any]] = []

    def add(kind: str, item: dict[str, Any], fields: list[str]) -> None:
        parts = [str(item.get(field, "")).strip() for field in fields if item.get(field)]
        text = " | ".join(part for part in parts if part)
        if text:
            facts.append({"kind": kind, "text": text, **{field: item.get(field) for field in fields if item.get(field)}})

    for item in [*case.get("extracted_controls", []), *collected.get("controls", [])]:
        if isinstance(item, dict):
            add("control", item, ["control_id", "description", "owner", "frequency", "cadence", "artifact", "system", "source_anchor_id"])
    for item in [*case.get("extracted_risks", []), *collected.get("risks", [])]:
        if isinstance(item, dict):
            add("risk", item, ["risk_id", "description", "source_anchor_id"])
    for item in [*case.get("evidence_items", []), *collected.get("evidence_items", [])]:
        if isinstance(item, dict):
            add("evidence", item, ["evidence_id", "evidence_description", "artifact", "system", "source_anchor_id"])
    for item in collected.get("requirements", []):
        if isinstance(item, dict):
            add("requirement", item, ["requirement_id", "text", "source_anchor_id"])

    corpus_map = collected.get("corpus_map") or case.get("corpus_map", {})
    for key in ["actors", "systems"]:
        for item in corpus_map.get(key, [])[:10] if isinstance(corpus_map, dict) else []:
            if item:
                facts.append({"kind": key.rstrip("s"), "text": str(item)})
    for key in ["risk_to_control_map", "sop_to_control_map", "evidence_to_control_map", "coverage_gaps"]:
        for item in corpus_map.get(key, [])[:10] if isinstance(corpus_map, dict) else []:
            if isinstance(item, dict):
                add(key, item, list(item.keys())[:8])
            elif item:
                facts.append({"kind": key, "text": str(item)})
    sop_ids = _sop_file_ids(case)
    for chunk in case.get("chunks", []):
        if len(facts) >= limit:
            break
        if sop_ids and chunk.get("file_id") in sop_ids:
            continue
        excerpt = " ".join(str(chunk.get("content", "")).split())
        if len(excerpt) >= 30:
            facts.append(
                {
                    "kind": "supporting_excerpt",
                    "text": excerpt[:700],
                    "source_anchor_ids": chunk.get("anchor_ids", []),
                }
            )
    for tag in case.get("document_tags", []):
        if tag.get("confirmed_tag"):
            facts.append({"kind": "document_tag", "text": f"{tag.get('filename') or tag.get('file_id')}: {tag.get('confirmed_tag')}"})
    return facts[:limit]


def _concrete_terms_from_facts(facts: list[dict[str, Any]]) -> list[str]:
    terms: list[str] = []

    def remember(term: str) -> None:
        clean = " ".join(term.split())
        if len(clean) >= 4 and clean not in terms:
            terms.append(clean)

    for fact in facts:
        for value in fact.values():
            if not isinstance(value, str):
                continue
            clean = " ".join(value.split())
            remember(clean)
            for identifier in re.findall(r"\b[A-Z]{1,5}-[A-Z0-9-]{1,}\b|\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b", clean):
                remember(identifier)
            for phrase in re.findall(r"\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){1,5}\b", clean):
                remember(phrase)
            tokens = [
                token
                for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9/-]{2,}", clean.lower())
                if token not in {"and", "for", "the", "with", "from", "into", "shall", "must", "should", "requires", "require"}
            ]
            for size in (4, 3, 2):
                for index in range(0, max(0, len(tokens) - size + 1)):
                    remember(" ".join(tokens[index : index + size]))
    return terms[:100]


def suggestion_quality_context(case: dict[str, Any], collected: dict[str, Any] | None = None) -> dict[str, Any]:
    sop_ids = _sop_file_ids(case)
    eligible = [
        anchor
        for anchor in case.get("anchors", [])
        if anchor.get("block_type") != "heading" and (not sop_ids or anchor.get("file_id") in sop_ids)
    ]
    facts = _supporting_facts(case, collected)
    return {
        "eligible_sop_anchor_ids": [anchor.get("anchor_id", "") for anchor in eligible if anchor.get("anchor_id")],
        "eligible_sop_anchors": [_anchor_summary(anchor) for anchor in eligible][:80],
        "anchor_text_by_id": {anchor.get("anchor_id", ""): anchor.get("text", "") for anchor in eligible if anchor.get("anchor_id")},
        "supporting_facts": facts,
        "concrete_terms": _concrete_terms_from_facts(facts),
    }


def build_suggestion_context(case: dict[str, Any], chunk: dict[str, Any]) -> dict[str, Any]:
    target_anchors = _anchors_for_chunk(case, chunk)
    primary_anchor = target_anchors[0] if target_anchors else {}
    nearby = _nearby_sop_context(case, target_anchors)
    support_chunks = [item for item in case.get("chunks", []) if item.get("file_id") != chunk.get("file_id")]
    retrieved = retrieve_context(chunk.get("content", ""), support_chunks, limit=5) or support_chunks[:5]
    filenames = _filename_by_document(case)
    file_tags = _file_tag_by_id(case)
    supporting_context = []
    for item in retrieved[:5]:
        supporting_context.append(
            {
                "source_type": file_tags.get(item.get("file_id", ""), "other"),
                "filename": filenames.get(item.get("document_id", ""), ""),
                "document_id": item.get("document_id", ""),
                "file_id": item.get("file_id", ""),
                "chunk_id": item.get("chunk_id", ""),
                "anchor_ids": item.get("anchor_ids", []),
                "excerpt": " ".join(str(item.get("content", "")).split())[:900],
                "why_relevant": "retrieved_by_similarity",
            }
        )
    style_texts = [chunk.get("content", ""), *[item.get("text", "") for item in nearby]]
    quality_context = suggestion_quality_context(case)
    return {
        "case": {
            "case_id": case.get("case_id", ""),
            "title": case.get("title", ""),
            "process_name": case.get("process_name", ""),
            "domain_label": case.get("domain_label", ""),
        },
        "sop_section": {
            "anchor_ids": chunk.get("anchor_ids", []),
            "section_path": primary_anchor.get("section_path", []),
            "text": chunk.get("content", ""),
        },
        "nearby_sop_context": nearby,
        "supporting_context": supporting_context,
        "eligible_sop_anchor_ids": quality_context["eligible_sop_anchor_ids"],
        "eligible_sop_anchors": quality_context["eligible_sop_anchors"],
        "supporting_facts": quality_context["supporting_facts"],
        "style_reference": _style_reference(style_texts),
        "extracted_case_map": {
            "controls": _compact_items(case.get("extracted_controls", [])),
            "risks": _compact_items(case.get("extracted_risks", [])),
            "evidence_items": _compact_items(case.get("evidence_items", [])),
            "risk_to_control_map": case.get("corpus_map", {}).get("risk_to_control_map", [])[:5],
            "sop_to_control_map": case.get("corpus_map", {}).get("sop_to_control_map", [])[:5],
            "coverage_gaps": case.get("corpus_map", {}).get("coverage_gaps", [])[:5],
        },
    }


def build_case_suggestion_context(case: dict[str, Any], analysis_units: list[dict[str, Any]], collected: dict[str, Any]) -> dict[str, Any]:
    file_tags = _file_tag_by_id(case)
    sop_file_ids = {
        tag.get("file_id")
        for tag in case.get("document_tags", [])
        if tag.get("confirmed_tag") in {"sop", "policy"}
    }
    sop_anchors = [
        _anchor_summary(anchor)
        for anchor in case.get("anchors", [])
        if anchor.get("block_type") != "heading" and (not sop_file_ids or anchor.get("file_id") in sop_file_ids)
    ][:80]
    sop_texts = [anchor.get("text", "") for anchor in case.get("anchors", []) if anchor.get("block_type") != "heading" and (not sop_file_ids or anchor.get("file_id") in sop_file_ids)]
    supporting_context = []
    for unit in analysis_units:
        source_type = file_tags.get(unit.get("file_id", ""), "other")
        if source_type in {"sop", "policy"}:
            continue
        supporting_context.append(
            {
                "source_type": source_type,
                "filename": unit.get("filename", ""),
                "document_id": unit.get("document_id", ""),
                "file_id": unit.get("file_id", ""),
                "anchor_ids": unit.get("anchor_ids", [])[:20],
                "excerpt": " ".join(str(unit.get("content", "")).split())[:2500],
            }
        )
    quality_context = suggestion_quality_context(case, collected)
    return {
        "case": {
            "case_id": case.get("case_id", ""),
            "title": case.get("title", ""),
            "process_name": case.get("process_name", ""),
            "domain_label": case.get("domain_label", ""),
        },
        "style_reference": _style_reference(sop_texts),
        "sop_anchors": sop_anchors,
        "eligible_sop_anchor_ids": quality_context["eligible_sop_anchor_ids"],
        "eligible_sop_anchors": quality_context["eligible_sop_anchors"],
        "supporting_context": supporting_context[:8],
        "supporting_facts": quality_context["supporting_facts"],
        "extracted_case_map": {
            "controls": _compact_items([*case.get("extracted_controls", []), *collected.get("controls", [])], limit=30),
            "risks": _compact_items([*case.get("extracted_risks", []), *collected.get("risks", [])], limit=30),
            "evidence_items": _compact_items([*case.get("evidence_items", []), *collected.get("evidence_items", [])], limit=30),
            "risk_events": _compact_items(collected.get("risk_events", []), limit=20),
            "findings": _compact_items(collected.get("issues_findings", []), limit=20),
            "requirements": _compact_items(collected.get("requirements", []), limit=40),
            "diagram_references": _compact_items(collected.get("diagram_references", []), limit=15),
            "corpus_map": collected.get("corpus_map") or case.get("corpus_map", {}),
        },
    }


def build_diagram_context(case: dict[str, Any], collected: dict[str, Any]) -> dict[str, Any]:
    sop_steps: list[dict[str, Any]] = []
    for structure in collected.get("sop_structures", []) or []:
        sop_steps.extend(_compact_items(structure.get("process_steps", []), limit=80))
    if not sop_steps:
        sop_steps = [
            _anchor_summary(anchor)
            for anchor in case.get("anchors", [])
            if anchor.get("block_type") != "heading"
        ][:80]
    return {
        "case": {
            "case_id": case.get("case_id", ""),
            "title": case.get("title", ""),
            "process_name": case.get("process_name", ""),
            "domain_label": case.get("domain_label", ""),
        },
        "sop_steps": sop_steps[:80],
        "requirements": _compact_items(collected.get("requirements", []), limit=60),
        "controls": _compact_items([*case.get("extracted_controls", []), *collected.get("controls", [])], limit=60),
        "risks": _compact_items([*case.get("extracted_risks", []), *collected.get("risks", [])], limit=60),
        "risk_events": _compact_items(collected.get("risk_events", []), limit=40),
        "evidence_items": _compact_items([*case.get("evidence_items", []), *collected.get("evidence_items", [])], limit=60),
        "findings": _compact_items(collected.get("issues_findings", []), limit=40),
        "diagram_references": _compact_items(collected.get("diagram_references", []), limit=40),
        "case_context": collected.get("case_context") or _extract_case_context(case.get("case_chat", [])),
        "corpus_map": collected.get("corpus_map") or case.get("corpus_map", {}),
    }


def _preserved_suggestions(suggestions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    generated = {"analysis", "llm", "rule_fallback"}
    return [
        suggestion
        for suggestion in suggestions
        if suggestion.get("status") in {"accepted", "edited", "rejected"} or suggestion.get("created_from") not in generated
    ]


def _run_llm_pipeline(
    case: dict[str, Any],
    chunks: list[dict[str, Any]],
    prompt_runs: list[dict[str, Any]],
    max_chunk_chars: int,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    collected = {
        "sop_structures": [],
        "controls": [],
        "risks": [],
        "risk_events": [],
        "requirements": [],
        "evidence_items": [],
        "issues_findings": [],
        "diagram_references": [],
        "suggestions": [],
        "missing_control_recommendations": [],
        "duplicate_groups": [],
        "conflicting_suggestions": [],
        "case_context": [],
        "corpus_map": {},
        "agent_follow_up_questions": [],
        "diagram_model": {},
        "final_summary": {},
        "warnings": [],
        "prompt_runs": prompt_runs,
    }
    pre_suggestion_case_stages = [
        ("case_chat_context_extraction", CaseChatContextExtractionResponse),
        ("corpus_map", CorpusMapResponse),
    ]
    analysis_units = _document_analysis_units(case, chunks)
    total_prompts = max(1, len(analysis_units) + len(pre_suggestion_case_stages) + 2)
    completed_prompts = 0

    def progress(stage: str, message: str | None = None) -> None:
        if not progress_callback:
            return
        percent = 40 + min(40, round((completed_prompts / total_prompts) * 40))
        progress_callback("analyzing", message or f"Analyzing case files with AI ({stage.replace('_', ' ')})...", completed_prompts, total_prompts, percent)

    file_tags = _file_tag_by_id(case)

    def run_document_extraction(unit: dict[str, Any]) -> dict[str, Any]:
        content = unit.get("content", "")
        sanitized = sanitize_chunk(
            content,
            file_id=unit.get("document_id", ""),
            anchor_id=(unit.get("anchor_ids") or [""])[0],
            max_chunk_chars=max(max_chunk_chars, len(content) + 1),
        )
        stage = "full_document_extraction"
        prompt = build_prompt(
            stage,
            document_metadata={
                "document_id": unit.get("document_id", ""),
                "file_id": unit.get("file_id", ""),
                "filename": unit.get("filename", ""),
                "confirmed_tag": file_tags.get(unit.get("file_id", ""), "other"),
            },
            delimited_content=sanitized.delimited_content,
            anchors_in_chunk=[_anchor_summary(anchor) for anchor in _anchors_for_unit(case, unit)][:120],
        )
        result = run_json_prompt(stage, prompt, FullDocumentExtractionResponse)
        return {"unit": unit, "result": result, "warnings": sanitized.warnings}

    document_workers = _document_llm_workers(len(analysis_units))
    progress("full_document_extraction", f"Analyzing {len(analysis_units)} full documents with AI...")
    with ThreadPoolExecutor(max_workers=document_workers) as executor:
        futures = [executor.submit(run_document_extraction, unit) for unit in analysis_units]
        for future in as_completed(futures):
            extraction = future.result()
            unit = extraction["unit"]
            result = extraction["result"]
            collected["warnings"].extend(extraction.get("warnings", []))
            stage = "full_document_extraction"
            completed_prompts += 1
            progress(stage, f"Analyzing full document with AI ({unit.get('filename') or unit.get('document_id')})...")
            collected["prompt_runs"].append(result.record)
            if not result.parsed:
                collected["warnings"].append(result.record.get("error") or f"{stage} returned invalid JSON")
                continue
            payload = result.parsed.model_dump()
            if payload.get("sections") or payload.get("process_steps"):
                collected["sop_structures"].append(
                    {
                        "chunk_id": unit.get("chunk_id"),
                        "document_id": unit.get("document_id"),
                        "sections": payload.get("sections", []),
                        "process_steps": payload.get("process_steps", []),
                    }
                )
            requirements, requirement_warning = _requirements_with_text(payload.get("requirements", []))
            collected["requirements"].extend(requirements)
            if requirement_warning:
                collected["warnings"].append(requirement_warning)
            collected["controls"].extend(_with_unit(payload.get("controls", []), unit))
            collected["risks"].extend(_with_unit(payload.get("risks", []), unit))
            collected["risk_events"].extend(_with_unit(payload.get("risk_events", []), unit))
            collected["evidence_items"].extend(_with_unit(payload.get("evidence_items", []), unit))
            collected["issues_findings"].extend(_with_unit(payload.get("findings", []), unit))
            if payload.get("diagram_summary") or payload.get("steps") or payload.get("lanes_or_roles"):
                collected["diagram_references"].append(
                    {
                        "diagram_id": f"diagram_{unit.get('chunk_id')}",
                        "description": payload.get("diagram_summary", ""),
                        "lanes_or_roles": payload.get("lanes_or_roles", []),
                        "steps": payload.get("steps", []),
                        "decisions": payload.get("decisions", []),
                        "systems": payload.get("systems", []),
                        "controls": payload.get("diagram_controls", []),
                        "risks": payload.get("diagram_risks", []),
                        "evidence_points": payload.get("evidence_points", []),
                        "source_anchor_id": (unit.get("anchor_ids") or [""])[0],
                        "document_id": unit.get("document_id"),
                        "file_id": unit.get("file_id"),
                    }
                )
            collected["warnings"].extend(payload.get("warnings", []))

    for stage, schema in pre_suggestion_case_stages:
        progress(stage)
        _run_case_level_prompt(stage, schema, case, collected)
        completed_prompts += 1
        progress(stage)

    stage = "case_sop_uplift_suggestions"
    progress(stage, "Generating case-level SOP suggestions with AI...")
    suggestion_context = build_case_suggestion_context(case, analysis_units, collected)
    prompt = build_prompt(stage, suggestion_context=suggestion_context)
    result = run_json_prompt(stage, prompt, SopSuggestionResponse)
    completed_prompts += 1
    progress(stage, "Generating case-level SOP suggestions with AI...")
    collected["prompt_runs"].append(result.record)
    if result.parsed:
        payload = result.parsed.model_dump()
        for suggestion in payload.get("suggestions", []):
            collected["suggestions"].append({**suggestion, "status": "open", "created_from": "llm"})
        collected["warnings"].extend(payload.get("warnings", []))
    else:
        collected["warnings"].append(result.record.get("error") or f"{stage} returned invalid JSON")

    stage = "case_finalization"
    progress(stage, "Finalizing case analysis with AI...")
    _run_case_level_prompt(stage, CaseFinalizationResponse, case, collected)
    completed_prompts += 1
    progress(stage, "Finalizing case analysis with AI...")
    return collected


def _document_llm_workers(document_count: int) -> int:
    try:
        configured = int(os.getenv("SOP_UPLIFT_DOCUMENT_LLM_WORKERS", "3"))
    except ValueError:
        configured = 3
    return max(1, min(document_count or 1, configured))


def _document_analysis_units(case: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anchors_by_document: dict[str, list[dict[str, Any]]] = {}
    chunks_by_document: dict[str, list[dict[str, Any]]] = {}
    for anchor in case.get("anchors", []):
        anchors_by_document.setdefault(anchor.get("document_id", ""), []).append(anchor)
    for chunk in chunks:
        chunks_by_document.setdefault(chunk.get("document_id", ""), []).append(chunk)

    units: list[dict[str, Any]] = []
    for document in case.get("markdown_documents", []):
        document_id = document.get("document_id", "")
        document_anchors = anchors_by_document.get(document_id, [])
        document_chunks = chunks_by_document.get(document_id, [])
        anchor_ids = [anchor.get("anchor_id", "") for anchor in document_anchors if anchor.get("anchor_id")]
        content = document.get("markdown", "")
        if not content and document_chunks:
            content = "\n\n".join(chunk.get("content", "") for chunk in document_chunks)
        if not content:
            continue
        units.append(
            {
                "chunk_id": f"doc_unit_{document_id}",
                "document_id": document_id,
                "file_id": document.get("file_id", ""),
                "filename": document.get("filename", ""),
                "content": content,
                "anchor_ids": anchor_ids,
            }
        )
    if units:
        return units
    return chunks


def _run_case_level_prompt(stage: str, schema: Any, case: dict[str, Any], collected: dict[str, Any]) -> None:
    structured_data = collected
    if stage in {"case_finalization", "swimlane_diagram_model"}:
        structured_data = {
            "analysis": collected,
            "diagram_context": build_diagram_context(case, collected),
        }
    prompt = build_prompt(
        stage,
        case_summary={"case_id": case.get("case_id"), "process_name": case.get("process_name")},
        chat_messages=case.get("case_chat", []),
        structured_data=structured_data,
        suggestions=[],
        context=collected,
        outputs=[],
    )
    result = run_json_prompt(stage, prompt, schema)
    collected["prompt_runs"].append(result.record)
    if result.record.get("validation_status") != "valid":
        collected["warnings"].append(result.record.get("error") or f"{stage} returned invalid JSON")
        return
    payload = result.parsed.model_dump() if result.parsed else {}
    collected["warnings"].extend(payload.get("warnings", []))
    if stage == "case_chat_context_extraction":
        collected["case_context"].extend(payload.get("captured_context", []))
        collected["agent_follow_up_questions"].extend(_normalize_questions(payload.get("agent_follow_up_questions", [])))
    elif stage == "corpus_map":
        collected["corpus_map"] = payload
    elif stage == "missing_control_recommendations":
        collected["missing_control_recommendations"] = payload.get("missing_control_recommendations", [])
    elif stage == "duplicate_conflict_merge":
        collected["duplicate_groups"] = payload.get("duplicate_groups", [])
        collected["conflicting_suggestions"] = payload.get("conflicting_suggestions", [])
    elif stage == "agent_follow_up_questions":
        collected["agent_follow_up_questions"].extend(_normalize_questions(payload.get("questions", [])))
    elif stage == "swimlane_diagram_model":
        collected["diagram_model"] = payload
    elif stage == "final_summary_change_log":
        collected["final_summary"] = payload
    elif stage == "case_finalization":
        collected["missing_control_recommendations"] = payload.get("missing_control_recommendations", [])
        collected["duplicate_groups"] = payload.get("duplicate_groups", [])
        collected["conflicting_suggestions"] = payload.get("conflicting_suggestions", [])
        collected["agent_follow_up_questions"].extend(_normalize_questions(payload.get("questions", [])))
        collected["diagram_model"] = payload.get("diagram_model", {})
        collected["final_summary"] = payload.get("final_summary", {})


def _with_document(items: list[dict[str, Any]], document: dict[str, Any]) -> list[dict[str, Any]]:
    return [{**item, "document_id": document.get("document_id"), "file_id": document.get("file_id")} for item in items]


def _with_unit(items: list[dict[str, Any]], unit: dict[str, Any]) -> list[dict[str, Any]]:
    return [{**item, "document_id": unit.get("document_id"), "file_id": unit.get("file_id")} for item in items]


def _extract_findings(anchors: list[dict[str, Any]], document: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    for index, anchor in enumerate(anchors):
        text = anchor.get("text", "")
        if any(term in text.lower() for term in ["issue", "finding", "audit", "remediation"]):
            findings.append(
                {
                    "finding_id": f"finding_{index + 1}",
                    "description": text,
                    "source_anchor_id": anchor.get("anchor_id", ""),
                    "document_id": document.get("document_id"),
                    "file_id": document.get("file_id"),
                }
            )
    return findings


def _extract_diagram_references(anchors: list[dict[str, Any]], document: dict[str, Any]) -> list[dict[str, Any]]:
    refs = []
    for index, anchor in enumerate(anchors):
        text = anchor.get("text", "")
        lower = text.lower()
        if any(term in lower for term in ["process", "step", "approve", "review", "control", "risk", "evidence"]):
            refs.append(
                {
                    "diagram_id": f"diagram_ref_{index + 1}",
                    "description": text,
                    "source_anchor_id": anchor.get("anchor_id", ""),
                    "document_id": document.get("document_id"),
                    "file_id": document.get("file_id"),
                }
            )
    return refs


def _extract_case_context(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    context = []
    for message in messages:
        captured = message.get("captured_context")
        if captured:
            context.append({**captured, "message_id": message.get("message_id"), "value": captured.get("value") or message.get("content", "")})
    return context


def _case_context_chunks(case_context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for index, item in enumerate(case_context or []):
        value = str(item.get("value") or "").strip()
        if not value:
            continue
        context_type = str(item.get("type") or "case_context").strip() or "case_context"
        chunks.append(
            {
                "chunk_id": f"case_context_{index + 1}",
                "document_id": "case_chat",
                "file_id": "case_chat",
                "content": f"Case context {context_type}: {value}",
                "anchor_ids": [f"case_context_{index + 1}"],
            }
        )
    return chunks


def _coverage_gaps(
    controls: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    evidence_items: list[dict[str, Any]],
    diagram_references: list[dict[str, Any]],
) -> list[str]:
    gaps = []
    if risks and not controls:
        gaps.append("risk_without_control_coverage")
    if controls and not evidence_items:
        gaps.append("control_without_evidence_reference")
    if not diagram_references:
        gaps.append("process_diagram_not_available")
    return gaps


def _missing_control_suggestions(
    anchors: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    created_from: str = "rule_fallback",
) -> list[dict[str, Any]]:
    if controls or not risks:
        return []
    anchor = anchors[0] if anchors else {}
    return [
        {
            "suggestion_id": f"missing_control_{anchor.get('anchor_id', 'case')}",
            "type": "missing_control",
            "severity": "high",
            "status": "open",
            "anchor_id": anchor.get("anchor_id", ""),
            "title": "Add control coverage for identified risk",
            "summary": "Uploaded risk context does not yet map to a clear SOP control step.",
            "suggested_text": "",
            "source_references": [{"risk_id": item.get("risk_id")} for item in risks],
            "anchor_confidence": "medium",
            "created_from": created_from,
        }
    ]


def _merge_suggestions(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for group in groups:
        for suggestion in group:
            suggestion_id = suggestion.get("suggestion_id") or f"sug_{len(merged) + 1}"
            merged[suggestion_id] = {**suggestion, "suggestion_id": suggestion_id}
    return list(merged.values())


def _missing_control_prompt_suggestions(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    suggestions = []
    for index, recommendation in enumerate(recommendations):
        suggestions.append(
            {
                "suggestion_id": f"missing_control_{recommendation.get('recommendation_id') or index + 1}",
                "type": "missing_control",
                "severity": recommendation.get("severity", "medium"),
                "status": "open",
                "anchor_id": recommendation.get("anchor_id", ""),
                "title": "Add missing control coverage",
                "summary": recommendation.get("gap_summary", "Add a control step supported by uploaded case context."),
                "suggested_text": recommendation.get("suggested_sop_insert", ""),
                "source_references": recommendation.get("source_references", []),
                "anchor_confidence": "medium",
                "created_from": "llm",
            }
        )
    return suggestions


def _apply_duplicate_merge(suggestions: list[dict[str, Any]], duplicate_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    remove_ids = set()
    for group in duplicate_groups:
        primary = group.get("recommended_primary_suggestion_id")
        for suggestion_id in group.get("suggestion_ids", []):
            if suggestion_id != primary:
                remove_ids.add(suggestion_id)
    return [suggestion for suggestion in suggestions if suggestion.get("suggestion_id") not in remove_ids]


def _normalize_questions(questions: list[dict[str, Any] | str]) -> list[dict[str, Any]]:
    normalized = []
    for index, question in enumerate(questions):
        if isinstance(question, str):
            normalized.append({"question_id": f"q_llm_{index + 1}", "question": question, "priority": "medium"})
        else:
            normalized.append(question)
    return normalized


def _diagram_model_from_payload(payload: dict[str, Any] | None, case: dict[str, Any]) -> DiagramModel | None:
    if not payload or not payload.get("nodes"):
        return None
    try:
        model = DiagramModel(
            title=payload.get("title") or f"{case.get('process_name') or 'SOP'} Swimlane",
            case_title=case.get("title", ""),
            process_name=case.get("process_name", ""),
            meta=DiagramMeta.model_validate(payload.get("meta", {})),
            lanes=[DiagramLane.model_validate(lane) for lane in payload.get("lanes", [])],
            nodes=[DiagramNode.model_validate(node) for node in payload.get("nodes", [])],
            edges=[DiagramEdge.model_validate(edge) for edge in payload.get("edges", [])],
            control_summary=payload.get("control_summary", []),
            risk_summary=payload.get("risk_summary", []),
            warnings=payload.get("warnings", []),
        )
        return normalize_diagram_model(model, fallback_warning="Diagram generated with repaired layout")
    except Exception:
        return None


def _safe_id(value: str, fallback: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_]+", "_", (value or "").strip().lower()).strip("_")
    return clean or fallback


def _infer_shape(node: DiagramNode, index: int, total: int) -> str:
    label = node.label.lower()
    if node.shape != "process":
        return node.shape
    if index == 0 or index == total - 1 or label in {"start", "end"}:
        return "start_end"
    if node.type == "decision" or "?" in node.label or any(term in label for term in ["approved", "approve?", "exception", "high risk", "complete?"]):
        return "decision"
    if node.type == "evidence" or any(term in label for term in ["repository", "system", "database", "ticket", "evidence", "file", "dms"]):
        return "data_store"
    return "process"


def normalize_diagram_model(model: DiagramModel, fallback_warning: str = "") -> DiagramModel:
    warnings = list(model.warnings)
    lanes = sorted(model.lanes, key=lambda lane: lane.order)
    if not lanes:
        lanes = [DiagramLane(lane_id="process_owner", name="Process Owner", order=1)]
        warnings.append("Diagram generated with repaired lanes")
    lane_ids = {lane.lane_id for lane in lanes}
    nodes: list[DiagramNode] = []
    badge_counts = {"control": 0, "risk": 0, "evidence": 0}
    prefix = {"control": "C", "risk": "R", "evidence": "E"}
    for index, node in enumerate(model.nodes):
        lane_id = node.lane_id if node.lane_id in lane_ids else lanes[0].lane_id
        if lane_id != node.lane_id:
            warnings.append(f"Diagram node {node.node_id} referenced an unknown lane and was reassigned")
        node_type = node.type
        badge = node.badge
        if node_type in badge_counts and not badge:
            badge_counts[node_type] += 1
            badge = f"{prefix[node_type]}{badge_counts[node_type]}"
        elif node_type in badge_counts and badge:
            match = re.match(r"([CRE])(\d+)", badge)
            if match:
                reverse = {"C": "control", "R": "risk", "E": "evidence"}
                badge_counts[reverse[match.group(1)]] = max(badge_counts[reverse[match.group(1)]], int(match.group(2)))
        nodes.append(
            node.model_copy(
                update={
                    "lane_id": lane_id,
                    "column": max(0, int(node.column or index)),
                    "shape": _infer_shape(node, index, len(model.nodes)),
                    "badge": badge,
                }
            )
        )
    node_ids = {node.node_id for node in nodes}
    edges = [
        edge
        for edge in model.edges
        if edge.from_node_id in node_ids and edge.to_node_id in node_ids
    ]
    if len(edges) != len(model.edges):
        warnings.append("Diagram generated with repaired edges")
    if not edges and len(nodes) > 1:
        edges = [
            DiagramEdge(edge_id=f"edge_{index}", from_node_id=nodes[index - 1].node_id, to_node_id=nodes[index].node_id)
            for index in range(1, len(nodes))
        ]
        warnings.append("Diagram generated with inferred sequence edges")
    control_summary = list(model.control_summary)
    risk_summary = list(model.risk_summary)
    if not control_summary:
        control_summary = [{"badge": node.badge, "label": node.description or node.label} for node in nodes if node.type == "control" and node.badge]
    if not risk_summary:
        risk_summary = [{"badge": node.badge, "label": node.description or node.label} for node in nodes if node.type == "risk" and node.badge]
    if fallback_warning and fallback_warning not in warnings:
        warnings.append(fallback_warning)
    return model.model_copy(
        update={
            "lanes": lanes,
            "nodes": nodes,
            "edges": edges,
            "control_summary": control_summary,
            "risk_summary": risk_summary,
            "warnings": warnings,
        }
    )


def _llm_unavailable(prompt_runs: list[dict[str, Any]]) -> bool:
    for record in prompt_runs:
        error = str(record.get("error") or "")
        if record.get("model") == "unavailable" or "LLM unavailable" in error:
            return True
    return False


def _follow_up_questions(
    corpus_map: dict[str, Any],
    controls: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    evidence_items: list[dict[str, Any]],
    diagram_references: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    questions = []
    if not controls:
        questions.append({"question_id": "q_controls", "question": "Which control owner and evidence should be reflected in the SOP?", "priority": "high"})
    if risks and not evidence_items:
        questions.append({"question_id": "q_evidence", "question": "What evidence proves the risk review was completed?", "priority": "medium"})
    if not diagram_references:
        questions.append({"question_id": "q_process_flow", "question": "Is there a process flow or handoff sequence that should drive the swimlane diagram?", "priority": "medium"})
    if not questions and corpus_map.get("coverage_gaps"):
        questions.append({"question_id": "q_gaps", "question": "Should the identified coverage gaps be converted into SOP changes?", "priority": "low"})
    if not questions:
        questions.append({"question_id": "q_review", "question": "Do the generated SOP suggestions reflect the intended owner, cadence, and evidence?", "priority": "low"})
    return questions


def _build_diagram_model(
    case: dict[str, Any],
    anchors: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    evidence_items: list[dict[str, Any]],
    diagram_references: list[dict[str, Any]],
) -> DiagramModel:
    lane_names = ["Business Owner", "Operations Risk", "Compliance", "Control Testing"]
    for ref in diagram_references:
        for role in ref.get("lanes_or_roles", []) or []:
            if isinstance(role, str) and role not in lane_names:
                lane_names.append(role)
    lanes = [DiagramLane(lane_id=_safe_id(name, f"lane_{index + 1}"), name=name, order=index + 1) for index, name in enumerate(lane_names[:8])]
    nodes: list[DiagramNode] = []
    source_items = [*diagram_references, *anchors]
    for index, item in enumerate(source_items[:10]):
        lane = lanes[index % len(lanes)]
        label = item.get("text") or item.get("description") or "SOP step"
        node_type = "control" if "control" in label.lower() else "risk" if "risk" in label.lower() else "evidence" if "evidence" in label.lower() else "activity"
        nodes.append(
            DiagramNode(
                node_id=f"node_{index + 1}",
                lane_id=lane.lane_id,
                type=node_type,
                shape="decision" if "?" in label or "approve" in label.lower() else "process",
                label=label[:60],
                column=index,
                source_anchor_ids=[item.get("anchor_id") or item.get("source_anchor_id") or ""],
            )
        )
    for control in controls[:3]:
        nodes.append(DiagramNode(node_id=f"control_{len(nodes) + 1}", lane_id=_safe_id("Control Testing", "control_testing"), type="control", shape="process", label=(control.get("description") or "Control")[:60], column=len(nodes), linked_control_ids=[control.get("control_id", "")]))
    for risk in risks[:3]:
        nodes.append(DiagramNode(node_id=f"risk_{len(nodes) + 1}", lane_id=_safe_id("Operations Risk", "operations_risk"), type="risk", shape="decision", label=(risk.get("description") or "Risk")[:60], column=len(nodes), linked_risk_ids=[risk.get("risk_id", "")]))
    for evidence in evidence_items[:3]:
        nodes.append(DiagramNode(node_id=f"evidence_{len(nodes) + 1}", lane_id=_safe_id("Control Testing", "control_testing"), type="evidence", shape="data_store", label=(evidence.get("evidence_description") or "Evidence")[:60], column=len(nodes)))
    if not nodes:
        nodes = [DiagramNode(node_id="node_1", lane_id=lanes[0].lane_id, type="activity", shape="start_end", label="Start SOP review")]
    edges = [
        DiagramEdge(edge_id=f"edge_{index}", from_node_id=nodes[index - 1].node_id, to_node_id=nodes[index].node_id)
        for index in range(1, len(nodes))
    ]
    return normalize_diagram_model(DiagramModel(
        title=f"{case.get('process_name') or 'SOP'} Swimlane",
        case_title=case.get("title", ""),
        process_name=case.get("process_name", ""),
        lanes=lanes,
        nodes=nodes,
        edges=edges,
        warnings=["Diagram generated from rule-based fallback"],
    ))


def _dedupe_by_text(items: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    seen = set()
    deduped = []
    for item in items:
        key = json.dumps(item.get(field, item), sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped

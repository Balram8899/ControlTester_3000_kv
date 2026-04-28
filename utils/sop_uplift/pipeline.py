from __future__ import annotations

import json
from typing import Any

from utils.sop_uplift.analysis_engine import generate_rule_based_suggestions
from utils.sop_uplift.content_sanitizer import sanitize_chunk
from utils.sop_uplift.corpus_map import build_case_corpus_map
from utils.sop_uplift.diagram_model import DiagramEdge, DiagramLane, DiagramModel, DiagramNode
from utils.sop_uplift.extractors import extract_controls, extract_evidence, extract_risks, extract_sop_structure
from utils.sop_uplift.llm_orchestrator import run_json_prompt
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
from utils.sop_uplift.preview_renderer import build_preview_model
from utils.sop_uplift.prompt_templates import build_prompt


def run_full_sop_pipeline(case: dict[str, Any], use_llm: bool = False, max_chunk_chars: int = 4000) -> dict[str, Any]:
    anchors = list(case.get("anchors", []))
    content_anchors = [anchor for anchor in anchors if anchor.get("block_type") != "heading"]
    chunks = list(case.get("chunks", []))
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

    if use_llm:
        llm_result = _run_llm_pipeline(
            case=case,
            chunks=chunks,
            prompt_runs=prompt_runs,
            max_chunk_chars=max_chunk_chars,
        )
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
    suggestions = _merge_suggestions(
        list(case.get("suggestions", [])),
        generate_rule_based_suggestions(content_anchors),
        llm_result.get("suggestions", []),
        _missing_control_suggestions(content_anchors, controls, risks),
        _missing_control_prompt_suggestions(llm_result.get("missing_control_recommendations", [])),
    )
    suggestions = _apply_duplicate_merge(suggestions, llm_result.get("duplicate_groups", []))
    follow_up_questions = llm_result.get("agent_follow_up_questions") or _follow_up_questions(corpus_map, controls, risks, evidence_items, diagram_references)
    diagram_model = _diagram_model_from_payload(llm_result.get("diagram_model"), case) or _build_diagram_model(case, content_anchors, controls, risks, evidence_items, diagram_references)
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


def _run_llm_pipeline(
    case: dict[str, Any],
    chunks: list[dict[str, Any]],
    prompt_runs: list[dict[str, Any]],
    max_chunk_chars: int,
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
    for chunk in chunks:
        sanitized = sanitize_chunk(
            chunk.get("content", ""),
            file_id=chunk.get("document_id", ""),
            anchor_id=(chunk.get("anchor_ids") or [""])[0],
            max_chunk_chars=max_chunk_chars,
        )
        collected["warnings"].extend(sanitized.warnings)
        for stage, schema in [
            ("sop_structure_extraction", SopStructureExtractionResponse),
            ("policy_requirement_extraction", PolicyRequirementExtractionResponse),
            ("risk_control_matrix_extraction", RiskControlMatrixExtractionResponse),
            ("evidence_extraction", EvidenceExtractionResponse),
            ("diagram_reference_extraction", DiagramReferenceExtractionResponse),
            ("sop_uplift_suggestions", SopSuggestionResponse),
        ]:
            prompt = build_prompt(
                stage,
                delimited_content=sanitized.delimited_content,
                anchors_in_chunk=chunk.get("anchor_ids", []),
                sop_section=sanitized.content,
                retrieved_context=json.dumps({"case": case.get("case_id"), "anchor_ids": chunk.get("anchor_ids", [])}),
                structured_data={},
            )
            result = run_json_prompt(stage, prompt, schema)
            collected["prompt_runs"].append(result.record)
            if not result.parsed:
                collected["warnings"].append(result.record.get("error") or f"{stage} returned invalid JSON")
                continue
            payload = result.parsed.model_dump()
            if payload.get("sections") or payload.get("process_steps"):
                collected["sop_structures"].append(
                    {
                        "chunk_id": chunk.get("chunk_id"),
                        "sections": payload.get("sections", []),
                        "process_steps": payload.get("process_steps", []),
                    }
                )
            collected["requirements"].extend(payload.get("requirements", []))
            collected["controls"].extend(payload.get("controls", []))
            collected["risks"].extend(payload.get("risks", []))
            collected["risk_events"].extend(payload.get("risk_events", []))
            collected["evidence_items"].extend(payload.get("evidence_items", []))
            collected["issues_findings"].extend(payload.get("findings", []))
            for suggestion in payload.get("suggestions", []):
                collected["suggestions"].append(
                    {
                        **suggestion,
                        "status": "open",
                        "created_from": "analysis",
                    }
                )
            if stage == "diagram_reference_extraction":
                collected["diagram_references"].append(
                    {
                        "diagram_id": f"diagram_{chunk.get('chunk_id')}",
                        "description": payload.get("diagram_summary", ""),
                        "steps": payload.get("steps", []),
                        "source_anchor_id": (chunk.get("anchor_ids") or [""])[0],
                    }
                )
            collected["warnings"].extend(payload.get("warnings", []))

    _run_case_level_prompt("case_chat_context_extraction", CaseChatContextExtractionResponse, case, collected)
    _run_case_level_prompt("corpus_map", CorpusMapResponse, case, collected)
    _run_case_level_prompt("missing_control_recommendations", MissingControlRecommendationsResponse, case, collected)
    _run_case_level_prompt("duplicate_conflict_merge", DuplicateConflictMergeResponse, case, collected)
    _run_case_level_prompt("agent_follow_up_questions", AgentFollowUpQuestionsResponse, case, collected)
    _run_case_level_prompt("swimlane_diagram_model", SwimlaneDiagramModelResponse, case, collected)
    _run_case_level_prompt("final_summary_change_log", FinalSummaryResponse, case, collected)
    return collected


def _run_case_level_prompt(stage: str, schema: Any, case: dict[str, Any], collected: dict[str, Any]) -> None:
    prompt = build_prompt(
        stage,
        case_summary={"case_id": case.get("case_id"), "process_name": case.get("process_name")},
        chat_messages=case.get("case_chat", []),
        structured_data=collected,
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


def _with_document(items: list[dict[str, Any]], document: dict[str, Any]) -> list[dict[str, Any]]:
    return [{**item, "document_id": document.get("document_id"), "file_id": document.get("file_id")} for item in items]


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
            "suggested_text": "Add a reviewable control step with owner, frequency, evidence, and escalation criteria.",
            "source_references": [{"risk_id": item.get("risk_id")} for item in risks],
            "anchor_confidence": "medium",
            "created_from": "analysis",
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
                "created_from": "analysis",
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
        return DiagramModel(
            title=payload.get("title") or f"{case.get('process_name') or 'SOP'} Swimlane",
            case_title=case.get("title", ""),
            process_name=case.get("process_name", ""),
            lanes=[DiagramLane.model_validate(lane) for lane in payload.get("lanes", [])],
            nodes=[DiagramNode.model_validate(node) for node in payload.get("nodes", [])],
            edges=[DiagramEdge.model_validate(edge) for edge in payload.get("edges", [])],
        )
    except Exception:
        return None


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
    lanes = [
        DiagramLane(lane_id="business_owner", name="Business Owner", order=1),
        DiagramLane(lane_id="operations_risk", name="Operations Risk", order=2),
        DiagramLane(lane_id="compliance", name="Compliance", order=3),
        DiagramLane(lane_id="control_testing", name="Control Testing", order=4),
    ]
    nodes: list[DiagramNode] = []
    source_items = anchors or diagram_references
    for index, item in enumerate(source_items[:10]):
        lane = lanes[index % len(lanes)]
        label = item.get("text") or item.get("description") or "SOP step"
        node_type = "control" if "control" in label.lower() else "risk" if "risk" in label.lower() else "evidence" if "evidence" in label.lower() else "activity"
        nodes.append(
            DiagramNode(
                node_id=f"node_{index + 1}",
                lane_id=lane.lane_id,
                type=node_type,
                label=label[:60],
                source_anchor_ids=[item.get("anchor_id") or item.get("source_anchor_id") or ""],
            )
        )
    for control in controls[:3]:
        nodes.append(DiagramNode(node_id=f"control_{len(nodes) + 1}", lane_id="control_testing", type="control", label=(control.get("description") or "Control")[:60]))
    for risk in risks[:3]:
        nodes.append(DiagramNode(node_id=f"risk_{len(nodes) + 1}", lane_id="operations_risk", type="risk", label=(risk.get("description") or "Risk")[:60]))
    for evidence in evidence_items[:3]:
        nodes.append(DiagramNode(node_id=f"evidence_{len(nodes) + 1}", lane_id="control_testing", type="evidence", label=(evidence.get("evidence_description") or "Evidence")[:60]))
    if not nodes:
        nodes = [DiagramNode(node_id="node_1", lane_id="business_owner", type="activity", label="Start SOP review")]
    edges = [
        DiagramEdge(edge_id=f"edge_{index}", from_node_id=nodes[index - 1].node_id, to_node_id=nodes[index].node_id)
        for index in range(1, len(nodes))
    ]
    return DiagramModel(
        title=f"{case.get('process_name') or 'SOP'} Swimlane",
        case_title=case.get("title", ""),
        process_name=case.get("process_name", ""),
        lanes=lanes,
        nodes=nodes,
        edges=edges,
    )


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

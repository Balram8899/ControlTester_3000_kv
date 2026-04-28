from __future__ import annotations

from typing import Any


def build_case_corpus_map(
    case: dict[str, Any],
    document_tags: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    requirements: list[dict[str, Any]],
    evidence_items: list[dict[str, Any]],
    issues_findings: list[dict[str, Any]],
    diagram_references: list[dict[str, Any]],
    case_chat_context: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "primary_process": case.get("process_name", ""),
        "processes_identified": [case.get("process_name", "")] if case.get("process_name") else [],
        "actors": sorted({item.get("owner", "") for item in controls if item.get("owner")}),
        "systems": [],
        "risk_to_control_map": [],
        "sop_to_control_map": [],
        "sop_to_risk_map": [],
        "evidence_to_control_map": [],
        "chat_context_to_sop_map": case_chat_context,
        "coverage_gaps": [],
        "conflicts_or_inconsistencies": [],
        "low_confidence_items": [tag for tag in document_tags if tag.get("confidence") == "low"],
        "warnings": [],
    }

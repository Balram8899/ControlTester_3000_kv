from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any


def _counts(suggestions: list[dict[str, Any]]) -> dict[str, int]:
    counter = Counter(item.get("status", "open") for item in suggestions)
    return {
        "total": len(suggestions),
        "accepted": counter.get("accepted", 0),
        "edited": counter.get("edited", 0),
        "rejected": counter.get("rejected", 0),
    }


def _case_chat_inputs_captured(case: dict[str, Any]) -> int:
    return sum(1 for message in case.get("case_chat", []) if message.get("role") == "user")


def build_markdown_change_log(
    case: dict[str, Any],
    suggestions: list[dict[str, Any]],
    outputs: list[dict[str, Any]],
) -> str:
    sections = [
        f"# SOP Uplift Change Log: {case.get('title', '')}",
        "",
        f"- Case ID: {case.get('case_id', '')}",
        f"- Process: {case.get('process_name', '')}",
        f"- Generated: {datetime.utcnow().isoformat()}Z",
        "",
    ]
    labels = [("accepted", "Accepted Changes"), ("edited", "Edited Changes"), ("rejected", "Rejected Changes")]
    for status, heading in labels:
        sections.append(f"## {heading}")
        matching = [item for item in suggestions if item.get("status") == status]
        if not matching:
            sections.append("- None")
        for item in matching:
            text = item.get("user_text") or item.get("suggested_text") or item.get("summary") or ""
            sections.append(f"- {item.get('title', item.get('suggestion_id', 'Suggestion'))}: {text}")
        sections.append("")
    sections.append("## Generated Outputs")
    if not outputs:
        sections.append("- None")
    for output in outputs:
        sections.append(f"- {output.get('type')}: {output.get('filename')}")
    return "\n".join(sections).strip() + "\n"


def build_json_audit_log(
    case: dict[str, Any],
    suggestions: list[dict[str, Any]],
    outputs: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "case_id": case.get("case_id", ""),
        "case_title": case.get("title", ""),
        "process_name": case.get("process_name", ""),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "case_chat_inputs_captured": _case_chat_inputs_captured(case),
        "suggestion_counts": _counts(suggestions),
        "suggestions": suggestions,
        "outputs": outputs,
    }

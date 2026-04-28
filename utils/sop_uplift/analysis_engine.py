from __future__ import annotations

from typing import Any


def generate_rule_based_suggestions(anchors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    suggestions = []
    for anchor in anchors:
        text = anchor.get("text", "")
        if not text:
            continue
        suggestion_id = f"sug_{anchor.get('anchor_id')}"
        suggestions.append(
            {
                "suggestion_id": suggestion_id,
                "type": "testability_gap",
                "severity": "medium",
                "status": "open",
                "anchor_id": anchor.get("anchor_id", ""),
                "title": "Make SOP step testable",
                "summary": "Clarify owner, frequency, and evidence for this SOP step.",
                "suggested_text": f"Define owner, cadence, and evidence for: {text}",
                "source_references": [{"anchor_id": anchor.get("anchor_id", "")}],
                "anchor_confidence": "high",
                "created_from": "analysis",
            }
        )
    return suggestions

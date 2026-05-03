from __future__ import annotations

from typing import Any


def build_preview_model(
    markdown_documents: list[dict[str, Any]],
    anchors: list[dict[str, Any]],
    suggestions: list[dict[str, Any]],
) -> dict[str, Any]:
    suggestion_by_anchor = {}
    for suggestion in suggestions:
        suggestion_by_anchor.setdefault(suggestion.get("anchor_id"), []).append(suggestion)
    return {
        "documents": markdown_documents,
        "anchors": anchors,
        "highlights": [
            {
                "anchor_id": anchor.get("anchor_id"),
                "document_id": anchor.get("document_id"),
                "file_id": anchor.get("file_id"),
                "section_path": anchor.get("section_path", []),
                "block_type": anchor.get("block_type", ""),
                "text": anchor.get("text", ""),
                "suggestions": suggestion_by_anchor.get(anchor.get("anchor_id"), []),
            }
            for anchor in anchors
        ],
    }

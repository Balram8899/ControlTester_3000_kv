from __future__ import annotations

from typing import Any


def extract_sop_structure(markdown: str, anchors: list[dict[str, Any]]) -> dict[str, Any]:
    sections = [
        {"anchor_id": anchor.get("anchor_id"), "text": anchor.get("text", ""), "section_path": anchor.get("section_path", [])}
        for anchor in anchors
        if anchor.get("block_type") != "heading"
    ]
    return {"sections": sections, "warnings": []}


def extract_controls(markdown: str, anchors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"control_id": f"ctrl_{idx + 1}", "description": anchor.get("text", ""), "source_anchor_id": anchor.get("anchor_id")}
        for idx, anchor in enumerate(anchors)
        if "control" in anchor.get("text", "").lower()
    ]


def extract_risks(markdown: str, anchors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"risk_id": f"risk_{idx + 1}", "description": anchor.get("text", ""), "source_anchor_id": anchor.get("anchor_id")}
        for idx, anchor in enumerate(anchors)
        if "risk" in anchor.get("text", "").lower()
    ]


def extract_evidence(markdown: str, anchors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"evidence_id": f"ev_{idx + 1}", "evidence_description": anchor.get("text", ""), "source_anchor_id": anchor.get("anchor_id")}
        for idx, anchor in enumerate(anchors)
        if "evidence" in anchor.get("text", "").lower()
    ]

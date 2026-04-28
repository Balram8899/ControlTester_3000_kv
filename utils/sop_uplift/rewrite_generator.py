from __future__ import annotations

from io import BytesIO
from typing import Any

from docx import Document
from docx.shared import RGBColor


BLUE = RGBColor(30, 73, 226)
GREEN = RGBColor(0, 154, 68)
RED = RGBColor(128, 0, 0)
AMBER = RGBColor(181, 111, 0)
GRAY = RGBColor(100, 116, 139)


def _color_for(suggestion: dict[str, Any]) -> RGBColor:
    if suggestion.get("severity") in {"high", "critical"}:
        return RED
    if suggestion.get("type") in {"evidence_gap", "frequency_gap", "ownership_gap"}:
        return AMBER
    if suggestion.get("status") == "edited":
        return GREEN
    return BLUE


def generate_docx(
    case: dict[str, Any],
    sections: list[dict[str, Any]],
    suggestions: list[dict[str, Any]],
) -> bytes:
    doc = Document()
    doc.add_heading(case.get("title") or "SOP Uplift Output", level=0)
    meta = doc.add_paragraph()
    meta.add_run("Process: ").bold = True
    meta.add_run(case.get("process_name", ""))

    applicable = [item for item in suggestions if item.get("status") in {"accepted", "edited"}]
    rejected = [item for item in suggestions if item.get("status") == "rejected"]

    if not sections:
        sections = [{"anchor_id": "", "heading": "Revised SOP Content", "text": ""}]

    for section in sections:
        doc.add_heading(section.get("heading") or section.get("anchor_id") or "SOP Section", level=1)
        if section.get("text"):
            doc.add_paragraph(section["text"])
        for suggestion in applicable:
            if suggestion.get("anchor_id") and section.get("anchor_id") and suggestion.get("anchor_id") != section.get("anchor_id"):
                continue
            paragraph = doc.add_paragraph()
            label = "User edit: " if suggestion.get("status") == "edited" else "Accepted change: "
            paragraph.add_run(label).bold = True
            run = paragraph.add_run(suggestion.get("user_text") or suggestion.get("suggested_text") or "")
            run.font.color.rgb = _color_for(suggestion)

    doc.add_heading("Appendix: Rejected Suggestions", level=1)
    if not rejected:
        doc.add_paragraph("None")
    for suggestion in rejected:
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(suggestion.get("title") or suggestion.get("suggestion_id") or "Rejected suggestion")
        run.font.color.rgb = GRAY
        detail = suggestion.get("user_text") or suggestion.get("suggested_text") or suggestion.get("summary") or ""
        if detail:
            paragraph.add_run(f": {detail}")

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.shared import RGBColor
from docx.text.paragraph import Paragraph


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


def _accepted_language(suggestion: dict[str, Any]) -> str:
    return str(suggestion.get("user_text") or suggestion.get("suggested_text") or "").strip()


def _normalized_text(value: str) -> str:
    return " ".join(str(value or "").split()).strip().lower()


def _insert_paragraph_after(paragraph: Paragraph) -> Paragraph:
    new_element = OxmlElement("w:p")
    paragraph._p.addnext(new_element)
    return Paragraph(new_element, paragraph._parent)


def _is_generated_change_paragraph(paragraph: Paragraph) -> bool:
    text = paragraph.text.strip()
    return text.startswith("TRACE Uplift Change") or text.startswith("TRACE Change Register")


def _find_source_paragraph(doc: Any, original_text: str, used_elements: set[int]) -> Paragraph | None:
    needle = _normalized_text(original_text)
    if not needle:
        return None
    for paragraph in doc.paragraphs:
        element_id = id(paragraph._p)
        if element_id in used_elements or _is_generated_change_paragraph(paragraph):
            continue
        haystack = _normalized_text(paragraph.text)
        if haystack == needle:
            return paragraph
    for paragraph in doc.paragraphs:
        element_id = id(paragraph._p)
        if element_id in used_elements or _is_generated_change_paragraph(paragraph):
            continue
        haystack = _normalized_text(paragraph.text)
        if needle in haystack or haystack in needle:
            return paragraph
    return None


def _add_change_label(paragraph: Paragraph, text: str, color: RGBColor = BLUE) -> None:
    run = paragraph.add_run(text)
    run.bold = True
    run.font.color.rgb = color
    run.font.highlight_color = WD_COLOR_INDEX.YELLOW


def _add_original_and_applied_runs(paragraph: Paragraph, original_text: str, suggestion: dict[str, Any]) -> None:
    original_label = paragraph.add_run(" Original SOP language: ")
    original_label.bold = True
    original = paragraph.add_run(original_text)
    original.font.strike = True
    original.font.color.rgb = GRAY
    paragraph.add_run(" ")
    applied_label = paragraph.add_run("Applied SOP language: ")
    applied_label.bold = True
    applied = paragraph.add_run(_accepted_language(suggestion))
    applied.font.color.rgb = _color_for(suggestion)
    applied.font.highlight_color = WD_COLOR_INDEX.BRIGHT_GREEN if suggestion.get("status") == "edited" else WD_COLOR_INDEX.TURQUOISE


def _add_change_register(doc: Any, case: dict[str, Any], sections: list[dict[str, Any]], suggestions: list[dict[str, Any]]) -> None:
    doc.add_page_break()
    doc.add_heading("TRACE Change Register", level=1)
    meta = doc.add_paragraph()
    meta.add_run("Process: ").bold = True
    meta.add_run(case.get("process_name", ""))
    generated = doc.add_paragraph()
    generated.add_run("Generated: ").bold = True
    generated.add_run(datetime.utcnow().isoformat(timespec="seconds") + "Z")

    revised_sections = build_revised_sections(sections, suggestions)
    any_applied = False
    for section in revised_sections:
        applied = section.get("applied_suggestions", [])
        if not applied:
            continue
        any_applied = True
        doc.add_heading(section.get("heading") or section.get("anchor_id") or "SOP Section", level=2)
        for suggestion in applied:
            paragraph = doc.add_paragraph()
            _add_change_label(
                paragraph,
                f"TRACE Uplift Change [{suggestion.get('status')} {suggestion.get('suggestion_id') or ''}] ".strip(),
                _color_for(suggestion),
            )
            _add_original_and_applied_runs(paragraph, str(section.get("original_text") or ""), suggestion)
    if not any_applied:
        doc.add_paragraph("No accepted or edited SOP language changes were applied.")

    rejected = [item for item in suggestions if item.get("status") == "rejected"]
    doc.add_heading("Rejected Suggestions", level=2)
    if not rejected:
        doc.add_paragraph("None")
    for suggestion in rejected:
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(suggestion.get("title") or suggestion.get("suggestion_id") or "Rejected suggestion")
        run.font.color.rgb = GRAY
        detail = suggestion.get("user_text") or suggestion.get("suggested_text") or suggestion.get("summary") or ""
        if detail:
            paragraph.add_run(f": {detail}")


def _generate_source_docx(
    case: dict[str, Any],
    sections: list[dict[str, Any]],
    suggestions: list[dict[str, Any]],
    source_docx: bytes,
) -> bytes:
    doc = Document(BytesIO(source_docx))
    revised_sections = build_revised_sections(sections, suggestions)
    used_elements: set[int] = set()

    for section in revised_sections:
        section_applicable = section.get("applied_suggestions", [])
        if not section_applicable:
            continue
        source_paragraph = _find_source_paragraph(doc, str(section.get("original_text") or ""), used_elements)
        if not source_paragraph:
            continue
        used_elements.add(id(source_paragraph._p))
        cursor = source_paragraph
        for suggestion in section_applicable:
            change = _insert_paragraph_after(cursor)
            _add_change_label(
                change,
                f"TRACE Uplift Change [{suggestion.get('status')} {suggestion.get('suggestion_id') or ''}] ".strip(),
                _color_for(suggestion),
            )
            _add_original_and_applied_runs(change, str(section.get("original_text") or ""), suggestion)
            cursor = change

    _add_change_register(doc, case, sections, suggestions)
    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def build_revised_sections(sections: list[dict[str, Any]], suggestions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    applicable = [item for item in suggestions if item.get("status") in {"accepted", "edited"} and _accepted_language(item)]
    suggestions_by_anchor: dict[str, list[dict[str, Any]]] = {}
    for suggestion in applicable:
        suggestions_by_anchor.setdefault(str(suggestion.get("anchor_id") or ""), []).append(suggestion)

    revised: list[dict[str, Any]] = []
    for section in sections:
        anchor_id = str(section.get("anchor_id") or "")
        section_suggestions = suggestions_by_anchor.get(anchor_id, [])
        revised_text_parts = [_accepted_language(item) for item in section_suggestions if _accepted_language(item)]
        revised_text = "\n".join(revised_text_parts).strip() or str(section.get("text") or "")
        revised.append(
            {
                **section,
                "original_text": section.get("text", ""),
                "revised_text": revised_text,
                "applied_suggestions": section_suggestions,
                "applied_suggestion_ids": [item.get("suggestion_id") for item in section_suggestions],
            }
        )
    return revised


def generate_docx(
    case: dict[str, Any],
    sections: list[dict[str, Any]],
    suggestions: list[dict[str, Any]],
    source_docx: bytes | None = None,
) -> bytes:
    if source_docx:
        try:
            return _generate_source_docx(case, sections, suggestions, source_docx)
        except Exception:
            pass

    doc = Document()
    doc.add_heading(case.get("title") or "SOP Uplift Output", level=0)
    meta = doc.add_paragraph()
    meta.add_run("Process: ").bold = True
    meta.add_run(case.get("process_name", ""))
    generated = doc.add_paragraph()
    generated.add_run("Generated: ").bold = True
    generated.add_run(datetime.utcnow().isoformat(timespec="seconds") + "Z")

    applicable = [item for item in suggestions if item.get("status") in {"accepted", "edited"}]
    rejected = [item for item in suggestions if item.get("status") == "rejected"]

    if not sections:
        sections = [{"anchor_id": "", "heading": "Revised SOP Content", "text": ""}]

    revised_sections = build_revised_sections(sections, suggestions)
    for section in revised_sections:
        doc.add_heading(section.get("heading") or section.get("anchor_id") or "SOP Section", level=1)
        section_applicable = section.get("applied_suggestions", [])
        if section.get("original_text") and section_applicable:
            paragraph = doc.add_paragraph()
            label = paragraph.add_run("Original SOP language: ")
            label.bold = True
            original = paragraph.add_run(str(section.get("original_text") or ""))
            original.font.strike = True
            original.font.color.rgb = GRAY
        elif section.get("original_text"):
            doc.add_paragraph(str(section.get("original_text") or ""))
        for suggestion in section_applicable:
            paragraph = doc.add_paragraph()
            label = "User-edited SOP language: " if suggestion.get("status") == "edited" else "Revised SOP language: "
            paragraph.add_run(label).bold = True
            run = paragraph.add_run(_accepted_language(suggestion))
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

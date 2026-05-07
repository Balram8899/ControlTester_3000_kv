from __future__ import annotations

import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
import re
from typing import Any
from xml.sax.saxutils import escape

from docx import Document
from docx.document import Document as DocxDocument
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm
from docx.text.paragraph import Paragraph

from utils.services.llm_orchestrator import call_llm, get_batch_size_chars
from utils.services.schemas import OutputGenerationResult, SwimlaneSpec
from utils.sop_processing.case_store import DocumentUpliftCaseStore
from utils.sop_processing.content_sanitizer import sanitize_chunk
from utils.sop_processing.prompts import (
    sop_section_rewrite_prompt,
    swimlane_extraction_prompt,
)
from utils.sop_processing import diagram_renderer


DIAGRAM_RENDERER_READY = True
AUTHOR = "TRACE Document Uplift"
DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
DEFAULT_LANE_PALETTE = ["#1E49E2", "#098E7E", "#7213EA", "#EAAA00", "#00B8F5"]

REWRITE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"rewritten_text": {"type": "string"}},
}

SWIMLANE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "lanes": {"type": "array"},
        "steps": {"type": "array"},
    },
}

_store: DocumentUpliftCaseStore | None = None


@dataclass
class PreparedChange:
    suggestion_id: str
    title: str
    detail: str
    original_text: str
    rewritten_text: str
    source_references: list[dict[str, Any]]
    review_status: str
    placement_text: str = ""


def get_store() -> DocumentUpliftCaseStore:
    global _store
    if _store is None:
        _store = DocumentUpliftCaseStore()
    return _store


def generate_outputs(
    case_id: str,
    original_sop_bytes: bytes | None,
    suggestions: list[dict[str, Any]],
    process_steps: list[dict[str, Any]],
    corpus_map: dict[str, Any] | None,
    style_profile: dict[str, Any] | None,
    pipeline_id: str,
    stage1_cost: dict[str, Any] | None,
    source_documents: list[dict[str, Any]] | None = None,
) -> OutputGenerationResult:
    accepted_changes = _prepare_changes(
        suggestions=suggestions,
        process_steps=process_steps,
        source_documents=source_documents,
        style_profile=style_profile,
        pipeline_id=pipeline_id,
    )
    warnings: list[str] = []
    if original_sop_bytes:
        output_mode = "track_changes"
        docx_bytes, uplifted_text, sections_rewritten = _build_track_changes_docx(
            original_sop_bytes,
            accepted_changes,
            style_profile or {},
        )
    else:
        output_mode = "standalone"
        warnings.append(
            "Track-changes output unavailable because the source procedure is not a DOCX; generated a standalone DOCX."
        )
        docx_bytes, uplifted_text, sections_rewritten = _build_standalone_docx(
            accepted_changes,
            style_profile or {},
        )

    case_store = get_store()
    docx_output = case_store.save_output_content(
        case_id,
        {
            "output_id": f"{case_id}-uplifted-docx",
            "output_type": "docx",
            "filename": f"{case_id}-uplifted-sop.docx",
            "content_type": DOCX_CONTENT_TYPE,
            "output_mode": output_mode,
        },
        docx_bytes,
    )
    swimlane_spec = _extract_swimlane_spec(
        uplifted_text=uplifted_text,
        style_profile=style_profile or {},
        pipeline_id=pipeline_id,
        process_steps=process_steps,
        enabled=bool(accepted_changes or process_steps or corpus_map),
    )
    diagram_png_file_id, diagram_pdf_file_id = _save_diagram_outputs(
        case_id,
        swimlane_spec,
        case_store,
    )
    return OutputGenerationResult(
        status="success",
        case_id=case_id,
        docx_file_id=docx_output["output_id"],
        diagram_png_file_id=diagram_png_file_id,
        diagram_pdf_file_id=diagram_pdf_file_id,
        sections_rewritten=sections_rewritten,
        swimlane_spec=swimlane_spec,
        stage2_cost=None,
        warnings=warnings,
    )


def _save_diagram_outputs(
    case_id: str,
    swimlane_spec: SwimlaneSpec | None,
    case_store: DocumentUpliftCaseStore,
) -> tuple[str | None, str | None]:
    if not swimlane_spec:
        return None, None
    png_bytes, pdf_bytes = diagram_renderer.render(swimlane_spec)
    png_output = case_store.save_output_content(
        case_id,
        {
            "output_id": f"{case_id}-swimlane-png",
            "output_type": "png_diagram",
            "filename": f"{case_id}-swimlane.png",
            "content_type": "image/png",
            "output_mode": "standalone",
        },
        png_bytes,
    )
    pdf_output = case_store.save_output_content(
        case_id,
        {
            "output_id": f"{case_id}-swimlane-pdf",
            "output_type": "pdf_diagram",
            "filename": f"{case_id}-swimlane.pdf",
            "content_type": "application/pdf",
            "output_mode": "standalone",
        },
        pdf_bytes,
    )
    return png_output["output_id"], pdf_output["output_id"]


def _prepare_changes(
    suggestions: list[dict[str, Any]],
    process_steps: list[dict[str, Any]] | None,
    source_documents: list[dict[str, Any]] | None,
    style_profile: dict[str, Any] | None,
    pipeline_id: str,
) -> list[PreparedChange]:
    prepared: list[PreparedChange] = []
    process_steps = process_steps or []
    source_name_by_id = _source_name_by_id(source_documents or [])
    for suggestion in suggestions:
        if suggestion.get("review_status", "pending") not in {"accepted", "edited"}:
            continue
        proposed_text = str(
            suggestion.get("edited_proposed_text")
            or suggestion.get("proposed_text")
            or ""
        ).strip()
        if not proposed_text:
            continue
        original_text = str(suggestion.get("original_text") or "").strip()
        source_references = [
            dict(item)
            for item in suggestion.get("source_references", [])
            if isinstance(item, dict)
        ]
        source_references = _with_resolved_source_names(source_references, source_name_by_id)
        rewritten_text = _rewrite_text(
            original_text=original_text,
            suggestion=suggestion,
            proposed_text=proposed_text,
            style_profile=style_profile or {},
            pipeline_id=pipeline_id,
        )
        rewritten_text = _clean_rewritten_text(rewritten_text or proposed_text)
        prepared.append(
            PreparedChange(
                suggestion_id=str(suggestion.get("suggestion_id") or ""),
                title=str(suggestion.get("title") or "Document uplift suggestion"),
                detail=str(suggestion.get("detail") or ""),
                original_text=original_text,
                rewritten_text=rewritten_text,
                source_references=source_references,
                review_status=str(suggestion.get("review_status", "accepted")),
                placement_text=_placement_text_for_suggestion(
                    suggestion=suggestion,
                    source_references=source_references,
                    process_steps=process_steps,
                ),
            )
        )
    return prepared


def _source_name_by_id(source_documents: list[dict[str, Any]]) -> dict[str, str]:
    names: dict[str, str] = {}
    for document in source_documents:
        if not isinstance(document, dict):
            continue
        filename = str(document.get("filename") or document.get("name") or "").strip()
        if not filename:
            continue
        for key in ("file_id", "document_id", "id", "gridfs_file_id"):
            value = str(document.get(key) or "").strip()
            if value:
                names[value] = filename
    return names


def _with_resolved_source_names(
    source_references: list[dict[str, Any]],
    source_name_by_id: dict[str, str],
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for ref in source_references:
        item = dict(ref)
        if not item.get("filename"):
            for key in ("document_id", "file_id"):
                source_id = str(item.get(key) or "").strip()
                if source_id and source_id in source_name_by_id:
                    item["filename"] = source_name_by_id[source_id]
                    break
        resolved.append(item)
    return resolved


def _rewrite_text(
    original_text: str,
    suggestion: dict[str, Any],
    proposed_text: str,
    style_profile: dict[str, Any],
    pipeline_id: str,
) -> str:
    original_for_prompt = original_text or proposed_text
    prompt = sop_section_rewrite_prompt(
        sanitize_chunk(
            original_for_prompt,
            file_id=str(suggestion.get("suggestion_id") or "stage2"),
            anchor_id=_anchor_id(suggestion),
            max_chars=get_batch_size_chars(),
        ),
        [suggestion],
        _style_notes(style_profile),
    )
    result = call_llm(
        prompt=prompt,
        schema_name="sop_section_rewrite",
        response_schema=REWRITE_SCHEMA,
        pipeline_id=pipeline_id,
        budget_remaining=1,
    )
    if result.status != "success" or not result.output:
        return proposed_text
    rewritten = result.output.get("rewritten_text")
    return str(rewritten).strip() if rewritten else proposed_text


def _placement_text_for_suggestion(
    suggestion: dict[str, Any],
    source_references: list[dict[str, Any]],
    process_steps: list[dict[str, Any]],
) -> str:
    target_anchor_id = str(suggestion.get("target_anchor_id") or "").strip()
    anchor_ids = [target_anchor_id] if target_anchor_id else []
    anchor_ids.extend(
        str(ref.get("anchor_id") or "").strip()
        for ref in source_references
        if str(ref.get("anchor_id") or "").strip()
    )
    for anchor_id in anchor_ids:
        for step in process_steps:
            if str(step.get("anchor_id") or "").strip() != anchor_id:
                continue
            placement_text = _process_step_text(step)
            if placement_text:
                return placement_text
    for ref in source_references:
        for key in ("excerpt", "section_heading", "section_id"):
            value = str(ref.get(key) or "").strip()
            if value:
                return value
    return str(suggestion.get("original_text") or "").strip()


def _process_step_text(step: dict[str, Any]) -> str:
    for key in (
        "original_text",
        "action",
        "text",
        "description",
        "procedure_step",
        "section",
        "section_heading",
        "sop_section",
    ):
        value = str(step.get(key) or "").strip()
        if value:
            return value
    return ""


def _clean_rewritten_text(text: str) -> str:
    cleaned = str(text or "").strip()
    cleaned = re.sub(r"^\s*Suggested addition:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\*\*\s*([^*:\n]{1,40})\s*:\s*\*\*", r"\1:", cleaned)
    cleaned = cleaned.replace("**", "")
    cleaned = _naturalize_instructional_addition(cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned


def _naturalize_instructional_addition(text: str) -> str:
    pattern = re.compile(
        r"^Add (?:a|an) (?P<step_label>.+?) owned by (?P<owner>.+?)\. "
        r"The step should describe (?P<body>.+?) and identify retained evidence:\s*(?P<evidence>.+?)\.?$",
        flags=re.IGNORECASE | re.DOTALL,
    )
    match = pattern.match(text.strip())
    if not match:
        return text
    owner = _sentence_fragment(match.group("owner"))
    body = _sentence_fragment(match.group("body"))
    evidence = _sentence_fragment(match.group("evidence"))
    return f"{_owned_activity_sentence(owner, body)} Retained evidence includes {evidence}."


def _owned_activity_sentence(owner: str, body: str) -> str:
    subject = _owner_subject(owner)
    phrase = _third_person_activity_phrase(body)
    if phrase:
        return f"{subject} {phrase}."
    return f"{subject} documents the procedure."


def _owner_subject(owner: str) -> str:
    cleaned = _sentence_fragment(owner) or "accountable owner"
    lower = cleaned.casefold()
    if lower.startswith(("the ", "a ", "an ")):
        return cleaned[0].upper() + cleaned[1:]
    role_words = {
        "advisor",
        "analyst",
        "approver",
        "committee",
        "department",
        "function",
        "group",
        "lead",
        "manager",
        "officer",
        "operator",
        "owner",
        "team",
        "unit",
    }
    if any(word in lower.split() for word in role_words):
        return f"The {cleaned}"
    return f"The {cleaned} team"


def _third_person_activity_phrase(body: str) -> str:
    cleaned = _sentence_fragment(body)
    if not cleaned:
        return ""
    first, _, remainder = cleaned.partition(" ")
    replacements = {
        "approving": "approves",
        "checking": "checks",
        "collecting": "collects",
        "confirming": "confirms",
        "documenting": "documents",
        "escalating": "escalates",
        "identifying": "identifies",
        "maintaining": "maintains",
        "monitoring": "monitors",
        "notifying": "notifies",
        "obtaining": "obtains",
        "performing": "performs",
        "reconciling": "reconciles",
        "recording": "records",
        "retaining": "retains",
        "reviewing": "reviews",
        "screening": "screens",
        "testing": "tests",
        "validating": "validates",
        "verifying": "verifies",
    }
    replacement = replacements.get(first.casefold())
    if replacement:
        return " ".join(part for part in (replacement, remainder) if part)
    if re.search(r"\b(shall|must|should|will|is|are)\b", cleaned, flags=re.IGNORECASE):
        return f"ensures that {_lower_first(cleaned)}"
    return f"performs the activity to {_lower_first(cleaned)}"


def _lower_first(text: str) -> str:
    text = _sentence_fragment(text)
    return text[:1].lower() + text[1:] if text else text


def _sentence_fragment(value: str) -> str:
    return " ".join(str(value or "").strip().rstrip(".").split())


def _build_track_changes_docx(
    original_sop_bytes: bytes,
    changes: list[PreparedChange],
    style_profile: dict[str, Any],
) -> tuple[bytes, str, int]:
    document = Document(BytesIO(original_sop_bytes))
    _apply_style_profile(document, style_profile)
    base_text = "\n".join(paragraph.text for paragraph in _iter_paragraphs(document))
    comments: list[dict[str, str]] = []
    sections_rewritten = 0
    for change in changes:
        if _apply_change_to_document(document, change, len(comments)):
            comments.append(
                {
                    "id": str(len(comments)),
                    "text": _comment_text(change),
                }
            )
            sections_rewritten += 1

    stream = BytesIO()
    document.save(stream)
    content = stream.getvalue()
    if comments:
        content = _add_comments_and_revision_settings(content, comments)
    return content, _apply_change_text_to_base(base_text, changes), sections_rewritten


def _build_standalone_docx(
    changes: list[PreparedChange],
    style_profile: dict[str, Any],
) -> tuple[bytes, str, int]:
    document = Document()
    _apply_style_profile(document, style_profile)
    document.add_heading("Document Uplift Output", level=1)
    document.add_paragraph(
        "Track-changes output is unavailable because the primary procedure was not supplied as a DOCX file."
    )
    for change in changes:
        document.add_heading(change.title, level=2)
        document.add_paragraph(change.rewritten_text)
        document.add_paragraph(f"Why this was suggested: {change.detail}")
    stream = BytesIO()
    document.save(stream)
    return stream.getvalue(), _document_text(document, changes), len(changes)


def _apply_style_profile(
    document: DocxDocument,
    style_profile: dict[str, Any],
) -> None:
    body_font = style_profile.get("body_font")
    if body_font and "Normal" in document.styles:
        document.styles["Normal"].font.name = str(body_font)
    for section in document.sections:
        if style_profile.get("margin_top_cm") is not None:
            section.top_margin = Cm(float(style_profile["margin_top_cm"]))
        if style_profile.get("margin_bottom_cm") is not None:
            section.bottom_margin = Cm(float(style_profile["margin_bottom_cm"]))
        if style_profile.get("margin_left_cm") is not None:
            section.left_margin = Cm(float(style_profile["margin_left_cm"]))
        if style_profile.get("margin_right_cm") is not None:
            section.right_margin = Cm(float(style_profile["margin_right_cm"]))


def _apply_change_to_document(
    document: DocxDocument,
    change: PreparedChange,
    comment_id: int,
) -> bool:
    if not change.original_text:
        paragraph = _paragraph_for_addition(document, change)
        _clear_paragraph_runs(paragraph)
        _append_revision_pair(
            paragraph,
            deleted_text="",
            inserted_text=change.rewritten_text,
            comment_id=comment_id,
        )
        return True

    for paragraph in _iter_paragraphs(document):
        paragraph_text = paragraph.text
        if change.original_text not in paragraph_text:
            continue
        before, _, after = paragraph_text.partition(change.original_text)
        _clear_paragraph_runs(paragraph)
        if before:
            paragraph.add_run(before)
        _append_revision_pair(
            paragraph,
            deleted_text=change.original_text,
            inserted_text=change.rewritten_text,
            comment_id=comment_id,
        )
        if after:
            paragraph.add_run(after)
        return True

    paragraph = _paragraph_for_addition(document, change)
    _append_revision_pair(
        paragraph,
        deleted_text="",
        inserted_text=change.rewritten_text,
        comment_id=comment_id,
    )
    return True


def _paragraph_for_addition(document: DocxDocument, change: PreparedChange) -> Paragraph:
    anchor_paragraph = _find_paragraph_by_text(document, change.placement_text)
    if not anchor_paragraph:
        return document.add_paragraph()
    paragraph = _insert_paragraph_after(anchor_paragraph)
    paragraph.style = anchor_paragraph.style
    return paragraph


def _find_paragraph_by_text(
    document: DocxDocument,
    target_text: str,
) -> Paragraph | None:
    normalized_target = _normalize_match_text(target_text)
    if len(normalized_target) < 8:
        return None
    for paragraph in _iter_paragraphs(document):
        normalized_paragraph = _normalize_match_text(paragraph.text)
        if not normalized_paragraph:
            continue
        if normalized_target in normalized_paragraph or normalized_paragraph in normalized_target:
            return paragraph
    target_tokens = set(normalized_target.split())
    if len(target_tokens) < 4:
        return None
    best_paragraph: Paragraph | None = None
    best_score = 0.0
    for paragraph in _iter_paragraphs(document):
        paragraph_tokens = set(_normalize_match_text(paragraph.text).split())
        if not paragraph_tokens:
            continue
        score = len(target_tokens.intersection(paragraph_tokens)) / max(1, len(target_tokens))
        if score > best_score:
            best_score = score
            best_paragraph = paragraph
    return best_paragraph if best_score >= 0.72 else None


def _normalize_match_text(text: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", str(text or "").casefold())
    return " ".join(normalized.split())


def _insert_paragraph_after(paragraph: Paragraph) -> Paragraph:
    new_paragraph = OxmlElement("w:p")
    paragraph._p.addnext(new_paragraph)
    return Paragraph(new_paragraph, paragraph._parent)


def _iter_paragraphs(document: DocxDocument) -> list[Paragraph]:
    paragraphs = list(document.paragraphs)
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                paragraphs.extend(cell.paragraphs)
    return paragraphs


def _clear_paragraph_runs(paragraph: Paragraph) -> None:
    p = paragraph._p
    for child in list(p):
        if child.tag == qn("w:r"):
            p.remove(child)


def _append_revision_pair(
    paragraph: Paragraph,
    deleted_text: str,
    inserted_text: str,
    comment_id: int,
) -> None:
    if deleted_text:
        paragraph._p.append(_revision_element("del", deleted_text, comment_id * 2 + 1))
    paragraph._p.append(_comment_boundary("commentRangeStart", comment_id))
    paragraph._p.append(_revision_element("ins", inserted_text, comment_id * 2 + 2))
    paragraph._p.append(_comment_boundary("commentRangeEnd", comment_id))
    paragraph._p.append(_comment_reference_run(comment_id))


def _revision_element(kind: str, text: str, revision_id: int) -> OxmlElement:
    element = OxmlElement(f"w:{kind}")
    element.set(qn("w:id"), str(revision_id))
    element.set(qn("w:author"), AUTHOR)
    element.set(qn("w:date"), _utc_revision_date())
    run = OxmlElement("w:r")
    text_element = OxmlElement("w:delText" if kind == "del" else "w:t")
    text_element.text = text
    run.append(text_element)
    element.append(run)
    return element


def _comment_boundary(kind: str, comment_id: int) -> OxmlElement:
    element = OxmlElement(f"w:{kind}")
    element.set(qn("w:id"), str(comment_id))
    return element


def _comment_reference_run(comment_id: int) -> OxmlElement:
    run = OxmlElement("w:r")
    reference = OxmlElement("w:commentReference")
    reference.set(qn("w:id"), str(comment_id))
    run.append(reference)
    return run


def _add_comments_and_revision_settings(
    docx_bytes: bytes,
    comments: list[dict[str, str]],
) -> bytes:
    source = BytesIO(docx_bytes)
    files: dict[str, bytes] = {}
    with zipfile.ZipFile(source, "r") as package:
        for name in package.namelist():
            files[name] = package.read(name)

    files["[Content_Types].xml"] = _with_comments_content_type(
        files["[Content_Types].xml"].decode("utf-8")
    ).encode("utf-8")
    files["word/_rels/document.xml.rels"] = _with_comments_relationship(
        files["word/_rels/document.xml.rels"].decode("utf-8")
    ).encode("utf-8")
    if "word/settings.xml" in files:
        files["word/settings.xml"] = _with_track_revisions(
            files["word/settings.xml"].decode("utf-8")
        ).encode("utf-8")
    files["word/comments.xml"] = _comments_xml(comments).encode("utf-8")

    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name, content in files.items():
            package.writestr(name, content)
    return output.getvalue()


def _with_comments_content_type(xml: str) -> str:
    if "/word/comments.xml" in xml:
        return xml
    override = (
        '<Override PartName="/word/comments.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
    )
    return xml.replace("</Types>", f"{override}</Types>")


def _with_comments_relationship(xml: str) -> str:
    if "relationships/comments" in xml:
        return xml
    relationship = (
        '<Relationship Id="rIdDocumentUpliftComments" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" '
        'Target="comments.xml"/>'
    )
    return xml.replace("</Relationships>", f"{relationship}</Relationships>")


def _with_track_revisions(xml: str) -> str:
    if "<w:trackRevisions" in xml:
        return xml
    return xml.replace("</w:settings>", "<w:trackRevisions/></w:settings>")


def _comments_xml(comments: list[dict[str, str]]) -> str:
    body = "".join(
        (
            f'<w:comment w:id="{escape(comment["id"])}" '
            f'w:author="{escape(AUTHOR)}" w:date="{escape(_utc_revision_date())}">'
            f"<w:p><w:r><w:t>{escape(comment['text'])}</w:t></w:r></w:p>"
            "</w:comment>"
        )
        for comment in comments
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"{body}</w:comments>"
    )


def _extract_swimlane_spec(
    uplifted_text: str,
    style_profile: dict[str, Any],
    pipeline_id: str,
    process_steps: list[dict[str, Any]],
    enabled: bool,
) -> SwimlaneSpec | None:
    if not enabled:
        return None
    palette = _colour_palette(style_profile)
    prompt = swimlane_extraction_prompt(
        sanitize_chunk(
            uplifted_text or "No uplifted SOP text available.",
            file_id=pipeline_id,
            anchor_id="stage2-swimlane",
            max_chars=get_batch_size_chars(),
        ),
        palette,
    )
    result = call_llm(
        prompt=prompt,
        schema_name="swimlane_extraction",
        response_schema=SWIMLANE_SCHEMA,
        pipeline_id=pipeline_id,
        budget_remaining=1,
    )
    if result.status != "success" or not result.output:
        return _fallback_swimlane_spec(process_steps, palette)
    try:
        spec = SwimlaneSpec(**result.output)
        if not spec.lanes or not spec.steps:
            return _fallback_swimlane_spec(process_steps, palette)
        return spec
    except ValueError:
        return _fallback_swimlane_spec(process_steps, palette)


def _fallback_swimlane_spec(
    process_steps: list[dict[str, Any]],
    palette: list[str],
) -> SwimlaneSpec | None:
    usable_steps = [
        step
        for step in process_steps
        if str(step.get("action") or "").strip()
    ]
    if not usable_steps:
        return None

    actors: list[str] = []
    for step in usable_steps:
        actor = str(step.get("actor") or "Unassigned").strip() or "Unassigned"
        if actor not in actors:
            actors.append(actor)
        if len(actors) >= 6:
            break
    lane_by_actor = {
        actor: f"l{index + 1}"
        for index, actor in enumerate(actors)
    }
    lanes = [
        {
            "lane_id": lane_id,
            "label": actor,
            "colour_hex": palette[index % len(palette)],
        }
        for index, (actor, lane_id) in enumerate(lane_by_actor.items())
    ]

    steps: list[dict[str, Any]] = [
        {
            "step_id": "start",
            "lane_id": lanes[0]["lane_id"],
            "label": "Start",
            "step_type": "start",
            "next_steps": ["step-1"],
            "branch_labels": {},
        }
    ]
    for index, step in enumerate(usable_steps, start=1):
        actor = str(step.get("actor") or "Unassigned").strip() or "Unassigned"
        lane_id = lane_by_actor.get(actor, lanes[-1]["lane_id"])
        next_step = f"step-{index + 1}" if index < len(usable_steps) else "end"
        steps.append(
            {
                "step_id": f"step-{index}",
                "lane_id": lane_id,
                "label": _compact_step_label(str(step.get("action") or "")),
                "step_type": "action",
                "next_steps": [next_step],
                "branch_labels": {},
            }
        )
    steps.append(
        {
            "step_id": "end",
            "lane_id": steps[-1]["lane_id"],
            "label": "End",
            "step_type": "end",
            "next_steps": [],
            "branch_labels": {},
        }
    )
    return SwimlaneSpec(
        title="Document uplift process swimlane",
        lanes=lanes,
        steps=steps,
    )


def _compact_step_label(text: str) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= 54:
        return cleaned
    return f"{cleaned[:51].rstrip()}..."


def _colour_palette(style_profile: dict[str, Any]) -> list[str]:
    primary = style_profile.get("primary_colour_hex")
    palette = [str(primary)] if primary else []
    palette.extend(colour for colour in DEFAULT_LANE_PALETTE if colour not in palette)
    return palette


def _document_text(document: DocxDocument, changes: list[PreparedChange]) -> str:
    return _apply_change_text_to_base(
        "\n".join(paragraph.text for paragraph in _iter_paragraphs(document)),
        changes,
    )


def _apply_change_text_to_base(base: str, changes: list[PreparedChange]) -> str:
    for change in changes:
        if change.original_text:
            base = base.replace(change.original_text, change.rewritten_text)
        elif change.rewritten_text not in base:
            base = f"{base}\n{change.rewritten_text}"
    return base


def _comment_text(change: PreparedChange) -> str:
    labels: list[str] = []
    for ref in change.source_references:
        label = _source_reference_label(ref)
        if label and label not in labels:
            labels.append(label)
    source_text = "; ".join(labels)
    return (
        f"{change.title}. Why this was suggested: {change.detail}"
        + (f" Source document(s): {source_text}." if source_text else "")
    )


def _source_reference_label(ref: dict[str, Any]) -> str:
    document_name = str(
        ref.get("filename")
        or ref.get("document_name")
        or ref.get("document_id")
        or ref.get("file_id")
        or ""
    ).strip()
    details: list[str] = []
    if ref.get("page") is not None:
        details.append(f"page {ref['page']}")
    if ref.get("sheet_name"):
        details.append(str(ref["sheet_name"]))
    row = ref.get("row_index") if ref.get("row_index") is not None else ref.get("row_number")
    if row is not None:
        details.append(f"row {row}")
    if ref.get("column_name"):
        details.append(f"column {ref['column_name']}")
    if document_name and details:
        return f"{document_name} - {' '.join(details)}"
    return document_name or "source document"


def _style_notes(style_profile: dict[str, Any]) -> str:
    if not style_profile:
        return "Retain the uploaded SOP's formal tone and document formatting."
    return (
        "Retain the uploaded SOP's formal tone and document formatting. "
        f"Body font: {style_profile.get('body_font') or 'source document default'}. "
        f"Primary colour: {style_profile.get('primary_colour_hex') or 'source document default'}."
    )


def _anchor_id(suggestion: dict[str, Any]) -> str:
    for ref in suggestion.get("source_references", []):
        if isinstance(ref, dict) and ref.get("anchor_id"):
            return str(ref["anchor_id"])
    return str(suggestion.get("suggestion_id") or "stage2")


def _utc_revision_date() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

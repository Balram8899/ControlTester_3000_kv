from __future__ import annotations

import base64
import json
import os
from typing import Any, Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from utils.sop_uplift.case_store import SopUpliftCaseStore
from utils.sop_uplift.readiness import compute_readiness
from utils.sop_uplift.anchor_builder import build_anchors
from utils.sop_uplift.change_log import build_json_audit_log, build_markdown_change_log
from utils.sop_uplift.chunker import build_chunks
from utils.sop_uplift.content_sanitizer import sanitize_chunk
from utils.sop_uplift.diagram_exporters.drawio_exporter import export_drawio
from utils.sop_uplift.diagram_exporters.pdf_exporter import export_diagram_pdf
from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
from utils.sop_uplift.diagram_exporters.vsdx_exporter import export_vsdx_stub
from utils.sop_uplift.diagram_model import DiagramEdge, DiagramLane, DiagramModel, DiagramNode
from utils.sop_uplift.llm_schemas import PolicyRequirementExtractionResponse, SopSuggestionResponse
from utils.sop_uplift.llm_orchestrator import run_json_prompt
from utils.sop_uplift.markdown_ingestion import convert_bytes_to_markdown
from utils.sop_uplift.pipeline import run_full_sop_pipeline
from utils.sop_uplift.preview_renderer import build_preview_model
from utils.sop_uplift.prompt_templates import build_prompt
from utils.sop_uplift.rewrite_generator import generate_docx

router = APIRouter(prefix="/sop-uplift", tags=["sop-uplift"])


class SopCaseCreate(BaseModel):
    title: str = Field(..., min_length=1)
    process_name: str = Field(..., min_length=1)
    domain_label: str = ""
    notes: str = ""


class SopCaseUpdate(BaseModel):
    title: Optional[str] = None
    process_name: Optional[str] = None
    domain_label: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class TagUpdate(BaseModel):
    suggested_tag: Optional[str] = None
    confirmed_tag: str
    confidence: Literal["high", "medium", "low"] = "medium"
    user_description: str = ""


class ChatMessageCreate(BaseModel):
    role: Literal["agent", "user"] = "user"
    content: str = Field(..., min_length=1)


class SuggestionUpdate(BaseModel):
    status: Literal["open", "accepted", "rejected", "edited"]
    user_text: Optional[str] = None


class BulkSuggestionItem(BaseModel):
    suggestion_id: str
    status: Literal["open", "accepted", "rejected", "edited"]
    user_text: Optional[str] = None


class BulkSuggestionUpdate(BaseModel):
    updates: list[BulkSuggestionItem]


class BatchProcessRequest(BaseModel):
    batch_size: int = Field(default_factory=lambda: int(os.getenv("SOP_UPLIFT_DEFAULT_BATCH_SIZE", "5")), ge=1, le=50)
    section_ids: list[str] = Field(default_factory=list)
    use_llm: bool = False


class PipelineRunRequest(BaseModel):
    use_llm: bool = False
    max_chunk_chars: int = Field(default_factory=lambda: int(os.getenv("SOP_UPLIFT_MAX_CHUNK_CHARS", "4000")), ge=500, le=20000)


_store: SopUpliftCaseStore | None = None


def get_store() -> SopUpliftCaseStore:
    global _store
    if _store is None:
        _store = SopUpliftCaseStore()
    return _store


def _require_case(case_id: str) -> dict[str, Any]:
    case = get_store().get_case(case_id)
    if not case:
        raise HTTPException(404, "SOP Uplift case not found")
    return case


@router.post("/cases", status_code=201)
def create_case(body: SopCaseCreate):
    return get_store().create_case(body.model_dump())


@router.get("/cases")
def list_cases():
    return {"cases": get_store().list_cases()}


@router.get("/cases/{case_id}")
def get_case(case_id: str):
    return _require_case(case_id)


@router.patch("/cases/{case_id}")
def update_case(case_id: str, body: SopCaseUpdate):
    updated = get_store().update_case(case_id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(404, "SOP Uplift case not found")
    return updated


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(case_id: str):
    if not get_store().delete_case(case_id):
        raise HTTPException(404, "SOP Uplift case not found")


@router.post("/cases/{case_id}/upload", status_code=201)
async def upload_file(
    case_id: str,
    file: UploadFile = File(...),
    bucket: str = Form("supporting_material"),
    user_description: str = Form(""),
):
    _require_case(case_id)
    content = await file.read()
    metadata = get_store().add_file_metadata(
        case_id,
        {
            "filename": file.filename or "upload",
            "content_type": file.content_type or "application/octet-stream",
            "size": len(content),
            "sha256": SopUpliftCaseStore.sha256_bytes(content),
            "bucket": bucket,
            "user_description": user_description,
            "raw_content": content,
            "raw_content_b64": base64.b64encode(content).decode("ascii"),
            "conversion": {"status": "pending"},
        },
    )
    if not metadata:
        raise HTTPException(404, "SOP Uplift case not found")
    return metadata


@router.get("/cases/{case_id}/files")
def list_files(case_id: str):
    case = _require_case(case_id)
    return {"files": case.get("uploaded_files", [])}


@router.delete("/cases/{case_id}/files/{file_id}", status_code=204)
def delete_file(case_id: str, file_id: str):
    _require_case(case_id)
    if not get_store().delete_file(case_id, file_id):
        raise HTTPException(404, "SOP Uplift file not found")


@router.patch("/cases/{case_id}/documents/{file_id}/tags")
def update_document_tag(case_id: str, file_id: str, body: TagUpdate):
    tag = get_store().set_document_tag(case_id, file_id, body.model_dump())
    if not tag:
        raise HTTPException(404, "SOP Uplift case or document not found")
    return tag


@router.get("/cases/{case_id}/documents/tags")
def list_document_tags(case_id: str):
    case = _require_case(case_id)
    return {"document_tags": case.get("document_tags", [])}


@router.post("/cases/{case_id}/tag-documents")
def tag_documents(case_id: str):
    case = _require_case(case_id)
    tags = []
    for file_meta in case.get("uploaded_files", []):
        file_id = file_meta.get("file_id")
        if not file_id:
            continue
        filename = (file_meta.get("filename") or "").lower()
        bucket = (file_meta.get("bucket") or "").lower()
        tag = _infer_document_tag(filename, bucket)
        confidence = "high" if bucket else "medium"
        stored = get_store().set_document_tag(
            case_id,
            file_id,
            {"suggested_tag": tag, "confirmed_tag": tag, "confidence": confidence},
        )
        tags.append(stored or {"file_id": file_id, "confirmed_tag": tag, "confidence": confidence})
    return {"document_tags": tags}


@router.post("/cases/{case_id}/convert")
def convert_case_documents(case_id: str):
    case = _require_case(case_id)
    uploaded_files = [dict(file_meta) for file_meta in case.get("uploaded_files", [])]
    markdown_documents = list(case.get("markdown_documents", []))
    anchors = list(case.get("anchors", []))
    chunks = list(case.get("chunks", []))
    converted_file_ids = {doc.get("file_id") for doc in markdown_documents}
    completed = 0
    failed = 0

    max_chunks = int(os.getenv("SOP_UPLIFT_MAX_CHUNKS_PER_CASE", "200"))

    for file_meta in uploaded_files:
        file_id = file_meta.get("file_id")
        if not file_id or file_id in converted_file_ids:
            continue
        try:
            raw = get_store().get_file_content(case_id, file_id)
            if not isinstance(raw, (bytes, bytearray)):
                raw = base64.b64decode(file_meta.get("raw_content_b64", ""))
            conversion = convert_bytes_to_markdown(
                bytes(raw),
                file_meta.get("filename", ""),
                file_meta.get("content_type", ""),
            )
            markdown = conversion.markdown
            conversion_metadata = {
                "status": conversion.status,
                "converter": conversion.converter,
                "fallback_used": conversion.fallback_used,
                "warnings": conversion.warnings,
            }
            document_id = f"doc_{file_id}"
            doc_anchors = build_anchors(markdown, document_id=document_id, file_id=file_id)
            doc_chunks = build_chunks(markdown, doc_anchors, document_id=document_id)
            if len(chunks) + len(doc_chunks) > max_chunks:
                doc_chunks = doc_chunks[: max(0, max_chunks - len(chunks))]
            markdown_documents.append(
                {
                    "document_id": document_id,
                    "file_id": file_id,
                    "filename": file_meta.get("filename", ""),
                    "markdown": markdown,
                    "conversion": conversion_metadata,
                }
            )
            file_meta["conversion"] = conversion_metadata
            anchors.extend(doc_anchors)
            chunks.extend(doc_chunks)
            completed += 1
        except Exception:
            failed += 1

    total = len(uploaded_files)
    processing_state = {
        **case.get("processing_state", {}),
        "conversion": {
            "total": total,
            "completed": len(markdown_documents),
            "failed": failed,
            "pending": max(0, total - len(markdown_documents) - failed),
        },
    }
    updates = {
        "markdown_documents": markdown_documents,
        "uploaded_files": uploaded_files,
        "anchors": anchors,
        "chunks": chunks,
        "processing_state": processing_state,
        "status": "tagging" if markdown_documents else case.get("status", "draft"),
    }
    get_store().update_case(case_id, updates)
    return updates


@router.get("/cases/{case_id}/readiness")
def get_readiness(case_id: str):
    case = _require_case(case_id)
    readiness = compute_readiness(
        uploaded_files=case.get("uploaded_files", []),
        document_tags=case.get("document_tags", []),
    )
    get_store().update_case(case_id, {"readiness": readiness})
    return readiness


@router.get("/cases/{case_id}/chat")
def list_chat(case_id: str):
    case = _require_case(case_id)
    return {"messages": case.get("case_chat", [])}


@router.post("/cases/{case_id}/chat", status_code=201)
def add_chat_message(case_id: str, body: ChatMessageCreate):
    _require_case(case_id)
    message = get_store().add_chat_message(case_id, body.role, body.content)
    if not message:
        raise HTTPException(404, "SOP Uplift case not found")
    return message


@router.get("/cases/{case_id}/suggestions")
def list_suggestions(case_id: str):
    case = _require_case(case_id)
    return {"suggestions": case.get("suggestions", [])}


@router.patch("/cases/{case_id}/suggestions/bulk")
def update_suggestions_bulk(case_id: str, body: BulkSuggestionUpdate):
    case = _require_case(case_id)
    update_map = {item.suggestion_id: item for item in body.updates}
    suggestions = []
    for suggestion in case.get("suggestions", []):
        update = update_map.get(suggestion.get("suggestion_id"))
        if update:
            suggestion = {
                **suggestion,
                "status": update.status,
                **({"user_text": update.user_text} if update.user_text is not None else {}),
            }
        suggestions.append(suggestion)
    get_store().update_case(case_id, {"suggestions": suggestions})
    return {"suggestions": suggestions}


@router.patch("/cases/{case_id}/suggestions/{suggestion_id}")
def update_suggestion(case_id: str, suggestion_id: str, body: SuggestionUpdate):
    updated = get_store().update_suggestion(case_id, suggestion_id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(404, "Suggestion not found")
    return updated


@router.get("/cases/{case_id}/preview")
def get_preview(case_id: str):
    case = _require_case(case_id)
    preview_model = case.get("preview_model") or build_preview_model(
        case.get("markdown_documents", []),
        case.get("anchors", []),
        case.get("suggestions", []),
    )
    return {
        "case_id": case_id,
        "markdown_documents": case.get("markdown_documents", []),
        "anchors": case.get("anchors", []),
        "suggestions": case.get("suggestions", []),
        "preview_model": preview_model,
        "diagram_model": case.get("diagram_model", {}),
    }


@router.post("/cases/{case_id}/run-pipeline", status_code=202)
def run_pipeline(case_id: str, body: PipelineRunRequest):
    case = _require_case(case_id)
    updates = run_full_sop_pipeline(case, use_llm=body.use_llm, max_chunk_chars=body.max_chunk_chars)
    get_store().update_case(case_id, updates)
    return {"status": "complete", **updates}


@router.post("/cases/{case_id}/extract")
def extract_case(case_id: str, body: BatchProcessRequest):
    case = _require_case(case_id)
    chunks = list(case.get("chunks", []))
    state = case.get("processing_state", {}).get("extraction", {})
    completed_ids = set(state.get("completed_chunk_ids", []))
    pending = [chunk for chunk in chunks if chunk.get("chunk_id") not in completed_ids]
    selected = pending[: body.batch_size]
    warnings = []
    max_chars = int(os.getenv("SOP_UPLIFT_MAX_CHUNK_CHARS", "4000"))
    prompt_records = list(case.get("prompt_runs", []))

    extracted_requirements = list(case.get("extracted_requirements", []))
    for chunk in selected:
        sanitized = sanitize_chunk(
            chunk.get("content", ""),
            file_id=chunk.get("document_id", ""),
            anchor_id=(chunk.get("anchor_ids") or [""])[0],
            max_chunk_chars=max_chars,
        )
        warnings.extend(sanitized.warnings)
        if body.use_llm:
            prompt = build_prompt(
                "policy_requirement_extraction",
                delimited_content=sanitized.delimited_content,
            )
            result = run_json_prompt("policy_requirement_extraction", prompt, PolicyRequirementExtractionResponse)
            prompt_records.append(result.record)
            if result.parsed and result.parsed.requirements:
                for req in result.parsed.requirements:
                    req_data = req.model_dump()
                    extracted_requirements.append({**req_data, "source_anchor_ids": chunk.get("anchor_ids", [])})
            else:
                warnings.append(result.record.get("error") or "LLM extraction returned no valid requirements.")
        else:
            extracted_requirements.append(
                {
                    "requirement_id": f"req_{chunk.get('chunk_id')}",
                    "text": sanitized.content[:500],
                    "source_anchor_ids": chunk.get("anchor_ids", []),
                    "quality_warnings": sanitized.warnings,
                }
            )
        completed_ids.add(chunk.get("chunk_id"))

    extraction_state = {
        "total": len(chunks),
        "completed": len(completed_ids),
        "failed": 0,
        "pending": max(0, len(chunks) - len(completed_ids)),
        "last_completed_chunk_id": selected[-1].get("chunk_id") if selected else state.get("last_completed_chunk_id"),
        "completed_chunk_ids": sorted(completed_ids),
    }
    processing_state = {**case.get("processing_state", {}), "extraction": extraction_state}
    updates = {
        "extracted_requirements": extracted_requirements,
        "processing_state": processing_state,
        "status": "extracting",
        "prompt_runs": prompt_records if body.use_llm else case.get("prompt_runs", []),
    }
    get_store().update_case(case_id, updates)
    return {"extracted_requirements": extracted_requirements, "processing_state": processing_state, "warnings": warnings}


@router.post("/cases/{case_id}/analyze")
def analyze_case(case_id: str, body: BatchProcessRequest):
    case = _require_case(case_id)
    anchors = [anchor for anchor in case.get("anchors", []) if anchor.get("block_type") != "heading"]
    state = case.get("processing_state", {}).get("analysis", {})
    completed_ids = set(state.get("completed_section_ids", []))
    if body.section_ids:
        candidates = [anchor for anchor in anchors if anchor.get("anchor_id") in set(body.section_ids)]
    else:
        candidates = [anchor for anchor in anchors if anchor.get("anchor_id") not in completed_ids]
    selected = candidates[: body.batch_size]
    suggestions = list(case.get("suggestions", []))

    for anchor in selected:
        suggestion_id = f"sug_{anchor.get('anchor_id')}"
        if any(item.get("suggestion_id") == suggestion_id for item in suggestions):
            completed_ids.add(anchor.get("anchor_id"))
            continue
        text = anchor.get("text", "")
        suggestion_type = "ownership_gap" if "owner" in text.lower() else "testability_gap"
        if body.use_llm:
            prompt = build_prompt(
                "sop_uplift_suggestions",
                sop_section=text,
                retrieved_context=json.dumps(case.get("corpus_map", {})),
            )
            result = run_json_prompt("sop_uplift_suggestions", prompt, SopSuggestionResponse)
            if result.parsed and result.parsed.suggestions:
                for item in result.parsed.suggestions:
                    item_data = item.model_dump()
                    suggestions.append(
                        {
                            "suggestion_id": item_data.get("suggestion_id") or suggestion_id,
                            "type": item_data.get("type", "testability_gap"),
                            "severity": item_data.get("severity", "medium"),
                            "status": "open",
                            "anchor_id": item_data.get("anchor_id") or anchor.get("anchor_id"),
                            "title": item_data.get("title", "SOP uplift suggestion"),
                            "summary": item_data.get("summary", ""),
                            "rationale": item_data.get("rationale", ""),
                            "impact": item_data.get("impact", ""),
                            "original_text": item_data.get("original_text", text),
                            "suggested_text": item_data.get("suggested_text", ""),
                            "user_text": "",
                            "source_references": item_data.get("source_references", []),
                            "anchor_confidence": item_data.get("anchor_confidence", "medium"),
                            "created_from": "analysis",
                        }
                    )
            else:
                suggestions.append(_fallback_suggestion(suggestion_id, suggestion_type, anchor, text))
            case.setdefault("prompt_runs", []).append(result.record)
        else:
            suggestions.append(
                _fallback_suggestion(suggestion_id, suggestion_type, anchor, text)
            )
        completed_ids.add(anchor.get("anchor_id"))

    analysis_state = {
        "total": len(anchors),
        "completed": len(completed_ids),
        "failed": 0,
        "pending": max(0, len(anchors) - len(completed_ids)),
        "last_completed_section_id": selected[-1].get("anchor_id") if selected else state.get("last_completed_section_id"),
        "completed_section_ids": sorted(completed_ids),
    }
    processing_state = {**case.get("processing_state", {}), "analysis": analysis_state}
    updates = {
        "suggestions": suggestions,
        "processing_state": processing_state,
        "status": "review_ready",
        "prompt_runs": case.get("prompt_runs", []),
    }
    get_store().update_case(case_id, updates)
    return {"suggestions": suggestions, "processing_state": processing_state}


def _fallback_suggestion(suggestion_id: str, suggestion_type: str, anchor: dict[str, Any], text: str) -> dict[str, Any]:
    return {
                "suggestion_id": suggestion_id,
                "type": suggestion_type,
                "severity": "medium",
                "status": "open",
                "anchor_id": anchor.get("anchor_id"),
                "title": "Make SOP step testable and owned",
                "summary": "Clarify the accountable role, frequency, and evidence artifact for this SOP step.",
                "rationale": "SOP Uplift requires reviewable, evidence-backed procedure language.",
                "impact": "Improves control testability and operating clarity.",
                "original_text": text,
                "suggested_text": f"Update this step to identify the owner, review frequency, and retained evidence: {text}",
                "user_text": "",
                "source_references": [{"anchor_id": anchor.get("anchor_id"), "section_path": anchor.get("section_path", [])}],
                "anchor_confidence": "high",
                "created_from": "analysis",
    }


@router.post("/cases/{case_id}/build-corpus-map")
def build_corpus_map(case_id: str):
    case = _require_case(case_id)
    corpus_map = {
        "primary_process": case.get("process_name", ""),
        "processes_identified": [case.get("process_name", "")] if case.get("process_name") else [],
        "actors": sorted(
            {
                "Operations Risk" if "operations risk" in (msg.get("content", "").lower()) else ""
                for msg in case.get("case_chat", [])
            }
            - {""}
        ),
        "systems": [],
        "risk_to_control_map": [],
        "sop_to_control_map": [],
        "sop_to_risk_map": [],
        "evidence_to_control_map": [],
        "chat_context_to_sop_map": [
            {"message": msg.get("content", ""), "confidence": "medium"}
            for msg in case.get("case_chat", [])
            if msg.get("role") == "user"
        ],
        "coverage_gaps": [item.get("type") for item in case.get("suggestions", []) if item.get("type")],
        "conflicts_or_inconsistencies": [],
        "low_confidence_items": [
            item for item in case.get("document_tags", []) if item.get("confidence") == "low"
        ],
        "warnings": [],
    }
    get_store().update_case(case_id, {"corpus_map": corpus_map})
    return {"corpus_map": corpus_map}


@router.post("/cases/{case_id}/chat/{message_id}/convert-to-suggestion", status_code=201)
def convert_chat_to_suggestion(case_id: str, message_id: str):
    case = _require_case(case_id)
    message = next((item for item in case.get("case_chat", []) if item.get("message_id") == message_id), None)
    if not message:
        raise HTTPException(404, "Chat message not found")
    suggestion = {
        "suggestion_id": f"chat_{message_id}",
        "type": "chat_context",
        "severity": "medium",
        "status": "open",
        "anchor_id": "",
        "title": "Apply case chat context",
        "summary": message.get("content", ""),
        "rationale": "User-provided case context can inform a reviewable SOP uplift suggestion.",
        "impact": "Improves case-specific SOP clarity.",
        "original_text": "",
        "suggested_text": message.get("content", ""),
        "user_text": "",
        "source_references": [{"message_id": message_id}],
        "anchor_confidence": "low",
        "created_from": "case_chat",
    }
    suggestions = list(case.get("suggestions", [])) + [suggestion]
    chat = []
    for item in case.get("case_chat", []):
        if item.get("message_id") == message_id:
            item = {**item, "linked_suggestion_ids": [*item.get("linked_suggestion_ids", []), suggestion["suggestion_id"]]}
        chat.append(item)
    get_store().update_case(case_id, {"suggestions": suggestions, "case_chat": chat})
    return suggestion


@router.get("/cases/{case_id}/tasks/{task_id}")
def get_task(case_id: str, task_id: str):
    case = _require_case(case_id)
    stage = case.get("processing_state", {}).get(task_id, {})
    pending = stage.get("pending", 0)
    return {
        "task_id": task_id,
        "status": "running" if pending else "done",
        "processing_state": stage,
    }


@router.post("/cases/{case_id}/generate-outputs", status_code=202)
def generate_outputs(case_id: str):
    case = _require_case(case_id)
    suggestions = case.get("suggestions", [])
    suggestion_counts = {
        "total": len(suggestions),
        "accepted": sum(1 for item in suggestions if item.get("status") == "accepted"),
        "edited": sum(1 for item in suggestions if item.get("status") == "edited"),
        "rejected": sum(1 for item in suggestions if item.get("status") == "rejected"),
    }
    sections = [
        {
            "anchor_id": anchor.get("anchor_id"),
            "heading": " > ".join(anchor.get("section_path", [])) or "SOP Section",
            "text": anchor.get("text", ""),
        }
        for anchor in case.get("anchors", [])
        if anchor.get("block_type") != "heading"
    ]
    model = DiagramModel.model_validate(case.get("diagram_model")) if case.get("diagram_model") else _build_diagram_model(case)
    docx_bytes = generate_docx(case, sections, suggestions)
    drawio_text = export_drawio(model)
    svg_text = export_svg(model)
    pdf_bytes = export_diagram_pdf(model)
    vsdx_bytes = export_vsdx_stub(model)
    markdown_log = build_markdown_change_log(case, suggestions, [])
    json_log = build_json_audit_log(case, suggestions, [])

    def output_item(output_id: str, output_type: str, filename: str, content: bytes | str, content_type: str):
        raw = content.encode("utf-8") if isinstance(content, str) else content
        return {
            "output_id": output_id,
            "type": output_type,
            "filename": filename,
            "gridfs_file_id": "",
            "status": "generated",
            "content_type": content_type,
            "content_b64": base64.b64encode(raw).decode("ascii"),
            "metadata": {"generated_by": "TRACE SOP Uplift"},
        }

    safe_name = (case.get("process_name") or "sop").replace(" ", "_").lower()
    output_payloads = [
        ("docx-output", "docx", f"{safe_name}_uplift.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("drawio-output", "drawio", f"{safe_name}_swimlane.drawio", drawio_text, "application/xml"),
        ("diagram-pdf-output", "diagram_pdf", f"{safe_name}_diagram.pdf", pdf_bytes, "application/pdf"),
        ("svg-output", "svg", f"{safe_name}_diagram.svg", svg_text, "image/svg+xml"),
        ("changelog-md-output", "changelog_markdown", f"{safe_name}_change_log.md", markdown_log, "text/markdown"),
        ("changelog-json-output", "changelog_json", f"{safe_name}_audit_log.json", json.dumps(json_log, indent=2), "application/json"),
    ]
    outputs = []
    for output_id, output_type, filename, content, content_type in output_payloads:
        item = output_item(output_id, output_type, filename, content, content_type)
        try:
            stored = get_store().save_output_content(case_id, item, base64.b64decode(item["content_b64"]))
            item["gridfs_file_id"] = stored.get("gridfs_file_id", "")
        except Exception:
            pass
        outputs.append(item)
    outputs.append(
        {
            "output_id": "vsdx-future-stub",
            "type": "vsdx",
            "filename": f"{safe_name}_future.vsdx",
            "gridfs_file_id": "",
            "status": "generated",
            "content_type": "application/octet-stream",
            "content_b64": base64.b64encode(vsdx_bytes).decode("ascii"),
            "metadata": {"v1_status": "future-compatible stub"},
        },
    )
    get_store().update_case(case_id, {"outputs": outputs, "status": "complete"})
    try:
        from utils.rcm_report_store import RCMReportStore

        report_store = RCMReportStore()
        if report_store.is_connected:
            report_store.save_sop_uplift_report(
                {
                    "case_id": case_id,
                    "case_title": case.get("title", ""),
                    "process_name": case.get("process_name", ""),
                    "suggestion_counts": suggestion_counts,
                    "case_chat_inputs_captured": sum(
                        1 for item in case.get("case_chat", []) if item.get("role") == "user"
                    ),
                    "output_files": [
                        {
                            "type": item.get("type"),
                            "filename": item.get("filename"),
                            "output_id": item.get("output_id"),
                        }
                        for item in outputs
                    ],
                    "change_log_markdown": markdown_log,
                }
            )
    except Exception:
        pass
    return {"status": "generated", "outputs": outputs}


@router.get("/cases/{case_id}/outputs")
def list_outputs(case_id: str):
    case = _require_case(case_id)
    return {"outputs": case.get("outputs", [])}


@router.get("/cases/{case_id}/outputs/{output_id}")
def download_output(case_id: str, output_id: str):
    case = _require_case(case_id)
    output = next((item for item in case.get("outputs", []) if item.get("output_id") == output_id), None)
    if not output:
        raise HTTPException(404, "Output not found")
    content_b64 = output.get("content_b64")
    content = get_store().get_output_content(case_id, output_id)
    if content is None and content_b64:
        content = base64.b64decode(content_b64)
    if content is None:
        raise HTTPException(404, "Output content not available")
    return Response(
        content,
        media_type=output.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={output.get('filename')}"},
    )


def _build_diagram_model(case: dict[str, Any]) -> DiagramModel:
    lanes = [
        DiagramLane(lane_id="business_owner", name="Business Owner", order=1),
        DiagramLane(lane_id="operations_risk", name="Operations Risk", order=2),
        DiagramLane(lane_id="compliance", name="Compliance", order=3),
        DiagramLane(lane_id="control_testing", name="Control Testing", order=4),
    ]
    nodes: list[DiagramNode] = []
    source_anchors = [anchor for anchor in case.get("anchors", []) if anchor.get("block_type") != "heading"]
    for index, anchor in enumerate(source_anchors[:8]):
        lane = lanes[index % len(lanes)]
        nodes.append(
            DiagramNode(
                node_id=f"node_{index + 1}",
                lane_id=lane.lane_id,
                type="activity",
                label=(anchor.get("text") or "SOP step")[:40],
                source_anchor_ids=[anchor.get("anchor_id", "")],
            )
        )
    if not nodes:
        nodes = [
            DiagramNode(node_id="node_1", lane_id="business_owner", type="activity", label="Start SOP review"),
            DiagramNode(node_id="node_2", lane_id="operations_risk", type="control", label="Review controls"),
            DiagramNode(node_id="node_3", lane_id="control_testing", type="evidence", label="Retain evidence"),
        ]
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


def _infer_document_tag(filename: str, bucket: str) -> str:
    if "sop" in filename or "procedure" in filename or bucket in {"sops", "procedures"}:
        return "sop"
    if "rcm" in filename or "risk_control" in bucket:
        return "risk_control_matrix"
    if "risk" in filename or "risk_register" in bucket:
        return "risk_register"
    if "control" in filename or "control_invent" in bucket:
        return "control_inventory"
    if "evidence" in filename or "evidence" in bucket:
        return "evidence"
    if "diagram" in filename or "process" in filename or "diagram" in bucket:
        return "process_diagram"
    if "audit" in filename or "issue" in filename:
        return "audit_report"
    return "supporting_material"

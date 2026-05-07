from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
import re
import threading
from datetime import datetime
from typing import Any, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from utils.sop_uplift.case_index import build_case_local_index, search_case_local_index
from utils.sop_uplift.case_store import SopUpliftCaseStore
from utils.sop_uplift.readiness import compute_readiness
from utils.sop_uplift.analysis_engine import generate_rule_based_suggestions, mark_rule_fallback_suggestions, quality_gate_suggestions
from utils.sop_uplift.anchor_builder import build_anchors
from utils.sop_uplift.change_log import build_json_audit_log, build_markdown_change_log
from utils.sop_uplift.chunker import build_chunks
from utils.sop_uplift.content_sanitizer import sanitize_chunk
from utils.sop_uplift.diagram_exporters.drawio_exporter import export_drawio
from utils.sop_uplift.diagram_exporters.mermaid_exporter import export_mermaid
from utils.sop_uplift.diagram_exporters.pdf_exporter import export_diagram_pdf
from utils.sop_uplift.diagram_exporters.png_exporter import export_png
from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
from utils.sop_uplift.diagram_exporters.vsdx_exporter import export_vsdx_stub
from utils.sop_uplift.diagram_model import DiagramEdge, DiagramLane, DiagramModel, DiagramNode
from utils.sop_uplift.llm_schemas import AgentFollowUpQuestionsResponse, PolicyRequirementExtractionResponse, SopSuggestionResponse
from utils.sop_uplift.llm_orchestrator import run_json_prompt
from utils.sop_uplift.markdown_ingestion import convert_bytes_to_markdown, looks_corrupt_markdown
from utils.sop_uplift.pipeline import build_suggestion_context, normalize_diagram_model, run_full_sop_pipeline, suggestion_quality_context
from utils.sop_uplift.preview_renderer import build_preview_model
from utils.sop_uplift.prompt_templates import build_prompt
from utils.sop_uplift.retrieval import retrieve_context
from utils.sop_uplift.rewrite_generator import build_revised_sections, generate_docx
from utils.sop_uplift.tagging import suggest_document_tag

router = APIRouter(prefix="/sop-uplift", tags=["sop-uplift"])
logger = logging.getLogger(__name__)


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
    context_snapshot: dict[str, Any] = Field(default_factory=dict)


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
    use_llm: bool = True


class PipelineRunRequest(BaseModel):
    use_llm: bool = True
    max_chunk_chars: int = Field(default_factory=lambda: int(os.getenv("SOP_UPLIFT_MAX_CHUNK_CHARS", "20000")), ge=500, le=20000)


class FollowUpQuestionsRequest(BaseModel):
    use_llm: bool = True


class CaseIndexSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(5, ge=1, le=25)


_store: SopUpliftCaseStore | None = None
_active_pipeline_cases: set[str] = set()
_active_pipeline_cases_lock = threading.Lock()


def get_store() -> SopUpliftCaseStore:
    global _store
    if _store is None:
        _store = SopUpliftCaseStore()
    return _store


def _pipeline_timeout_seconds() -> int:
    raw_value = os.getenv("SOP_UPLIFT_PIPELINE_TIMEOUT_SECONDS", os.getenv("PIPELINE_TIMEOUT_SECONDS", "3600"))
    try:
        return max(1, int(raw_value))
    except (TypeError, ValueError):
        return 3600


def _is_stale_pipeline_state(pipeline_state: dict[str, Any]) -> bool:
    if pipeline_state.get("status") != "running":
        return False
    heartbeat = pipeline_state.get("updated_at") or pipeline_state.get("started_at")
    return _elapsed_seconds(heartbeat) > _pipeline_timeout_seconds()


def _claim_pipeline_case(case_id: str) -> bool:
    with _active_pipeline_cases_lock:
        if case_id in _active_pipeline_cases:
            return False
        _active_pipeline_cases.add(case_id)
        return True


def _release_pipeline_case(case_id: str) -> None:
    with _active_pipeline_cases_lock:
        _active_pipeline_cases.discard(case_id)


def dispatch_pipeline(case_id: str, stage: int = 1) -> None:
    backend = os.getenv("TASK_BACKEND", "asyncio").strip().lower() or "asyncio"
    if stage != 1:
        raise HTTPException(status_code=501, detail=f"SOP Uplift pipeline stage {stage} is not implemented.")
    if backend == "asyncio":
        thread = threading.Thread(target=_run_pipeline_background, args=(case_id,), daemon=True)
        thread.start()
        return
    if backend == "celery":
        raise HTTPException(status_code=501, detail="TASK_BACKEND=celery is configured, but the Celery dispatcher is not wired yet.")
    raise HTTPException(status_code=400, detail=f"Unsupported TASK_BACKEND value: {backend}")


def _require_case(case_id: str) -> dict[str, Any]:
    case = get_store().get_case(case_id)
    if not case:
        raise HTTPException(404, "SOP Uplift case not found")
    return case


def _public_file_metadata(file_meta: dict[str, Any]) -> dict[str, Any]:
    public = dict(file_meta)
    public.pop("raw_content", None)
    public.pop("raw_content_b64", None)
    return public


def _public_case(case: dict[str, Any]) -> dict[str, Any]:
    public = dict(case)
    public["uploaded_files"] = [_public_file_metadata(item) for item in case.get("uploaded_files", [])]
    return public


@router.post("/cases", status_code=201)
def create_case(body: SopCaseCreate):
    return _public_case(get_store().create_case(body.model_dump()))


@router.get("/cases")
def list_cases():
    return {"cases": [_public_case(case) for case in get_store().list_cases()]}


@router.get("/cases/{case_id}")
def get_case(case_id: str):
    return _public_case(_require_case(case_id))


@router.patch("/cases/{case_id}")
def update_case(case_id: str, body: SopCaseUpdate):
    updated = get_store().update_case(case_id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(404, "SOP Uplift case not found")
    return _public_case(updated)


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
    return _public_file_metadata(metadata)


@router.get("/cases/{case_id}/files")
def list_files(case_id: str):
    case = _require_case(case_id)
    return {"files": [_public_file_metadata(item) for item in case.get("uploaded_files", [])]}


@router.get("/cases/{case_id}/files/{file_id}/content")
def get_file_content(case_id: str, file_id: str):
    case = _require_case(case_id)
    file_meta = next((item for item in case.get("uploaded_files", []) if item.get("file_id") == file_id), None)
    if not file_meta:
        raise HTTPException(404, "SOP Uplift file not found")
    content = get_store().get_file_content(case_id, file_id)
    if content is None:
        raise HTTPException(404, "SOP Uplift file content not found")
    filename = file_meta.get("filename") or "document"
    media_type = file_meta.get("content_type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
            "X-SOP-Uplift-Filename": filename,
        },
    )


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
    markdown_by_file_id = {
        document.get("file_id"): document.get("markdown", "")
        for document in case.get("markdown_documents", [])
        if document.get("file_id")
    }
    for file_meta in case.get("uploaded_files", []):
        file_id = file_meta.get("file_id")
        if not file_id:
            continue
        suggested = suggest_document_tag(file_meta, markdown_by_file_id.get(file_id, ""))
        stored = get_store().set_document_tag(
            case_id,
            file_id,
            {
                "suggested_tag": suggested["suggested_tag"],
                "confirmed_tag": suggested["confirmed_tag"],
                "confidence": suggested["confidence"],
            },
        )
        tags.append(stored or suggested)
    return {"document_tags": tags}


@router.post("/cases/{case_id}/convert")
def convert_case_documents(case_id: str):
    case = _require_case(case_id)
    updates = _convert_case_documents(case_id, case)
    get_store().update_case(case_id, updates)
    return updates


def _convert_case_documents(case_id: str, case: dict[str, Any]) -> dict[str, Any]:
    uploaded_files = [dict(file_meta) for file_meta in case.get("uploaded_files", [])]
    markdown_documents = list(case.get("markdown_documents", []))
    anchors = list(case.get("anchors", []))
    chunks = list(case.get("chunks", []))
    converted_by_file_id = {doc.get("file_id"): doc for doc in markdown_documents}
    completed = 0
    failed = 0

    max_chunks = int(os.getenv("SOP_UPLIFT_MAX_CHUNKS_PER_CASE", "200"))

    for file_meta in uploaded_files:
        file_id = file_meta.get("file_id")
        if not file_id:
            continue
        filename = file_meta.get("filename", "")
        suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        preferred_converter = {"docx": "python-docx", "xlsx": "openpyxl", "xlsm": "openpyxl", "xltx": "openpyxl", "xltm": "openpyxl"}.get(suffix)
        existing_document = converted_by_file_id.get(file_id)
        existing_converter = (existing_document or {}).get("conversion", {}).get("converter")
        existing_markdown = (existing_document or {}).get("markdown", "")
        needs_reconvert = bool(
            existing_document
            and (
                looks_corrupt_markdown(existing_markdown)
                or (preferred_converter and existing_converter and existing_converter != preferred_converter)
            )
        )
        if existing_document and not needs_reconvert:
            continue
        if needs_reconvert:
            document_id = existing_document.get("document_id") or f"doc_{file_id}"
            markdown_documents = [doc for doc in markdown_documents if doc.get("file_id") != file_id]
            removed_anchor_ids = {anchor.get("anchor_id") for anchor in anchors if anchor.get("file_id") == file_id or anchor.get("document_id") == document_id}
            anchors = [anchor for anchor in anchors if anchor.get("file_id") != file_id and anchor.get("document_id") != document_id]
            chunks = [
                chunk
                for chunk in chunks
                if chunk.get("document_id") != document_id and not set(chunk.get("anchor_ids", [])).intersection(removed_anchor_ids)
            ]
        try:
            raw = get_store().get_file_content(case_id, file_id)
            if not isinstance(raw, (bytes, bytearray)):
                raw = base64.b64decode(file_meta.get("raw_content_b64", ""))
            conversion = convert_bytes_to_markdown(
                bytes(raw),
                filename,
                file_meta.get("content_type", ""),
            )
            markdown = conversion.markdown
            conversion_metadata = {
                "status": conversion.status,
                "converter": conversion.converter,
                "fallback_used": conversion.fallback_used,
                "warnings": conversion.warnings,
            }
            if conversion.status != "converted" or looks_corrupt_markdown(markdown):
                conversion_metadata = {
                    **conversion_metadata,
                    "status": "failed",
                    "warnings": [*conversion_metadata.get("warnings", []), "Converted content looked binary/corrupt and was excluded from review."],
                }
                file_meta["conversion"] = conversion_metadata
                failed += 1
                continue
            document_id = f"doc_{file_id}"
            doc_anchors = build_anchors(markdown, document_id=document_id, file_id=file_id)
            doc_chunks = build_chunks(markdown, doc_anchors, document_id=document_id, file_id=file_id)
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
    removed_anchor_ids = {anchor.get("anchor_id") for anchor in case.get("anchors", [])} - {anchor.get("anchor_id") for anchor in anchors}
    if removed_anchor_ids:
        updates["suggestions"] = [
            suggestion
            for suggestion in case.get("suggestions", [])
            if suggestion.get("anchor_id") not in removed_anchor_ids
        ]
    updates["case_index"] = build_case_local_index({**case, **updates})
    safe_markdown_documents = [doc for doc in markdown_documents if not looks_corrupt_markdown(doc.get("markdown", ""))]
    safe_document_ids = {doc.get("document_id") for doc in safe_markdown_documents}
    safe_file_ids = {doc.get("file_id") for doc in safe_markdown_documents}
    safe_anchors = [
        anchor
        for anchor in anchors
        if anchor.get("document_id") in safe_document_ids or anchor.get("file_id") in safe_file_ids
    ]
    updates["preview_model"] = build_preview_model(
        safe_markdown_documents,
        safe_anchors,
        updates.get("suggestions", case.get("suggestions", [])),
    )
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
    case = _require_case(case_id)
    message = get_store().add_chat_message(case_id, body.role, body.content, body.context_snapshot)
    if not message:
        raise HTTPException(404, "SOP Uplift case not found")
    if body.role != "user":
        return message
    reply = _case_chat_agent_reply(case, body.content, body.context_snapshot or {})
    agent_message = get_store().add_chat_message(case_id, "agent", reply, body.context_snapshot)
    return {**message, "agent_message": agent_message}


def _case_chat_agent_reply(case: dict[str, Any], content: str, context_snapshot: dict[str, Any]) -> str:
    text = content.lower()
    step = str(context_snapshot.get("workflow_step") or "").lower()
    readiness = case.get("readiness", {}) or {}
    missing = readiness.get("missing_recommended_inputs") or []
    tags = case.get("document_tags", []) or []
    files = case.get("uploaded_files", []) or []
    suggestions = case.get("suggestions", []) or []
    outputs = case.get("outputs", []) or []
    if "missing" in text or "document" in text or step == "upload":
        if missing:
            return f"Based on the current uploads, the next useful document type is: {', '.join(str(item).replace('_', ' ') for item in missing)}. Uploaded files currently tagged: {len(tags)} of {len(files)}."
        return f"The upload set is currently sufficient for analysis. I see {len(files)} uploaded file(s) and {len(tags)} confirmed document tag(s)."
    if "tag" in text:
        if tags:
            labels = ", ".join(f"{tag.get('filename') or tag.get('file_id')}: {str(tag.get('confirmed_tag', '')).replace('_', ' ')}" for tag in tags[:5])
            return f"Current confirmed tags are: {labels}. You can override any tag before running analysis."
        return "No confirmed document tags are available yet. Upload files or run tagging first, then I can explain the detected tags."
    if "suggestion" in text or step == "review":
        open_count = sum(1 for item in suggestions if item.get("status") == "open")
        accepted_count = sum(1 for item in suggestions if item.get("status") == "accepted")
        return f"There are {open_count} open suggestion(s) and {accepted_count} accepted suggestion(s). I can help explain a selected suggestion or convert your chat context into a new suggestion."
    if "download" in text or "artifact" in text or "output" in text or step == "outputs":
        if outputs:
            names = ", ".join(output.get("filename", output.get("type", "artifact")) for output in outputs[:6])
            return f"Generated artifacts available: {names}. For diagrams, use PDF for review, PNG/SVG for images, Draw.io for editing, and Mermaid for text-based diagrams."
        return "No outputs have been generated yet. After review, generate outputs to download the updated SOP plus diagram formats."
    if "readiness" in text or "summarize" in text:
        message = readiness.get("message") or "Readiness has not been computed yet."
        return f"Current case readiness: {message}"
    return "I captured that for this case. I can help with upload readiness, document tags, review suggestions, or generated outputs from the current workflow context."


def _llm_unavailable_error(record: dict[str, Any]) -> bool:
    error = str(record.get("error") or "")
    return record.get("model") == "unavailable" or "LLM unavailable" in error


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
    safe_markdown_documents = [
        document
        for document in case.get("markdown_documents", [])
        if not looks_corrupt_markdown(document.get("markdown", ""))
    ]
    safe_document_ids = {document.get("document_id") for document in safe_markdown_documents}
    safe_file_ids = {document.get("file_id") for document in safe_markdown_documents}
    safe_anchors = [
        anchor
        for anchor in case.get("anchors", [])
        if anchor.get("document_id") in safe_document_ids or anchor.get("file_id") in safe_file_ids
    ]
    preview_model = build_preview_model(
        safe_markdown_documents,
        safe_anchors,
        case.get("suggestions", []),
    )
    return {
        "case_id": case_id,
        "markdown_documents": safe_markdown_documents,
        "anchors": safe_anchors,
        "suggestions": case.get("suggestions", []),
        "preview_model": preview_model,
        "diagram_model": case.get("diagram_model", {}),
    }


@router.post("/cases/{case_id}/run-pipeline", status_code=202)
def run_pipeline(case_id: str, body: PipelineRunRequest):
    case = _require_case(case_id)
    existing = case.get("processing_state", {}).get("pipeline", {})
    if existing.get("status") == "running":
        if not _is_stale_pipeline_state(existing):
            return {"task_id": "pipeline", "status": "running", "processing_state": existing}
        stale_warning = (
            f"Previous pipeline run was marked stale after {_pipeline_timeout_seconds()} seconds and can be retried."
        )
        existing_warnings = list(existing.get("warnings") or [])
        if stale_warning not in existing_warnings:
            existing_warnings.append(stale_warning)
        stale_state = _update_pipeline_progress(
            case_id,
            case,
            status="failed",
            phase="failed",
            message="Previous pipeline run was marked stale.",
            completed=0,
            total=100,
            percent=0,
            error=stale_warning,
            warnings=existing_warnings,
        )
        _release_pipeline_case(case_id)
        case = {
            **case,
            "processing_state": {
                **case.get("processing_state", {}),
                "pipeline": stale_state,
            },
        }
    if not _claim_pipeline_case(case_id):
        return {
            "task_id": "pipeline",
            "status": "running",
            "processing_state": existing
            or {
                "status": "running",
                "phase": "starting",
                "message": "Pipeline is already running for this case.",
                "completed": 0,
                "total": 100,
                "pending": 100,
                "failed": 0,
                "percent": 1,
            },
        }
    options = body.model_dump()
    initial_state = _update_pipeline_progress(
        case_id,
        case,
        status="running",
        phase="starting",
        message="TRACE is reviewing case files...",
        completed=0,
        total=100,
        percent=1,
        options=options,
    )
    try:
        dispatch_pipeline(case_id)
    except Exception:
        _release_pipeline_case(case_id)
        raise
    return {"task_id": "pipeline", "status": "running", "processing_state": initial_state}


def _utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _elapsed_seconds(started_at: str | None) -> int:
    if not started_at:
        return 0
    try:
        return max(0, round((datetime.utcnow() - datetime.fromisoformat(started_at.replace("Z", ""))).total_seconds()))
    except Exception:
        return 0


def _update_pipeline_progress(
    case_id: str,
    case: dict[str, Any] | None = None,
    *,
    status: str,
    phase: str,
    message: str,
    completed: int,
    total: int,
    percent: int,
    error: str = "",
    warnings: list[str] | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    case = case or _require_case(case_id)
    current_state = case.get("processing_state", {})
    current_pipeline = current_state.get("pipeline", {})
    now = _utc_now()
    started_at = current_pipeline.get("started_at") or now
    pipeline_state = {
        **current_pipeline,
        "status": status,
        "phase": phase,
        "message": message,
        "completed": max(0, completed),
        "total": max(1, total),
        "pending": max(0, max(1, total) - max(0, completed)) if status == "running" else 0,
        "failed": 1 if status == "failed" else 0,
        "percent": max(0, min(100, percent)),
        "started_at": started_at,
        "updated_at": now,
        "elapsed_seconds": _elapsed_seconds(started_at),
    }
    if status in {"complete", "failed"}:
        pipeline_state["completed_at"] = now
        pipeline_state["pending"] = 0
    if error:
        pipeline_state["error"] = error
    elif status != "failed":
        pipeline_state.pop("error", None)
    if warnings is not None:
        pipeline_state["warnings"] = warnings
    if options is not None:
        pipeline_state["options"] = options
    processing_state = {**current_state, "pipeline": pipeline_state}
    get_store().update_case(case_id, {"processing_state": processing_state})
    return pipeline_state


def _run_pipeline_background(case_id: str) -> None:
    try:
        case = _require_case(case_id)
        options = case.get("processing_state", {}).get("pipeline", {}).get("options", {})
        _update_pipeline_progress(
            case_id,
            case,
            status="running",
            phase="converting",
            message="Converting uploaded documents...",
            completed=5,
            total=100,
            percent=5,
        )
        conversion_updates = _convert_case_documents(case_id, case)
        get_store().update_case(case_id, conversion_updates)
        converted_case = {**case, **conversion_updates}
        _update_pipeline_progress(
            case_id,
            converted_case,
            status="running",
            phase="parsing",
            message="Reading converted document content...",
            completed=15,
            total=100,
            percent=15,
        )

        def progress_callback(phase: str, message: str, completed: int, total: int, percent: int) -> None:
            latest_case = _require_case(case_id)
            _update_pipeline_progress(
                case_id,
                latest_case,
                status="running",
                phase=phase,
                message=message,
                completed=completed,
                total=total,
                percent=percent,
            )

        pipeline_updates = run_full_sop_pipeline(
            converted_case,
            use_llm=bool(options.get("use_llm", True)),
            max_chunk_chars=int(options.get("max_chunk_chars") or 20000),
            progress_callback=progress_callback,
        )
        pipeline_warnings = pipeline_updates.get("processing_state", {}).get("pipeline", {}).get("warnings", [])
        if "processing_state" in pipeline_updates:
            pipeline_updates["processing_state"] = {
                key: value
                for key, value in pipeline_updates["processing_state"].items()
                if key != "pipeline"
            }
            if not pipeline_updates["processing_state"]:
                pipeline_updates.pop("processing_state", None)
        updates = {**conversion_updates, **pipeline_updates}
        _update_pipeline_progress(
            case_id,
            {**converted_case, **pipeline_updates},
            status="running",
            phase="indexing",
            message="Finalizing case index and document preview...",
            completed=95,
            total=100,
            percent=95,
        )
        updates["case_index"] = build_case_local_index({**converted_case, **pipeline_updates})
        get_store().update_case(case_id, updates)
        completed_case = _require_case(case_id)
        _update_pipeline_progress(
            case_id,
            completed_case,
            status="complete",
            phase="complete",
            message="Extraction complete.",
            completed=100,
            total=100,
            percent=100,
            warnings=pipeline_warnings,
        )
    except Exception as exc:
        try:
            latest_case = _require_case(case_id)
        except Exception:
            latest_case = {"processing_state": {}}
        _update_pipeline_progress(
            case_id,
            latest_case,
            status="failed",
            phase="failed",
            message="Extraction failed.",
            completed=0,
            total=100,
            percent=0,
            error=str(exc),
        )
    finally:
        _release_pipeline_case(case_id)


@router.post("/cases/{case_id}/extract")
def extract_case(case_id: str, body: BatchProcessRequest):
    case = _require_case(case_id)
    chunks = list(case.get("chunks", []))
    state = case.get("processing_state", {}).get("extraction", {})
    completed_ids = set(state.get("completed_chunk_ids", []))
    pending = [chunk for chunk in chunks if chunk.get("chunk_id") not in completed_ids]
    selected = pending[: body.batch_size]
    warnings = []
    max_chars = int(os.getenv("SOP_UPLIFT_MAX_CHUNK_CHARS", "20000"))
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
            if _llm_unavailable_error(result.record):
                raise HTTPException(status_code=503, detail="Check LLM settings")
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
    sop_file_ids = {
        tag.get("file_id")
        for tag in case.get("document_tags", [])
        if tag.get("confirmed_tag") in {"sop", "policy"}
    }
    if not sop_file_ids:
        sop_file_ids = {
            file_meta.get("file_id")
            for file_meta in case.get("uploaded_files", [])
            if file_meta.get("bucket") in {"sops", "procedures"}
        }
    all_content_anchors = [anchor for anchor in case.get("anchors", []) if anchor.get("block_type") != "heading"]
    anchors = [
        anchor
        for anchor in all_content_anchors
        if not sop_file_ids or anchor.get("file_id") in sop_file_ids
    ]
    supporting_chunks = [
        chunk
        for chunk in case.get("chunks", [])
        if not sop_file_ids or chunk.get("file_id") not in sop_file_ids
    ]
    state = case.get("processing_state", {}).get("analysis", {})
    completed_ids = set(state.get("completed_section_ids", []))
    if body.section_ids:
        candidates = [anchor for anchor in anchors if anchor.get("anchor_id") in set(body.section_ids)]
    else:
        candidates = [anchor for anchor in anchors if anchor.get("anchor_id") not in completed_ids]
    selected = candidates[: body.batch_size]
    suggestions = list(case.get("suggestions", []))
    quality_context = suggestion_quality_context(case)

    for anchor in selected:
        suggestion_id = f"sug_{anchor.get('anchor_id')}"
        existing_suggestion = next((item for item in suggestions if item.get("suggestion_id") == suggestion_id), None)
        if existing_suggestion and not (
            existing_suggestion.get("status") == "open"
            and existing_suggestion.get("created_from") in {"analysis", "llm", "rule_fallback"}
        ):
            completed_ids.add(anchor.get("anchor_id"))
            continue
        if existing_suggestion:
            suggestions = [item for item in suggestions if item.get("suggestion_id") != suggestion_id]
        text = anchor.get("text", "")
        if body.use_llm:
            available_context = supporting_chunks or case.get("chunks", [])
            supporting_context = retrieve_context(text, available_context, limit=5) or available_context[:5]
            suggestion_context = build_suggestion_context(
                case,
                {
                    "chunk_id": f"anchor_{anchor.get('anchor_id')}",
                    "document_id": anchor.get("document_id", ""),
                    "file_id": anchor.get("file_id", ""),
                    "content": text,
                    "anchor_ids": [anchor.get("anchor_id", "")],
                },
            )
            prompt = build_prompt(
                "sop_uplift_suggestions",
                sop_section=text,
                retrieved_context=json.dumps({"case_corpus_map": case.get("corpus_map", {}), "supporting_context": supporting_context}),
                suggestion_context=suggestion_context,
            )
            result = run_json_prompt("sop_uplift_suggestions", prompt, SopSuggestionResponse)
            case.setdefault("prompt_runs", []).append(result.record)
            if _llm_unavailable_error(result.record):
                raise HTTPException(status_code=503, detail="Check LLM settings")
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
                            "style_match_notes": item_data.get("style_match_notes", ""),
                            "created_from": "llm",
                        }
                    )
        else:
            suggestions.extend(mark_rule_fallback_suggestions(generate_rule_based_suggestions([anchor], context_chunks=supporting_chunks)))
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
    gate_kwargs = {
        "eligible_anchor_ids": quality_context["eligible_sop_anchor_ids"],
        "max_suggestions": 12,
    }
    if body.use_llm:
        gate_kwargs.update(
            {
                "concrete_terms": quality_context["concrete_terms"],
                "anchor_text_by_id": quality_context["anchor_text_by_id"],
                "require_source_references": True,
            }
        )

    updates = {
        "suggestions": quality_gate_suggestions(suggestions, **gate_kwargs),
        "processing_state": processing_state,
        "status": "review_ready",
        "prompt_runs": case.get("prompt_runs", []),
    }
    get_store().update_case(case_id, updates)
    return {"suggestions": updates["suggestions"], "processing_state": processing_state}


@router.post("/cases/{case_id}/follow-up-questions")
def generate_follow_up_questions(case_id: str, body: FollowUpQuestionsRequest):
    case = _require_case(case_id)
    prompt_records = list(case.get("prompt_runs", []))
    warnings: list[str] = []
    questions: list[dict[str, Any]]

    if body.use_llm:
        prompt = build_prompt(
            "agent_follow_up_questions",
            context={
                "case_id": case_id,
                "process_name": case.get("process_name", ""),
                "readiness": case.get("readiness", {}),
                "case_chat": case.get("case_chat", []),
                "corpus_map": case.get("corpus_map", {}),
                "suggestions": case.get("suggestions", []),
            },
        )
        result = run_json_prompt("agent_follow_up_questions", prompt, AgentFollowUpQuestionsResponse)
        prompt_records.append(result.record)
        if result.parsed:
            questions = _normalize_follow_up_questions(result.parsed.questions)
        else:
            warnings.append(result.record.get("error") or "LLM follow-up question generation returned no valid questions.")
            questions = _rule_based_follow_up_questions(case)
    else:
        questions = _rule_based_follow_up_questions(case)

    updates = {
        "agent_follow_up_questions": questions,
        "prompt_runs": prompt_records,
        "processing_state": {
            **case.get("processing_state", {}),
            "follow_up_questions": {
                "status": "complete",
                "total": len(questions),
                "completed": len(questions),
                "failed": 0,
                "pending": 0,
                "warnings": warnings,
            },
        },
    }
    get_store().update_case(case_id, updates)
    return {"agent_follow_up_questions": questions, "warnings": warnings}


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


def _normalize_follow_up_questions(items: list[dict[str, Any] | str]) -> list[dict[str, Any]]:
    questions = []
    for index, item in enumerate(items, start=1):
        if isinstance(item, str):
            question = {"question": item}
        else:
            question = dict(item)
        if not question.get("question"):
            continue
        questions.append(
            {
                "question_id": question.get("question_id") or f"q_{index}",
                "question": question.get("question", ""),
                "priority": question.get("priority", "medium"),
                **({"why_it_matters": question.get("why_it_matters")} if question.get("why_it_matters") else {}),
            }
        )
    return questions


def _rule_based_follow_up_questions(case: dict[str, Any]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    coverage_gaps = case.get("corpus_map", {}).get("coverage_gaps", [])
    if coverage_gaps:
        questions.append(
            {
                "question_id": "q_coverage_gap",
                "question": "Which owner should resolve the open coverage gaps identified for this SOP?",
                "priority": "high",
                "why_it_matters": "The uplift needs accountable ownership for unresolved risk, control, or evidence gaps.",
            }
        )
    if any(item.get("type") == "ownership_gap" for item in case.get("suggestions", [])):
        questions.append(
            {
                "question_id": "q_owner",
                "question": "Who is accountable for the SOP steps currently flagged with ownership gaps?",
                "priority": "high",
                "why_it_matters": "Named owners make the procedure testable and auditable.",
            }
        )
    if not any(item.get("role") == "user" for item in case.get("case_chat", [])):
        questions.append(
            {
                "question_id": "q_context",
                "question": "Are there case-specific exceptions, approvers, or evidence artifacts the SOP should preserve?",
                "priority": "medium",
                "why_it_matters": "Case context helps tailor suggestions to this uploaded corpus.",
            }
        )
    return questions[:5]


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
    case_index = build_case_local_index({**case, "corpus_map": corpus_map})
    get_store().update_case(case_id, {"corpus_map": corpus_map, "case_index": case_index})
    return {"corpus_map": corpus_map}


@router.post("/cases/{case_id}/build-index")
def build_index(case_id: str):
    case = _require_case(case_id)
    case_index = build_case_local_index(case)
    get_store().update_case(case_id, {"case_index": case_index})
    return {"case_index": case_index}


@router.get("/cases/{case_id}/index")
def get_index(case_id: str):
    case = _require_case(case_id)
    case_index = case.get("case_index") or build_case_local_index(case)
    if not case.get("case_index"):
        get_store().update_case(case_id, {"case_index": case_index})
    return {"case_index": case_index}


@router.post("/cases/{case_id}/index/search")
def search_index(case_id: str, body: CaseIndexSearchRequest):
    case = _require_case(case_id)
    case_index = case.get("case_index") or build_case_local_index(case)
    results = search_case_local_index(body.query, case_index, body.limit)
    return {
        "case_id": case_id,
        "source_scope": case_index.get("source_scope", "case_uploads_only"),
        "query": body.query,
        "results": results,
    }


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
    status_value = stage.get("status")
    if status_value not in {"running", "complete", "failed"}:
        pending = stage.get("pending", 0)
        status_value = "running" if pending else "done"
    if status_value == "complete":
        response_status = "done"
    else:
        response_status = status_value
    if stage.get("started_at"):
        stage = {**stage, "elapsed_seconds": _elapsed_seconds(stage.get("started_at"))}
    return {
        "task_id": task_id,
        "status": response_status,
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
    revised_sections = build_revised_sections(sections, suggestions)
    revised_case = {**case, "revised_sop_sections": revised_sections}
    model = _diagram_model_for_outputs(revised_case)
    docx_bytes = generate_docx(case, sections, suggestions, source_docx=_source_docx_for_outputs(case_id, case))
    drawio_text = export_drawio(model)
    mermaid_text = export_mermaid(model)
    svg_text = export_svg(model)
    png_bytes = export_png(model)
    pdf_bytes = export_diagram_pdf(model)
    vsdx_bytes = export_vsdx_stub(model)
    markdown_log = build_markdown_change_log(case, suggestions, [])
    json_log = build_json_audit_log(case, suggestions, [])

    def output_item(output_id: str, output_type: str, filename: str, content_type: str) -> dict[str, Any]:
        return {
            "output_id": output_id,
            "type": output_type,
            "filename": filename,
            "gridfs_file_id": "",
            "status": "generated",
            "content_type": content_type,
            "metadata": {"generated_by": "TRACE SOP Uplift"},
        }

    def output_bytes(content: bytes | str) -> bytes:
        return content.encode("utf-8") if isinstance(content, str) else content

    safe_name = (case.get("process_name") or "sop").replace(" ", "_").lower()
    output_payloads = [
        ("docx-output", "docx", f"{safe_name}_uplift.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("drawio-output", "drawio", f"{safe_name}_swimlane.drawio", drawio_text, "application/xml"),
        ("mermaid-output", "mermaid", f"{safe_name}_swimlane.mmd", mermaid_text, "text/plain"),
        ("diagram-png-output", "diagram_png", f"{safe_name}_diagram.png", png_bytes, "image/png"),
        ("diagram-pdf-output", "diagram_pdf", f"{safe_name}_diagram.pdf", pdf_bytes, "application/pdf"),
        ("svg-output", "svg", f"{safe_name}_diagram.svg", svg_text, "image/svg+xml"),
        ("changelog-md-output", "changelog_markdown", f"{safe_name}_change_log.md", markdown_log, "text/markdown"),
        ("changelog-json-output", "changelog_json", f"{safe_name}_audit_log.json", json.dumps(json_log, indent=2), "application/json"),
        ("vsdx-future-stub", "vsdx", f"{safe_name}_future.vsdx", vsdx_bytes, "application/octet-stream"),
    ]
    outputs = []
    for output_id, output_type, filename, content, content_type in output_payloads:
        item = output_item(output_id, output_type, filename, content_type)
        try:
            stored = get_store().save_output_content(case_id, item, output_bytes(content))
            item = {**item, **stored}
            item.pop("content_b64", None)
        except Exception as exc:
            logger.exception("SOP Uplift output storage failed for case_id=%s output_id=%s", case_id, output_id)
            raise HTTPException(503, f"Output storage error, try again: {exc}") from exc
        outputs.append(item)
    for output in outputs:
        if output.get("type") == "vsdx":
            output["metadata"] = {**output.get("metadata", {}), "v1_status": "future-compatible stub"}
    get_store().update_case(case_id, {"outputs": outputs, "status": "complete", "revised_sop_sections": revised_sections, "diagram_model": model.model_dump()})
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
    except Exception as exc:
        logger.warning("Unable to persist SOP Uplift report for case_id=%s: %s", case_id, exc)
    return {"status": "generated", "outputs": outputs}


def _source_docx_for_outputs(case_id: str, case: dict[str, Any]) -> bytes | None:
    tags_by_file_id = {
        tag.get("file_id"): (tag.get("confirmed_tag") or tag.get("suggested_tag") or "").strip().lower()
        for tag in case.get("document_tags", [])
    }
    source_tags = {"sop", "policy", "procedure", "policy_procedure"}
    candidates: list[tuple[int, dict[str, Any]]] = []
    for file_meta in case.get("uploaded_files", []):
        filename = str(file_meta.get("filename") or "").lower()
        if not filename.endswith(".docx"):
            continue
        file_id = file_meta.get("file_id")
        tag = tags_by_file_id.get(file_id, "")
        bucket = str(file_meta.get("bucket") or "").lower()
        priority = 0 if tag in source_tags or bucket in {"sops", "procedures"} else 1
        candidates.append((priority, file_meta))

    for _priority, file_meta in sorted(candidates, key=lambda item: item[0]):
        file_id = file_meta.get("file_id")
        if not file_id:
            continue
        content = get_store().get_file_content(case_id, file_id)
        if isinstance(content, (bytes, bytearray)):
            return bytes(content)
        if file_meta.get("raw_content_b64"):
            try:
                return base64.b64decode(file_meta["raw_content_b64"])
            except Exception:
                continue
    return None


NO_APPLIED_SUGGESTIONS_WARNING = "No accepted or edited uplift suggestions were applied; diagram reflects the current uploaded SOP."
EXCLUDED_SUGGESTIONS_WARNING = "Rejected and open suggestions were excluded from the implemented process diagram."


def _sections_from_case(case: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "anchor_id": anchor.get("anchor_id"),
            "heading": " > ".join(anchor.get("section_path", [])) or "SOP Section",
            "text": anchor.get("text", ""),
        }
        for anchor in case.get("anchors", [])
        if anchor.get("block_type") != "heading"
    ]


def _effective_sections_for_outputs(case: dict[str, Any]) -> list[dict[str, Any]]:
    revised = case.get("revised_sop_sections")
    if revised:
        return revised
    return build_revised_sections(_sections_from_case(case), case.get("suggestions", []))


def _diagram_model_for_outputs(case: dict[str, Any]) -> DiagramModel:
    final_case = {**case, "revised_sop_sections": _effective_sections_for_outputs(case)}
    return _build_diagram_model(final_case)


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
    revised_sections = case.get("revised_sop_sections", [])
    if revised_sections:
        source_anchors = [
            {
                "anchor_id": section.get("anchor_id", ""),
                "heading": section.get("heading", ""),
                "text": section.get("revised_text") or section.get("text") or section.get("original_text") or "",
                "applied": bool(section.get("applied_suggestion_ids") or section.get("applied_suggestions")),
            }
            for section in revised_sections
        ]
    else:
        source_anchors = [
            {
                "anchor_id": anchor.get("anchor_id", ""),
                "heading": " > ".join(anchor.get("section_path", [])),
                "text": anchor.get("text", ""),
                "applied": False,
            }
            for anchor in case.get("anchors", [])
            if anchor.get("block_type") != "heading"
        ]
    applied_anchors = [anchor for anchor in source_anchors if anchor.get("applied") and _is_diagrammable_output_anchor(anchor)]
    fallback_anchors = [anchor for anchor in source_anchors if not anchor.get("applied") and _is_diagrammable_output_anchor(anchor)]
    diagram_anchors = applied_anchors or fallback_anchors
    if not diagram_anchors:
        diagram_anchors = [anchor for anchor in source_anchors if str(anchor.get("text") or "").strip()][:8]
    for index, anchor in enumerate(diagram_anchors[:8]):
        text = str(anchor.get("text") or "SOP step").strip() or "SOP step"
        lane = _lane_for_output_step(text, lanes)
        node_type, badge = _explicit_node_type_and_badge(text)
        label = _diagram_node_label(text)
        nodes.append(
            DiagramNode(
                node_id=f"node_{index + 1}",
                lane_id=lane.lane_id,
                type=node_type,
                shape="data_store" if node_type == "evidence" else "decision" if "?" in text else "process",
                label=label,
                description=text if label != text else "",
                column=index,
                badge=badge,
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
    suggestions = case.get("suggestions", [])
    has_implemented = any(section.get("applied_suggestion_ids") or section.get("applied_suggestions") for section in revised_sections)
    has_excluded = any((item.get("status") or "open") in {"open", "pending", "rejected"} for item in suggestions)
    warnings = ["Diagram generated from output fallback"]
    if not has_implemented:
        warnings.append(NO_APPLIED_SUGGESTIONS_WARNING)
    if has_excluded:
        warnings.append(EXCLUDED_SUGGESTIONS_WARNING)
    control_summary = _supporting_summary(case.get("extracted_controls", []) or case.get("controls", []), "C", ("description", "control_description", "text", "summary"))
    risk_summary = _supporting_summary(case.get("extracted_risks", []) or case.get("risks", []), "R", ("description", "risk_description", "text", "summary"))
    return normalize_diagram_model(DiagramModel(
        title=f"{case.get('process_name') or 'SOP'} Swimlane",
        case_title=case.get("title", ""),
        process_name=case.get("process_name", ""),
        lanes=lanes,
        nodes=nodes,
        edges=edges,
        control_summary=control_summary,
        risk_summary=risk_summary,
        warnings=warnings,
    ))


def _supporting_summary(items: list[Any], prefix: str, fields: tuple[str, ...]) -> list[dict[str, str]]:
    summary: list[dict[str, str]] = []
    for item in items:
        if isinstance(item, dict):
            label = next((str(item.get(field) or "").strip() for field in fields if item.get(field)), "")
        else:
            label = str(item or "").strip()
        label = _summary_label(label, prefix)
        if not label:
            continue
        summary.append({"badge": f"{prefix}{len(summary) + 1}", "label": label})
        if len(summary) >= 6:
            break
    return summary


def _lane_for_output_step(text: str, lanes: list[DiagramLane]) -> DiagramLane:
    lower = text.lower()
    leading = lower[:80].lstrip()
    lane_by_id = {lane.lane_id: lane for lane in lanes}
    if leading.startswith(("the ia/rm", "ia/rm", "the investment advisor", "investment advisor", "relationship manager", "business owner")):
        return lane_by_id.get("business_owner", lanes[0])
    if leading.startswith(("branch operations", "new accounts", "operations", "risk management")):
        return lane_by_id.get("operations_risk", lanes[0])
    if leading.startswith(("compliance", "aml", "the compliance")):
        return lane_by_id.get("compliance", lanes[0])
    if leading.startswith(("control testing", "internal audit")):
        return lane_by_id.get("control_testing", lanes[-1])
    if any(term in lower for term in ["control testing", "internal audit", "tester", "sample"]):
        return lane_by_id.get("control_testing", lanes[-1])
    if any(term in lower for term in ["compliance", "aml", "atf", "screening", "suitability"]):
        return lane_by_id.get("compliance", lanes[0])
    if any(term in lower for term in ["branch operations", "new accounts", "operations", "risk management"]):
        return lane_by_id.get("operations_risk", lanes[0])
    if any(term in lower for term in ["ia/rm", "investment advisor", "relationship manager", "business owner"]):
        return lane_by_id.get("business_owner", lanes[0])
    return lanes[0]


def _explicit_node_type_and_badge(text: str) -> tuple[str, str]:
    lower = text.lower()
    control_match = re.search(r"\bC[-\s]?(\d{1,3})\b", text, flags=re.IGNORECASE)
    risk_match = re.search(r"\bR[-\s]?(\d{1,3})\b", text, flags=re.IGNORECASE)
    evidence_match = re.search(r"\bE[-\s]?(\d{1,3})\b", text, flags=re.IGNORECASE)
    if control_match and "control" in lower:
        return "control", f"C{int(control_match.group(1))}"
    if risk_match and "risk" in lower:
        return "risk", f"R{int(risk_match.group(1))}"
    if evidence_match and any(term in lower for term in ["evidence", "document", "record"]):
        return "evidence", f"E{int(evidence_match.group(1))}"
    return "activity", ""


def _diagram_node_label(text: str) -> str:
    compact = " ".join(str(text or "").split())
    lower = compact.lower()
    if "certify completeness of the naaf" in lower:
        return "IA/RM certifies NAAF completeness"
    if "review each naaf" in lower and "branch operations" in lower:
        return "Branch Operations reviews NAAF completeness"
    if lower.startswith("screening results are documented"):
        return "Screening results documented"
    if "retain a documented suitability assessment record" in lower:
        return "IA/RM retains suitability record"
    if lower.startswith("kyc refresh must be performed"):
        return "KYC refresh set by risk rating"
    if len(compact) <= 80:
        return compact
    first_sentence = compact.split(". ", 1)[0].rstrip(".")
    if len(first_sentence) <= 80:
        return first_sentence
    return first_sentence[:77].rstrip(" .,;") + "..."


def _summary_label(label: str, prefix: str) -> str:
    text = " ".join(str(label or "").split())
    if not text or "|" in text:
        return ""
    lower = text.lower()
    if text.isupper() and len(text.split()) <= 5:
        return ""
    non_summary_prefixes = (
        "the sop ensures",
        "this sop ensures",
        "this sop applies",
        "this standard operating procedure",
        "standard operating procedure",
        "for corporations:",
        "for trusts:",
        "approved identification methods",
        "ciro rule",
        "fintrac",
        "risk tolerance",
        "source of funds",
        "draft notice:",
        "this document records",
        "controls selected for testing",
        "regulatory exposure",
        "for high-risk accounts",
        "change in investment objectives",
        "kyc refresh is performed",
    )
    if lower.startswith(non_summary_prefixes):
        return ""
    if prefix == "R":
        risk_terms = (
            "gap",
            "breach",
            "bypass",
            "failure",
            "incomplete",
            "unidentified",
            "unauthorized",
            "unsuitable",
            "not ",
            "without",
            "late",
            "missing",
            "expose",
            "exposure",
        )
        if not any(term in lower for term in risk_terms):
            return ""
    if len(text) > 220:
        return text[:217].rstrip(" .,;") + "..."
    return text


def _is_diagrammable_output_anchor(anchor: dict[str, Any]) -> bool:
    text = " ".join(str(anchor.get("text") or "").split())
    if not text:
        return False
    lower = text.lower()
    heading = str(anchor.get("heading") or "").lower()
    if any(term in heading for term in ["purpose", "scope", "regulatory", "reference", "history"]):
        return False
    if "|" in text:
        return False
    if text.isupper() and len(text.split()) <= 8:
        return False
    non_process_prefixes = (
        "this standard operating procedure",
        "standard operating procedure",
        "this sop applies",
        "this sop ensures",
        "regulatory notice",
        "fintrac record keeping",
        "fintrac reporting",
        "pep / hio notice",
        "exclusions:",
        "approved identification methods",
        "in-person:",
        "non-face-to-face:",
        "credit file method:",
        "for corporations:",
        "for trusts:",
        "verification results are recorded",
    )
    if lower.startswith(non_process_prefixes):
        return False
    if anchor.get("applied"):
        return True
    action_terms = (
        "collects",
        "verifies",
        "completes",
        "reviews",
        "screens",
        "documents",
        "escalates",
        "approves",
        "retains",
        "files",
        "submits",
        "records",
        "stores",
        "activates",
        "performs",
        "conducts",
        "obtains",
        "confirms",
        "returns",
        "remediates",
        "signs",
        "sets",
        "updates",
        "must not be opened",
        "must not be activated",
    )
    process_headings = (
        "process",
        "procedure",
        "onboarding",
        "verification",
        "assessment",
        "screening",
        "approval",
        "setup",
        "refresh",
        "due diligence",
        "exceptions",
        "reporting",
    )
    return any(term in lower for term in action_terms) or (
        any(term in heading for term in process_headings) and not lower.startswith(("this sop", "this standard"))
    )


def _infer_document_tag(filename: str, bucket: str) -> str:
    return suggest_document_tag({"filename": filename, "bucket": bucket})["confirmed_tag"]

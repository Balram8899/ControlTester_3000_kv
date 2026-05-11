from __future__ import annotations

import asyncio
import json
import mimetypes
import os
import uuid
from collections.abc import AsyncIterator
from typing import Any, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from utils.sop_processing.case_store import DocumentUpliftCaseStore
from utils.sop_processing.pipeline import (
    PipelineAlreadyQueued,
    PipelineQueueFull,
    dispatch_pipeline,
)
from utils.sop_processing.sse_events import yield_sse_event


router = APIRouter(prefix="/document-uplift", tags=["document-uplift"])


class DocumentUpliftCaseCreate(BaseModel):
    title: str = Field(..., min_length=1)
    process_name: Optional[str] = None
    domain_label: Optional[str] = None
    notes: Optional[str] = None


class DocumentUpliftCaseUpdate(BaseModel):
    title: Optional[str] = None
    process_name: Optional[str] = None
    domain_label: Optional[str] = None
    notes: Optional[str] = None


DocumentUploadTag = Literal["rcm", "policy", "procedure", "process_doc", "risk_data", "evidence"]
SuggestionReviewStatus = Literal["pending", "accepted", "rejected", "edited"]
BulkSuggestionReviewAction = Literal["accept_all", "reject_all"]


class SuggestionReviewUpdate(BaseModel):
    review_status: SuggestionReviewStatus
    edited_proposed_text: Optional[str] = None
    reviewer_notes: Optional[str] = None


class BulkSuggestionReviewRequest(BaseModel):
    action: BulkSuggestionReviewAction
    confirmation_token: Optional[str] = None


_store: DocumentUpliftCaseStore | None = None
REJECT_ALL_CONFIRMATION_TOKEN = "REJECT_ALL"
TERMINAL_PIPELINE_STAGES = {"review_ready", "complete", "failed", "partial"}
RUNNING_PIPELINE_STAGES = {"converting", "analyzing", "generating_outputs"}


def get_store() -> DocumentUpliftCaseStore:
    global _store
    if _store is None:
        _store = DocumentUpliftCaseStore()
    return _store


def _document_uplift_enabled() -> bool:
    return os.getenv("DOCUMENT_UPLIFT_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _require_enabled() -> None:
    if not _document_uplift_enabled():
        raise HTTPException(status_code=404, detail="Document Uplift is not enabled")


def _require_case(case_id: str) -> dict[str, Any]:
    _require_enabled()
    case = get_store().get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Document Uplift case not found")
    return case


def _public_case(case: dict[str, Any]) -> dict[str, Any]:
    public = dict(case)
    public.pop("_id", None)
    return public


def _suggestion_key(suggestion: dict[str, Any]) -> str:
    return str(suggestion.get("suggestion_id") or suggestion.get("id") or "")


def _persist_suggestions(case_id: str, suggestions: list[dict[str, Any]]) -> dict[str, Any]:
    updated = get_store().update_case(case_id, {"suggestions": suggestions})
    if not updated:
        raise HTTPException(status_code=404, detail="Document Uplift case not found")
    return updated


def _counter_value(counter: dict[str, Any], key: str) -> int:
    value = counter.get(key, 0)
    return value if isinstance(value, int) else 0


def _stream_stage_payload(case: dict[str, Any]) -> dict[str, Any]:
    processing_state = case.get("processing_state") or {}
    conversion = processing_state.get("conversion") or {}
    total_docs = _counter_value(conversion, "total") or len(case.get("document_tags", []))
    completed_docs = _counter_value(conversion, "completed")
    return {
        "stage": ((case.get("status") or {}).get("stage") or "uploading"),
        "total_docs": total_docs,
        "completed_docs": completed_docs,
        "failed_docs": _counter_value(conversion, "failed"),
        "pending_docs": _counter_value(conversion, "pending"),
    }


def _stream_progress_payload(case: dict[str, Any]) -> dict[str, Any] | None:
    stage = str(((case.get("status") or {}).get("stage") or "uploading"))
    processing_state = case.get("processing_state") or {}
    conversion = processing_state.get("conversion") or {}
    analysis = processing_state.get("analysis") or {}
    if stage == "converting":
        return {
            "stage": stage,
            "step": "doc_conversion",
            "total_docs": _counter_value(conversion, "total") or len(case.get("document_tags", [])),
            "completed_docs": _counter_value(conversion, "completed"),
        }
    if stage == "analyzing":
        step = "cross_document_synthesis" if _counter_value(analysis, "completed") else "section_classification"
        return {
            "stage": stage,
            "step": step,
            "total_docs": _counter_value(conversion, "total") or len(case.get("document_tags", [])),
            "completed_docs": _counter_value(conversion, "completed"),
        }
    if stage == "generating_outputs":
        return {
            "stage": stage,
            "step": "word_export",
            "output_count": len(case.get("outputs", [])),
        }
    return None


def _stream_terminal_payload(case: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    stage = str(((case.get("status") or {}).get("stage") or "uploading"))
    if stage == "failed":
        processing_state = case.get("processing_state") or {}
        return (
            "error",
            {
                "stage": stage,
                "message": processing_state.get("pipeline_error") or case.get("final_summary") or "Document Uplift pipeline failed",
            },
        )
    if stage in {"review_ready", "partial"}:
        return (
            "complete",
            {
                "stage": stage,
                "suggestion_count": len(case.get("suggestions", [])),
            },
        )
    if stage == "complete":
        return (
            "complete",
            {
                "stage": stage,
                "output_count": len(case.get("outputs", [])),
            },
        )
    return None


def _stream_events_for_case(case: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = [("stage", _stream_stage_payload(case))]
    progress = _stream_progress_payload(case)
    if progress:
        events.append(("progress", progress))
    terminal = _stream_terminal_payload(case)
    if terminal:
        events.append(terminal)
    return events


async def _pipeline_stream(case_id: str, request: Request) -> AsyncIterator[str]:
    emitted: set[str] = set()
    while True:
        if await request.is_disconnected():
            return
        case = get_store().get_case(case_id)
        if not case:
            yield yield_sse_event(
                "error",
                {"stage": "unknown", "message": "Document Uplift case not found"},
            )
            return

        for event_type, data in _stream_events_for_case(case):
            signature = f"{event_type}:{json.dumps(data, sort_keys=True)}"
            if signature in emitted:
                continue
            emitted.add(signature)
            yield yield_sse_event(event_type, data)

        stage = str(((case.get("status") or {}).get("stage") or "uploading"))
        if stage in TERMINAL_PIPELINE_STAGES:
            return
        await asyncio.sleep(2)


@router.post("/cases", status_code=201)
def create_case(body: DocumentUpliftCaseCreate) -> dict[str, Any]:
    _require_enabled()
    return _public_case(get_store().create_case(body.model_dump()))


@router.get("/cases")
def list_cases() -> dict[str, list[dict[str, Any]]]:
    _require_enabled()
    return {"cases": [_public_case(case) for case in get_store().list_cases()]}


@router.get("/cases/{case_id}")
def get_case(case_id: str) -> dict[str, Any]:
    return _public_case(_require_case(case_id))


@router.patch("/cases/{case_id}")
def update_case(case_id: str, body: DocumentUpliftCaseUpdate) -> dict[str, Any]:
    _require_case(case_id)
    updated = get_store().update_case(case_id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Document Uplift case not found")
    return _public_case(updated)


@router.delete("/cases/{case_id}", status_code=204, response_model=None)
def delete_case(case_id: str) -> None:
    _require_case(case_id)
    if not get_store().delete_case(case_id):
        raise HTTPException(status_code=404, detail="Document Uplift case not found")


@router.post("/cases/{case_id}/upload", status_code=201)
async def upload_file(
    case_id: str,
    file: UploadFile = File(...),
    tag: DocumentUploadTag = Form("evidence"),
) -> dict[str, Any]:
    case = _require_case(case_id)
    content = await file.read()
    filename = file.filename or "upload"
    content_type = file.content_type or "application/octet-stream"
    file_id = str(uuid.uuid4())
    gridfs_file_id = get_store().store_input_file(
        case_id,
        file_id,
        filename,
        content,
        content_type,
    )
    document_tag = {
        "file_id": file_id,
        "filename": filename,
        "tag": tag,
        "conversion_status": "success",
        "looks_corrupt": False,
        "page_count": 0,
        "error": None,
        "gridfs_file_id": str(gridfs_file_id),
    }
    document_tags = [
        item for item in case.get("document_tags", []) if item.get("file_id") != file_id
    ]
    document_tags.append(document_tag)
    updated = get_store().update_case(case_id, {"document_tags": document_tags})
    if not updated:
        raise HTTPException(status_code=404, detail="Document Uplift case not found")
    return document_tag


@router.get("/cases/{case_id}/files/{file_id}/content")
def get_file_content(case_id: str, file_id: str) -> Response:
    case = _require_case(case_id)
    file_meta = next(
        (item for item in case.get("document_tags", []) if item.get("file_id") == file_id),
        None,
    )
    if not file_meta:
        raise HTTPException(status_code=404, detail="Document Uplift file not found")
    content = get_store().get_input_file(file_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Document Uplift file content not found")
    filename = str(file_meta.get("filename") or "document")
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
            "X-Document-Uplift-Filename": filename,
        },
    )


@router.post("/cases/{case_id}/run-pipeline", status_code=202)
def run_pipeline(case_id: str) -> dict[str, Any]:
    _require_case(case_id)
    try:
        return dispatch_pipeline(case_id)
    except PipelineAlreadyQueued as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PipelineQueueFull as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/cases/{case_id}/pipeline/stream")
async def stream_pipeline(case_id: str, request: Request) -> StreamingResponse:
    _require_case(case_id)
    return StreamingResponse(
        _pipeline_stream(case_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/cases/{case_id}/generate-outputs")
def generate_outputs(case_id: str) -> dict[str, Any]:
    auto_accept_result = auto_accept_pending_suggestions(case_id)
    try:
        dispatch_result = dispatch_pipeline(case_id, stage=2)
    except PipelineAlreadyQueued as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PipelineQueueFull as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    response = dict(dispatch_result)
    response["warnings"] = auto_accept_result["warnings"]
    response["auto_accepted_count"] = auto_accept_result["auto_accepted_count"]
    return response


@router.get("/cases/{case_id}/outputs/{output_id}")
def download_output(case_id: str, output_id: str) -> Response:
    case = _require_case(case_id)
    output = next(
        (item for item in case.get("outputs", []) if item.get("output_id") == output_id),
        None,
    )
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    content = get_store().get_output_content(case_id, output_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Output content not found")
    filename = str(output.get("filename") or "document-uplift-output.bin").replace('"', "")
    return Response(
        content=content,
        media_type=str(output.get("content_type") or "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/cases/{case_id}/suggestions")
def list_suggestions(case_id: str) -> dict[str, list[dict[str, Any]]]:
    case = _require_case(case_id)
    return {"suggestions": list(case.get("suggestions", []))}


@router.patch("/cases/{case_id}/suggestions/{suggestion_id}")
def update_suggestion_review(
    case_id: str,
    suggestion_id: str,
    body: SuggestionReviewUpdate,
) -> dict[str, Any]:
    case = _require_case(case_id)
    suggestions = [dict(item) for item in case.get("suggestions", [])]
    for index, suggestion in enumerate(suggestions):
        if _suggestion_key(suggestion) != suggestion_id:
            continue
        if body.review_status == "edited" and not (
            body.edited_proposed_text or suggestion.get("edited_proposed_text")
        ):
            raise HTTPException(
                status_code=400,
                detail="edited_proposed_text is required when marking a suggestion as edited",
            )
        suggestion["review_status"] = body.review_status
        if body.edited_proposed_text is not None:
            suggestion["edited_proposed_text"] = body.edited_proposed_text
        if body.reviewer_notes is not None:
            suggestion["reviewer_notes"] = body.reviewer_notes
        suggestions[index] = suggestion
        _persist_suggestions(case_id, suggestions)
        return suggestion

    raise HTTPException(status_code=404, detail="Suggestion not found")


@router.post("/cases/{case_id}/suggestions/bulk-review")
def bulk_review_suggestions(
    case_id: str,
    body: BulkSuggestionReviewRequest,
) -> dict[str, Any]:
    case = _require_case(case_id)
    if (
        body.action == "reject_all"
        and body.confirmation_token != REJECT_ALL_CONFIRMATION_TOKEN
    ):
        raise HTTPException(
            status_code=400,
            detail="confirmation_token must be REJECT_ALL to reject all suggestions",
        )

    target_status: SuggestionReviewStatus = (
        "accepted" if body.action == "accept_all" else "rejected"
    )
    suggestions = [dict(item) for item in case.get("suggestions", [])]
    updated_count = 0
    explicit_review_count = 0
    for suggestion in suggestions:
        if suggestion.get("review_status") == target_status:
            continue
        if target_status == "accepted" and bool(suggestion.get("requires_explicit_review")):
            explicit_review_count += 1
            continue
        suggestion["review_status"] = target_status
        updated_count += 1

    _persist_suggestions(case_id, suggestions)
    return {
        "case_id": case_id,
        "review_status": target_status,
        "updated_count": updated_count,
        "explicit_review_count": explicit_review_count,
        "suggestions": suggestions,
    }


def auto_accept_pending_suggestions(case_id: str) -> dict[str, Any]:
    case = _require_case(case_id)
    suggestions = [dict(item) for item in case.get("suggestions", [])]
    auto_accepted_count = 0
    explicit_review_count = 0
    for suggestion in suggestions:
        if suggestion.get("review_status", "pending") != "pending":
            continue
        if bool(suggestion.get("requires_explicit_review")):
            explicit_review_count += 1
            continue
        suggestion["review_status"] = "accepted"
        auto_accepted_count += 1

    if auto_accepted_count:
        _persist_suggestions(case_id, suggestions)

    warnings = []
    if auto_accepted_count:
        warnings.append(
            f"{auto_accepted_count} suggestions were not reviewed and have been automatically accepted. "
            "You can still edit the document after download."
        )
    if explicit_review_count:
        warnings.append(
            f"{explicit_review_count} structural suggestions require manual review and were not automatically accepted."
        )
    return {
        "case_id": case_id,
        "auto_accepted_count": auto_accepted_count,
        "explicit_review_count": explicit_review_count,
        "warnings": warnings,
        "suggestions": suggestions,
    }

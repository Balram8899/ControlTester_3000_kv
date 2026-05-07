from __future__ import annotations

import os
from typing import Any

try:
    from celery import Celery
except ImportError:
    Celery = None  # type: ignore[assignment]

from utils.sop_processing.case_store import DocumentUpliftCaseStore


TASK_ROUTES: dict[str, dict[str, str]] = {
    "document_uplift.run_pipeline": {"queue": "document_uplift"},
    "svc.conversion.convert_document": {"queue": "conversion"},
    "svc.chunking.chunk_markdown": {"queue": "chunking"},
    "svc.excel.process_excel": {"queue": "excel"},
    "svc.llm.call_llm": {"queue": "llm"},
    "svc.analysis.analyze_documents": {"queue": "analysis"},
    "svc.outputs.generate_outputs": {"queue": "outputs"},
}

QUEUE_NAMES = tuple(sorted({route["queue"] for route in TASK_ROUTES.values()}))


def create_celery_app() -> Any:
    if Celery is None:
        return None
    broker_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
    result_backend = os.getenv("CELERY_RESULT_BACKEND", broker_url)
    celery = Celery(
        "trace_document_uplift",
        broker=broker_url,
        backend=result_backend,
    )
    celery.conf.update(
        task_routes=TASK_ROUTES,
        task_default_queue="document_uplift",
        broker_connection_retry_on_startup=True,
        result_expires=int(os.getenv("CELERY_RESULT_EXPIRES_SECONDS", "86400")),
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
    )
    return celery


celery_app = create_celery_app()
app = celery_app


def _require_celery_app() -> Any:
    if celery_app is None:
        raise RuntimeError(
            "Celery is not installed. Install api/requirements.txt and run with TASK_BACKEND=celery."
        )
    return celery_app


def _small_result(value: dict[str, Any] | None, case_id: str, stage: int) -> dict[str, Any]:
    value = value or {}
    return {
        "case_id": case_id,
        "stage": stage,
        "status": value.get("status", "unknown"),
        "error": value.get("error"),
    }


def enqueue_document_uplift_pipeline(case_id: str, stage: int = 1) -> dict[str, Any]:
    _require_celery_app()
    async_result = run_document_uplift_pipeline_task.apply_async(
        args=[case_id, stage],
        queue="document_uplift",
    )
    return {
        "case_id": case_id,
        "stage": stage,
        "status": "queued",
        "task_backend": "celery",
        "task_id": str(async_result.id),
    }


if celery_app is not None:

    @celery_app.task(name="document_uplift.run_pipeline", queue="document_uplift")
    def run_document_uplift_pipeline_task(case_id: str, stage: int = 1) -> dict[str, Any]:
        from utils.sop_processing.pipeline import run_pipeline

        return _small_result(run_pipeline(case_id, stage=stage), case_id, stage)

    @celery_app.task(name="svc.conversion.convert_document", queue="conversion")
    def convert_document_task(case_id: str, file_id: str, tag: str = "evidence") -> dict[str, Any]:
        from utils.services import conversion

        store = DocumentUpliftCaseStore()
        file_bytes = store.get_input_file(file_id)
        if file_bytes is None:
            return {"case_id": case_id, "file_id": file_id, "status": "failed", "error": "Input file not found"}
        case = store.get_case(case_id) or {}
        filename = _filename_for_file_id(case, file_id)
        result = conversion.convert_document(
            file_bytes=file_bytes,
            filename=filename,
            file_id=file_id,
            tag=tag,  # type: ignore[arg-type]
        )
        return {
            "case_id": case_id,
            "file_id": file_id,
            "status": result.status,
            "file_type": result.file_type,
            "error": result.error,
        }

    @celery_app.task(name="svc.excel.process_excel", queue="excel")
    def process_excel_task(
        case_id: str,
        file_id: str,
        pipeline_id: str,
        budget_remaining: int,
    ) -> dict[str, Any]:
        from utils.services import excel_pipeline

        store = DocumentUpliftCaseStore()
        file_bytes = store.get_input_file(file_id)
        if file_bytes is None:
            return {"case_id": case_id, "file_id": file_id, "status": "failed", "error": "Input file not found"}
        case = store.get_case(case_id) or {}
        result = excel_pipeline.process_excel(
            file_bytes=file_bytes,
            filename=_filename_for_file_id(case, file_id),
            file_id=file_id,
            pipeline_id=pipeline_id,
            budget_remaining=budget_remaining,
        )
        return {
            "case_id": case_id,
            "file_id": file_id,
            "status": result.status,
            "sheet_count": len(result.sheets),
            "suggestion_count": len(result.suggestions),
            "fact_count": len(result.facts),
            "error": result.error,
        }

    @celery_app.task(name="svc.llm.call_llm", queue="llm")
    def call_llm_task(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> dict[str, Any]:
        from utils.services.llm_orchestrator import call_llm

        result = call_llm(
            prompt=prompt,
            schema_name=schema_name,
            response_schema=response_schema,
            pipeline_id=pipeline_id,
            budget_remaining=budget_remaining,
        )
        return {
            "pipeline_id": pipeline_id,
            "schema_name": schema_name,
            "status": result.status,
            "error": result.error,
            "call_record": result.call_record.model_dump(mode="json") if result.call_record else None,
        }

    @celery_app.task(name="svc.analysis.analyze_documents", queue="analysis")
    def analyze_documents_task(case_id: str, pipeline_id: str, budget_remaining: int) -> dict[str, Any]:
        store = DocumentUpliftCaseStore()
        case = store.get_case(case_id)
        if not case:
            return {"case_id": case_id, "status": "failed", "error": "Case not found"}
        return {
            "case_id": case_id,
            "pipeline_id": pipeline_id,
            "status": "ready",
            "anchor_count": len(case.get("anchors", [])),
            "chunk_count": len(case.get("chunks", [])),
            "budget_remaining": budget_remaining,
        }

    @celery_app.task(name="svc.outputs.generate_outputs", queue="outputs")
    def generate_outputs_task(case_id: str) -> dict[str, Any]:
        from utils.sop_processing.pipeline import run_pipeline

        return _small_result(run_pipeline(case_id, stage=2), case_id, 2)

    @celery_app.task(name="svc.chunking.chunk_markdown", queue="chunking")
    def chunk_markdown_task(case_id: str, file_id: str) -> dict[str, Any]:
        store = DocumentUpliftCaseStore()
        case = store.get_case(case_id)
        if not case:
            return {"case_id": case_id, "file_id": file_id, "status": "failed", "error": "Case not found"}
        markdown_documents = [
            document for document in case.get("markdown_documents", [])
            if document.get("file_id") == file_id
        ]
        return {
            "case_id": case_id,
            "file_id": file_id,
            "status": "ready" if markdown_documents else "failed",
            "document_count": len(markdown_documents),
        }

else:

    def run_document_uplift_pipeline_task(case_id: str, stage: int = 1) -> dict[str, Any]:
        _require_celery_app()


def _filename_for_file_id(case: dict[str, Any], file_id: str) -> str:
    for tag in case.get("document_tags", []):
        if str(tag.get("file_id") or "") == file_id:
            return str(tag.get("filename") or file_id)
    return file_id

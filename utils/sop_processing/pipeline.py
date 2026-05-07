from __future__ import annotations

import asyncio
import os
import re
import threading
import uuid
from dataclasses import dataclass
from typing import Any

from utils.llm_config_store import get_active_llm_config, get_document_uplift_config
from utils.services import analysis, conversion, excel_pipeline
from utils.services.schemas import (
    Anchor,
    AnalysisResult,
    Chunk,
    ChunkResult,
    ConversionResult,
    CorpusMapContribution,
    ExcelPipelineResult,
)
from utils.sop_processing.case_store import DocumentUpliftCaseStore
from utils.sop_processing import output_generator


_store: DocumentUpliftCaseStore | None = None
_async_pipeline_queue: AsyncPipelineQueue | None = None


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


class PipelineQueueFull(RuntimeError):
    """Raised when the in-process async queue cannot accept more work."""


class PipelineAlreadyQueued(RuntimeError):
    """Raised when a case already has a queued or running pipeline job."""


class PipelineQueueStopped(RuntimeError):
    """Raised when enqueue is attempted while the async queue is shutting down."""


@dataclass(frozen=True)
class PipelineJob:
    case_id: str
    stage: int = 1
    store: DocumentUpliftCaseStore | None = None
    task_id: str = ""


class AsyncPipelineQueue:
    def __init__(
        self,
        max_workers: int | None = None,
        max_queue_size: int | None = None,
    ) -> None:
        self.max_workers = max(1, max_workers or _int_env("DOCUMENT_UPLIFT_ASYNC_WORKERS", 2))
        self.max_queue_size = max(1, max_queue_size or _int_env("DOCUMENT_UPLIFT_QUEUE_MAXSIZE", 20))
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue[PipelineJob | None] | None = None
        self._workers: list[asyncio.Task[None]] = []
        self._thread: threading.Thread | None = None
        self._active_case_ids: set[str] = set()
        self._lock = threading.Lock()
        self._accepting = True

    def enqueue(
        self,
        case_id: str,
        stage: int = 1,
        store: DocumentUpliftCaseStore | None = None,
    ) -> dict[str, Any]:
        if not self._accepting:
            raise PipelineQueueStopped("Document Uplift async pipeline queue is stopping")
        if self._queued_count() >= self.max_queue_size:
            raise PipelineQueueFull("Document Uplift async pipeline queue is full")
        with self._lock:
            if case_id in self._active_case_ids:
                raise PipelineAlreadyQueued(f"Document Uplift case {case_id} already has a queued or running pipeline")
            self._active_case_ids.add(case_id)
        job = PipelineJob(
            case_id=case_id,
            stage=stage,
            store=store,
            task_id=f"async-{uuid.uuid4()}",
        )
        try:
            self._submit_job(job)
        except Exception:
            with self._lock:
                self._active_case_ids.discard(case_id)
            raise
        return {
            "case_id": case_id,
            "stage": stage,
            "status": "queued",
            "task_backend": "asyncio",
            "task_id": job.task_id,
        }

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._accepting = True
        ready = threading.Event()

        def run_loop() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop
            self._queue = asyncio.Queue(maxsize=self.max_queue_size)
            self._workers = [
                loop.create_task(self._worker(worker_id))
                for worker_id in range(self.max_workers)
            ]
            ready.set()
            loop.run_forever()
            pending = [task for task in asyncio.all_tasks(loop) if not task.done()]
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()

        self._thread = threading.Thread(
            target=run_loop,
            name="document-uplift-async-queue",
            daemon=True,
        )
        self._thread.start()
        ready.wait(timeout=5)

    def shutdown(self, timeout_seconds: float = 10.0) -> None:
        self._accepting = False
        if not self._loop or not self._queue:
            return

        async def stop_when_drained() -> None:
            assert self._queue is not None
            await self._queue.join()
            for _worker in self._workers:
                await self._queue.put(None)
            await self._queue.join()
            for worker in self._workers:
                worker.cancel()
            await asyncio.gather(*self._workers, return_exceptions=True)
            assert self._loop is not None
            self._loop.stop()

        future = asyncio.run_coroutine_threadsafe(stop_when_drained(), self._loop)
        try:
            future.result(timeout=timeout_seconds)
        except TimeoutError:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=timeout_seconds)
        self._loop = None
        self._queue = None
        self._workers = []

    def _queued_count(self) -> int:
        return self._queue.qsize() if self._queue else 0

    def _submit_job(self, job: PipelineJob) -> None:
        self.start()
        if not self._loop or not self._queue:
            raise PipelineQueueStopped("Document Uplift async pipeline queue failed to start")
        future = asyncio.run_coroutine_threadsafe(self._queue.put(job), self._loop)
        future.result(timeout=5)

    async def _worker(self, worker_id: int) -> None:
        assert self._queue is not None
        while True:
            job = await self._queue.get()
            try:
                if job is None:
                    return
                await self._run_job(job)
            finally:
                if job is not None:
                    with self._lock:
                        self._active_case_ids.discard(job.case_id)
                self._queue.task_done()

    async def _run_job(
        self,
        job: PipelineJob,
        loop: Any | None = None,
    ) -> dict[str, Any]:
        active_loop = loop or asyncio.get_running_loop()
        return await active_loop.run_in_executor(
            None,
            run_pipeline,
            job.case_id,
            job.stage,
            job.store,
        )


def get_store() -> DocumentUpliftCaseStore:
    global _store
    if _store is None:
        _store = DocumentUpliftCaseStore()
    return _store


def get_async_pipeline_queue() -> AsyncPipelineQueue:
    global _async_pipeline_queue
    if _async_pipeline_queue is None:
        _async_pipeline_queue = AsyncPipelineQueue()
    return _async_pipeline_queue


def start_async_pipeline_workers() -> None:
    get_async_pipeline_queue().start()


def stop_async_pipeline_workers() -> None:
    if _async_pipeline_queue is not None:
        _async_pipeline_queue.shutdown()


def enqueue_celery_pipeline(case_id: str, stage: int = 1) -> dict[str, Any]:
    from utils.sop_processing.celery_app import enqueue_document_uplift_pipeline

    return enqueue_document_uplift_pipeline(case_id, stage)


def dispatch_pipeline(
    case_id: str,
    stage: int = 1,
    store: DocumentUpliftCaseStore | None = None,
) -> dict[str, Any]:
    backend = os.getenv("TASK_BACKEND", "asyncio").strip().lower() or "asyncio"
    if backend == "asyncio":
        return get_async_pipeline_queue().enqueue(case_id, stage, store)
    if backend == "celery":
        return enqueue_celery_pipeline(case_id, stage)
    raise ValueError(f"Unsupported TASK_BACKEND value: {backend}")


async def _dispatch_asyncio(
    case_id: str,
    stage: int,
    store: DocumentUpliftCaseStore | None,
) -> dict[str, Any]:
    return await asyncio.to_thread(run_pipeline, case_id, stage, store)


def run_pipeline(
    case_id: str,
    stage: int = 1,
    store: DocumentUpliftCaseStore | None = None,
) -> dict[str, Any]:
    case_store = store or get_store()
    if stage == 2:
        return _run_stage2_pipeline(case_id, case_store)
    if stage != 1:
        raise NotImplementedError(f"Document Uplift pipeline stage {stage} is not implemented")

    case = case_store.get_case(case_id)
    if not case:
        return {"status": "failed", "error": "Case not found"}

    document_tags = list(case.get("document_tags", []))
    max_llm_calls = int(get_document_uplift_config().get("max_llm_calls_per_pipeline", 80))
    pipeline_id = f"{case_id}:stage1"
    conversion_counter = _stage_counter(total=len(document_tags), pending=len(document_tags))
    processing_state = _processing_state(conversion_counter=conversion_counter)
    case_store.update_case(
        case_id,
        {
            "status": {"stage": "converting"},
            "processing_state": processing_state,
        },
    )

    conversions: list[ConversionResult] = []
    chunk_results: dict[str, ChunkResult] = {}
    excel_results: list[ExcelPipelineResult] = []
    markdown_documents: list[dict[str, Any]] = []
    anchors: list[dict[str, Any]] = []
    chunks: list[dict[str, Any]] = []
    warnings: list[str] = []
    excel_calls_used = 0
    normalized_facts: list[dict[str, Any]] = []

    for tag_entry in document_tags:
        file_id = str(tag_entry.get("file_id") or "")
        filename = str(tag_entry.get("filename") or file_id or "upload")
        tag = str(tag_entry.get("tag") or "evidence")
        file_bytes = case_store.get_input_file(file_id)
        if file_bytes is None:
            conversions.append(
                ConversionResult(
                    status="failed",
                    file_id=file_id,
                    filename=filename,
                    error="Input file not found in GridFS",
                )
            )
            conversion_counter["failed"] += 1
            conversion_counter["pending"] -= 1
            warnings.append(f"{filename}: input file not found")
            continue

        converted = conversion.convert_document(
            file_bytes=file_bytes,
            filename=filename,
            file_id=file_id,
            tag=tag,  # type: ignore[arg-type]
        )
        conversions.append(converted)
        if converted.status in {"success", "partial"}:
            conversion_counter["completed"] += 1
            if converted.file_type != "xlsx":
                markdown_documents.append(_markdown_document(converted))
                chunk_result = _chunk_conversion(converted)
                chunk_results[file_id] = chunk_result
                anchors.extend(_dump_models(chunk_result.anchors))
                chunks.extend(_dump_models(chunk_result.chunks))
            else:
                excel_result = excel_pipeline.process_excel(
                    file_bytes=file_bytes,
                    filename=filename,
                    file_id=file_id,
                    pipeline_id=pipeline_id,
                    budget_remaining=max(0, max_llm_calls - excel_calls_used),
                )
                excel_results.append(excel_result)
                excel_calls_used += _excel_calls_used(excel_result)
                normalized_facts.extend(_dump_models(excel_result.facts))
                if excel_result.status != "success":
                    warnings.append(excel_result.error or f"{filename}: Excel processing partial")
        else:
            conversion_counter["failed"] += 1
            warnings.append(converted.error or f"{filename}: conversion failed")
        conversion_counter["pending"] -= 1

    case_store.update_case(
        case_id,
        {
            "markdown_documents": markdown_documents,
            "anchors": anchors,
            "chunks": chunks,
            "processing_state": _processing_state(
                conversion_counter=conversion_counter,
                warnings=warnings,
            ),
        },
    )
    case_store.save_case_facts(case_id, normalized_facts)

    analysis_counter = _stage_counter(total=1, pending=1)
    case_store.update_case(
        case_id,
        {
            "status": {"stage": "analyzing"},
            "processing_state": _processing_state(
                conversion_counter=conversion_counter,
                analysis_counter=analysis_counter,
                warnings=warnings,
            ),
        },
    )
    analysis_result = analysis.analyze_documents(
        conversions=conversions,
        chunk_results=chunk_results,
        excel_results=excel_results,
        pipeline_id=pipeline_id,
        budget_remaining=max(0, max_llm_calls - excel_calls_used),
    )
    analysis_counter["pending"] = 0
    if analysis_result.status in {"success", "partial"}:
        analysis_counter["completed"] = 1
    else:
        analysis_counter["failed"] = 1
        warnings.append(analysis_result.error or "Analysis failed")

    corpus_map = _merge_corpus_maps(excel_results, analysis_result.corpus_map)
    stage = _final_stage(conversion_counter, analysis_result)
    pipeline_status = _pipeline_status(stage)
    stage1_cost = _cost_summary(excel_calls_used + int(analysis_result.llm_calls_used or 0))
    final_updates = {
        "status": {"stage": stage, "stage1_cost": stage1_cost},
        "suggestions": _dump_models(analysis_result.suggestions),
        "process_steps": _dump_model(analysis_result.process_steps),
        "corpus_map": _dump_model(corpus_map) if corpus_map else None,
        "agent_follow_up_questions": list(analysis_result.agent_follow_up_questions),
        "processing_state": _processing_state(
            conversion_counter=conversion_counter,
            analysis_counter=analysis_counter,
            pipeline_status=pipeline_status,
            pipeline_error=analysis_result.error if pipeline_status == "failed" else None,
            warnings=warnings,
        ),
        "final_summary": f"Stage 1 completed with {len(analysis_result.suggestions)} suggestion(s).",
    }
    case_store.update_case(case_id, final_updates)
    return {
        "case_id": case_id,
        "status": stage,
        "suggestions": final_updates["suggestions"],
        "corpus_map": final_updates["corpus_map"],
    }


def _run_stage2_pipeline(
    case_id: str,
    case_store: DocumentUpliftCaseStore,
) -> dict[str, Any]:
    case = case_store.get_case(case_id)
    if not case:
        return {"status": "failed", "error": "Case not found"}

    case_store.update_case(case_id, {"status": {"stage": "generating_outputs"}})
    try:
        generation_result = output_generator.generate_outputs(
            case_id=case_id,
            original_sop_bytes=_original_sop_bytes(case, case_store),
            suggestions=list(case.get("suggestions", [])),
            process_steps=list(case.get("process_steps", [])),
            corpus_map=case.get("corpus_map"),
            style_profile=_primary_style_profile(case),
            pipeline_id=f"{case_id}:stage2",
            stage1_cost=(case.get("status") or {}).get("stage1_cost"),
            source_documents=list(case.get("document_tags", [])),
        )
    except Exception as exc:
        case_store.update_case(
            case_id,
            {
                "status": {"stage": "failed"},
                "processing_state": _processing_state(
                    pipeline_status="failed",
                    pipeline_error=str(exc),
                ),
            },
        )
        raise

    output_payload = _dump_model(generation_result)
    if generation_result.status == "success":
        stage1_cost = (case.get("status") or {}).get("stage1_cost")
        final_cost = _merge_cost_summaries(
            stage1_cost,
            _dump_model(generation_result.stage2_cost)
            if generation_result.stage2_cost
            else _cost_summary(_stage2_calls_used(generation_result)),
        )
        case_store.update_case(
            case_id,
            {
                "status": {
                    "stage": "complete",
                    "stage1_cost": stage1_cost,
                    "final_cost": final_cost,
                }
            },
        )
        return {"case_id": case_id, "status": "complete", "output_generation": output_payload}
    case_store.update_case(
        case_id,
        {
            "status": {"stage": "failed"},
            "processing_state": _processing_state(
                pipeline_status="failed",
                pipeline_error=generation_result.error,
            ),
        },
    )
    return {
        "case_id": case_id,
        "status": "failed",
        "error": generation_result.error,
        "output_generation": output_payload,
    }


def _original_sop_bytes(
    case: dict[str, Any],
    case_store: DocumentUpliftCaseStore,
) -> bytes | None:
    procedure = _primary_procedure_tag(case)
    if not procedure:
        return None
    filename = str(procedure.get("filename") or "").lower()
    if not filename.endswith(".docx"):
        return None
    file_id = str(procedure.get("file_id") or "")
    return case_store.get_input_file(file_id)


def _primary_style_profile(case: dict[str, Any]) -> dict[str, Any] | None:
    procedure = _primary_procedure_tag(case)
    if not procedure:
        return None
    file_id = str(procedure.get("file_id") or "")
    for document in case.get("markdown_documents", []):
        if str(document.get("file_id") or "") != file_id:
            continue
        style_profile = document.get("style_profile")
        return dict(style_profile) if isinstance(style_profile, dict) else None
    return None


def _primary_procedure_tag(case: dict[str, Any]) -> dict[str, Any] | None:
    document_tags = [dict(item) for item in case.get("document_tags", [])]
    for tag_entry in document_tags:
        if tag_entry.get("tag") == "procedure":
            return tag_entry
    return None


def _stage_counter(
    total: int = 0,
    completed: int = 0,
    failed: int = 0,
    pending: int = 0,
) -> dict[str, int]:
    return {
        "total": total,
        "completed": completed,
        "failed": failed,
        "pending": pending,
    }


def _processing_state(
    conversion_counter: dict[str, int] | None = None,
    analysis_counter: dict[str, int] | None = None,
    pipeline_status: str = "success",
    pipeline_error: str | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "conversion": conversion_counter or _stage_counter(),
        "analysis": analysis_counter or _stage_counter(),
        "pipeline_status": pipeline_status,
        "pipeline_error": pipeline_error,
        "warnings": warnings or [],
    }


def _markdown_document(conversion_result: ConversionResult) -> dict[str, Any]:
    file_id = conversion_result.file_id or ""
    return {
        "document_id": f"doc-{file_id}",
        "file_id": file_id,
        "filename": conversion_result.filename,
        "file_type": conversion_result.file_type,
        "tag": conversion_result.tag,
        "markdown": conversion_result.markdown,
        "page_count": conversion_result.page_count,
        "looks_corrupt": conversion_result.looks_corrupt,
        "style_profile": _dump_model(conversion_result.style_profile),
        "conversion": {
            "status": conversion_result.status,
            "error": conversion_result.error,
        },
    }


def _chunk_conversion(conversion_result: ConversionResult) -> ChunkResult:
    file_id = conversion_result.file_id or ""
    sections = _markdown_sections(conversion_result.markdown)
    anchors: list[Anchor] = []
    chunks: list[Chunk] = []
    for index, section in enumerate(sections, start=1):
        anchor_id = f"{file_id}-a{index}"
        content = section["content"]
        anchor = Anchor(
            anchor_id=anchor_id,
            file_id=file_id,
            section_path=section["heading"],
            heading=section["heading"],
            content=content,
            char_count=len(content),
            page_estimate=max(1, conversion_result.page_count // max(1, len(sections))),
        )
        anchors.append(anchor)
        chunks.append(
            Chunk(
                chunk_id=f"{anchor_id}-c1",
                anchor_id=anchor_id,
                file_id=file_id,
                content=content,
                char_count=len(content),
            )
        )
    return ChunkResult(status="success", file_id=file_id, anchors=anchors, chunks=chunks)


def _markdown_sections(markdown: str) -> list[dict[str, str]]:
    lines = markdown.splitlines()
    sections: list[dict[str, str]] = []
    heading = "Document"
    content_lines: list[str] = []
    for line in lines:
        if re.match(r"^#{1,6}\s+", line):
            if content_lines:
                sections.append({"heading": heading, "content": "\n".join(content_lines).strip()})
                content_lines = []
            heading = line.lstrip("#").strip() or heading
        else:
            content_lines.append(line)
    if content_lines:
        sections.append({"heading": heading, "content": "\n".join(content_lines).strip()})
    if not sections and markdown.strip():
        sections.append({"heading": "Document", "content": markdown.strip()})
    return [section for section in sections if section["content"]]


def _excel_calls_used(result: ExcelPipelineResult) -> int:
    return len([sheet for sheet in result.sheets if sheet.status in {"complete", "failed"}])


def _stage2_calls_used(result: Any) -> int:
    return int(getattr(result, "sections_rewritten", 0) or 0) + (
        1 if getattr(result, "swimlane_spec", None) is not None else 0
    )


def _cost_summary(call_count: int) -> dict[str, Any]:
    config = get_active_llm_config()
    call_count = max(0, int(call_count or 0))
    return {
        "provider": config["provider"],
        "model": config["model"],
        "call_count": call_count,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_usd": 0.0,
        "is_local_provider": config["provider"] == "ollama",
        "call_records": [],
    }


def _merge_cost_summaries(
    first: dict[str, Any] | None,
    second: dict[str, Any] | None,
) -> dict[str, Any]:
    first = first or _cost_summary(0)
    second = second or _cost_summary(0)
    merged = _cost_summary(
        int(first.get("call_count") or 0) + int(second.get("call_count") or 0)
    )
    merged["input_tokens"] = int(first.get("input_tokens") or 0) + int(second.get("input_tokens") or 0)
    merged["output_tokens"] = int(first.get("output_tokens") or 0) + int(second.get("output_tokens") or 0)
    merged["total_tokens"] = int(first.get("total_tokens") or 0) + int(second.get("total_tokens") or 0)
    merged["estimated_cost_usd"] = float(first.get("estimated_cost_usd") or 0) + float(second.get("estimated_cost_usd") or 0)
    merged["call_records"] = list(first.get("call_records") or []) + list(second.get("call_records") or [])
    return merged


def _merge_corpus_maps(
    excel_results: list[ExcelPipelineResult],
    analysis_corpus_map: CorpusMapContribution | None = None,
) -> CorpusMapContribution | None:
    risk_to_control_map: list[dict] = []
    sop_to_control_map: list[dict] = []
    evidence_to_control_map: list[dict] = []
    general_relationships: list[dict] = []
    finding_summary: dict[str, Any] = {}
    for result in excel_results:
        if not result.corpus_map:
            continue
        risk_to_control_map.extend(result.corpus_map.risk_to_control_map)
        sop_to_control_map.extend(result.corpus_map.sop_to_control_map)
        evidence_to_control_map.extend(result.corpus_map.evidence_to_control_map)
        general_relationships.extend(result.corpus_map.general_relationships)
        finding_summary = _merge_finding_summary(finding_summary, result.corpus_map.finding_summary)
    if analysis_corpus_map:
        risk_to_control_map.extend(analysis_corpus_map.risk_to_control_map)
        sop_to_control_map.extend(analysis_corpus_map.sop_to_control_map)
        evidence_to_control_map.extend(analysis_corpus_map.evidence_to_control_map)
        general_relationships.extend(analysis_corpus_map.general_relationships)
        finding_summary = _merge_finding_summary(finding_summary, analysis_corpus_map.finding_summary)
    if not (risk_to_control_map or sop_to_control_map or evidence_to_control_map or general_relationships or finding_summary):
        return None
    return CorpusMapContribution(
        risk_to_control_map=risk_to_control_map,
        sop_to_control_map=sop_to_control_map,
        evidence_to_control_map=evidence_to_control_map,
        general_relationships=general_relationships,
        finding_summary=finding_summary,
    )


def _merge_finding_summary(
    base: dict[str, Any],
    incoming: dict[str, Any] | None,
) -> dict[str, Any]:
    if not incoming:
        return base
    merged = {key: value for key, value in base.items()}
    for group, values in incoming.items():
        if not isinstance(values, dict):
            merged[group] = values
            continue
        target = merged.setdefault(group, {})
        if not isinstance(target, dict):
            merged[group] = values
            continue
        for key, count in values.items():
            try:
                target[key] = int(target.get(key, 0)) + int(count)
            except (TypeError, ValueError):
                target[key] = count
    return merged


def _final_stage(
    conversion_counter: dict[str, int],
    analysis_result: AnalysisResult,
) -> str:
    if analysis_result.status == "failed":
        return "failed"
    if conversion_counter["failed"] == conversion_counter["total"] and conversion_counter["total"] > 0:
        return "failed"
    if conversion_counter["failed"] > 0 or analysis_result.status == "partial":
        return "partial"
    return "review_ready"


def _pipeline_status(stage: str) -> str:
    if stage == "failed":
        return "failed"
    if stage == "partial":
        return "partial"
    return "success"


def _dump_models(models: list[Any]) -> list[dict[str, Any]]:
    return [_dump_model(model) for model in models]


def _dump_model(model: Any) -> Any:
    if model is None:
        return None
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    if isinstance(model, list):
        return [_dump_model(item) for item in model]
    if isinstance(model, dict):
        return {key: _dump_model(value) for key, value in model.items()}
    return model

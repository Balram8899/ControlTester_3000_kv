from __future__ import annotations

import asyncio
import warnings
from io import BytesIO
from typing import Any
from unittest.mock import MagicMock

import pytest
from pyparsing import PyparsingDeprecationWarning

from utils.services.schemas import (
    AnalysisResult,
    ConversionResult,
    CorpusMapContribution,
    DocumentFact,
    ExcelPipelineResult,
    LLMResult,
    OutputGenerationResult,
    SourceReference,
    Suggestion,
)
from utils.sop_processing.case_store import DocumentUpliftCaseStore

warnings.filterwarnings("ignore", category=PyparsingDeprecationWarning)


def rcm_workbook_bytes(rows: int = 6) -> bytes:
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "RCM"
    sheet.append(["Control ID", "Risk ID", "Description", "Control Owner", "Frequency", "Evidence"])
    for index in range(1, rows + 1):
        sheet.append(
            [
                f"C-{index}",
                f"R-{index}",
                f"Access review control {index}",
                "Access Governance",
                "Quarterly",
                f"Access review export {index}",
            ]
        )
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def memory_store_with_inputs() -> DocumentUpliftCaseStore:
    store = DocumentUpliftCaseStore.__new__(DocumentUpliftCaseStore)
    store._use_memory_fallback()
    case = store.create_case({"title": "KYC uplift", "process_name": "KYC"})
    store.update_case(
        case["case_id"],
        {
            "document_tags": [
                {"file_id": "sop-1", "filename": "kyc.docx", "tag": "procedure"},
                {"file_id": "rcm-1", "filename": "kyc_rcm.xlsx", "tag": "rcm"},
            ]
        },
    )
    store.store_input_file(case["case_id"], "sop-1", "kyc.docx", b"sop-bytes")
    store.store_input_file(case["case_id"], "rcm-1", "kyc_rcm.xlsx", b"xlsx-bytes")
    return store


def test_run_pipeline_sequences_services_and_persists_stage1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from utils.sop_processing import pipeline

    store = memory_store_with_inputs()
    case_id = next(iter(store._memory))
    seen: dict[str, Any] = {}

    def fake_convert(file_bytes: bytes, filename: str, file_id: str, tag: str) -> ConversionResult:
        seen.setdefault("converted", []).append((file_bytes, filename, file_id, tag))
        return ConversionResult(
            status="success",
            file_id=file_id,
            filename=filename,
            file_type="xlsx" if filename.endswith(".xlsx") else "docx",
            tag=tag,  # type: ignore[arg-type]
            markdown="# Procedure\n\nThe owner reviews access evidence every quarter." * 3,
            page_count=3,
        )

    def fake_excel(
        file_bytes: bytes,
        filename: str,
        file_id: str,
        pipeline_id: str,
        budget_remaining: int,
    ) -> ExcelPipelineResult:
        seen["excel_bytes"] = file_bytes
        return ExcelPipelineResult(
            status="success",
            file_id=file_id,
            total_rows_assessed=500,
            corpus_map=CorpusMapContribution(
                risk_to_control_map=[{"risk_id": "R-1", "control_id": "C-1"}],
                sop_to_control_map=[],
                evidence_to_control_map=[{"control_id": "C-1", "evidence_ref": "Export"}],
            ),
        )

    def fake_analysis(
        conversions: list[ConversionResult],
        chunk_results: dict[str, Any],
        excel_results: list[ExcelPipelineResult],
        pipeline_id: str,
        budget_remaining: int,
    ) -> AnalysisResult:
        seen["analysis_inputs"] = (conversions, chunk_results, excel_results, budget_remaining)
        return AnalysisResult(
            status="success",
            process_steps=[{"step_id": "s1", "anchor_id": "sop-1-a1"}],
            suggestions=[
                Suggestion(
                    suggestion_id="sug-1",
                    suggestion_type="evidence_requirement",
                    severity="medium",
                    title="Clarify retained evidence",
                    detail="The SOP should name the retained export.",
                    proposed_text="Retain the access review export.",
                    source_references=[SourceReference(document_id="sop-1", anchor_id="sop-1-a1")],
                )
            ],
            llm_calls_used=3,
        )

    monkeypatch.setattr(pipeline.conversion, "convert_document", fake_convert)
    monkeypatch.setattr(pipeline.excel_pipeline, "process_excel", fake_excel)
    monkeypatch.setattr(pipeline.analysis, "analyze_documents", fake_analysis)
    monkeypatch.setattr(pipeline, "get_document_uplift_config", lambda: {"max_llm_calls_per_pipeline": 20})

    result = pipeline.run_pipeline(case_id, store=store)
    stored = store.get_case(case_id)

    assert result["status"] == "review_ready"
    assert seen["converted"][0][0] == b"sop-bytes"
    assert seen["excel_bytes"] == b"xlsx-bytes"
    assert "sop-1" in seen["analysis_inputs"][1]
    assert stored["status"]["stage"] == "review_ready"
    assert stored["suggestions"][0]["review_status"] == "pending"
    assert stored["process_steps"][0]["step_id"] == "s1"
    assert stored["corpus_map"]["risk_to_control_map"][0]["control_id"] == "C-1"
    assert stored["status"]["stage1_cost"]["call_count"] == 3
    assert store._memory_markdown[case_id][0]["file_id"] == "sop-1"
    counter = stored["processing_state"]["conversion"]
    assert counter["total"] == counter["completed"] + counter["failed"] + counter["pending"]


def test_run_pipeline_records_conversion_failures_and_continues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from utils.sop_processing import pipeline

    store = memory_store_with_inputs()
    case_id = next(iter(store._memory))

    def fake_convert(file_bytes: bytes, filename: str, file_id: str, tag: str) -> ConversionResult:
        if file_id == "sop-1":
            return ConversionResult(status="failed", file_id=file_id, filename=filename, error="bad docx")
        return ConversionResult(
            status="success",
            file_id=file_id,
            filename=filename,
            file_type="xlsx",
            tag="rcm",
            markdown="# RCM\n\ncontent that is long enough for tests",
        )

    monkeypatch.setattr(pipeline.conversion, "convert_document", fake_convert)
    monkeypatch.setattr(
        pipeline.excel_pipeline,
        "process_excel",
        lambda *_args, **_kwargs: ExcelPipelineResult(status="success", file_id="rcm-1"),
    )
    monkeypatch.setattr(
        pipeline.analysis,
        "analyze_documents",
        lambda **_kwargs: AnalysisResult(status="success", llm_calls_used=0),
    )

    result = pipeline.run_pipeline(case_id, store=store)
    stored = store.get_case(case_id)

    assert result["status"] == "partial"
    assert stored["processing_state"]["conversion"]["failed"] == 1
    counter = stored["processing_state"]["conversion"]
    assert counter["total"] == counter["completed"] + counter["failed"] + counter["pending"]


def test_run_pipeline_persists_excel_facts_outside_case_and_followups(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from utils.sop_processing import pipeline

    store = memory_store_with_inputs()
    case_id = next(iter(store._memory))
    source = SourceReference(document_id="rcm-1", filename="ops.xlsx", sheet_name="Evidence", row_index=2)
    fact = DocumentFact(
        fact_id="fact-1",
        case_id=case_id,
        file_id="rcm-1",
        source_ref=source,
        document_role="evidence_test_result",
        domain_contexts=["unknown_general"],
        entity_type="activity",
        entity_name="Review exception queue",
        attributes={"owner": ""},
        raw_attributes={"Processor": ""},
        confidence=0.9,
    )

    def fake_convert(file_bytes: bytes, filename: str, file_id: str, tag: str) -> ConversionResult:
        return ConversionResult(
            status="success",
            file_id=file_id,
            filename=filename,
            file_type="xlsx" if filename.endswith(".xlsx") else "docx",
            tag=tag,  # type: ignore[arg-type]
            markdown="# Procedure\n\nProcedure content.",
            page_count=1,
        )

    def fake_excel(*_args: Any, **_kwargs: Any) -> ExcelPipelineResult:
        return ExcelPipelineResult(status="success", file_id="rcm-1", facts=[fact])

    def fake_analysis(**_kwargs: Any) -> AnalysisResult:
        return AnalysisResult(
            status="success",
            llm_calls_used=0,
            agent_follow_up_questions=["Who owns the exception queue after triage?"],
            corpus_map=CorpusMapContribution(
                finding_summary={"patterns": {"missing_owner": 1}},
            ),
        )

    monkeypatch.setattr(pipeline.conversion, "convert_document", fake_convert)
    monkeypatch.setattr(pipeline.excel_pipeline, "process_excel", fake_excel)
    monkeypatch.setattr(pipeline.analysis, "analyze_documents", fake_analysis)

    pipeline.run_pipeline(case_id, store=store)
    stored = store.get_case(case_id)

    assert "facts" not in stored
    assert store.get_case_facts(case_id)[0]["fact_id"] == "fact-1"
    assert stored["agent_follow_up_questions"] == ["Who owns the exception queue after triage?"]
    assert stored["corpus_map"]["finding_summary"]["patterns"]["missing_owner"] == 1


def test_cross_document_corpus_map_flows_from_excel_to_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from utils.sop_processing import pipeline

    store = memory_store_with_inputs()
    case_id = next(iter(store._memory))
    store.store_input_file(case_id, "rcm-1", "kyc_rcm.xlsx", rcm_workbook_bytes())
    seen: dict[str, Any] = {"analysis_prompts": []}

    def fake_convert(file_bytes: bytes, filename: str, file_id: str, tag: str) -> ConversionResult:
        if file_id == "rcm-1":
            return ConversionResult(
                status="success",
                file_id=file_id,
                filename=filename,
                file_type="xlsx",
                tag="rcm",
                markdown="# RCM\n\nStructured matrix.",
            )
        return ConversionResult(
            status="success",
            file_id=file_id,
            filename=filename,
            file_type="docx",
            tag="procedure",
            markdown="# Access Review Procedure\n\nThe Access Governance team performs control C-1 and retains evidence.",
            page_count=1,
        )

    def fake_excel_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> Any:
        return LLMResult(
            status="success",
            output={
                "columns": [
                    {"column_name": "Control ID", "classified_as": "control_id", "confidence": 1.0},
                    {"column_name": "Risk ID", "classified_as": "risk_id", "confidence": 1.0},
                    {"column_name": "Description", "classified_as": "description", "confidence": 1.0},
                    {"column_name": "Control Owner", "classified_as": "owner", "confidence": 1.0},
                    {"column_name": "Frequency", "classified_as": "frequency", "confidence": 1.0},
                    {"column_name": "Evidence", "classified_as": "evidence_artifact", "confidence": 1.0},
                ]
            },
        )

    def fake_analysis_llm(
        prompt: str,
        schema_name: str,
        response_schema: dict[str, Any],
        pipeline_id: str,
        budget_remaining: int,
    ) -> Any:
        seen["analysis_prompts"].append((schema_name, prompt))
        if schema_name == "section_classification":
            return LLMResult(
                status="success",
                output={"sections": [{"anchor_id": "sop-1-a1", "section_type": "procedural"}]},
            )
        if schema_name == "procedural_extraction":
            assert "Risk-control" in prompt
            assert "C-1" in prompt
            return LLMResult(
                status="success",
                output={
                    "process_steps": [
                            {
                                "step_id": "step-1",
                                "anchor_id": "sop-1-a1",
                                "section": "Access Review Procedure",
                                "actor": "Access Governance",
                                "action": "performs access review",
                                "evidence": "Access review export 1",
                            }
                    ],
                    "suggestions": [],
                },
            )
        if schema_name == "cross_document_synthesis":
            assert "C-1" in prompt
            return LLMResult(
                status="success",
                output={
                    "suggestions": [
                        {
                            "suggestion_id": "gap-1",
                            "suggestion_type": "cross_document_conflict",
                            "severity": "high",
                            "title": "Align SOP owner to RCM owner",
                            "detail": "The SOP step should align to the RCM control owner.",
                            "proposed_text": "Access Governance performs the quarterly access review for C-1.",
                            "source_references": [
                                {"document_id": "sop-1", "anchor_id": "sop-1-a1"},
                                {"document_id": "rcm-1", "sheet_name": "RCM", "row_index": 2},
                            ],
                        }
                    ]
                },
            )
        return LLMResult(status="success", output={})

    monkeypatch.setattr(pipeline.conversion, "convert_document", fake_convert)
    monkeypatch.setattr(pipeline.excel_pipeline, "call_llm", fake_excel_llm)
    monkeypatch.setattr(pipeline.analysis, "call_llm", fake_analysis_llm)
    monkeypatch.setattr(pipeline, "get_document_uplift_config", lambda: {"max_llm_calls_per_pipeline": 20})

    result = pipeline.run_pipeline(case_id, store=store)
    stored = store.get_case(case_id)

    assert result["status"] == "review_ready"
    assert stored["corpus_map"]["risk_to_control_map"][0]["control_id"] == "C-1"
    assert stored["corpus_map"]["sop_to_control_map"][0] == {
        "sop_section": "Access Review Procedure",
        "anchor_id": "sop-1-a1",
        "control_id": "C-1",
        "file_id": "sop-1",
    }
    assert any(item["suggestion_type"] == "cross_document_conflict" for item in stored["suggestions"])
    assert "cross_document_synthesis" in [schema_name for schema_name, _prompt in seen["analysis_prompts"]]


def test_dispatch_pipeline_asyncio_enqueues_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils.sop_processing import pipeline

    calls: list[tuple[str, int, Any]] = []

    class FakeQueue:
        def enqueue(
            self,
            case_id: str,
            stage: int = 1,
            store: DocumentUpliftCaseStore | None = None,
        ) -> dict[str, Any]:
            calls.append((case_id, stage, store))
            return {
                "case_id": case_id,
                "stage": stage,
                "status": "queued",
                "task_backend": "asyncio",
                "task_id": f"async-{case_id}-{stage}",
            }

    monkeypatch.setattr(pipeline, "get_async_pipeline_queue", lambda: FakeQueue())
    monkeypatch.setenv("TASK_BACKEND", "asyncio")

    result = pipeline.dispatch_pipeline("case-1", stage=2)

    assert result == {
        "case_id": "case-1",
        "stage": 2,
        "status": "queued",
        "task_backend": "asyncio",
        "task_id": "async-case-1-2",
    }
    assert calls == [("case-1", 2, None)]


def test_dispatch_pipeline_celery_enqueues_task(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils.sop_processing import pipeline

    calls: list[tuple[str, int]] = []

    def fake_enqueue(case_id: str, stage: int = 1) -> dict[str, Any]:
        calls.append((case_id, stage))
        return {
            "case_id": case_id,
            "stage": stage,
            "status": "queued",
            "task_backend": "celery",
            "task_id": "celery-task-1",
        }

    monkeypatch.setattr(pipeline, "enqueue_celery_pipeline", fake_enqueue)
    monkeypatch.setenv("TASK_BACKEND", "celery")

    result = pipeline.dispatch_pipeline("case-1", stage=2)

    assert result["status"] == "queued"
    assert result["task_backend"] == "celery"
    assert calls == [("case-1", 2)]


def test_async_queue_rejects_duplicate_case(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils.sop_processing import pipeline

    queue = pipeline.AsyncPipelineQueue(max_workers=1, max_queue_size=5)
    submitted: list[pipeline.PipelineJob] = []
    monkeypatch.setattr(queue, "_submit_job", submitted.append)

    queue.enqueue("case-1")

    with pytest.raises(pipeline.PipelineAlreadyQueued):
        queue.enqueue("case-1", stage=2)

    assert len(submitted) == 1


def test_async_queue_rejects_when_full(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils.sop_processing import pipeline

    queue = pipeline.AsyncPipelineQueue(max_workers=1, max_queue_size=1)
    monkeypatch.setattr(queue, "_queued_count", lambda: 1)

    with pytest.raises(pipeline.PipelineQueueFull):
        queue.enqueue("case-2")


def test_async_queue_worker_uses_run_in_executor() -> None:
    from utils.sop_processing import pipeline

    queue = pipeline.AsyncPipelineQueue(max_workers=1, max_queue_size=5)
    job = pipeline.PipelineJob(case_id="case-1", stage=2, store=None)
    calls: list[tuple[Any, Any, tuple[Any, ...]]] = []

    class FakeLoop:
        async def run_in_executor(
            self,
            executor: Any,
            fn: Any,
            *args: Any,
        ) -> dict[str, str]:
            calls.append((executor, fn, args))
            return {"status": "complete"}

    result = asyncio.run(queue._run_job(job, loop=FakeLoop()))

    assert result == {"status": "complete"}
    assert calls == [(None, pipeline.run_pipeline, ("case-1", 2, None))]


def test_get_case_marks_stale_running_pipeline_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    store = DocumentUpliftCaseStore.__new__(DocumentUpliftCaseStore)
    store._use_memory_fallback()
    case = store.create_case({"title": "stale case"})
    case_id = case["case_id"]
    store.update_case(
        case_id,
        {
            "status": {"stage": "analyzing"},
            "processing_state": {"pipeline_status": "running", "pipeline_error": None},
        },
    )
    store._memory[case_id]["updated_at"] = "2020-01-01T00:00:00"
    monkeypatch.setenv("DOCUMENT_UPLIFT_PIPELINE_TIMEOUT_SECONDS", "1")

    stale_case = store.get_case(case_id)

    assert stale_case["status"]["stage"] == "failed"
    assert stale_case["processing_state"]["pipeline_status"] == "failed"
    assert "stale" in stale_case["processing_state"]["pipeline_error"].lower()


def test_output_generator_has_stage2_diagram_renderer_after_item25() -> None:
    from utils.sop_processing import output_generator

    assert output_generator.DIAGRAM_RENDERER_READY is True


def test_stage2_pipeline_calls_output_generator(monkeypatch: pytest.MonkeyPatch) -> None:
    from utils.sop_processing import pipeline

    store = DocumentUpliftCaseStore.__new__(DocumentUpliftCaseStore)
    store._use_memory_fallback()
    case = store.create_case({"title": "KYC uplift", "process_name": "KYC"})
    store.update_case(
        case["case_id"],
        {
            "document_tags": [
                {"file_id": "sop-1", "filename": "kyc.docx", "tag": "procedure"},
            ],
            "suggestions": [
                {
                    "suggestion_id": "sug-1",
                    "review_status": "accepted",
                    "proposed_text": "Retain export.",
                }
            ],
            "process_steps": [{"step_id": "s1"}],
            "corpus_map": {"risk_to_control_map": [{"risk_id": "R-1"}]},
        },
    )
    store.store_input_file(case["case_id"], "sop-1", "kyc.docx", b"docx-bytes")
    seen: dict[str, Any] = {}

    def fake_generate_outputs(**kwargs: Any) -> OutputGenerationResult:
        seen.update(kwargs)
        return OutputGenerationResult(
            status="success",
            case_id=kwargs["case_id"],
            sections_rewritten=1,
        )

    monkeypatch.setattr(pipeline.output_generator, "generate_outputs", fake_generate_outputs)

    result = pipeline.run_pipeline(case["case_id"], stage=2, store=store)

    assert result["status"] == "complete"
    assert seen["case_id"] == case["case_id"]
    assert seen["original_sop_bytes"] == b"docx-bytes"
    assert seen["suggestions"][0]["review_status"] == "accepted"
    assert seen["pipeline_id"] == f"{case['case_id']}:stage2"
    assert store.get_case(case["case_id"])["status"]["final_cost"]["call_count"] == 1

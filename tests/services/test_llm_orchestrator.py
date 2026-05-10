from __future__ import annotations

import importlib
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from utils.services.schemas import LLMCallRecord


class FakeLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.prompts: list[str] = []

    def invoke(self, prompt: str) -> object:
        self.prompts.append(prompt)
        return SimpleNamespace(content=self.responses.pop(0))


def load_orchestrator() -> ModuleType:
    try:
        return importlib.import_module("utils.services.llm_orchestrator")
    except ModuleNotFoundError as exc:
        pytest.fail(f"utils.services.llm_orchestrator is missing: {exc}")


def make_record(input_tokens: int, output_tokens: int) -> LLMCallRecord:
    return LLMCallRecord(
        call_id=f"call-{input_tokens}-{output_tokens}",
        pipeline_id="pipe-1",
        schema_name="schema_detection",
        prompt_chars=120,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        duration_ms=25,
        timestamp="2026-05-06T13:00:00Z",
        status="success",
    )


def test_budget_zero_returns_budget_exceeded(monkeypatch: pytest.MonkeyPatch) -> None:
    orchestrator = load_orchestrator()

    get_llm_calls: list[Any] = []
    monkeypatch.setattr(orchestrator, "get_llm", lambda temperature=0.2: get_llm_calls.append("called"))

    result = orchestrator.call_llm(
        prompt="Return JSON.",
        schema_name="schema_detection",
        response_schema={"type": "object"},
        pipeline_id="pipe-1",
        budget_remaining=0,
    )

    assert result.status == "budget_exceeded"
    assert result.error == "LLM call budget exhausted"
    assert get_llm_calls == []


def test_successful_call_returns_parsed_output(monkeypatch: pytest.MonkeyPatch) -> None:
    orchestrator = load_orchestrator()
    fake_llm = FakeLLM(['{"answer": "ok"}'])
    monkeypatch.setattr(orchestrator, "get_llm", lambda temperature=0.2: fake_llm)

    result = orchestrator.call_llm(
        prompt="Return an answer.",
        schema_name="answer_schema",
        response_schema={"type": "object", "properties": {"answer": {"type": "string"}}},
        pipeline_id="pipe-1",
        budget_remaining=1,
    )

    assert result.status == "success"
    assert result.output == {"answer": "ok"}
    assert "answer_schema" in fake_llm.prompts[0]


def test_call_record_populated(monkeypatch: pytest.MonkeyPatch) -> None:
    orchestrator = load_orchestrator()
    monkeypatch.setattr(orchestrator, "get_llm", lambda temperature=0.2: FakeLLM(['{"ok": true}']))

    result = orchestrator.call_llm(
        prompt="Return JSON with an ok boolean.",
        schema_name="ok_schema",
        response_schema={"type": "object", "properties": {"ok": {"type": "boolean"}}},
        pipeline_id="pipe-1",
        budget_remaining=1,
    )

    assert result.call_record is not None
    assert result.call_record.input_tokens > 0
    assert result.call_record.output_tokens > 0
    assert result.call_record.duration_ms > 0
    assert result.call_record.pipeline_id == "pipe-1"


def test_malformed_json_retries_once(monkeypatch: pytest.MonkeyPatch) -> None:
    orchestrator = load_orchestrator()
    fake_llm = FakeLLM(["not json", '{"ok": true}'])
    monkeypatch.setattr(orchestrator, "get_llm", lambda temperature=0.2: fake_llm)

    result = orchestrator.call_llm(
        prompt="Return JSON.",
        schema_name="retry_schema",
        response_schema={"type": "object"},
        pipeline_id="pipe-1",
        budget_remaining=1,
    )

    assert result.status == "success"
    assert result.output == {"ok": True}
    assert len(fake_llm.prompts) == 2


def test_ollama_provider_cost_is_zero() -> None:
    orchestrator = load_orchestrator()

    cost = orchestrator.calculate_cost(
        [make_record(1000, 500)],
        provider="ollama",
        model="llama3:8b",
    )

    assert cost.is_local_provider is True
    assert cost.estimated_cost_usd == 0.0
    assert cost.total_tokens == 1500


def test_gemini_flash_cost_calculated() -> None:
    orchestrator = load_orchestrator()

    cost = orchestrator.calculate_cost(
        [make_record(1_000_000, 1_000_000)],
        provider="gemini",
        model="gemini-flash",
    )

    assert cost.is_local_provider is False
    assert cost.estimated_cost_usd == pytest.approx(0.375)
    assert cost.call_count == 1


def test_get_batch_size_chars_uses_model_context_minus_overhead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    orchestrator = load_orchestrator()
    monkeypatch.setitem(orchestrator.MODEL_CONTEXT_CHARS, "test-model", 9000)
    monkeypatch.setattr(
        orchestrator,
        "get_active_llm_config",
        lambda: {"provider": "gemini", "model": "test-model"},
    )

    assert orchestrator.get_batch_size_chars() == 7000

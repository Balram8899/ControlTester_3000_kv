from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from math import ceil
from typing import Any

from utils.llm_config_store import get_active_llm_config
from utils.llm_provider import get_llm
from utils.services.schemas import CostSummary, LLMCallRecord, LLMResult


MODEL_CONTEXT_CHARS: dict[str, int] = {
    "gemini-flash": 32000,
    "gemini-pro": 32000,
    "gemini-2.0-flash": 32000,
    "gemini-3-flash-preview": 32000,
    "gpt-5.5": 120000,
    "gpt-5.4": 120000,
    "llama3:8b": 8000,
    "llama3:latest": 8000,
}

COST_PER_1M: dict[str, dict[str, float]] = {
    "gemini-flash": {"input": 0.075, "output": 0.30},
    "gemini-pro": {"input": 1.25, "output": 5.00},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-3-flash-preview": {"input": 0.075, "output": 0.30},
}

DEFAULT_CONTEXT_CHARS = 6000
SYSTEM_PROMPT_OVERHEAD_CHARS = 2000


def call_llm(
    prompt: str,
    schema_name: str,
    response_schema: dict,
    pipeline_id: str,
    budget_remaining: int,
    temperature: float = 0.2,
) -> LLMResult:
    if budget_remaining <= 0:
        return LLMResult(
            status="budget_exceeded",
            error="LLM call budget exhausted",
        )

    call_id = str(uuid.uuid4())
    prompt_with_schema = _build_prompt(prompt, schema_name, response_schema)
    start = time.perf_counter()
    raw_output = ""
    try:
        llm = get_llm(temperature=temperature)
        for attempt in range(2):
            response = llm.invoke(prompt_with_schema)
            raw_output = _response_to_text(response)
            parsed_output = _parse_json(raw_output)
            if parsed_output is not None:
                duration_ms = _duration_ms(start)
                call_record = _build_call_record(
                    call_id=call_id,
                    pipeline_id=pipeline_id,
                    schema_name=schema_name,
                    prompt=prompt_with_schema,
                    raw_output=raw_output,
                    duration_ms=duration_ms,
                    status="success",
                )
                return LLMResult(
                    status="success",
                    call_id=call_id,
                    output=parsed_output,
                    input_tokens=call_record.input_tokens,
                    output_tokens=call_record.output_tokens,
                    duration_ms=duration_ms,
                    call_record=call_record,
                )
            if attempt == 0:
                continue

        duration_ms = _duration_ms(start)
        call_record = _build_call_record(
            call_id=call_id,
            pipeline_id=pipeline_id,
            schema_name=schema_name,
            prompt=prompt_with_schema,
            raw_output=raw_output,
            duration_ms=duration_ms,
            status="failed",
            error="LLM returned unparseable JSON after retry",
        )
        return LLMResult(
            status="failed",
            error="LLM returned unparseable JSON after retry",
            call_id=call_id,
            input_tokens=call_record.input_tokens,
            output_tokens=call_record.output_tokens,
            duration_ms=duration_ms,
            call_record=call_record,
        )
    except Exception as exc:
        duration_ms = _duration_ms(start)
        return LLMResult(
            status="failed",
            error=str(exc),
            call_id=call_id,
            duration_ms=duration_ms,
        )


def get_batch_size_chars() -> int:
    config = get_active_llm_config()
    context_chars = MODEL_CONTEXT_CHARS.get(config["model"], DEFAULT_CONTEXT_CHARS)
    return context_chars - SYSTEM_PROMPT_OVERHEAD_CHARS


def calculate_cost(
    records: list[LLMCallRecord],
    provider: str,
    model: str,
) -> CostSummary:
    input_tokens = sum(record.input_tokens for record in records)
    output_tokens = sum(record.output_tokens for record in records)
    total_tokens = input_tokens + output_tokens
    if provider == "ollama":
        estimated_cost_usd = 0.0
        is_local_provider = True
    else:
        rates = COST_PER_1M.get(model, {"input": 0.0, "output": 0.0})
        input_cost = (input_tokens / 1_000_000) * rates["input"]
        output_cost = (output_tokens / 1_000_000) * rates["output"]
        estimated_cost_usd = input_cost + output_cost
        is_local_provider = False

    return CostSummary(
        provider=provider,
        model=model,
        call_count=len(records),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimated_cost_usd,
        is_local_provider=is_local_provider,
        call_records=records,
    )


def _build_prompt(prompt: str, schema_name: str, response_schema: dict) -> str:
    schema_json = json.dumps(response_schema, sort_keys=True)
    return (
        f"{prompt}\n\n"
        f"Return only valid JSON for schema_name={schema_name}.\n"
        f"JSON schema:\n{schema_json}"
    )


def _response_to_text(response: object) -> str:
    if isinstance(response, str):
        return response
    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(item) for item in content)
    if isinstance(response, dict):
        return json.dumps(response)
    return str(response)


def _parse_json(raw_output: str) -> dict | None:
    text = _strip_json_fence(raw_output.strip())
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _strip_json_fence(text: str) -> str:
    if text.startswith("```json") and text.endswith("```"):
        return text[7:-3].strip()
    if text.startswith("```") and text.endswith("```"):
        return text[3:-3].strip()
    return text


def _build_call_record(
    call_id: str,
    pipeline_id: str,
    schema_name: str,
    prompt: str,
    raw_output: str,
    duration_ms: int,
    status: str,
    error: str | None = None,
) -> LLMCallRecord:
    return LLMCallRecord(
        call_id=call_id,
        pipeline_id=pipeline_id,
        schema_name=schema_name,
        prompt_chars=len(prompt),
        input_tokens=_estimate_tokens(prompt),
        output_tokens=_estimate_tokens(raw_output),
        duration_ms=duration_ms,
        timestamp=datetime.now(timezone.utc).isoformat(),
        status=status,
        error=error,
    )


def _estimate_tokens(text: str) -> int:
    return max(1, ceil(len(text) / 4))


def _duration_ms(start: float) -> int:
    return max(1, int((time.perf_counter() - start) * 1000))

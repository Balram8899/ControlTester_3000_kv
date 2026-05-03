from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, TypeVar

from pydantic import BaseModel

from utils.llm_provider import get_llm

T = TypeVar("T", bound=BaseModel)


@dataclass
class PromptRunResult:
    parsed: BaseModel | None
    raw: str
    record: dict[str, Any]


def _extract_text(response: Any) -> str:
    if hasattr(response, "content"):
        return str(response.content)
    return str(response)


def _parse_json(text: str) -> Any:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = min([idx for idx in [stripped.find("{"), stripped.find("[")] if idx >= 0], default=0)
    end = max(stripped.rfind("}"), stripped.rfind("]"))
    if end >= start:
        stripped = stripped[start : end + 1]
    return json.loads(stripped)


def run_json_prompt(
    stage: str,
    prompt: str,
    schema: type[T],
    llm: Any | None = None,
    max_retries: int = 1,
) -> PromptRunResult:
    started = time.perf_counter()
    try:
        model = llm or get_llm()
    except Exception as exc:
        error = str(exc)
        return PromptRunResult(
            parsed=None,
            raw="",
            record={
                "stage": stage,
                "model": "unavailable",
                "created_at": datetime.utcnow().isoformat(),
                "validation_status": "invalid",
                "error": f"LLM unavailable for {stage}: {error}",
                "attempts": 0,
                "prompt_chars": len(prompt),
                "raw_chars": 0,
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "errors": [error],
            },
        )
    record = {
        "stage": stage,
        "model": model.__class__.__name__,
        "created_at": datetime.utcnow().isoformat(),
        "validation_status": "invalid",
        "error": None,
        "attempts": 0,
        "prompt_chars": len(prompt),
        "raw_chars": 0,
        "duration_ms": 0,
        "errors": [],
    }
    raw = ""
    for attempt in range(max(0, max_retries) + 1):
        record["attempts"] = attempt + 1
        try:
            raw = _extract_text(model.invoke(prompt))
            record["raw_chars"] = len(raw)
            payload = _parse_json(raw)
            parsed = schema.model_validate(payload)
            record["validation_status"] = "valid"
            record["error"] = None
            record["duration_ms"] = round((time.perf_counter() - started) * 1000)
            return PromptRunResult(parsed=parsed, raw=raw, record=record)
        except Exception as exc:
            error = str(exc)
            record["error"] = error
            record["raw_chars"] = len(raw)
            record["duration_ms"] = round((time.perf_counter() - started) * 1000)
            record["errors"].append(error)
    record["duration_ms"] = round((time.perf_counter() - started) * 1000)
    return PromptRunResult(parsed=None, raw=raw, record=record)

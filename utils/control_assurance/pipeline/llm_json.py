from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TypeVar

from pydantic import BaseModel, ValidationError


ModelT = TypeVar("ModelT", bound=BaseModel)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _response_text(response) -> str:
    return response.content if hasattr(response, "content") else str(response)


def _extract_json(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start < 0 or end <= start:
            raise
        return json.loads(raw[start:end])


def _record_parse_error(db, session_id: str, stage: str, attempt: int, raw: str, error: Exception) -> None:
    db.ct_sessions.update_one(
        {"_id": session_id},
        {
            "$push": {
                "parse_errors": {
                    "stage": stage,
                    "attempt": attempt,
                    "error": str(error),
                    "raw_preview": raw[:1000],
                    "updated_at": _now(),
                }
            }
        },
    )


def invoke_json_with_retry(
    *,
    llm,
    prompt: str,
    db,
    session_id: str,
    stage: str,
    response_model: type[ModelT],
) -> ModelT:
    retry_prompt = (
        prompt
        + "\n\nYour previous response was not valid for the required schema. "
        + "Return only one valid JSON object. Do not include markdown or explanation."
    )

    last_error: Exception | None = None
    for attempt, active_prompt in enumerate((prompt, retry_prompt), start=1):
        raw = _response_text(llm.invoke(active_prompt))
        try:
            data = _extract_json(raw)
            return response_model.model_validate(data)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
            last_error = exc
            _record_parse_error(db, session_id, stage, attempt, raw, exc)

    assert last_error is not None
    raise last_error

from __future__ import annotations

from typing import Any, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def validate_payload(payload: dict[str, Any], schema: type[T]) -> T:
    return schema.model_validate(payload)

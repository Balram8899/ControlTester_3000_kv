from __future__ import annotations

import importlib
import json
from types import ModuleType

import pytest


def load_sse_events() -> ModuleType:
    try:
        return importlib.import_module("utils.sop_processing.sse_events")
    except ModuleNotFoundError as exc:
        pytest.fail(f"utils.sop_processing.sse_events is missing: {exc}")


def test_yield_sse_event_formats_event_and_json_data() -> None:
    sse_events = load_sse_events()

    payload = sse_events.yield_sse_event(
        "progress",
        {"stage": "analyzing", "step": "section_classification"},
    )

    assert payload.startswith("event: progress\n")
    assert payload.endswith("\n\n")
    data_line = payload.splitlines()[1]
    assert data_line.startswith("data: ")
    assert json.loads(data_line.removeprefix("data: ")) == {
        "stage": "analyzing",
        "step": "section_classification",
    }


def test_yield_sse_event_uses_compact_single_line_json() -> None:
    sse_events = load_sse_events()

    payload = sse_events.yield_sse_event(
        "complete",
        {"stage": "review_ready", "suggestion_count": 14},
    )

    assert payload == (
        'event: complete\n'
        'data: {"stage":"review_ready","suggestion_count":14}\n\n'
    )

from __future__ import annotations

import json
from typing import Any


def yield_sse_event(event_type: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, separators=(",", ":"))
    return f"event: {event_type}\ndata: {payload}\n\n"

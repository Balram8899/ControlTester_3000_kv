from __future__ import annotations


def capture_context_from_message(content: str) -> dict:
    lowered = content.lower()
    if any(word in lowered for word in ["weekly", "monthly", "quarterly", "daily"]):
        kind = "frequency"
    elif "owner" in lowered or "owns" in lowered:
        kind = "owner"
    elif "approve" in lowered:
        kind = "approval"
    elif "evidence" in lowered:
        kind = "evidence"
    elif "risk" in lowered:
        kind = "risk_note"
    elif "control" in lowered:
        kind = "control_note"
    else:
        kind = "other"
    return {"type": kind, "value": content, "confidence": "medium"}

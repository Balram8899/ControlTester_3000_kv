from __future__ import annotations

from typing import Any

ROLE_SYNONYMS: dict[str, tuple[str, ...]] = {
    "activity": ("activity", "process step", "task", "action", "procedure step"),
    "owner": (
        "owner",
        "responsible",
        "accountable",
        "assigned to",
        "assignee",
        "processor",
        "performer",
        "party",
        "team",
        "function",
    ),
    "approval": ("approval", "approved by", "approver", "authorized by", "authorised by", "sign off", "sign-off"),
    "due_date": ("due date", "target date", "deadline", "sla date", "required by"),
    "actual_date": ("actual date", "completion date", "completed date", "closed date", "performed date"),
    "evidence": ("evidence", "artifact", "artefact", "proof", "record", "report", "location"),
    "status": ("status", "state", "disposition"),
    "issue_id": ("issue id", "ticket id", "event id", "incident id", "case id", "action id"),
    "rationale": ("rationale", "reason", "justification", "comment", "notes"),
}

INCOMPATIBLE_ROLE_LABELS = (
    ("prepared", "approved"),
    ("preparer", "approver"),
    ("maker", "checker"),
    ("requestor", "approver"),
    ("requester", "approver"),
    ("implemented", "approved"),
    ("implementer", "approver"),
)


def classify_field_role(
    field_name: str,
    sample_values: list[str] | None = None,
) -> dict[str, Any]:
    normalized = _normalize(field_name)
    for role, hints in ROLE_SYNONYMS.items():
        if any(_hint_matches(normalized, hint) for hint in hints):
            return {
                "role": role,
                "source": "synonym",
                "confidence": _confidence_for(role, normalized, sample_values or []),
                "raw_field": field_name,
            }
    return {
        "role": "other",
        "source": "unclassified",
        "confidence": 0.0,
        "raw_field": field_name,
    }


def classify_record_fields(raw_record: dict[str, str]) -> dict[str, dict[str, Any]]:
    return {
        field_name: classify_field_role(field_name, [str(value)])
        for field_name, value in raw_record.items()
    }


def raw_record_with_roles(raw_record: dict[str, str]) -> dict[str, Any]:
    return {
        "_raw_attributes": dict(raw_record),
        "_semantic_roles": classify_record_fields(raw_record),
    }


def incompatible_role_pairs(raw_record: dict[str, str]) -> list[tuple[str, str, str]]:
    fields = list(raw_record)
    conflicts: list[tuple[str, str, str]] = []
    for left_index, left_field in enumerate(fields):
        left_value = _normalize_value(raw_record.get(left_field))
        if not left_value:
            continue
        for right_field in fields[left_index + 1 :]:
            right_value = _normalize_value(raw_record.get(right_field))
            if not right_value or left_value != right_value:
                continue
            if _fields_are_incompatible(left_field, right_field):
                conflicts.append((left_field, right_field, str(raw_record.get(left_field) or "").strip()))
    return conflicts


def _fields_are_incompatible(left_field: str, right_field: str) -> bool:
    left = _normalize(left_field)
    right = _normalize(right_field)
    for left_hint, right_hint in INCOMPATIBLE_ROLE_LABELS:
        if left_hint in left and right_hint in right:
            return True
        if left_hint in right and right_hint in left:
            return True
    return False


def _confidence_for(role: str, normalized: str, sample_values: list[str]) -> float:
    if role in {"due_date", "actual_date"} and any(_looks_date_like(value) for value in sample_values):
        return 0.95
    if role == "status" and any(str(value).strip() for value in sample_values):
        return 0.9
    if role != "other":
        return 0.85
    return 0.0


def _hint_matches(normalized: str, hint: str) -> bool:
    normalized_hint = _normalize(hint)
    return normalized == normalized_hint or normalized_hint in normalized


def _normalize(value: str) -> str:
    return " ".join(
        str(value)
        .casefold()
        .replace("/", " ")
        .replace("-", " ")
        .replace("_", " ")
        .replace("(", " ")
        .replace(")", " ")
        .split()
    )


def _normalize_value(value: Any) -> str:
    return _normalize(str(value or "")).strip()


def _looks_date_like(value: str) -> bool:
    text = str(value).strip()
    return any(char.isdigit() for char in text) and any(separator in text for separator in ("-", "/", "."))

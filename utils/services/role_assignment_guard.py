from __future__ import annotations

from utils.services.schemas import Suggestion, SuggestionEditTarget


SENIOR_ROLE_SIGNALS = {
    "board",
    "chief",
    "committee",
    "ciso",
    "ceo",
    "cfo",
    "cio",
    "coo",
    "cro",
    "cto",
    "executive",
    "management committee",
    "senior management",
    "steering committee",
}

OPERATIONAL_ACTION_SIGNALS = {
    "apply",
    "collect",
    "configure",
    "deploy",
    "execute",
    "extract",
    "fix",
    "image",
    "implement",
    "investigate",
    "patch",
    "perform",
    "provision",
    "reconcile",
    "remediate",
    "restore",
    "run",
    "sample",
    "scan",
    "test",
    "triage",
    "validate",
}


def apply_role_assignment_guard(suggestions: list[Suggestion]) -> list[Suggestion]:
    guarded: list[Suggestion] = []
    for suggestion in suggestions:
        if not suggestion.edit_targets:
            guarded.append(suggestion)
            continue
        edit_targets = [
            _guard_target(target)
            for target in suggestion.edit_targets
        ]
        guarded.append(suggestion.model_copy(update={"edit_targets": edit_targets}))
    return guarded


def _guard_target(target: SuggestionEditTarget) -> SuggestionEditTarget:
    proposed_text = str(target.proposed_text or "")
    if not (_mentions_senior_role(proposed_text) and _mentions_operational_action(proposed_text)):
        return target
    if target.target_type != "role_responsibility":
        return target.model_copy(
            update={
                "detail": (
                    (target.detail or "").strip()
                    + " Senior oversight roles should not be assigned hands-on operational execution unless explicitly supported by the source."
                ).strip(),
                "proposed_text": _oversight_safe_process_text(proposed_text),
            }
        )
    return target.model_copy(
        update={
            "target_type": "raci_matrix",
            "title": target.title or "RACI update",
            "detail": (
                (target.detail or "").strip()
                + " Senior oversight roles should be represented as Accountable, Consulted, or Informed unless the source explicitly assigns them hands-on responsibility."
            ).strip(),
            "proposed_text": _raci_text(proposed_text),
        }
    )


def _oversight_safe_process_text(source_text: str) -> str:
    senior_role = _first_senior_role_label(source_text) or "the oversight role"
    activity = _activity_fragment(source_text)
    evidence = _evidence_fragment(source_text)
    return (
        f"A responsible operational role should perform the activity: {activity}. "
        f"{senior_role} should remain accountable for oversight, escalation, approval, or challenge decisions unless the source evidence explicitly assigns hands-on execution to that role. "
        f"Retained evidence includes {evidence}."
    )


def _evidence_fragment(text: str) -> str:
    marker = "Retained evidence includes "
    if marker in str(text or ""):
        return str(text).split(marker, 1)[1].strip().rstrip(".") or "the relevant evidence"
    return "the relevant evidence"


def _raci_text(source_text: str) -> str:
    senior_role = _first_senior_role_label(source_text) or "Oversight role"
    activity = _activity_fragment(source_text)
    return (
        "Add or update the RACI matrix for this activity:\n\n"
        "| Activity / decision | Responsible | Accountable | Consulted | Informed |\n"
        "| --- | --- | --- | --- | --- |\n"
        f"| {activity} | Confirm performing operational role from source evidence | {senior_role} | Relevant specialist teams | Relevant oversight stakeholders |\n\n"
        "Do not assign hands-on operational execution to the oversight role unless the source document explicitly states that role performs the activity."
    )


def _mentions_senior_role(text: str) -> bool:
    normalized = _normalize(text)
    return any(signal in normalized for signal in SENIOR_ROLE_SIGNALS)


def _mentions_operational_action(text: str) -> bool:
    tokens = set(_normalize(text).split())
    return bool(tokens.intersection(OPERATIONAL_ACTION_SIGNALS))


def _first_senior_role_label(text: str) -> str | None:
    words = str(text or "").split()
    for index, word in enumerate(words):
        normalized = _normalize(word).strip(".,;:()[]{}")
        if normalized in {"chief", "board", "committee", "executive"}:
            start = index - 1 if index > 0 and _normalize(words[index - 1]).strip(".,;:()[]{}") in {"the", "a", "an"} else index
            end = _role_label_end(words, index + 1)
            return " ".join(words[start:end]).strip(".,;:")
    normalized_text = _normalize(text)
    for signal in ("ciso", "ceo", "cfo", "cio", "coo", "cro", "cto"):
        if signal in normalized_text:
            return signal.upper()
    return None


def _role_label_end(words: list[str], start_index: int) -> int:
    stop_tokens = {
        "approve",
        "approves",
        "are",
        "conduct",
        "conducts",
        "collect",
        "collects",
        "execute",
        "executes",
        "investigate",
        "investigates",
        "is",
        "must",
        "perform",
        "performs",
        "provide",
        "provides",
        "review",
        "reviews",
        "shall",
        "should",
        "will",
    }
    max_end = min(len(words), start_index + 4)
    for index in range(start_index, max_end):
        token = _normalize(words[index]).strip(".,;:()[]{}")
        if token in stop_tokens:
            return index
    return max_end


def _activity_fragment(text: str) -> str:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return "Activity requiring ownership"
    for prefix in ("The ", "the "):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break
    for marker in (" is responsible for ensuring that ", " performs "):
        if marker in cleaned:
            cleaned = cleaned.split(marker, 1)[1]
            break
    if ". Retained evidence" in cleaned:
        cleaned = cleaned.split(". Retained evidence", 1)[0]
    return cleaned.strip(". ")[:220] or "Activity requiring ownership"


def _normalize(text: str) -> str:
    return (
        str(text or "")
        .casefold()
        .replace("/", " ")
        .replace("-", " ")
        .replace("_", " ")
    )

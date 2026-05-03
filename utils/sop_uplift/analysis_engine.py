from __future__ import annotations

import re
from typing import Any

from utils.sop_uplift.retrieval import retrieve_context


def _looks_like_actionable_sop_text(text: str) -> bool:
    clean = " ".join(text.split())
    lower = clean.lower()
    if len(clean) < 40 or len(clean) > 1200:
        return False
    if clean.count("|") >= 3:
        return False
    if lower.startswith(("table ", "sheet ", "risk id", "control id", "document id")):
        return False
    action_terms = (
        "approve",
        "review",
        "perform",
        "verify",
        "validate",
        "retain",
        "document",
        "monitor",
        "escalate",
        "submit",
        "complete",
        "assess",
        "reconcile",
        "check",
        "confirm",
        "must",
        "shall",
        "should",
    )
    return any(term in lower for term in action_terms)


def _has_owner_context(text: str) -> bool:
    lower = text.lower()
    return any(
        term in lower
        for term in (
            "raci",
            "responsible",
            "accountable",
            "owner",
            "performer",
            "relationship manager",
            "branch operations",
            "compliance",
            "operations",
            "risk officer",
        )
    )


def _has_frequency_context(text: str) -> bool:
    lower = text.lower()
    return any(
        term in lower
        for term in (
            "daily",
            "weekly",
            "monthly",
            "quarterly",
            "annually",
            "annual",
            "frequency",
            "cadence",
            "trigger",
            "before ",
            "after ",
            "each ",
            "per ",
        )
    )


def _has_evidence_context(text: str) -> bool:
    lower = text.lower()
    return any(
        term in lower
        for term in (
            "evidence",
            "record",
            "log",
            "report",
            "ticket",
            "approval",
            "artifact",
            "repository",
            "retained",
            "stored",
            "system of record",
        )
    )


def _classify_gap(text: str, supporting_text: str = "") -> tuple[str, str, str, str] | None:
    lower = text.lower()
    missing_owner = not any(term in lower for term in ("owner", "team", "role", "analyst", "manager", "officer", "committee", "operations", "compliance"))
    missing_frequency = not any(term in lower for term in ("daily", "weekly", "monthly", "quarterly", "annually", "ad hoc", "each ", "before ", "after "))
    missing_evidence = not any(term in lower for term in ("evidence", "record", "log", "report", "ticket", "approval", "artifact", "retained", "stored"))

    if missing_owner:
        return (
            "ownership_gap",
            "Clarify accountable owner",
            "Name the accountable role or team responsible for this procedure step.",
            "Add the role or team accountable for performing and evidencing this step.",
        )
    if missing_frequency:
        return (
            "frequency_gap",
            "Clarify timing or cadence",
            "State when this step occurs or how often it must be performed.",
            "Add the trigger, deadline, or cadence for this procedure step.",
        )
    if missing_evidence:
        return (
            "evidence_gap",
            "Clarify retained evidence",
            "Identify the artifact, report, ticket, or record retained after this step.",
            "Add the evidence artifact and retention location for this procedure step.",
        )
    return None


def _context_references(query: str, context_chunks: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    references = []
    for chunk in retrieve_context(query, context_chunks, limit=limit):
        anchor_ids = chunk.get("anchor_ids") or []
        references.append(
            {
                "anchor_id": anchor_ids[0] if anchor_ids else "",
                "document_id": chunk.get("document_id", ""),
                "chunk_id": chunk.get("chunk_id", ""),
                "excerpt": " ".join(str(chunk.get("content", "")).split())[:220],
            }
        )
    return references


def _supporting_text(references: list[dict[str, Any]], context_chunks: list[dict[str, Any]]) -> str:
    excerpts = [reference.get("excerpt", "") for reference in references]
    if not excerpts and context_chunks:
        excerpts = [str(chunk.get("content", "")) for chunk in context_chunks[:3]]
    return " ".join(excerpts)


def _fallback_context_reference(context_chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not context_chunks:
        return []
    chunk = context_chunks[0]
    anchor_ids = chunk.get("anchor_ids") or []
    return [
        {
            "anchor_id": anchor_ids[0] if anchor_ids else "",
            "document_id": chunk.get("document_id", ""),
            "chunk_id": chunk.get("chunk_id", ""),
            "excerpt": " ".join(str(chunk.get("content", "")).split())[:220],
        }
    ]


def _evidence_artifact_hint(supporting_references: list[dict[str, Any]]) -> str:
    if not supporting_references:
        return ""
    excerpt = " ".join(str(supporting_references[0].get("excerpt", "")).split())
    if not excerpt:
        return ""
    if "|" in excerpt:
        flat_cells = [cell.strip() for cell in excerpt.strip().strip("|").split("|") if cell.strip()]
        for cell in reversed(flat_cells):
            if any(term in cell.lower() for term in ("evidence", "record", "approval", "ticket", "report", "log", "workflow")):
                return cell
        rows = [
            [cell.strip() for cell in row.strip().strip("|").split("|")]
            for row in excerpt.split("\n")
            if row.strip().startswith("|") and "---" not in row
        ]
        if len(rows) >= 2:
            headers = [header.lower() for header in rows[0]]
            evidence_index = next((index for index, header in enumerate(headers) if "evidence" in header), -1)
            if evidence_index >= 0:
                for row in rows[1:]:
                    if evidence_index < len(row) and row[evidence_index]:
                        return row[evidence_index]
        return ""
    match = re.search(r"([A-Z][A-Za-z /-]{2,80}\bevidence\b)", excerpt)
    if match:
        return match.group(1).strip()
    return ""


def _owner_hint(text: str, supporting_references: list[dict[str, Any]]) -> str:
    combined = " ".join([text, *[str(reference.get("excerpt", "")) for reference in supporting_references]])
    owner_patterns = [
        r"Responsible\s*[-:]\s*([A-Z][A-Za-z &/.-]+?)(?:;|,|\.|$)",
        r"Accountable\s*[-:]\s*([A-Z][A-Za-z &/.-]+?)(?:;|,|\.|$)",
        r"\b(Relationship Manager|Branch Operations|Compliance(?: Officer)?|Operations Risk|Risk Lead)\b",
    ]
    for pattern in owner_patterns:
        match = re.search(pattern, combined)
        if match:
            return " ".join(match.group(1).split())
    return "The responsible owner"


def _frequency_hint(supporting_references: list[dict[str, Any]]) -> str:
    combined = " ".join(str(reference.get("excerpt", "")) for reference in supporting_references)
    lower = combined.lower()
    for cadence in ("daily", "weekly", "monthly", "quarterly", "annually", "annual", "ad hoc"):
        if re.search(rf"\b{cadence}\b", lower):
            return "annually" if cadence == "annual" else cadence
    match = re.search(r"\b(before|after|within|by|upon|when|each|per)\b\s+([A-Za-z0-9 ,/-]{3,80})(?:\.|;|,|$)", combined, flags=re.IGNORECASE)
    if match:
        return " ".join(match.group(0).strip(" .;,").split()).lower()
    return ""


def _activity_hint(text: str) -> str:
    clean = " ".join(text.strip().rstrip(".").split())
    if not clean:
        return "complete the procedure step"
    clean = re.sub(r"^(?:the\s+)?owner\s+", "", clean, flags=re.IGNORECASE).strip() or clean
    return clean[0].lower() + clean[1:]


def _example_language(suggestion_type: str, text: str, supporting_references: list[dict[str, Any]]) -> str:
    owner = _owner_hint(text, supporting_references)
    activity = _activity_hint(text)
    if suggestion_type == "ownership_gap":
        return f"{owner} shall {activity}."
    if suggestion_type == "frequency_gap":
        frequency = _frequency_hint(supporting_references)
        if frequency:
            return f"{owner} shall {activity} {frequency}."
        return f"{owner} shall {activity} at the cadence defined in the applicable control matrix."
    if suggestion_type == "evidence_gap":
        artifact_hint = _evidence_artifact_hint(supporting_references)
        if artifact_hint:
            return f"{owner} shall retain {artifact_hint} in the onboarding case file as evidence of completion."
        return f"{owner} shall retain evidence of {activity} in the onboarding case file."
    if suggestion_type == "weak_control_description":
        return f"{owner} shall perform the control, document the review outcome, retain supporting evidence, and escalate exceptions under the applicable procedure."
    if suggestion_type == "mapping_gap":
        return f"{owner} shall map the control activity to the corresponding SOP step and retain evidence demonstrating operating effectiveness."
    return f"{owner} shall complete the procedure step and retain evidence of completion in the onboarding case file."


def mark_rule_fallback_suggestions(suggestions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**suggestion, "created_from": "rule_fallback"} for suggestion in suggestions]


def _is_low_quality_suggestion(suggestion: dict[str, Any]) -> bool:
    created_from = suggestion.get("created_from")
    generated = created_from in {"analysis", "llm", "rule_fallback"}
    suggested_text = " ".join(str(suggestion.get("suggested_text") or "").split())
    text = suggested_text or " ".join(str(suggestion.get("summary") or "").split())
    if generated and not suggested_text:
        return True
    if len(text) < 25:
        return True
    lower = text.lower()
    if text.count("|") >= 3 or "| ---" in text:
        return True
    if any(term in lower for term in ("relevant approval, report, ticket, or system record", "this should align to the supporting record:", "wealth client onboarding risk register | |")):
        return True
    advice_starts = (
        "add ",
        "clarify ",
        "update ",
        "identify ",
        "specify ",
        "name ",
        "link ",
        "strengthen ",
        "revise ",
    )
    if lower.startswith(("add details", "clarify this", "provide more detail")):
        return True
    if "clarify this item" in lower or "easier to test" in lower:
        return True
    if generated and lower.startswith(advice_starts):
        return True
    if generated and any(term in lower for term in ("use the supporting", "select the artifact", "name the specific artifact", "before the process advances", "shall the sop")):
        return True
    return False


_TOKEN_STOPWORDS = {
    "shall",
    "should",
    "must",
    "will",
    "this",
    "that",
    "with",
    "from",
    "into",
    "the",
    "and",
    "for",
    "before",
    "after",
    "process",
    "procedure",
    "evidence",
    "record",
    "review",
    "retain",
}


def _meaningful_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9/-]{3,}", text.lower())
        if token not in _TOKEN_STOPWORDS
    }


def _normal_text(value: str) -> str:
    return " ".join(value.lower().split())


def _has_source_or_anchor_grounding(
    suggested_text: str,
    *,
    concrete_terms: list[str] | None = None,
    anchor_text: str = "",
) -> bool:
    terms = [_normal_text(str(term)) for term in concrete_terms or [] if len(str(term).strip()) >= 4]
    text = _normal_text(suggested_text)
    if not terms and not anchor_text:
        return True
    if any(term and term in text for term in terms):
        return True
    anchor_overlap = _meaningful_tokens(suggested_text).intersection(_meaningful_tokens(anchor_text))
    return len(anchor_overlap) >= 2


def quality_gate_suggestions(
    suggestions: list[dict[str, Any]],
    *,
    eligible_anchor_ids: set[str] | list[str] | None = None,
    concrete_terms: list[str] | None = None,
    anchor_text_by_id: dict[str, str] | None = None,
    require_source_references: bool = False,
    max_suggestions: int | None = None,
) -> list[dict[str, Any]]:
    gated: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    eligible = set(eligible_anchor_ids or []) if eligible_anchor_ids is not None else None
    anchor_text_by_id = anchor_text_by_id or {}
    for suggestion in suggestions:
        created_from = suggestion.get("created_from")
        if suggestion.get("status") in {"accepted", "edited", "rejected"} or created_from not in {"analysis", "llm", "rule_fallback"}:
            gated.append(suggestion)
            continue
        anchor_id = str(suggestion.get("anchor_id") or "")
        if eligible is not None and anchor_id not in eligible:
            continue
        if (require_source_references or created_from == "llm") and not suggestion.get("source_references"):
            continue
        if _is_low_quality_suggestion(suggestion):
            continue
        if not _has_source_or_anchor_grounding(
            str(suggestion.get("suggested_text") or ""),
            concrete_terms=concrete_terms,
            anchor_text=anchor_text_by_id.get(anchor_id, ""),
        ):
            continue
        key = (anchor_id, str(suggestion.get("type", "")))
        if key in seen:
            continue
        seen.add(key)
        gated.append(suggestion)
        if max_suggestions is not None and len([item for item in gated if item.get("created_from") in {"analysis", "llm", "rule_fallback"}]) >= max_suggestions:
            break
    return gated


def _classify_supporting_gap(text: str) -> tuple[str, str, str, str] | None:
    clean = " ".join(text.split())
    lower = clean.lower()
    if len(clean) < 30 or len(clean) > 1600:
        return None
    table_like = clean.count("|") >= 3 or any(term in lower for term in ("control", "risk", "matrix", "register", "evidence", "owner", "frequency"))
    if not table_like:
        return None
    missing_owner = not any(term in lower for term in ("owner", "performer", "responsible", "team", "role", "accountable"))
    missing_frequency = not any(term in lower for term in ("daily", "weekly", "monthly", "quarterly", "annually", "frequency", "cadence", "per "))
    missing_evidence = not any(term in lower for term in ("evidence", "report", "ticket", "log", "record", "repository", "artifact"))
    weak_mapping = not any(term in lower for term in ("sop", "procedure", "process step", "control id", "risk id", "mapped"))
    if missing_owner:
        return ("ownership_gap", "Clarify control owner", "Name the accountable owner or team for this control or risk item.", "Add accountable ownership to the matrix row.")
    if missing_frequency:
        return ("frequency_gap", "Specify control frequency", "State how often the control is performed or when the risk review occurs.", "Add control frequency or trigger criteria.")
    if missing_evidence:
        return ("evidence_gap", "Identify control evidence", "Name the evidence retained to prove this control or risk activity operated.", "Add evidence artifact and retention location.")
    if weak_mapping:
        return ("mapping_gap", "Link to SOP step", "Connect this control or risk item to the relevant SOP section or process step.", "Add SOP/process mapping to this row.")
    if "control" in lower and len(clean.split()) < 18:
        return ("weak_control_description", "Strengthen control description", "Expand the control description so it is testable and audit-ready.", "Add owner, action, frequency, evidence, and exception criteria.")
    return None


def generate_rule_based_suggestions(
    anchors: list[dict[str, Any]],
    context_chunks: list[dict[str, Any]] | None = None,
    include_supporting_documents: bool = False,
) -> list[dict[str, Any]]:
    suggestions = []
    context_chunks = context_chunks or []
    for anchor in anchors:
        text = anchor.get("text", "")
        is_sop_candidate = _looks_like_actionable_sop_text(text)
        supporting_references = _context_references(text, context_chunks)
        supporting_text = _supporting_text(supporting_references, context_chunks)
        classified = _classify_gap(text, supporting_text) if is_sop_candidate else None
        if classified and not supporting_references and (
            _has_owner_context(supporting_text)
            or _has_frequency_context(supporting_text)
            or _has_evidence_context(supporting_text)
        ):
            supporting_references = _fallback_context_reference(context_chunks)
        if not classified and include_supporting_documents:
            classified = _classify_supporting_gap(text)
        if not text or not classified:
            continue
        suggestion_id = f"sug_{anchor.get('anchor_id')}"
        suggestion_type, title, summary, recommendation = classified
        suggested_text = _example_language(suggestion_type, text, supporting_references)
        suggestions.append(
            {
                "suggestion_id": suggestion_id,
                "type": suggestion_type,
                "severity": "medium",
                "status": "open",
                "anchor_id": anchor.get("anchor_id", ""),
                "title": title,
                "summary": summary,
                "rationale": "The item lacks enough detail for a reviewer to test ownership, timing, evidence, or mapping.",
                "impact": "Improves auditability and makes the SOP/control corpus easier to evidence.",
                "original_text": text,
                "suggested_text": suggested_text,
                "source_references": [
                    {"anchor_id": anchor.get("anchor_id", ""), "section_path": anchor.get("section_path", [])},
                    *supporting_references,
                ],
                "anchor_confidence": "high",
                "created_from": "analysis",
            }
        )
    return suggestions

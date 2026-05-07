from __future__ import annotations

from typing import Any
from uuid import uuid4

from utils.services.semantic_roles import (
    classify_record_fields,
    incompatible_role_pairs,
)
from utils.services.severity import calculate_finding_severity
from utils.services.schemas import (
    DiscoveryCandidate,
    DocumentFact,
    NormalizedFinding,
    SheetResult,
    SourceReference,
    Suggestion,
)

NA_VALUES = {"n/a", "na", "not applicable", "not-applicable"}
BLANK_VALUES = {"", "-", "tbd", "unknown", "unassigned"}


def facts_from_sheet_result(
    file_id: str,
    filename: str,
    sheet: SheetResult,
    document_role: str,
    case_id: str = "",
) -> list[DocumentFact]:
    facts: list[DocumentFact] = []
    for index, record in enumerate(sheet.records, start=1):
        raw_attributes = _raw_attributes(record)
        semantic_roles = record.get("_semantic_roles")
        if not isinstance(semantic_roles, dict):
            semantic_roles = classify_record_fields(raw_attributes)
        source = record.get("_source") if isinstance(record.get("_source"), dict) else {}
        row_index = _as_int(source.get("row_index")) or _as_int(source.get("row")) or index
        activity_name = _first_value_for_role(raw_attributes, semantic_roles, "activity")
        facts.append(
            DocumentFact(
                fact_id=f"{file_id}:{sheet.sheet_name}:{row_index}",
                case_id=case_id,
                file_id=file_id,
                source_ref=SourceReference(
                    document_id=file_id,
                    filename=filename,
                    document_role=document_role,
                    sheet_name=sheet.sheet_name,
                    row_index=row_index,
                    row_number=row_index,
                ),
                document_role=document_role,
                domain_contexts=["unknown_general"],
                entity_type="activity" if activity_name else "unknown",
                entity_name=activity_name,
                attributes={
                    "semantic_roles": semantic_roles,
                    **_role_values(raw_attributes, semantic_roles),
                },
                raw_attributes=raw_attributes,
                confidence=_record_confidence(semantic_roles),
            )
        )
    return facts


def detect_seed_findings(facts: list[DocumentFact]) -> list[NormalizedFinding]:
    findings: list[NormalizedFinding] = []
    for fact in facts:
        findings.extend(_owner_findings(fact))
        findings.extend(_explicit_na_findings(fact))
        findings.extend(_segregation_findings(fact))
    return _dedupe_findings(findings)


def route_discovery_candidates(
    candidates: list[DiscoveryCandidate],
) -> tuple[list[NormalizedFinding], list[str]]:
    findings: list[NormalizedFinding] = []
    questions: list[str] = []
    for candidate in candidates:
        if (
            candidate.should_be_suggestion
            and candidate.confidence >= 0.50
            and candidate.target_anchor_id
            and candidate.source_references
            and candidate.suggested_change
        ):
            findings.append(
                NormalizedFinding(
                    finding_id=str(uuid4()),
                    pattern="case_specific_finding",
                    pattern_bucket="case_specific",
                    detection_method="hybrid",
                    severity=candidate.severity,
                    confidence=candidate.confidence,
                    summary=candidate.summary,
                    rationale=candidate.rationale,
                    target_anchor_id=candidate.target_anchor_id,
                    source_references=candidate.source_references,
                    related_fact_ids=candidate.related_fact_ids,
                    suggested_change=candidate.suggested_change,
                    attributes={"discovered_pattern": candidate.discovered_pattern},
                )
            )
            continue
        if candidate.follow_up_question:
            questions.append(candidate.follow_up_question)
    return findings, questions


def findings_to_suggestions(findings: list[NormalizedFinding]) -> list[Suggestion]:
    return [
        Suggestion(
            suggestion_id=finding.finding_id,
            suggestion_type=_suggestion_type_for_pattern(finding.pattern),  # type: ignore[arg-type]
            severity=finding.severity,
            title=finding.summary,
            detail=finding.rationale,
            proposed_text=finding.suggested_change,
            target_anchor_id=finding.target_anchor_id,
            review_status="pending",
            source_references=finding.source_references,
            queue_finding=finding.severity in {"critical", "high"},
        )
        for finding in findings
        if finding.severity != "informational"
    ]


def _owner_findings(fact: DocumentFact) -> list[NormalizedFinding]:
    findings: list[NormalizedFinding] = []
    for field_name, value in _fields_for_roles(fact, {"owner"}):
        normalized = _normalize_value(value)
        if normalized in BLANK_VALUES:
            findings.append(
                _finding(
                    fact=fact,
                    pattern="missing_owner",
                    bucket="ownership_authorization",
                    detection_method="deterministic_field",
                    confidence=0.9,
                    impact_flags=set(),
                    summary="Activity has no accountable owner.",
                    rationale=f"The owner-like field '{field_name}' is blank.",
                    suggested_change="Identify the accountable owner for this activity.",
                    column_name=field_name,
                )
            )
    return findings


def _explicit_na_findings(fact: DocumentFact) -> list[NormalizedFinding]:
    findings: list[NormalizedFinding] = []
    has_rationale = any(
        str(value).strip()
        for _field, value in _fields_for_roles(fact, {"rationale"})
    )
    if has_rationale:
        return []
    for field_name, value in _fields_for_roles(fact, {"owner", "evidence", "approval"}):
        if _normalize_value(value) in NA_VALUES:
            findings.append(
                _finding(
                    fact=fact,
                    pattern="explicit_na_without_rationale",
                    bucket="ownership_authorization",
                    detection_method="deterministic_field",
                    confidence=0.88,
                    impact_flags=set(),
                    summary="Explicit N/A value needs rationale.",
                    rationale=f"The field '{field_name}' says N/A but no rationale or approval is present.",
                    suggested_change="Add the rationale, approver, or compensating note for the N/A value.",
                    column_name=field_name,
                )
            )
    return findings


def _segregation_findings(fact: DocumentFact) -> list[NormalizedFinding]:
    findings: list[NormalizedFinding] = []
    for left_field, right_field, owner in incompatible_role_pairs(fact.raw_attributes):
        findings.append(
            _finding(
                fact=fact,
                pattern="segregation_of_duties_conflict",
                bucket="ownership_authorization",
                detection_method="deterministic_field",
                confidence=0.93,
                impact_flags={"segregation_of_duties"},
                summary="Potential segregation of duties conflict.",
                rationale=(
                    f"The same owner '{owner}' appears in incompatible fields "
                    f"'{left_field}' and '{right_field}'."
                ),
                suggested_change="Assign independent people or teams to the incompatible roles, or document an approved compensating control.",
                column_name=left_field,
            )
        )
    return findings


def _finding(
    fact: DocumentFact,
    pattern: str,
    bucket: str,
    detection_method: str,
    confidence: float,
    impact_flags: set[str],
    summary: str,
    rationale: str,
    suggested_change: str,
    column_name: str | None = None,
) -> NormalizedFinding:
    source = fact.source_ref.model_copy(update={"column_name": column_name or fact.source_ref.column_name})
    return NormalizedFinding(
        finding_id=str(uuid4()),
        pattern=pattern,
        pattern_bucket=bucket,
        detection_method=detection_method,  # type: ignore[arg-type]
        severity=calculate_finding_severity(detection_method, confidence, impact_flags),  # type: ignore[arg-type]
        confidence=confidence,
        summary=summary,
        rationale=rationale,
        normalized_entity_name=fact.entity_name,
        source_references=[source],
        related_fact_ids=[fact.fact_id],
        suggested_change=suggested_change,
        domain_contexts=fact.domain_contexts,
    )


def _raw_attributes(record: dict[str, Any]) -> dict[str, str]:
    raw = record.get("_raw_attributes")
    if isinstance(raw, dict):
        return {str(key): "" if value is None else str(value) for key, value in raw.items()}
    return {
        str(key): "" if value is None else str(value)
        for key, value in record.items()
        if not str(key).startswith("_")
    }


def _role_values(
    raw_attributes: dict[str, str],
    semantic_roles: dict[str, Any],
) -> dict[str, Any]:
    role_values: dict[str, Any] = {}
    for field_name, metadata in semantic_roles.items():
        role = metadata.get("role") if isinstance(metadata, dict) else None
        if not role or role == "other":
            continue
        role_values.setdefault(role, raw_attributes.get(field_name, ""))
    return role_values


def _fields_for_roles(
    fact: DocumentFact,
    roles: set[str],
) -> list[tuple[str, str]]:
    semantic_roles = fact.attributes.get("semantic_roles")
    if not isinstance(semantic_roles, dict):
        return []
    fields: list[tuple[str, str]] = []
    for field_name, metadata in semantic_roles.items():
        role = metadata.get("role") if isinstance(metadata, dict) else None
        if role in roles:
            fields.append((field_name, str(fact.raw_attributes.get(field_name, ""))))
    return fields


def _first_value_for_role(
    raw_attributes: dict[str, str],
    semantic_roles: dict[str, Any],
    role_name: str,
) -> str | None:
    for field_name, metadata in semantic_roles.items():
        if isinstance(metadata, dict) and metadata.get("role") == role_name:
            value = raw_attributes.get(field_name, "").strip()
            if value:
                return value
    return None


def _record_confidence(semantic_roles: dict[str, Any]) -> float:
    confidences = [
        float(metadata.get("confidence", 0.0))
        for metadata in semantic_roles.values()
        if isinstance(metadata, dict) and metadata.get("role") != "other"
    ]
    if not confidences:
        return 0.0
    return max(confidences)


def _normalize_value(value: Any) -> str:
    return " ".join(str(value or "").casefold().strip().split())


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _suggestion_type_for_pattern(pattern: str) -> str:
    return {
        "missing_owner": "ownership_gap",
        "explicit_na_without_rationale": "process_improvement",
        "segregation_of_duties_conflict": "cross_document_conflict",
        "case_specific_finding": "process_improvement",
    }.get(pattern, "process_improvement")


def _dedupe_findings(findings: list[NormalizedFinding]) -> list[NormalizedFinding]:
    seen: set[tuple[str, str | None, int | None]] = set()
    deduped: list[NormalizedFinding] = []
    for finding in findings:
        first_ref = finding.source_references[0] if finding.source_references else None
        key = (
            finding.pattern,
            finding.normalized_entity_name,
            first_ref.row_index if first_ref else None,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(finding)
    return deduped

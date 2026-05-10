from __future__ import annotations

from collections import defaultdict
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
PROBLEM_STATUS_VALUES = {
    "breach",
    "breached",
    "delayed",
    "exception",
    "exceptions identified",
    "failed",
    "gap",
    "in progress",
    "missed",
    "needs improvement",
    "not met",
    "open",
    "overdue",
    "partially effective",
    "past due",
    "pending",
    "remediation required",
}
CLEAN_STATUS_VALUES = {
    "closed",
    "complete",
    "completed",
    "effective",
    "met",
    "no exception",
    "no exceptions",
    "resolved",
}


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


def detect_document_issue_signals(facts: list[DocumentFact]) -> list[NormalizedFinding]:
    """Detect domain-neutral issue/deviation signals from any structured document rows."""

    findings: list[NormalizedFinding] = []
    for fact in facts:
        row_patterns: set[str] = set()
        metric_findings = _metric_deviation_findings(fact)
        if metric_findings:
            row_patterns.add("metric_deviation")
            findings.extend(metric_findings)

        sla_findings = _sla_or_deadline_findings(fact)
        if sla_findings:
            row_patterns.add("sla_or_deadline_breach")
            findings.extend(sla_findings)

        if "metric_deviation" not in row_patterns and "sla_or_deadline_breach" not in row_patterns:
            findings.extend(_open_issue_findings(fact))

    findings.extend(_recurring_exception_findings(facts))
    return _dedupe_findings(_cap_findings_by_pattern(findings, per_pattern_limit=12))


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
            requires_explicit_review=finding.pattern == "open_issue_dependency",
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


def _metric_deviation_findings(fact: DocumentFact) -> list[NormalizedFinding]:
    raw = fact.raw_attributes
    target_field = _first_field_name(raw, {"target", "threshold", "expected", "required", "benchmark", "mandate"})
    actual_field = _first_field_name(raw, {"actual", "current", "observed", "reported value", "result", "attainment", "completed"})
    deviation_field = _first_field_name(raw, {"deviation", "variance", "shortfall", "delta"})
    target = str(raw.get(target_field, "")).strip() if target_field else ""
    actual = str(raw.get(actual_field, "")).strip() if actual_field else ""
    deviation = str(raw.get(deviation_field, "")).strip() if deviation_field else ""
    if not _has_metric_measurement_context(raw, target_field, actual_field, deviation_field, target, actual, deviation):
        return []
    if not ((target and actual) or deviation):
        return []
    if not (_has_problem_status(raw) or _looks_material_deviation(target, actual, deviation)):
        return []

    entity = _entity_name_for_fact(fact)
    values = _compact_values(
        {
            "target": target,
            "actual": actual,
            "deviation": deviation,
            "status": _first_field_value(raw, {"status", "state", "disposition"}),
            "owner": _first_field_value(raw, {"owner", "responsible", "accountable", "assigned", "team"}),
        }
    )
    return [
        _signal_finding(
            fact=fact,
            pattern="metric_deviation",
            bucket="evidence_currency",
            detection_method="deterministic_structural",
            confidence=0.89,
            impact_flags=_impact_flags_for_fact(fact, extra={"material_process_break"} if _looks_material_deviation(target, actual, deviation) else set()),
            summary=f"Metric or target deviation needs procedure coverage: {entity}.",
            rationale=f"The source row records a material deviation for {entity}: {values}.",
            suggested_change=(
                f"Update the procedure to define how deviations for {entity} are identified, "
                "thresholded, escalated, remediated, and evidenced, including the owner and timeframe."
            ),
            entity_name=entity,
            column_name=deviation_field or actual_field,
        )
    ]


def _sla_or_deadline_findings(fact: DocumentFact) -> list[NormalizedFinding]:
    raw = fact.raw_attributes
    breach_field = _first_field_name(raw, {"sla", "deadline", "due", "breach", "overdue", "late", "target date"})
    if not breach_field:
        return []
    breach_value = raw.get(breach_field, "")
    status_value = _first_field_value(raw, {"status", "state", "disposition"})
    if not (_value_is_problematic(breach_value) or _value_is_problematic(status_value)):
        return []

    entity = _entity_name_for_fact(fact)
    return [
        _signal_finding(
            fact=fact,
            pattern="sla_or_deadline_breach",
            bucket="evidence_currency",
            detection_method="deterministic_structural",
            confidence=0.9,
            impact_flags=_impact_flags_for_fact(fact, extra={"deadline", "sla"}),
            summary=f"SLA or deadline breach requires procedure response: {entity}.",
            rationale=(
                f"The source row indicates a deadline/SLA concern in '{breach_field}' "
                f"with value '{breach_value or status_value}'."
            ),
            suggested_change=(
                f"Update the procedure to define escalation, remediation ownership, due-date tracking, "
                f"and retained evidence when {entity} misses a required SLA or deadline."
            ),
            entity_name=entity,
            column_name=breach_field,
        )
    ]


def _open_issue_findings(fact: DocumentFact) -> list[NormalizedFinding]:
    raw = fact.raw_attributes
    if not _has_problem_status(raw):
        return []
    issue_text = _issue_text_for_row(raw)
    if not issue_text:
        return []

    entity = _entity_name_for_fact(fact)
    return [
        _signal_finding(
            fact=fact,
            pattern="open_issue_dependency",
            bucket="procedure_completeness",
            detection_method="deterministic_structural",
            confidence=0.84,
            impact_flags=_impact_flags_for_fact(fact),
            summary=f"Open issue should be reflected in the procedure: {entity}.",
            rationale=f"The source row is open or unresolved and describes: {issue_text}.",
            suggested_change=(
                f"Update the procedure to address the open issue for {entity}, including owner, "
                "resolution criteria, escalation path, due date or review cadence, and retained evidence."
            ),
            entity_name=entity,
            column_name=_first_field_name(
                raw,
                {"finding", "observation", "exception", "issue", "gap", "root cause", "recommendation", "action"},
            ),
        )
    ]


def _recurring_exception_findings(facts: list[DocumentFact]) -> list[NormalizedFinding]:
    grouped: dict[str, list[DocumentFact]] = defaultdict(list)
    for fact in facts:
        if not _has_problem_status(fact.raw_attributes):
            continue
        key = _recurrence_key(fact)
        if key:
            grouped[key].append(fact)

    findings: list[NormalizedFinding] = []
    for key, group in grouped.items():
        if len(group) < 3:
            continue
        first = group[0]
        refs = [
            item.source_ref.model_copy(update={"excerpt": _record_excerpt(item.raw_attributes)})
            for item in group[:5]
        ]
        findings.append(
            NormalizedFinding(
                finding_id=str(uuid4()),
                pattern="recurring_exception",
                pattern_bucket="evidence_currency",
                detection_method="deterministic_structural",
                severity=calculate_finding_severity(
                    "deterministic_structural",
                    0.91,
                    _impact_flags_for_fact(first, extra={"repeated_exception"}),
                ),  # type: ignore[arg-type]
                confidence=0.91,
                summary=f"Recurring exception pattern: {key}.",
                rationale=f"The same category appears in {len(group)} unresolved source rows.",
                normalized_entity_name=key,
                source_references=refs,
                related_fact_ids=[item.fact_id for item in group[:5]],
                suggested_change=(
                    f"Add or update a monitoring and root-cause remediation step for recurring {key} "
                    "exceptions, including trigger threshold, accountable owner, escalation timing, "
                    "and evidence retained."
                ),
                domain_contexts=first.domain_contexts,
                attributes={"occurrence_count": len(group)},
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


def _signal_finding(
    fact: DocumentFact,
    pattern: str,
    bucket: str,
    detection_method: str,
    confidence: float,
    impact_flags: set[str],
    summary: str,
    rationale: str,
    suggested_change: str,
    entity_name: str,
    column_name: str | None = None,
) -> NormalizedFinding:
    source = fact.source_ref.model_copy(
        update={
            "column_name": column_name or fact.source_ref.column_name,
            "excerpt": _record_excerpt(fact.raw_attributes),
        }
    )
    return NormalizedFinding(
        finding_id=str(uuid4()),
        pattern=pattern,
        pattern_bucket=bucket,
        detection_method=detection_method,  # type: ignore[arg-type]
        severity=calculate_finding_severity(detection_method, confidence, impact_flags),  # type: ignore[arg-type]
        confidence=confidence,
        summary=summary,
        rationale=rationale,
        normalized_entity_name=entity_name,
        source_references=[source],
        related_fact_ids=[fact.fact_id],
        suggested_change=suggested_change,
        domain_contexts=fact.domain_contexts,
        attributes={"source_row": fact.source_ref.row_index},
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


def _entity_name_for_fact(fact: DocumentFact) -> str:
    metric_name = _first_field_value(
        fact.raw_attributes,
        {"metric", "measure", "indicator", "kpi"},
    )
    if metric_name:
        return metric_name
    if fact.entity_name:
        return fact.entity_name
    value = _first_field_value(
        fact.raw_attributes,
        {
            "activity",
            "category",
            "control",
            "event",
            "issue",
            "metric",
            "name",
            "process",
            "requirement",
            "risk",
            "title",
        },
    )
    return value or "source row"


def _first_field_name(raw_attributes: dict[str, str], hints: set[str]) -> str | None:
    normalized_hints = {_normalize_value(hint) for hint in hints}
    for field_name in raw_attributes:
        normalized = _normalize_value(field_name)
        if any(hint == normalized or hint in normalized for hint in normalized_hints):
            return field_name
    return None


def _first_field_value(raw_attributes: dict[str, str], hints: set[str]) -> str:
    field_name = _first_field_name(raw_attributes, hints)
    if not field_name:
        return ""
    return str(raw_attributes.get(field_name) or "").strip()


def _has_metric_measurement_context(
    raw_attributes: dict[str, str],
    target_field: str | None,
    actual_field: str | None,
    deviation_field: str | None,
    target: str,
    actual: str,
    deviation: str,
) -> bool:
    if _first_field_name(raw_attributes, {"metric", "measure", "indicator", "kpi"}):
        return True
    trigger_value = _first_field_value(raw_attributes, {"trigger type", "event type", "type", "category"})
    if "metric" in _normalize_value(trigger_value) or "kpi" in _normalize_value(trigger_value):
        return True
    if target_field and actual_field:
        field_text = _normalize_value(f"{target_field} {actual_field}")
        if any(token in field_text for token in ("date", "due", "deadline", "sla")):
            return False
        return _first_number(target) is not None or _first_number(actual) is not None
    if deviation_field and deviation:
        row_fields = _normalize_value(" ".join(raw_attributes.keys()))
        has_measurement_field = any(
            token in row_fields
            for token in ("metric", "measure", "indicator", "kpi", "target", "threshold", "actual", "current", "observed", "reported value")
        )
        return has_measurement_field and (_contains_signed_or_percent_number(deviation) or _value_is_problematic(deviation))
    return False


def _has_problem_status(raw_attributes: dict[str, str]) -> bool:
    status = _first_field_value(raw_attributes, {"status", "state", "disposition", "result"})
    if status and _value_is_clean(status):
        return False
    if status and _value_is_problematic(status):
        return True
    return any(_value_is_problematic(value) for value in raw_attributes.values())


def _value_is_problematic(value: Any) -> bool:
    normalized = _normalize_value(value)
    if not normalized or _value_is_clean(normalized):
        return False
    return any(problem in normalized for problem in PROBLEM_STATUS_VALUES)


def _value_is_clean(value: Any) -> bool:
    normalized = _normalize_value(value)
    if normalized in CLEAN_STATUS_VALUES:
        return True
    if "no exceptions" in normalized or "no exception" in normalized:
        return True
    return normalized.startswith(("closed", "complete", "completed", "effective", "resolved"))


def _looks_material_deviation(target: str, actual: str, deviation: str) -> bool:
    if deviation and (_contains_signed_or_percent_number(deviation) or _value_is_problematic(deviation)):
        return True
    target_number = _first_number(target)
    actual_number = _first_number(actual)
    if target_number is None or actual_number is None:
        return False
    if target_number == 0:
        return actual_number != 0
    return abs(target_number - actual_number) / abs(target_number) >= 0.10


def _contains_signed_or_percent_number(value: str) -> bool:
    text = str(value or "")
    return any(char.isdigit() for char in text) and ("%" in text or "+" in text or "-" in text)


def _first_number(value: str) -> float | None:
    token = ""
    for char in str(value or ""):
        if char.isdigit() or char in {".", "-"}:
            token += char
        elif token:
            break
    if not token or token in {"-", "."}:
        return None
    try:
        return float(token)
    except ValueError:
        return None


def _impact_flags_for_fact(fact: DocumentFact, extra: set[str] | None = None) -> set[str]:
    text = _normalize_value(" ".join([*fact.raw_attributes.keys(), *fact.raw_attributes.values()]))
    flags = set(extra or set())
    if any(token in text for token in ("regulatory", "compliance", "mandate", "required", "law", "policy")):
        flags.add("regulatory")
    if any(token in text for token in ("customer", "client", "consumer")):
        flags.add("customer_impact")
    if any(token in text for token in ("evidence", "record", "retention", "audit")):
        flags.add("evidence")
    if any(token in text for token in ("recovery", "rollback", "restore")):
        flags.add("recovery")
    return flags


def _recurrence_key(fact: DocumentFact) -> str:
    return _first_field_value(
        fact.raw_attributes,
        {"event type", "issue category", "category", "root cause", "risk category", "exception type"},
    )


def _issue_text_for_row(raw_attributes: dict[str, str]) -> str:
    hints = {"finding", "observation", "exception", "issue", "gap", "root cause", "recommendation", "action"}
    parts: list[str] = []
    for field_name, value in raw_attributes.items():
        if not value:
            continue
        normalized = _normalize_value(field_name)
        if any(hint == normalized or hint in normalized for hint in hints):
            parts.append(f"{field_name}: {value}")
        if len(parts) >= 3:
            break
    return "; ".join(parts)


def _record_excerpt(raw_attributes: dict[str, str]) -> str:
    parts = []
    for key, value in raw_attributes.items():
        if value:
            parts.append(f"{key}: {value}")
        if len(parts) >= 4:
            break
    return "; ".join(parts)


def _compact_values(values: dict[str, str]) -> str:
    return "; ".join(f"{key}: {value}" for key, value in values.items() if value)


def _cap_findings_by_pattern(
    findings: list[NormalizedFinding],
    per_pattern_limit: int,
) -> list[NormalizedFinding]:
    counts: dict[str, int] = {}
    capped: list[NormalizedFinding] = []
    for finding in findings:
        count = counts.get(finding.pattern, 0)
        if count >= per_pattern_limit:
            continue
        counts[finding.pattern] = count + 1
        capped.append(finding)
    return capped


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
        "metric_deviation": "process_improvement",
        "open_issue_dependency": "process_improvement",
        "recurring_exception": "process_improvement",
        "sla_or_deadline_breach": "process_improvement",
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

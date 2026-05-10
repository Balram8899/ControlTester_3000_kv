from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

from utils.services.schemas import (
    Anchor,
    ConversionResult,
    ExcelPipelineResult,
    SourceReference,
    Suggestion,
    SuggestionEditTarget,
)


CLASSIFICATION_RE = re.compile(
    r"\b(p[0-9]|priority|severity|critical|high|medium|low|material|non[- ]?material|tier)\b",
    re.IGNORECASE,
)


def structural_completeness_suggestions(
    conversions: list[ConversionResult],
    anchor_index: dict[str, Anchor],
    process_steps: list[dict[str, Any]],
    excel_results: list[ExcelPipelineResult],
) -> list[Suggestion]:
    """Infer missing SOP structures from document signals across domains and formats."""

    procedure_file_ids = _primary_procedure_file_ids(conversions)
    anchors = [anchor for anchor in anchor_index.values() if anchor.file_id in procedure_file_ids]
    if not anchors:
        return []
    context = _DocumentStructureContext(
        anchors=anchors,
        process_steps=process_steps,
        excel_results=excel_results,
        filenames_by_file_id=_filenames_by_file_id(conversions),
    )
    suggestions: list[Suggestion] = []
    checks = [
        _missing_raci_matrix,
        _undefined_classification_schema,
        _missing_escalation_matrix,
        _missing_post_event_review,
        _missing_response_playbook_matrix,
        _missing_evidence_preservation_requirements,
        _missing_oversight_reporting_matrix,
        _missing_document_control,
        _missing_regulatory_calendar,
        _missing_metric_owner_matrix,
        _missing_risk_appetite_linkage,
        _missing_category_coverage_matrix,
    ]
    for check in checks:
        suggestion = check(context)
        if suggestion:
            suggestions.append(suggestion)
    return suggestions


class _DocumentStructureContext:
    def __init__(
        self,
        anchors: list[Anchor],
        process_steps: list[dict[str, Any]],
        excel_results: list[ExcelPipelineResult],
        filenames_by_file_id: dict[str, str],
    ) -> None:
        self.anchors = anchors
        self.process_steps = process_steps
        self.excel_results = excel_results
        self.filenames_by_file_id = filenames_by_file_id
        self.text = _normalize_text(
            "\n".join(f"{anchor.heading}\n{anchor.content}" for anchor in anchors)
        )
        self.primary_anchor = _best_primary_anchor(anchors)
        self.responsibility_anchor = _best_anchor_matching(
            anchors,
            {"role", "roles", "responsibility", "responsibilities", "accountability", "owner", "raci"},
        )
        self.has_supporting_evidence = any(
            result.facts
            or (
                result.corpus_map
                and (
                    result.corpus_map.risk_to_control_map
                    or result.corpus_map.evidence_to_control_map
                    or result.corpus_map.sop_to_control_map
                    or result.corpus_map.general_relationships
                )
            )
            for result in excel_results
        )
        self.has_substantial_process_context = (
            len(self.text) >= 700
            or len(anchors) >= 3
            or len(process_steps) >= 3
            or self.has_supporting_evidence
        )

    def source_reference(self, anchor: Anchor | None = None) -> SourceReference:
        target = anchor or self.primary_anchor
        return SourceReference(
            document_id=target.file_id,
            filename=self.filenames_by_file_id.get(target.file_id),
            anchor_id=target.anchor_id,
            section_heading=target.heading or target.section_path,
        )


def _missing_raci_matrix(context: _DocumentStructureContext) -> Suggestion | None:
    actors = {
        _normalize_role(str(step.get("actor") or ""))
        for step in context.process_steps
        if str(step.get("actor") or "").strip()
    }
    actors.discard("")
    role_signal = len(actors) >= 3 or _count_role_like_sentences(context.text) >= 3
    has_raci = "raci" in context.text or all(
        token in context.text for token in ("responsible", "accountable", "consulted", "informed")
    )
    if not role_signal or has_raci:
        return None
    anchor = context.responsibility_anchor or context.primary_anchor
    proposed = (
        "Add an accountability matrix for material activities:\n\n"
        "| Activity / decision | Responsible | Accountable | Consulted | Informed |\n"
        "| --- | --- | --- | --- | --- |\n"
        "| Key process activity | Performing team or role | Outcome owner | Specialist contributors | Oversight or impacted stakeholders |\n\n"
        "Populate the matrix from the uploaded procedure and supporting evidence. Where the responsible owner is not explicit, mark it for reviewer confirmation instead of assigning it to an oversight role."
    )
    return _suggestion(
        title="Add an accountability matrix for multi-role activities",
        detail="The procedure involves multiple roles and hand-offs but does not define Responsible, Accountable, Consulted, and Informed ownership.",
        proposed_text=proposed,
        target_type="raci_matrix",
        target_anchor=anchor,
        context=context,
        severity="high",
    )


def _undefined_classification_schema(context: _DocumentStructureContext) -> Suggestion | None:
    matches = {match.group(0).casefold() for match in CLASSIFICATION_RE.finditer(context.text)}
    p_level = any(re.fullmatch(r"p[0-9]", item) for item in matches)
    has_level_set = len(matches.intersection({"critical", "high", "medium", "low"})) >= 2
    has_materiality = any("material" in item for item in matches)
    has_signal = p_level or has_level_set or has_materiality
    has_definition = any(
        token in context.text
        for token in (
            "classification criteria",
            "severity matrix",
            "priority matrix",
            "materiality threshold",
            "classification schema",
            "priority criteria",
        )
    )
    if not has_signal or has_definition:
        return None
    proposed = (
        "Add a classification criteria matrix:\n\n"
        "| Level / category | Criteria | Required response | Escalation trigger | Evidence retained |\n"
        "| --- | --- | --- | --- | --- |\n"
        "| Level to be defined | Objective threshold or indicator | Required action | Time or severity trigger | Decision and action evidence |\n\n"
        "Use the level names already present in the uploaded documents and define objective criteria for each level."
    )
    return _suggestion(
        title="Define classification criteria for referenced levels",
        detail="The documents reference levels or categories, but the procedure does not define the objective criteria used to classify them.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=context.primary_anchor,
        context=context,
        severity="high",
    )


def _missing_escalation_matrix(context: _DocumentStructureContext) -> Suggestion | None:
    has_escalation_signal = any(token in context.text for token in ("escalat", "notify", "approval", "approved"))
    has_vague_timing = any(
        token in context.text
        for token in ("promptly", "as appropriate", "timely", "periodic", "significant", "where required")
    )
    has_matrix = "escalation matrix" in context.text or "escalation timeframe" in context.text
    if not (has_escalation_signal and has_vague_timing) or has_matrix:
        return None
    proposed = (
        "Add an escalation matrix:\n\n"
        "| Trigger | Responsible owner | Escalation recipient | Timeframe | Evidence retained |\n"
        "| --- | --- | --- | --- | --- |\n"
        "| Trigger to be defined | Performing role | Accountable or oversight role | Defined SLA | Notification and decision record |\n\n"
        "Replace vague timing terms with measurable thresholds and timeframes."
    )
    return _suggestion(
        title="Define escalation triggers and timeframes",
        detail="The procedure uses escalation or notification language with vague timing, which makes execution and testing inconsistent.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=context.primary_anchor,
        context=context,
        severity="high",
    )


def _missing_post_event_review(context: _DocumentStructureContext) -> Suggestion | None:
    has_event_lifecycle = any(
        token in context.text
        for token in ("incident", "event", "deviation", "exception", "complaint", "remediation", "recovery")
    )
    has_review = any(
        token in context.text
        for token in ("post incident", "post-event", "lessons learned", "closure review", "after action", "root cause review")
    )
    if not has_event_lifecycle or has_review:
        return None
    proposed = (
        "Add a post-event review / closure section covering trigger, required participants, timeline, root-cause review, corrective actions, evidence retained, and sign-off before closure."
    )
    return _suggestion(
        title="Add a post-event review and closure control",
        detail="The procedure describes events or remediation but does not define a structured closure review to confirm root cause, lessons learned, and action completion.",
        proposed_text=proposed,
        target_type="procedure_step",
        target_anchor=context.primary_anchor,
        context=context,
        severity="medium",
    )


def _missing_response_playbook_matrix(context: _DocumentStructureContext) -> Suggestion | None:
    has_response_context = any(
        token in context.text
        for token in ("response", "respond", "triage", "remediate", "recover", "investigate", "handle")
    )
    has_variant_signal = any(
        token in context.text
        for token in (
            "event type",
            "event category",
            "event categories",
            "incident type",
            "incident category",
            "case type",
            "exception type",
            "scenario",
            "scenarios",
        )
    )
    has_playbook = any(
        token in context.text
        for token in (
            "playbook",
            "runbook",
            "response matrix",
            "scenario matrix",
            "scenario-specific",
            "type-specific",
        )
    )
    if not (has_response_context and has_variant_signal) or has_playbook:
        return None
    anchor = _best_anchor_matching(
        context.anchors,
        {"response", "triage", "event", "incident", "exception", "scenario", "category"},
    ) or context.primary_anchor
    proposed = (
        "Add a response playbook matrix for material event types:\n\n"
        "| Event / scenario type | Minimum response steps | Required owner | Specialist support | Escalation trigger | Evidence retained |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| Type to be defined from source documents | Required action sequence | Responsible role | Consulted specialist or function | Defined threshold or condition | Records needed for review and testing |\n\n"
        "Use the source documents to list only event types or scenarios that are relevant to the process, and mark unclear ownership or specialist support for reviewer confirmation."
    )
    return _suggestion(
        title="Add a response playbook matrix for material event types",
        detail="The procedure references different event or scenario types, but it does not define type-specific response steps, owners, support roles, escalation triggers, and retained evidence.",
        proposed_text=proposed,
        target_type="procedure_step",
        target_anchor=anchor,
        context=context,
        severity="medium",
    )


def _missing_evidence_preservation_requirements(context: _DocumentStructureContext) -> Suggestion | None:
    combined = f"{context.text} {_supporting_text(context.excel_results)}"
    has_evidence_signal = any(
        token in combined
        for token in ("evidence", "artifact", "artefact", "log", "record", "screenshot", "file", "supporting document")
    )
    has_review_or_event_signal = any(
        token in combined
        for token in ("investigation", "investigate", "incident", "event", "exception", "deviation", "complaint", "case")
    )
    has_preservation_control = any(
        token in context.text
        for token in (
            "chain of custody",
            "chain-of-custody",
            "preservation",
            "integrity control",
            "tamper",
            "hash",
            "evidence handling",
            "custodian",
        )
    )
    if not (has_evidence_signal and has_review_or_event_signal) or has_preservation_control:
        return None
    anchor = _best_anchor_matching(
        context.anchors,
        {"evidence", "artifact", "artefact", "record", "log", "investigation", "exception"},
    ) or context.primary_anchor
    proposed = (
        "Define evidence preservation and chain-of-custody requirements:\n\n"
        "| Evidence type | Preservation action | Custodian | Integrity control | Retention location | Review / transfer record |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| Evidence from source documents | How it is captured and protected | Responsible role | Integrity control such as access restriction, timestamp, or validation | Repository or record location | Chain-of-custody or hand-off evidence |\n\n"
        "Apply these requirements to evidence used for investigation, exception handling, remediation, validation, or oversight review."
    )
    return _suggestion(
        title="Define evidence preservation and chain-of-custody requirements",
        detail="The documents refer to collecting or retaining evidence, but the procedure does not define preservation, custody, integrity, retention location, and transfer records.",
        proposed_text=proposed,
        target_type="evidence_requirement",
        target_anchor=anchor,
        context=context,
        severity="high",
    )


def _missing_oversight_reporting_matrix(context: _DocumentStructureContext) -> Suggestion | None:
    has_forum_signal = any(
        token in context.text
        for token in ("committee", "board", "steering", "forum", "governance", "oversight")
    )
    has_reporting_signal = any(
        token in context.text
        for token in ("report", "reported", "update", "status", "submit", "present", "escalat")
    )
    has_reporting_matrix = any(
        token in context.text
        for token in (
            "oversight reporting matrix",
            "committee reporting matrix",
            "board reporting matrix",
            "reporting matrix",
            "governance calendar",
        )
    )
    if not (has_forum_signal and has_reporting_signal) or has_reporting_matrix:
        return None
    anchor = _best_anchor_matching(
        context.anchors,
        {"committee", "board", "steering", "forum", "governance", "oversight", "reporting"},
    ) or context.primary_anchor
    proposed = (
        "Add an oversight reporting matrix:\n\n"
        "| Recipient / forum | Reported matter | Owner | Cadence / trigger | Minimum content | Evidence retained |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| Oversight forum from source documents | Metric, exception, decision, or status item | Reporting owner | Defined frequency or trigger | Required data points and decisions | Pack, minutes, submission, or approval evidence |\n\n"
        "Use the matrix to replace vague references to reporting as appropriate with specific recipients, timing, content, and evidence."
    )
    return _suggestion(
        title="Add an oversight reporting matrix",
        detail="The procedure references reporting to oversight forums, but it does not define the recipient, cadence or trigger, minimum content, owner, and retained evidence.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=anchor,
        context=context,
        severity="high",
    )


def _missing_document_control(context: _DocumentStructureContext) -> Suggestion | None:
    if not context.has_substantial_process_context:
        return None
    has_document_control = all(
        token in context.text
        for token in ("version", "review", "owner")
    ) and any(token in context.text for token in ("effective date", "next review", "review date"))
    if has_document_control:
        return None
    proposed = (
        "Add document control information including document owner, version, effective date, last review date, next review date, approver, and change summary."
    )
    return _suggestion(
        title="Add document control metadata",
        detail="The procedure does not clearly define document ownership, versioning, and review cadence.",
        proposed_text=proposed,
        target_type="document_metadata",
        target_anchor=context.primary_anchor,
        context=context,
        severity="medium",
    )


def _missing_regulatory_calendar(context: _DocumentStructureContext) -> Suggestion | None:
    evidence_text = _supporting_text(context.excel_results)
    combined = f"{context.text} {evidence_text}"
    has_obligation_signal = any(
        token in combined
        for token in ("regulatory", "regulation", "law", "act", "standard", "framework", "notification", "reporting obligation")
    )
    has_calendar = any(
        token in context.text
        for token in ("regulatory calendar", "notification schedule", "reporting calendar", "submission deadline")
    )
    if not has_obligation_signal or has_calendar:
        return None
    proposed = (
        "Add an obligation calendar:\n\n"
        "| Obligation / reference | Trigger | Owner | Deadline / timeframe | Submission or notification evidence |\n"
        "| --- | --- | --- | --- | --- |\n"
        "| Reference from supporting documents | Trigger condition | Responsible owner | Defined date or elapsed time | Filing, notification, or approval record |\n\n"
        "Populate the table from the regulatory, framework, standard, or contractual references present in the uploaded source documents."
    )
    return _suggestion(
        title="Add an obligation calendar for external or internal requirements",
        detail="Supporting documents reference obligations or frameworks, but the procedure does not define a structured calendar of triggers, owners, deadlines, and evidence.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=context.primary_anchor,
        context=context,
        severity="high",
    )


def _missing_metric_owner_matrix(context: _DocumentStructureContext) -> Suggestion | None:
    evidence_text = _supporting_text(context.excel_results)
    combined = f"{context.text} {evidence_text}"
    has_metric_signal = any(
        token in combined
        for token in ("metric", "kpi", "target", "threshold", "actual", "current value", "reported value")
    )
    has_matrix = all(token in context.text for token in ("owner", "source")) and any(
        token in context.text for token in ("validator", "validation", "frequency", "deadline")
    )
    if not has_metric_signal or has_matrix:
        return None
    proposed = (
        "Add a metric ownership and validation matrix:\n\n"
        "| Metric / data element | Data owner | Source system | Submission frequency | Validator / approver | Deadline | Evidence retained |\n"
        "| --- | --- | --- | --- | --- | --- | --- |\n"
        "| Metric from source documents | Accountable data provider | System or record source | Cadence | Independent validator | Due date | Submission and sign-off evidence |"
    )
    return _suggestion(
        title="Add a metric ownership and validation matrix",
        detail="Supporting documents contain metrics, targets, or thresholds, but the procedure does not define owners, source systems, validation, deadlines, and retained evidence for each data element.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=context.primary_anchor,
        context=context,
        severity="high",
    )


def _missing_category_coverage_matrix(context: _DocumentStructureContext) -> Suggestion | None:
    evidence_text = _supporting_text(context.excel_results)
    combined = f"{context.text} {evidence_text}"
    has_category_signal = any(
        token in combined
        for token in (
            "category",
            "categories",
            "scope 1",
            "scope 2",
            "scope 3",
            "population",
            "portfolio",
            "product line",
            "business unit",
        )
    )
    has_coverage_signal = any(
        token in combined
        for token in ("coverage", "coverage universe", "in-scope", "in scope", "out-of-scope", "out of scope", "universe")
    )
    has_coverage_matrix = any(
        token in context.text
        for token in (
            "category coverage matrix",
            "coverage matrix",
            "coverage universe",
            "population coverage",
            "in-scope category",
            "in scope category",
        )
    )
    if not (has_category_signal and has_coverage_signal) or has_coverage_matrix:
        return None
    anchor = _best_anchor_matching(
        context.anchors,
        {"category", "categories", "scope", "population", "coverage", "metric", "reporting"},
    ) or context.primary_anchor
    proposed = (
        "Add a category coverage matrix:\n\n"
        "| Category / population | Inclusion decision | Source document or system | Owner | Reporting / control requirement | Evidence retained |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| Category from source documents | Included, excluded, or not applicable | Authoritative source | Accountable owner | Required treatment or reporting obligation | Evidence supporting the decision |\n\n"
        "Use the matrix to reconcile the full category or population universe from supporting documents with what the procedure says is in scope."
    )
    return _suggestion(
        title="Add a category coverage matrix",
        detail="The source documents reference categories, populations, or scopes, but the procedure does not reconcile the full coverage universe with inclusion decisions, owners, requirements, and evidence.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=anchor,
        context=context,
        severity="medium",
    )


def _missing_risk_appetite_linkage(context: _DocumentStructureContext) -> Suggestion | None:
    evidence_text = _supporting_text(context.excel_results)
    combined = f"{context.text} {evidence_text}"
    has_risk_signal = "risk" in combined and any(token in combined for token in ("metric", "target", "threshold", "tolerance", "breach"))
    has_appetite = any(token in context.text for token in ("risk appetite", "risk tolerance", "appetite statement", "tolerance limit"))
    if not has_risk_signal or has_appetite:
        return None
    proposed = (
        "Link material metrics, thresholds, or control exceptions to the applicable risk appetite or tolerance statement, including breach triggers, escalation owner, and evidence retained."
    )
    return _suggestion(
        title="Link thresholds and exceptions to risk appetite",
        detail="The documents contain risk and threshold signals, but the procedure does not explain how breaches map to appetite, tolerance, or management action.",
        proposed_text=proposed,
        target_type="monitoring_reporting",
        target_anchor=context.primary_anchor,
        context=context,
        severity="medium",
    )


def _suggestion(
    title: str,
    detail: str,
    proposed_text: str,
    target_type: str,
    target_anchor: Anchor,
    context: _DocumentStructureContext,
    severity: str,
) -> Suggestion:
    suggestion_id = str(uuid4())
    source_ref = context.source_reference(target_anchor)
    return Suggestion(
        suggestion_id=suggestion_id,
        suggestion_type="process_improvement",
        severity=severity,  # type: ignore[arg-type]
        title=title,
        detail=detail,
        proposed_text=proposed_text,
        target_anchor_id=target_anchor.anchor_id,
        review_status="pending",
        source_references=[source_ref],
        edit_targets=[
            SuggestionEditTarget(
                target_id=f"{suggestion_id}:structure",
                target_type=target_type,  # type: ignore[arg-type]
                title=title,
                detail=detail,
                proposed_text=proposed_text,
                target_anchor_id=target_anchor.anchor_id,
                target_text=target_anchor.content,
                source_references=[source_ref],
            )
        ],
        queue_finding=severity in {"critical", "high"},
        requires_explicit_review=True,
    )


def _primary_procedure_file_ids(conversions: list[ConversionResult]) -> set[str]:
    preferred = {
        str(conversion.file_id)
        for conversion in conversions
        if conversion.file_id and str(conversion.tag or "").lower() in {"procedure", "process_doc", "policy"}
    }
    if preferred:
        return preferred
    return {
        str(conversion.file_id)
        for conversion in conversions
        if conversion.file_id and conversion.file_type != "xlsx"
    }


def _filenames_by_file_id(conversions: list[ConversionResult]) -> dict[str, str]:
    return {
        str(conversion.file_id): str(conversion.filename or conversion.file_id or "")
        for conversion in conversions
        if conversion.file_id
    }


def _best_primary_anchor(anchors: list[Anchor]) -> Anchor:
    for anchor in anchors:
        text = _normalize_text(f"{anchor.heading} {anchor.section_path}")
        if any(token in text for token in ("procedure", "process", "operation", "workflow")):
            return anchor
    return anchors[0]


def _best_anchor_matching(anchors: list[Anchor], tokens: set[str]) -> Anchor | None:
    for anchor in anchors:
        text = _normalize_text(f"{anchor.heading} {anchor.section_path} {anchor.content}")
        if any(token in text for token in tokens):
            return anchor
    return None


def _count_role_like_sentences(text: str) -> int:
    role_tokens = {"owner", "team", "manager", "lead", "officer", "committee", "function", "department"}
    verb_tokens = {"approve", "review", "perform", "execute", "own", "monitor", "escalate", "validate", "submit"}
    sentences = re.split(r"[.\n;]+", text)
    count = 0
    for sentence in sentences:
        tokens = set(sentence.split())
        if tokens.intersection(role_tokens) and tokens.intersection(verb_tokens):
            count += 1
    return count


def _supporting_text(excel_results: list[ExcelPipelineResult]) -> str:
    parts: list[str] = []
    for result in excel_results:
        if result.corpus_map:
            for rows in (
                result.corpus_map.risk_to_control_map,
                result.corpus_map.evidence_to_control_map,
                result.corpus_map.sop_to_control_map,
                result.corpus_map.general_relationships,
            ):
                for row in rows[:20]:
                    parts.append(" ".join(str(value) for value in row.values() if value))
        for fact in result.facts[:30]:
            parts.append(" ".join(str(value) for value in fact.raw_attributes.values() if value))
    return _normalize_text(" ".join(parts))


def _normalize_role(value: str) -> str:
    return " ".join(value.casefold().strip().split())


def _normalize_text(value: str) -> str:
    return (
        str(value or "")
        .casefold()
        .replace("_", " ")
        .replace("/", " ")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )

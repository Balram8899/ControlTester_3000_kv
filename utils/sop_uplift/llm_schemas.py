from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Severity = Literal["low", "medium", "high", "critical"]
Confidence = Literal["high", "medium", "low"]
SuggestionType = Literal[
    "clarity",
    "ownership_gap",
    "frequency_gap",
    "evidence_gap",
    "control_alignment",
    "missing_control",
    "risk_gap",
    "process_gap",
    "policy_alignment",
    "testability_gap",
    "mapping_gap",
    "weak_control_description",
    "diagram_gap",
    "chat_context",
]


def _compact_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in (
            "message",
            "warning",
            "description",
            "summary",
            "name",
            "role",
            "role_name",
            "label",
            "title",
            "text",
            "value",
            "id",
            "role_id",
        ):
            text = str(value.get(key) or "").strip()
            if text:
                return text
        return json.dumps(value, ensure_ascii=True, default=str)
    return str(value)


def _compact_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [text for text in (_compact_string(item).strip() for item in value) if text]
    text = _compact_string(value).strip()
    return [text] if text else []


class LlmResponseModel(BaseModel):
    @field_validator("warnings", mode="before", check_fields=False)
    @classmethod
    def normalize_warnings(cls, value: Any) -> Any:
        return _compact_string_list(value)


class PolicyRequirement(BaseModel):
    requirement_id: str = ""
    text: str = ""
    source_anchor_id: str = ""
    source_anchor_ids: list[str] = Field(default_factory=list)
    quality_warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def normalize_requirement_text(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if str(data.get("text") or "").strip():
            return data
        for key in (
            "requirement_text",
            "requirement",
            "requirement_statement",
            "statement",
            "description",
            "content",
            "regulatory_text",
            "regulatory_requirement",
        ):
            value = str(data.get(key) or "").strip()
            if value:
                return {**data, "text": value}
        warnings = list(data.get("quality_warnings") or [])
        if "Requirement text missing from LLM extraction." not in warnings:
            warnings.append("Requirement text missing from LLM extraction.")
        return {**data, "text": "", "quality_warnings": warnings}


class PolicyRequirementExtractionResponse(LlmResponseModel):
    requirements: list[PolicyRequirement] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DocumentTaggingResponse(LlmResponseModel):
    suggested_tag: str = "supporting_material"
    confidence: Confidence = "medium"
    rationale: str = ""
    warnings: list[str] = Field(default_factory=list)


class ExtractionPlanResponse(LlmResponseModel):
    extractors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SopStructureExtractionResponse(LlmResponseModel):
    sections: list[dict[str, Any]] = Field(default_factory=list)
    process_steps: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RiskControlMatrixExtractionResponse(LlmResponseModel):
    controls: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RiskRegisterExtractionResponse(LlmResponseModel):
    risks: list[dict[str, Any]] = Field(default_factory=list)
    risk_events: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ControlInventoryExtractionResponse(LlmResponseModel):
    controls: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class EvidenceExtractionResponse(LlmResponseModel):
    evidence_items: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class IssueFindingExtractionResponse(LlmResponseModel):
    findings: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DiagramReferenceExtractionResponse(LlmResponseModel):
    diagram_summary: str = ""
    lanes_or_roles: list[str] = Field(default_factory=list)
    steps: list[dict[str, Any] | str] = Field(default_factory=list)
    decisions: list[dict[str, Any] | str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    controls: list[dict[str, Any] | str] = Field(default_factory=list)
    risks: list[dict[str, Any] | str] = Field(default_factory=list)
    evidence_points: list[dict[str, Any] | str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("lanes_or_roles", "systems", mode="before")
    @classmethod
    def normalize_string_items(cls, value: Any) -> Any:
        return _compact_string_list(value)


class FullDocumentExtractionResponse(LlmResponseModel):
    sections: list[dict[str, Any]] = Field(default_factory=list)
    process_steps: list[dict[str, Any]] = Field(default_factory=list)
    requirements: list[PolicyRequirement] = Field(default_factory=list)
    controls: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[dict[str, Any]] = Field(default_factory=list)
    risk_events: list[dict[str, Any]] = Field(default_factory=list)
    evidence_items: list[dict[str, Any]] = Field(default_factory=list)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    diagram_summary: str = ""
    lanes_or_roles: list[str] = Field(default_factory=list)
    steps: list[dict[str, Any] | str] = Field(default_factory=list)
    decisions: list[dict[str, Any] | str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    diagram_controls: list[dict[str, Any] | str] = Field(default_factory=list)
    diagram_risks: list[dict[str, Any] | str] = Field(default_factory=list)
    evidence_points: list[dict[str, Any] | str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("lanes_or_roles", "systems", mode="before")
    @classmethod
    def normalize_string_items(cls, value: Any) -> Any:
        return _compact_string_list(value)


class CaseChatContextExtractionResponse(LlmResponseModel):
    captured_context: list[dict[str, Any]] = Field(default_factory=list)
    agent_follow_up_questions: list[dict[str, Any] | str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CorpusMapResponse(LlmResponseModel):
    primary_process: str = ""
    processes_identified: list[str] = Field(default_factory=list)
    actors: list[str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    risk_to_control_map: list[dict[str, Any]] = Field(default_factory=list)
    sop_to_control_map: list[dict[str, Any]] = Field(default_factory=list)
    sop_to_risk_map: list[dict[str, Any]] = Field(default_factory=list)
    evidence_to_control_map: list[dict[str, Any]] = Field(default_factory=list)
    chat_context_to_sop_map: list[dict[str, Any]] = Field(default_factory=list)
    coverage_gaps: list[dict[str, Any] | str] = Field(default_factory=list)
    conflicts_or_inconsistencies: list[dict[str, Any] | str] = Field(default_factory=list)
    low_confidence_items: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("low_confidence_items", mode="before")
    @classmethod
    def normalize_low_confidence_items(cls, value: Any) -> Any:
        if value is None:
            return []
        items = value if isinstance(value, list) else [value]
        return [item if isinstance(item, dict) else {"message": _compact_string(item)} for item in items]


class ReadinessExplanationResponse(BaseModel):
    headline: str = ""
    message: str = ""
    available_analysis_modes: list[str] = Field(default_factory=list)
    recommended_next_uploads: list[str] = Field(default_factory=list)
    warnings_to_show: list[str] = Field(default_factory=list)


class SopSuggestion(BaseModel):
    suggestion_id: str = ""
    type: SuggestionType = "testability_gap"
    severity: Severity = "medium"
    anchor_id: str = ""
    title: str = "SOP uplift suggestion"
    summary: str = ""
    rationale: str = ""
    impact: str = ""
    original_text: str = ""
    suggested_text: str = ""
    style_match_notes: str = ""
    source_references: list[dict[str, Any]] = Field(default_factory=list)
    anchor_confidence: Confidence = "medium"


class SopSuggestionResponse(LlmResponseModel):
    suggestions: list[SopSuggestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class MissingControlRecommendationsResponse(LlmResponseModel):
    missing_control_recommendations: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DuplicateConflictMergeResponse(LlmResponseModel):
    duplicate_groups: list[dict[str, Any]] = Field(default_factory=list)
    conflicting_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AgentFollowUpQuestionsResponse(BaseModel):
    questions: list[dict[str, Any]] = Field(default_factory=list)


class DiagramMetaSchema(BaseModel):
    process_owner: str = ""
    version: str = "1.0"
    effective_date: str = ""
    review_date: str = ""
    document_id: str = ""


class DiagramLaneSchema(BaseModel):
    lane_id: str
    name: str
    order: int = 1


class DiagramNodeSchema(BaseModel):
    node_id: str
    lane_id: str
    type: str = "activity"
    shape: str = "process"
    label: str = ""
    description: str = ""
    column: int = 0
    badge: str = ""
    source_anchor_ids: list[str] = Field(default_factory=list)
    linked_control_ids: list[str] = Field(default_factory=list)
    linked_risk_ids: list[str] = Field(default_factory=list)


class DiagramEdgeSchema(BaseModel):
    edge_id: str
    from_node_id: str
    to_node_id: str
    label: str = ""


class RewriteAcceptedSectionResponse(BaseModel):
    anchor_id: str = ""
    rewritten_text: str = ""
    applied_suggestion_ids: list[str] = Field(default_factory=list)
    not_applied_suggestion_ids: list[str] = Field(default_factory=list)
    rewrite_notes: list[str] = Field(default_factory=list)


class SwimlaneDiagramModelResponse(LlmResponseModel):
    title: str = ""
    meta: DiagramMetaSchema = Field(default_factory=DiagramMetaSchema)
    lanes: list[DiagramLaneSchema] = Field(default_factory=list)
    nodes: list[DiagramNodeSchema] = Field(default_factory=list)
    edges: list[DiagramEdgeSchema] = Field(default_factory=list)
    control_summary: list[dict[str, Any]] = Field(default_factory=list)
    risk_summary: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class FinalSummaryResponse(BaseModel):
    executive_summary: str = ""
    accepted_change_summary: list[str] = Field(default_factory=list)
    edited_change_summary: list[str] = Field(default_factory=list)
    rejected_change_summary: list[str] = Field(default_factory=list)
    risk_and_control_impact: list[str] = Field(default_factory=list)
    case_chat_context_summary: list[str] = Field(default_factory=list)
    open_items: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

    @field_validator(
        "accepted_change_summary",
        "edited_change_summary",
        "rejected_change_summary",
        "risk_and_control_impact",
        "case_chat_context_summary",
        "open_items",
        "limitations",
        mode="before",
    )
    @classmethod
    def normalize_string_list_fields(cls, value: Any) -> Any:
        return _compact_string_list(value)


class CaseFinalizationResponse(LlmResponseModel):
    missing_control_recommendations: list[dict[str, Any]] = Field(default_factory=list)
    duplicate_groups: list[dict[str, Any]] = Field(default_factory=list)
    conflicting_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    diagram_model: dict[str, Any] = Field(default_factory=dict)
    final_summary: FinalSummaryResponse = Field(default_factory=FinalSummaryResponse)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("diagram_model", mode="before")
    @classmethod
    def normalize_diagram_model(cls, value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, BaseModel):
            return value.model_dump()
        return value

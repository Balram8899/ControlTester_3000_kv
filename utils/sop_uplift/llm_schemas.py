from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


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
    "diagram_gap",
    "chat_context",
]


class PolicyRequirement(BaseModel):
    requirement_id: str = ""
    text: str
    source_anchor_id: str = ""
    source_anchor_ids: list[str] = Field(default_factory=list)
    quality_warnings: list[str] = Field(default_factory=list)


class PolicyRequirementExtractionResponse(BaseModel):
    requirements: list[PolicyRequirement] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DocumentTaggingResponse(BaseModel):
    suggested_tag: str = "supporting_material"
    confidence: Confidence = "medium"
    rationale: str = ""
    warnings: list[str] = Field(default_factory=list)


class ExtractionPlanResponse(BaseModel):
    extractors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SopStructureExtractionResponse(BaseModel):
    sections: list[dict[str, Any]] = Field(default_factory=list)
    process_steps: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RiskControlMatrixExtractionResponse(BaseModel):
    controls: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RiskRegisterExtractionResponse(BaseModel):
    risks: list[dict[str, Any]] = Field(default_factory=list)
    risk_events: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ControlInventoryExtractionResponse(BaseModel):
    controls: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class EvidenceExtractionResponse(BaseModel):
    evidence_items: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class IssueFindingExtractionResponse(BaseModel):
    findings: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DiagramReferenceExtractionResponse(BaseModel):
    diagram_summary: str = ""
    lanes_or_roles: list[str] = Field(default_factory=list)
    steps: list[dict[str, Any] | str] = Field(default_factory=list)
    decisions: list[dict[str, Any] | str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    controls: list[dict[str, Any] | str] = Field(default_factory=list)
    risks: list[dict[str, Any] | str] = Field(default_factory=list)
    evidence_points: list[dict[str, Any] | str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CaseChatContextExtractionResponse(BaseModel):
    captured_context: list[dict[str, Any]] = Field(default_factory=list)
    agent_follow_up_questions: list[dict[str, Any] | str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CorpusMapResponse(BaseModel):
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
    source_references: list[dict[str, Any]] = Field(default_factory=list)
    anchor_confidence: Confidence = "medium"


class SopSuggestionResponse(BaseModel):
    suggestions: list[SopSuggestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class MissingControlRecommendationsResponse(BaseModel):
    missing_control_recommendations: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DuplicateConflictMergeResponse(BaseModel):
    duplicate_groups: list[dict[str, Any]] = Field(default_factory=list)
    conflicting_suggestions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AgentFollowUpQuestionsResponse(BaseModel):
    questions: list[dict[str, Any]] = Field(default_factory=list)


class RewriteAcceptedSectionResponse(BaseModel):
    anchor_id: str = ""
    rewritten_text: str = ""
    applied_suggestion_ids: list[str] = Field(default_factory=list)
    not_applied_suggestion_ids: list[str] = Field(default_factory=list)
    rewrite_notes: list[str] = Field(default_factory=list)


class SwimlaneDiagramModelResponse(BaseModel):
    title: str = ""
    lanes: list[dict[str, Any]] = Field(default_factory=list)
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
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

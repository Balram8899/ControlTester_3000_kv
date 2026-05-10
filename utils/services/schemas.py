from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# --- Document identity ---

DocumentTag = Literal[
    "rcm",
    "policy",
    "procedure",
    "process_doc",
    "risk_data",
    "evidence",
]

FileType = Literal["docx", "pdf", "xlsx", "txt", "unknown"]

PipelineStatus = Literal["success", "partial", "failed", "budget_exceeded"]
DocumentStatus = Literal["success", "partial", "failed", "skipped"]


# --- Base result (error convention) ---

class ServiceResult(BaseModel):
    """Base for all service outputs. status='failed' means error is set."""

    status: PipelineStatus
    error: Optional[str] = None


# --- Conversion outputs ---

class StyleProfile(BaseModel):
    """Visual style extracted from an existing SOP Word document."""

    heading1_font: Optional[str] = None
    heading2_font: Optional[str] = None
    body_font: Optional[str] = None
    primary_colour_hex: Optional[str] = None
    secondary_colour_hex: Optional[str] = None
    margin_top_cm: Optional[float] = None
    margin_bottom_cm: Optional[float] = None
    margin_left_cm: Optional[float] = None
    margin_right_cm: Optional[float] = None
    table_border_style: Optional[str] = None


class ConversionResult(ServiceResult):
    file_id: Optional[str] = None
    filename: Optional[str] = None
    file_type: Optional[FileType] = None
    tag: Optional[DocumentTag] = None
    markdown: str = ""
    page_count: int = 0
    looks_corrupt: bool = False
    style_profile: Optional[StyleProfile] = None


# --- Chunking outputs ---

SectionType = Literal[
    "procedural",
    "definitions",
    "document_history",
    "purpose_scope",
    "references",
    "appendix",
    "unknown",
]


class Anchor(BaseModel):
    anchor_id: str
    file_id: str
    section_path: str
    heading: str
    content: str
    char_count: int
    page_estimate: int
    section_type: SectionType = "unknown"


class Chunk(BaseModel):
    chunk_id: str
    anchor_id: str
    file_id: str
    content: str
    char_count: int


class ChunkResult(ServiceResult):
    file_id: Optional[str] = None
    anchors: list[Anchor] = Field(default_factory=list)
    chunks: list[Chunk] = Field(default_factory=list)


# --- LLM orchestration ---

class LLMCallRecord(BaseModel):
    call_id: str
    pipeline_id: str
    schema_name: str
    prompt_chars: int
    input_tokens: int
    output_tokens: int
    duration_ms: int
    timestamp: str
    status: PipelineStatus
    error: Optional[str] = None


class LLMResult(ServiceResult):
    call_id: Optional[str] = None
    output: Optional[dict] = None
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0
    call_record: Optional[LLMCallRecord] = None


class CostSummary(BaseModel):
    """Stored in case document after pipeline completes. Shown in UI cost badge."""

    provider: str
    model: str
    call_count: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    is_local_provider: bool
    call_records: list[LLMCallRecord]


# --- Excel pipeline outputs ---

ColumnRole = Literal[
    "control_id",
    "risk_id",
    "description",
    "owner",
    "frequency",
    "evidence_artifact",
    "system",
    "status",
    "other",
]

SeverityLevel = Literal["critical", "high", "medium", "low", "informational"]
DetectionMethod = Literal[
    "deterministic_field",
    "deterministic_structural",
    "cross_document_rule",
    "llm_inference",
    "hybrid",
]
EntityType = Literal[
    "activity",
    "approval",
    "asset",
    "control",
    "date",
    "evidence",
    "exception",
    "issue",
    "obligation",
    "owner",
    "process_step",
    "requirement",
    "risk",
    "system",
    "third_party",
    "unknown",
]


class ColumnClassification(BaseModel):
    column_name: str
    column_index: int
    classified_as: ColumnRole
    confidence: float


class RowGap(BaseModel):
    row_index: int
    missing_columns: list[str]
    gap_type: Literal[
        "ownership_gap",
        "frequency_gap",
        "evidence_gap",
        "mapping_gap",
        "other",
    ]


class SheetResult(BaseModel):
    sheet_name: str
    row_count: int
    schema: list[ColumnClassification]
    gaps: list[RowGap]
    records: list[dict]
    status: Literal[
        "complete",
        "partial",
        "skipped_budget",
        "failed",
        "too_small",
    ] = "complete"
    error: Optional[str] = None


class CorpusMapContribution(BaseModel):
    risk_to_control_map: list[dict] = Field(default_factory=list)
    sop_to_control_map: list[dict] = Field(default_factory=list)
    evidence_to_control_map: list[dict] = Field(default_factory=list)
    general_relationships: list[dict] = Field(default_factory=list)
    finding_summary: dict[str, Any] = Field(default_factory=dict)


class ExcelPipelineResult(ServiceResult):
    file_id: Optional[str] = None
    sheets: list[SheetResult] = Field(default_factory=list)
    total_rows_assessed: int = 0
    total_gaps_found: int = 0
    corpus_map: Optional[CorpusMapContribution] = None
    suggestions: list[Suggestion] = Field(default_factory=list)
    facts: list[DocumentFact] = Field(default_factory=list)


# --- Analysis outputs ---

class SourceReference(BaseModel):
    document_id: str
    filename: Optional[str] = None
    document_role: Optional[str] = None
    anchor_id: Optional[str] = None
    section_id: Optional[str] = None
    section_heading: Optional[str] = None
    page: Optional[int] = None
    sheet_name: Optional[str] = None
    row_index: Optional[int] = None
    row_number: Optional[int] = None
    column_name: Optional[str] = None
    excerpt: Optional[str] = None


class DocumentFact(BaseModel):
    fact_id: str
    case_id: str
    file_id: str
    source_ref: SourceReference
    document_role: str
    domain_contexts: list[str] = Field(default_factory=list)
    entity_type: EntityType = "unknown"
    entity_name: Optional[str] = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    raw_attributes: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0


class NormalizedFinding(BaseModel):
    finding_id: str
    pattern: str
    pattern_bucket: Optional[str] = None
    detection_method: DetectionMethod
    severity: SeverityLevel
    confidence: float
    summary: str
    rationale: str
    target_anchor_id: Optional[str] = None
    normalized_entity_name: Optional[str] = None
    source_references: list[SourceReference]
    related_fact_ids: list[str] = Field(default_factory=list)
    suggested_change: str
    domain_contexts: list[str] = Field(default_factory=list)
    thresholds_used: dict[str, Any] = Field(default_factory=dict)
    attributes: dict[str, Any] = Field(default_factory=dict)


class DiscoveryCandidate(BaseModel):
    discovered_pattern: str
    summary: str
    rationale: str
    suggested_change: Optional[str] = None
    target_anchor_id: Optional[str] = None
    source_references: list[SourceReference]
    related_fact_ids: list[str] = Field(default_factory=list)
    confidence: float
    severity: SeverityLevel
    should_be_suggestion: bool
    follow_up_question: Optional[str] = None


class ExtractedItem(BaseModel):
    item_id: str
    item_type: Literal[
        "control",
        "risk",
        "requirement",
        "process_step",
        "evidence_ref",
    ]
    text: str
    source_references: list[SourceReference]


SuggestionReviewStatus = Literal["pending", "accepted", "rejected", "edited"]

SuggestionTargetType = Literal[
    "procedure_step",
    "role_responsibility",
    "raci_matrix",
    "evidence_requirement",
    "monitoring_reporting",
    "document_metadata",
    "other",
]


class SuggestionEditTarget(BaseModel):
    target_id: str
    target_type: SuggestionTargetType
    title: Optional[str] = None
    detail: Optional[str] = None
    proposed_text: str
    original_text: Optional[str] = None
    target_anchor_id: Optional[str] = None
    target_text: Optional[str] = None
    target_heading: Optional[str] = None
    review_status: Optional[SuggestionReviewStatus] = None
    edited_proposed_text: Optional[str] = None
    source_references: list[SourceReference] = Field(default_factory=list)


class Suggestion(BaseModel):
    suggestion_id: str
    suggestion_type: Literal[
        "missing_process_step",
        "ownership_clarification",
        "ownership_conflict",
        "ownership_gap",
        "evidence_requirement",
        "evidence_gap",
        "frequency_gap",
        "cross_document_conflict",
        "mapping_gap",
        "staleness_flag",
        "scope_improvement",
        "terminology_inconsistency",
        "regulatory_alignment",
        "process_improvement",
    ]
    severity: SeverityLevel
    title: str
    detail: str
    proposed_text: Optional[str] = None
    original_text: Optional[str] = None
    target_anchor_id: Optional[str] = None
    review_status: SuggestionReviewStatus = "pending"
    edited_proposed_text: Optional[str] = None
    reviewer_notes: Optional[str] = None
    source_references: list[SourceReference]
    edit_targets: list[SuggestionEditTarget] = Field(default_factory=list)
    queue_finding: bool = False
    requires_explicit_review: bool = False


class CaseStatus(BaseModel):
    """Tracks pipeline stage. Stored in case document."""

    stage: Literal[
        "uploading",
        "converting",
        "analyzing",
        "review_ready",
        "generating_outputs",
        "complete",
        "failed",
        "partial",
    ]
    stage1_cost: Optional[CostSummary] = None
    final_cost: Optional[CostSummary] = None


class OutputGenerationResult(ServiceResult):
    """Return type of output_generator.generate_outputs(). Produced at end of Stage 2."""

    case_id: Optional[str] = None
    docx_file_id: Optional[str] = None
    diagram_png_file_id: Optional[str] = None
    diagram_pdf_file_id: Optional[str] = None
    sections_rewritten: int = 0
    swimlane_spec: Optional[SwimlaneSpec] = None
    stage2_cost: Optional[CostSummary] = None
    warnings: list[str] = Field(default_factory=list)


# --- Swimlane diagram ---

class SwimlaneLane(BaseModel):
    lane_id: str
    label: str
    colour_hex: str


class SwimlaneStep(BaseModel):
    step_id: str
    lane_id: str
    label: str
    step_type: Literal["action", "decision", "start", "end"]
    next_steps: list[str]
    branch_labels: dict[str, str] = Field(default_factory=dict)


class SwimlaneSpec(BaseModel):
    """Structured representation of the swimlane, produced by LLM, rendered by Python."""

    title: str
    process_owner: str = ""
    document_name: str = ""
    lanes: list[SwimlaneLane]
    steps: list[SwimlaneStep]


# --- Case document (stored in document_uplift_cases collection) ---

class DocumentTagEntry(BaseModel):
    """One uploaded file attached to a case."""

    file_id: str
    filename: str
    tag: DocumentTag
    conversion_status: DocumentStatus = "success"
    looks_corrupt: bool = False
    page_count: int = 0
    error: str | None = None


class OutputItem(BaseModel):
    """One generated output file stored in GridFS."""

    output_id: str
    output_type: Literal["docx", "png_diagram", "pdf_diagram"]
    filename: str
    output_mode: Literal["track_changes", "standalone"] = "track_changes"


class StageCounter(BaseModel):
    """Tracks completion of a pipeline stage across documents/chunks."""

    total: int = 0
    completed: int = 0
    failed: int = 0
    pending: int = 0


class ProcessingState(BaseModel):
    """Stored in case document. Updated by the pipeline orchestrator after each unit."""

    conversion: StageCounter = Field(default_factory=StageCounter)
    analysis: StageCounter = Field(default_factory=StageCounter)
    pipeline_status: PipelineStatus = "success"
    pipeline_error: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)


class CaseReadiness(BaseModel):
    """Computed before run-pipeline is allowed. Stored in case document."""

    has_procedure: bool = False
    has_any_document: bool = False
    ready: bool = False
    blocking_reasons: list[str] = Field(default_factory=list)


class DocumentUpliftCase(BaseModel):
    """
    Primary case document stored in document_uplift_cases MongoDB collection.
    Target size: < 150KB. Heavy content (markdown, anchors, chunks) lives in
    separate collections. Binary outputs live in GridFS.
    """

    case_id: str
    title: str
    process_name: Optional[str] = None
    domain_label: Optional[str] = None
    notes: Optional[str] = None
    status: CaseStatus = Field(default_factory=lambda: CaseStatus(stage="uploading"))
    document_tags: list[DocumentTagEntry] = Field(default_factory=list)
    suggestions: list[Suggestion] = Field(default_factory=list)
    corpus_map: Optional[CorpusMapContribution] = None
    processing_state: ProcessingState = Field(default_factory=ProcessingState)
    readiness: CaseReadiness = Field(default_factory=CaseReadiness)
    outputs: list[OutputItem] = Field(default_factory=list)
    agent_follow_up_questions: list[str] = Field(default_factory=list)
    final_summary: Optional[str] = None
    schema_version: int = 2
    created_at: str = ""
    updated_at: str = ""


class AnalysisResult(ServiceResult):
    case_id: Optional[str] = None
    extracted_controls: list[ExtractedItem] = Field(default_factory=list)
    extracted_risks: list[ExtractedItem] = Field(default_factory=list)
    extracted_requirements: list[ExtractedItem] = Field(default_factory=list)
    process_steps: list[dict] = Field(default_factory=list)
    suggestions: list[Suggestion] = Field(default_factory=list)
    terminology: list[dict] = Field(default_factory=list)
    corpus_map: Optional[CorpusMapContribution] = None
    agent_follow_up_questions: list[str] = Field(default_factory=list)
    llm_calls_used: int = 0


ExcelPipelineResult.model_rebuild()
OutputGenerationResult.model_rebuild()

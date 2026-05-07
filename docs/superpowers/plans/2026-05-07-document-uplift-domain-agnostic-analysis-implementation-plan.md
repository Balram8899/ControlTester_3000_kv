# Document Uplift Domain-Agnostic Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the Checkpoint C remediation that makes Document Uplift analysis domain-agnostic while preserving the original service architecture and feature independence.

**Architecture:** Add a normalized fact/finding layer inside the existing `utils/services` package, keep heavy facts out of `document_uplift_cases`, and map high-confidence findings into existing suggestion review flows. The seed pattern registry is configurable/discovery-based, not a hardcoded checklist.

**Tech Stack:** FastAPI, MongoDB/GridFS, Pydantic, pytest, React/TypeScript source guards.

---

## Implementation Status

Completed on 2026-05-07 as a Checkpoint C remediation addendum before Item 32 of the original plan. The final overall architecture document is deferred until the original plan, including remaining human gates and infrastructure items, is complete.

---

## File Structure

- `docs/document-uplift-severity-calculation.md` - standalone severity/confidence reference.
- `docs/document-uplift-architecture.md` - final architecture/components/processes/bands reference after the original Document Uplift plan is complete; deferred per human instruction.
- `utils/services/schemas.py` - add severity/confidence/document fact/finding/discovery models and backward-compatible corpus map fields.
- `utils/services/severity.py` - deterministic confidence band and severity calculation helpers.
- `utils/services/semantic_roles.py` - semantic field-role classifier using configurable synonyms plus raw preservation.
- `utils/services/generic_findings.py` - fact generation, seed finding detection, discovery routing, and finding-to-suggestion mapping.
- `utils/services/excel_pipeline.py` - preserve raw row attributes and semantic role metadata in structured records.
- `utils/services/analysis.py` - merge generic findings and follow-up questions into Stage 1 results.
- `utils/sop_processing/case_store.py` - persist large `document_uplift_facts` outside the case document.
- `utils/sop_processing/pipeline.py` - store facts, merge finding summaries, and keep follow-up questions out of suggestions.
- `kpmg_ui/client/src/pages/document-uplift.tsx` - support expanded severity display without breaking existing high/medium/low.
- Tests under `tests/services/`, `tests/sop_processing/`, and source guards under `kpmg_ui/client/src/`.

---

### Task 1: Severity Reference and Helper

**Files:**
- Created: `docs/document-uplift-severity-calculation.md`
- Create: `tests/services/test_severity.py`
- Create: `utils/services/severity.py`

- [x] **Step 1: Write failing tests**

Create `tests/services/test_severity.py` with tests for confidence bands, detection defaults, impact escalation, and low-confidence guardrails.

- [x] **Step 2: Run red test**

Run: `python -m pytest tests\services\test_severity.py -v`  
Expected: fail because `utils.services.severity` does not exist.

- [x] **Step 3: Implement severity helpers**

Create `utils/services/severity.py` with:

```python
CONFIDENCE_HIGH = 0.80
CONFIDENCE_MEDIUM = 0.50

def confidence_band(score: float) -> str: ...
def default_severity_for_detection(method: str) -> str: ...
def calculate_finding_severity(detection_method: str, confidence: float, impact_flags: set[str] | None = None) -> str: ...
```

- [x] **Step 4: Run green test**

Run: `python -m pytest tests\services\test_severity.py -v`  
Expected: pass.

---

### Task 2: Schema Extensions

**Files:**
- Modify: `tests/services/test_schemas.py`
- Modify: `utils/services/schemas.py`

- [x] **Step 1: Write failing schema tests**

Add coverage for `SeverityLevel`, `DetectionMethod`, `EntityType`, `SourceReference` optional fields, `DocumentFact`, `NormalizedFinding`, `DiscoveryCandidate`, `CorpusMapContribution.general_relationships`, and `finding_summary`.

- [x] **Step 2: Run red tests**

Run: `python -m pytest tests\services\test_schemas.py -v`  
Expected: fail on missing models/fields.

- [x] **Step 3: Implement schema models**

Add the models while keeping existing fields backward-compatible. Expand `Suggestion.severity` to include `critical` and `informational`.

- [x] **Step 4: Run green tests**

Run: `python -m pytest tests\services\test_schemas.py -v`  
Expected: pass.

---

### Task 3: Semantic Role Classifier

**Files:**
- Create: `tests/services/test_semantic_roles.py`
- Create: `utils/services/semantic_roles.py`

- [x] **Step 1: Write failing tests**

Cover owner synonyms (`processor`, `performer`, `accountable party`), approval synonyms, evidence/date/status roles, incompatible role-pair detection, and raw unknown preservation.

- [x] **Step 2: Run red tests**

Run: `python -m pytest tests\services\test_semantic_roles.py -v`  
Expected: fail because module does not exist.

- [x] **Step 3: Implement classifier**

Create a deterministic classifier with configurable synonym sets and helpers:

```python
def classify_field_role(field_name: str, sample_values: list[str] | None = None) -> dict: ...
def classify_record_fields(raw_record: dict[str, str]) -> dict[str, dict]: ...
def raw_record_with_roles(raw_record: dict[str, str]) -> dict: ...
```

- [x] **Step 4: Run green tests**

Run: `python -m pytest tests\services\test_semantic_roles.py -v`  
Expected: pass.

---

### Task 4: Generic Findings Service

**Files:**
- Create: `tests/services/test_generic_findings.py`
- Create: `utils/services/generic_findings.py`

- [x] **Step 1: Write failing tests**

Cover TC-13, TC-19, TC-20, TC-21, and TC-22 at service level.

- [x] **Step 2: Run red tests**

Run: `python -m pytest tests\services\test_generic_findings.py -v`  
Expected: fail because module does not exist.

- [x] **Step 3: Implement fact and finding logic**

Implement:

```python
def facts_from_sheet_result(file_id: str, filename: str, sheet: SheetResult, document_role: str) -> list[DocumentFact]: ...
def detect_seed_findings(facts: list[DocumentFact]) -> list[NormalizedFinding]: ...
def route_discovery_candidates(candidates: list[DiscoveryCandidate]) -> tuple[list[NormalizedFinding], list[str]]: ...
def findings_to_suggestions(findings: list[NormalizedFinding]) -> list[Suggestion]: ...
```

- [x] **Step 4: Run green tests**

Run: `python -m pytest tests\services\test_generic_findings.py -v`  
Expected: pass.

---

### Task 5: Excel Pipeline Integration

**Files:**
- Modify: `tests/services/test_excel_pipeline.py`
- Modify: `utils/services/excel_pipeline.py`

- [x] **Step 1: Write failing integration tests**

Add tests that generic columns preserve raw attributes and that non-RCM owner/evidence/date/status rows can emit generic findings without requiring `control_id` or `risk_id`.

- [x] **Step 2: Run red tests**

Run: `python -m pytest tests\services\test_excel_pipeline.py -v`  
Expected: fail until raw record preservation/generic finding integration exists.

- [x] **Step 3: Implement integration**

Preserve `_raw_attributes`, `_semantic_roles`, and `_source` in every structured record. Add `DocumentFact` output to `ExcelPipelineResult` and include generic suggestions from normalized findings.

- [x] **Step 4: Run green tests**

Run: `python -m pytest tests\services\test_excel_pipeline.py tests\services\test_generic_findings.py -v`  
Expected: pass.

---

### Task 6: Persistence and Pipeline Integration

**Files:**
- Modify: `tests/test_document_uplift_pipeline.py`
- Modify: `utils/sop_processing/case_store.py`
- Modify: `utils/sop_processing/pipeline.py`
- Modify: `utils/services/analysis.py`

- [x] **Step 1: Write failing tests**

Add pipeline tests for fact persistence outside the case document, `agent_follow_up_questions` routing, and finding summaries in `corpus_map`.

- [x] **Step 2: Run red tests**

Run: `python -m pytest tests\test_document_uplift_pipeline.py -v`  
Expected: fail until facts/follow-ups are wired.

- [x] **Step 3: Implement case store fact persistence**

Add `document_uplift_facts` collection, memory fallback, `save_case_facts()`, and `get_case_facts()`.

- [x] **Step 4: Implement pipeline wiring**

Store detailed facts outside the case document. Merge generic findings into suggestions only when routed as suggestions. Store low-confidence ambiguity as `agent_follow_up_questions`.

- [x] **Step 5: Run green tests**

Run: `python -m pytest tests\test_document_uplift_pipeline.py -v`  
Expected: pass.

---

### Task 7: Frontend Severity Compatibility

**Files:**
- Create: `kpmg_ui/client/src/document-uplift.severity.test.ts`
- Modify: `kpmg_ui/client/src/pages/document-uplift.tsx`

- [x] **Step 1: Write failing source guard**

Require the page to support `critical`, `high`, `medium`, `low`, and `informational` severities and sort them correctly.

- [x] **Step 2: Run red test**

Run: `node --import tsx .\client\src\document-uplift.severity.test.ts` from `kpmg_ui`  
Expected: fail until TSX supports new severities.

- [x] **Step 3: Implement TSX support**

Expand `SuggestionSeverity`, `severityStyles`, and `severityRank`.

- [x] **Step 4: Run green tests**

Run: `node --import tsx .\client\src\document-uplift.severity.test.ts`  
Expected: pass.

---

### Task 8: Final Architecture Document and Verification

**Files:**
- Deferred: `docs/document-uplift-architecture.md`
- Modify: `docs/document-uplift-build-log.md`
- Modify: `docs/HANDOFF.md`

- [x] **Step 1: Defer final architecture doc**

Per human instruction, do not write the full architecture/components/processes document until the original plan is complete. Keep this addendum linked to the original plan and record the implementation in the build log and handoff instead.

- [x] **Step 2: Run full backend/frontend checks**

Run:

```powershell
python -m pytest tests\services\test_severity.py tests\services\test_schemas.py tests\services\test_semantic_roles.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\services\test_analysis.py tests\test_document_uplift_pipeline.py tests\test_document_uplift_api.py tests\test_settings.py -v
```

Then from `kpmg_ui`:

```powershell
node --import tsx .\client\src\document-uplift.item29.test.ts
node --import tsx .\client\src\document-uplift.item30.test.ts
node --import tsx .\client\src\document-uplift.severity.test.ts
npm run check
npm run build
```

- [x] **Step 3: Update logs**

Record implementation, verification, and remaining human T8/T9 gates in `docs/document-uplift-build-log.md` and `docs/HANDOFF.md`.

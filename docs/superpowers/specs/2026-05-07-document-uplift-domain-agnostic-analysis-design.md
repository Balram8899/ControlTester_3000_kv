# Document Uplift Domain-Agnostic Analysis Addendum
**Date:** 2026-05-07  
**Status:** Draft for human review - revised after pattern matching review  
**Scope:** Addendum to `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`

---

## Purpose

The original Document Uplift plan correctly introduces a new standalone feature, a service-based pipeline, full-document coverage, structured Excel handling, cross-document synthesis, Word track changes, and audit-grade diagrams. During Checkpoint C review, the implementation passed the RCM/SOP structural gate but exposed a quality limitation: the analysis model is still too RCM-shaped.

Real cases can contain financial, non-financial, technology, cyber, operations, legal, HR, procurement, ESG, vendor, service management, or other documents. Operational issues can also cut across all of those areas. This addendum keeps the original architecture and build sequence, but broadens the internal analysis model so Document Uplift can analyze any supported document set without assuming the case is only about risk/control matrices.

---

## Goals

1. Keep the existing service architecture unchanged: React, Express BFF, FastAPI, MongoDB, LLM provider abstraction.
2. Keep Document Uplift independent from `utils/sop_uplift/`.
3. Preserve the original plan's primary output requirements: Word track changes and swimlane PNG/PDF.
4. Generalize structured analysis beyond RCM fields so uploaded evidence can be financial, non-financial, technology, cyber, operations, legal, HR, procurement, ESG, vendor, facilities, or unknown.
5. Make "domain" metadata, not control flow. Unknown domains must still be processed.
6. Add automated tests and a human quality tollgate similar to the original plan's tollgate style.
7. Keep the main `document_uplift_cases` document below the 500KB target by storing large normalized fact sets outside the case document.
8. Define concrete detection methods, seed match signals, role hints, confidence handling, and default thresholds for the initial finding registry without making that registry a closed or hardcoded checklist.

---

## Non-Goals

- Do not add a new backend service or change deployment topology.
- Do not build a universal enterprise GRC ontology.
- Do not hardcode cyber, technology, finance, or risk as required domains.
- Do not require users to pre-map every column before running the pipeline.
- Do not replace the original `corpus_map`; extend it in a backward-compatible way.
- Do not proceed to Item 32 until the added Checkpoint C remediation and human gates are recorded.
- Do not use embedding similarity alone as evidence of contradiction. Similarity can help find candidate pairs, but a mismatch finding requires explicit field conflict, deterministic rule evidence, or LLM comparison over cited source text.
- Do not hardcode exact field names, domains, or pattern names as the only things the engine can detect. The implementation must use semantic field-role classification, raw attribute preservation, configurable pattern definitions, and a discovery pass for case-specific findings.

---

## Design Summary

The pipeline should use three separate axes:

1. **Document role**: what the uploaded file is doing in the case.
2. **Capability/domain context**: what area the document appears to cover.
3. **Operational finding pattern**: what kind of issue or improvement was found.

The third axis is the most important. Missing owners, unclear handoffs, stale reviews, unresolved issues, weak evidence, SLA breaches, undocumented exceptions, and procedure/data mismatches can happen in any domain. These patterns should drive suggestion generation.

Domain context should tune wording and evidence interpretation, but it must not decide whether analysis runs.

---

## Document Roles

The existing user-facing tags remain valid. Internally, the analysis layer should infer or assign one or more document roles:

| Role | Examples | Analysis Use |
|---|---|---|
| `procedure` | SOP, work instruction, runbook | Primary uplift target and output template |
| `policy_standard` | Policy, standard, guideline | Requirement source and wording baseline |
| `process_flow` | Process map, flow steps, swimlane table | Source for diagram and handoff analysis |
| `control_inventory` | RCM, control library, control inventory | Control expectations and evidence links |
| `risk_issue_event_log` | Risk register, event log, incident list, issue/action log | Historical failure patterns and open remediation |
| `evidence_test_result` | Test evidence, screenshots, reports, reconciliations | Support, contradiction, or absence of evidence |
| `asset_config_extract` | CMDB, asset list, system settings, entitlement extract | Entity-level facts and completeness checks |
| `third_party_service_record` | Vendor report, SLA report, outsourcing register | Dependency, SLA, ownership, and assurance facts |
| `other_context` | Any other supported file | Context only until stronger signals are detected |

These roles are not domains. For example, a `risk_issue_event_log` can be cyber, finance, HR, procurement, facilities, or general operations.

---

## Capability / Domain Context

Domain context should be stored as optional metadata. The initial built-in vocabulary should be broad but non-exclusive:

| Context | Examples |
|---|---|
| `financial_operations` | corporate actions, reconciliations, trading ops, payments, valuation |
| `technology_operations` | change, release, incident, problem, monitoring, backup, DR |
| `cyber_security` | IAM, PAM, vulnerability, patching, logging, incident response |
| `business_operations` | service delivery, case processing, customer operations, shared services |
| `third_party_vendor` | outsourcing, supplier performance, vendor risk, SLAs |
| `legal_compliance` | obligations, regulatory filings, retention, attestations |
| `data_privacy_records` | data handling, privacy, records retention, data quality |
| `hr_people_process` | joiner/mover/leaver, training, approvals, segregation of duties |
| `procurement_finance_admin` | procurement, invoices, approvals, spend controls |
| `physical_facilities` | premises, physical security, environmental controls |
| `esg_sustainability` | ESG metrics, reporting, controls, evidence |
| `unknown_general` | default when no confident context exists |

The implementation must allow multiple contexts per document and must preserve the original user tag. Future domains should be added as configuration or prompt vocabulary, not by branching the pipeline.

---

## Pattern Registry and Discovery

The pattern table below is a seed registry, not a hardcoded checklist. It exists to make expected behavior testable and to keep high-confidence checks from becoming vague LLM inference. The implementation should treat registry rows as configurable pattern definitions with:

- detection method
- seed match signals
- role hints
- default thresholds
- precedence and deduplication rules

The engine must still discover case-specific issues that are not named in the seed registry. After normalized facts are extracted, the analysis service should run a discovery pass that asks: "Given these facts and the primary procedure, what material gaps, contradictions, omissions, or unclear steps are present?" The result can map to a known pattern or use `case_specific_finding` with a clear rationale and source references.

Seed match signals are examples, not exhaustive strings. For example, an owner-like field can be called `owner`, `processor`, `team`, `performer`, `accountable party`, or something domain-specific. The column/section classifier should map those labels to semantic roles before any rule runs. Unknown columns and unfamiliar terms must remain in `raw_attributes` so the discovery pass can still use them.

Role hints are not hard suppression rules. They control which checks run first and what evidence burden applies. A pattern may still be raised outside its usual role hints if the extracted evidence is strong and cited.

---

## Detection Method Types

The implementation should label every finding with one of these detection methods:

| Method | Meaning | Typical Confidence |
|---|---|---|
| `deterministic_field` | Field-level null/date/status/value rule | High |
| `deterministic_structural` | Ordered process-step rule, role pairing rule, or sequence rule | High/medium |
| `cross_document_rule` | Join or compare facts across two or more uploaded documents | High/medium |
| `llm_inference` | LLM classifies prose ambiguity using cited text only | Medium/low |
| `hybrid` | Deterministic candidate generation plus LLM verification over cited evidence | Medium |

LLM inference should not create high-confidence findings unless it is grounded in explicit quoted or source-referenced evidence. Deterministic findings can be high-confidence when the source field, threshold, and row/section reference are clear.

---

## Severity and Confidence

Confidence is the engine's evidence strength. Severity is the practical importance of the issue if the finding is true. They are related but separate.

### Confidence Bands

| Band | Numeric Range | Meaning |
|---|---:|---|
| `high` | `>= 0.80` | Direct field, date, row, or cited cross-document evidence supports the finding |
| `medium` | `>= 0.50 and < 0.80` | Evidence is plausible and source-referenced but depends on interpretation, mapping, or LLM verification |
| `low` | `< 0.50` | Weak or ambiguous signal; should not become an uplift suggestion without human confirmation |

### Severity Vocabulary

| Severity | Meaning |
|---|---|
| `critical` | Could materially break the process, regulatory obligation, customer outcome, system recovery, financial integrity, or executive sign-off |
| `high` | Important control/process gap, overdue item, contradiction, or missing accountability that requires remediation |
| `medium` | Meaningful clarity, evidence, ownership, timing, or consistency issue that should be improved |
| `low` | Minor completeness or wording issue with limited operational impact |
| `informational` | Context, observation, or follow-up question; not an uplift suggestion by default |

### Default Severity Hints

| Detection Method | Default Severity | Notes |
|---|---|---|
| `deterministic_field` | `medium` | Escalate to `high` if the field relates to approval, deadline breach, ownership of a critical activity, or repeated event |
| `deterministic_structural` | `medium` | Escalate to `high` for missing escalation/recovery in critical or time-bound processes |
| `cross_document_rule` | `high` | Downgrade to `medium` when linkage is weak but still source-referenced |
| `llm_inference` | `low` or `medium` | Never `high` unless verified by deterministic evidence or explicit cited contradiction |
| `hybrid` | `medium` or `high` | Use `high` only when deterministic candidate matching plus cited LLM comparison agree |

Seed-registry findings should always set `pattern_bucket`. `case_specific_finding` may set `pattern_bucket="case_specific"` or leave it null if no stable bucket exists.

---

## Semantic Role Classification

The seed registry must run on semantic roles, not raw field names. The role classifier is therefore a required stage between extraction and pattern detection.

Mechanism:

1. Build candidate field metadata from column names, section headings, nearby labels, sample values, filename, document tag, and inferred document role.
2. Apply a configurable synonym/regex table for common role names such as owner-like, date-like, status-like, evidence-like, approval-like, entity-like, issue-like, and amount/count-like fields.
3. If the field remains ambiguous and the LLM budget allows it, use one compact LLM call per sheet/document section group to classify unresolved fields into semantic roles.
4. Preserve every original field in `raw_attributes`, even when a semantic role is assigned.
5. Store classifier confidence and method in fact attributes, for example `attributes.field_roles.owner = {"source": "llm", "confidence": 0.72, "raw_field": "processor"}`.

The configurable synonym/regex table is a bootstrap aid, not the whole classifier. It can recognize common labels, but unknown labels must either be inferred by the LLM classifier or left as raw attributes for the discovery pass.

---

## Seed Finding Patterns

Suggestions should be generated from reusable, matchable patterns where possible. Patterns are grouped so deterministic passes can run before costlier cross-document or LLM checks. The table defines the initial registry and test contract only; it must not limit what the discovery pass can identify.

### Ownership and Authorization

| Pattern | Detection Method | Seed Match Signals | Role Hints |
|---|---|---|---|
| `missing_owner` | `deterministic_field` | Null/blank owner-like fields: `owner`, `responsible`, `accountable`, `assigned_to`, `action_owner`, `control_owner`, `process_owner`; placeholder values: `TBD`, `unknown`, `unassigned`, `-` | All roles except `other_context` unless promoted by classification |
| `explicit_na_without_rationale` | `deterministic_field` | Owner/evidence/approval value is `N/A`, `not applicable`, or equivalent, but no rationale, exemption ID, approver, or compensating note exists | All structured roles |
| `unclear_handoff` | `deterministic_structural` + `llm_inference` | Process steps lack explicit `from_role -> to_role`; prose uses vague actors such as "the team", "as appropriate", "if needed", "someone", "business to confirm" | `procedure`, `process_flow` |
| `missing_approval` | `deterministic_field` + `deterministic_structural` | `approval`, `approved_by`, `authorized_by`, or sign-off field blank where status implies approval; procedure has submit/review step but no approval/sign-off step | `procedure`, `process_flow`, `evidence_test_result`, `risk_issue_event_log` |
| `segregation_of_duties_conflict` | `deterministic_field` | Same normalized person/team appears in incompatible role pairs such as preparer/approver, requestor/implementer, maker/checker, reviewer/owner | `control_inventory`, `process_flow`, `evidence_test_result`, `risk_issue_event_log`, `asset_config_extract` |

### Evidence and Currency

| Pattern | Detection Method | Seed Match Signals | Role Hints |
|---|---|---|---|
| `missing_evidence` | `cross_document_rule` | SOP/procedure/control references an artifact, report, system extract, approval, or record, but no uploaded evidence fact matches by exact name, normalized name, artifact ID, or declared evidence reference | `procedure`, `control_inventory`, `policy_standard` vs `evidence_test_result` |
| `weak_evidence_description` | `deterministic_field` + `llm_inference` | Evidence description length < 15 chars; generic phrases like "see attached", "various", "as above", "evidence retained"; missing at least two of artifact ID, system/source, date range, owner, location | `evidence_test_result`, `control_inventory`, `risk_issue_event_log` |
| `stale_review` | `deterministic_field` | `last_review_date`, `review_date`, `effective_date`, `attestation_date`, or vendor review date is older than the applicable threshold; procedure says "annual review" but date is > 365 days old | `procedure`, `policy_standard`, `control_inventory`, `third_party_service_record`, `asset_config_extract` |
| `recurring_exception` | `deterministic_field` | Same normalized issue category, root cause, control, system, vendor, process, or event type appears >= 3 times in 12 months, or >= 2 high-severity times in 90 days | `risk_issue_event_log`, `evidence_test_result`, `third_party_service_record` |
| `sla_or_deadline_breach` | `deterministic_field` | `actual_date > target_date`; open/pending item has `due_date < as_of_date`; status/notes contain "breach", "missed", "overdue"; RTO/RPO stated but no test evidence uploaded | `third_party_service_record`, `risk_issue_event_log`, `evidence_test_result`, `process_flow` |
| `explicit_exemption_undocumented` | `deterministic_field` + `cross_document_rule` | Exception/exemption/waiver exists, but no sign-off, expiry date, compensating control, exception log reference, or approval evidence is found | `risk_issue_event_log`, `evidence_test_result`, `control_inventory`, `policy_standard` |

### Procedure Completeness and Cross-Document Consistency

| Pattern | Detection Method | Seed Match Signals | Role Hints |
|---|---|---|---|
| `open_issue_dependency` | `cross_document_rule` | Issue/action status is open, pending, or in progress; due date is overdue or high severity; issue process/system/entity matches a SOP scope or step | `risk_issue_event_log` vs `procedure` |
| `procedure_data_gap` | `cross_document_rule` | Entity, activity, system, vendor, asset, product, location, or event type exists in structured evidence but no SOP/procedure step covers it | `asset_config_extract`, `third_party_service_record`, `risk_issue_event_log`, `process_flow` vs `procedure` |
| `monitoring_gap` | `deterministic_structural` + `llm_inference` | Procedure lacks monitoring, reconciliation, review, alert handling, exception review, or periodic check step; monitoring step has no owner/frequency/exception condition | `procedure`, `process_flow` |
| `escalation_gap` | `deterministic_structural` | Exception/failure/threshold breach condition is not followed by escalation; no escalation role/path/timeframe exists in the process | `procedure`, `process_flow` |
| `recovery_gap` | `deterministic_structural` | Change/action/failure-prone step has no rollback, remediation, rework, backup, recovery, or contingency step; "if error/failure" has no next action | `procedure`, `process_flow`, `technology_operations` context evidence |
| `third_party_dependency_gap` | `cross_document_rule` | Vendor/service named in SOP not found in vendor/SLA record, or vendor/SLA record references a service not reflected in SOP responsibilities | `procedure` vs `third_party_service_record` |
| `control_or_requirement_mismatch` | `hybrid` | Candidate SOP/control/policy pair is linked by ID, exact name, normalized entity, or high-similarity candidate retrieval; cited text then shows conflicting owner, frequency, threshold, evidence, approval, or timing requirement | `procedure` vs `control_inventory` or `policy_standard` |
| `duplicate_or_conflicting_control_or_requirement` | `cross_document_rule` + `llm_inference` | Two controls, requirements, or procedures cover the same activity/entity but have different owners, frequencies, evidence, thresholds, or approvals | `control_inventory`, `policy_standard`, `procedure` |
| `orphaned_risk_or_requirement` | `cross_document_rule` | Risk, obligation, requirement, issue, or event has no linked control, mitigation step, owner, evidence, or procedure coverage in any uploaded document | `risk_issue_event_log`, `policy_standard`, `control_inventory` |
| `obsolete_reference` | `hybrid` | SOP references a system, regulation, team, vendor, policy, form, version, or standard that is absent from supporting evidence or contradicted by a newer uploaded source | `procedure`, `policy_standard` vs all supporting roles |

Every suggestion must explain why it was raised and include source references wherever the evidence comes from uploaded files. Findings that do not fit a seed pattern should use `case_specific_finding`, preserve the discovered pattern label in `attributes.discovered_pattern`, and require at least medium confidence plus source references.

---

## Pattern Thresholds and Disambiguation

Default thresholds:

- `stale_review`: use explicit document frequency first. If absent, default to 365 days from `as_of_date`. If the uploaded source has a report date, use that as `as_of_date` for historical evidence; otherwise use pipeline run date.
- `recurring_exception`: default to >= 3 same-category/root-cause/entity events in 12 months, or >= 2 high-severity events in 90 days.
- `weak_evidence_description`: default to description length < 15 characters, or generic evidence phrases with fewer than two concrete attributes: artifact ID, system/source, owner, date range, storage location, or report name.
- `sla_or_deadline_breach`: compare actual/completed date to target/due date. For open items, compare due date to `as_of_date`. If no date exists, do not raise a breach; consider `weak_evidence_description` or `missing_evidence` instead.

Disambiguation rules:

- Blank owner/evidence fields raise `missing_owner` or `missing_evidence`. Explicit `N/A` values do not raise the same pattern; they raise `explicit_na_without_rationale` only when no rationale or approval is present.
- If both `missing_evidence` and `weak_evidence_description` match the same target, prefer `missing_evidence` when no artifact can be linked; use `weak_evidence_description` when an artifact exists but is too vague to test.
- If event data shows repeated failures and the SOP lacks monitoring, keep `recurring_exception` for the event evidence and `monitoring_gap` only if it proposes a different SOP change.
- If a direct conflict exists between linked documents, prefer `control_or_requirement_mismatch`; use `procedure_data_gap` only when a supporting fact is absent from the SOP rather than contradictory.
- Deduplicate by `(pattern, target_anchor_id, normalized_entity_name)` when a target anchor exists. If no target anchor exists, deduplicate by `(pattern, normalized_entity_name, primary_source_ref)`. Keep the highest-confidence finding and merge source references and rationales where appropriate.

---

## Discovery Pass Contract

The discovery pass is required so the engine is not limited to the seed registry. It should run after deterministic seed checks and before final suggestion selection.

Inputs:

- Primary procedure anchors and process-step summaries, including anchor IDs and section headings.
- Compact fact summaries by document role and domain context.
- High-signal raw attributes that were not mapped to semantic roles.
- Existing seed findings, so the discovery pass avoids duplicating them.
- Corpus map summaries and general relationships.
- LLM budget and max output count.

Output structure:

```python
class DiscoveryCandidate(BaseModel):
    discovered_pattern: str
    summary: str
    rationale: str
    suggested_change: str | None = None
    target_anchor_id: str | None = None
    source_references: list[SourceReference]
    related_fact_ids: list[str] = Field(default_factory=list)
    confidence: float
    severity: str
    should_be_suggestion: bool
    follow_up_question: str | None = None
```

Rules:

- A discovery candidate with confidence `>= 0.50`, source references, and a target anchor may become a `NormalizedFinding` with `pattern="case_specific_finding"`.
- A discovery candidate with confidence `< 0.50`, no target anchor, or unclear suggested change must be routed as a follow-up question, not an uplift suggestion.
- Discovery candidates must not invent facts. They may cite raw attributes, but every cited claim needs a `SourceReference`.
- Discovery candidates that duplicate seed findings are merged into the seed finding as additional rationale/source references.

---

## Data Model Extension

Add a normalized fact layer behind the existing case model:

```python
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


class SourceReference(BaseModel):
    file_id: str
    filename: str
    document_role: str | None = None
    section_id: str | None = None
    section_heading: str | None = None
    page: int | None = None
    sheet_name: str | None = None
    row_number: int | None = None
    column_name: str | None = None
    anchor_id: str | None = None
    excerpt: str | None = None


class DocumentFact(BaseModel):
    fact_id: str
    case_id: str
    file_id: str
    source_ref: SourceReference
    document_role: str
    domain_contexts: list[str]
    entity_type: EntityType
    entity_name: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    raw_attributes: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0


class NormalizedFinding(BaseModel):
    finding_id: str
    pattern: str
    pattern_bucket: str | None = None
    detection_method: str
    severity: str
    confidence: float
    summary: str
    rationale: str
    target_anchor_id: str | None = None
    normalized_entity_name: str | None = None
    source_references: list[SourceReference]
    related_fact_ids: list[str] = Field(default_factory=list)
    suggested_change: str
    domain_contexts: list[str] = Field(default_factory=list)
    thresholds_used: dict[str, Any] = Field(default_factory=dict)
    attributes: dict[str, Any] = Field(default_factory=dict)
```

The case document should keep summaries only:

```python
corpus_map = {
    "risk_to_control_map": [...],
    "sop_to_control_map": [...],
    "evidence_to_control_map": [...],
    "general_relationships": [...],
    "finding_summary": {
        "patterns": {"missing_owner": 4, "stale_review": 2},
        "domains": {"unknown_general": 3, "technology_operations": 2}
    }
}
```

Large fact sets should be stored in a separate MongoDB collection such as `document_uplift_facts`, keyed by `case_id`, `file_id`, and `pipeline_id`. This follows the original P3/S3 direction and avoids bloating `document_uplift_cases`.

Backward compatibility: existing cases that do not have `general_relationships` or `finding_summary` should be read as if those fields are empty. No migration is required for old cases; new pipeline writes should add these fields only when facts/findings exist.

Follow-up routing: low-confidence discovery candidates or candidates with no safe target anchor should be stored in the existing `agent_follow_up_questions` case field, with source references where available. They should not appear in the suggestion review queue and should not be applied to the Word output.

---

## Processing Flow

1. Convert uploaded files using the existing conversion service.
2. Infer document role and domain contexts from file tag, filename, headers, section headings, and a small LLM classification call when needed.
3. Extract normalized facts from structured sheets, CSV-like tables, and prose sections.
4. Preserve raw columns and raw attributes so unfamiliar domains are not lost.
5. Run seed registry checks over semantic roles, not raw field-name hardcoding.
6. Run a discovery pass to identify case-specific gaps not covered by the seed registry.
7. Run cross-document synthesis over compact summaries and selected high-signal facts.
8. Generate suggestions only when the finding has a clear target section or a concrete follow-up question.
9. Store detailed facts outside the main case document and store summaries/source references on suggestions.

This is still Stage 1 analysis. Stage 2 output generation remains unchanged except that accepted suggestions may now come from non-RCM evidence.

---

## Prompting Rules

Prompts should say:

- Do not assume the case is financial, cyber, technology, or risk-only.
- Treat the uploaded documents as an arbitrary business process corpus.
- Identify reusable operational patterns when evidence supports them, but also surface case-specific findings that do not match a known seed pattern.
- If the domain is unclear, classify it as `unknown_general` and continue.
- Do not invent policies, controls, owners, dates, systems, or evidence.
- Every suggestion must include a short rationale: "why this is suggested".
- Prefer "ask for clarification" over a strong suggestion when source evidence is conflicting but not decisive.
- Do not assume that the seed pattern registry is exhaustive.

---

## Automated Test Additions

Add these test cases before moving to Item 32:

### TC-13 — Domain-agnostic structured table

**Input:** A CSV/XLSX file with generic columns: `activity`, `owner`, `due_date`, `status`, `evidence`, `issue_id`, `notes`. No RCM-specific headers.  
**Expected:** Structured extraction creates `DocumentFact` rows, classifies missing owner/evidence/status issues, and does not require `control_id` or `risk_id`.  
**Pass criteria:** At least one `missing_owner` or `missing_evidence` finding is generated with a source row reference.

### TC-14 — Technology operations case

**Input:** SOP/runbook plus change, incident, backup, or monitoring evidence.  
**Expected:** Suggestions can identify stale review, unresolved issue dependency, monitoring gap, recovery gap, or SLA/deadline gap.  
**Pass criteria:** At least one suggestion references both the SOP/runbook and supporting operations evidence.

### TC-15 — Non-financial business operations case

**Input:** SOP plus an issue/action log or service report for a non-financial process such as HR, procurement, facilities, vendor management, or customer operations.  
**Expected:** Suggestions are generated using universal operational patterns without forcing cyber/risk wording.  
**Pass criteria:** Suggestion rationale uses the uploaded evidence and does not include an irrelevant finance/cyber/control assumption.

### TC-16 — Unknown domain fallback

**Input:** Documents with unfamiliar headers and no domain tag.  
**Expected:** Pipeline assigns `unknown_general`, preserves raw attributes, and still evaluates generic completeness patterns.  
**Pass criteria:** No crash, no skipped document, and at least raw facts are stored or a clear user-visible warning is produced.

### TC-17 — Format parity for process facts

**Input:** The same simple process-flow content represented once as CSV/XLSX and once as DOCX/PDF text.  
**Expected:** Both formats normalize into comparable process-step facts.  
**Pass criteria:** Step count differs by no more than 15%, at least 80% of normalized owner/role names match, and the first and last process activities are identified in both formats.

### TC-18 — Case document size with large generic evidence

**Input:** A case with one SOP plus at least 1,000 generic structured evidence rows.  
**Expected:** Detailed facts are stored outside the case document; the case keeps only summaries and source references.  
**Pass criteria:** `document_uplift_cases` BSON size remains below 500KB.

### TC-19 — Clean document precision test

**Input:** A well-formed SOP plus supporting evidence where owners, approvals, evidence descriptions, dates, and handoffs are complete and consistent.  
**Expected:** The pipeline does not invent gaps just because it has a seed registry.  
**Pass criteria:** Zero high-confidence findings. Low-confidence `case_specific_finding` candidates are allowed only if they are routed as follow-up questions rather than uplift suggestions.

### TC-20 — Blank vs explicit N/A disambiguation

**Input:** Structured evidence with one row where the owner field is blank and another row where owner is `N/A` with no rationale.  
**Expected:** Blank owner produces `missing_owner`; explicit `N/A` does not produce `missing_owner` and instead produces `explicit_na_without_rationale`.  
**Pass criteria:** The two rows produce distinct patterns with distinct rationales and row source references.

### TC-21 — Segregation of duties conflict

**Input:** A structured process/control/evidence table where the same normalized person appears as preparer and approver on the same activity.  
**Expected:** The engine detects `segregation_of_duties_conflict` without requiring RCM-specific field names.  
**Pass criteria:** Finding references the row, cites both incompatible semantic roles, and has confidence `>= 0.80`.

### TC-22 — Discovery candidate follow-up routing

**Input:** A document set with ambiguous raw attributes that suggest a possible issue but lack a clear target anchor or sufficient confidence.  
**Expected:** The discovery pass creates a follow-up question, not an uplift suggestion.  
**Pass criteria:** Candidate is stored in `agent_follow_up_questions`, absent from `suggestions`, and does not appear in Stage 2 Word output.

---

## Human Quality Tollgate

### Tollgate T9 — Cross-Domain Suggestion Quality

**Condition:** Before proceeding to Item 32, a human reviewer tests at least three representative cases:

1. Existing financial/risk/control case.
2. Technology, cyber, or IT operations case.
3. Non-financial business operations case, such as HR, procurement, vendor, facilities, ESG, or customer operations.

For each case, randomly sample at least three generated suggestions or all suggestions if fewer than three exist.

**Pass criteria:**

- At least 70% of sampled suggestions are rated useful.
- Each tested case has at least one useful suggestion or a clear "no useful suggestions because..." warning.
- Every sampled suggestion has a visible rationale explaining why it was suggested.
- Every sampled suggestion that cites uploaded evidence has source references to the relevant document, section, row, or page.
- No more than one sampled suggestion may contain an irrelevant domain assumption, such as cyber wording in a procurement process or RCM wording in an HR process.
- If a clean or near-clean case is included, it must not produce high-confidence suggestions; acceptable output is a clear "no material suggestions" state or low-confidence follow-up questions.

**Fail condition:** If T9 fails, keep `DOCUMENT_UPLIFT_ENABLED=false`, log the failure pattern, add a regression fixture for the failed domain or document role, and do not move to Item 32 until the issue is corrected or explicitly waived by the human owner.

---

## Implementation Placement

This addendum should be implemented as a Checkpoint C remediation before Item 32:

1. Extend shared schemas.
2. Extend the structured extraction service to emit generic facts.
3. Extend analysis service to consume generic facts and produce seed-registry findings plus case-specific discovered findings.
4. Persist large fact sets outside the main case document.
5. Add TC-13 through TC-22 automated tests.
6. Run T8 and T9 human tollgates.
7. Only then proceed to Item 32 Celery/Redis wiring.

This is a schedule adjustment, not a platform architecture change.

---

## Plan Deviation Assessment

This addendum does not deviate from the original feature architecture. It broadens the structured analysis model beyond RCM-specific field names. The change is justified by the original plan's stated support for risk/event data and supplementary evidence, and by the Checkpoint C finding that RCM-only cross-document suggestions are too narrow for real uploaded case evidence.

The only operational deviation is sequencing: insert this remediation before Item 32 so infrastructure is not built around a known-narrow analysis model.

# Document Uplift Document-Aware Output Compiler Addendum

**Date:** 2026-05-07  
**Status:** Draft for human review  
**Scope:** Addendum to `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`  
**Related addendum:** `docs/superpowers/specs/2026-05-07-document-uplift-domain-agnostic-analysis-design.md`

---

## Purpose

Checkpoint C Word 365 review showed that the current Stage 2 output generator is still too anchor-driven. It can create valid Word tracked-change XML, but it does not yet understand the uploaded document as a structured document. The result is technically reviewable but not client-ready.

The observed failure is not specific to KYC, RCMs, finance, cyber, technology, operations, physical security, or any other domain. The same failure would happen in any document where an accepted suggestion needs to update the right section, table cell, role row, evidence matrix, approval matrix, or reference area.

This addendum defines a domain-neutral document-aware output compiler. Its job is to convert accepted suggestions into coherent tracked changes that respect the primary document's structure, style, numbering, tables, and review workflow.

---

## Evidence From Current Output

Generated review file:

`output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-holistic-rerun.docx`

Observed issues:

1. Role/responsibility updates were inserted into the role-name column instead of the responsibility column.
2. Six responsibility updates used the same long text as procedure updates.
3. Several long insertions were duplicated in both the role table and the procedure body.
4. New headings and body text were inserted into the same paragraph.
5. Existing section numbers were duplicated instead of reusing or extending existing sections.
6. Mechanical wording was produced, including phrases like "is responsible for ensuring that the IA/RM must".
7. Multi-role strings such as `Branch Operations; Wealth Operations` were rendered as singular prose.
8. Casing errors such as `kYC` were not caught before output.
9. Comments were technically cleaner than earlier builds, but target-level comments were too generic.
10. The output passed package-level checks but failed document-quality review, proving that XML validity is not enough.

---

## Goals

1. Make Stage 2 document-aware, not just paragraph-aware or table-aware.
2. Keep the design fully domain-neutral across KYC, financial operations, technology, cyber, operations, legal, HR, procurement, physical security, ESG, and unknown domains.
3. Preserve the original plan requirement: Word track changes must remain the primary DOCX output strategy.
4. Preserve source references in comments without exposing internal anchors or file UUIDs.
5. Route every accepted suggestion through an explicit edit intent and placement plan before touching the DOCX.
6. Prevent duplicate, contradictory, or structurally invalid edits before generating the final document.
7. Keep role/responsibility and RACI updates concise and structurally correct.
8. Keep detailed procedure, evidence, frequency, approval, and exception requirements in appropriate document sections, not arbitrary cells.
9. Add automated quality gates that fail loudly or route ambiguous edits for follow-up rather than producing broken Word output.

---

## Non-Goals

- Do not hardcode KYC, AML, RCM, CIRO, FINTRAC, cyber, technology, finance, operations, or physical-security-specific rules.
- Do not replace the analysis addendum. This spec is about Stage 2 output compilation.
- Do not require the user to manually tag every section or table before generation.
- Do not remove Word tracked changes.
- Do not make a new external service.
- Do not alter the existing SOP Uplift feature unless a Track A item explicitly requires it.
- Do not guarantee perfect legal or regulatory drafting. The compiler improves structure, placement, and reviewability; suggestion correctness still flows through T8/T9 human gates.

---

## Design Summary

The current output generator works like this:

1. Flatten accepted suggestions into `PreparedChange`.
2. Find a paragraph near a target string.
3. Insert or replace text using Word revision XML.

The new compiler should work like this:

1. Parse the primary document into a `DocumentMap`.
2. Classify structural blocks, tables, rows, cells, and sections.
3. Convert accepted suggestions into `EditIntent` objects.
4. Normalize and split intent-specific text.
5. Merge and deduplicate intents.
6. Build a `PlacementPlan` for each intent.
7. Validate plans through output QA gates.
8. Apply tracked changes using section-, paragraph-, and table-aware operations.
9. Generate comments that explain the specific change and source documents.

The core difference: accepted suggestions are no longer raw text insertions. They become typed document edits.

---

## Core Data Model

### DocumentMap

`DocumentMap` is an in-memory representation of the primary document.

Required fields:

| Field | Meaning |
|---|---|
| `blocks` | Ordered structural blocks: headings, paragraphs, tables, list items, page breaks where detectable |
| `sections` | Hierarchical sections inferred from headings and numbering |
| `tables` | Table metadata, headers, rows, cells, and inferred table type |
| `styles` | Style names and formatting hints for nearby insertion |
| `numbering` | Existing section numbering and list numbering context |
| `anchors` | Existing extraction anchors linked back to blocks where possible |
| `warnings` | Parse uncertainties and unsupported structures |

The map must not depend on domain vocabulary. It should classify by structure and semantic role.

### StructuralBlock

Each block should include:

| Field | Meaning |
|---|---|
| `block_id` | Stable in-memory identifier |
| `block_type` | `heading`, `paragraph`, `table`, `table_row`, `table_cell`, `list_item`, `metadata`, `unknown` |
| `text` | Visible text |
| `style_name` | Word style name when available |
| `section_path` | Parent section hierarchy |
| `position_index` | Order in the document |
| `source_anchor_id` | Linked extraction anchor when available |

### SectionRole

The compiler should infer section roles from heading text, style, position, and content:

| Role | Meaning |
|---|---|
| `purpose_scope` | Purpose, scope, applicability, audience |
| `roles_responsibilities` | Role table or role narrative |
| `procedure_process` | Step-by-step procedure, runbook, workflow, operating process |
| `approval_authority` | Approval, sign-off, delegation, exception authority |
| `evidence_records` | Records, artifacts, retention, evidence |
| `monitoring_reporting` | Review, monitoring, testing, reconciliation, reporting |
| `exceptions_escalation` | Exceptions, failures, incident escalation, breach handling |
| `references` | Policy, standard, regulation, system, document references |
| `metadata_history` | Version, owner, dates, classification, history |
| `definitions_glossary` | Terms and definitions |
| `appendix` | Appendices or supporting material |
| `unknown` | Insufficient confidence |

These are document roles, not business domains.

### TableRole

Tables should be inferred from headers and shape:

| Role | Typical Signals |
|---|---|
| `role_responsibility` | Two columns similar to role / responsibility, owner / activity, function / duty |
| `raci_matrix` | RACI, responsible, accountable, consulted, informed, role columns |
| `approval_matrix` | activity/request/threshold plus approver/sign-off columns |
| `evidence_matrix` | artifact, evidence, record, retention, frequency |
| `control_requirement_matrix` | control, requirement, risk, owner, evidence |
| `issue_action_table` | issue, action, owner, due date, status |
| `reference_table` | reference/document/regulation plus description |
| `metadata_table` | document ID, version, owner, effective date |
| `unknown` | No reliable role |

The implementation must not require exact header strings. It should use semantic header classification and preserve raw headers.

### EditIntent

Every accepted suggestion or target becomes one or more `EditIntent` objects.

Required fields:

| Field | Meaning |
|---|---|
| `intent_id` | Stable ID derived from suggestion/target ID |
| `intent_type` | Typed edit purpose |
| `summary` | Human-readable summary |
| `rationale` | Why the edit is suggested |
| `source_references` | Human-readable source document references |
| `target_role` | Desired section/table role |
| `target_entity` | Role, activity, process, asset, record, system, obligation, or other entity |
| `source_text` | Current document text to replace or extend when known |
| `proposed_text` | Intent-specific proposed text |
| `confidence` | Placement/content confidence |
| `fallback_behavior` | `ask_followup`, `append_to_review_notes`, or `safe_append` |

Initial intent types:

| Intent Type | Placement Target |
|---|---|
| `procedure_update` | Procedure/process section |
| `role_responsibility_update` | Role/responsibility narrative or responsibility cell |
| `raci_update` | RACI matrix row/cell |
| `evidence_requirement_update` | Evidence/records section or evidence matrix |
| `approval_authority_update` | Approval/authority section or approval matrix |
| `monitoring_reporting_update` | Monitoring/reporting/reconciliation/testing section |
| `exception_escalation_update` | Exceptions/escalation section |
| `metadata_update` | Metadata table or document history |
| `reference_update` | References section/table |
| `definition_update` | Definitions/glossary |
| `followup_only` | No Word edit; route to reviewer |

---

## Text Contracts By Intent

The compiler must not use the same text for every target. It should generate or transform text based on the intent.

### Procedure Update

Procedure text can include:

- actor or owner
- action
- trigger or frequency
- sequence or condition
- evidence/record created
- exception/escalation outcome
- system/tool/reference when relevant

Procedure text should not be a giant control statement pasted from a source matrix. It should read like the surrounding procedure.

### Role Responsibility Update

Responsibility text must be concise. Default limit: 160 characters, soft limit: 220 characters when needed.

It can include:

- ownership/accountability
- major activity area
- oversight or approval responsibility

It should not include:

- retained evidence lists
- full procedural steps
- detailed regulatory citations
- multiple unrelated activities
- "is responsible for ensuring that"
- "must" nested inside another responsibility phrase

Example generic shape:

`Owns periodic review of assigned records and confirms exceptions are documented and escalated.`

### RACI Update

RACI text should be structured, not prose. It should update the correct activity row and role column. If no matching activity exists, add a row only when confidence is high.

### Evidence Requirement Update

Evidence updates should describe artifacts and retention requirements. They belong in evidence sections, records sections, evidence tables, or procedure steps where evidence is naturally documented. They do not belong in role-name cells.

### Approval Authority Update

Approval updates should describe who approves what, when, and under which conditions. If the document has an approval matrix, update that matrix. Otherwise place the edit under approval, exceptions, escalation, or procedure sections based on the `DocumentMap`.

---

## Placement Rules

### General Placement

1. Prefer explicit `target_anchor_id` only if the anchor maps to a compatible structural role.
2. If the anchor role is incompatible, use the intent target role to find a better section/table.
3. Never insert into a table cell unless the intent is table-compatible.
4. Never insert a detailed procedure paragraph into a metadata, reference, role-name, or document-history cell.
5. When placement confidence is below threshold, route to follow-up instead of generating a broken tracked change.

Default placement confidence bands:

| Band | Range | Behavior |
|---|---:|---|
| High | `>= 0.80` | Apply tracked change |
| Medium | `0.55-0.79` | Apply only if QA passes and no safer target exists |
| Low | `< 0.55` | Route to follow-up |

### Section Placement

For section edits:

1. Match by section role and semantic similarity, not exact heading text.
2. Reuse an existing section when possible.
3. Add a new subsection only if no compatible section exists.
4. Do not duplicate existing numbered headings.
5. Separate heading and body text into different Word paragraphs.
6. Inherit nearby style for headings and body text.

### Table Placement

For table edits:

1. Classify the table role first.
2. Identify the target column by semantic header role.
3. Identify the target row by normalized entity/role/activity.
4. Update the correct cell with tracked changes.
5. Add a new row only when no row matches and the intent explicitly supports row creation.
6. Preserve table formatting when adding rows.
7. If multiple roles are present in one target, split into multiple intents or route to follow-up.

### Replacement vs Append

The compiler should choose one of:

| Operation | Use When |
|---|---|
| `replace_text` | Existing sentence is incomplete or contradicted |
| `append_to_paragraph` | Existing paragraph is correct but missing one clause |
| `insert_after_block` | New content belongs after a known block |
| `insert_under_section` | New paragraph/subsection belongs in an existing section |
| `update_table_cell` | Existing row/cell should be extended or replaced |
| `add_table_row` | New row is needed and placement confidence is high |
| `followup_only` | Ambiguous or unsafe |

For role/responsibility cells, default to appending a concise phrase to the existing responsibility cell unless the existing cell is clearly wrong or contradictory.

---

## Merge And Deduplication

Before Word generation, the compiler must run a merge pass.

Merge keys should include:

- intent type
- target role
- normalized target entity
- compatible target section/table
- normalized activity or requirement

The merge pass should:

1. Combine duplicate suggestions that reference the same activity or requirement.
2. Keep multiple source references in one comment.
3. Avoid inserting the same text in both a procedure section and a role table.
4. Split broad suggestions into smaller intents only when each has a clear target.
5. Prefer rewriting existing text over adding nearby duplicate paragraphs.
6. Mark conflicting suggestions for reviewer follow-up instead of generating both.

---

## Output QA Gates

Stage 2 must validate compiled changes before writing the final DOCX.

### Structural QA

Fail or route to follow-up if:

- a table update targets the wrong column type;
- a role-name cell receives long responsibility text;
- a heading and body are merged into one paragraph;
- duplicate section numbers are introduced;
- a new row is added to an unsupported table type;
- a low-confidence placement is about to be applied;
- the same proposed text appears unchanged in more than one structural target.

### Language QA

Fail or rewrite if:

- text contains `is responsible for ensuring that ... must`;
- role text exceeds the configured length limit;
- casing looks broken, such as `kYC`;
- evidence lists are placed in responsibility text;
- source control IDs are pasted into client prose when they belong in comments;
- mechanical labels such as `Procedure update:` or Markdown markers appear in inserted text.

### Package QA

Continue existing package checks:

- Word comments part exists when comments are generated.
- Revision settings are enabled.
- `w:ins` and `w:del` counts are non-zero when changes exist.
- Comments contain source filenames, not internal anchors or UUIDs.
- Generated DOCX can be opened in Word 365 during the human gate.

---

## Comments

Comments should explain the specific change, not just the target type.

Comment structure:

1. Change summary.
2. Why this was suggested.
3. Source document names and row/sheet/section labels where available.
4. Reviewer note if placement confidence is medium.

Example:

`Add annual re-screening responsibility to Compliance - AML/ATF Officer. Why this was suggested: the supporting control inventory requires periodic and trigger-based re-screening, but the procedure did not assign accountability. Source document(s): WM_Risk_Controls_Matrix.xlsx - Risk Control Matrix row 14.`

The comment should not include internal anchor IDs.

---

## Error Handling And Follow-Up Routing

The compiler should not silently drop accepted suggestions. If an edit cannot be safely placed, it should create a follow-up item with:

- suggestion ID;
- reason placement failed;
- candidate sections/tables considered;
- source references;
- recommended reviewer action.

Examples:

- "Could not determine whether this approval rule belongs in the approval matrix or exception section."
- "Multiple role rows match the target owner."
- "No compatible table column found for responsibility update."

---

## Tests

### Unit Tests

Add tests for:

1. `DocumentMap` section classification on generic headings.
2. Table role classification for role/responsibility, RACI, approval, evidence, metadata, reference, and unknown tables.
3. Intent conversion from accepted suggestions and edit targets.
4. Responsibility text shortening and prohibited phrase removal.
5. Procedure text preserving detail while avoiding source-control copy-paste.
6. Placement selection rejects incompatible anchors.
7. Role table update writes into responsibility cell, not role cell.
8. Existing role row update vs new role row insertion.
9. Duplicate section numbering prevention.
10. Heading/body split.
11. Merge pass removes duplicate procedure/responsibility text.
12. Low-confidence placement routes to follow-up.

### DOCX Package Tests

Add regression tests that inspect `word/document.xml`:

1. No `w:ins` inside role-name cells for responsibility updates.
2. Responsibility-cell insertions stay below the configured length limit.
3. Procedure insertions are outside role tables.
4. Headings and body text are separate paragraphs.
5. Comments contain source filenames and no internal anchor IDs.
6. Duplicate exact inserted text is not present across multiple targets.

### Cross-Domain Fixtures

At minimum, use small synthetic fixtures for:

1. Financial operations procedure plus evidence table.
2. Technology change/runbook plus approval matrix.
3. Cyber access review procedure plus RACI matrix.
4. Physical security procedure plus incident/action log.
5. Generic operations SOP with unknown domain labels.

The expected behavior should be structural, not domain-specific.

---

## Integration With Existing Plan

This addendum is a Checkpoint C remediation. It does not replace the original plan items. It extends Item 24 and the Word 365 review gate because valid tracked-change XML alone is not sufficient.

The existing `SuggestionEditTarget` model can remain, but Stage 2 should compile targets into richer internal `EditIntent` objects before output. Backward compatibility is required: older suggestions without `edit_targets` should still compile into a best-effort intent or follow-up.

The final architecture/components/processes document remains deferred until the original plan and human gates are complete, per human instruction.

---

## Acceptance Criteria

The remediation is acceptable when:

1. The generated DOCX no longer places responsibility text in role-name cells.
2. Role/responsibility updates are concise and distinct from procedure updates.
3. Detailed procedure updates land in compatible procedure/process sections.
4. Duplicate section numbers are not introduced.
5. Heading/body insertions are correctly separated.
6. Duplicate accepted suggestions are merged or routed to follow-up.
7. Comments explain the specific change and cite human-readable source documents.
8. The same compiler works on at least three non-KYC, non-RCM fixtures.
9. Word 365 opens the output without repair prompts and shows tracked changes/comments in the Review pane.
10. T8 and T9 human usefulness gates can be performed on the regenerated output.


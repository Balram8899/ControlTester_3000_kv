# Document Uplift T9 Cross-Domain Validation - Cyber and ESG

Date: 2026-05-08

## Cases Run

| Domain | Case ID | Uploaded files | Suggestions | Outputs |
| --- | --- | --- | ---: | ---: |
| Cybersecurity | `cd10c25f-66a9-4628-99a2-7003949e2c9c` | `cyber_ir_sop.docx`, `cyber_rcm.xlsx`, `cyber_risk_event_log.xlsx` | 21 | 3 |
| ESG / Sustainability | `fa6e0b67-22e8-410c-a4f4-7e7ac191f454` | `esg_reporting_sop.docx`, `esg_rcm.xlsx`, `esg_metric_deviation_log.xlsx` | 5 | 3 |

Generated outputs:

| Domain | DOCX | PNG swimlane | PDF swimlane |
| --- | --- | --- | --- |
| Cybersecurity | `output/doc/cyber-t9-docx.docx` | `output/doc/cyber-t9-png_diagram.png` | `output/doc/cyber-t9-pdf_diagram.pdf` |
| ESG / Sustainability | `output/doc/esg-t9-docx.docx` | `output/doc/esg-t9-png_diagram.png` | `output/doc/esg-t9-pdf_diagram.pdf` |

Raw suggestion captures:

- `output/doc/cyber-t9-suggestions.json`
- `output/doc/esg-t9-suggestions.json`

## Baseline Method

The baseline below is inferred from explicit gaps, exceptions, deviations, open risks, weak controls, and recommendations visible in the uploaded Cyber and ESG source files. If a separate answer key exists, use this report as a first-pass comparison and then reconcile against that key.

## Cybersecurity Comparison

### What Was Found

The Cyber run produced 21 suggestions:

- 5 substantive SOP/process improvements:
  - Incorporate emergency patching SLAs.
  - Add mandatory regulatory reporting timelines.
  - Reference incident-specific playbooks.
  - Formalise Post-Incident Review.
  - Define incident response drill frequency.
- 1 incomplete/generic suggestion titled `Process Improvement` with no detail/proposed text.
- 3 ownership conflicts:
  - CC-013, CC-002, CC-017.
- 12 RCM mapping gaps:
  - CC-001, CC-003, CC-004, CC-005, CC-006, CC-007, CC-009, CC-011, CC-012, CC-014, CC-015, CC-016.

### Expected vs Detected

| Expected planted issue / source signal | Status | Evidence from detected suggestions | Notes |
| --- | --- | --- | --- |
| Formal RACI / ownership ambiguity across incident roles | Partial | Ownership conflicts for CC-013, CC-002, CC-017 | It detects point conflicts but not the broader missing RACI/multi-team accountability gap. |
| Missing incident severity classification schema and escalation SLAs | Missed | None | Regulatory timing and patching SLAs were found, but P1-P4/severity model was not. |
| No process-flow diagram in SOP | Missed | None | The output includes a generated diagram, but there is no suggestion that the SOP itself lacks/needs a flow diagram. |
| Missing incident-specific playbooks | Found | `Reference Incident-Specific Playbooks` | Good match. |
| Missing digital forensics / evidence preservation guidance | Missed | None | Chain-of-custody and forensic preservation were not suggested. |
| Missing internal escalation timeframes, e.g. CISO notification | Missed | None | External reporting was found; internal escalation SLAs were not. |
| Missing regulatory notification timelines | Found | `Add Mandatory Regulatory Reporting Timelines` | Good match for CERT-In/RBI style reporting. |
| Missing evidence chain of custody / audit-log integrity | Missed | None | Not detected. |
| IR drill frequency vague | Found | `Define IR Drill Frequency` | Good match. |
| Missing formal review cycle / document owner | Missed | None | Not detected. |
| Missing Post-Incident Review / lessons learned | Found | `Formalise Post-Incident Review (PIR)` | Good match. |
| External regulator/government contact list absent | Missed | None | Not detected. |
| Emergency patching SLA gap | Found | `Incorporate Emergency Patching SLAs` | Good match. |
| RCM controls not covered in SOP | Found | 12 `mapping_gap` suggestions | Broadly detected, but proposed text is often control-statement-like and should become procedure-aware before this is considered polished. |
| RCM/control-assessment exceptions, e.g. legacy EDR gaps, DLP review lapse, DR RTO miss, logging retention gap, DMARC p=none | Partial | Related CC mapping gaps for CC-001, CC-006, CC-012, CC-013, etc. | The engine detects control coverage gaps more than actual operating exceptions/deviation specifics. |
| Risk event log recurring/event-derived issues | Missed / weak | No clear event-log-derived finding surfaced | This is the biggest Cyber gap: the uploaded risk event log is not being mined strongly enough for recurrence, overdue remediation, or incident trend uplift. |

### Cyber Verdict

Cyber is usable as a cross-domain smoke test, but it should not be treated as fully passed. It finds several planted SOP weaknesses and control coverage gaps, but misses severity taxonomy, chain-of-custody, internal escalation, external contact, review-cycle, and event-log-derived findings. One blank `Process Improvement` suggestion is also a quality defect.

## ESG Comparison

### What Was Found

The ESG run produced 5 SOP/process suggestions:

- Define quantitative deviation thresholds.
- Implement data validation and 4-eye review.
- Incorporate external assurance requirements.
- Establish formal escalation matrix.
- Add version control and change history.

### Expected vs Detected

| Expected planted issue / source signal | Status | Evidence from detected suggestions | Notes |
| --- | --- | --- | --- |
| Missing ESG strategy / sustainability framework references, e.g. BRSR, TCFD, ISSB, GRI | Partial | `Incorporate External Assurance Requirements` | Assurance is detected, but framework/reference coverage is not. |
| Financed emissions / Scope 3 Category 15 excluded without methodology or owner | Missed | None | Not detected. |
| Quantitative deviation thresholds undefined | Found | `Define Quantitative Deviation Thresholds` | Good match. |
| Data owners, submission deadlines, standardized templates missing | Partial | `Implement Data Validation and 4-Eye Review` | Validation is detected; owners/deadlines/templates are not. |
| Missing data quality validation / reconciliation / approval workflow | Found / partial | `Implement Data Validation and 4-Eye Review` | Good high-level match, but not sourced to specific logs/controls. |
| Scope 3 coverage vague; categories/emission factors undocumented | Missed | None | Not detected. |
| Significant/material deviation not quantitatively defined | Found | `Define Quantitative Deviation Thresholds` | Good match. |
| Escalation matrix and investigation timeline missing | Found | `Establish Formal Escalation Matrix` | Good match. |
| Reporting frequency and executive/board recipient vague | Partial | Escalation suggestion names CFO/Board Sustainability Committee | Board route is partly covered; reporting cadence is not. |
| Third-party assurance absent | Found | `Incorporate External Assurance Requirements` | Good match. |
| Regulatory triggers, timelines, responsible parties missing | Missed | None | Not detected. |
| RACI, Internal Audit role, ERM/risk appetite linkage absent | Missed | None | Not detected. |
| Training/methodology guidance/frequency missing | Missed | None | Not detected. |
| Review cycle/version history/change management absent | Found | `Add Version Control and Change History` | Good match. |
| ESG RCM exceptions and weak controls, e.g. climate stress testing, green bond reporting, D&I targets, DPDP inventory, PSL, supplier ESG, ESG KPIs, ABC training, whistleblower SLA | Missed / weak | None | The ESG RCM was not mined into specific uplift suggestions. |
| ESG metric deviation log items, e.g. biodiversity disclosure, POSH resolution, net-zero interim target, restated Scope 2 data | Missed | None | The deviation log did not materially drive the suggestion set. |

### ESG Verdict

ESG does not pass the cross-domain usefulness gate yet. The engine found several generic SOP-quality issues, but missed most structured ESG RCM and deviation-log findings. This shows the current pipeline remains too dependent on primary SOP text and selected RCM-style matching, rather than extracting case-specific issues from every uploaded supporting document.

## Overall T9 Assessment

| Area | Result |
| --- | --- |
| Domain-neutral ingestion | Pass - both Cyber and ESG packs converted and generated outputs. |
| Domain-neutral diagrams | Pass - both generated valid PNG/PDF swimlane outputs using the newer renderer. |
| Cyber usefulness | Partial pass - several planted issues found, but event-log and evidence-preservation gaps remain weak. |
| ESG usefulness | Fail / needs improvement - only 5 high-level suggestions surfaced from a much richer planted issue set. |
| Source traceability | Partial - deterministic mapping-gap suggestions cite source documents; several LLM-generated process improvements have no source document references. |
| Suggestion quality | Partial - one blank Cyber suggestion should be filtered; mapping-gap wording still sometimes reads like control-statement insertion rather than natural procedure uplift. |

## Recommended Next Fix

Implement a generic, document-aware issue extraction pass over every uploaded document, not only RCM-like rows:

1. For every document, extract candidate `DocumentIssueSignal` records from tables, bullets, paragraphs, logs, test results, deviations, and action trackers.
2. Classify each signal by generic pattern and role, not by hardcoded domain terms.
3. Link signals to SOP anchors using semantic target placement.
4. Generate suggestions from grouped signals so ESG deviation logs, Cyber event logs, operational issue trackers, technology exceptions, physical security findings, and finance controls can all contribute equally.
5. Filter empty/incomplete suggestions before persistence.
6. Require source document labels on every suggestion, including LLM-generated process suggestions.
7. Add T9 regression tests using these Cyber and ESG packs or distilled fixtures:
   - Cyber event-log trend produces at least one recurrence/SLA/escalation finding.
   - Cyber chain-of-custody/evidence-preservation gap is detected.
   - ESG metric deviation log produces specific metric/deviation suggestions.
   - ESG RCM control-assessment exceptions produce specific uplift suggestions.
   - No blank suggestions are persisted.
   - Every suggestion has at least one human-readable source document label.


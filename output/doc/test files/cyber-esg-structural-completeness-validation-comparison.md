# Cyber/ESG Structural Completeness Validation - 2026-05-08

## Validation Cases

| Domain | Case ID | Stage | Suggestions | Outputs |
| --- | --- | --- | ---: | --- |
| Cyber incident response | `cfe2acd7-e656-41cc-be05-80dca0565b74` | `complete` | 44 | DOCX, PNG, PDF |
| ESG reporting | `96d0e5a1-4722-4ab6-bc81-48df8d761334` | `complete` | 44 | DOCX, PNG, PDF |

## Generated Artifacts

- `output/doc/cyber-structural-completeness-docx.docx`
- `output/doc/cyber-structural-completeness-swimlane.png`
- `output/doc/cyber-structural-completeness-swimlane.pdf`
- `output/doc/cyber-structural-completeness-suggestions.json`
- `output/doc/cyber-structural-completeness-case.json`
- `output/doc/cyber-structural-completeness-complete-case.json`
- `output/doc/esg-structural-completeness-docx.docx`
- `output/doc/esg-structural-completeness-swimlane.png`
- `output/doc/esg-structural-completeness-swimlane.pdf`
- `output/doc/esg-structural-completeness-suggestions.json`
- `output/doc/esg-structural-completeness-case.json`
- `output/doc/esg-structural-completeness-complete-case.json`

## Generic Structural Findings Added

Both validation cases now include these domain-neutral structural suggestions:

- Add an accountability matrix for multi-role activities.
- Define classification criteria for referenced levels.
- Define escalation triggers and timeframes.
- Add a post-event review and closure control.
- Add document control metadata.
- Add an obligation calendar for external or internal requirements.
- Add a metric ownership and validation matrix.
- Link thresholds and exceptions to risk appetite.

## Cyber Ground-Truth Comparison

| Planted gap | Coverage after rerun | Notes |
| --- | --- | --- |
| No RACI matrix | Covered | `Add an accountability matrix for multi-role activities` was generated. |
| P1-P4 / severity levels undefined | Covered | `Define classification criteria for referenced levels` was generated. |
| Time-bound escalation SLAs missing | Covered | `Define escalation triggers and timeframes` and emergency patching timeline suggestions were generated. |
| Generic containment steps; need incident-type playbooks | Partial | Some supporting-evidence findings cover specific tooling and recovery areas, but there is not yet a generic "type-specific playbook matrix" structural pattern. |
| Regulatory notification requirements missing | Covered | `Include Regulatory Reporting Requirements` plus the generic obligation calendar were generated. |
| No process flow diagram in SOP | Covered by output artifact | The final swimlane PNG/PDF were generated from the effective SOP state. |
| No post-incident review section | Covered | `Add a post-event review and closure control` was generated. |
| No framework references | Partial | The obligation calendar covers framework/reference mapping generically, but there is not yet a specific phase-to-framework mapping pattern. |
| No forensics / chain-of-custody step | Partial | Evidence-retention wording is present in several findings, but a dedicated forensic preservation / chain-of-custody structural finding is still worth adding. |
| No version history / document control | Covered | `Add document control metadata` was generated. |

## ESG Ground-Truth Comparison

| Planted gap | Coverage after rerun | Notes |
| --- | --- | --- |
| Deviation thresholds undefined | Covered | `Define Quantitative Deviation Thresholds` and classification criteria suggestions were generated. |
| Regulatory framework mapping/calendar missing | Covered | `Add an obligation calendar for external or internal requirements` was generated. |
| Data owners not named | Covered | `Add a metric ownership and validation matrix` was generated. |
| Escalation matrix missing | Covered | `Define escalation triggers and timeframes` was generated. |
| Reporting cadence vague | Covered | The metric ownership matrix includes submission frequency/deadline fields. |
| Third-party assurance requirements missing | Covered | `Formalize External Assurance Interaction` and assurance-scope issue suggestions were generated. |
| Risk appetite linkage missing | Covered | `Link thresholds and exceptions to risk appetite` was generated. |
| Board/committee reporting undefined | Partial | Escalation and obligation tables create a place for oversight recipients, but there is not yet a specific committee-reporting structural pattern. |
| Scope 3 coverage vague | Partial | Scope 3 deviations and assurance-scope findings were generated, but the engine does not yet create a generic all-category scope coverage matrix. |
| Data quality / validation process missing | Covered | `Implement Four-Eyes Check on Data Submission` and the metric validation matrix were generated. |

## Role Assignment Guard Check

No generated suggestion text matched the unsafe senior-role patterns checked in this run:

- `CISO performs`
- `Chief ... performs`
- `Chief ... investigate`
- `performs investigate`

Senior oversight roles are now routed toward RACI/accountability clarification rather than operational task execution when the source evidence implies hands-on work but does not clearly justify it.

## Remaining Improvements

- Add a generic playbook/specialized-response structural pattern where a document describes a broad process but references materially different event, product, system, asset, or scenario types.
- Add a generic evidence-preservation pattern for destructive or irreversible actions where the procedure lacks chain-of-custody, preservation, snapshot, approval, or recovery evidence.
- Add a generic committee/oversight-reporting pattern for cases with board, committee, management, regulator, or external reporting signals but no recipient/cadence matrix.
- Add a generic coverage-matrix pattern for incomplete category universes, such as Scope 3 categories, asset classes, product families, control domains, or geography coverage.

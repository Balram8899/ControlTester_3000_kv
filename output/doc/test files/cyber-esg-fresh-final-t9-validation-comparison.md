# Cyber/ESG Fresh Final T9 Validation Comparison

Run date: 2026-05-08

## Cases

| Pack | Case ID | Uploaded documents |
| --- | --- | --- |
| Cyber Incident Response | `79a2fe76-b8cb-4c1f-912a-28194b6d4650` | `cyber_ir_sop.docx`, `cyber_rcm.xlsx`, `cyber_risk_event_log.xlsx` |
| ESG Reporting | `7f32586e-3c3f-4ecd-ba36-973121213d5d` | `esg_reporting_sop.docx`, `esg_rcm.xlsx`, `esg_metric_deviation_log.xlsx` |

## Fixes Validated In This Run

- Generic document issue signal extraction now runs across complete structured sheets, not only RCM-like sheets.
- Metric-deviation detection now requires measurement context; control assessment action/gap rows are routed as open issue dependencies instead of metric deviations.
- Stage 2 output generation has a rewrite budget (`DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT`, default `12`) so large suggestion batches complete instead of calling the LLM once per accepted suggestion.
- Flowchart exports use the current reviewed SOP state and the latest KPMG/TRACE swimlane styling.

## Cyber Results

| Evidence area | Inferred planted/known issue shape | Detected result |
| --- | --- | --- |
| `cyber_rcm.xlsx` / Control Assessment | 14 non-effective controls with identified gaps/actions | 12 prioritized open issue dependency suggestions from control-assessment actions |
| `cyber_risk_event_log.xlsx` / Incident Log | 6 open incident rows | 6 open issue dependency suggestions |
| `cyber_rcm.xlsx` + SOP cross-document comparison | Control coverage and ownership mismatches | 12 mapping-gap suggestions and 4 ownership-conflict suggestions |
| `cyber_ir_sop.docx` | SOP-specific process omissions | 5 LLM-derived process improvement suggestions |

Cyber final count: 39 suggestions.

Severity mix: 12 medium, 23 high, 4 critical.

Source traceability: 28 references to `cyber_rcm.xlsx`, 6 references to `cyber_risk_event_log.xlsx`, and 21 references to `cyber_ir_sop.docx` across the suggestion source references.

## ESG Results

| Evidence area | Inferred planted/known issue shape | Detected result |
| --- | --- | --- |
| `esg_rcm.xlsx` / ESG Risk & Controls Matrix | 18 open/monitoring metric-risk rows | 12 prioritized metric/target deviation suggestions |
| `esg_rcm.xlsx` / Control Assessment | 11 non-effective controls plus one effective row with a noted gap/action | 12 open issue dependency suggestions |
| `esg_metric_deviation_log.xlsx` | 20 open and 2 monitoring metric-deviation rows, with overlap against RCM metrics | 8 additional unique metric-deviation suggestions after dedupe |
| `esg_reporting_sop.docx` | SOP-specific process omissions | 3 LLM-derived process improvement suggestions |

ESG final count: 35 suggestions.

Severity mix: 1 low, 10 medium, 7 high, 17 critical.

Source traceability: 24 references to `esg_rcm.xlsx`, 8 references to `esg_metric_deviation_log.xlsx`, and 3 references to `esg_reporting_sop.docx`.

## Generated Artifacts

| Pack | DOCX | PNG swimlane | PDF swimlane |
| --- | --- | --- | --- |
| Cyber | `output/doc/cyber-fresh-final-t9-docx.docx` | `output/doc/cyber-fresh-final-t9-swimlane.png` | `output/doc/cyber-fresh-final-t9-swimlane.pdf` |
| ESG | `output/doc/esg-fresh-final-t9-docx.docx` | `output/doc/esg-fresh-final-t9-swimlane.png` | `output/doc/esg-fresh-final-t9-swimlane.pdf` |

Artifact sanity checks:

- Cyber DOCX: 51 comments, 51 tracked insertions, 6 tracked deletions.
- Cyber PNG: 5460 x 2985.
- ESG DOCX: 35 comments, 35 tracked insertions, 3 tracked deletions.
- ESG PNG: 5910 x 2580.

## Conclusion

The fresh final run materially improves T9 cross-domain behavior. The engine now detects supporting-document issues from cyber event logs, cyber control assessments, ESG metric deviations, and ESG control assessments, rather than relying only on RCM-to-SOP comparison.

This is still an uplift suggestion queue, not a complete issue register export. Findings are prioritized and deduped so the SOP review remains usable. If a future workflow needs every source row represented, it should be a separate "issue register extraction" mode rather than overloading the SOP uplift suggestion queue.

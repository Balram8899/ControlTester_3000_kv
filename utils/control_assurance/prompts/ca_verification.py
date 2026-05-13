from __future__ import annotations

import json


def build_population_ca_prompt(control: dict, period: dict, file_meta: dict) -> str:
    data = {"control": control, "testing_period": period, "file": file_meta}
    return f"""You are verifying completeness and accuracy of a population file for IT audit control testing.
The population may be an Excel/CSV export, PDF report, screenshot/OCR output, SAP SUIM log, SQL export, text/config log, or ZIP bundle.
If supporting_files are present, treat them as source-query/report-execution evidence for the primary file.

Completeness checks:
1. Expected columns present for the control type.
2. Row count plausible for stated period and population size.
3. No truncation, with last record date within or after period end.
4. No blank critical fields in sample rows.
5. If source support shows a query/report count, reconcile it to row_count or unique_counts using the provided reconciliation.unique_key_columns.
6. Query/report parameters, filters, company code, role, date range, environment, and selected options match the testing period and control scope.

Accuracy checks:
1. Source or author metadata matches stated system.
2. File modification date is a plausible extraction date.
3. Record timestamps fall within stated testing period.
4. No formula override indicators.
5. Internal timestamp consistency.
6. Supporting screenshot/PDF includes query text or report parameters, run timestamp, and record count where relevant.
7. Reviewer comments in supporting_files are considered when deciding whether count or unique-count reconciliation is required.

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "completeness_passed": true,
  "accuracy_passed": false,
  "issues": [{{"check": "string", "finding": "string", "severity": "high|medium|low"}}],
  "summary": "string"
}}

DATA:
{json.dumps(data, indent=2)}"""


def build_evidence_ca_prompt(control: dict, period: dict, steps: list[dict], file_meta: dict) -> str:
    data = {
        "control": control,
        "testing_period": period,
        "steps_this_evidence_covers": steps,
        "file": file_meta,
    }
    return f"""You are verifying completeness and accuracy of audit evidence for IT control testing.
Evidence may include a primary export plus supporting source screenshots/PDFs/images showing SQL queries, SAP SUIM parameters, report filters, run timestamps, record counts, or reviewer comments.
If supporting_files are present, reconcile the primary evidence to the support evidence before passing completeness and accuracy.

Completeness checks:
1. All required information visible for each mapped test step.
2. Evidence is not cropped or truncated in a way that hides relevant data.
3. Date and time stamps are visible where required.
4. If source support shows a query/report count, reconcile it to row_count or unique_counts using reconciliation.unique_key_columns.
5. Query/report parameters, filters, company code, role, date range, environment, and selected options match the test step scope.

Accuracy checks:
1. Evidence is from the correct system and matches the stated application.
2. Evidence date and time falls within the stated testing period.
3. No PDF edit markers, Excel formula overrides, or inconsistent image EXIF data.
4. No contradictions between metadata and stated control.
5. Supporting screenshot/PDF includes source query or report execution details, run timestamp, and expected count where relevant.
6. Reviewer comments in supporting_files are considered when evaluating count or unique-count reconciliation.

Also identify the specific value or setting this evidence demonstrates.

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "completeness_passed": true,
  "accuracy_passed": false,
  "issues": [{{"check": "string", "finding": "string", "severity": "high|medium|low"}}],
  "identified_value": "string",
  "annotation_hint": "string"
}}

DATA:
{json.dumps(data, indent=2)}"""

from __future__ import annotations

from utils.services.schemas import DiscoveryCandidate, SheetResult, SourceReference


def sheet_result(records: list[dict]) -> SheetResult:
    return SheetResult(
        sheet_name="Evidence",
        row_count=len(records),
        schema=[],
        gaps=[],
        records=records,
    )


def test_tc13_generic_table_missing_owner_generates_source_referenced_finding() -> None:
    from utils.services.generic_findings import detect_seed_findings, facts_from_sheet_result

    sheet = sheet_result(
        [
            {
                "_raw_attributes": {
                    "Process Activity": "Review exception queue",
                    "Processor": "",
                    "Evidence": "Queue review log",
                },
                "_source": {"row_index": 2},
            }
        ]
    )

    facts = facts_from_sheet_result("file-1", "ops.xlsx", sheet, "risk_issue_event_log")
    findings = detect_seed_findings(facts)

    assert facts[0].raw_attributes["Processor"] == ""
    assert findings[0].pattern == "missing_owner"
    assert findings[0].source_references[0].row_index == 2
    assert findings[0].confidence >= 0.8


def test_tc19_clean_document_has_no_high_confidence_findings() -> None:
    from utils.services.generic_findings import detect_seed_findings, facts_from_sheet_result

    sheet = sheet_result(
        [
            {
                "_raw_attributes": {
                    "Process Activity": "Review exception queue",
                    "Processor": "Operations",
                    "Approved By": "Compliance",
                    "Evidence": "Queue review log Q1",
                },
                "_source": {"row_index": 2},
            }
        ]
    )

    findings = detect_seed_findings(
        facts_from_sheet_result("file-1", "ops.xlsx", sheet, "evidence_test_result")
    )

    assert [finding for finding in findings if finding.confidence >= 0.8] == []


def test_tc20_blank_owner_and_explicit_na_are_distinct_patterns() -> None:
    from utils.services.generic_findings import detect_seed_findings, facts_from_sheet_result

    sheet = sheet_result(
        [
            {"_raw_attributes": {"Activity": "Step one", "Processor": ""}, "_source": {"row_index": 2}},
            {"_raw_attributes": {"Activity": "Step two", "Processor": "N/A"}, "_source": {"row_index": 3}},
        ]
    )

    findings = detect_seed_findings(
        facts_from_sheet_result("file-1", "ops.xlsx", sheet, "risk_issue_event_log")
    )
    patterns_by_row = {
        finding.source_references[0].row_index: finding.pattern for finding in findings
    }

    assert patterns_by_row[2] == "missing_owner"
    assert patterns_by_row[3] == "explicit_na_without_rationale"


def test_tc21_segregation_of_duties_conflict_without_rcm_fields() -> None:
    from utils.services.generic_findings import detect_seed_findings, facts_from_sheet_result

    sheet = sheet_result(
        [
            {
                "_raw_attributes": {
                    "Activity": "Approve payment file",
                    "Prepared By": "A. Shah",
                    "Approved By": "A. Shah",
                },
                "_source": {"row_index": 5},
            }
        ]
    )

    findings = detect_seed_findings(
        facts_from_sheet_result("file-1", "payment_ops.xlsx", sheet, "evidence_test_result")
    )

    conflict = next(finding for finding in findings if finding.pattern == "segregation_of_duties_conflict")
    assert conflict.confidence >= 0.8
    assert conflict.source_references[0].row_index == 5
    assert "Prepared By" in conflict.rationale
    assert "Approved By" in conflict.rationale


def test_tc22_low_confidence_discovery_routes_to_follow_up_question() -> None:
    from utils.services.generic_findings import route_discovery_candidates

    candidate = DiscoveryCandidate(
        discovered_pattern="ambiguous backlog handoff",
        summary="Backlog ownership may be unclear.",
        rationale="Notes mention a queue but no owner.",
        source_references=[SourceReference(document_id="doc-1", row_index=9)],
        confidence=0.42,
        severity="informational",
        should_be_suggestion=False,
        follow_up_question="Who owns the backlog after triage?",
    )

    findings, questions = route_discovery_candidates([candidate])

    assert findings == []
    assert questions == ["Who owns the backlog after triage?"]

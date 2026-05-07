from __future__ import annotations


def test_classifies_owner_like_fields_without_exact_owner_name() -> None:
    from utils.services.semantic_roles import classify_field_role

    assert classify_field_role("Processor")["role"] == "owner"
    assert classify_field_role("Accountable party")["role"] == "owner"
    assert classify_field_role("Performer team")["role"] == "owner"


def test_classifies_common_operational_roles() -> None:
    from utils.services.semantic_roles import classify_field_role

    assert classify_field_role("Approved By")["role"] == "approval"
    assert classify_field_role("Due Date")["role"] == "due_date"
    assert classify_field_role("Actual completion date")["role"] == "actual_date"
    assert classify_field_role("Evidence location")["role"] == "evidence"
    assert classify_field_role("Ticket Status")["role"] == "status"
    assert classify_field_role("Issue ID")["role"] == "issue_id"
    assert classify_field_role("Process Activity")["role"] == "activity"


def test_record_classification_preserves_raw_attributes() -> None:
    from utils.services.semantic_roles import raw_record_with_roles

    record = {
        "Process Activity": "Review exception queue",
        "Processor": "Operations",
        "Unfamiliar Metric": "42",
    }

    enriched = raw_record_with_roles(record)

    assert enriched["_raw_attributes"] == record
    assert enriched["_semantic_roles"]["Process Activity"]["role"] == "activity"
    assert enriched["_semantic_roles"]["Processor"]["role"] == "owner"
    assert enriched["_semantic_roles"]["Unfamiliar Metric"]["role"] == "other"


def test_finds_incompatible_role_pairs() -> None:
    from utils.services.semantic_roles import incompatible_role_pairs

    record = {
        "Prepared By": "A. Shah",
        "Approved By": "A. Shah",
        "Requested By": "B. Lee",
    }

    pairs = incompatible_role_pairs(record)

    assert pairs == [("Prepared By", "Approved By", "A. Shah")]

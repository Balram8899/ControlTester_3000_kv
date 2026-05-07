from __future__ import annotations

from pathlib import Path

import pytest


def load_store_module():
    try:
        from utils.sop_processing import case_store
    except ModuleNotFoundError as exc:
        pytest.fail(f"utils.sop_processing.case_store is missing: {exc}")
    return case_store


def test_memory_store_splits_content_and_round_trips_gridfs_payloads() -> None:
    case_store = load_store_module()
    store = case_store.DocumentUpliftCaseStore.__new__(case_store.DocumentUpliftCaseStore)
    store._use_memory_fallback()

    case = store.create_case({"title": "Document Uplift", "process_name": "Access"})
    updated = store.update_case(
        case["case_id"],
        {
            "markdown_documents": [
                {
                    "document_id": "doc-file-1",
                    "file_id": "file-1",
                    "filename": "access.docx",
                    "markdown": "# Access\n\nOwner reviews access.",
                }
            ],
            "anchors": [{"anchor_id": "a1", "file_id": "file-1", "content": "Owner reviews access."}],
            "chunks": [{"chunk_id": "c1", "file_id": "file-1", "content": "Owner reviews access."}],
        },
    )

    raw_case = store._memory[case["case_id"]]
    assert raw_case["schema_version"] == 2
    assert "markdown_documents" not in raw_case
    assert "anchors" not in raw_case
    assert "chunks" not in raw_case
    assert updated["markdown_documents"][0]["markdown"].startswith("# Access")
    assert store.get_case(case["case_id"])["chunks"][0]["chunk_id"] == "c1"

    input_gridfs_id = store.store_input_file(
        case["case_id"],
        "file-1",
        "access.docx",
        b"docx-bytes",
    )
    assert input_gridfs_id
    assert store.get_input_file("file-1") == b"docx-bytes"

    output = store.save_output_content(
        case["case_id"],
        {"output_id": "docx-1", "output_type": "docx", "filename": "uplifted.docx"},
        b"output-bytes",
    )
    assert "content_b64" not in output
    assert store.get_output_content(case["case_id"], "docx-1") == b"output-bytes"
    assert store.get_case(case["case_id"])["outputs"][0]["gridfs_file_id"]


def test_case_store_is_document_uplift_only() -> None:
    source = Path("utils/sop_processing/case_store.py").read_text(encoding="utf-8")

    assert "document_uplift_cases" in source
    assert "document_uplift_markdown" in source
    assert "document_uplift_anchors" in source
    assert "document_uplift_chunks" in source
    assert "document_uplift_inputs" in source
    assert "document_uplift_outputs" in source
    assert "utils.sop_uplift" not in source

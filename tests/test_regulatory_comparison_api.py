from io import BytesIO
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


with patch("pymongo.MongoClient") as _mc:
    _mc.return_value.__getitem__.return_value.__getitem__.return_value = MagicMock()
    from api.main import app


client = TestClient(app)


def _comparison_result(documents):
    return {
        "success": True,
        "analysis_timestamp": "2026-04-19T00:00:00",
        "model_used": "llama3",
        "documents": documents,
        "document_analyses": {},
        "extracted_controls": 2,
        "control_groups": 1,
        "stringency_analysis": {
            "domain_analysis": {},
            "control_groups": [],
            "overall_stringency": {},
            "total_controls": 2,
            "total_groups": 1,
        },
        "gap_analysis": {
            "domain_coverage": {},
            "document_gaps": {},
            "shared_controls": [],
            "gap_summary": {
                "most_gaps_in": None,
                "best_covered": None,
                "domains_with_universal_coverage": [],
                "total_domains_found": 0,
                "shared_control_groups": 0,
            },
        },
        "final_report": "# Report",
        "metadata": {},
    }


def test_compare_regulations_accepts_mixed_sources():
    with (
        patch("api.main.MongoLibraryStore") as mock_store_cls,
        patch("api.main.compare_regulatory_documents") as mock_compare,
    ):
        mock_store = mock_store_cls.return_value
        mock_store.get_document.return_value = {
            "document_id": "doc-a",
            "framework_name": "Library Regulation A",
            "source_filename": "library-a.pdf",
            "obligations": [
                {
                    "domain": "Access Control",
                    "section_reference": "1.1",
                    "obligation_text": "Review user access quarterly.",
                }
            ],
        }
        mock_compare.return_value = _comparison_result(["Library Regulation A", "uploaded-b.txt"])

        response = client.post(
            "/compare-regulations",
            data={
                "selected_model": "llama3",
                "regulation_a_source": "library",
                "regulation_a_document_id": "doc-a",
                "regulation_b_source": "upload",
            },
            files={
                "regulation_b_file": ("uploaded-b.txt", b"Requirement B", "text/plain"),
            },
        )

    assert response.status_code == 200
    assert response.json()["documents"] == ["Library Regulation A", "uploaded-b.txt"]


def test_compare_regulations_rejects_missing_second_slot():
    response = client.post(
        "/compare-regulations",
        data={
            "selected_model": "llama3",
            "regulation_a_source": "library",
            "regulation_a_document_id": "doc-a",
        },
    )

    assert response.status_code == 400


def test_compare_regulations_keeps_legacy_upload_list_support():
    with patch("api.main.compare_regulatory_documents") as mock_compare:
        mock_compare.return_value = _comparison_result(["a.txt", "b.txt"])

        response = client.post(
            "/compare-regulations",
            data={"selected_model": "llama3"},
            files=[
                ("regulation_files", ("a.txt", b"alpha", "text/plain")),
                ("regulation_files", ("b.txt", b"beta", "text/plain")),
            ],
        )

    assert response.status_code == 200
    assert response.json()["documents"] == ["a.txt", "b.txt"]

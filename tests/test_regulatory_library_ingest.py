from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from langchain.schema import Document

from utils.document_ingestion import DocumentLoadError
from utils.regulatory_library import ingest_regulatory_document


class _Loader:
    def __init__(self, docs):
        self._docs = docs

    def load(self):
        return self._docs


def test_ingest_regulatory_document_fails_when_pdf_has_no_readable_text():
    with patch(
        "utils.regulatory_library.load_documents",
        side_effect=DocumentLoadError(
            "sample.txt: No readable text could be extracted from the document."
        ),
    ):
        result = ingest_regulatory_document(
            file_path="sample.txt",
            filename="sample.txt",
            selected_model="llama3:latest",
        )

    assert result["success"] is False
    assert "No readable text could be extracted" in result["error"]


def test_ingest_regulatory_document_fails_when_extractor_returns_zero_obligations():
    docs = [Document(page_content="Access must be reviewed quarterly.", metadata={})]

    with patch("utils.regulatory_library.load_documents", return_value=docs), \
         patch("utils.regulatory_library.DocumentAnalyzerAgent") as analyzer_cls, \
         patch("utils.regulatory_library.ObligationExtractorAgent") as extractor_cls:
        analyzer_cls.return_value.run.return_value = {"sample.txt": {"framework_name": "Sample", "issuing_authority": "Test"}} 
        extractor_cls.return_value.run.return_value = []

        result = ingest_regulatory_document(
            file_path="sample.txt",
            filename="sample.txt",
            selected_model="llama3:latest",
        )

    assert result["success"] is False
    assert "No obligations were extracted" in result["error"]


@patch("api.main.ingest_regulatory_document")
def test_library_ingest_returns_422_when_all_documents_fail(mock_ingest):
    from api.main import app

    mock_ingest.return_value = {
        "success": False,
        "source_filename": "sample.txt",
        "error": "No obligations were extracted from the document.",
    }

    resp = TestClient(app).post(
        "/regulatory-library/ingest",
        data={"selected_model": "llama3:latest"},
        files={"regulation_files": ("sample.txt", b"must review access", "text/plain")},
    )

    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["summary"] == "No regulatory documents were ingested successfully."
    assert body["detail"]["error"] == "sample.txt: No obligations were extracted from the document."
    assert body["detail"]["errors"][0]["filename"] == "sample.txt"


def test_obligation_extractor_raises_for_unparseable_model_output():
    from utils.regulatory_library import ObligationExtractorAgent

    agent = ObligationExtractorAgent("llama3:latest")
    agent._make_llm = MagicMock(return_value=MagicMock(invoke=MagicMock(return_value="not json at all")))
    agent._get_kb_context = MagicMock(return_value="")

    batch_idx, obligations, error = agent._process_batch(0, "must review access", 1)

    assert batch_idx == 0
    assert obligations == []
    assert error is not None
    assert "could not be parsed" in error

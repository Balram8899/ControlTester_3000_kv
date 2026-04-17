from pathlib import Path

import pandas as pd
from docx import Document as DocxDocument

from utils.document_ingestion import load_documents, supported_extension_tuple


def test_supported_extensions_include_common_business_formats():
    extensions = supported_extension_tuple()
    assert ".pdf" in extensions
    assert ".docx" in extensions
    assert ".xlsx" in extensions
    assert ".png" in extensions


def test_load_documents_reads_txt(tmp_path):
    path = tmp_path / "sample.txt"
    path.write_text("Control owners must review access quarterly.", encoding="utf-8")

    docs = load_documents(str(path), path.name)

    assert len(docs) == 1
    assert "review access quarterly" in docs[0].page_content.lower()
    assert docs[0].metadata["source"] == path.name


def test_load_documents_reads_docx(tmp_path):
    path = tmp_path / "sample.docx"
    doc = DocxDocument()
    doc.add_paragraph("Privileged access must be reviewed monthly.")
    doc.save(path)

    docs = load_documents(str(path), path.name)

    assert docs
    assert any("reviewed monthly" in d.page_content.lower() for d in docs)
    assert all(d.metadata["source"] == path.name for d in docs)


def test_load_documents_reads_xlsx(tmp_path):
    path = tmp_path / "sample.xlsx"
    frame = pd.DataFrame(
        [
            {"Control ID": "AC-01", "Description": "Enforce MFA for administrators"},
            {"Control ID": "AC-02", "Description": "Review dormant accounts"},
        ]
    )
    frame.to_excel(path, index=False)

    docs = load_documents(str(path), path.name)

    assert docs
    text = "\n".join(doc.page_content for doc in docs).lower()
    assert "enforce mfa" in text
    assert "review dormant accounts" in text

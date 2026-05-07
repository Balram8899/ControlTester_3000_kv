from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

pytest.skip("manual POC - run directly, not via pytest", allow_module_level=True) if __name__ != "__main__" else None


OUTPUT_PATH = Path("output/doc/document_uplift_track_changes_poc.docx")
AUTHOR = "TRACE Document Uplift POC"
REVISION_DATE = "2026-05-06T00:00:00Z"


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT_PATH, "w", compression=zipfile.ZIP_DEFLATED) as package:
        package.writestr("[Content_Types].xml", _content_types_xml())
        package.writestr("_rels/.rels", _root_relationships_xml())
        package.writestr("docProps/core.xml", _core_properties_xml())
        package.writestr("docProps/app.xml", _app_properties_xml())
        package.writestr("word/_rels/document.xml.rels", _document_relationships_xml())
        package.writestr("word/styles.xml", _styles_xml())
        package.writestr("word/settings.xml", _settings_xml())
        package.writestr("word/document.xml", _document_xml())

    _assert_revision_xml(OUTPUT_PATH)
    print(f"Created {OUTPUT_PATH.resolve()}")
    print("Open this file in Word 365 and confirm:")
    print("1. No repair prompt appears.")
    print("2. Review pane shows tracked insertions and deletions.")
    print("3. Single-run, multi-run, and table-cell edits can be accepted/rejected.")


def _assert_revision_xml(path: Path) -> None:
    with zipfile.ZipFile(path) as package:
        document_xml = package.read("word/document.xml").decode("utf-8")
    if document_xml.count("<w:ins ") < 3 or document_xml.count("<w:del ") < 3:
        raise AssertionError("POC DOCX must contain at least three w:ins and w:del revisions")
    for expected in ("single-run", "multi-run", "table-cell"):
        if expected not in document_xml:
            raise AssertionError(f"POC DOCX is missing the {expected} marker")


def _revision_attrs(revision_id: int) -> str:
    return f'w:id="{revision_id}" w:author="{AUTHOR}" w:date="{REVISION_DATE}"'


def _content_types_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>
"""


def _root_relationships_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""


def _document_relationships_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>
"""


def _core_properties_xml() -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Document Uplift Track Changes POC</dc:title>
  <dc:creator>{AUTHOR}</dc:creator>
  <cp:lastModifiedBy>{AUTHOR}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{REVISION_DATE}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{REVISION_DATE}</dcterms:modified>
</cp:coreProperties>
"""


def _app_properties_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>TRACE Document Uplift</Application>
</Properties>
"""


def _styles_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>
"""


def _settings_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:trackRevisions/>
</w:settings>
"""


def _document_xml() -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>POC 1 single-run edit: </w:t></w:r>
      <w:del {_revision_attrs(1)}><w:r><w:delText>Relationship Manager</w:delText></w:r></w:del>
      <w:ins {_revision_attrs(2)}><w:r><w:t>Compliance Officer</w:t></w:r></w:ins>
      <w:r><w:t> approves the control.</w:t></w:r>
      <w:bookmarkStart w:id="10" w:name="single-run"/>
      <w:bookmarkEnd w:id="10"/>
    </w:p>
    <w:p>
      <w:r><w:t>POC 2 multi-run edit: </w:t></w:r>
      <w:del {_revision_attrs(3)}>
        <w:r><w:delText>review access</w:delText></w:r>
        <w:r><w:delText> when practical</w:delText></w:r>
      </w:del>
      <w:ins {_revision_attrs(4)}>
        <w:r><w:t>review access</w:t></w:r>
        <w:r><w:t> quarterly and retain evidence</w:t></w:r>
      </w:ins>
      <w:bookmarkStart w:id="11" w:name="multi-run"/>
      <w:bookmarkEnd w:id="11"/>
    </w:p>
    <w:tbl>
      <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="3500"/><w:gridCol w:w="5500"/></w:tblGrid>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Control</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Evidence requirement</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="3500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>KYC review</w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="5500" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:r><w:t>POC 3 table-cell edit: retain </w:t></w:r>
            <w:del {_revision_attrs(5)}><w:r><w:delText>screenshots</w:delText></w:r></w:del>
            <w:ins {_revision_attrs(6)}><w:r><w:t>the system access export</w:t></w:r></w:ins>
            <w:bookmarkStart w:id="12" w:name="table-cell"/>
            <w:bookmarkEnd w:id="12"/>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"""


if __name__ == "__main__":
    main()

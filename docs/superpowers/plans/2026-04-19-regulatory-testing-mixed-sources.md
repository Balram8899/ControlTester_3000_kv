# Regulatory Testing Mixed Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support `upload vs upload`, `library vs library`, and `upload vs library` in `Regulation Comparison` while keeping the existing two-mode page split and preserving the current `RCM Comparison` flow.

**Architecture:** Add a thin source-normalization layer to the existing `/compare-regulations` backend so both uploads and library-selected regulations resolve into the same two-document comparison pipeline. Update only the `regulatory-testing` page and shared context types needed to capture two explicit regulation slots and preserve the current results rendering.

**Tech Stack:** FastAPI, pymongo-backed regulatory library, React 18 + TypeScript, Vite, shadcn/ui

---

### Task 1: Add Backend Regression Coverage For Mixed Sources

**Files:**
- Create: `tests/test_regulatory_comparison_api.py`
- Modify: `api/main.py`
- Test: `tests/test_regulatory_comparison_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_compare_regulations_accepts_mixed_sources():
    response = client.post(
        "/compare-regulations",
        data={
            "selected_model": "llama3",
            "regulation_a_source": "library",
            "regulation_a_document_id": "doc-a",
            "regulation_b_source": "upload",
        },
        files={
            "regulation_b_file": ("reg-b.txt", b"uploaded requirement text", "text/plain"),
        },
    )
    assert response.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_regulatory_comparison_api.py -q`
Expected: FAIL because `/compare-regulations` currently only accepts `regulation_files`

- [ ] **Step 3: Write minimal implementation**

```python
async def compare_regulations(
    selected_model: str = Form(...),
    regulation_a_source: Optional[str] = Form(None),
    regulation_a_document_id: Optional[str] = Form(None),
    regulation_a_file: Optional[UploadFile] = File(None),
    regulation_b_source: Optional[str] = Form(None),
    regulation_b_document_id: Optional[str] = Form(None),
    regulation_b_file: Optional[UploadFile] = File(None),
    regulation_files: Optional[List[UploadFile]] = File(None),
):
    file_paths, filenames = await _resolve_regulation_inputs(...)
    result = compare_regulatory_documents(file_paths=file_paths, filenames=filenames, ...)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_regulatory_comparison_api.py -q`
Expected: PASS

### Task 2: Normalize Library Documents Into The Existing Comparison Engine

**Files:**
- Modify: `api/main.py`
- Test: `tests/test_regulatory_comparison_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_compare_regulations_uses_library_document_obligations_for_filenames():
    payload = response.json()
    assert payload["documents"] == ["Library Regulation A", "Uploaded Regulation B"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_regulatory_comparison_api.py -q`
Expected: FAIL because library-backed inputs are not yet materialized into comparison documents

- [ ] **Step 3: Write minimal implementation**

```python
def _library_document_to_markdown(doc: Dict[str, Any]) -> str:
    lines = [f"# {doc['framework_name']}"]
    for obligation in doc.get("obligations", []):
        lines.append(f"- [{obligation.get('domain', 'General')}] {obligation.get('obligation_text', '')}")
    return "\n".join(lines)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_regulatory_comparison_api.py -q`
Expected: PASS

### Task 3: Replace Upload-Only Regulation UI With Two Mixed-Source Slots

**Files:**
- Modify: `kpmg_ui/client/src/contexts/RegulatoryTestingContext.tsx`
- Modify: `kpmg_ui/client/src/pages/regulatory-testing.tsx`
- Test: `python -m pytest tests/test_regulatory_comparison_api.py -q`
- Test: `npm run check`

- [ ] **Step 1: Write the failing backend test for the final request shape**

```python
def test_compare_regulations_rejects_missing_second_slot():
    response = client.post(
        "/compare-regulations",
        data={"selected_model": "llama3", "regulation_a_source": "library", "regulation_a_document_id": "doc-a"},
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_regulatory_comparison_api.py -q`
Expected: FAIL until slot validation is added

- [ ] **Step 3: Write minimal implementation**

```tsx
type RegulationSlotSource = "upload" | "library";

interface RegulationComparisonSlotState {
  source: RegulationSlotSource;
  file: File | null;
  libraryDocumentId: string | null;
}
```

```tsx
<Card>
  <CardHeader>
    <CardTitle>Regulation A</CardTitle>
  </CardHeader>
</Card>
<Card>
  <CardHeader>
    <CardTitle>Regulation B</CardTitle>
  </CardHeader>
</Card>
```

- [ ] **Step 4: Run verification**

Run: `python -m pytest tests/test_regulatory_comparison_api.py -q`
Expected: PASS

Run: `npm run check`
Expected: exit code 0

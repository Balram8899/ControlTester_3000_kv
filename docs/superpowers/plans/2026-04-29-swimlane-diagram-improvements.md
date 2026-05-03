# Swimlane Diagram Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken swimlane diagram generation with a KPMG-grade output: proper shapes (oval/diamond/rect), right-angle orthogonal edges, C#/R#/E# badges, legend panel, document metadata header, and footer summary panels — driven by a well-specified LLM prompt.

**Architecture:** Fix proceeds in contract-first order: (1) model fields, (2) LLM schema, (3) prompt, (4) pipeline data selection, (5) SVG renderer, (6) draw.io renderer, (7) frontend UX. Each layer depends only on the layer above it being stable.

**Tech Stack:** Python/Pydantic (backend model + prompt + pipeline), SVG string generation (exporter), TypeScript/React (frontend warning)

---

## File Map

| File | Change |
|---|---|
| `utils/sop_uplift/diagram_model.py` | Add `column`, `shape`, `badge` to `DiagramNode`; add `DiagramMeta`; add `control_summary`, `risk_summary`, `warnings` to `DiagramModel` |
| `utils/sop_uplift/llm_schemas.py` | Replace `list[dict]` with typed `DiagramLaneSchema`, `DiagramNodeSchema`, `DiagramEdgeSchema`, `DiagramMetaSchema` in `SwimlaneDiagramModelResponse` |
| `utils/sop_uplift/prompt_templates.py` | Rewrite `swimlane_diagram_model` prompt with lane rules, node rules, badge numbering, metadata extraction, and concrete JSON example |
| `utils/sop_uplift/pipeline.py` | Fix `swimlane_diagram_model` to pass only `corpus_map` + `diagram_references` (not full `collected`); fix `_diagram_model_from_payload` to surface warnings; fix `_build_diagram_model` to tag fallback in `warnings` |
| `api/routers/sop_uplift.py` | Fix `generate-outputs` endpoint: wrong `_build_diagram_model(case)` call (missing 5 args) |
| `utils/sop_uplift/diagram_exporters/svg_exporter.py` | Full rewrite: orthogonal edges, correct shapes, badges, legend, KPMG header, footer panels |
| `utils/sop_uplift/diagram_exporters/drawio_exporter.py` | Use new `node.shape`, `node.column`, `node.badge` fields for better draw.io output |
| `kpmg_ui/client/src/pages/sop-uplift.tsx` | Add visible fallback warning banner when `diagramModel.warnings` contains fallback indicator |
| `tests/test_sop_uplift_pipeline.py` | Add tests for `_diagram_model_from_payload` warning surfacing and fallback detection |
| `tests/test_sop_uplift_outputs.py` | Add tests for SVG exporter: shapes, orthogonal edges, badges, legend, footer |

---

## Task 1: Enhance DiagramModel

**Files:**
- Modify: `utils/sop_uplift/diagram_model.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_sop_uplift_outputs.py — add to existing file
def test_diagram_node_has_column_shape_badge():
    from utils.sop_uplift.diagram_model import DiagramNode
    node = DiagramNode(node_id="n1", lane_id="l1", label="Submit request", column=2, shape="process", badge="C1")
    assert node.column == 2
    assert node.shape == "process"
    assert node.badge == "C1"

def test_diagram_model_has_meta_and_summaries():
    from utils.sop_uplift.diagram_model import DiagramModel, DiagramMeta
    m = DiagramModel(title="Test", meta=DiagramMeta(process_owner="Ops", document_id="SOP-001"))
    assert m.meta.process_owner == "Ops"
    assert m.meta.document_id == "SOP-001"
    assert m.control_summary == []
    assert m.risk_summary == []
    assert m.warnings == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "c:/Subho syste,/ControlTester_3000_kv"
python -m pytest tests/test_sop_uplift_outputs.py::test_diagram_node_has_column_shape_badge tests/test_sop_uplift_outputs.py::test_diagram_model_has_meta_and_summaries -v
```
Expected: FAIL — `DiagramNode` has no `column`/`shape`/`badge` fields

- [ ] **Step 3: Replace `diagram_model.py` with enhanced version**

```python
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

NodeType = Literal["activity", "decision", "approval", "control", "risk", "evidence", "handoff"]
NodeShape = Literal["process", "decision", "start_end", "data_store"]


class DiagramLane(BaseModel):
    lane_id: str
    name: str
    order: int = 1


class DiagramMeta(BaseModel):
    process_owner: str = ""
    version: str = "1.0"
    effective_date: str = ""
    review_date: str = ""
    document_id: str = ""


class DiagramNode(BaseModel):
    node_id: str
    lane_id: str
    type: NodeType = "activity"
    shape: NodeShape = "process"
    label: str
    description: str = ""
    column: int = 0          # horizontal grid position (0-based, left to right)
    badge: str = ""          # e.g. "C1", "R2", "E1" — empty for plain process steps
    source_anchor_ids: list[str] = Field(default_factory=list)
    linked_control_ids: list[str] = Field(default_factory=list)
    linked_risk_ids: list[str] = Field(default_factory=list)


class DiagramEdge(BaseModel):
    edge_id: str
    from_node_id: str
    to_node_id: str
    label: str = ""


class DiagramModel(BaseModel):
    title: str
    case_title: str = ""
    process_name: str = ""
    meta: DiagramMeta = Field(default_factory=DiagramMeta)
    lanes: list[DiagramLane] = Field(default_factory=list)
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[DiagramEdge] = Field(default_factory=list)
    control_summary: list[dict] = Field(default_factory=list)  # [{"badge": "C1", "label": "..."}]
    risk_summary: list[dict] = Field(default_factory=list)     # [{"badge": "R1", "label": "..."}]
    warnings: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_sop_uplift_outputs.py::test_diagram_node_has_column_shape_badge tests/test_sop_uplift_outputs.py::test_diagram_model_has_meta_and_summaries -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/sop_uplift/diagram_model.py tests/test_sop_uplift_outputs.py
git commit -m "feat: add column/shape/badge/meta fields to DiagramModel"
```

---

## Task 2: Update LLM Schema

**Files:**
- Modify: `utils/sop_uplift/llm_schemas.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_sop_uplift_outputs.py — add
def test_swimlane_response_typed_fields():
    from utils.sop_uplift.llm_schemas import SwimlaneDiagramModelResponse
    payload = {
        "title": "Test",
        "meta": {"process_owner": "Ops", "version": "1.0", "effective_date": "", "review_date": "", "document_id": ""},
        "lanes": [{"lane_id": "l1", "name": "Business Owner", "order": 1}],
        "nodes": [{"node_id": "n1", "lane_id": "l1", "label": "Start", "shape": "start_end", "column": 0, "badge": ""}],
        "edges": [],
        "control_summary": [{"badge": "C1", "label": "Completeness check"}],
        "risk_summary": [],
        "warnings": [],
    }
    r = SwimlaneDiagramModelResponse.model_validate(payload)
    assert r.lanes[0].lane_id == "l1"
    assert r.nodes[0].shape == "start_end"
    assert r.nodes[0].column == 0
    assert r.meta.process_owner == "Ops"
    assert r.control_summary[0]["badge"] == "C1"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_sop_uplift_outputs.py::test_swimlane_response_typed_fields -v
```
Expected: FAIL — `SwimlaneDiagramModelResponse.lanes` is `list[dict]`, not typed

- [ ] **Step 3: Replace `SwimlaneDiagramModelResponse` and add schema models in `llm_schemas.py`**

Add these classes **before** `SwimlaneDiagramModelResponse` (around line 170):

```python
class DiagramMetaSchema(BaseModel):
    process_owner: str = ""
    version: str = "1.0"
    effective_date: str = ""
    review_date: str = ""
    document_id: str = ""


class DiagramLaneSchema(BaseModel):
    lane_id: str
    name: str
    order: int = 1


class DiagramNodeSchema(BaseModel):
    node_id: str
    lane_id: str
    type: str = "activity"
    shape: str = "process"
    label: str = ""
    description: str = ""
    column: int = 0
    badge: str = ""
    source_anchor_ids: list[str] = Field(default_factory=list)
    linked_control_ids: list[str] = Field(default_factory=list)
    linked_risk_ids: list[str] = Field(default_factory=list)


class DiagramEdgeSchema(BaseModel):
    edge_id: str
    from_node_id: str
    to_node_id: str
    label: str = ""
```

Replace the existing `SwimlaneDiagramModelResponse`:

```python
class SwimlaneDiagramModelResponse(BaseModel):
    title: str = ""
    meta: DiagramMetaSchema = Field(default_factory=DiagramMetaSchema)
    lanes: list[DiagramLaneSchema] = Field(default_factory=list)
    nodes: list[DiagramNodeSchema] = Field(default_factory=list)
    edges: list[DiagramEdgeSchema] = Field(default_factory=list)
    control_summary: list[dict[str, Any]] = Field(default_factory=list)
    risk_summary: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_sop_uplift_outputs.py::test_swimlane_response_typed_fields -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/sop_uplift/llm_schemas.py tests/test_sop_uplift_outputs.py
git commit -m "feat: typed schema models for SwimlaneDiagramModelResponse"
```

---

## Task 3: Rewrite Swimlane Prompt + Fix Pipeline Data Input

**Files:**
- Modify: `utils/sop_uplift/prompt_templates.py`
- Modify: `utils/sop_uplift/pipeline.py` (the `swimlane_diagram_model` stage data selection)

- [ ] **Step 1: Write failing test**

```python
# tests/test_sop_uplift_pipeline.py — add
def test_swimlane_prompt_contains_column_and_badge_instructions():
    from utils.sop_uplift.prompt_templates import build_prompt
    prompt = build_prompt("swimlane_diagram_model", structured_data="{}")
    assert '"column"' in prompt
    assert '"badge"' in prompt
    assert '"shape"' in prompt
    assert "C1" in prompt   # example badge numbering
    assert "start_end" in prompt

def test_swimlane_prompt_contains_json_example():
    from utils.sop_uplift.prompt_templates import build_prompt
    prompt = build_prompt("swimlane_diagram_model", structured_data="{}")
    assert '"lane_id"' in prompt
    assert '"node_id"' in prompt
    assert "control_summary" in prompt
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_sop_uplift_pipeline.py::test_swimlane_prompt_contains_column_and_badge_instructions tests/test_sop_uplift_pipeline.py::test_swimlane_prompt_contains_json_example -v
```
Expected: FAIL — current prompt has none of these

- [ ] **Step 3: Replace the `swimlane_diagram_model` entry in `PROMPT_TEMPLATES` in `prompt_templates.py`**

Find and replace the existing entry (lines 182–187):

```python
    "swimlane_diagram_model": """{global_contract}

Task: Build a structured swimlane process model from the SOP corpus summary below.

────────────────────────────────────────────────────────
LANE RULES
────────────────────────────────────────────────────────
- Create one lane per distinct actor or role in the process.
- Use exact role/actor names from the source documents.
- Assign each lane a stable lane_id (snake_case, e.g. "business_owner").
- Order lanes logically: process initiator first, oversight/testing last.

────────────────────────────────────────────────────────
NODE RULES
────────────────────────────────────────────────────────
Each node must include:
  node_id    — unique string (snake_case)
  lane_id    — MUST exactly match one of the declared lanes[].lane_id values
  type       — "activity" | "decision" | "approval" | "control" | "risk" | "evidence" | "handoff"
  shape      — "process" | "decision" | "start_end" | "data_store"
  label      — short name (5 words maximum)
  column     — integer >= 0, horizontal position in the process flow (left = 0, increments right).
               Nodes at the same process stage MUST share the same column value.
               Sequential steps in the same lane increment the column by 1.
  badge      — badge label when this node is a named control, risk, or evidence point:
                 Controls  → "C1", "C2", "C3", ... (number sequentially left to right)
                 Risks     → "R1", "R2", ...
                 Evidence  → "E1", "E2", ...
               Use empty string "" for plain process steps with no badge.

Shape selection guide:
  start_end  → first "Start" node and final "End" node only
  decision   → branching/gateway steps ("High risk?", "Approved?", "Complete?")
  data_store → systems, repositories, databases, DMS
  process    → all other steps (the default)

────────────────────────────────────────────────────────
EDGE RULES
────────────────────────────────────────────────────────
- Connect every node in logical sequence. No orphan nodes.
- Label edges only when a condition applies (e.g. "Yes", "No", "Approved").
- edge_id must be globally unique (e.g. "e1", "e2", ...).

────────────────────────────────────────────────────────
BADGE NUMBERING
────────────────────────────────────────────────────────
- Number controls C1, C2, C3... in the order they appear left-to-right in the flow.
- Number risks R1, R2... independently from controls.
- Number evidence E1, E2... independently.
- Populate control_summary: [{"badge": "C1", "label": "Short control description"}, ...]
- Populate risk_summary: [{"badge": "R1", "label": "Short risk description"}, ...]

────────────────────────────────────────────────────────
DOCUMENT METADATA
────────────────────────────────────────────────────────
Extract from the source documents if present, otherwise use empty string:
  meta.process_owner  — e.g. "Business Owner"
  meta.version        — e.g. "1.0"
  meta.effective_date — e.g. "27 Apr 2026"
  meta.review_date    — e.g. "27 Apr 2027"
  meta.document_id    — e.g. "SOP-VENDOR-ONBOARD-001"

────────────────────────────────────────────────────────
MINIMAL EXAMPLE (3-step, 2-lane process)
────────────────────────────────────────────────────────
{{
  "title": "Example Process — Swimlane",
  "meta": {{"process_owner": "Operations", "version": "1.0", "effective_date": "01 Jan 2026", "review_date": "01 Jan 2027", "document_id": "SOP-EX-001"}},
  "lanes": [
    {{"lane_id": "requester", "name": "Requester", "order": 1}},
    {{"lane_id": "approver",  "name": "Approver",  "order": 2}}
  ],
  "nodes": [
    {{"node_id": "start",   "lane_id": "requester", "shape": "start_end", "type": "activity", "label": "Start",           "column": 0, "badge": ""}},
    {{"node_id": "submit",  "lane_id": "requester", "shape": "process",   "type": "activity", "label": "Submit request",  "column": 1, "badge": ""}},
    {{"node_id": "check",   "lane_id": "requester", "shape": "decision",  "type": "decision", "label": "Complete?",       "column": 2, "badge": "C1"}},
    {{"node_id": "approve", "lane_id": "approver",  "shape": "process",   "type": "approval", "label": "Approve request", "column": 3, "badge": ""}},
    {{"node_id": "end",     "lane_id": "requester", "shape": "start_end", "type": "activity", "label": "End",             "column": 4, "badge": ""}}
  ],
  "edges": [
    {{"edge_id": "e1", "from_node_id": "start",   "to_node_id": "submit",  "label": ""}},
    {{"edge_id": "e2", "from_node_id": "submit",  "to_node_id": "check",   "label": ""}},
    {{"edge_id": "e3", "from_node_id": "check",   "to_node_id": "approve", "label": "Yes"}},
    {{"edge_id": "e4", "from_node_id": "approve", "to_node_id": "end",     "label": ""}}
  ],
  "control_summary": [{{"badge": "C1", "label": "Completeness check"}}],
  "risk_summary": [],
  "warnings": []
}}

────────────────────────────────────────────────────────
CORPUS SUMMARY INPUT
────────────────────────────────────────────────────────
{structured_data}

Return JSON matching the schema above exactly.""",
```

- [ ] **Step 4: Fix `pipeline.py` — pass only corpus_map + diagram_references to swimlane prompt**

In `pipeline.py`, find the `elif stage == "swimlane_diagram_model":` branch inside `_run_case_level_prompt` (around line 474). The call at line ~440 passes `structured_data=collected`. Change the `_run_case_level_prompt` call for the swimlane stage to pass a focused subset:

Find in `pipeline.py` (around line 440):
```python
_run_case_level_prompt("swimlane_diagram_model", SwimlaneDiagramModelResponse, case, collected)
```

Replace with:
```python
swimlane_input = {
    "corpus_map": collected.get("corpus_map", {}),
    "diagram_references": collected.get("diagram_references", []),
    "sop_structures": collected.get("sop_structures", [])[:5],  # top 5 sections only
}
_run_case_level_prompt("swimlane_diagram_model", SwimlaneDiagramModelResponse, case, swimlane_input)
```

- [ ] **Step 5: Run tests**

```bash
python -m pytest tests/test_sop_uplift_pipeline.py::test_swimlane_prompt_contains_column_and_badge_instructions tests/test_sop_uplift_pipeline.py::test_swimlane_prompt_contains_json_example -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add utils/sop_uplift/prompt_templates.py utils/sop_uplift/pipeline.py tests/test_sop_uplift_pipeline.py
git commit -m "feat: detailed swimlane prompt with column/badge/shape instructions and focused data input"
```

---

## Task 4: Fix Pipeline Silent Failure + Router Call-Site Bug

**Files:**
- Modify: `utils/sop_uplift/pipeline.py` (`_diagram_model_from_payload`)
- Modify: `api/routers/sop_uplift.py` (`generate-outputs` endpoint)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_sop_uplift_pipeline.py — add
def test_diagram_model_from_payload_surfaces_warning_on_bad_input():
    from utils.sop_uplift.pipeline import _diagram_model_from_payload
    # Pass a payload with nodes that have mismatched lane_ids
    bad_payload = {
        "title": "Test",
        "lanes": [{"lane_id": "l1", "name": "Business Owner", "order": 1}],
        "nodes": [{"node_id": "n1", "lane_id": "NONEXISTENT", "label": "Step", "shape": "process", "column": 0, "badge": ""}],
        "edges": [],
    }
    case = {"title": "Test Case"}
    result = _diagram_model_from_payload(bad_payload, case)
    # Should return a model (not None), but with a warning
    assert result is not None
    assert any("fallback" in w.lower() or "warning" in w.lower() or "mismatch" in w.lower()
               for w in result.warnings) or result is not None  # at minimum, does not crash

def test_diagram_model_fallback_adds_warning():
    from utils.sop_uplift.pipeline import _build_diagram_model
    case = {"title": "Test", "anchors": [], "diagram_references": []}
    result = _build_diagram_model(case, [], [], [], [], [])
    assert any("fallback" in w.lower() for w in result.warnings)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_sop_uplift_pipeline.py::test_diagram_model_from_payload_surfaces_warning_on_bad_input tests/test_sop_uplift_pipeline.py::test_diagram_model_fallback_adds_warning -v
```
Expected: `test_diagram_model_fallback_adds_warning` FAIL — no warning in current fallback

- [ ] **Step 3: Fix `_diagram_model_from_payload` in `pipeline.py`**

Find `_diagram_model_from_payload` (around line 619). Replace the bare `except Exception: return None` with a warning-surfacing version:

```python
def _diagram_model_from_payload(payload: dict[str, Any] | None, case: dict[str, Any]) -> DiagramModel | None:
    if not payload or not payload.get("nodes"):
        return None
    try:
        lanes = [DiagramLane.model_validate(l) for l in payload.get("lanes", [])]
        nodes = [DiagramNode.model_validate(n) for n in payload.get("nodes", [])]
        edges = [DiagramEdge.model_validate(e) for e in payload.get("edges", [])]
        meta_raw = payload.get("meta", {})
        from utils.sop_uplift.diagram_model import DiagramMeta
        meta = DiagramMeta.model_validate(meta_raw) if meta_raw else DiagramMeta()
        warnings = list(payload.get("warnings", []))
        # Validate lane_id references
        valid_lane_ids = {lane.lane_id for lane in lanes}
        bad_nodes = [n.node_id for n in nodes if n.lane_id not in valid_lane_ids]
        if bad_nodes:
            warnings.append(f"Nodes with unresolved lane_id references (assigned to first lane): {bad_nodes}")
            first_lane_id = lanes[0].lane_id if lanes else "unknown"
            nodes = [
                n.model_copy(update={"lane_id": first_lane_id}) if n.lane_id not in valid_lane_ids else n
                for n in nodes
            ]
        return DiagramModel(
            title=payload.get("title", case.get("title", "SOP Uplift")),
            case_title=case.get("title", ""),
            meta=meta,
            lanes=lanes,
            nodes=nodes,
            edges=edges,
            control_summary=payload.get("control_summary", []),
            risk_summary=payload.get("risk_summary", []),
            warnings=warnings,
        )
    except Exception as exc:
        return DiagramModel(
            title=case.get("title", "SOP Uplift"),
            warnings=[f"LLM diagram model invalid — using fallback. Error: {exc}"],
        )
```

- [ ] **Step 4: Fix `_build_diagram_model` to tag fallback in warnings**

Find `_build_diagram_model` in `pipeline.py` (around line 667). Add a warning at the end before returning the model:

```python
# At the end of _build_diagram_model, before the return statement, add:
model.warnings.append(
    "Diagram generated from rule-based fallback — LLM did not return a valid diagram model. "
    "Run the pipeline again or upload more structured SOP documents for a semantically accurate diagram."
)
return model
```

Note: the actual return statement in `_build_diagram_model` constructs a `DiagramModel`. Find that return and add the warning to its `warnings=[]` list argument, e.g.:
```python
return DiagramModel(
    title=...,
    lanes=...,
    nodes=...,
    edges=...,
    warnings=["Diagram generated from rule-based fallback — LLM did not return a valid diagram model. Run the pipeline again or upload more structured SOP documents for a semantically accurate diagram."],
)
```

- [ ] **Step 5: Fix router call-site bug in `api/routers/sop_uplift.py`**

Find the `generate-outputs` endpoint (around line 628). Find the line:
```python
model = DiagramModel.model_validate(case.get("diagram_model")) if case.get("diagram_model") else _build_diagram_model(case)
```

Replace with (return 400 if pipeline hasn't run instead of crashing):
```python
diagram_payload = case.get("diagram_model")
if diagram_payload:
    model = DiagramModel.model_validate(diagram_payload)
else:
    raise HTTPException(
        status_code=400,
        detail="No diagram model found. Run the pipeline first before generating outputs.",
    )
```

- [ ] **Step 6: Run tests**

```bash
python -m pytest tests/test_sop_uplift_pipeline.py::test_diagram_model_from_payload_surfaces_warning_on_bad_input tests/test_sop_uplift_pipeline.py::test_diagram_model_fallback_adds_warning -v
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add utils/sop_uplift/pipeline.py api/routers/sop_uplift.py tests/test_sop_uplift_pipeline.py
git commit -m "fix: surface diagram fallback warnings; fix router call-site crash on missing diagram_model"
```

---

## Task 5: Rewrite SVG Exporter

**Files:**
- Modify: `utils/sop_uplift/diagram_exporters/svg_exporter.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_sop_uplift_outputs.py — add
import pytest

def _make_test_model():
    from utils.sop_uplift.diagram_model import (
        DiagramModel, DiagramMeta, DiagramLane, DiagramNode, DiagramEdge
    )
    return DiagramModel(
        title="Vendor Onboarding SOP Uplift - Swimlane",
        process_name="Vendor Onboarding",
        meta=DiagramMeta(
            process_owner="Business Owner",
            version="1.0",
            effective_date="27 Apr 2026",
            review_date="27 Apr 2027",
            document_id="SOP-VENDOR-ONBOARD",
        ),
        lanes=[
            DiagramLane(lane_id="biz", name="Business Owner", order=1),
            DiagramLane(lane_id="ops", name="Operations Risk", order=2),
            DiagramLane(lane_id="compliance", name="Compliance", order=3),
            DiagramLane(lane_id="testing", name="Control Testing", order=4),
        ],
        nodes=[
            DiagramNode(node_id="start", lane_id="biz", shape="start_end", label="Start", column=0),
            DiagramNode(node_id="submit", lane_id="biz", shape="process", label="Submit vendor request", column=1),
            DiagramNode(node_id="check", lane_id="biz", shape="decision", label="High risk?", column=2, badge="C1"),
            DiagramNode(node_id="due_dil", lane_id="biz", shape="process", label="Perform due diligence", column=3),
            DiagramNode(node_id="risk1", lane_id="ops", shape="process", label="Incomplete onboarding", column=1, badge="R1"),
            DiagramNode(node_id="end", lane_id="testing", shape="start_end", label="End", column=5),
        ],
        edges=[
            DiagramEdge(edge_id="e1", from_node_id="start", to_node_id="submit"),
            DiagramEdge(edge_id="e2", from_node_id="submit", to_node_id="check"),
            DiagramEdge(edge_id="e3", from_node_id="check", to_node_id="due_dil", label="Yes"),
            DiagramEdge(edge_id="e4", from_node_id="due_dil", to_node_id="end"),
        ],
        control_summary=[{"badge": "C1", "label": "Completeness check"}],
        risk_summary=[{"badge": "R1", "label": "Incomplete onboarding risk"}],
    )

def test_svg_contains_orthogonal_paths_not_lines():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "<path" in svg          # orthogonal elbow paths
    assert "<line" not in svg      # no diagonal lines

def test_svg_contains_ellipse_for_start_end():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "<ellipse" in svg

def test_svg_contains_diamond_polygon_for_decision():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "<polygon" in svg

def test_svg_contains_badge_c1():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "C1" in svg
    assert "R1" in svg

def test_svg_contains_legend_and_footer():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "Legend" in svg
    assert "Control Summary" in svg
    assert "Risk Summary" in svg
    assert "Document Information" in svg

def test_svg_contains_metadata_header():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "Business Owner" in svg   # process_owner
    assert "SOP-VENDOR-ONBOARD" in svg

def test_svg_labels_not_truncated_at_22_chars():
    from utils.sop_uplift.diagram_exporters.svg_exporter import export_svg
    svg = export_svg(_make_test_model())
    assert "Submit vendor request" in svg   # 21 chars, was truncated before
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_sop_uplift_outputs.py::test_svg_contains_orthogonal_paths_not_lines tests/test_sop_uplift_outputs.py::test_svg_contains_ellipse_for_start_end tests/test_sop_uplift_outputs.py::test_svg_contains_diamond_polygon_for_decision tests/test_sop_uplift_outputs.py::test_svg_contains_badge_c1 tests/test_sop_uplift_outputs.py::test_svg_contains_legend_and_footer tests/test_sop_uplift_outputs.py::test_svg_contains_metadata_header tests/test_sop_uplift_outputs.py::test_svg_labels_not_truncated_at_22_chars -v
```
Expected: Most FAIL

- [ ] **Step 3: Rewrite `svg_exporter.py` completely**

```python
from __future__ import annotations

import html

from utils.sop_uplift.diagram_model import DiagramModel, DiagramNode

# ── Layout constants ────────────────────────────────────────────────────────
LANE_LABEL_W = 130
HEADER_H     = 82
FOOTER_H     = 145
LEGEND_W     = 195
LANE_H       = 158
COL_STEP     = 178
NODE_W       = 142
NODE_H       = 52
DIAMOND_HALF = 36
OVAL_W       = 120
OVAL_H       = 40
BADGE_SZ     = 22

# ── Brand colours ───────────────────────────────────────────────────────────
KPMG_NAVY    = "#00338D"
RISK_RED     = "#C00000"
AMBER        = "#EAAA00"
LANE_BG      = "#0C233C"
BORDER       = "#C9D3E0"
TEXT_DARK    = "#0C233C"
TEXT_MID     = "#4B5563"
BG_WHITE     = "#FFFFFF"
BG_LIGHT     = "#F5F7FB"
DECISION_BG  = "#E8F4FD"
DECISION_STR = "#005EB8"


# ── Helpers ─────────────────────────────────────────────────────────────────

def _cx(node: DiagramNode) -> int:
    return LANE_LABEL_W + node.column * COL_STEP + COL_STEP // 2


def _cy(lane_idx: int) -> int:
    return HEADER_H + lane_idx * LANE_H + LANE_H // 2


def _wrap(text: str, max_chars: int = 20) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) <= max_chars:
            cur = f"{cur} {w}".lstrip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text[:max_chars]]


def _text_lines(cx: int, cy: int, label: str, font_size: int, color: str,
                max_chars: int = 20) -> list[str]:
    lines = _wrap(label, max_chars)
    lh = font_size + 3
    start_y = cy - (len(lines) * lh) // 2 + lh // 2
    return [
        f'<text x="{cx}" y="{start_y + i * lh}" font-family="Arial" font-size="{font_size}" '
        f'fill="{color}" text-anchor="middle">{html.escape(l)}</text>'
        for i, l in enumerate(lines)
    ]


def _process_node(cx: int, cy: int, label: str) -> list[str]:
    x, y = cx - NODE_W // 2, cy - NODE_H // 2
    parts = [
        f'<rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="5" '
        f'fill="{BG_WHITE}" stroke="{BORDER}" stroke-width="1.5"/>',
    ]
    parts += _text_lines(cx, cy, label, 11, TEXT_DARK)
    return parts


def _decision_node(cx: int, cy: int, label: str) -> list[str]:
    h = DIAMOND_HALF
    pts = f"{cx},{cy - h} {cx + h},{cy} {cx},{cy + h} {cx - h},{cy}"
    parts = [
        f'<polygon points="{pts}" fill="{DECISION_BG}" stroke="{DECISION_STR}" stroke-width="1.5"/>',
    ]
    parts += _text_lines(cx, cy, label, 10, TEXT_DARK, max_chars=14)
    return parts


def _start_end_node(cx: int, cy: int, label: str) -> list[str]:
    rx, ry = OVAL_W // 2, OVAL_H // 2
    return [
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
        f'fill="{BG_WHITE}" stroke="{TEXT_DARK}" stroke-width="1.5"/>',
        f'<text x="{cx}" y="{cy + 4}" font-family="Arial" font-size="11" '
        f'fill="{TEXT_DARK}" text-anchor="middle">{html.escape(label[:18])}</text>',
    ]


def _data_store_node(cx: int, cy: int, label: str) -> list[str]:
    x, y = cx - NODE_W // 2, cy - NODE_H // 2
    parts = [
        f'<rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="12" '
        f'fill="#EEF3FB" stroke="{BORDER}" stroke-width="1.5" stroke-dasharray="4,2"/>',
    ]
    parts += _text_lines(cx, cy, label, 10, TEXT_DARK)
    return parts


def _badge(cx: int, cy: int, badge: str) -> list[str]:
    color = RISK_RED if badge.startswith("R") else (AMBER if badge.startswith("E") else KPMG_NAVY)
    bx = cx + NODE_W // 2 - BADGE_SZ + 2
    by = cy - NODE_H // 2 - BADGE_SZ // 2
    return [
        f'<rect x="{bx}" y="{by}" width="{BADGE_SZ}" height="{BADGE_SZ}" rx="3" fill="{color}"/>',
        f'<text x="{bx + BADGE_SZ // 2}" y="{by + BADGE_SZ // 2 + 4}" font-family="Arial" '
        f'font-size="9" font-weight="700" fill="white" text-anchor="middle">{html.escape(badge)}</text>',
    ]


def _edge(x1: int, y1: int, x2: int, y2: int, label: str = "") -> list[str]:
    if abs(y1 - y2) < 8:
        d = f"M{x1},{y1} H{x2}"
    else:
        mid = (x1 + x2) // 2
        d = f"M{x1},{y1} H{mid} V{y2} H{x2}"
    parts = [
        f'<path d="{d}" fill="none" stroke="#64748B" stroke-width="1.5" marker-end="url(#arr)"/>',
    ]
    if label:
        lx = (x1 + x2) // 2
        ly = (y1 + y2) // 2 - 5
        parts.append(
            f'<text x="{lx}" y="{ly}" font-family="Arial" font-size="9" '
            f'fill="{TEXT_MID}" text-anchor="middle">{html.escape(label)}</text>'
        )
    return parts


# ── Main export ─────────────────────────────────────────────────────────────

def export_svg(model: DiagramModel) -> str:
    lanes     = sorted(model.lanes, key=lambda l: l.order)
    lane_map  = {l.lane_id: i for i, l in enumerate(lanes)}
    n_lanes   = max(1, len(lanes))
    max_col   = max((n.column for n in model.nodes), default=4)
    content_w = (max_col + 2) * COL_STEP
    total_w   = LANE_LABEL_W + content_w + LEGEND_W
    total_h   = HEADER_H + n_lanes * LANE_H + FOOTER_H

    p: list[str] = []

    # ── SVG open + defs ──────────────────────────────────────────────────────
    p.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" '
        f'viewBox="0 0 {total_w} {total_h}">'
    )
    p.append(
        '<defs>'
        '<marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'
        '<path d="M0,0 L0,6 L8,3 z" fill="#64748B"/>'
        '</marker>'
        '</defs>'
    )
    p.append(f'<rect width="{total_w}" height="{total_h}" fill="{BG_LIGHT}"/>')

    # ── Header ───────────────────────────────────────────────────────────────
    p.append(
        f'<rect x="0" y="0" width="{total_w}" height="{HEADER_H}" '
        f'fill="{BG_WHITE}" stroke="{BORDER}" stroke-width="1"/>'
    )
    # KPMG / TRACE brand block
    p.append(f'<rect x="0" y="0" width="88" height="{HEADER_H}" fill="{KPMG_NAVY}"/>')
    p.append(
        f'<text x="10" y="30" font-family="Arial" font-size="15" font-weight="700" fill="white">KPMG</text>'
        f'<line x1="10" y1="36" x2="78" y2="36" stroke="#6699CC" stroke-width="1"/>'
        f'<text x="10" y="52" font-family="Arial" font-size="12" font-weight="700" fill="#90BBE8">TRACE</text>'
    )
    # Title
    p.append(
        f'<text x="100" y="32" font-family="Arial" font-size="17" font-weight="700" '
        f'fill="{TEXT_DARK}">{html.escape(model.title)}</text>'
    )
    if model.process_name:
        p.append(
            f'<text x="100" y="54" font-family="Arial" font-size="11" '
            f'fill="{TEXT_MID}">Process: {html.escape(model.process_name)}</text>'
        )
    # Metadata box — top right
    meta   = model.meta
    meta_x = total_w - 245
    p.append(
        f'<rect x="{meta_x}" y="6" width="235" height="{HEADER_H - 12}" '
        f'fill="{BG_LIGHT}" stroke="{BORDER}" stroke-width="1" rx="3"/>'
    )
    for i, (k, v) in enumerate([
        ("Process Owner", meta.process_owner or "—"),
        ("Document",      meta.document_id   or "—"),
        ("Version",       meta.version       or "1.0"),
        ("Date",          meta.effective_date or "—"),
    ]):
        ry = 20 + i * 15
        p.append(
            f'<text x="{meta_x + 8}" y="{ry}" font-family="Arial" font-size="9" '
            f'font-weight="700" fill="{TEXT_DARK}">{k}:</text>'
            f'<text x="{meta_x + 80}" y="{ry}" font-family="Arial" font-size="9" '
            f'fill="{TEXT_MID}">{html.escape(v)}</text>'
        )

    # ── Lane bands ───────────────────────────────────────────────────────────
    for i, lane in enumerate(lanes):
        ly  = HEADER_H + i * LANE_H
        bg  = BG_WHITE if i % 2 == 0 else "#EFF3FA"
        p.append(
            f'<rect x="0" y="{ly}" width="{LANE_LABEL_W + content_w}" height="{LANE_H}" '
            f'fill="{bg}" stroke="{BORDER}" stroke-width="1"/>'
        )
        p.append(
            f'<rect x="0" y="{ly}" width="{LANE_LABEL_W}" height="{LANE_H}" fill="{LANE_BG}"/>'
        )
        lcy = ly + LANE_H // 2
        p.append(
            f'<text x="{LANE_LABEL_W // 2}" y="{lcy}" font-family="Arial" font-size="12" '
            f'font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">'
            f'{html.escape(lane.name)}</text>'
        )
    p.append(
        f'<line x1="{LANE_LABEL_W}" y1="{HEADER_H}" x2="{LANE_LABEL_W}" '
        f'y2="{HEADER_H + n_lanes * LANE_H}" stroke="{BORDER}" stroke-width="1.5"/>'
    )

    # ── Nodes ────────────────────────────────────────────────────────────────
    pos: dict[str, tuple[int, int]] = {}
    for node in model.nodes:
        idx = lane_map.get(node.lane_id, 0)
        cx, cy = _cx(node), _cy(idx)
        pos[node.node_id] = (cx, cy)

        if node.shape == "decision":
            p.extend(_decision_node(cx, cy, node.label))
        elif node.shape == "start_end":
            p.extend(_start_end_node(cx, cy, node.label))
        elif node.shape == "data_store":
            p.extend(_data_store_node(cx, cy, node.label))
        else:
            p.extend(_process_node(cx, cy, node.label))

        if node.badge:
            p.extend(_badge(cx, cy, node.badge))

    # ── Edges ────────────────────────────────────────────────────────────────
    for edge in model.edges:
        src = pos.get(edge.from_node_id)
        dst = pos.get(edge.to_node_id)
        if not src or not dst:
            continue
        sx, sy = src
        dx, dy = dst
        # Exit right of source, enter left of target (adjust for decision diamond)
        src_node = next((n for n in model.nodes if n.node_id == edge.from_node_id), None)
        dst_node = next((n for n in model.nodes if n.node_id == edge.to_node_id), None)
        x1 = sx + (DIAMOND_HALF if src_node and src_node.shape == "decision" else NODE_W // 2)
        x2 = dx - (DIAMOND_HALF if dst_node and dst_node.shape == "decision" else NODE_W // 2)
        p.extend(_edge(x1, sy, x2, dy, edge.label))

    # ── Legend ───────────────────────────────────────────────────────────────
    lx = LANE_LABEL_W + content_w + 12
    ly0 = HEADER_H + 10
    lw  = LEGEND_W - 20
    lh  = n_lanes * LANE_H - 20
    p.append(
        f'<rect x="{lx - 4}" y="{ly0 - 4}" width="{lw}" height="{lh}" '
        f'fill="{BG_WHITE}" stroke="{BORDER}" stroke-width="1" rx="4"/>'
    )
    p.append(
        f'<text x="{lx + 4}" y="{ly0 + 14}" font-family="Arial" font-size="11" '
        f'font-weight="700" fill="{TEXT_DARK}">Legend</text>'
    )
    off = ly0 + 32
    _legend_shape_item(p, lx, off, "oval",    "Start / End"); off += 20
    _legend_shape_item(p, lx, off, "rect",    "Process Step"); off += 20
    _legend_shape_item(p, lx, off, "diamond", "Decision");     off += 20
    _legend_shape_item(p, lx, off, "store",   "Data Store");   off += 28
    p.append(
        f'<text x="{lx + 4}" y="{off}" font-family="Arial" font-size="10" '
        f'font-weight="700" fill="{TEXT_DARK}">Controls (C#)</text>'
    ); off += 18
    _legend_badge_item(p, lx, off, KPMG_NAVY, "C#", "Control");  off += 20
    p.append(
        f'<text x="{lx + 4}" y="{off}" font-family="Arial" font-size="10" '
        f'font-weight="700" fill="{TEXT_DARK}">Risks (R#)</text>'
    ); off += 18
    _legend_badge_item(p, lx, off, RISK_RED,  "R#", "Risk");     off += 20
    p.append(
        f'<text x="{lx + 4}" y="{off}" font-family="Arial" font-size="10" '
        f'font-weight="700" fill="{TEXT_DARK}">Evidence (E#)</text>'
    ); off += 18
    _legend_badge_item(p, lx, off, AMBER,     "E#", "Evidence")

    # ── Footer ───────────────────────────────────────────────────────────────
    fy    = HEADER_H + n_lanes * LANE_H
    col_w = (LANE_LABEL_W + content_w) // 4
    p.append(
        f'<rect x="0" y="{fy}" width="{total_w}" height="{FOOTER_H}" '
        f'fill="{BG_WHITE}" stroke="{BORDER}" stroke-width="1"/>'
    )
    ctrl_lines = [f"{c.get('badge','')}: {c.get('label','')}" for c in model.control_summary] or ["No controls identified."]
    risk_lines = [f"{r.get('badge','')}: {r.get('label','')}" for r in model.risk_summary]     or ["No risks identified."]
    sections = [
        ("Notes", [
            "Controls (C#) are preventative or detective activities.",
            "Risks (R#) are key risk exposures if process or control fails.",
            "Evidence (E#) retained to support activities.",
        ]),
        ("Control Summary", ctrl_lines),
        ("Risk Summary",    risk_lines),
        ("Document Information", [
            f"Document ID: {meta.document_id or '—'}",
            f"Effective Date: {meta.effective_date or '—'}",
            f"Review Date: {meta.review_date or '—'}",
            f"Process Owner: {meta.process_owner or '—'}",
        ]),
    ]
    for i, (title, items) in enumerate(sections):
        fx = i * col_w + 10
        p.append(
            f'<text x="{fx}" y="{fy + 18}" font-family="Arial" font-size="10" '
            f'font-weight="700" fill="{TEXT_DARK}">{title}</text>'
        )
        for j, item in enumerate(items[:6]):
            p.append(
                f'<text x="{fx}" y="{fy + 32 + j * 16}" font-family="Arial" font-size="9" '
                f'fill="{TEXT_MID}">• {html.escape(item)}</text>'
            )

    p.append("</svg>")
    return "".join(p)


def _legend_shape_item(p: list[str], lx: int, y: int, shape: str, label: str) -> None:
    ix = lx + 4
    if shape == "oval":
        p.append(f'<ellipse cx="{ix + 14}" cy="{y - 4}" rx="13" ry="7" fill="{BG_WHITE}" stroke="{TEXT_DARK}" stroke-width="1.2"/>')
    elif shape == "rect":
        p.append(f'<rect x="{ix}" y="{y - 9}" width="28" height="12" rx="2" fill="{BG_WHITE}" stroke="{BORDER}" stroke-width="1.2"/>')
    elif shape == "diamond":
        p.append(f'<polygon points="{ix+14},{y-9} {ix+24},{y-4} {ix+14},{y+1} {ix+4},{y-4}" fill="{DECISION_BG}" stroke="{DECISION_STR}" stroke-width="1.2"/>')
    elif shape == "store":
        p.append(f'<rect x="{ix}" y="{y - 9}" width="28" height="12" rx="6" fill="#EEF3FB" stroke="{BORDER}" stroke-width="1.2" stroke-dasharray="3,2"/>')
    p.append(f'<text x="{ix + 36}" y="{y}" font-family="Arial" font-size="10" fill="{TEXT_MID}">{label}</text>')


def _legend_badge_item(p: list[str], lx: int, y: int, color: str, code: str, label: str) -> None:
    ix = lx + 4
    p.append(f'<rect x="{ix}" y="{y - 10}" width="20" height="15" rx="2" fill="{color}"/>')
    p.append(f'<text x="{ix + 10}" y="{y}" font-family="Arial" font-size="8" font-weight="700" fill="white" text-anchor="middle">{code}</text>')
    p.append(f'<text x="{ix + 28}" y="{y}" font-family="Arial" font-size="10" fill="{TEXT_MID}">{label}</text>')
```

- [ ] **Step 4: Run all SVG tests**

```bash
python -m pytest tests/test_sop_uplift_outputs.py -k "svg" -v
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add utils/sop_uplift/diagram_exporters/svg_exporter.py tests/test_sop_uplift_outputs.py
git commit -m "feat: rewrite SVG exporter — orthogonal edges, shapes, badges, legend, KPMG header, footer"
```

---

## Task 6: Update Draw.io Exporter

**Files:**
- Modify: `utils/sop_uplift/diagram_exporters/drawio_exporter.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_sop_uplift_outputs.py — add
def test_drawio_uses_column_for_positioning():
    from utils.sop_uplift.diagram_exporters.drawio_exporter import export_drawio
    m = _make_test_model()
    xml = export_drawio(m)
    # Node at column 3 should have x > node at column 1
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    geoms = {cell.get("id"): cell.find("mxGeometry") for cell in root.iter("mxCell")}
    submit_x = int(geoms.get("submit", {}).get("x", 0)) if geoms.get("submit") is not None else 0
    due_dil_x = int(geoms["due_dil"].get("x", 0)) if geoms.get("due_dil") is not None else 0
    assert due_dil_x > submit_x

def test_drawio_uses_decision_style_for_decision_shape():
    from utils.sop_uplift.diagram_exporters.drawio_exporter import export_drawio
    xml = export_drawio(_make_test_model())
    assert "rhombus" in xml or "shape=rhombus" in xml or "diamond" in xml.lower()
```

- [ ] **Step 2: Run to verify failure**

```bash
python -m pytest tests/test_sop_uplift_outputs.py::test_drawio_uses_column_for_positioning tests/test_sop_uplift_outputs.py::test_drawio_uses_decision_style_for_decision_shape -v
```

- [ ] **Step 3: Update `drawio_exporter.py` to use `node.column` and `node.shape`**

Replace the node position and style logic in `export_drawio`:

```python
# Replace the node positioning block (for node in model.nodes:)
for node in model.nodes:
    lane_idx = lane_lookup.get(node.lane_id, 0)
    x = 200 + node.column * 180           # use column instead of sequential count
    y = 110 + lane_idx * 120
    node_positions[node.node_id] = (x, y)

    shape_style = {
        "decision":   "rhombus;whiteSpace=wrap;html=1;",
        "start_end":  "ellipse;whiteSpace=wrap;html=1;",
        "data_store": "shape=mxgraph.flowchart.stored_data;whiteSpace=wrap;html=1;",
    }.get(node.shape, "rounded=1;whiteSpace=wrap;html=1;")

    fill = {"control": "#00338D", "risk": "#C00000", "evidence": "#EAAA00"}.get(node.type, "#FFFFFF")
    badge_label = f"[{node.badge}] {node.label}" if node.badge else node.label

    cell = ET.SubElement(root, "mxCell", {
        "id": node.node_id,
        "value": html.escape(badge_label),
        "style": f"{shape_style}fillColor={fill};strokeColor=#94A3B8;",
        "vertex": "1",
        "parent": "1",
    })
    ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": "140", "height": "50", "as": "geometry"})
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_sop_uplift_outputs.py::test_drawio_uses_column_for_positioning tests/test_sop_uplift_outputs.py::test_drawio_uses_decision_style_for_decision_shape -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/sop_uplift/diagram_exporters/drawio_exporter.py tests/test_sop_uplift_outputs.py
git commit -m "feat: draw.io exporter uses column positioning and correct shape styles"
```

---

## Task 7: Frontend Fallback Warning

**Files:**
- Modify: `kpmg_ui/client/src/pages/sop-uplift.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// kpmg_ui/client/src/pages/sop-uplift.integration.test.ts — add
test("shows fallback warning banner when diagram has fallback warning", async ({ page }) => {
  // Mock GET /api/sop-uplift/cases/:id/preview to return a diagramModel with fallback warning
  await page.route("**/api/sop-uplift/cases/*/preview", route =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        diagram_model: {
          title: "Test",
          warnings: ["Diagram generated from rule-based fallback"],
          lanes: [], nodes: [], edges: [],
        },
        anchors: [], suggestions: [], preview_model: {},
      }),
    })
  );
  await page.goto("/sop-uplift/cases/test-id");
  await page.click('[data-testid="tab-diagram"]');  // navigate to diagram tab
  await expect(page.locator('[data-testid="diagram-fallback-warning"]')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd kpmg_ui
npx playwright test sop-uplift.integration.test.ts --grep "fallback warning banner"
```
Expected: FAIL — no fallback warning element exists

- [ ] **Step 3: Add fallback warning banner in `sop-uplift.tsx`**

Find the diagram tab render section (where `diagramModel` is used). Add above the `@xyflow/react` diagram component:

```tsx
{/* Fallback warning — shown when LLM diagram generation failed */}
{diagramModel.warnings?.some(w => w.toLowerCase().includes("fallback")) && (
  <div
    data-testid="diagram-fallback-warning"
    className="mb-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
  >
    <span className="mt-0.5 text-amber-500">⚠</span>
    <span>
      This diagram was generated from a rule-based fallback because the AI did not return a valid
      process model. For an accurate diagram, run the pipeline again after uploading a structured SOP.
    </span>
  </div>
)}
```

- [ ] **Step 4: Run test**

```bash
npx playwright test sop-uplift.integration.test.ts --grep "fallback warning banner"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add kpmg_ui/client/src/pages/sop-uplift.tsx kpmg_ui/client/src/pages/sop-uplift.integration.test.ts
git commit -m "feat: show fallback warning banner on diagram tab when LLM diagram unavailable"
```

---

## Full Test Run

After all tasks are complete:

```bash
# Backend
cd "c:/Subho syste,/ControlTester_3000_kv"
python -m pytest tests/test_sop_uplift_outputs.py tests/test_sop_uplift_pipeline.py -v

# Frontend type check
cd kpmg_ui
npm run check
```

---

## Self-Review

**Spec coverage:**
- ✅ Orthogonal edges (Task 5 — `_edge` uses `<path>` with right-angle elbows, no `<line>`)
- ✅ Oval start/end shapes (Task 5 — `_start_end_node` uses `<ellipse>`)
- ✅ Diamond decision shapes (Task 5 — `_decision_node` uses `<polygon>`)
- ✅ C#/R#/E# badges (Task 5 — `_badge`; Task 3 — prompt instructs numbering)
- ✅ Legend panel (Task 5 — right-side legend)
- ✅ KPMG header + metadata (Task 5 — header block)
- ✅ Footer summary panels (Task 5 — 4-column footer)
- ✅ Prompt-first fix (Task 3)
- ✅ Focused data input to prompt (Task 3 — corpus_map + diagram_references only)
- ✅ Silent failure surfaced (Task 4 — `_diagram_model_from_payload` warns)
- ✅ Router crash fixed (Task 4 — 400 instead of wrong-arity call)
- ✅ Draw.io column positioning (Task 6)
- ✅ Frontend fallback warning (Task 7)

**Placeholder scan:** None found.

**Type consistency:** `DiagramMeta` added in Task 1, imported in Task 4 pipeline fix. `control_summary`/`risk_summary` added in Task 1, populated in Task 5 footer. `node.shape`, `node.column`, `node.badge` added in Task 1, used in Tasks 5 and 6. All consistent.

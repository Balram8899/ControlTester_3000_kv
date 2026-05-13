# Control Testing V2 — Plan 2: Pipeline Stages 1–3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `ct_worker` Celery container and implement Stages 1–3 of the CT pipeline — Excel template parsing, LLM case analysis, evidence C&A verification, and sampling — gating progression at the API level until each stage is confirmed.

**Architecture:** New `ct_worker` Celery service re-uses `api/Dockerfile` (same Python environment). All pipeline logic lives in `utils/control_assurance/pipeline/`. Prompts are pure functions in `utils/control_assurance/prompts/`. Every Celery sub-step writes a checkpoint to MongoDB before proceeding. The `confirm-mapping` endpoint enforces the C&A gate at the API layer regardless of UI state.

**Tech Stack:** Celery, Redis, pymongo, openpyxl, pymupdf, pytesseract, python-docx, LangChain (via `get_llm()`), pytest

**Prerequisite:** Plan 1 complete — `utils/control_assurance/` package exists, `/ct` router registered.

---

## Spec Alignment Update

Apply these corrections before executing any task in this plan:

- `ct_worker` must not hardcode provider or model defaults. It may pass through provider/model environment variables, but all CT pipeline calls still use `get_llm()` with no arguments so the Settings screen value wins.
- Stage 1 must dispatch Stage 2 after successful Excel parsing. Manual controls from Plan 1 must also have a Plan 2 transition into analysis, either by updating `POST /ct/sessions/:id/controls` to queue `ct.llm_review` after insert or by adding an explicit `POST /ct/sessions/:id/begin-analysis` endpoint before frontend work starts.
- Evidence and population uploaded after review must trigger C&A processing. Do not rely on a one-time `ct.evidence_mapping(session_id)` task that ran before files existed. Add per-file subtasks, or make the session-level Stage 3 task safely rerunnable from the latest MongoDB state.
- The C&A gate must block `null`, missing, failed, and unresolved C&A states. A file or population passes only when completeness and accuracy are both `true`, or the item is explicitly overridden.
- Sampling must store and expose `conflicts_with_user_input` and `conflict_reason`, and must implement random/full/user-selected selection into `sampling.selected_items`.
- All LLM JSON parsing must use a shared helper that records parse failures to `ct_sessions.parse_errors[]`, retries once with a simplified JSON-only prompt, validates the result with Pydantic response models, and only then writes to MongoDB.
- Prompt modules remain in `utils/control_assurance/prompts/` for this repo because `ct_worker` is a Docker service using the shared backend package. Treat that package as the spec’s ct_worker-owned prompt store; prompts still stay in code, not MongoDB.

## Shared Build Log

All four CT V2 plans share one handoff log: `docs/superpowers/plans/2026-05-12-ct-v2-build-log.md`.

Before starting a task, append a short entry with the task name, planned files, and current status. After completing or pausing a task, append what changed, verification run, blockers, and the exact next step. Keep entries brief but specific enough that another engineer can resume without rereading the whole thread.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `utils/control_assurance/celery_app.py` | Celery app config for CT pipeline |
| Create | `utils/control_assurance/prompts/__init__.py` | Package init |
| Create | `utils/control_assurance/prompts/case_analysis.py` | Stage 2 prompt builder |
| Create | `utils/control_assurance/prompts/ca_verification.py` | Population + evidence C&A prompt builders |
| Create | `utils/control_assurance/prompts/sampling.py` | Sampling methodology prompt builder |
| Create | `utils/control_assurance/prompts/evidence_mapping.py` | Evidence-to-step mapping prompt builder |
| Create | `utils/control_assurance/pipeline/__init__.py` | Package init |
| Create | `utils/control_assurance/pipeline/stage1_parse.py` | Parse Excel input template → ct_controls |
| Create | `utils/control_assurance/pipeline/stage2_review.py` | LLM case analysis → suggestions + questions |
| Create | `utils/control_assurance/pipeline/stage3_evidence.py` | Population C&A, sampling, evidence C&A, mapping |
| Modify | `api/routers/ct_v2.py` | Add stage 2–3 API endpoints |
| Modify | `docker-compose.yml` | Add ct_worker service |
| Create | `api/tests/test_ct_pipeline_stages1_3.py` | pytest tests |

---

### Task 1: ct_worker Celery Service

**Files:**
- Create: `utils/control_assurance/celery_app.py`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write the Celery app**

```python
# utils/control_assurance/celery_app.py
from __future__ import annotations
import os
from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

celery_app = Celery(
    "ct_pipeline",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=[
        "utils.control_assurance.pipeline.stage1_parse",
        "utils.control_assurance.pipeline.stage2_review",
        "utils.control_assurance.pipeline.stage3_evidence",
    ],
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
)
```

- [ ] **Step 2: Add ct_worker service to docker-compose.yml**

After the `celery_worker` service block, add:

```yaml
  ct_worker:
    build:
      context: .
      dockerfile: api/Dockerfile
    container_name: ct_worker_Trace_KV
    restart: unless-stopped
    command:
      - celery
      - -A
      - utils.control_assurance.celery_app
      - worker
      - --loglevel=INFO
      - -Q
      - ct_pipeline
      - --concurrency=2
    environment:
      - LLM_PROVIDER=${LLM_PROVIDER}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - GOOGLE_LLM_MODEL=${GOOGLE_LLM_MODEL}
      - OLLAMA_BASE_URL=${OLLAMA_BASE_URL}
      - OLLAMA_LLM_MODEL=${OLLAMA_LLM_MODEL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_LLM_MODEL=${OPENAI_LLM_MODEL}
      - MOONSHOT_API_KEY=${MOONSHOT_API_KEY}
      - KIMI_API_KEY=${KIMI_API_KEY}
      - KIMI_BASE_URL=${KIMI_BASE_URL}
      - KIMI_LLM_MODEL=${KIMI_LLM_MODEL}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - DEEPSEEK_BASE_URL=${DEEPSEEK_BASE_URL}
      - DEEPSEEK_LLM_MODEL=${DEEPSEEK_LLM_MODEL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ANTHROPIC_LLM_MODEL=${ANTHROPIC_LLM_MODEL}
      - MONGO_URI=mongodb://mongodb:27017
      - CELERY_BROKER_URL=${CELERY_BROKER_URL:-redis://redis:6379/0}
      - CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND:-redis://redis:6379/0}
    depends_on:
      mongodb:
        condition: service_started
      redis:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - appnet
```

- [ ] **Step 3: Verify compose is valid**

```bash
docker compose config --quiet
```

Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add utils/control_assurance/celery_app.py docker-compose.yml
git commit -m "feat(ct-v2): add ct_worker Celery service for CT pipeline"
```

---

### Task 2: Prompt Modules

**Files:**
- Create: `utils/control_assurance/prompts/__init__.py`
- Create: `utils/control_assurance/prompts/case_analysis.py`
- Create: `utils/control_assurance/prompts/ca_verification.py`
- Create: `utils/control_assurance/prompts/sampling.py`
- Create: `utils/control_assurance/prompts/evidence_mapping.py`
- Create: `api/tests/test_ct_prompts.py`

- [ ] **Step 1: Write failing tests for prompt builders**

```python
# api/tests/test_ct_prompts.py
import json


def test_case_analysis_prompt_is_string_with_json_schema():
    from utils.control_assurance.prompts.case_analysis import build_case_analysis_prompt
    session = {"title": "Q1 ITGC", "entity": "Tech", "testing_period": {"from": "2026-01-01", "to": "2026-03-31"}, "framework": "SOX"}
    controls = [{"control_id": "ITGC-001", "name": "Password Policy", "type": "Preventive", "risk": "Unauth access",
                 "domain": "Access Mgmt", "frequency": "Continuous", "inherent_risk_rating": "High",
                 "prior_period_result": "Effective", "walkthrough_performed": False,
                 "sampling_mode": "sample", "test_steps": [{"label": "A", "description": "Inspect policy"}]}]
    prompt = build_case_analysis_prompt(session, controls)
    assert isinstance(prompt, str)
    assert "case_questions" in prompt
    assert "ITGC-001" in prompt


def test_population_ca_prompt_is_string():
    from utils.control_assurance.prompts.ca_verification import build_population_ca_prompt
    control = {"name": "Password Policy", "type": "Preventive", "domain": "Access Mgmt"}
    period = {"from": "2026-01-01", "to": "2026-03-31"}
    file_meta = {"filename": "users.xlsx", "file_type": "excel", "row_count": 250,
                 "columns": ["UserID", "Date", "Approver"], "date_range_found": {"min": "2026-01-02", "max": "2026-03-28"},
                 "file_modified_date": "2026-04-01", "sample_rows": []}
    prompt = build_population_ca_prompt(control, period, file_meta)
    assert isinstance(prompt, str)
    assert "completeness_passed" in prompt
    assert "users.xlsx" in prompt


def test_evidence_ca_prompt_is_string():
    from utils.control_assurance.prompts.ca_verification import build_evidence_ca_prompt
    control = {"name": "Password Policy", "type": "Preventive", "domain": "Access Mgmt"}
    period = {"from": "2026-01-01", "to": "2026-03-31"}
    steps = [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}]
    file_meta = {"filename": "ad_policy.png", "file_type": "image", "file_modified_date": "2026-03-15",
                 "extracted_text": "Min password length: 12", "metadata": {}}
    prompt = build_evidence_ca_prompt(control, period, steps, file_meta)
    assert isinstance(prompt, str)
    assert "identified_value" in prompt


def test_sampling_prompt_is_string():
    from utils.control_assurance.prompts.sampling import build_sampling_prompt
    control = {"name": "Password Policy", "type": "Preventive", "frequency": "Continuous",
               "inherent_risk_rating": "High", "prior_period_result": "Effective"}
    population = {"count": 500, "description": "All active users", "sample_period": "Jan-Mar 2026"}
    prompt = build_sampling_prompt(control, population, user_mode=None)
    assert isinstance(prompt, str)
    assert "recommended_strategy" in prompt


def test_evidence_mapping_prompt_is_string():
    from utils.control_assurance.prompts.evidence_mapping import build_evidence_mapping_prompt
    control = {"name": "Password Policy", "type": "Preventive"}
    steps = [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}]
    file_meta = {"filename": "ad_policy.png", "file_type": "image",
                 "extracted_text": "Min password length: 12", "metadata": {}}
    prompt = build_evidence_mapping_prompt(control, steps, file_meta)
    assert isinstance(prompt, str)
    assert "mapped_steps" in prompt
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_prompts.py -v
```

Expected: `ImportError` for all prompt modules.

- [ ] **Step 3: Write prompt modules**

```python
# utils/control_assurance/prompts/__init__.py
```

```python
# utils/control_assurance/prompts/case_analysis.py
import json


def build_case_analysis_prompt(session: dict, controls: list[dict]) -> str:
    data = {
        "assessment": {
            "title": session["title"],
            "entity": session["entity"],
            "testing_period": session["testing_period"],
            "framework": session["framework"],
        },
        "controls": [
            {
                "control_id": c["control_id"],
                "name": c["name"],
                "type": c["type"],
                "risk": c.get("risk", ""),
                "domain": c.get("domain", ""),
                "frequency": c.get("frequency", ""),
                "inherent_risk_rating": c.get("inherent_risk_rating", ""),
                "prior_period_result": c.get("prior_period_result", ""),
                "walkthrough_performed": c.get("walkthrough_performed", False),
                "sampling_mode": c.get("sampling_mode", "sample"),
                "test_steps": [{"label": s["label"], "description": s["description"]} for s in c.get("test_steps", [])],
            }
            for c in controls
        ],
    }
    return f"""You are a senior IT audit manager reviewing a controls testing engagement before testing begins.
Your role is to:
1. Identify test coverage gaps or methodological concerns across the case
2. Surface clarifying questions that need answering before testing starts
3. Flag per-control concerns about sampling mode, evidence requirements, or step completeness

Focus only on testing adequacy — not control design quality. Control design improvement is out of scope.

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "case_questions": [{{"question_id": "uuid", "question": "string"}}],
  "controls": [{{
    "control_id": "string",
    "suggestions": [{{"suggestion_id": "uuid", "text": "string"}}],
    "questions": [{{"question_id": "uuid", "question": "string"}}]
  }}]
}}

DATA:
{json.dumps(data, indent=2)}"""
```

```python
# utils/control_assurance/prompts/ca_verification.py
import json


def build_population_ca_prompt(control: dict, period: dict, file_meta: dict) -> str:
    data = {"control": control, "testing_period": period, "file": file_meta}
    return f"""You are verifying completeness and accuracy of a population file for IT audit control testing.

Completeness — check:
1. Expected columns present for the control type
2. Row count plausible for stated period and population size
3. No truncation (last record date within or after period end)
4. No blank critical fields in sample rows

Accuracy — check:
1. Source/author metadata matches stated system
2. File modification date is a plausible extraction date
3. Record timestamps fall within stated testing period
4. No formula override indicators
5. Internal timestamp consistency

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
    data = {"control": control, "testing_period": period, "steps_this_evidence_covers": steps, "file": file_meta}
    return f"""You are verifying completeness and accuracy of audit evidence for IT control testing.

Completeness — check:
1. All required information visible for each mapped test step
2. Evidence is not cropped/truncated hiding relevant data
3. Date/time stamps visible where required

Accuracy — check:
1. Evidence is from the correct system (matches stated application)
2. Evidence date/time falls within stated testing period
3. No PDF edit markers, no Excel formula overrides, image EXIF consistent
4. No contradictions between metadata and stated control

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
```

```python
# utils/control_assurance/prompts/sampling.py
import json


def build_sampling_prompt(control: dict, population: dict, user_mode: str | None) -> str:
    data = {"control": control, "population": population, "user_stated_mode": user_mode}
    return f"""You are an IT audit sampling specialist advising on the appropriate sampling methodology.
The auditor's stated preference takes precedence — only flag a conflict if you have a material professional concern.

Consider:
- Inherent risk: high risk → larger sample, prefer random
- Frequency: continuous/daily → larger population, statistical sampling preferred
- Prior period: prior ineffective result → increase sample size
- Population size <52 → consider full population for annual controls

Return valid JSON only.

OUTPUT SCHEMA:
{{
  "recommended_strategy": "random|full|user_selected",
  "recommended_size": 25,
  "rationale": "string",
  "conflicts_with_user_input": false,
  "conflict_reason": "string|null"
}}

DATA:
{json.dumps(data, indent=2)}"""
```

```python
# utils/control_assurance/prompts/evidence_mapping.py
import json


def build_evidence_mapping_prompt(control: dict, steps: list[dict], file_meta: dict) -> str:
    data = {"control": control, "test_steps": steps, "file": file_meta}
    return f"""You are an IT audit evidence analyst. Determine which test steps the evidence supports
and identify the specific region to annotate.

For each mapped step provide:
- The step label
- The supporting value found in the evidence
- annotation_type: bbox (image/PDF pixel region), cell (Excel row/col), or text_highlight (text substring)
- Location in the format appropriate to annotation_type:
  bbox: {{x, y, w, h}} pixels from top-left
  cell: {{row, col}} 0-indexed
  text_offset: {{start, end}} character positions

Return valid JSON only. If a step cannot be matched, omit it from per_step.

OUTPUT SCHEMA:
{{
  "mapped_steps": ["A", "B"],
  "confidence": "high|medium|low",
  "per_step": [{{
    "step_label": "A",
    "supporting_value": "string",
    "annotation_type": "bbox|cell|text_highlight",
    "bbox": {{"x": 0, "y": 0, "w": 0, "h": 0}},
    "cell": {{"row": 0, "col": 0}},
    "text_offset": {{"start": 0, "end": 0}}
  }}]
}}

DATA:
{json.dumps(data, indent=2)}"""
```

- [ ] **Step 4: Run tests**

```bash
cd api && python -m pytest tests/test_ct_prompts.py -v
```

Expected: 5 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add utils/control_assurance/prompts/ api/tests/test_ct_prompts.py
git commit -m "feat(ct-v2): prompt builder modules for Stages 1-3"
```

---

### Task 3: Stage 1 — Parse Template

**Files:**
- Create: `utils/control_assurance/pipeline/__init__.py`
- Create: `utils/control_assurance/pipeline/stage1_parse.py`
- Modify: `api/routers/ct_v2.py` — update `upload-template` to dispatch task
- Create: `api/tests/test_ct_pipeline_stages1_3.py`

- [ ] **Step 1: Write failing test for parse_template**

```python
# api/tests/test_ct_pipeline_stages1_3.py
import io
import pytest
import mongomock
import openpyxl
from unittest.mock import patch, MagicMock


@pytest.fixture()
def mock_db():
    client = mongomock.MongoClient()
    return client["trace_db"]


def _make_template_bytes() -> bytes:
    """Create a minimal valid input template xlsx in memory."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Control Data"
    headers = [
        "Control ID", "Control Name", "Control Type", "Domain", "Framework Reference",
        "Inherent Risk Rating", "Control Owner", "Frequency", "Prior Period Result",
        "Walkthrough Performed", "Sampling Mode",
        "Step A Description", "Step A Evidence Required",
        "Step B Description", "Step B Evidence Required",
    ]
    ws.append(headers)
    ws.append([
        "ITGC-001", "Password Policy", "Preventive", "Access Mgmt", "SOX s.404",
        "High", "John Smith", "Continuous", "Effective", "No", "Sample",
        "Inspect AD policy", "AD screenshot",
        "Check lockout", "Lockout config",
    ])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parse_template_creates_controls(mock_db):
    from utils.control_assurance.pipeline.stage1_parse import _parse_and_create_controls

    session_id = "sess-001"
    mock_db.ct_sessions.insert_one({"_id": session_id, "stage": "input", "stage_checkpoint": None})

    with patch("utils.control_assurance.pipeline.stage1_parse._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage1_parse.download_from_gridfs", return_value=_make_template_bytes()):
            _parse_and_create_controls(session_id, "fake-gridfs-id")

    controls = list(mock_db.ct_controls.find({"session_id": session_id}))
    assert len(controls) == 1
    ctrl = controls[0]
    assert ctrl["control_id"] == "ITGC-001"
    assert ctrl["control_name"] == "Password Policy"
    assert ctrl["sampling"]["mode"] == "sample"
    assert len(ctrl["test_steps"]) == 2
    assert ctrl["test_steps"][0]["label"] == "A"
    assert ctrl["test_steps"][1]["label"] == "B"

    session = mock_db.ct_sessions.find_one({"_id": session_id})
    assert session["stage"] == "analysing"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages1_3.py::test_parse_template_creates_controls -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write stage1_parse.py**

```python
# utils/control_assurance/pipeline/stage1_parse.py
from __future__ import annotations
import io
import uuid
from datetime import datetime, timezone

import openpyxl

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.ct_gridfs import download_from_gridfs

_STEP_LABELS = ["A", "B", "C", "D", "E", "F"]
_SAMPLING_MODE_MAP = {
    "walkthrough": "walkthrough", "sample": "sample",
    "both": "both", "none": "none",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_and_create_controls(session_id: str, gridfs_file_id: str) -> None:
    db = _get_db()
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"stage_checkpoint": {"stage": "parse_template", "step": "downloading", "updated_at": _now()}}},
    )

    content = download_from_gridfs(gridfs_file_id)
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    now = _now()
    controls_created = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue

        (control_id, control_name, control_type, domain, framework_ref,
         inherent_risk, owner, frequency, prior_period, walkthrough_raw,
         sampling_mode_raw) = [str(v or "").strip() for v in row[:11]]

        walkthrough = walkthrough_raw.lower() in ("yes", "true", "1")
        sampling_mode = _SAMPLING_MODE_MAP.get(sampling_mode_raw.lower(), "sample")

        test_steps = []
        for i, label in enumerate(_STEP_LABELS):
            col_start = 11 + (i * 2)
            if col_start + 1 >= len(row):
                break
            desc = str(row[col_start] or "").strip()
            evidence_req = str(row[col_start + 1] or "").strip()
            if desc:
                test_steps.append({
                    "step_id": str(uuid.uuid4()),
                    "label": label,
                    "description": desc,
                    "evidence_required": evidence_req,
                })

        doc = {
            "_id": str(uuid.uuid4()),
            "session_id": session_id,
            "control_id": control_id,
            "control_name": control_name,
            "control_type": control_type,
            "domain": domain,
            "framework_reference": framework_ref,
            "inherent_risk_rating": inherent_risk or "Medium",
            "control_owner": owner,
            "frequency": frequency,
            "prior_period_result": prior_period or "N/A",
            "walkthrough_performed": walkthrough,
            "risk": "",
            "test_steps": test_steps,
            "sampling": {
                "mode": sampling_mode,
                "population_description": "",
                "population_file_id": None,
                "population_count": 0,
                "sample_period": "",
                "llm_suggested_strategy": None,
                "llm_suggested_size": 0,
                "selection_strategy": None,
                "selected_size": 0,
                "selected_items": [],
                "population_ca_verification": {
                    "completeness_passed": None,
                    "accuracy_passed": None,
                    "issues": [],
                    "overridden": False,
                    "override_reason": None,
                },
            },
            "evidence_files": [],
            "sample_results": [],
            "todi_results": {},
            "exceptions": [],
            "conclusions": {
                "d_and_i": None,
                "oe": None,
                "deficiencies_noted": False,
                "issues_log_refs": [],
                "rationale": "",
                "testing_summary": "",
            },
            "testing_methods": {
                "inquiry": False,
                "observation": False,
                "inspection": False,
                "reperformance": False,
            },
            "workbook_output_id": None,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
        }
        db.ct_controls.insert_one(doc)
        controls_created += 1

        db.ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage_checkpoint": {
                "stage": "parse_template",
                "step": f"parsed_{controls_created}_controls",
                "updated_at": _now(),
            }}},
        )

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "stage": "analysing",
            "stage_checkpoint": {"stage": "parse_template", "step": "complete", "controls_found": controls_created, "updated_at": _now()},
            "updated_at": _now(),
        }},
    )


@celery_app.task(name="ct.parse_template", queue="ct_pipeline", acks_late=True, reject_on_worker_lost=True)
def parse_template(session_id: str, gridfs_file_id: str) -> dict:
    try:
        _parse_and_create_controls(session_id, gridfs_file_id)
        from utils.control_assurance.pipeline.stage2_review import llm_review
        task = llm_review.apply_async(args=[session_id], queue="ct_pipeline")
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"celery_task_id": task.id, "updated_at": _now()}},
        )
        return {"status": "ok", "session_id": session_id, "next_task": task.id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage": "failed", "stage_checkpoint": {"error": str(exc), "updated_at": _now()}}},
        )
        raise
```

- [ ] **Step 4: Update upload-template endpoint to dispatch Celery task**

In `api/routers/ct_v2.py`, replace the existing `upload_template` function with:

```python
@router.post("/sessions/{session_id}/upload-template", status_code=202)
async def upload_template(session_id: str, file: UploadFile = File(...)) -> dict:
    db = _get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=422, detail="Only .xlsx files accepted")

    content = await file.read()
    gridfs_id = upload_to_gridfs(
        content, file.filename,
        {"type": "input_template", "session_id": session_id},
    )
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"input_template_gridfs_id": gridfs_id, "updated_at": _now()}},
    )

    from utils.control_assurance.pipeline.stage1_parse import parse_template
    task = parse_template.apply_async(
        args=[session_id, gridfs_id],
        queue="ct_pipeline",
    )
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"celery_task_id": task.id}},
    )
    return {"gridfs_id": gridfs_id, "celery_task_id": task.id, "status": "parsing"}
```

- [ ] **Step 4b: Add the manual-control analysis transition**

Update the Plan 1 `add_controls` endpoint or add a new `POST /ct/sessions/{session_id}/begin-analysis` endpoint so manual JSON input can start Stage 2. The endpoint must:

1. Verify the session exists and has at least one `ct_controls` document.
2. Queue `ct.llm_review(session_id)`.
3. Set `ct_sessions.stage = "analysing"`, `celery_task_id = task.id`, and `stage_checkpoint = {"stage": "manual_input", "step": "queued_llm_review", "updated_at": _now()}`.
4. Return `202` with `{ "celery_task_id": task.id, "status": "analysis_queued" }`.

- [ ] **Step 5: Run tests**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages1_3.py -v
```

Expected: `test_parse_template_creates_controls` PASSED.

- [ ] **Step 6: Commit**

```bash
git add utils/control_assurance/pipeline/__init__.py utils/control_assurance/pipeline/stage1_parse.py \
        api/routers/ct_v2.py api/tests/test_ct_pipeline_stages1_3.py
git commit -m "feat(ct-v2): Stage 1 parse_template Celery task and upload-template endpoint"
```

---

### Task 4: Stage 2 — LLM Case Analysis + API Endpoints

**Files:**
- Create: `utils/control_assurance/pipeline/stage2_review.py`
- Modify: `api/routers/ct_v2.py` — add suggestions/questions/confirm-review endpoints

- [ ] **Step 1: Write failing tests**

Append to `api/tests/test_ct_pipeline_stages1_3.py`:

```python
def test_llm_review_writes_suggestions(mock_db):
    from utils.control_assurance.pipeline.stage2_review import _run_llm_review

    session_id = "sess-002"
    mock_db.ct_sessions.insert_one({
        "_id": session_id, "stage": "analysing", "title": "Q1 ITGC",
        "entity": "Tech", "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX", "llm_suggestions": [], "llm_questions": [],
    })
    mock_db.ct_controls.insert_one({
        "_id": "ctrl-001", "session_id": session_id, "control_id": "ITGC-001",
        "control_name": "Password Policy", "control_type": "Preventive", "risk": "",
        "domain": "Access Mgmt", "frequency": "Continuous", "inherent_risk_rating": "High",
        "prior_period_result": "Effective", "walkthrough_performed": False,
        "sampling": {"mode": "sample"},
        "test_steps": [{"label": "A", "description": "Inspect policy"}],
    })

    fake_llm_response = """{
      "case_questions": [{"question_id": "q1", "question": "What is the entity scope?"}],
      "controls": [{"control_id": "ITGC-001", "suggestions": [{"suggestion_id": "s1", "text": "Consider adding step C"}], "questions": []}]
    }"""

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=fake_llm_response)

    with patch("utils.control_assurance.pipeline.stage2_review._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage2_review.get_llm", return_value=mock_llm):
            _run_llm_review(session_id)

    session = mock_db.ct_sessions.find_one({"_id": session_id})
    assert len(session["llm_questions"]) == 1
    assert session["llm_questions"][0]["question"] == "What is the entity scope?"
    assert len(session["llm_suggestions"]) == 1
    assert session["llm_suggestions"][0]["text"] == "Consider adding step C"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages1_3.py::test_llm_review_writes_suggestions -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write stage2_review.py**

```python
# utils/control_assurance/pipeline/stage2_review.py
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.prompts.case_analysis import build_case_analysis_prompt
from utils.llm_provider import get_llm


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_llm_review(session_id: str) -> None:
    db = _get_db()
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"stage_checkpoint": {"stage": "llm_review", "step": "calling_llm", "updated_at": _now()}}},
    )

    session = db.ct_sessions.find_one({"_id": session_id})
    controls = list(db.ct_controls.find({"session_id": session_id}))

    prompt = build_case_analysis_prompt(session, [
        {
            "control_id": c["control_id"], "name": c["control_name"], "type": c["control_type"],
            "risk": c.get("risk", ""), "domain": c.get("domain", ""),
            "frequency": c.get("frequency", ""), "inherent_risk_rating": c.get("inherent_risk_rating", ""),
            "prior_period_result": c.get("prior_period_result", ""),
            "walkthrough_performed": c.get("walkthrough_performed", False),
            "sampling_mode": c.get("sampling", {}).get("mode", "sample"),
            "test_steps": c.get("test_steps", []),
        }
        for c in controls
    ])

    llm = get_llm()
    response = llm.invoke(prompt)
    raw = response.content if hasattr(response, "content") else str(response)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])

    suggestions = []
    questions = []

    for case_q in data.get("case_questions", []):
        questions.append({
            "question_id": case_q.get("question_id", str(uuid.uuid4())),
            "level": "case",
            "control_id": None,
            "question": case_q["question"],
            "answer": "",
            "answered": False,
        })

    ctrl_map = {c["control_id"]: c["_id"] for c in controls}

    for ctrl_data in data.get("controls", []):
        ctrl_mongo_id = ctrl_map.get(ctrl_data["control_id"])
        for sug in ctrl_data.get("suggestions", []):
            suggestions.append({
                "suggestion_id": sug.get("suggestion_id", str(uuid.uuid4())),
                "control_id": ctrl_mongo_id,
                "text": sug["text"],
                "status": "pending",
            })
        for q in ctrl_data.get("questions", []):
            questions.append({
                "question_id": q.get("question_id", str(uuid.uuid4())),
                "level": "control",
                "control_id": ctrl_mongo_id,
                "question": q["question"],
                "answer": "",
                "answered": False,
            })

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "llm_suggestions": suggestions,
            "llm_questions": questions,
            "stage_checkpoint": {"stage": "llm_review", "step": "awaiting_review", "updated_at": _now()},
            "updated_at": _now(),
        }},
    )


@celery_app.task(name="ct.llm_review", queue="ct_pipeline", acks_late=True, reject_on_worker_lost=True)
def llm_review(session_id: str) -> dict:
    try:
        _run_llm_review(session_id)
        return {"status": "ok", "session_id": session_id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage": "failed", "stage_checkpoint": {"error": str(exc), "updated_at": _now()}}},
        )
        raise
```

- [ ] **Step 4: Add Stage 2 API endpoints to ct_v2.py**

Append to `api/routers/ct_v2.py`:

```python
# ---------------------------------------------------------------------------
# Stage 2 — LLM review endpoints
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/suggestions")
def get_suggestions(session_id: str) -> dict:
    doc = _get_db().ct_sessions.find_one(
        {"_id": session_id}, {"llm_suggestions": 1, "llm_questions": 1}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"suggestions": doc.get("llm_suggestions", []), "questions": doc.get("llm_questions", [])}


@router.patch("/sessions/{session_id}/suggestions/{suggestion_id}")
def update_suggestion(session_id: str, suggestion_id: str, body: dict) -> dict:
    status = body.get("status")
    if status not in ("accepted", "dismissed"):
        raise HTTPException(status_code=422, detail="status must be 'accepted' or 'dismissed'")
    db = _get_db()
    db.ct_sessions.update_one(
        {"_id": session_id, "llm_suggestions.suggestion_id": suggestion_id},
        {"$set": {"llm_suggestions.$.status": status, "updated_at": _now()}},
    )
    return {"suggestion_id": suggestion_id, "status": status}


@router.post("/sessions/{session_id}/questions/{question_id}/answer")
def answer_question(session_id: str, question_id: str, body: dict) -> dict:
    answer = body.get("answer", "")
    db = _get_db()
    db.ct_sessions.update_one(
        {"_id": session_id, "llm_questions.question_id": question_id},
        {"$set": {
            "llm_questions.$.answer": answer,
            "llm_questions.$.answered": True,
            "updated_at": _now(),
        }},
    )
    return {"question_id": question_id, "answered": True}


@router.post("/sessions/{session_id}/confirm-review", status_code=202)
def confirm_review(session_id: str) -> dict:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    unanswered = [q for q in session.get("llm_questions", []) if not q.get("answered")]
    if unanswered:
        raise HTTPException(
            status_code=409,
            detail=f"{len(unanswered)} question(s) still unanswered. Answer all questions before proceeding.",
        )

    from utils.control_assurance.pipeline.stage3_evidence import evidence_mapping
    task = evidence_mapping.apply_async(args=[session_id], queue="ct_pipeline")
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"stage": "population", "celery_task_id": task.id, "updated_at": _now()}},
    )
    return {"celery_task_id": task.id, "status": "evidence_mapping_queued"}
```

- [ ] **Step 5: Run tests**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages1_3.py -v
```

Expected: all tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add utils/control_assurance/pipeline/stage2_review.py api/routers/ct_v2.py \
        api/tests/test_ct_pipeline_stages1_3.py
git commit -m "feat(ct-v2): Stage 2 LLM case analysis and review API endpoints"
```

---

### Task 5: Stage 3 — Evidence Mapping Pipeline

**Files:**
- Create: `utils/control_assurance/pipeline/stage3_evidence.py`
- Create: `utils/control_assurance/evidence_extractor.py`

- [ ] **Step 1: Write failing tests**

Append to `api/tests/test_ct_pipeline_stages1_3.py`:

```python
def test_evidence_ca_verification_stores_result(mock_db):
    from utils.control_assurance.pipeline.stage3_evidence import _verify_evidence_ca

    session_id = "sess-003"
    control_id = "ctrl-003"
    gridfs_id = "6642aabbccddeeff00112200"

    mock_db.ct_sessions.insert_one({"_id": session_id, "testing_period": {"from": "2026-01-01", "to": "2026-03-31"}})
    mock_db.ct_controls.insert_one({
        "_id": control_id, "session_id": session_id,
        "control_name": "Password Policy", "control_type": "Preventive", "domain": "Access Mgmt",
        "test_steps": [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}],
        "evidence_files": [{
            "gridfs_id": gridfs_id, "filename": "policy.png", "file_type": "image",
            "mapped_step_labels": [], "identified_value": "", "annotation_regions": [],
            "ca_verification": {"completeness_passed": None, "accuracy_passed": None,
                                "issues": [], "overridden": False, "override_reason": None},
        }],
    })

    fake_ca_response = json.dumps({
        "completeness_passed": True, "accuracy_passed": True,
        "issues": [], "identified_value": "Min length: 12", "annotation_hint": "Top-right panel"
    })
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=fake_ca_response)

    with patch("utils.control_assurance.pipeline.stage3_evidence._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage3_evidence.get_llm", return_value=mock_llm):
            with patch("utils.control_assurance.pipeline.stage3_evidence.download_from_gridfs", return_value=b"fake"):
                with patch("utils.control_assurance.pipeline.stage3_evidence.extract_file_content", return_value=("text content", {})):
                    _verify_evidence_ca(session_id, control_id, gridfs_id)

    ctrl = mock_db.ct_controls.find_one({"_id": control_id})
    ev = ctrl["evidence_files"][0]
    assert ev["ca_verification"]["completeness_passed"] is True
    assert ev["ca_verification"]["accuracy_passed"] is True
    assert ev["identified_value"] == "Min length: 12"
```

- [ ] **Step 2: Create evidence extractor utility**

```python
# utils/control_assurance/evidence_extractor.py
from __future__ import annotations
import io


def extract_file_content(content: bytes, file_type: str, filename: str) -> tuple[str, dict]:
    """Extract text and metadata from evidence file bytes. Returns (text, metadata)."""
    if file_type == "pdf":
        return _extract_pdf(content)
    if file_type in ("excel",):
        return _extract_excel(content)
    if file_type == "csv":
        return _extract_csv(content)
    if file_type == "docx":
        return _extract_docx(content)
    if file_type == "image":
        return _extract_image(content)
    if file_type in ("txt",):
        return content.decode("utf-8", errors="replace"), {}
    if file_type == "zip":
        return _extract_zip(content, filename)
    return "", {}


def _extract_pdf(content: bytes) -> tuple[str, dict]:
    try:
        import fitz  # pymupdf
        doc = fitz.open(stream=content, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        meta = doc.metadata or {}
        return text[:8000], meta
    except Exception:
        return "", {}


def _extract_excel(content: bytes) -> tuple[str, dict]:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append("\t".join(str(v or "") for v in row))
        return "\n".join(rows)[:8000], {}
    except Exception:
        return "", {}


def _extract_csv(content: bytes) -> tuple[str, dict]:
    import csv
    try:
        text = content.decode("utf-8", errors="replace")
        reader = csv.reader(text.splitlines())
        rows = ["\t".join(r) for r in reader]
        return "\n".join(rows)[:8000], {}
    except Exception:
        return "", {}


def _extract_docx(content: bytes) -> tuple[str, dict]:
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs)
        return text[:8000], {}
    except Exception:
        return "", {}


def _extract_image(content: bytes) -> tuple[str, dict]:
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(content))
        text = pytesseract.image_to_string(img)
        return text[:8000], {}
    except Exception:
        return "", {}


def _extract_zip(content: bytes, filename: str) -> tuple[str, dict]:
    import zipfile
    texts = []
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for name in zf.namelist()[:20]:
                inner = zf.read(name)
                ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
                ftype = _ext_to_type(ext)
                inner_text, _ = extract_file_content(inner, ftype, name)
                texts.append(f"[{name}]\n{inner_text}")
    except Exception:
        pass
    return "\n\n".join(texts)[:8000], {}


def _ext_to_type(ext: str) -> str:
    if ext in {"jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp"}:
        return "image"
    if ext == "pdf":
        return "pdf"
    if ext in {"xlsx", "xls"}:
        return "excel"
    if ext == "csv":
        return "csv"
    if ext == "docx":
        return "docx"
    return "txt"
```

- [ ] **Step 3: Write stage3_evidence.py**

```python
# utils/control_assurance/pipeline/stage3_evidence.py
from __future__ import annotations
import json
import random
import uuid
from datetime import datetime, timezone

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.ct_gridfs import download_from_gridfs
from utils.control_assurance.evidence_extractor import extract_file_content
from utils.control_assurance.prompts.ca_verification import (
    build_evidence_ca_prompt,
    build_population_ca_prompt,
)
from utils.control_assurance.prompts.evidence_mapping import build_evidence_mapping_prompt
from utils.control_assurance.prompts.sampling import build_sampling_prompt
from utils.llm_provider import get_llm


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _call_llm_json(prompt: str) -> dict:
    llm = get_llm()
    response = llm.invoke(prompt)
    raw = response.content if hasattr(response, "content") else str(response)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}") + 1
        return json.loads(raw[start:end])


def _verify_evidence_ca(session_id: str, control_id: str, gridfs_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    control = db.ct_controls.find_one({"_id": control_id})

    ev_entry = next((e for e in control["evidence_files"] if e["gridfs_id"] == gridfs_id), None)
    if not ev_entry:
        return

    content = download_from_gridfs(gridfs_id)
    extracted_text, metadata = extract_file_content(content, ev_entry["file_type"], ev_entry["filename"])

    file_meta = {
        "filename": ev_entry["filename"],
        "file_type": ev_entry["file_type"],
        "file_modified_date": metadata.get("modDate", ""),
        "extracted_text": extracted_text,
        "metadata": metadata,
    }

    steps = [s for s in control.get("test_steps", [])]
    prompt = build_evidence_ca_prompt(
        {"name": control["control_name"], "type": control["control_type"], "domain": control.get("domain", "")},
        session["testing_period"],
        steps,
        file_meta,
    )
    result = _call_llm_json(prompt)

    db.ct_controls.update_one(
        {"_id": control_id, "evidence_files.gridfs_id": gridfs_id},
        {"$set": {
            "evidence_files.$.ca_verification.completeness_passed": result.get("completeness_passed"),
            "evidence_files.$.ca_verification.accuracy_passed": result.get("accuracy_passed"),
            "evidence_files.$.ca_verification.issues": result.get("issues", []),
            "evidence_files.$.identified_value": result.get("identified_value", ""),
            "updated_at": _now(),
        }},
    )

    if result.get("completeness_passed") and result.get("accuracy_passed"):
        _map_evidence_to_steps(session_id, control_id, gridfs_id, extracted_text, metadata, control, steps)


def _map_evidence_to_steps(
    session_id: str, control_id: str, gridfs_id: str,
    extracted_text: str, metadata: dict, control: dict, steps: list
) -> None:
    db = _get_db()
    ev_entry = next((e for e in control["evidence_files"] if e["gridfs_id"] == gridfs_id), {})
    file_meta = {
        "filename": ev_entry.get("filename", ""),
        "file_type": ev_entry.get("file_type", ""),
        "extracted_text": extracted_text,
        "metadata": metadata,
    }
    prompt = build_evidence_mapping_prompt(
        {"name": control["control_name"], "type": control["control_type"]},
        steps,
        file_meta,
    )
    result = _call_llm_json(prompt)
    db.ct_controls.update_one(
        {"_id": control_id, "evidence_files.gridfs_id": gridfs_id},
        {"$set": {
            "evidence_files.$.mapped_step_labels": result.get("mapped_steps", []),
            "evidence_files.$.annotation_regions": result.get("per_step", []),
            "updated_at": _now(),
        }},
    )


def _process_population(session_id: str, control_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    control = db.ct_controls.find_one({"_id": control_id})
    sampling = control.get("sampling", {})

    pop_file_id = sampling.get("population_file_id")
    if not pop_file_id:
        return

    content = download_from_gridfs(pop_file_id)
    extracted_text, metadata = extract_file_content(content, "excel", "population.xlsx")

    import openpyxl, io as _io
    try:
        wb = openpyxl.load_workbook(_io.BytesIO(content), data_only=True)
        ws = wb.active
        columns = [str(c.value or "") for c in ws[1]]
        row_count = ws.max_row - 1
        sample_rows = [[str(c or "") for c in r] for r in list(ws.iter_rows(min_row=2, max_row=6, values_only=True))]
        date_range = {"min": "", "max": ""}
    except Exception:
        columns, row_count, sample_rows, date_range = [], 0, [], {"min": "", "max": ""}

    file_meta = {
        "filename": "population.xlsx",
        "file_type": "excel",
        "file_modified_date": metadata.get("modDate", ""),
        "row_count": row_count,
        "columns": columns,
        "date_range_found": date_range,
        "sample_rows": sample_rows,
    }

    prompt = build_population_ca_prompt(
        {"name": control["control_name"], "type": control["control_type"], "domain": control.get("domain", "")},
        session["testing_period"],
        file_meta,
    )
    result = _call_llm_json(prompt)
    db.ct_controls.update_one(
        {"_id": control_id},
        {"$set": {
            "sampling.population_count": row_count,
            "sampling.population_ca_verification.completeness_passed": result.get("completeness_passed"),
            "sampling.population_ca_verification.accuracy_passed": result.get("accuracy_passed"),
            "sampling.population_ca_verification.issues": result.get("issues", []),
            "updated_at": _now(),
        }},
    )

    if result.get("completeness_passed") and result.get("accuracy_passed"):
        _recommend_sampling(session_id, control_id, row_count, sampling)


def _recommend_sampling(session_id: str, control_id: str, pop_count: int, sampling: dict) -> None:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id})
    prompt = build_sampling_prompt(
        {
            "name": control["control_name"],
            "type": control["control_type"],
            "frequency": control.get("frequency", ""),
            "inherent_risk_rating": control.get("inherent_risk_rating", "Medium"),
            "prior_period_result": control.get("prior_period_result", "N/A"),
        },
        {"count": pop_count, "description": sampling.get("population_description", ""), "sample_period": sampling.get("sample_period", "")},
        sampling.get("mode"),
    )
    result = _call_llm_json(prompt)
    db.ct_controls.update_one(
        {"_id": control_id},
        {"$set": {
            "sampling.llm_suggested_strategy": result.get("recommended_strategy"),
            "sampling.llm_suggested_size": result.get("recommended_size", 0),
            "updated_at": _now(),
        }},
    )


def _run_evidence_mapping(session_id: str) -> None:
    db = _get_db()
    controls = list(db.ct_controls.find({"session_id": session_id}))
    for control in controls:
        cid = control["_id"]
        mode = control.get("sampling", {}).get("mode", "sample")

        db.ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage_checkpoint": {
                "stage": "evidence_mapping",
                "step": f"processing_{cid}",
                "updated_at": _now(),
            }}},
        )

        if mode in ("sample", "both") and control.get("sampling", {}).get("population_file_id"):
            _process_population(session_id, cid)

        for ev in control.get("evidence_files", []):
            _verify_evidence_ca(session_id, cid, ev["gridfs_id"])

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "stage": "evidence",
            "stage_checkpoint": {"stage": "evidence_mapping", "step": "complete", "updated_at": _now()},
            "updated_at": _now(),
        }},
    )


@celery_app.task(name="ct.evidence_mapping", queue="ct_pipeline", acks_late=True, reject_on_worker_lost=True)
def evidence_mapping(session_id: str) -> dict:
    try:
        _run_evidence_mapping(session_id)
        return {"status": "ok", "session_id": session_id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage": "failed", "stage_checkpoint": {"error": str(exc), "updated_at": _now()}}},
        )
        raise
```

- [ ] **Step 4: Add Stage 3 API endpoints to ct_v2.py**

Append to `api/routers/ct_v2.py`:

```python
# ---------------------------------------------------------------------------
# Stage 3 — mapping, sampling, C&A override, confirm-mapping gate
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/controls/{control_id}/mapping")
def get_mapping(session_id: str, control_id: str) -> dict:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    return {
        "evidence_files": control.get("evidence_files", []),
        "sampling": control.get("sampling", {}),
    }


@router.patch("/sessions/{session_id}/controls/{control_id}/mapping")
def override_mapping(session_id: str, control_id: str, body: dict) -> dict:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    gridfs_id = body.get("file_gridfs_id")
    new_steps = body.get("mapped_step_labels", [])
    reason = body.get("reason", "")

    original = []
    for ev in control.get("evidence_files", []):
        if ev["gridfs_id"] == gridfs_id:
            original = ev.get("mapped_step_labels", [])
            break

    db.ct_controls.update_one(
        {"_id": control_id, "evidence_files.gridfs_id": gridfs_id},
        {"$set": {"evidence_files.$.mapped_step_labels": new_steps, "updated_at": _now()}},
    )

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$push": {"override_log": {
            "timestamp": _now(),
            "override_type": "evidence_mapping",
            "control_id": control_id,
            "evidence_filename": next((e["filename"] for e in control["evidence_files"] if e["gridfs_id"] == gridfs_id), ""),
            "original_value": str(original),
            "override_value": str(new_steps),
            "reason": reason,
        }}},
    )
    return {"updated": True}


@router.patch("/sessions/{session_id}/controls/{control_id}/ca-override")
def ca_override(session_id: str, control_id: str, body: dict) -> dict:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    reason = body.get("reason", "")
    if not reason or len(reason.strip()) < 10:
        raise HTTPException(status_code=422, detail="Override reason must be at least 10 characters")

    if body.get("population"):
        db.ct_controls.update_one(
            {"_id": control_id},
            {"$set": {
                "sampling.population_ca_verification.overridden": True,
                "sampling.population_ca_verification.override_reason": reason,
                "updated_at": _now(),
            }},
        )
        original_issues = control.get("sampling", {}).get("population_ca_verification", {}).get("issues", [])
        override_type = "ca_check"
        ev_filename = None
    else:
        gridfs_id = body.get("file_gridfs_id")
        if not gridfs_id:
            raise HTTPException(status_code=422, detail="file_gridfs_id required")
        ev_entry = next((e for e in control["evidence_files"] if e["gridfs_id"] == gridfs_id), None)
        if not ev_entry:
            raise HTTPException(status_code=404, detail="Evidence file not found")
        db.ct_controls.update_one(
            {"_id": control_id, "evidence_files.gridfs_id": gridfs_id},
            {"$set": {
                "evidence_files.$.ca_verification.overridden": True,
                "evidence_files.$.ca_verification.override_reason": reason,
                "updated_at": _now(),
            }},
        )
        original_issues = ev_entry.get("ca_verification", {}).get("issues", [])
        override_type = "ca_check"
        ev_filename = ev_entry["filename"]

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$push": {"override_log": {
            "timestamp": _now(),
            "override_type": override_type,
            "control_id": control_id,
            "evidence_filename": ev_filename,
            "original_value": str([i.get("finding", "") for i in original_issues]),
            "override_value": "accepted",
            "reason": reason,
        }}},
    )
    return {"overridden": True}


@router.patch("/sessions/{session_id}/controls/{control_id}/sampling")
def update_sampling(session_id: str, control_id: str, body: dict) -> dict:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    updates = {}
    if "selection_strategy" in body:
        updates["sampling.selection_strategy"] = body["selection_strategy"]
    if "selected_size" in body:
        updates["sampling.selected_size"] = body["selected_size"]
    if "selected_items" in body:
        updates["sampling.selected_items"] = body["selected_items"]
    if "population_description" in body:
        updates["sampling.population_description"] = body["population_description"]
    if "sample_period" in body:
        updates["sampling.sample_period"] = body["sample_period"]

    if "selection_strategy" in body:
        original = control.get("sampling", {}).get("selection_strategy")
        reason = body.get("reason", "")
        if original and original != body["selection_strategy"] and reason:
            db.ct_sessions.update_one(
                {"_id": session_id},
                {"$push": {"override_log": {
                    "timestamp": _now(),
                    "override_type": "sampling_methodology",
                    "control_id": control_id,
                    "evidence_filename": None,
                    "original_value": str(original),
                    "override_value": str(body["selection_strategy"]),
                    "reason": reason,
                }}},
            )

    updates["updated_at"] = _now()
    db.ct_controls.update_one({"_id": control_id}, {"$set": updates})
    return {"updated": True}


@router.post("/sessions/{session_id}/confirm-mapping", status_code=202)
def confirm_mapping(session_id: str) -> dict:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    controls = list(db.ct_controls.find({"session_id": session_id}))
    unresolved = []

    for ctrl in controls:
        ctrl_issues = []
        mode = ctrl.get("sampling", {}).get("mode", "none")

        if mode in ("sample", "both"):
            pop_ca = ctrl.get("sampling", {}).get("population_ca_verification", {})
            if pop_ca.get("completeness_passed") is not True or pop_ca.get("accuracy_passed") is not True:
                if not pop_ca.get("overridden"):
                    ctrl_issues.append("Population C&A not resolved")

        if not ctrl.get("evidence_files"):
            ctrl_issues.append("No evidence files uploaded")

        for ev in ctrl.get("evidence_files", []):
            ca = ev.get("ca_verification", {})
            if ca.get("completeness_passed") is not True or ca.get("accuracy_passed") is not True:
                if not ca.get("overridden"):
                    ctrl_issues.append(f"Evidence '{ev['filename']}' C&A not resolved")

        if ctrl_issues:
            unresolved.append({
                "control_id": ctrl["_id"],
                "control_name": ctrl["control_name"],
                "unresolved_files": [{"filename": i} for i in ctrl_issues],
            })

    if unresolved:
        raise HTTPException(
            status_code=409,
            detail={"blocked": True, "reason": "C&A verification gate not cleared", "unresolved": unresolved},
        )

    from utils.control_assurance.pipeline.stage4_testing import run_testing
    task = run_testing.apply_async(args=[session_id], queue="ct_pipeline")
    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {"stage": "testing", "celery_task_id": task.id, "updated_at": _now()}},
    )
    return {"celery_task_id": task.id, "status": "testing_queued"}
```

- [ ] **Step 5: Run all pipeline tests**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages1_3.py tests/test_ct_prompts.py -v
```

Expected: all tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add utils/control_assurance/evidence_extractor.py \
        utils/control_assurance/pipeline/stage3_evidence.py \
        api/routers/ct_v2.py api/tests/test_ct_pipeline_stages1_3.py
git commit -m "feat(ct-v2): Stage 3 evidence C&A, mapping, sampling, and confirm-mapping gate"
```

---

### Task 6: Docker Build Verification

**Files:** None

- [ ] **Step 1: Build and start ct_worker**

```bash
docker compose up --build -d ct_worker
docker logs ct_worker_Trace_KV --tail 30
```

Expected: `celery@... ready` and `Registered tasks:` listing `ct.parse_template`, `ct.llm_review`, `ct.evidence_mapping`.

- [ ] **Step 2: Run full test suite**

```bash
cd api && python -m pytest tests/ -v
```

Expected: all tests PASSED.

- [ ] **Step 3: Update HANDOFF.md**

Append to `docs/HANDOFF.md`:

```markdown
## CT V2 — Sub-plan 2: Pipeline Stages 1–3 (2026-05-12)

**Status:** Complete

- `utils/control_assurance/celery_app.py` — Celery app for CT pipeline (`ct_pipeline` queue)
- `utils/control_assurance/prompts/` — 4 prompt builder modules (case_analysis, ca_verification, sampling, evidence_mapping)
- `utils/control_assurance/evidence_extractor.py` — file content extraction (PDF, Excel, CSV, DOCX, image, ZIP, TXT)
- `utils/control_assurance/pipeline/stage1_parse.py` — parse Excel input template → ct_controls
- `utils/control_assurance/pipeline/stage2_review.py` — LLM case analysis → suggestions + questions
- `utils/control_assurance/pipeline/stage3_evidence.py` — population C&A, sampling recommendation, evidence C&A + mapping
- New `ct_worker` Docker service added to docker-compose.yml
- Stage 3 API endpoints: GET/PATCH mapping, PATCH ca-override, PATCH sampling, POST confirm-mapping (HTTP 409 gate)
- Stage 2 API endpoints: GET suggestions, PATCH suggestion, POST question answer, POST confirm-review

**Next:** Sub-plan 3 — Stages 4–5 (testing, workbook generation, issues).
```

- [ ] **Step 4: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: HANDOFF updated, CT V2 Sub-plan 2 complete"
```

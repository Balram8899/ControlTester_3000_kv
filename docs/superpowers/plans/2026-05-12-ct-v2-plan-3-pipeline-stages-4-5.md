# Control Testing V2 — Plan 3: Pipeline Stages 4–5

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stages 4–5 of the CT pipeline — control testing execution with SOX ITGC tickmarks, exception escalation, workbook generation with annotated evidence tabs, issues drafting, Issues API integration, and session sign-off.

**Architecture:** Three new prompt modules in `utils/control_assurance/prompts/`. Two new Celery tasks — `stage4_testing` and `stage5_workbook` — both in `utils/control_assurance/pipeline/`. A `workbook_builder.py` utility handles all Excel assembly and per-file-type evidence rendering. New API endpoints in `api/routers/ct_v2.py` expose control results, issues CRUD, push-to-issues-module, and sign-off. All LLM calls use `get_llm()` with no overrides.

**Tech Stack:** Celery, pymongo, openpyxl, Pillow, pymupdf (fitz), python-docx, LangChain (via `get_llm()`), pytest, mongomock

**Prerequisite:** Plan 2 complete — `ct_worker` running, Stages 1–3 tasks registered, `confirm-mapping` endpoint returns 202.

---

## Spec Alignment Update

Apply these corrections before executing any task in this plan:

- Use the spec data contract exactly. Testing output fields are `todi_results`, `sample_results[].sample_num`, `sample_results[].application`, `sample_results[].item_reference`, `sample_results[].step_results`, and `exceptions[].ref`. Do not implement the older `walkthrough_result`, `sample_ref`, `exception_ref`, or `root_cause_group` shape from the draft snippets.
- Exception objects must include `ref`, `sample_num`, `description`, `root_cause`, `auditor_disposition`, and later `issues_log_ref`. Reuse the same `ref` for repeated root-cause failures and ensure every X tickmark in `sample_results[].step_results` matches an entry in `exceptions[]`.
- Issue drafting belongs to Stage 4 after control testing and narrative generation. Stage 5 should generate workbooks only. Stage 4 creates one `ct_issues` document per root-cause theme and links `exceptions[].issues_log_ref` plus `ct_controls.conclusions.issues_log_refs`.
- `ct_issues` must follow the spec fields: `title`, `severity`, `summary`, `detail`, `root_cause`, `recommendation`, `issues_log_ref`, `pushed_to_issues`, and `issues_module_id`. Do not use frontend-only names such as `issue_title`, `condition`, `criteria`, `risk_and_impact`, `pushed_to_issues_module`, or `pushed_issue_id` in MongoDB.
- Workbook generation must clone/fill `SOX_ITGC_Testing_Workpaper_v2.xlsx` from the worker template location. Do not build the core workpaper from a blank `openpyxl.Workbook()` except as a fallback test fixture.
- Workbooks written to GridFS must use metadata `{ "type": "workbook_output", "session_id": session_id, "control_id": cid, "filename": filename }`.
- The download endpoint for `GET /ct/sessions/:id/controls/:cid/workbook` is already created in Plan 1. Plan 3 may extend it, but must not define a duplicate FastAPI route with different behavior.
- Add the missing `POST /ct/sessions/:id/issues/push-all` endpoint required by the spec.

## Shared Build Log

All four CT V2 plans share one handoff log: `docs/superpowers/plans/2026-05-12-ct-v2-build-log.md`.

Before starting a task, append a short entry with the task name, planned files, and current status. After completing or pausing a task, append what changed, verification run, blockers, and the exact next step. Keep entries brief but specific enough that another engineer can resume without rereading the whole thread.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `utils/control_assurance/prompts/control_testing.py` | Stage 4 per-control testing prompt |
| Create | `utils/control_assurance/prompts/workpaper_narrative.py` | Stage 5 testing summary narrative prompt |
| Create | `utils/control_assurance/prompts/issue_drafting.py` | Stage 5 issue draft prompt |
| Create | `utils/control_assurance/pipeline/stage4_testing.py` | Celery task: execute tests, assign tickmarks, escalate exceptions |
| Create | `utils/control_assurance/pipeline/stage5_workbook.py` | Celery task: generate workbooks + issue drafts |
| Create | `utils/control_assurance/workbook_builder.py` | Excel workbook assembly + evidence tab rendering |
| Modify | `utils/control_assurance/celery_app.py` | Add stage4 + stage5 to `include` list |
| Modify | `api/routers/ct_v2.py` | Add control results, issues, push-to-issues, sign-off endpoints |
| Create | `api/tests/test_ct_pipeline_stages4_5.py` | pytest tests |

---

### Task 1: Prompt Modules — Testing, Narrative, Issue Drafting

**Files:**
- Create: `utils/control_assurance/prompts/control_testing.py`
- Create: `utils/control_assurance/prompts/workpaper_narrative.py`
- Create: `utils/control_assurance/prompts/issue_drafting.py`

- [ ] **Step 1: Write failing tests**

```python
# api/tests/test_ct_pipeline_stages4_5.py
import json
import pytest
import mongomock
from unittest.mock import patch, MagicMock


@pytest.fixture()
def mock_db():
    client = mongomock.MongoClient()
    return client["trace_db"]


def test_control_testing_prompt_is_string():
    from utils.control_assurance.prompts.control_testing import build_control_testing_prompt
    session = {
        "title": "Q1 ITGC", "entity": "Tech",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX",
    }
    control = {
        "control_id": "ITGC-001", "control_name": "Password Policy",
        "control_type": "Preventive", "domain": "Access Mgmt",
        "frequency": "Continuous", "inherent_risk_rating": "High",
        "walkthrough_performed": False,
        "test_steps": [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}],
        "sampling": {"mode": "sample", "selected_size": 25, "selection_strategy": "random"},
        "evidence_files": [{"filename": "ad_policy.png", "file_type": "image",
                            "mapped_step_labels": ["A"], "identified_value": "Min length: 12"}],
    }
    prompt = build_control_testing_prompt(session, control)
    assert isinstance(prompt, str)
    assert "sample_results" in prompt
    assert "ITGC-001" in prompt


def test_workpaper_narrative_prompt_is_string():
    from utils.control_assurance.prompts.workpaper_narrative import build_workpaper_narrative_prompt
    session = {"title": "Q1 ITGC", "entity": "Tech",
               "testing_period": {"from": "2026-01-01", "to": "2026-03-31"}, "framework": "SOX"}
    control = {
        "control_id": "ITGC-001", "control_name": "Password Policy",
        "test_steps": [{"label": "A", "description": "Inspect policy"}],
        "sample_results": [{"sample_ref": "S-001", "step_results": [{"label": "A", "tickmark": "√"}]}],
        "exceptions": [],
        "conclusions": {"d_and_i": "Effective", "oe": "Effective"},
    }
    prompt = build_workpaper_narrative_prompt(session, control)
    assert isinstance(prompt, str)
    assert "testing_summary" in prompt


def test_issue_drafting_prompt_is_string():
    from utils.control_assurance.prompts.issue_drafting import build_issue_drafting_prompt
    session = {"title": "Q1 ITGC", "entity": "Tech",
               "testing_period": {"from": "2026-01-01", "to": "2026-03-31"}, "framework": "SOX"}
    control = {"control_id": "ITGC-001", "control_name": "Password Policy",
               "control_type": "Preventive", "domain": "Access Mgmt"}
    exception = {
        "exception_ref": "X1", "step_label": "A", "sample_ref": "S-001",
        "description": "Password min length is 8, expected ≥12",
        "root_cause_group": "config",
    }
    prompt = build_issue_drafting_prompt(session, control, [exception])
    assert isinstance(prompt, str)
    assert "title" in prompt
    assert "X1" in prompt
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py -v
```

Expected: `ImportError` for all 3 prompt modules.

- [ ] **Step 3: Write control_testing.py**

```python
# utils/control_assurance/prompts/control_testing.py
import json


def build_control_testing_prompt(session: dict, control: dict) -> str:
    data = {
        "session": {
            "title": session["title"],
            "entity": session["entity"],
            "testing_period": session["testing_period"],
            "framework": session["framework"],
        },
        "control": {
            "control_id": control["control_id"],
            "control_name": control["control_name"],
            "control_type": control["control_type"],
            "domain": control.get("domain", ""),
            "frequency": control.get("frequency", ""),
            "inherent_risk_rating": control.get("inherent_risk_rating", "Medium"),
            "walkthrough_performed": control.get("walkthrough_performed", False),
            "test_steps": control.get("test_steps", []),
            "sampling": {
                "mode": control.get("sampling", {}).get("mode", "sample"),
                "selected_size": control.get("sampling", {}).get("selected_size", 0),
                "selection_strategy": control.get("sampling", {}).get("selection_strategy"),
                "selected_items": control.get("sampling", {}).get("selected_items", []),
            },
            "evidence_files": [
                {
                    "filename": ev["filename"],
                    "file_type": ev["file_type"],
                    "mapped_step_labels": ev.get("mapped_step_labels", []),
                    "identified_value": ev.get("identified_value", ""),
                }
                for ev in control.get("evidence_files", [])
            ],
        },
    }
    return f"""You are a senior IT auditor executing control testing for a SOX ITGC engagement.

For WALKTHROUGH testing (mode=walkthrough or both):
- Assess whether the evidence demonstrates the control is designed correctly
- Assign tickmark W (walkthrough — test of design only)

For SAMPLE testing (mode=sample or both):
- Assess each sampled item against every mapped test step
- Assign tickmark √ (pass), X<n> (exception, numbered globally starting from where prior exceptions left off), or NA (not applicable)
- Exception numbers are GLOBAL to the control — X1, X2, ... across all steps and samples
- If exception rate > 20% of sample population, operating effectiveness conclusion MUST be "Ineffective"

For each exception, provide:
- exception_ref: X<n>
- step_label: which test step failed
- sample_ref: which sample item
- description: exactly what was observed vs. expected
- root_cause_group: "config" | "process" | "people" | "system" | "documentation" | "other"

Return valid JSON only. Do not include prose outside the JSON object.

OUTPUT SCHEMA:
{{
  "walkthrough_result": {{
    "tickmark": "W | null",
    "tod_conclusion": "Effective | Ineffective | null",
    "tod_notes": "string"
  }},
  "sample_results": [
    {{
      "sample_ref": "S-001",
      "step_results": [
        {{
          "label": "A",
          "tickmark": "√ | NA | X1",
          "notes": "string"
        }}
      ]
    }}
  ],
  "exceptions": [
    {{
      "exception_ref": "X1",
      "step_label": "A",
      "sample_ref": "S-001",
      "description": "string",
      "root_cause_group": "config | process | people | system | documentation | other"
    }}
  ],
  "conclusions": {{
    "d_and_i": "Effective | Ineffective",
    "oe": "Effective | Ineffective",
    "deficiencies_noted": false,
    "rationale": "string"
  }},
  "testing_methods": {{
    "inquiry": false,
    "observation": false,
    "inspection": true,
    "reperformance": false
  }}
}}

DATA:
{json.dumps(data, indent=2)}"""
```

- [ ] **Step 4: Write workpaper_narrative.py**

```python
# utils/control_assurance/prompts/workpaper_narrative.py
import json


def build_workpaper_narrative_prompt(session: dict, control: dict) -> str:
    data = {
        "session": {
            "title": session["title"],
            "entity": session["entity"],
            "testing_period": session["testing_period"],
            "framework": session["framework"],
        },
        "control": {
            "control_id": control["control_id"],
            "control_name": control["control_name"],
            "test_steps": control.get("test_steps", []),
            "sample_results": control.get("sample_results", []),
            "exceptions": control.get("exceptions", []),
            "conclusions": control.get("conclusions", {}),
            "testing_methods": control.get("testing_methods", {}),
        },
    }
    return f"""You are a senior IT auditor writing the testing narrative for an audit workpaper.

Write a concise professional testing summary (3–5 sentences) that:
1. States what was tested and how (inquiry/inspection/reperformance)
2. Summarises sample size and selection strategy
3. Describes any exceptions found (or confirms none)
4. States the operating effectiveness conclusion and its basis

Then write a brief design & implementation conclusion statement (1–2 sentences).

Return valid JSON only.

OUTPUT SCHEMA:
{{
  "testing_summary": "string",
  "d_and_i_statement": "string"
}}

DATA:
{json.dumps(data, indent=2)}"""
```

- [ ] **Step 5: Write issue_drafting.py**

```python
# utils/control_assurance/prompts/issue_drafting.py
import json


def build_issue_drafting_prompt(session: dict, control: dict, exceptions: list[dict]) -> str:
    data = {
        "session": {
            "title": session["title"],
            "entity": session["entity"],
            "testing_period": session["testing_period"],
            "framework": session["framework"],
        },
        "control": {
            "control_id": control["control_id"],
            "control_name": control["control_name"],
            "control_type": control["control_type"],
            "domain": control.get("domain", ""),
        },
        "exceptions": exceptions,
    }
    return f"""You are an IT audit manager drafting an issue from control testing exceptions.

Group exceptions by root_cause_group and draft one issue per root cause group. Each issue should follow
standard audit issue format: title, condition (what was found), criteria (what should be), 
cause (why it happened), risk/impact, and recommendation.

Return valid JSON only.

OUTPUT SCHEMA:
{{
  "issues": [
    {{
      "title": "string",
      "root_cause_group": "string",
      "exception_refs": ["X1", "X2"],
      "condition": "string",
      "criteria": "string",
      "cause": "string",
      "risk_and_impact": "string",
      "recommendation": "string",
      "severity": "Critical | High | Medium | Low | Informational"
    }}
  ]
}}

DATA:
{json.dumps(data, indent=2)}"""
```

- [ ] **Step 6: Run tests**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py::test_control_testing_prompt_is_string \
    tests/test_ct_pipeline_stages4_5.py::test_workpaper_narrative_prompt_is_string \
    tests/test_ct_pipeline_stages4_5.py::test_issue_drafting_prompt_is_string -v
```

Expected: 3 tests PASSED.

- [ ] **Step 7: Commit**

```bash
git add utils/control_assurance/prompts/control_testing.py \
        utils/control_assurance/prompts/workpaper_narrative.py \
        utils/control_assurance/prompts/issue_drafting.py \
        api/tests/test_ct_pipeline_stages4_5.py
git commit -m "feat(ct-v2): prompt modules for Stages 4-5 (testing, narrative, issue drafting)"
```

---

### Task 2: Stage 4 — Control Testing Execution

**Files:**
- Create: `utils/control_assurance/pipeline/stage4_testing.py`
- Modify: `utils/control_assurance/celery_app.py`

- [ ] **Step 1: Write failing test**

Append to `api/tests/test_ct_pipeline_stages4_5.py`:

```python
def test_run_testing_writes_results(mock_db):
    from utils.control_assurance.pipeline.stage4_testing import _run_testing

    session_id = "sess-s4-001"
    control_id = "ctrl-s4-001"

    mock_db.ct_sessions.insert_one({
        "_id": session_id, "stage": "testing",
        "title": "Q1 ITGC", "entity": "Tech",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX",
    })
    mock_db.ct_controls.insert_one({
        "_id": control_id, "session_id": session_id,
        "control_id": "ITGC-001", "control_name": "Password Policy",
        "control_type": "Preventive", "domain": "Access Mgmt",
        "frequency": "Continuous", "inherent_risk_rating": "High",
        "walkthrough_performed": False,
        "test_steps": [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}],
        "sampling": {"mode": "sample", "selected_size": 5, "selection_strategy": "random", "selected_items": []},
        "evidence_files": [{"filename": "policy.png", "file_type": "image",
                            "mapped_step_labels": ["A"], "identified_value": "Min length: 12",
                            "gridfs_id": "g001"}],
        "sample_results": [], "exceptions": [],
        "conclusions": {"d_and_i": None, "oe": None},
        "testing_methods": {"inquiry": False, "observation": False, "inspection": False, "reperformance": False},
        "status": "pending",
    })

    fake_response = json.dumps({
        "walkthrough_result": {"tickmark": None, "tod_conclusion": None, "tod_notes": ""},
        "sample_results": [
            {"sample_ref": "S-001", "step_results": [{"label": "A", "tickmark": "√", "notes": ""}]},
            {"sample_ref": "S-002", "step_results": [{"label": "A", "tickmark": "X1", "notes": "Too short"}]},
        ],
        "exceptions": [
            {"exception_ref": "X1", "step_label": "A", "sample_ref": "S-002",
             "description": "Min length is 8, expected 12", "root_cause_group": "config"}
        ],
        "conclusions": {"d_and_i": "Effective", "oe": "Effective",
                        "deficiencies_noted": True, "rationale": "1 of 5 items failed"},
        "testing_methods": {"inquiry": False, "observation": False, "inspection": True, "reperformance": False},
    })

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content=fake_response)

    with patch("utils.control_assurance.pipeline.stage4_testing._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage4_testing.get_llm", return_value=mock_llm):
            _run_testing(session_id)

    ctrl = mock_db.ct_controls.find_one({"_id": control_id})
    assert len(ctrl["sample_results"]) == 2
    assert len(ctrl["exceptions"]) == 1
    assert ctrl["exceptions"][0]["exception_ref"] == "X1"
    assert ctrl["conclusions"]["oe"] == "Effective"
    assert ctrl["status"] == "complete"

    session = mock_db.ct_sessions.find_one({"_id": session_id})
    assert session["stage"] == "complete"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py::test_run_testing_writes_results -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write stage4_testing.py**

```python
# utils/control_assurance/pipeline/stage4_testing.py
from __future__ import annotations
import json
from datetime import datetime, timezone

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.prompts.control_testing import build_control_testing_prompt
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


def _enforce_exception_rate(result: dict, sample_size: int) -> dict:
    """Force OE to Ineffective if exception rate > 20%."""
    exceptions = result.get("exceptions", [])
    if sample_size > 0 and len(exceptions) / sample_size > 0.20:
        result.setdefault("conclusions", {})["oe"] = "Ineffective"
        result["conclusions"]["deficiencies_noted"] = True
        result["conclusions"]["rationale"] = (
            result["conclusions"].get("rationale", "") +
            f" [AUTO] Exception rate {len(exceptions)}/{sample_size} exceeds 20% threshold — OE forced Ineffective."
        )
    return result


def _run_testing(session_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    controls = list(db.ct_controls.find({"session_id": session_id, "status": "pending"}))

    completed_ids = []

    for control in controls:
        cid = control["_id"]
        db.ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage_checkpoint": {
                "stage": "testing",
                "step": f"testing_{cid}",
                "completed_control_ids": completed_ids,
                "updated_at": _now(),
            }}},
        )

        prompt = build_control_testing_prompt(session, control)
        result = _call_llm_json(prompt)

        sample_size = control.get("sampling", {}).get("selected_size", 0)
        mode = control.get("sampling", {}).get("mode", "sample")
        if mode in ("sample", "both"):
            result = _enforce_exception_rate(result, sample_size)

        conclusions = result.get("conclusions", {})
        db.ct_controls.update_one(
            {"_id": cid},
            {"$set": {
                "walkthrough_result": result.get("walkthrough_result"),
                "sample_results": result.get("sample_results", []),
                "exceptions": result.get("exceptions", []),
                "conclusions.d_and_i": conclusions.get("d_and_i"),
                "conclusions.oe": conclusions.get("oe"),
                "conclusions.deficiencies_noted": conclusions.get("deficiencies_noted", False),
                "conclusions.rationale": conclusions.get("rationale", ""),
                "testing_methods": result.get("testing_methods", {}),
                "status": "complete",
                "updated_at": _now(),
            }},
        )
        completed_ids.append(cid)

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "stage": "complete",
            "stage_checkpoint": {
                "stage": "testing",
                "step": "complete",
                "completed_control_ids": completed_ids,
                "updated_at": _now(),
            },
            "updated_at": _now(),
        }},
    )


@celery_app.task(name="ct.run_testing", queue="ct_pipeline", acks_late=True, reject_on_worker_lost=True)
def run_testing(session_id: str) -> dict:
    try:
        _run_testing(session_id)
        from utils.control_assurance.pipeline.stage5_workbook import generate_workbooks
        task = generate_workbooks.apply_async(args=[session_id], queue="ct_pipeline")
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"celery_task_id": task.id}},
        )
        return {"status": "ok", "session_id": session_id, "next_task": task.id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage": "failed", "stage_checkpoint": {"error": str(exc), "updated_at": _now()}}},
        )
        raise
```

- [ ] **Step 4: Update celery_app.py to include stage4 and stage5**

In `utils/control_assurance/celery_app.py`, replace the `include` list:

```python
celery_app = Celery(
    "ct_pipeline",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=[
        "utils.control_assurance.pipeline.stage1_parse",
        "utils.control_assurance.pipeline.stage2_review",
        "utils.control_assurance.pipeline.stage3_evidence",
        "utils.control_assurance.pipeline.stage4_testing",
        "utils.control_assurance.pipeline.stage5_workbook",
    ],
)
```

- [ ] **Step 5: Run tests**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py -v
```

Expected: all tests written so far PASSED.

- [ ] **Step 6: Commit**

```bash
git add utils/control_assurance/pipeline/stage4_testing.py \
        utils/control_assurance/celery_app.py \
        api/tests/test_ct_pipeline_stages4_5.py
git commit -m "feat(ct-v2): Stage 4 control testing execution with tickmarks and exception escalation"
```

---

### Task 3: Workbook Builder

**Files:**
- Create: `utils/control_assurance/workbook_builder.py`

The workbook builder assembles one Excel workbook per control using the SOX ITGC workpaper structure. Evidence files are added as named tabs with per-type rendering and annotations.

- [ ] **Step 1: Write failing test**

Append to `api/tests/test_ct_pipeline_stages4_5.py`:

```python
def test_build_workbook_returns_bytes(mock_db):
    from utils.control_assurance.workbook_builder import build_control_workbook

    session = {
        "_id": "sess-wb-001", "title": "Q1 ITGC", "entity": "Tech",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX",
        "sign_off": {
            "preparer": {"name": "Alice", "initials": "AK", "date": "2026-04-01"},
            "reviewer": {"name": "", "initials": "", "date": None},
            "manager": {"name": "", "initials": "", "date": None},
        },
        "override_log": [],
    }
    control = {
        "_id": "ctrl-wb-001", "control_id": "ITGC-001", "control_name": "Password Policy",
        "control_type": "Preventive", "domain": "Access Mgmt", "frequency": "Continuous",
        "inherent_risk_rating": "High", "control_owner": "John Smith",
        "framework_reference": "SOX s.404", "prior_period_result": "Effective",
        "walkthrough_performed": False,
        "test_steps": [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}],
        "sampling": {"mode": "sample", "selected_size": 5, "selection_strategy": "random",
                     "population_count": 100, "sample_period": "Jan-Mar 2026"},
        "evidence_files": [],
        "sample_results": [
            {"sample_ref": "S-001", "step_results": [{"label": "A", "tickmark": "√", "notes": ""}]},
        ],
        "exceptions": [],
        "conclusions": {"d_and_i": "Effective", "oe": "Effective",
                        "deficiencies_noted": False, "rationale": "No exceptions noted.",
                        "testing_summary": "Tested 5 samples. No exceptions.", "issues_log_refs": []},
        "testing_methods": {"inquiry": False, "observation": False, "inspection": True, "reperformance": False},
    }

    wb_bytes = build_control_workbook(session, control, evidence_blobs=[])
    assert isinstance(wb_bytes, bytes)
    assert len(wb_bytes) > 100
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py::test_build_workbook_returns_bytes -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write workbook_builder.py**

```python
# utils/control_assurance/workbook_builder.py
from __future__ import annotations
import io
from typing import Any

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

_HEADER_FILL = PatternFill("solid", fgColor="003366")
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
_LABEL_FONT = Font(bold=True, size=10)
_PASS_FILL = PatternFill("solid", fgColor="C6EFCE")
_FAIL_FILL = PatternFill("solid", fgColor="FFC7CE")
_EXCEPTION_BORDER = Border(
    left=Side(style="thick", color="FF0000"),
    right=Side(style="thick", color="FF0000"),
    top=Side(style="thick", color="FF0000"),
    bottom=Side(style="thick", color="FF0000"),
)

_TICKMARK_LEGEND = {
    "√": "Pass — control operating effectively",
    "NA": "Not Applicable",
    "W": "Walkthrough — Test of Design only",
}


def _header_row(ws, headers: list[str]) -> None:
    ws.append(headers)
    for cell in ws[ws.max_row]:
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", wrap_text=True)


def _kv(ws, label: str, value: Any) -> None:
    ws.append([label, str(value) if value is not None else ""])
    ws[ws.max_row][0].font = _LABEL_FONT


def _build_cover_sheet(wb: openpyxl.Workbook, session: dict, control: dict) -> None:
    ws = wb.active
    ws.title = "Workpaper Cover"
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 50

    _kv(ws, "Assessment Title", session.get("title", ""))
    _kv(ws, "Entity", session.get("entity", ""))
    period = session.get("testing_period", {})
    _kv(ws, "Testing Period", f"{period.get('from', '')} to {period.get('to', '')}")
    _kv(ws, "Framework", session.get("framework", ""))
    ws.append([])
    _kv(ws, "Control ID", control.get("control_id", ""))
    _kv(ws, "Control Name", control.get("control_name", ""))
    _kv(ws, "Control Type", control.get("control_type", ""))
    _kv(ws, "Domain", control.get("domain", ""))
    _kv(ws, "Frequency", control.get("frequency", ""))
    _kv(ws, "Inherent Risk Rating", control.get("inherent_risk_rating", ""))
    _kv(ws, "Control Owner", control.get("control_owner", ""))
    _kv(ws, "Framework Reference", control.get("framework_reference", ""))
    _kv(ws, "Prior Period Result", control.get("prior_period_result", ""))
    ws.append([])

    sign_off = session.get("sign_off", {})
    ws.append(["Sign-Off", "Name", "Initials", "Date"])
    for cell in ws[ws.max_row]:
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
    for role in ("preparer", "reviewer", "manager"):
        entry = sign_off.get(role, {})
        ws.append([role.capitalize(), entry.get("name", ""), entry.get("initials", ""), entry.get("date", "")])


def _build_test_steps_sheet(wb: openpyxl.Workbook, control: dict) -> None:
    ws = wb.create_sheet("Test Steps")
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 60
    ws.column_dimensions["C"].width = 40
    _header_row(ws, ["Step", "Description", "Evidence Required"])
    for step in control.get("test_steps", []):
        ws.append([step.get("label", ""), step.get("description", ""), step.get("evidence_required", "")])


def _build_sample_results_sheet(wb: openpyxl.Workbook, control: dict) -> None:
    ws = wb.create_sheet("Sample Results")
    steps = control.get("test_steps", [])
    step_labels = [s["label"] for s in steps]
    headers = ["Sample Ref"] + step_labels + ["Notes"]
    _header_row(ws, headers)
    ws.column_dimensions["A"].width = 14

    exception_refs = {e["exception_ref"] for e in control.get("exceptions", [])}

    for result in control.get("sample_results", []):
        row_data = [result["sample_ref"]]
        any_exception = False
        for label in step_labels:
            step_res = next((r for r in result.get("step_results", []) if r["label"] == label), {})
            tickmark = step_res.get("tickmark", "")
            row_data.append(tickmark)
            if tickmark and tickmark not in ("√", "NA", "W"):
                any_exception = True
        row_data.append("")
        ws.append(row_data)

        if any_exception:
            for cell in ws[ws.max_row]:
                cell.fill = _FAIL_FILL
        else:
            for cell in ws[ws.max_row]:
                cell.fill = _PASS_FILL

    ws.append([])
    ws.append(["TICKMARK LEGEND"])
    ws[ws.max_row][0].font = _LABEL_FONT
    for mark, desc in _TICKMARK_LEGEND.items():
        ws.append([mark, desc])
    for en_ref in sorted(exception_refs):
        ws.append([en_ref, f"Exception — see Exceptions sheet"])


def _build_exceptions_sheet(wb: openpyxl.Workbook, control: dict) -> None:
    ws = wb.create_sheet("Exceptions")
    if not control.get("exceptions"):
        ws.append(["No exceptions noted."])
        return
    _header_row(ws, ["Ref", "Step", "Sample", "Description", "Root Cause Group"])
    ws.column_dimensions["A"].width = 8
    ws.column_dimensions["B"].width = 8
    ws.column_dimensions["C"].width = 10
    ws.column_dimensions["D"].width = 60
    ws.column_dimensions["E"].width = 20
    for exc in control.get("exceptions", []):
        ws.append([
            exc.get("exception_ref", ""),
            exc.get("step_label", ""),
            exc.get("sample_ref", ""),
            exc.get("description", ""),
            exc.get("root_cause_group", ""),
        ])
        for cell in ws[ws.max_row]:
            cell.border = _EXCEPTION_BORDER


def _build_conclusions_sheet(wb: openpyxl.Workbook, control: dict) -> None:
    ws = wb.create_sheet("Conclusions")
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 60
    conclusions = control.get("conclusions", {})
    methods = control.get("testing_methods", {})

    _kv(ws, "Design & Implementation", conclusions.get("d_and_i", ""))
    _kv(ws, "Operating Effectiveness", conclusions.get("oe", ""))
    _kv(ws, "Deficiencies Noted", "Yes" if conclusions.get("deficiencies_noted") else "No")
    _kv(ws, "Rationale", conclusions.get("rationale", ""))
    ws.append([])
    _kv(ws, "Testing Summary", conclusions.get("testing_summary", ""))
    ws.append([])
    ws.append(["Testing Methods"])
    ws[ws.max_row][0].font = _LABEL_FONT
    for method, used in methods.items():
        ws.append([method.capitalize(), "Yes" if used else "No"])

    issues_refs = conclusions.get("issues_log_refs", [])
    if issues_refs:
        ws.append([])
        ws.append(["Issues Log References"])
        ws[ws.max_row][0].font = _LABEL_FONT
        for ref in issues_refs:
            ws.append(["", ref])


def _build_override_log_sheet(wb: openpyxl.Workbook, session: dict, control_id: str) -> None:
    overrides = [
        o for o in session.get("override_log", [])
        if o.get("control_id") == control_id
    ]
    if not overrides:
        return
    ws = wb.create_sheet("Override Log")
    _header_row(ws, ["Timestamp", "Override Type", "Evidence", "Original", "Override Value", "Reason"])
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 24
    ws.column_dimensions["C"].width = 30
    ws.column_dimensions["D"].width = 30
    ws.column_dimensions["E"].width = 30
    ws.column_dimensions["F"].width = 50
    for o in overrides:
        ws.append([
            o.get("timestamp", ""), o.get("override_type", ""),
            o.get("evidence_filename", ""), o.get("original_value", ""),
            o.get("override_value", ""), o.get("reason", ""),
        ])


def _render_image_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    ws = wb.create_sheet(tab_name)
    try:
        from PIL import Image, ImageDraw
        import io as _io
        img = Image.open(_io.BytesIO(blob)).convert("RGB")

        for region in ev.get("annotation_regions", []):
            if region.get("annotation_type") == "bbox":
                bbox = region.get("bbox", {})
                if bbox:
                    draw = ImageDraw.Draw(img)
                    x, y, w, h = bbox.get("x", 0), bbox.get("y", 0), bbox.get("w", 0), bbox.get("h", 0)
                    draw.rectangle([x, y, x + w, y + h], outline="red", width=3)

        out = _io.BytesIO()
        img.save(out, format="PNG")
        xl_img = openpyxl.drawing.image.Image(out)
        ws.add_image(xl_img, "A1")
    except Exception:
        ws.append([f"[Image: {ev.get('filename', '')}]"])
        ws.append([f"Identified value: {ev.get('identified_value', '')}"])


def _render_pdf_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    ws = wb.create_sheet(tab_name)
    try:
        import fitz
        import io as _io
        doc = fitz.open(stream=blob, filetype="pdf")
        col = 1
        for page_num, page in enumerate(doc):
            mat = fitz.Matrix(150 / 72, 150 / 72)  # 150 dpi
            pix = page.get_pixmap(matrix=mat)
            png_bytes = pix.tobytes("png")
            xl_img = openpyxl.drawing.image.Image(_io.BytesIO(png_bytes))
            xl_img.anchor = f"{get_column_letter(col)}1"
            ws.add_image(xl_img)
            col += 15
    except Exception:
        ws.append([f"[PDF: {ev.get('filename', '')}]"])


def _render_excel_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    ws = wb.create_sheet(tab_name)
    try:
        import io as _io
        src = openpyxl.load_workbook(_io.BytesIO(blob), data_only=True)
        src_ws = src.active
        exception_cells = set()
        for region in ev.get("annotation_regions", []):
            if region.get("annotation_type") == "cell":
                cell_pos = region.get("cell", {})
                if cell_pos:
                    exception_cells.add((cell_pos.get("row", 0) + 1, cell_pos.get("col", 0) + 1))

        for row_idx, row in enumerate(src_ws.iter_rows(values_only=True), start=1):
            ws.append(list(row))
            if exception_cells:
                for col_idx, _ in enumerate(row, start=1):
                    if (row_idx, col_idx) in exception_cells:
                        cell = ws.cell(row=row_idx, column=col_idx)
                        cell.border = _EXCEPTION_BORDER
    except Exception:
        ws.append([f"[Excel: {ev.get('filename', '')}]"])


def _render_csv_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    import csv
    ws = wb.create_sheet(tab_name)
    try:
        text = blob.decode("utf-8", errors="replace")
        reader = csv.reader(text.splitlines())
        for i, row in enumerate(reader):
            ws.append(row)
            if i == 0:
                for cell in ws[1]:
                    cell.fill = _HEADER_FILL
                    cell.font = _HEADER_FONT
    except Exception:
        ws.append([f"[CSV: {ev.get('filename', '')}]"])


def _render_docx_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    ws = wb.create_sheet(tab_name)
    try:
        from docx import Document
        import io as _io
        doc = Document(_io.BytesIO(blob))
        text_offsets = set()
        for region in ev.get("annotation_regions", []):
            if region.get("annotation_type") == "text_highlight":
                offset = region.get("text_offset", {})
                if offset:
                    text_offsets.add((offset.get("start", -1), offset.get("end", -1)))

        for para in doc.paragraphs:
            ws.append([para.text])
    except Exception:
        ws.append([f"[DOCX: {ev.get('filename', '')}]"])


def _render_txt_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    ws = wb.create_sheet(tab_name)
    text = blob.decode("utf-8", errors="replace")
    for line in text.splitlines()[:500]:
        ws.append([line])


def _render_evidence_tab(wb: openpyxl.Workbook, tab_name: str, ev: dict, blob: bytes) -> None:
    file_type = ev.get("file_type", "")
    if file_type == "image":
        _render_image_tab(wb, tab_name, ev, blob)
    elif file_type == "pdf":
        _render_pdf_tab(wb, tab_name, ev, blob)
    elif file_type == "excel":
        _render_excel_tab(wb, tab_name, ev, blob)
    elif file_type == "csv":
        _render_csv_tab(wb, tab_name, ev, blob)
    elif file_type == "docx":
        _render_docx_tab(wb, tab_name, ev, blob)
    else:
        _render_txt_tab(wb, tab_name, ev, blob)


def build_control_workbook(
    session: dict,
    control: dict,
    evidence_blobs: list[tuple[dict, bytes]],
) -> bytes:
    """Assemble a complete SOX ITGC workpaper workbook. Returns xlsx bytes."""
    wb = openpyxl.Workbook()

    _build_cover_sheet(wb, session, control)
    _build_test_steps_sheet(wb, control)
    _build_sample_results_sheet(wb, control)
    _build_exceptions_sheet(wb, control)
    _build_conclusions_sheet(wb, control)
    _build_override_log_sheet(wb, session, control["_id"])

    used_names: dict[str, int] = {}
    for ev, blob in evidence_blobs:
        base_name = ev.get("filename", "Evidence")[:28]
        count = used_names.get(base_name, 0)
        used_names[base_name] = count + 1
        tab_name = base_name if count == 0 else f"{base_name[:25]}_{count}"
        _render_evidence_tab(wb, tab_name, ev, blob)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
```

- [ ] **Step 4: Run test**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py::test_build_workbook_returns_bytes -v
```

Expected: PASSED.

- [ ] **Step 5: Commit**

```bash
git add utils/control_assurance/workbook_builder.py \
        api/tests/test_ct_pipeline_stages4_5.py
git commit -m "feat(ct-v2): workbook_builder with SOX ITGC sheet structure and per-type evidence rendering"
```

---

### Task 4: Stage 5 — Workbook Generation + Issue Drafting

**Files:**
- Create: `utils/control_assurance/pipeline/stage5_workbook.py`

- [ ] **Step 1: Write failing test**

Append to `api/tests/test_ct_pipeline_stages4_5.py`:

```python
def test_generate_workbooks_creates_gridfs_ids(mock_db):
    from utils.control_assurance.pipeline.stage5_workbook import _generate_workbooks

    session_id = "sess-s5-001"
    control_id = "ctrl-s5-001"

    mock_db.ct_sessions.insert_one({
        "_id": session_id, "title": "Q1 ITGC", "entity": "Tech",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX", "stage": "complete", "sign_off": {}, "override_log": [],
    })
    mock_db.ct_controls.insert_one({
        "_id": control_id, "session_id": session_id,
        "control_id": "ITGC-001", "control_name": "Password Policy",
        "control_type": "Preventive", "domain": "Access Mgmt", "frequency": "Continuous",
        "inherent_risk_rating": "High", "control_owner": "John Smith",
        "framework_reference": "SOX s.404", "prior_period_result": "Effective",
        "walkthrough_performed": False,
        "test_steps": [{"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}],
        "sampling": {"mode": "sample", "selected_size": 5, "selection_strategy": "random", "population_count": 100, "sample_period": "Jan-Mar 2026"},
        "evidence_files": [],
        "sample_results": [{"sample_ref": "S-001", "step_results": [{"label": "A", "tickmark": "√", "notes": ""}]}],
        "exceptions": [],
        "conclusions": {"d_and_i": "Effective", "oe": "Effective", "deficiencies_noted": False,
                        "rationale": "No exceptions.", "testing_summary": "", "issues_log_refs": []},
        "testing_methods": {"inquiry": False, "observation": False, "inspection": True, "reperformance": False},
        "status": "complete",
    })

    fake_narrative = json.dumps({"testing_summary": "Tested 5 samples with no exceptions.", "d_and_i_statement": "Control is effectively designed."})
    fake_issues = json.dumps({"issues": []})

    mock_llm = MagicMock()
    mock_llm.invoke.side_effect = [
        MagicMock(content=fake_narrative),
        MagicMock(content=fake_issues),
    ]

    fake_gridfs_id = "gridfs-wb-001"

    with patch("utils.control_assurance.pipeline.stage5_workbook._get_db", return_value=mock_db):
        with patch("utils.control_assurance.pipeline.stage5_workbook.get_llm", return_value=mock_llm):
            with patch("utils.control_assurance.pipeline.stage5_workbook.download_from_gridfs", return_value=b""):
                with patch("utils.control_assurance.pipeline.stage5_workbook.upload_to_gridfs", return_value=fake_gridfs_id):
                    _generate_workbooks(session_id)

    ctrl = mock_db.ct_controls.find_one({"_id": control_id})
    assert ctrl["workbook_output_id"] == fake_gridfs_id
    assert "Tested 5 samples" in ctrl["conclusions"]["testing_summary"]
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py::test_generate_workbooks_creates_gridfs_ids -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write stage5_workbook.py**

```python
# utils/control_assurance/pipeline/stage5_workbook.py
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone

from utils.control_assurance.celery_app import celery_app
from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.ct_gridfs import download_from_gridfs, upload_to_gridfs
from utils.control_assurance.prompts.workpaper_narrative import build_workpaper_narrative_prompt
from utils.control_assurance.prompts.issue_drafting import build_issue_drafting_prompt
from utils.control_assurance.workbook_builder import build_control_workbook
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


def _generate_workbooks(session_id: str) -> None:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    controls = list(db.ct_controls.find({"session_id": session_id, "status": "complete"}))

    for control in controls:
        cid = control["_id"]
        db.ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage_checkpoint": {
                "stage": "workbook_gen",
                "step": f"narrative_{cid}",
                "updated_at": _now(),
            }}},
        )

        narrative_prompt = build_workpaper_narrative_prompt(session, control)
        narrative = _call_llm_json(narrative_prompt)
        testing_summary = narrative.get("testing_summary", "")
        d_and_i_statement = narrative.get("d_and_i_statement", "")

        db.ct_controls.update_one(
            {"_id": cid},
            {"$set": {
                "conclusions.testing_summary": testing_summary,
                "conclusions.d_and_i_statement": d_and_i_statement,
                "updated_at": _now(),
            }},
        )

        control = db.ct_controls.find_one({"_id": cid})

        drafted_issues = []
        exceptions = control.get("exceptions", [])
        if exceptions:
            db.ct_sessions.update_one(
                {"_id": session_id},
                {"$set": {"stage_checkpoint": {
                    "stage": "workbook_gen",
                    "step": f"issue_drafting_{cid}",
                    "updated_at": _now(),
                }}},
            )
            issue_prompt = build_issue_drafting_prompt(session, control, exceptions)
            issue_result = _call_llm_json(issue_prompt)
            for issue_draft in issue_result.get("issues", []):
                issue_id = str(uuid.uuid4())
                doc = {
                    "_id": issue_id,
                    "session_id": session_id,
                    "control_id": cid,
                    "control_name": control["control_name"],
                    "exception_refs": issue_draft.get("exception_refs", []),
                    "title": issue_draft.get("title", ""),
                    "recommendation": issue_draft.get("recommendation", ""),
                    "summary": issue_draft.get("summary", ""),
                    "detail": issue_draft.get("detail", ""),
                    "root_cause": issue_draft.get("root_cause", ""),
                    "severity": issue_draft.get("severity", "Medium"),
                    "issues_log_ref": issue_draft.get("issues_log_ref", ""),
                    "pushed_to_issues": False,
                    "issues_module_id": None,
                    "created_at": _now(),
                    "updated_at": _now(),
                }
                db.ct_issues.insert_one(doc)
                drafted_issues.append(issue_id)

        if drafted_issues:
            db.ct_controls.update_one(
                {"_id": cid},
                {"$push": {"conclusions.issues_log_refs": {"$each": drafted_issues}}},
            )
            control = db.ct_controls.find_one({"_id": cid})

        db.ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage_checkpoint": {
                "stage": "workbook_gen",
                "step": f"building_wb_{cid}",
                "updated_at": _now(),
            }}},
        )

        evidence_blobs: list[tuple[dict, bytes]] = []
        for ev in control.get("evidence_files", []):
            gid = ev.get("gridfs_id")
            if gid:
                try:
                    blob = download_from_gridfs(gid)
                    evidence_blobs.append((ev, blob))
                except Exception:
                    pass

        wb_bytes = build_control_workbook(session, control, evidence_blobs)
        filename = f"CT_{control['control_id']}_workpaper.xlsx"
        wb_gridfs_id = upload_to_gridfs(
            wb_bytes, filename,
            {"type": "workbook_output", "session_id": session_id, "control_id": cid, "filename": filename},
        )

        db.ct_controls.update_one(
            {"_id": cid},
            {"$set": {"workbook_output_id": wb_gridfs_id, "updated_at": _now()}},
        )

    db.ct_sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "stage_checkpoint": {"stage": "workbook_gen", "step": "complete", "updated_at": _now()},
            "updated_at": _now(),
        }},
    )


@celery_app.task(name="ct.generate_workbooks", queue="ct_pipeline", acks_late=True, reject_on_worker_lost=True)
def generate_workbooks(session_id: str) -> dict:
    try:
        _generate_workbooks(session_id)
        return {"status": "ok", "session_id": session_id}
    except Exception as exc:
        _get_db().ct_sessions.update_one(
            {"_id": session_id},
            {"$set": {"stage": "failed", "stage_checkpoint": {"error": str(exc), "updated_at": _now()}}},
        )
        raise
```

- [ ] **Step 4: Run all Stage 4–5 tests**

```bash
cd api && python -m pytest tests/test_ct_pipeline_stages4_5.py -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add utils/control_assurance/pipeline/stage5_workbook.py \
        api/tests/test_ct_pipeline_stages4_5.py
git commit -m "feat(ct-v2): Stage 5 workbook generation, narrative writing, and issue drafting"
```

---

### Task 5: Stage 4–5 API Endpoints

**Files:**
- Modify: `api/routers/ct_v2.py`

Add the following endpoint groups to `ct_v2.py`.

- [ ] **Step 1: Add control results endpoints**

```python
# ---------------------------------------------------------------------------
# Control results — read-only
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/controls")
def list_controls(session_id: str) -> dict:
    controls = list(_get_db().ct_controls.find({"session_id": session_id}))
    for c in controls:
        c["id"] = c.pop("_id")
    return {"controls": controls}


@router.get("/sessions/{session_id}/controls/{control_id}")
def get_control(session_id: str, control_id: str) -> dict:
    ctrl = _get_db().ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not ctrl:
        raise HTTPException(status_code=404, detail="Control not found")
    ctrl["id"] = ctrl.pop("_id")
    return ctrl


@router.get("/sessions/{session_id}/controls/{control_id}/workbook")
def download_workbook(session_id: str, control_id: str):
    from fastapi.responses import StreamingResponse
    ctrl = _get_db().ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not ctrl or not ctrl.get("workbook_output_id"):
        raise HTTPException(status_code=404, detail="Workbook not yet generated")
    stream = stream_from_gridfs(ctrl["workbook_output_id"])
    filename = f"CT_{ctrl.get('control_id', control_id)}_workpaper.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 2: Add CT issues CRUD endpoints**

```python
# ---------------------------------------------------------------------------
# CT Issues (drafted from exceptions)
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/issues")
def list_ct_issues(session_id: str) -> dict:
    issues = list(_get_db().ct_issues.find({"session_id": session_id}))
    for i in issues:
        i["id"] = i.pop("_id")
    return {"issues": issues}


@router.get("/sessions/{session_id}/issues/{issue_id}")
def get_ct_issue(session_id: str, issue_id: str) -> dict:
    issue = _get_db().ct_issues.find_one({"_id": issue_id, "session_id": session_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    issue["id"] = issue.pop("_id")
    return issue


@router.patch("/sessions/{session_id}/issues/{issue_id}")
def update_ct_issue(session_id: str, issue_id: str, body: dict) -> dict:
    allowed = {"title", "summary", "detail", "root_cause", "recommendation",
               "severity", "issues_log_ref"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=422, detail="No valid fields to update")
    updates["updated_at"] = _now()
    _get_db().ct_issues.update_one({"_id": issue_id, "session_id": session_id}, {"$set": updates})
    return {"updated": True}


@router.post("/sessions/{session_id}/issues/{issue_id}/push", status_code=201)
def push_issue_to_module(session_id: str, issue_id: str) -> dict:
    """Push a CT issue draft into the main issues collection."""
    db = _get_db()
    ct_issue = db.ct_issues.find_one({"_id": issue_id, "session_id": session_id})
    if not ct_issue:
        raise HTTPException(status_code=404, detail="CT issue not found")
    if ct_issue.get("pushed_to_issues"):
        raise HTTPException(status_code=409, detail="Issue already pushed to Issues module")

    session = db.ct_sessions.find_one({"_id": session_id})
    period = session.get("testing_period", {}) if session else {}

    import uuid as _uuid
    main_issue_id = str(_uuid.uuid4())
    main_issue = {
        "_id": main_issue_id,
        "title": ct_issue["title"],
        "description": ct_issue.get("detail", ""),
        "severity": ct_issue.get("severity", "Medium"),
        "status": "Open",
        "source": "control_testing",
        "source_ref": issue_id,
        "control_name": ct_issue.get("control_name", ""),
        "testing_period_from": period.get("from", ""),
        "testing_period_to": period.get("to", ""),
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.issues.insert_one(main_issue)

    db.ct_issues.update_one(
        {"_id": issue_id},
        {"$set": {
            "pushed_to_issues": True,
            "issues_module_id": main_issue_id,
            "updated_at": _now(),
        }},
    )
    return {"issues_module_id": main_issue_id}


@router.post("/sessions/{session_id}/issues/push-all", status_code=201)
def push_all_issues_to_module(session_id: str) -> dict:
    db = _get_db()
    issue_ids = [
        issue["_id"]
        for issue in db.ct_issues.find({"session_id": session_id, "pushed_to_issues": {"$ne": True}})
    ]
    pushed = []
    for issue_id in issue_ids:
        pushed.append(push_issue_to_module(session_id, issue_id)["issues_module_id"])
    return {"pushed_count": len(pushed), "issues_module_ids": pushed}
```

- [ ] **Step 3: Add sign-off endpoint**

```python
# ---------------------------------------------------------------------------
# Sign-off
# ---------------------------------------------------------------------------

@router.patch("/sessions/{session_id}/sign-off")
def update_sign_off(session_id: str, body: dict) -> dict:
    db = _get_db()
    session = db.ct_sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    allowed_roles = {"preparer", "reviewer", "manager"}
    updates = {}
    for role, entry in body.items():
        if role not in allowed_roles:
            continue
        if not isinstance(entry, dict):
            continue
        for field in ("name", "initials", "date"):
            if field in entry:
                updates[f"sign_off.{role}.{field}"] = entry[field]

    if not updates:
        raise HTTPException(status_code=422, detail="No valid sign-off fields provided")

    updates["updated_at"] = _now()
    db.ct_sessions.update_one({"_id": session_id}, {"$set": updates})
    return {"updated": True}
```

- [ ] **Step 4: Run full test suite**

```bash
cd api && python -m pytest tests/ -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add api/routers/ct_v2.py
git commit -m "feat(ct-v2): Stages 4-5 API — control results, workbook download, issues CRUD, push-to-module, sign-off"
```

---

### Task 6: Docker Build Verification

- [ ] **Step 1: Rebuild ct_worker**

```bash
docker compose up --build -d ct_worker
docker logs ct_worker_Trace_KV --tail 40
```

Expected: `Registered tasks:` listing all 5 tasks including `ct.run_testing` and `ct.generate_workbooks`.

- [ ] **Step 2: Run full test suite**

```bash
cd api && python -m pytest tests/ -v
```

Expected: all tests PASSED.

- [ ] **Step 3: Update HANDOFF.md**

Append to `docs/HANDOFF.md`:

```markdown
## CT V2 — Sub-plan 3: Pipeline Stages 4–5 (2026-05-12)

**Status:** Complete

- `utils/control_assurance/prompts/control_testing.py` — SOX ITGC testing prompt with tickmark schema, exception escalation, 20% threshold
- `utils/control_assurance/prompts/workpaper_narrative.py` — testing summary narrative prompt
- `utils/control_assurance/prompts/issue_drafting.py` — issue drafting from grouped exceptions
- `utils/control_assurance/pipeline/stage4_testing.py` — Celery task executing per-control tests, enforcing 20% exception rate rule
- `utils/control_assurance/pipeline/stage5_workbook.py` — Celery task: narrative, issue drafting, workbook assembly
- `utils/control_assurance/workbook_builder.py` — Excel workbook with 6 standard sheets + per-type evidence tabs (image/PDF/Excel/CSV/DOCX/TXT) with annotations
- `api/routers/ct_v2.py` — new endpoints: list/get controls, workbook download, CT issues CRUD, push-to-module, sign-off
- `ct_issues` collection stores drafted issues; push endpoint mirrors to main `issues` collection
- Override log exported as separate workpaper tab per control

**Next:** Sub-plan 4 — Frontend (TanStack Query hooks, assessment list, create, detail with 5 tabs).
```

- [ ] **Step 4: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: HANDOFF updated, CT V2 Sub-plan 3 complete"
```

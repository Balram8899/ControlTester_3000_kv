# Control Testing Rewrite — Implementation Plan (SP4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ephemeral session-based control testing flow with a persistent MongoDB-backed testing module that supports per-control evidence review (Persona 4) and a domain-grouped final report.

**Architecture:** `api/routers/control_testing.py` provides a full REST router (TestingSession + TestedControl models, MongoControlTestingStore). The frontend `ControlTestingContext.tsx` and `control-testing.tsx` are fully rewritten as a 4-step wizard: Setup → Controls → Evidence → Report. The old `/audit/*` endpoints in `main.py` are **not changed** — they stay as-is for backward compatibility.

**Tech Stack:** FastAPI, Pydantic v2, pymongo, Google Gemini via `utils/llm_provider.py` `get_llm()` · React 18, TypeScript, shadcn/ui, wouter

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `api/routers/control_testing.py` | Data models, MongoControlTestingStore, all REST endpoints |
| Create | `tests/test_control_testing_api.py` | Tests for key endpoints |
| Modify | `api/main.py` | Import + register new router |
| Modify | `kpmg_ui/client/src/contexts/ControlTestingContext.tsx` | Full rewrite — new types and API calls |
| Modify | `kpmg_ui/client/src/pages/control-testing.tsx` | Full rewrite — persistent session wizard |

---

## Task 1: Data models + MongoControlTestingStore

**Files:**
- Create: `api/routers/control_testing.py`
- Create: `tests/test_control_testing_api.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_control_testing_api.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

with patch("pymongo.MongoClient") as _mc:
    _mc.return_value.__getitem__.return_value.__getitem__.return_value = MagicMock()
    from api.main import app

client = TestClient(app)


def _make_session(id="s1", title="Test Session"):
    from api.routers.control_testing import TestingSession
    return TestingSession(
        id=id, title=title, description="",
        status="draft", controls=[], report_markdown=None,
        created_at="2026-01-01", updated_at="2026-01-01",
    )


def test_create_session_201():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.create.return_value = _make_session()
        r = client.post("/control-testing", json={"title": "Test Session", "description": ""})
    assert r.status_code == 201
    assert r.json()["title"] == "Test Session"


def test_list_sessions_200():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.list.return_value = [_make_session()]
        r = client.get("/control-testing")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_session_404():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.get("/control-testing/missing")
    assert r.status_code == 404


def test_delete_session_404():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.delete("/control-testing/missing")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd "C:\Subho syste,\ControlTester_3000_kv"
python -m pytest tests/test_control_testing_api.py -v
```

Expected: 404 for `/control-testing` routes — router not registered yet.

- [ ] **Step 3: Create `api/routers/control_testing.py`** — models and store only (no route handlers yet)

```python
# api/routers/control_testing.py
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/control-testing", tags=["control-testing"])

TestResultType = Literal["pass", "fail", "partial", "not_tested"]


class EvidenceReview(BaseModel):
    conclusion: str = ""
    explanation: str = ""
    confidence: str = ""
    gaps: str = ""


class TestedControl(BaseModel):
    id: str
    control_id: str
    control_name: str
    domain: str = ""
    test_result: TestResultType = "not_tested"
    evidence_text: str = ""
    evidence_review: EvidenceReview = EvidenceReview()
    tester_notes: str = ""


class TestingSession(BaseModel):
    id: str
    title: str
    description: str = ""
    status: Literal["draft", "in_progress", "complete"] = "draft"
    controls: list[TestedControl] = []
    report_markdown: Optional[str] = None
    created_at: str
    updated_at: str


class SessionCreate(BaseModel):
    title: str
    description: str = ""


class AddControlsBody(BaseModel):
    controls: list[dict]  # [{control_id, control_name, domain}]


class UpdateControlBody(BaseModel):
    test_result: Optional[TestResultType] = None
    tester_notes: Optional[str] = None
    evidence_text: Optional[str] = None


class ReviewEvidenceBody(BaseModel):
    evidence_text: str
    claim: str = ""


# ── MongoDB store ─────────────────────────────────────────────────────────────

class MongoControlTestingStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        client = pymongo.MongoClient(uri)
        db = client["trace_db"]
        self._col = db["control_testing_sessions"]
        self._col.create_index("status")
        self._col.create_index("created_at")

    def _to_session(self, doc: dict) -> TestingSession:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        doc.setdefault("controls", [])
        doc.setdefault("report_markdown", None)
        doc.setdefault("description", "")
        # Reconstruct nested models
        controls = []
        for c in doc["controls"]:
            er = c.get("evidence_review", {})
            if isinstance(er, dict):
                c["evidence_review"] = EvidenceReview(**er)
            controls.append(TestedControl(**c))
        doc["controls"] = controls
        return TestingSession(**doc)

    def create(self, data: SessionCreate) -> TestingSession:
        now = datetime.utcnow().isoformat()
        doc: dict[str, Any] = {
            "_id": str(uuid.uuid4()),
            "title": data.title,
            "description": data.description,
            "status": "draft",
            "controls": [],
            "report_markdown": None,
            "created_at": now,
            "updated_at": now,
        }
        self._col.insert_one(doc)
        return self._to_session(dict(doc))

    def list(self) -> list[TestingSession]:
        return [self._to_session(d) for d in self._col.find({}).sort("created_at", -1)]

    def get(self, session_id: str) -> TestingSession | None:
        doc = self._col.find_one({"_id": session_id})
        return self._to_session(doc) if doc else None

    def delete(self, session_id: str) -> bool:
        result = self._col.delete_one({"_id": session_id})
        return result.deleted_count == 1

    def add_controls(self, session_id: str, controls: list[dict]) -> bool:
        result = self._col.update_one(
            {"_id": session_id},
            {"$push": {"controls": {"$each": controls}},
             "$set": {"status": "in_progress", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def update_control(self, session_id: str, control_id: str, fields: dict) -> bool:
        set_fields = {f"controls.$.{k}": v for k, v in fields.items()}
        set_fields["updated_at"] = datetime.utcnow().isoformat()
        result = self._col.update_one(
            {"_id": session_id, "controls.id": control_id},
            {"$set": set_fields},
        )
        return result.modified_count == 1

    def set_report(self, session_id: str, markdown: str) -> bool:
        result = self._col.update_one(
            {"_id": session_id},
            {"$set": {"report_markdown": markdown, "status": "complete",
                      "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1


_store: MongoControlTestingStore | None = None


def get_store() -> MongoControlTestingStore:
    global _store
    if _store is None:
        _store = MongoControlTestingStore()
    return _store
```

- [ ] **Step 4: Commit models + store (no routes yet)**

```bash
git add api/routers/control_testing.py tests/test_control_testing_api.py
git commit -m "feat: add TestingSession models and MongoControlTestingStore (SP4 T1)"
```

---

## Task 2: CRUD endpoints + register router

**Files:**
- Modify: `api/routers/control_testing.py` — append route handlers
- Modify: `api/main.py` — register router
- Modify: `tests/test_control_testing_api.py` — tests already pass

- [ ] **Step 1: Run existing tests to confirm they still fail (routes not registered)**

```
python -m pytest tests/test_control_testing_api.py -v
```

Expected: 404 for `/control-testing` — router not in main.py yet.

- [ ] **Step 2: Register router in `api/main.py`**

Find the block where other routers are imported and registered. Add:

```python
from api.routers.control_testing import router as control_testing_router
```

and:

```python
app.include_router(control_testing_router)
```

Place both alongside the existing `assets_router`, `risk_assessment_router`, etc. imports/registrations.

- [ ] **Step 3: Append CRUD route handlers to `api/routers/control_testing.py`**

Append after the `get_store` function:

```python
# ── Route handlers ────────────────────────────────────────────────────────────

@router.get("/library-controls")
def list_library_controls():
    """Return all controls from the controls library for session setup."""
    from utils.controls_library import MongoControlsStore
    try:
        store = MongoControlsStore()
        all_ctrls = store.all_controls()
        return [
            {
                "control_id": c.get("control_id", ""),
                "control_name": c.get("control_name", c.get("name", "")),
                "domain": c.get("domain", "General"),
            }
            for c in all_ctrls
            if c.get("control_id")
        ]
    except Exception as e:
        logger.error(f"Failed to fetch library controls: {e}")
        return []


@router.post("", status_code=201, response_model=TestingSession)
def create_session(body: SessionCreate):
    return get_store().create(body)


@router.get("", response_model=list[TestingSession])
def list_sessions():
    return get_store().list()


@router.get("/{session_id}", response_model=TestingSession)
def get_session(session_id: str):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: str):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    get_store().delete(session_id)


@router.post("/{session_id}/controls", status_code=201)
def add_controls(session_id: str, body: AddControlsBody):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    controls_to_add = [
        {
            "id": str(uuid.uuid4()),
            "control_id": c.get("control_id", ""),
            "control_name": c.get("control_name", ""),
            "domain": c.get("domain", "General"),
            "test_result": "not_tested",
            "evidence_text": "",
            "evidence_review": {"conclusion": "", "explanation": "", "confidence": "", "gaps": ""},
            "tester_notes": "",
        }
        for c in body.controls
    ]
    get_store().add_controls(session_id, controls_to_add)
    return {"ok": True, "added": len(controls_to_add)}


@router.patch("/{session_id}/controls/{control_id}")
def update_control(session_id: str, control_id: str, body: UpdateControlBody):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    fields: dict = {}
    if body.test_result is not None:
        fields["test_result"] = body.test_result
    if body.tester_notes is not None:
        fields["tester_notes"] = body.tester_notes
    if body.evidence_text is not None:
        fields["evidence_text"] = body.evidence_text
    if not fields:
        raise HTTPException(400, "No fields to update")
    get_store().update_control(session_id, control_id, fields)
    return {"ok": True}
```

- [ ] **Step 4: Run tests**

```
python -m pytest tests/test_control_testing_api.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full suite**

```
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/control_testing.py api/main.py tests/test_control_testing_api.py
git commit -m "feat: add control-testing CRUD endpoints, register router (SP4 T2)"
```

---

## Task 3: Evidence review endpoint (Persona 4)

**Files:**
- Modify: `api/routers/control_testing.py` — append evidence review route
- Modify: `tests/test_control_testing_api.py` — append evidence review tests

- [ ] **Step 1: Append tests to `tests/test_control_testing_api.py`**

```python
def test_review_evidence_404_unknown_session():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post(
            "/control-testing/missing/controls/c1/review-evidence",
            json={"evidence_text": "Some text", "claim": "MFA is enforced"},
        )
    assert r.status_code == 404


def test_review_evidence_404_unknown_control():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = _make_session()
        r = client.post(
            "/control-testing/s1/controls/no_such_control/review-evidence",
            json={"evidence_text": "Some text", "claim": "MFA is enforced"},
        )
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_control_testing_api.py::test_review_evidence_404_unknown_session tests/test_control_testing_api.py::test_review_evidence_404_unknown_control -v
```

Expected: 404 — route not yet defined.

- [ ] **Step 3: Append evidence review route to `api/routers/control_testing.py`**

Append after `update_control`:

```python
@router.post("/{session_id}/controls/{control_id}/review-evidence")
def review_evidence(session_id: str, control_id: str, body: ReviewEvidenceBody):
    """Persona 4: Evidence Reviewer — assess evidence against a control claim."""
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm

    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")

    ctrl = next((c for c in s.controls if c.id == control_id), None)
    if not ctrl:
        raise HTTPException(404, "Control not found in session")

    claim = body.claim or f"The control '{ctrl.control_name}' is operating effectively"
    evidence_text = body.evidence_text or ctrl.evidence_text

    prompt = f"""You are an evidence reviewer for audit, risk, and security assessments.

Your task is to review uploaded evidence in the specific context provided.
You must evaluate whether the evidence:
- supports the claim
- partially supports the claim
- contradicts the claim
- is insufficient or irrelevant

Always apply the review from the perspective of the current module and objective.
Do not assess evidence generically.
If the same file would mean different things in different contexts, use only the context provided for this task.

Context:
- Control: {ctrl.control_name}
- Domain: {ctrl.domain}
- Claim under review: {claim}

Evidence provided:
{evidence_text}

Return a JSON object with exactly these fields:
{{
  "conclusion": "supports" | "partially supports" | "contradicts" | "insufficient/irrelevant",
  "explanation": "short explanation (2-3 sentences)",
  "confidence": "high" | "medium" | "low",
  "gaps": "description of any material gaps or contradictions, or 'None identified'"
}}

Return ONLY the JSON object, no markdown."""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        import re as _re
        import json as _json
        content = _re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = _re.sub(r"\n?```$", "", content).strip()
        review_data = _json.loads(content)
    except Exception as e:
        logger.error(f"Evidence review LLM failed for {session_id}/{control_id}: {e}")
        review_data = {
            "conclusion": "insufficient/irrelevant",
            "explanation": f"Evidence review failed: {e}",
            "confidence": "low",
            "gaps": "LLM unavailable — manual review required.",
        }

    review_fields = {
        "evidence_review.conclusion": review_data.get("conclusion", ""),
        "evidence_review.explanation": review_data.get("explanation", ""),
        "evidence_review.confidence": review_data.get("confidence", ""),
        "evidence_review.gaps": review_data.get("gaps", ""),
    }
    if body.evidence_text:
        review_fields["evidence_text"] = body.evidence_text

    get_store().update_control(session_id, control_id, review_fields)
    return {"ok": True, "review": review_data}
```

Note: `update_control` uses `controls.$.{k}` pattern, so nested keys like `evidence_review.conclusion` will resolve correctly in MongoDB's positional operator.

- [ ] **Step 4: Run all tests**

```
python -m pytest tests/test_control_testing_api.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full suite**

```
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/control_testing.py tests/test_control_testing_api.py
git commit -m "feat: add evidence review endpoint — Persona 4 (SP4 T3)"
```

---

## Task 4: Final report endpoint

**Files:**
- Modify: `api/routers/control_testing.py` — append generate-report + get-report routes
- Modify: `tests/test_control_testing_api.py` — append report tests

- [ ] **Step 1: Append tests to `tests/test_control_testing_api.py`**

```python
def test_generate_report_404_unknown_session():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post("/control-testing/missing/generate-report")
    assert r.status_code == 404


def test_generate_report_400_no_controls():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = _make_session()
        r = client.post("/control-testing/s1/generate-report")
    assert r.status_code == 400


def test_get_report_404_no_report():
    with patch("api.routers.control_testing.get_store") as gs:
        gs.return_value.get.return_value = _make_session()
        r = client.get("/control-testing/s1/report")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_control_testing_api.py::test_generate_report_404_unknown_session tests/test_control_testing_api.py::test_generate_report_400_no_controls tests/test_control_testing_api.py::test_get_report_404_no_report -v
```

Expected: routes not yet defined → 404/405.

- [ ] **Step 3: Append report endpoints to `api/routers/control_testing.py`**

Append after `review_evidence`:

```python
@router.post("/{session_id}/generate-report")
def generate_report(session_id: str):
    """Control Testing Report Writer — domain-grouped final report."""
    from langchain.schema import HumanMessage
    from utils.llm_provider import get_llm
    import json as _json

    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    if not s.controls:
        raise HTTPException(400, "No controls in session. Add controls first.")

    # Group controls by domain
    by_domain: dict[str, list[TestedControl]] = {}
    for c in s.controls:
        by_domain.setdefault(c.domain or "General", []).append(c)

    domain_text = ""
    for domain, ctrls in by_domain.items():
        domain_text += f"\n### Domain: {domain}\n"
        for c in ctrls:
            result_label = c.test_result.replace("_", " ").title()
            review_summary = c.evidence_review.conclusion or "No evidence review performed"
            domain_text += (
                f"- **{c.control_name}** [{result_label}]\n"
                f"  Evidence review: {review_summary}. "
                f"Confidence: {c.evidence_review.confidence or 'N/A'}. "
                f"Gaps: {c.evidence_review.gaps or 'None identified'}.\n"
                f"  Tester notes: {c.tester_notes or 'None.'}\n"
            )

    pass_count = sum(1 for c in s.controls if c.test_result == "pass")
    fail_count = sum(1 for c in s.controls if c.test_result == "fail")
    partial_count = sum(1 for c in s.controls if c.test_result == "partial")
    not_tested = sum(1 for c in s.controls if c.test_result == "not_tested")

    prompt = f"""You are a control testing report writer for audit and information security audiences.

Produce a professional Control Testing Report using only the provided data.
Follow the required report structure exactly. Do not add extra sections.
Group findings by control domain. Keep language professional and suitable for audit personnel.
Do not invent conclusions not supported by the test data.

Session: {s.title}
Description: {s.description}
Total controls: {len(s.controls)}
Pass: {pass_count} | Fail: {fail_count} | Partial: {partial_count} | Not Tested: {not_tested}

Control findings by domain:
{domain_text}

Required report structure (produce each section as a markdown heading):
1. Report Header
2. Executive Summary
3. Scope and Controls Tested
4. Domain-by-Domain Findings
5. Evidence Quality Summary
6. Issues and Gaps
7. Overall Conclusion

Return the full report as markdown only."""

    try:
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        report_md = response.content.strip()
    except Exception as e:
        logger.error(f"Report generation failed for {session_id}: {e}")
        report_md = f"# Control Testing Report\n\n**Report generation failed:** {e}\n\nPlease retry."

    get_store().set_report(session_id, report_md)
    return {"session_id": session_id, "report_markdown": report_md}


@router.get("/{session_id}/report")
def get_report(session_id: str):
    s = get_store().get(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    if not s.report_markdown:
        raise HTTPException(404, "No report generated yet.")
    return {"session_id": session_id, "report_markdown": s.report_markdown}
```

- [ ] **Step 4: Run all control testing tests**

```
python -m pytest tests/test_control_testing_api.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Run full suite**

```
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/control_testing.py tests/test_control_testing_api.py
git commit -m "feat: add generate-report endpoint — Control Testing Report Writer (SP4 T4)"
```

---

## Task 5: Rewrite `ControlTestingContext.tsx`

**Files:**
- Modify: `kpmg_ui/client/src/contexts/ControlTestingContext.tsx`

- [ ] **Step 1: Replace the entire file with the new context**

```typescript
// kpmg_ui/client/src/contexts/ControlTestingContext.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ── Domain types ──────────────────────────────────────────────────────────────

export type TestResultType = "pass" | "fail" | "partial" | "not_tested";
export type SessionStatus = "draft" | "in_progress" | "complete";

export interface EvidenceReview {
  conclusion: string;
  explanation: string;
  confidence: string;
  gaps: string;
}

export interface TestedControl {
  id: string;
  control_id: string;
  control_name: string;
  domain: string;
  test_result: TestResultType;
  evidence_text: string;
  evidence_review: EvidenceReview;
  tester_notes: string;
}

export interface TestingSession {
  id: string;
  title: string;
  description: string;
  status: SessionStatus;
  controls: TestedControl[];
  report_markdown: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryControl {
  control_id: string;
  control_name: string;
  domain: string;
}

// ── Context interface ─────────────────────────────────────────────────────────

interface Ctx {
  sessions: TestingSession[];
  selectedSession: TestingSession | null;
  libraryControls: LibraryControl[];
  isLoading: boolean;
  isReviewing: boolean;
  isGeneratingReport: boolean;
  error: string | null;
  report: string | null;
  fetchSessions: () => Promise<void>;
  selectSession: (s: TestingSession | null) => void;
  createSession: (title: string, description: string) => Promise<TestingSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  fetchLibraryControls: () => Promise<void>;
  addControls: (sessionId: string, controls: LibraryControl[]) => Promise<void>;
  updateControl: (
    sessionId: string,
    controlId: string,
    update: { test_result?: TestResultType; tester_notes?: string; evidence_text?: string },
  ) => Promise<void>;
  reviewEvidence: (sessionId: string, controlId: string, evidenceText: string, claim: string) => Promise<EvidenceReview>;
  generateReport: (sessionId: string) => Promise<void>;
}

const ControlTestingContext = createContext<Ctx | null>(null);

export function ControlTestingProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TestingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<TestingSession | null>(null);
  const [libraryControls, setLibraryControls] = useState<LibraryControl[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/control-testing");
      if (!r.ok) throw new Error("Failed to fetch sessions");
      setSessions(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectSession = useCallback((s: TestingSession | null) => {
    setSelectedSession(s);
    setReport(s?.report_markdown ?? null);
  }, []);

  const createSession = useCallback(async (title: string, description: string): Promise<TestingSession> => {
    const r = await fetch("/api/control-testing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    if (!r.ok) throw new Error("Failed to create session");
    const s: TestingSession = await r.json();
    setSessions(prev => [s, ...prev]);
    return s;
  }, []);

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    const r = await fetch(`/api/control-testing/${sessionId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) throw new Error("Failed to delete session");
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setSelectedSession(prev => prev?.id === sessionId ? null : prev);
  }, []);

  const fetchLibraryControls = useCallback(async () => {
    try {
      const r = await fetch("/api/control-testing/library-controls");
      if (!r.ok) throw new Error("Failed to fetch library controls");
      setLibraryControls(await r.json());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const addControls = useCallback(async (sessionId: string, controls: LibraryControl[]): Promise<void> => {
    const r = await fetch(`/api/control-testing/${sessionId}/controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controls }),
    });
    if (!r.ok) throw new Error("Failed to add controls");
    const updated = await fetch(`/api/control-testing/${sessionId}`);
    if (updated.ok) {
      const s: TestingSession = await updated.json();
      setSelectedSession(s);
      setSessions(prev => prev.map(x => x.id === sessionId ? s : x));
    }
  }, []);

  const updateControl = useCallback(async (
    sessionId: string,
    controlId: string,
    update: { test_result?: TestResultType; tester_notes?: string; evidence_text?: string },
  ): Promise<void> => {
    const r = await fetch(`/api/control-testing/${sessionId}/controls/${controlId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!r.ok) throw new Error("Failed to update control");
    const updated = await fetch(`/api/control-testing/${sessionId}`);
    if (updated.ok) {
      const s: TestingSession = await updated.json();
      setSelectedSession(s);
      setSessions(prev => prev.map(x => x.id === sessionId ? s : x));
    }
  }, []);

  const reviewEvidence = useCallback(async (
    sessionId: string,
    controlId: string,
    evidenceText: string,
    claim: string,
  ): Promise<EvidenceReview> => {
    setIsReviewing(true);
    try {
      const r = await fetch(`/api/control-testing/${sessionId}/controls/${controlId}/review-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_text: evidenceText, claim }),
      });
      if (!r.ok) throw new Error("Evidence review failed");
      const data = await r.json();
      const updated = await fetch(`/api/control-testing/${sessionId}`);
      if (updated.ok) {
        const s: TestingSession = await updated.json();
        setSelectedSession(s);
        setSessions(prev => prev.map(x => x.id === sessionId ? s : x));
      }
      return data.review as EvidenceReview;
    } finally {
      setIsReviewing(false);
    }
  }, []);

  const generateReport = useCallback(async (sessionId: string): Promise<void> => {
    setIsGeneratingReport(true);
    try {
      const r = await fetch(`/api/control-testing/${sessionId}/generate-report`, { method: "POST" });
      if (!r.ok) throw new Error("Report generation failed");
      const data = await r.json();
      setReport(data.report_markdown ?? null);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, status: "complete", report_markdown: data.report_markdown } : s
      ));
      setSelectedSession(prev =>
        prev?.id === sessionId ? { ...prev, status: "complete", report_markdown: data.report_markdown } : prev
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  }, []);

  return (
    <ControlTestingContext.Provider value={{
      sessions, selectedSession, libraryControls,
      isLoading, isReviewing, isGeneratingReport, error, report,
      fetchSessions, selectSession, createSession, deleteSession,
      fetchLibraryControls, addControls, updateControl,
      reviewEvidence, generateReport,
    }}>
      {children}
    </ControlTestingContext.Provider>
  );
}

export function useControlTesting() {
  const ctx = useContext(ControlTestingContext);
  if (!ctx) throw new Error("useControlTesting must be used inside ControlTestingProvider");
  return ctx;
}
```

- [ ] **Step 2: Check that App.tsx still uses ControlTestingProvider and update import if needed**

Find `App.tsx` (likely at `kpmg_ui/client/src/App.tsx`). Verify `ControlTestingProvider` is still imported and wrapping the app. If the old file exported `ControlTestingProvider`, the new file also exports it — no App.tsx changes needed.

- [ ] **Step 3: Run TypeScript check**

```
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui"
npm run check
```

Expected: 0 type errors (there will be errors in `control-testing.tsx` which still imports old types — that's fine, fix it in Task 6).

- [ ] **Step 4: Commit**

```bash
git add kpmg_ui/client/src/contexts/ControlTestingContext.tsx
git commit -m "feat: rewrite ControlTestingContext — persistent sessions, Persona 4, report (SP4 T5)"
```

---

## Task 6: Rewrite `control-testing.tsx`

**Files:**
- Modify: `kpmg_ui/client/src/pages/control-testing.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
// kpmg_ui/client/src/pages/control-testing.tsx
import { useEffect, useState } from "react";
import {
  CheckCircle2, ChevronRight, ClipboardList, FileBarChart,
  Loader2, Plus, Shield, Sparkles, Trash2, X,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useControlTesting,
  TestResultType,
  TestedControl,
  LibraryControl,
} from "@/contexts/ControlTestingContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIZARD_STEPS = ["Setup", "Controls", "Evidence", "Report"];

const RESULT_COLOR: Record<TestResultType, string> = {
  pass: "bg-emerald-100 text-emerald-700 border-emerald-300",
  fail: "bg-red-100 text-red-700 border-red-300",
  partial: "bg-amber-100 text-amber-700 border-amber-300",
  not_tested: "bg-slate-100 text-slate-500 border-slate-300",
};

const RESULT_LABEL: Record<TestResultType, string> = {
  pass: "Pass",
  fail: "Fail",
  partial: "Partial",
  not_tested: "Not Tested",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-300",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ControlTestingPage() {
  const {
    sessions, selectedSession, libraryControls,
    isLoading, isReviewing, isGeneratingReport, error, report,
    fetchSessions, selectSession, createSession, deleteSession,
    fetchLibraryControls, addControls, updateControl,
    reviewEvidence, generateReport,
  } = useControlTesting();
  const { toast } = useToast();

  const [wizardStep, setWizardStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Control selection state (Step 0)
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [controlSearch, setControlSearch] = useState("");

  // Evidence step state (Step 2)
  const [activeControlId, setActiveControlId] = useState<string | null>(null);
  const [evidenceInput, setEvidenceInput] = useState("");
  const [claimInput, setClaimInput] = useState("");

  useEffect(() => { fetchSessions(); fetchLibraryControls(); }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const total = sessions.length;
  const complete = sessions.filter(s => s.status === "complete").length;
  const allControls = sessions.flatMap(s => s.controls);
  const failCount = allControls.filter(c => c.test_result === "fail").length;

  // ── Helpers ───────────────────────────────────────────────────────────────

  const filteredLibrary = libraryControls.filter(c =>
    controlSearch === "" ||
    c.control_name.toLowerCase().includes(controlSearch.toLowerCase()) ||
    c.domain.toLowerCase().includes(controlSearch.toLowerCase())
  );

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    try {
      const s = await createSession(newTitle.trim(), newDesc.trim());
      selectSession(s);
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setWizardStep(0);
      toast({ title: "Session created" });
    } catch {
      toast({ title: "Failed to create session", variant: "destructive" });
    }
  }

  async function handleAddControls() {
    if (!selectedSession || selectedLibraryIds.size === 0) return;
    const toAdd: LibraryControl[] = libraryControls.filter(c => selectedLibraryIds.has(c.control_id));
    try {
      await addControls(selectedSession.id, toAdd);
      setSelectedLibraryIds(new Set());
      setWizardStep(1);
      toast({ title: `${toAdd.length} control(s) added` });
    } catch {
      toast({ title: "Failed to add controls", variant: "destructive" });
    }
  }

  async function handleResult(ctrl: TestedControl, result: TestResultType) {
    if (!selectedSession) return;
    try {
      await updateControl(selectedSession.id, ctrl.id, { test_result: result });
    } catch {
      toast({ title: "Failed to update result", variant: "destructive" });
    }
  }

  async function handleNotes(ctrl: TestedControl, notes: string) {
    if (!selectedSession) return;
    await updateControl(selectedSession.id, ctrl.id, { tester_notes: notes });
  }

  async function handleReviewEvidence() {
    if (!selectedSession || !activeControlId) return;
    if (!evidenceInput.trim()) {
      toast({ title: "Paste evidence text first", variant: "destructive" });
      return;
    }
    try {
      const review = await reviewEvidence(selectedSession.id, activeControlId, evidenceInput, claimInput);
      toast({ title: `Evidence review: ${review.conclusion}` });
      setEvidenceInput("");
      setClaimInput("");
    } catch {
      toast({ title: "Evidence review failed", variant: "destructive" });
    }
  }

  async function handleGenerateReport() {
    if (!selectedSession) return;
    try {
      await generateReport(selectedSession.id);
      toast({ title: "Report generated" });
    } catch {
      toast({ title: "Report generation failed", variant: "destructive" });
    }
  }

  const activeControl = selectedSession?.controls.find(c => c.id === activeControlId) ?? null;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <HeroSection
        title="Control Testing"
        subtitle="Test controls against evidence — evidence review, findings, and final audit report"
        icon={Shield}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel: session list ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <Button className="w-full" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Session
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin w-5 h-5 text-slate-400" /></div>
            ) : sessions.map(s => (
              <button
                key={s.id}
                onClick={() => { selectSession(s); setWizardStep(s.status === "complete" ? 3 : s.controls.length > 0 ? 1 : 0); }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedSession?.id === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
              >
                <p className="font-medium text-sm text-slate-800 truncate">{s.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[s.status]}`}>
                    {s.status.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-slate-400">{s.controls.length} ctrl{s.controls.length !== 1 ? "s" : ""}</span>
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-auto p-6">
          {/* Create form */}
          {showCreate && (
            <Card className="max-w-lg mx-auto mb-6">
              <CardHeader><CardTitle>New Testing Session</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Session title *" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <Textarea placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button onClick={handleCreate}>Create</Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dashboard */}
          {!selectedSession && !showCreate && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-blue-600">{total}</p><p className="text-sm text-slate-500">Total Sessions</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-emerald-600">{complete}</p><p className="text-sm text-slate-500">Complete</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-red-500">{failCount}</p><p className="text-sm text-slate-500">Failed Controls</p></CardContent></Card>
              </div>
              <p className="text-slate-400 text-sm">Select a session from the left or create a new one.</p>
            </div>
          )}

          {/* Wizard */}
          {selectedSession && (
            <div className="max-w-3xl">
              {/* Stepper */}
              <div className="flex items-center gap-2 mb-6">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${i < wizardStep ? "bg-emerald-500 border-emerald-500 text-white" : i === wizardStep ? "bg-blue-500 border-blue-500 text-white" : "bg-white border-slate-300 text-slate-400"}`}>
                      {i < wizardStep ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === wizardStep ? "text-blue-600" : "text-slate-400"}`}>{label}</span>
                    {i < WIZARD_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 ml-1" />}
                  </div>
                ))}
              </div>

              {/* Step 0: Setup — select controls from library */}
              {wizardStep === 0 && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{selectedSession.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-slate-500">{selectedSession.description || "No description."}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">Select controls from library</p>
                        <span className="text-xs text-slate-400">{selectedLibraryIds.size} selected</span>
                      </div>
                      <Input
                        placeholder="Search by name or domain…"
                        value={controlSearch}
                        onChange={e => setControlSearch(e.target.value)}
                        className="text-sm"
                      />
                      <div className="max-h-64 overflow-y-auto border rounded divide-y">
                        {filteredLibrary.length === 0 && (
                          <p className="text-xs text-slate-400 p-3">No controls in library yet. Upload controls via the Controls Library module.</p>
                        )}
                        {filteredLibrary.map(c => (
                          <label key={c.control_id} className="flex items-start gap-2 p-2 hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={selectedLibraryIds.has(c.control_id)}
                              onChange={e => {
                                setSelectedLibraryIds(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(c.control_id);
                                  else next.delete(c.control_id);
                                  return next;
                                });
                              }}
                            />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{c.control_name}</p>
                              <p className="text-xs text-slate-500">{c.domain}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button onClick={handleAddControls} disabled={selectedLibraryIds.size === 0}>
                        Add Selected Controls <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                  {selectedSession.controls.length > 0 && (
                    <Button variant="outline" onClick={() => setWizardStep(1)}>
                      Skip — view existing controls ({selectedSession.controls.length})
                    </Button>
                  )}
                </div>
              )}

              {/* Step 1: Controls — mark test results */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Controls ({selectedSession.controls.length})</h3>
                    <Button size="sm" onClick={() => setWizardStep(2)}>
                      Evidence Review <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  {selectedSession.controls.length === 0 && (
                    <p className="text-slate-400 text-sm">No controls added. Go back to Setup.</p>
                  )}
                  {selectedSession.controls.map(ctrl => (
                    <Card key={ctrl.id}>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm text-slate-800">{ctrl.control_name}</p>
                            <p className="text-xs text-slate-500">{ctrl.domain}</p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${RESULT_COLOR[ctrl.test_result]}`}>
                            {RESULT_LABEL[ctrl.test_result]}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          {(["pass", "fail", "partial", "not_tested"] as TestResultType[]).map(r => (
                            <button
                              key={r}
                              onClick={() => handleResult(ctrl, r)}
                              className={`px-2 py-0.5 rounded border text-xs transition-colors ${ctrl.test_result === r ? RESULT_COLOR[r] : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"}`}
                            >
                              {RESULT_LABEL[r]}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="Tester notes…"
                          defaultValue={ctrl.tester_notes}
                          onBlur={e => handleNotes(ctrl, e.target.value)}
                          rows={1}
                          className="text-xs"
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Step 2: Evidence Review */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Evidence Review</h3>
                    <Button size="sm" onClick={() => setWizardStep(3)}>
                      Generate Report <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                    {selectedSession.controls.map(ctrl => {
                      const reviewed = !!ctrl.evidence_review.conclusion;
                      return (
                        <button
                          key={ctrl.id}
                          onClick={() => setActiveControlId(ctrl.id)}
                          className={`text-left p-3 rounded border text-sm transition-colors ${activeControlId === ctrl.id ? "bg-blue-50 border-blue-400" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                        >
                          <p className="font-medium text-slate-800 truncate">{ctrl.control_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-xs ${RESULT_COLOR[ctrl.test_result]}`}>
                              {RESULT_LABEL[ctrl.test_result]}
                            </Badge>
                            {reviewed && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {activeControl && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">{activeControl.control_name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {activeControl.evidence_review.conclusion && (
                          <div className="p-3 bg-slate-50 rounded border text-xs space-y-1">
                            <p><strong>Conclusion:</strong> {activeControl.evidence_review.conclusion}</p>
                            <p><strong>Explanation:</strong> {activeControl.evidence_review.explanation}</p>
                            <p><strong>Confidence:</strong> {activeControl.evidence_review.confidence}</p>
                            <p><strong>Gaps:</strong> {activeControl.evidence_review.gaps}</p>
                          </div>
                        )}
                        <Input
                          placeholder="Claim under review (optional — defaults to control name)"
                          value={claimInput}
                          onChange={e => setClaimInput(e.target.value)}
                          className="text-sm"
                        />
                        <Textarea
                          placeholder="Paste evidence text here…"
                          value={evidenceInput}
                          onChange={e => setEvidenceInput(e.target.value)}
                          rows={5}
                          className="text-sm font-mono"
                        />
                        <Button onClick={handleReviewEvidence} disabled={isReviewing}>
                          {isReviewing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reviewing…</> : <><Sparkles className="w-4 h-4 mr-1" />Review Evidence</>}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  {!activeControl && (
                    <p className="text-slate-400 text-sm">Select a control above to review its evidence.</p>
                  )}
                </div>
              )}

              {/* Step 3: Report */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Final Report</h3>
                    <Button
                      size="sm"
                      onClick={handleGenerateReport}
                      disabled={isGeneratingReport}
                    >
                      {isGeneratingReport
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Generating…</>
                        : <><FileBarChart className="w-4 h-4 mr-1" />Generate Report</>}
                    </Button>
                  </div>
                  {report ? (
                    <Card>
                      <CardContent className="pt-4">
                        <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono leading-relaxed">{report}</pre>
                      </CardContent>
                    </Card>
                  ) : (
                    <p className="text-slate-400 text-sm">
                      Click "Generate Report" to produce the domain-grouped Control Testing Report.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui"
npm run check
```

Expected: 0 type errors. If there are errors in `control-testing.tsx`, fix them (likely unused imports — remove unused ones from the import list).

- [ ] **Step 3: Run full Python test suite**

```
cd "C:\Subho syste,\ControlTester_3000_kv"
python -m pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add kpmg_ui/client/src/pages/control-testing.tsx
git commit -m "feat: rewrite control-testing page — persistent sessions, 4-step wizard (SP4 T6)"
```

---

## Self-Review

**Spec coverage:**
- §8.1 Final report belongs to Control Testing ✅ (`generate-report` endpoint + Step 3 wizard)
- §8.2 Report from selected tested controls/sessions ✅ (session contains all tested controls)
- §8.3 Testing-centric, grouped by control/domain ✅ (report groups by domain in prompt)
- §8.4 Regulations + control-quality as background context ✅ (not injected directly — deferred, not dominant per spec)
- §8.5 Draft/on-demand report, no approval-state ✅ (POST endpoint, no workflow gate)
- §10.5 Final report from selected controls ✅; testing-centric ✅; grouped by domain ✅

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" references. All steps have full code.

**Type consistency:**
- `TestedControl.id` (str) is used as `control_id` in route params — ✅ consistent
- `EvidenceReview` Pydantic model nested in `TestedControl` ✅
- `update_control` uses MongoDB positional `controls.$.{key}` — works for top-level fields. For nested `evidence_review.*` fields, the dot-notation keys are passed directly as MongoDB update paths ✅
- Frontend `TestedControl` matches backend model shape ✅
- `LibraryControl` interface matches `/library-controls` response shape ✅

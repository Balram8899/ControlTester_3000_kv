# Risk Assessment Rewrite — Implementation Plan (SP3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BIA/LEGAL/PIA 3-type questionnaire model with an 8-section application-focused question bank, hybrid rule+LLM scoring via Gemini, and a rewritten frontend wizard.

**Architecture:** `utils/assessment_questions.py` holds the new 8-section bank (40 questions, typed as Exposure/Control/Context). The backend `api/routers/risk_assessment.py` drops the old `AssessmentType` literal and adds a `/sections` endpoint; `analyze_assessment` uses Gemini (not Ollama) with a hybrid rule-layer pre-score. The frontend context and page are fully rewritten to drive the new model.

**Tech Stack:** FastAPI, Pydantic v2, pymongo, Google Gemini (`langchain_google_genai.ChatGoogleGenerativeAI`) · React 18, TypeScript, shadcn/ui, wouter

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `utils/assessment_questions.py` | Full rewrite — 8-section bank, `get_sections()`, remove BIA/LEGAL/PIA |
| Create | `tests/test_assessment_questions.py` | Tests for section structure and question types |
| Modify | `api/routers/risk_assessment.py` | Drop BIA/LEGAL/PIA, new `ResponseSubmit` with `section_id`, add `GET /sections`, switch `analyze_assessment` to Gemini + rule-layer |
| Create | `tests/test_risk_assessment_api.py` | Tests for new endpoints and response model |
| Modify | `kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx` | New types (Section, Question, SectionResponse), drop AssessmentType, new `fetchSections()` |
| Modify | `kpmg_ui/client/src/pages/risk-assessment.tsx` | Replace BIA/LEGAL/PIA Q&A tabs with 8-section accordion |

---

## Task 1: Rewrite `utils/assessment_questions.py` — 8-section bank

**Files:**
- Modify: `utils/assessment_questions.py`
- Create: `tests/test_assessment_questions.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_assessment_questions.py
import pytest
from utils.assessment_questions import get_sections, SECTIONS

def test_exactly_eight_sections():
    sections = get_sections()
    assert len(sections) == 8

def test_section_structure():
    for s in get_sections():
        assert "id" in s
        assert "title" in s
        assert "questions" in s
        assert isinstance(s["questions"], list)
        assert len(s["questions"]) >= 4

def test_question_structure():
    for s in get_sections():
        for q in s["questions"]:
            assert "id" in q
            assert "text" in q
            assert q["question_type"] in ("Exposure", "Control", "Context")

def test_question_ids_are_unique():
    all_ids = [q["id"] for s in get_sections() for q in s["questions"]]
    assert len(all_ids) == len(set(all_ids))

def test_section_ids_are_unique():
    ids = [s["id"] for s in get_sections()]
    assert len(ids) == len(set(ids))

def test_sections_list_is_same_object_as_get_sections():
    assert get_sections() is SECTIONS
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd "C:\Subho syste,\ControlTester_3000_kv"
python -m pytest tests/test_assessment_questions.py -v
```
Expected: ImportError or AttributeError — `get_sections` / `SECTIONS` not defined.

- [ ] **Step 3: Rewrite `utils/assessment_questions.py`**

```python
# utils/assessment_questions.py
"""8-section application risk assessment question bank.

Each question has a `question_type` used by the hybrid rule-layer scorer:
  Exposure  — "Yes" answer RAISES inherent risk
  Control   — "No" answer RAISES inherent risk (control absent)
  Context   — Informational; passed to LLM analysis only
"""

SECTIONS: list[dict] = [
    {
        "id": "business_criticality",
        "title": "Business Use and Criticality",
        "questions": [
            {"id": "bc_1", "text": "Is this application business-critical — would any unplanned downtime cause significant business or operational impact?", "question_type": "Exposure"},
            {"id": "bc_2", "text": "Does this application directly support revenue-generating or customer-facing processes?", "question_type": "Exposure"},
            {"id": "bc_3", "text": "Are there formally documented RTO/RPO requirements for this application?", "question_type": "Control"},
            {"id": "bc_4", "text": "Have documented owners, escalation contacts, and a support model been assigned to this application?", "question_type": "Control"},
            {"id": "bc_5", "text": "Does failure of this application trigger cascading failures in other critical systems?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "data_handled",
        "title": "Data Handled by the Application",
        "questions": [
            {"id": "dh_1", "text": "Does this application process, store, or transmit personal data (PII)?", "question_type": "Exposure"},
            {"id": "dh_2", "text": "Does this application handle sensitive regulated data (financial, healthcare, payment card, or government data)?", "question_type": "Exposure"},
            {"id": "dh_3", "text": "Is data classified according to the organisation's data classification policy?", "question_type": "Control"},
            {"id": "dh_4", "text": "Are formal data retention and disposal procedures in place for this application?", "question_type": "Control"},
            {"id": "dh_5", "text": "Does this application share data with third parties or external services?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "identity_access",
        "title": "Identity, Access, and Privileged Usage",
        "questions": [
            {"id": "ia_1", "text": "Are privileged or admin accounts separate from standard user accounts for this application?", "question_type": "Control"},
            {"id": "ia_2", "text": "Is multi-factor authentication (MFA) enforced for all user access to this application?", "question_type": "Control"},
            {"id": "ia_3", "text": "Are access reviews conducted on a regular basis (at least annually) for this application?", "question_type": "Control"},
            {"id": "ia_4", "text": "Is there a formal offboarding process that revokes access to this application when staff leave?", "question_type": "Control"},
            {"id": "ia_5", "text": "Are shared or generic accounts used to access this application?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "exposure_architecture",
        "title": "Exposure, Architecture, and Integrations",
        "questions": [
            {"id": "ea_1", "text": "Is this application accessible over the internet or from untrusted networks?", "question_type": "Exposure"},
            {"id": "ea_2", "text": "Does this application integrate with external or third-party services?", "question_type": "Exposure"},
            {"id": "ea_3", "text": "Are all API connections and integrations formally documented and inventoried?", "question_type": "Control"},
            {"id": "ea_4", "text": "Is network segmentation or a DMZ in place to isolate this application from other systems?", "question_type": "Control"},
            {"id": "ea_5", "text": "Has a formal threat model or architecture security review been conducted for this application?", "question_type": "Control"},
        ],
    },
    {
        "id": "secure_build_change",
        "title": "Secure Build, Change, and Vulnerability Handling",
        "questions": [
            {"id": "sb_1", "text": "Is a formal change management process followed before deploying changes to this application?", "question_type": "Control"},
            {"id": "sb_2", "text": "Are application dependencies and third-party libraries regularly reviewed for known vulnerabilities?", "question_type": "Control"},
            {"id": "sb_3", "text": "Has a penetration test or security assessment been conducted for this application within the last 12 months?", "question_type": "Control"},
            {"id": "sb_4", "text": "Are known security vulnerabilities tracked, prioritised, and remediated to a defined SLA?", "question_type": "Control"},
            {"id": "sb_5", "text": "Is any part of this application running on unsupported or end-of-life software or infrastructure?", "question_type": "Exposure"},
        ],
    },
    {
        "id": "logging_monitoring",
        "title": "Logging, Monitoring, and Detectability",
        "questions": [
            {"id": "lm_1", "text": "Are security-relevant events (authentication, access, errors, admin actions) logged for this application?", "question_type": "Control"},
            {"id": "lm_2", "text": "Are logs retained for a defined minimum period and protected from tampering or deletion?", "question_type": "Control"},
            {"id": "lm_3", "text": "Is there active alerting or monitoring on anomalous security events for this application?", "question_type": "Control"},
            {"id": "lm_4", "text": "Would an unauthorised access or data exfiltration event go undetected for more than 24 hours?", "question_type": "Exposure"},
            {"id": "lm_5", "text": "Are logs centralised and accessible to a security operations or incident response team?", "question_type": "Control"},
        ],
    },
    {
        "id": "resilience_backup",
        "title": "Resilience, Backup, and Recoverability",
        "questions": [
            {"id": "rb_1", "text": "Are backups of application data performed regularly and tested for restorability?", "question_type": "Control"},
            {"id": "rb_2", "text": "Is there a documented disaster recovery (DR) plan for this application?", "question_type": "Control"},
            {"id": "rb_3", "text": "Has the DR plan been tested within the last 12 months?", "question_type": "Control"},
            {"id": "rb_4", "text": "Does this application have a single point of failure with no redundancy?", "question_type": "Exposure"},
            {"id": "rb_5", "text": "Are backups stored in a geographically or logically separate location from the primary system?", "question_type": "Control"},
        ],
    },
    {
        "id": "special_risk_indicators",
        "title": "Special Risk Indicators",
        "questions": [
            {"id": "sr_1", "text": "Is this application subject to mandatory regulatory compliance requirements (e.g. GDPR, PCI DSS, HIPAA, SOX)?", "question_type": "Exposure"},
            {"id": "sr_2", "text": "Has this application been involved in a confirmed security incident or data breach in the last 24 months?", "question_type": "Exposure"},
            {"id": "sr_3", "text": "Are there open high or critical severity audit findings or remediation actions against this application?", "question_type": "Exposure"},
            {"id": "sr_4", "text": "Is this application managed or hosted entirely by a third-party vendor with limited internal oversight?", "question_type": "Exposure"},
            {"id": "sr_5", "text": "Is there an active and tracked remediation plan for known risks associated with this application?", "question_type": "Control"},
        ],
    },
]


def get_sections() -> list[dict]:
    """Return all 8 assessment sections with their question banks."""
    return SECTIONS
```

- [ ] **Step 4: Run tests to verify they pass**

```
python -m pytest tests/test_assessment_questions.py -v
```
Expected: 6/6 PASSED.

- [ ] **Step 5: Commit**

```bash
git add utils/assessment_questions.py tests/test_assessment_questions.py
git commit -m "feat: rewrite assessment_questions with 8-section bank (SP3 T1)"
```

---

## Task 2: Rewrite `api/routers/risk_assessment.py` — drop BIA/LEGAL/PIA, add sections endpoint, switch to Gemini

**Files:**
- Modify: `api/routers/risk_assessment.py`
- Create: `tests/test_risk_assessment_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_risk_assessment_api.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Patch MongoDB before importing app
with patch("pymongo.MongoClient") as _mc:
    _mc.return_value.__getitem__.return_value.__getitem__.return_value = MagicMock()
    from api.main import app

client = TestClient(app)


# ── /sections ─────────────────────────────────────────────────────────────

def test_get_sections_returns_8():
    r = client.get("/api/risk-assessment/sections")
    assert r.status_code == 200
    data = r.json()
    assert len(data["sections"]) == 8

def test_get_sections_structure():
    r = client.get("/api/risk-assessment/sections")
    s = r.json()["sections"][0]
    assert "id" in s and "title" in s and "questions" in s


# ── CRUD ──────────────────────────────────────────────────────────────────

def _mock_store():
    from api.routers.risk_assessment import MongoRiskAssessmentStore
    store = MagicMock(spec=MongoRiskAssessmentStore)
    return store


def test_create_assessment_201():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="Test", description="desc",
            status="draft", asset_ids=["a1"],
            responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.create.return_value = ra
        r = client.post("/api/risk-assessment", json={
            "title": "Test", "description": "desc", "asset_ids": ["a1"],
        })
    assert r.status_code == 201
    assert r.json()["title"] == "Test"


def test_submit_response_with_section_id():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="Test", description="desc",
            status="in_progress", asset_ids=["a1"],
            responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        gs.return_value.add_response.return_value = True
        r = client.post("/api/risk-assessment/ra1/respond", json={
            "asset_id": "a1",
            "section_id": "business_criticality",
            "question_id": "bc_1",
            "answer": "yes",
            "details": "This is our main trading platform.",
        })
    assert r.status_code == 201
    assert r.json()["ok"] is True


def test_submit_response_rejects_unknown_answer():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="Test", description="desc",
            status="in_progress", asset_ids=["a1"],
            responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        r = client.post("/api/risk-assessment/ra1/respond", json={
            "asset_id": "a1",
            "section_id": "business_criticality",
            "question_id": "bc_1",
            "answer": "maybe",
            "details": "",
        })
    assert r.status_code == 422


def test_get_assessment_404_when_missing():
    with patch("api.routers.risk_assessment.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.get("/api/risk-assessment/nonexistent")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_risk_assessment_api.py -v
```
Expected: failures on `/sections` 404, `answer` field validation, etc.

- [ ] **Step 3: Rewrite `api/routers/risk_assessment.py`**

Replace the entire file content with:

```python
# api/routers/risk_assessment.py
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from utils.assessment_questions import get_sections

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/risk-assessment", tags=["risk-assessment"])

StatusType = Literal["draft", "in_progress", "risks_identified", "controls_applied", "complete"]
RiskBand = Literal["Low", "Medium", "High", "Critical"]
AnswerType = Literal["yes", "no", "na"]


# ── Pydantic models ──────────────────────────────────────────────────────────

class RiskAssessmentCreate(BaseModel):
    title: str
    description: str
    asset_ids: list[str]

    @field_validator("asset_ids")
    @classmethod
    def _at_least_one(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one asset_id is required")
        return v


class ResponseSubmit(BaseModel):
    asset_id: str
    section_id: str
    question_id: str
    answer: AnswerType
    details: str = ""


class RiskOverride(BaseModel):
    asset_id: str
    title: str
    description: str
    risk_category: str
    likelihood_score: int   # 1-5
    impact_score: int       # 1-5
    human_rationale: str


class ControlApplication(BaseModel):
    risk_id: str
    control_id: str
    source: str
    human_rationale: str = ""


class RiskAssessment(BaseModel):
    id: str
    title: str
    description: str
    status: StatusType
    asset_ids: list[str]
    responses: list[dict]
    risks: list[dict]
    applied_controls: list[dict]
    created_at: str
    updated_at: str


# ── MongoDB store ────────────────────────────────────────────────────────────

class MongoRiskAssessmentStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        client = pymongo.MongoClient(uri)
        db = client["trace_db"]
        self._col = db["risk_assessments"]
        self._col.create_index("status")
        self._col.create_index("created_at")

    def _to_ra(self, doc: dict) -> RiskAssessment:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return RiskAssessment(**doc)

    def create(self, data: RiskAssessmentCreate) -> RiskAssessment:
        now = datetime.utcnow().isoformat()
        doc: dict[str, Any] = {
            "_id": str(uuid.uuid4()),
            "title": data.title,
            "description": data.description,
            "status": "draft",
            "asset_ids": data.asset_ids,
            "responses": [],
            "risks": [],
            "applied_controls": [],
            "created_at": now,
            "updated_at": now,
        }
        self._col.insert_one(doc)
        return self._to_ra(dict(doc))

    def list(self, status_f: str | None = None) -> list[RiskAssessment]:
        q: dict = {}
        if status_f:
            q["status"] = status_f
        return [self._to_ra(d) for d in self._col.find(q).sort("created_at", -1)]

    def get(self, ra_id: str) -> RiskAssessment | None:
        doc = self._col.find_one({"_id": ra_id})
        return self._to_ra(doc) if doc else None

    def add_response(self, ra_id: str, response: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"responses": response},
             "$set": {"status": "in_progress", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def set_risks(self, ra_id: str, risks: list[dict], status: str = "risks_identified") -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$set": {"risks": risks, "status": status, "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def add_risk(self, ra_id: str, risk: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"risks": risk},
             "$set": {"updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1

    def add_control(self, ra_id: str, control: dict) -> bool:
        result = self._col.update_one(
            {"_id": ra_id},
            {"$push": {"applied_controls": control},
             "$set": {"status": "controls_applied", "updated_at": datetime.utcnow().isoformat()}},
        )
        return result.modified_count == 1


_store: MongoRiskAssessmentStore | None = None


def get_store() -> MongoRiskAssessmentStore:
    global _store
    if _store is None:
        _store = MongoRiskAssessmentStore()
    return _store


# ── Risk scoring helpers ─────────────────────────────────────────────────────

def _inherent_risk_band(score: float) -> str:
    if score <= 4:   return "Low"
    if score <= 9:   return "Medium"
    if score <= 16:  return "High"
    return "Critical"


def _rule_layer_scores(responses: list[dict]) -> tuple[int, int]:
    """Compute rule-based likelihood + impact deltas from Exposure/Control questions.

    Returns (likelihood_delta, impact_delta) each in range 0–5.
    """
    section_map: dict[str, dict[str, str]] = {}  # section_id -> {question_id -> question_type}
    for s in get_sections():
        section_map[s["id"]] = {q["id"]: q["question_type"] for q in s["questions"]}

    exposure_yes = 0
    control_no = 0

    for r in responses:
        sid = r.get("section_id", "")
        qid = r.get("question_id", "")
        answer = r.get("answer", "na")
        qtype = section_map.get(sid, {}).get(qid)
        if qtype == "Exposure" and answer == "yes":
            exposure_yes += 1
        elif qtype == "Control" and answer == "no":
            control_no += 1

    # Map counts to 1-5 scale (cap at 5)
    likelihood = min(5, max(1, round(1 + (exposure_yes / 5) * 4)))
    impact = min(5, max(1, round(1 + (control_no / 5) * 4)))
    return likelihood, impact


# ── Route handlers ───────────────────────────────────────────────────────────

@router.get("/sections")
def get_assessment_sections():
    """Return all 8 assessment sections with their question banks."""
    return {"sections": get_sections()}


@router.post("", status_code=201, response_model=RiskAssessment)
def create_assessment(body: RiskAssessmentCreate):
    return get_store().create(body)


@router.get("", response_model=list[RiskAssessment])
def list_assessments(status: str | None = None):
    return get_store().list(status)


@router.get("/{ra_id}", response_model=RiskAssessment)
def get_assessment(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    return ra


@router.post("/{ra_id}/respond", status_code=201)
def submit_response(ra_id: str, body: ResponseSubmit):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    response = {
        "id": str(uuid.uuid4()),
        "asset_id": body.asset_id,
        "section_id": body.section_id,
        "question_id": body.question_id,
        "answer": body.answer,
        "details": body.details,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    get_store().add_response(ra_id, response)
    return {"ok": True, "response_id": response["id"]}


@router.get("/{ra_id}/risks")
def get_risks(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    return {"assessment_id": ra_id, "risks": ra.risks}


@router.post("/{ra_id}/risks", status_code=201)
def add_human_risk(ra_id: str, body: RiskOverride):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    score = body.likelihood_score * body.impact_score
    risk = {
        "id": str(uuid.uuid4()),
        "asset_id": body.asset_id,
        "title": body.title,
        "description": body.description,
        "risk_category": body.risk_category,
        "likelihood_score": body.likelihood_score,
        "impact_score": body.impact_score,
        "inherent_risk_score": score,
        "inherent_risk_band": _inherent_risk_band(score),
        "residual_risk_score": score,
        "residual_risk_band": _inherent_risk_band(score),
        "source": "human_added",
        "human_rationale": body.human_rationale,
        "status": "identified",
    }
    get_store().add_risk(ra_id, risk)
    return {"ok": True, "risk": risk}


@router.post("/{ra_id}/controls", status_code=201)
def apply_control(ra_id: str, body: ControlApplication):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    control = {
        "id": str(uuid.uuid4()),
        "risk_id": body.risk_id,
        "control_id": body.control_id,
        "source": body.source,
        "human_rationale": body.human_rationale,
        "effectiveness_score": 1.0,
        "applied_at": datetime.utcnow().isoformat(),
    }
    get_store().add_control(ra_id, control)
    return {"ok": True, "control": control}


@router.get("/{ra_id}/residual")
def get_residual(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    results = []
    for risk in ra.risks:
        risk_id = risk["id"]
        applied = [c for c in ra.applied_controls if c["risk_id"] == risk_id]
        avg_eff = sum(c.get("effectiveness_score", 1.0) for c in applied) / len(applied) if applied else 0.0
        inherent = risk.get("inherent_risk_score", 0)
        residual = round(inherent * (1 - avg_eff), 2)
        results.append({
            "risk_id": risk_id,
            "risk_title": risk.get("title", ""),
            "asset_id": risk.get("asset_id", ""),
            "inherent_risk_score": inherent,
            "inherent_risk_band": risk.get("inherent_risk_band", ""),
            "controls_applied": len(applied),
            "avg_effectiveness": round(avg_eff, 2),
            "residual_risk_score": residual,
            "residual_risk_band": _inherent_risk_band(residual) if residual > 0 else "Low",
        })
    return {"assessment_id": ra_id, "residual_risks": results}


@router.post("/{ra_id}/analyze")
def analyze_assessment(ra_id: str):
    """Hybrid rule-layer + Gemini LLM analysis to identify risks per asset."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain.schema import HumanMessage
    import json as _json

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.responses:
        raise HTTPException(400, "No responses yet. Submit questionnaire responses first.")

    from api.routers.assets import get_store as get_asset_store
    asset_store = get_asset_store()

    # Group responses by asset_id
    by_asset: dict[str, list[dict]] = {}
    for resp in ra.responses:
        by_asset.setdefault(resp["asset_id"], []).append(resp)

    all_risks: list[dict] = []

    for asset_id, asset_responses in by_asset.items():
        asset = asset_store.get(asset_id)
        asset_name = asset.name if asset else asset_id
        cia_total = asset.cia_total if asset else 9
        cia_band = asset.cia_band if asset else "Medium"

        # Rule layer — compute base scores
        rule_likelihood, rule_impact = _rule_layer_scores(asset_responses)

        # Build Q&A summary text for LLM
        qa_lines = []
        for r in asset_responses:
            qa_lines.append(
                f"[{r['section_id']}] Q:{r['question_id']} | Answer:{r['answer']} | Details: {r.get('details', '')}"
            )
        qa_text = "\n".join(qa_lines)

        prompt = f"""You are a cybersecurity risk analyst. Analyse the following assessment responses for an application and identify specific risks.

Application: {asset_name}
CIA Total: {cia_total}/15 (Band: {cia_band})
Rule-based pre-score — Likelihood: {rule_likelihood}/5, Impact: {rule_impact}/5

Assessment Responses (section | question | answer | details):
{qa_text}

Based on these responses, identify 2-4 specific, actionable risks for this application.
For each risk return a JSON object with:
- title: short risk title (max 10 words)
- description: 1-2 sentence description of the risk
- risk_category: one of [Operational, Regulatory, Privacy, Financial, Reputational, Technical]
- likelihood_score: integer 1-5 (calibrate from rule-based pre-score of {rule_likelihood}, adjust based on evidence)
- impact_score: integer 1-5 (calibrate from rule-based pre-score of {rule_impact}, adjust based on evidence)
- rationale: one sentence explaining the score

Return ONLY a valid JSON array, no markdown, no explanation.
Example: [{{"title":"Unauthorised data access","description":"...","risk_category":"Privacy","likelihood_score":3,"impact_score":4,"rationale":"..."}}]"""

        try:
            llm = ChatGoogleGenerativeAI(
                model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash"),
                google_api_key=os.environ.get("GOOGLE_API_KEY"),
                temperature=0.2,
            )
            response = llm.invoke([HumanMessage(content=prompt)])
            content = response.content.strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            llm_risks = _json.loads(content)
        except Exception as e:
            logger.error(f"LLM analysis failed for asset {asset_id}: {e}")
            llm_risks = [{
                "title": f"{asset_name} — inherent risk",
                "description": f"Risk derived from rule-layer scoring (LLM analysis unavailable).",
                "risk_category": "Operational",
                "likelihood_score": rule_likelihood,
                "impact_score": rule_impact,
                "rationale": "Derived from rule-based analysis of questionnaire responses.",
            }]

        for r in llm_risks:
            l = int(r.get("likelihood_score", rule_likelihood))
            i = int(r.get("impact_score", rule_impact))
            score = l * i
            all_risks.append({
                "id": str(uuid.uuid4()),
                "asset_id": asset_id,
                "title": r.get("title", "Unnamed Risk"),
                "description": r.get("description", ""),
                "risk_category": r.get("risk_category", "Operational"),
                "likelihood_score": l,
                "impact_score": i,
                "inherent_risk_score": score,
                "inherent_risk_band": _inherent_risk_band(score),
                "residual_risk_score": score,
                "residual_risk_band": _inherent_risk_band(score),
                "source": "llm_generated",
                "human_rationale": r.get("rationale", ""),
                "status": "identified",
            })

    get_store().set_risks(ra_id, all_risks)
    return {
        "assessment_id": ra_id,
        "risks_identified": len(all_risks),
        "risks": all_risks,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```
python -m pytest tests/test_risk_assessment_api.py -v
```
Expected: 5/5 PASSED.

- [ ] **Step 5: Run full test suite to check for regressions**

```
python -m pytest tests/ -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/risk_assessment.py tests/test_risk_assessment_api.py
git commit -m "feat: rewrite risk_assessment router — 8-section model, Gemini analyze (SP3 T2)"
```

---

## Task 3: Rewrite `RiskAssessmentContext.tsx` — new section-based types

**Files:**
- Modify: `kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx`

> No new test file — TypeScript types are verified at compile time via `npm run check`.

- [ ] **Step 1: Rewrite `kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx`**

```typescript
// kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ── Domain types ──────────────────────────────────────────────────────────

export type AnswerType = "yes" | "no" | "na";
export type StatusType = "draft" | "in_progress" | "risks_identified" | "controls_applied" | "complete";
export type RiskBand = "Low" | "Medium" | "High" | "Critical";
export type QuestionType = "Exposure" | "Control" | "Context";

export interface Question {
  id: string;
  text: string;
  question_type: QuestionType;
}

export interface Section {
  id: string;
  title: string;
  questions: Question[];
}

export interface SectionResponse {
  id?: string;
  asset_id: string;
  section_id: string;
  question_id: string;
  answer: AnswerType;
  details: string;
  submitted_at?: string;
}

export interface Risk {
  id: string;
  asset_id: string;
  title: string;
  description: string;
  risk_category: string;
  likelihood_score: number;
  impact_score: number;
  inherent_risk_score: number;
  inherent_risk_band: RiskBand;
  residual_risk_score: number;
  residual_risk_band: RiskBand;
  source: string;
  human_rationale: string;
  status: string;
}

export interface RiskAssessment {
  id: string;
  title: string;
  description: string;
  status: StatusType;
  asset_ids: string[];
  responses: SectionResponse[];
  risks: Risk[];
  applied_controls: AppliedControl[];
  created_at: string;
  updated_at: string;
}

export interface AppliedControl {
  id: string;
  risk_id: string;
  control_id: string;
  source: string;
  human_rationale: string;
  effectiveness_score: number;
  applied_at: string;
}

export interface ResidualResult {
  risk_id: string;
  risk_title: string;
  asset_id: string;
  inherent_risk_score: number;
  inherent_risk_band: RiskBand;
  controls_applied: number;
  avg_effectiveness: number;
  residual_risk_score: number;
  residual_risk_band: RiskBand;
}

export interface RiskAssessmentCreate {
  title: string;
  description: string;
  asset_ids: string[];
}

// ── Context ───────────────────────────────────────────────────────────────

interface Ctx {
  assessments: RiskAssessment[];
  selectedAssessment: RiskAssessment | null;
  sections: Section[];
  residualResults: ResidualResult[];
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  fetchAssessments: () => Promise<void>;
  selectAssessment: (a: RiskAssessment | null) => void;
  createAssessment: (data: RiskAssessmentCreate) => Promise<RiskAssessment>;
  fetchSections: () => Promise<void>;
  submitResponse: (
    raId: string,
    assetId: string,
    sectionId: string,
    questionId: string,
    answer: AnswerType,
    details: string,
  ) => Promise<void>;
  analyzeAssessment: (raId: string) => Promise<void>;
  addHumanRisk: (raId: string, risk: Omit<Risk, "id" | "inherent_risk_score" | "inherent_risk_band" | "residual_risk_score" | "residual_risk_band" | "source" | "status">) => Promise<void>;
  applyControl: (raId: string, riskId: string, controlId: string, source: string, rationale: string) => Promise<void>;
  fetchResidual: (raId: string) => Promise<void>;
}

const RiskAssessmentContext = createContext<Ctx | null>(null);

export function RiskAssessmentProvider({ children }: { children: ReactNode }) {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [residualResults, setResidualResults] = useState<ResidualResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/risk-assessment");
      if (!r.ok) throw new Error("Failed to fetch assessments");
      setAssessments(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectAssessment = useCallback((a: RiskAssessment | null) => {
    setSelectedAssessment(a);
    setResidualResults([]);
  }, []);

  const createAssessment = useCallback(async (data: RiskAssessmentCreate): Promise<RiskAssessment> => {
    const r = await fetch("/api/risk-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("Failed to create assessment");
    const ra: RiskAssessment = await r.json();
    setAssessments(prev => [ra, ...prev]);
    return ra;
  }, []);

  const fetchSections = useCallback(async () => {
    try {
      const r = await fetch("/api/risk-assessment/sections");
      if (!r.ok) throw new Error("Failed to fetch sections");
      const data = await r.json();
      setSections(data.sections ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const submitResponse = useCallback(async (
    raId: string,
    assetId: string,
    sectionId: string,
    questionId: string,
    answer: AnswerType,
    details: string,
  ): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, section_id: sectionId, question_id: questionId, answer, details }),
    });
    if (!r.ok) throw new Error("Failed to submit response");
    // Refresh the selected assessment to reflect new response count
    const updated = await fetch(`/api/risk-assessment/${raId}`);
    if (updated.ok) {
      const ra: RiskAssessment = await updated.json();
      setSelectedAssessment(ra);
      setAssessments(prev => prev.map(a => a.id === raId ? ra : a));
    }
  }, []);

  const analyzeAssessment = useCallback(async (raId: string): Promise<void> => {
    setIsAnalyzing(true);
    try {
      const r = await fetch(`/api/risk-assessment/${raId}/analyze`, { method: "POST" });
      if (!r.ok) throw new Error("Analysis failed");
      const data = await r.json();
      const updated: RiskAssessment = { ...selectedAssessment!, risks: data.risks, status: "risks_identified" };
      setSelectedAssessment(updated);
      setAssessments(prev => prev.map(a => a.id === raId ? updated : a));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedAssessment]);

  const addHumanRisk = useCallback(async (raId: string, risk: any): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/risks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(risk),
    });
    if (!r.ok) throw new Error("Failed to add risk");
    const data = await r.json();
    if (selectedAssessment?.id === raId) {
      setSelectedAssessment(prev => prev ? { ...prev, risks: [...prev.risks, data.risk] } : prev);
    }
  }, [selectedAssessment]);

  const applyControl = useCallback(async (raId: string, riskId: string, controlId: string, source: string, rationale: string): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ risk_id: riskId, control_id: controlId, source, human_rationale: rationale }),
    });
    if (!r.ok) throw new Error("Failed to apply control");
  }, []);

  const fetchResidual = useCallback(async (raId: string): Promise<void> => {
    try {
      const r = await fetch(`/api/risk-assessment/${raId}/residual`);
      if (!r.ok) throw new Error("Failed to fetch residual");
      const data = await r.json();
      setResidualResults(data.residual_risks ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  return (
    <RiskAssessmentContext.Provider value={{
      assessments, selectedAssessment, sections, residualResults,
      isLoading, isAnalyzing, error,
      fetchAssessments, selectAssessment, createAssessment,
      fetchSections, submitResponse, analyzeAssessment,
      addHumanRisk, applyControl, fetchResidual,
    }}>
      {children}
    </RiskAssessmentContext.Provider>
  );
}

export function useRiskAssessment() {
  const ctx = useContext(RiskAssessmentContext);
  if (!ctx) throw new Error("useRiskAssessment must be used inside RiskAssessmentProvider");
  return ctx;
}
```

- [ ] **Step 2: Run TypeScript type check**

```
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui"
npm run check
```
Expected: 0 errors in the context file. There will be errors in `risk-assessment.tsx` since it still uses old types — those are fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx
git commit -m "feat: rewrite RiskAssessmentContext — section-based model, drop BIA/LEGAL/PIA (SP3 T3)"
```

---

## Task 4: Rewrite `risk-assessment.tsx` — 8-section accordion Q&A

**Files:**
- Modify: `kpmg_ui/client/src/pages/risk-assessment.tsx`

- [ ] **Step 1: Rewrite `kpmg_ui/client/src/pages/risk-assessment.tsx`**

Replace the entire file with:

```typescript
// kpmg_ui/client/src/pages/risk-assessment.tsx
import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight,
  CheckCircle2, FileBarChart, Loader2, Plus, ShieldAlert, ShieldCheck, Sparkles,
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
  useRiskAssessment,
  RiskAssessmentCreate,
  AnswerType,
  Section,
} from "@/contexts/RiskAssessmentContext";
import { useAssetRegistry } from "@/contexts/AssetRegistryContext";

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", in_progress: "In Progress",
  risks_identified: "Risks Identified", controls_applied: "Controls Applied", complete: "Complete",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-300",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300",
  risks_identified: "bg-amber-100 text-amber-700 border-amber-300",
  controls_applied: "bg-violet-100 text-violet-700 border-violet-300",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-300",
};
const BAND_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-300",
  High: "bg-orange-100 text-orange-700 border-orange-300",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low: "bg-emerald-100 text-emerald-700 border-emerald-300",
};
const ANSWER_STYLE: Record<AnswerType, string> = {
  yes: "bg-red-100 text-red-700 border-red-300 font-semibold",
  no: "bg-emerald-100 text-emerald-700 border-emerald-300 font-semibold",
  na: "bg-slate-100 text-slate-500 border-slate-300",
};

const WIZARD_STEPS = ["Create", "Questionnaire", "Analyse", "Risks", "Residual"];

type RightTab = "dashboard" | "wizard";

// ── Local Q&A state types ─────────────────────────────────────────────────

interface LocalAnswer {
  answer: AnswerType;
  details: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function RiskAssessmentPage() {
  const {
    assessments, selectedAssessment, sections, residualResults,
    isLoading, isAnalyzing, error,
    fetchAssessments, selectAssessment, createAssessment,
    fetchSections, submitResponse, analyzeAssessment, addHumanRisk, fetchResidual,
  } = useRiskAssessment();
  const { assets, fetchAssets } = useAssetRegistry();
  const { toast } = useToast();

  const [rightTab, setRightTab] = useState<RightTab>("dashboard");
  const [wizardStep, setWizardStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [form, setForm] = useState<{ title: string; description: string; selectedAssetIds: string[] }>({
    title: "", description: "", selectedAssetIds: [],
  });

  // Q&A state
  const [qaAssetIdx, setQaAssetIdx] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  // answers[assetId][sectionId][questionId] = LocalAnswer
  const [answers, setAnswers] = useState<Record<string, Record<string, Record<string, LocalAnswer>>>>({});
  const [submittingQa, setSubmittingQa] = useState(false);

  useEffect(() => { fetchAssessments(); fetchAssets(); fetchSections(); }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────

  const active = assessments.filter(a => a.status !== "complete").length;
  const allRisks = assessments.flatMap(a => a.risks);
  const highCrit = allRisks.filter(r =>
    r.inherent_risk_band === "Critical" || r.inherent_risk_band === "High"
  ).length;
  const drafts = assessments.filter(a => a.status === "draft").length;

  // ── Helpers ───────────────────────────────────────────────────────────

  function setAnswer(assetId: string, sectionId: string, questionId: string, answer: AnswerType) {
    setAnswers(prev => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {}),
        [sectionId]: {
          ...(prev[assetId]?.[sectionId] ?? {}),
          [questionId]: { answer, details: prev[assetId]?.[sectionId]?.[questionId]?.details ?? "" },
        },
      },
    }));
  }

  function setDetails(assetId: string, sectionId: string, questionId: string, details: string) {
    setAnswers(prev => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {}),
        [sectionId]: {
          ...(prev[assetId]?.[sectionId] ?? {}),
          [questionId]: { answer: prev[assetId]?.[sectionId]?.[questionId]?.answer ?? "na", details },
        },
      },
    }));
  }

  function answeredCount(assetId: string): number {
    const assetAnswers = answers[assetId] ?? {};
    return Object.values(assetAnswers).flatMap(s => Object.values(s)).filter(a => a.answer !== "na").length;
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!form.title || form.selectedAssetIds.length === 0) {
      toast({ title: "Title and at least one asset required", variant: "destructive" });
      return;
    }
    try {
      const ra = await createAssessment({
        title: form.title,
        description: form.description,
        asset_ids: form.selectedAssetIds,
      });
      selectAssessment(ra);
      setShowCreate(false);
      setWizardStep(1);
      setRightTab("wizard");
      setQaAssetIdx(0);
      setExpandedSection(sections[0]?.id ?? null);
      toast({ title: "Assessment created" });
    } catch {
      toast({ title: "Failed to create assessment", variant: "destructive" });
    }
  }

  async function handleSubmitQa() {
    if (!selectedAssessment) return;
    const assetId = selectedAssessment.asset_ids[qaAssetIdx];
    setSubmittingQa(true);
    try {
      for (const section of sections) {
        for (const question of section.questions) {
          const local = answers[assetId]?.[section.id]?.[question.id];
          if (local && local.answer !== "na") {
            await submitResponse(
              selectedAssessment.id, assetId, section.id, question.id, local.answer, local.details,
            );
          }
        }
      }
      if (qaAssetIdx < selectedAssessment.asset_ids.length - 1) {
        setQaAssetIdx(i => i + 1);
        setExpandedSection(sections[0]?.id ?? null);
        toast({ title: "Responses saved — next application" });
      } else {
        setWizardStep(2);
        toast({ title: "All responses submitted — ready to analyse" });
      }
    } catch {
      toast({ title: "Failed to save responses", variant: "destructive" });
    } finally {
      setSubmittingQa(false);
    }
  }

  async function handleAnalyse() {
    if (!selectedAssessment) return;
    try {
      await analyzeAssessment(selectedAssessment.id);
      setWizardStep(3);
      toast({ title: "Analysis complete" });
    } catch {
      toast({ title: "Analysis failed", variant: "destructive" });
    }
  }

  async function handleFetchResidual() {
    if (!selectedAssessment) return;
    await fetchResidual(selectedAssessment.id);
    setWizardStep(4);
  }

  // ── Section accordion helpers ─────────────────────────────────────────

  function sectionProgress(assetId: string, section: Section): number {
    const sectionAnswers = answers[assetId]?.[section.id] ?? {};
    return Object.values(sectionAnswers).filter(a => a.answer !== "na").length;
  }

  // ── Render ────────────────────────────────────────────────────────────

  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? id;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <HeroSection
        title="Risk Assessment"
        description="Application risk assessments — questionnaire, inherent scoring, residual analysis"
        icon={<ShieldAlert className="w-6 h-6" />}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel: assessment list ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <Button className="w-full" size="sm" onClick={() => { setShowCreate(true); setRightTab("dashboard"); }}>
              <Plus className="w-4 h-4 mr-2" /> New Assessment
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin w-5 h-5 text-slate-400" /></div>
            ) : assessments.map(a => (
              <button
                key={a.id}
                onClick={() => { selectAssessment(a); setRightTab("wizard"); setWizardStep(a.status === "draft" ? 0 : a.status === "in_progress" ? 1 : a.status === "risks_identified" ? 3 : 4); }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedAssessment?.id === a.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
              >
                <p className="font-medium text-sm text-slate-800 truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[a.status]}`}>
                    {STATUS_LABELS[a.status]}
                  </Badge>
                  <span className="text-xs text-slate-400">{a.asset_ids.length} app{a.asset_ids.length !== 1 ? "s" : ""}</span>
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-auto p-6">
          {/* Create modal */}
          {showCreate && (
            <Card className="max-w-lg mx-auto mb-6">
              <CardHeader><CardTitle>New Risk Assessment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Assessment title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                <Textarea placeholder="High-level description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Select applications in scope *</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
                    {assets.filter(a => a.asset_type === "Application").map(a => (
                      <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={form.selectedAssetIds.includes(a.id)}
                          onChange={e => setForm(p => ({
                            ...p,
                            selectedAssetIds: e.target.checked
                              ? [...p.selectedAssetIds, a.id]
                              : p.selectedAssetIds.filter(id => id !== a.id),
                          }))}
                        />
                        <span className="text-sm">{a.name}</span>
                        <Badge variant="outline" className={`text-xs ml-auto ${BAND_COLOR[a.cia_band]}`}>{a.cia_band}</Badge>
                      </label>
                    ))}
                    {assets.filter(a => a.asset_type === "Application").length === 0 && (
                      <p className="text-xs text-slate-400 p-2">No applications in Asset Registry yet.</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreate}>Create</Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dashboard */}
          {!selectedAssessment && !showCreate && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-blue-600">{active}</p><p className="text-sm text-slate-500">Active Assessments</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-orange-600">{highCrit}</p><p className="text-sm text-slate-500">High / Critical Risks</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-slate-500">{drafts}</p><p className="text-sm text-slate-500">Drafts</p></CardContent></Card>
              </div>
              <p className="text-slate-400 text-sm">Select an assessment from the left, or create a new one.</p>
            </div>
          )}

          {/* Wizard */}
          {selectedAssessment && rightTab === "wizard" && (
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

              {/* Step 0: Summary */}
              {wizardStep === 0 && (
                <Card>
                  <CardHeader><CardTitle>{selectedAssessment.title}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600">{selectedAssessment.description}</p>
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-1">Applications in scope</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedAssessment.asset_ids.map(id => (
                          <Badge key={id} variant="outline">{assetName(id)}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button onClick={() => { setWizardStep(1); setExpandedSection(sections[0]?.id ?? null); }}>
                      Start Questionnaire <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 1: Questionnaire */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  {/* Asset tab bar */}
                  <div className="flex gap-2">
                    {selectedAssessment.asset_ids.map((id, idx) => (
                      <button
                        key={id}
                        onClick={() => setQaAssetIdx(idx)}
                        className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${idx === qaAssetIdx ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}
                      >
                        {assetName(id)}
                        <span className="ml-1 text-xs opacity-70">({answeredCount(id)})</span>
                      </button>
                    ))}
                  </div>

                  {/* Section accordion */}
                  {sections.map(section => {
                    const assetId = selectedAssessment.asset_ids[qaAssetIdx];
                    const done = sectionProgress(assetId, section);
                    const total = section.questions.length;
                    const isOpen = expandedSection === section.id;
                    return (
                      <Card key={section.id} className={isOpen ? "ring-1 ring-blue-300" : ""}>
                        <button
                          className="w-full flex items-center justify-between px-4 py-3 text-left"
                          onClick={() => setExpandedSection(isOpen ? null : section.id)}
                        >
                          <div className="flex items-center gap-3">
                            {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            <span className="font-medium text-sm text-slate-800">{section.title}</span>
                          </div>
                          <Badge variant="outline" className={done === total ? "border-emerald-400 text-emerald-600" : "border-slate-300 text-slate-500"}>
                            {done}/{total}
                          </Badge>
                        </button>
                        {isOpen && (
                          <CardContent className="pt-0 space-y-4">
                            {section.questions.map(q => {
                              const local = answers[assetId]?.[section.id]?.[q.id];
                              return (
                                <div key={q.id} className="border-t pt-3">
                                  <div className="flex items-start gap-2 mb-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded border ${q.question_type === "Exposure" ? "bg-orange-50 text-orange-600 border-orange-200" : q.question_type === "Control" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                                      {q.question_type}
                                    </span>
                                    <p className="text-sm text-slate-700 flex-1">{q.text}</p>
                                  </div>
                                  <div className="flex gap-2 mb-2">
                                    {(["yes", "no", "na"] as AnswerType[]).map(a => (
                                      <button
                                        key={a}
                                        onClick={() => setAnswer(assetId, section.id, q.id, a)}
                                        className={`px-3 py-1 rounded border text-xs transition-colors ${local?.answer === a ? ANSWER_STYLE[a] : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"}`}
                                      >
                                        {a === "na" ? "N/A" : a.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>
                                  {local?.answer && local.answer !== "na" && (
                                    <Textarea
                                      placeholder="Additional details (optional)"
                                      value={local.details}
                                      onChange={e => setDetails(assetId, section.id, q.id, e.target.value)}
                                      rows={2}
                                      className="text-sm"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}

                  <Button onClick={handleSubmitQa} disabled={submittingQa} className="mt-2">
                    {submittingQa && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {qaAssetIdx < selectedAssessment.asset_ids.length - 1 ? "Save & Next Application" : "Submit All Responses"}
                  </Button>
                </div>
              )}

              {/* Step 2: Analyse */}
              {wizardStep === 2 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" />Run Risk Analysis</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600">
                      The analysis uses a hybrid rule-layer + Gemini LLM model to identify 2–4 specific risks per application
                      from your questionnaire responses.
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedAssessment.responses.length} responses submitted across {selectedAssessment.asset_ids.length} application(s).
                    </p>
                    <Button onClick={handleAnalyse} disabled={isAnalyzing}>
                      {isAnalyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analysing…</> : "Run Analysis"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Risks */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Identified Risks ({selectedAssessment.risks.length})</h3>
                    <Button size="sm" variant="outline" onClick={() => setWizardStep(4)}>
                      View Residual <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  {selectedAssessment.risks.map(r => (
                    <Card key={r.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm text-slate-800">{r.title}</p>
                            <p className="text-xs text-slate-500 mt-1">{r.description}</p>
                          </div>
                          <Badge variant="outline" className={BAND_COLOR[r.inherent_risk_band]}>
                            {r.inherent_risk_band}
                          </Badge>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                          <span>Likelihood: {r.likelihood_score}/5</span>
                          <span>Impact: {r.impact_score}/5</span>
                          <span>Score: {r.inherent_risk_score}</span>
                          <Badge variant="outline" className="text-xs">{r.risk_category}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {selectedAssessment.risks.length === 0 && (
                    <p className="text-slate-400 text-sm">No risks identified yet. Run analysis first.</p>
                  )}
                </div>
              )}

              {/* Step 4: Residual */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Residual Risk</h3>
                    <Button size="sm" variant="outline" onClick={handleFetchResidual}>
                      <FileBarChart className="w-4 h-4 mr-1" />Refresh
                    </Button>
                  </div>
                  {residualResults.length === 0 && (
                    <Button onClick={handleFetchResidual}>Calculate Residual Risk</Button>
                  )}
                  {residualResults.map(r => (
                    <Card key={r.risk_id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-slate-800">{r.risk_title}</p>
                          <div className="flex gap-2">
                            <Badge variant="outline" className={BAND_COLOR[r.inherent_risk_band]}>
                              Inherent: {r.inherent_risk_band}
                            </Badge>
                            <Badge variant="outline" className={BAND_COLOR[r.residual_risk_band]}>
                              Residual: {r.residual_risk_band}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-slate-500">
                          <span>Controls: {r.controls_applied}</span>
                          <span>Avg effectiveness: {(r.avg_effectiveness * 100).toFixed(0)}%</span>
                          <span>Residual score: {r.residual_risk_score}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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

- [ ] **Step 2: Run TypeScript type check**

```
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui"
npm run check
```
Expected: 0 type errors.

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/pages/risk-assessment.tsx
git commit -m "feat: rewrite risk-assessment page — 8-section accordion wizard (SP3 T4)"
```

---

---

## Task 5: Add control suggestion endpoint (§6.8) + backend report generation (§6.9)

**Files:**
- Modify: `api/routers/risk_assessment.py` — add `POST /{ra_id}/suggest-controls` and `POST /{ra_id}/generate-report`
- Modify: `tests/test_risk_assessment_api.py` — add tests for both new endpoints

**§6.8 requires:** Controls from master library only, ranked by risk-category relevance + LLM (Persona 6: Control Selector).
**§6.9 requires:** 9-section markdown report via LLM (Persona 7: Assessment Report Writer).

- [ ] **Step 1: Add tests for the two new endpoints**

Append to `tests/test_risk_assessment_api.py`:

```python
def test_suggest_controls_404_unknown_assessment():
    with patch("api.routers.risk_assessment.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post("/api/risk-assessment/missing/suggest-controls")
    assert r.status_code == 404


def test_suggest_controls_400_no_risks():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="T", description="d", status="in_progress",
            asset_ids=["a1"], responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        r = client.post("/api/risk-assessment/ra1/suggest-controls")
    assert r.status_code == 400


def test_generate_report_404_unknown_assessment():
    with patch("api.routers.risk_assessment.get_store") as gs:
        gs.return_value.get.return_value = None
        r = client.post("/api/risk-assessment/missing/generate-report")
    assert r.status_code == 404


def test_generate_report_400_no_risks():
    with patch("api.routers.risk_assessment.get_store") as gs:
        from api.routers.risk_assessment import RiskAssessment
        ra = RiskAssessment(
            id="ra1", title="T", description="d", status="in_progress",
            asset_ids=["a1"], responses=[], risks=[], applied_controls=[],
            created_at="2026-01-01", updated_at="2026-01-01",
        )
        gs.return_value.get.return_value = ra
        r = client.post("/api/risk-assessment/ra1/generate-report")
    assert r.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

```
python -m pytest tests/test_risk_assessment_api.py::test_suggest_controls_404_unknown_assessment tests/test_risk_assessment_api.py::test_generate_report_404_unknown_assessment -v
```
Expected: 404 on `/suggest-controls` and `/generate-report` (routes not yet defined).

- [ ] **Step 3: Add `suggest_controls` and `generate_report` endpoints to `api/routers/risk_assessment.py`**

Also add `report_markdown: Optional[str] = None` and `suggested_controls: list[dict] = []` fields to the `RiskAssessment` model, a `set_suggested_controls` method and a `set_report` method to `MongoRiskAssessmentStore`, then append the two route handlers at the bottom of the file.

**Model changes** — update `RiskAssessment` and store in the existing file:

```python
# In class RiskAssessment (add two new fields):
class RiskAssessment(BaseModel):
    id: str
    title: str
    description: str
    status: StatusType
    asset_ids: list[str]
    responses: list[dict]
    risks: list[dict]
    applied_controls: list[dict]
    suggested_controls: list[dict] = []   # NEW
    report_markdown: Optional[str] = None  # NEW
    created_at: str
    updated_at: str
```

**Store methods** — add after `add_control`:

```python
def set_suggested_controls(self, ra_id: str, suggestions: list[dict]) -> bool:
    result = self._col.update_one(
        {"_id": ra_id},
        {"$set": {"suggested_controls": suggestions, "updated_at": datetime.utcnow().isoformat()}},
    )
    return result.modified_count == 1

def set_report(self, ra_id: str, markdown: str) -> bool:
    result = self._col.update_one(
        {"_id": ra_id},
        {"$set": {"report_markdown": markdown, "status": "complete", "updated_at": datetime.utcnow().isoformat()}},
    )
    return result.modified_count == 1
```

**New route handlers** — append at end of file:

```python
@router.post("/{ra_id}/suggest-controls")
def suggest_controls(ra_id: str):
    """Persona 6: Control Selector — rank library controls per risk finding."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain.schema import HumanMessage
    from utils.controls_library import MongoControlsStore
    import json as _json

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.risks:
        raise HTTPException(400, "No risks yet. Run /analyze first.")

    # Fetch library controls
    ctrl_store = MongoControlsStore()
    all_controls = ctrl_store.list()
    controls_summary = "\n".join(
        f"- [{c.id}] {c.title} (domain: {getattr(c, 'domain', 'General')}, quality: {getattr(c, 'quality_band', 'Unknown')})"
        for c in all_controls[:100]  # cap to avoid token overflow
    )

    risk_summary = "\n".join(
        f"- [{r['id']}] {r['title']} | category: {r['risk_category']} | band: {r['inherent_risk_band']}"
        for r in ra.risks
    )

    prompt = f"""You are a control selection specialist for technology risk treatment (Persona 6).

Select and rank controls ONLY from the provided master controls library for each identified risk.
Do not recommend controls outside the provided library.
If a relevant control has high or critical known issues, call that out.

Risks identified:
{risk_summary}

Available controls library (id | title | domain | quality):
{controls_summary}

For each risk, return up to 3 ranked control suggestions.
Return ONLY a valid JSON array, no markdown.
Each element: {{"risk_id": "...", "control_id": "...", "control_title": "...", "rationale": "...", "relevance_score": 1-5}}"""

    try:
        llm = ChatGoogleGenerativeAI(
            model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash"),
            google_api_key=os.environ.get("GOOGLE_API_KEY"),
            temperature=0.1,
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        suggestions = _json.loads(content)
    except Exception as e:
        logger.error(f"Control suggestion LLM failed for {ra_id}: {e}")
        suggestions = []

    get_store().set_suggested_controls(ra_id, suggestions)
    return {"assessment_id": ra_id, "suggestions": suggestions}


@router.post("/{ra_id}/generate-report")
def generate_report(ra_id: str):
    """Persona 7: Assessment Report Writer — produce 9-section risk assessment report."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain.schema import HumanMessage
    from api.routers.assets import get_store as get_asset_store

    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.risks:
        raise HTTPException(400, "No risks identified. Run /analyze first.")

    asset_store = get_asset_store()
    app_names = []
    for aid in ra.asset_ids:
        a = asset_store.get(aid)
        app_names.append(a.name if a else aid)

    risk_text = "\n".join(
        f"- {r['title']} | {r['risk_category']} | {r['inherent_risk_band']} | {r.get('human_rationale', '')}"
        for r in ra.risks
    )
    control_text = "\n".join(
        f"- Risk {s['risk_id']}: Control {s['control_id']} — {s['control_title']} (relevance {s['relevance_score']}/5)"
        for s in (ra.suggested_controls or [])
    ) or "No control suggestions generated yet."

    prompt = f"""You are an assessment report writer for technology risk and audit audiences (Persona 7).

Produce a professional Risk Assessment Report using only the provided data.
Follow the required report structure exactly — do not add extra sections.
Keep language professional, direct, and suitable for technology, information-security, and audit personnel.
Do not invent unsupported conclusions. State uncertainty where evidence is limited.

Assessment: {ra.title}
Description: {ra.description}
Applications in scope: {', '.join(app_names)}
Total responses: {len(ra.responses)}
Risks identified: {len(ra.risks)}

Risk findings:
{risk_text}

Suggested controls:
{control_text}

Required report structure (produce each section as a markdown heading):
1. Report Header
2. Executive Summary
3. Assessment Scope
4. Assessment Method
5. Evidence Summary
6. Application-by-Application Findings
7. Cross-Application Risk Themes
8. Prioritized Remediation Themes
9. Issues Affecting Suggested Controls

Return the full report as markdown only."""

    try:
        llm = ChatGoogleGenerativeAI(
            model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash"),
            google_api_key=os.environ.get("GOOGLE_API_KEY"),
            temperature=0.3,
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        report_md = response.content.strip()
    except Exception as e:
        logger.error(f"Report generation failed for {ra_id}: {e}")
        report_md = f"# Risk Assessment Report\n\n**Report generation failed:** {e}\n\nPlease retry."

    get_store().set_report(ra_id, report_md)
    return {"assessment_id": ra_id, "report_markdown": report_md}


@router.get("/{ra_id}/report")
def get_report(ra_id: str):
    ra = get_store().get(ra_id)
    if not ra:
        raise HTTPException(404, "Assessment not found")
    if not ra.report_markdown:
        raise HTTPException(404, "No report generated yet. Call POST /{ra_id}/generate-report first.")
    return {"assessment_id": ra_id, "report_markdown": ra.report_markdown}
```

- [ ] **Step 4: Run all tests**

```
python -m pytest tests/test_risk_assessment_api.py -v
```
Expected: all 9 tests PASS.

- [ ] **Step 5: Run full suite**

```
python -m pytest tests/ -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routers/risk_assessment.py tests/test_risk_assessment_api.py
git commit -m "feat: add suggest-controls (§6.8) and generate-report (§6.9) endpoints (SP3 T5)"
```

---

## Task 6: Wire control suggestion + report into Context and page

**Files:**
- Modify: `kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx` — add `suggestControls`, `generateReport`, `report`
- Modify: `kpmg_ui/client/src/pages/risk-assessment.tsx` — add Step 3.5 (Suggest Controls) and Step 5 (Report) to wizard

- [ ] **Step 1: Update `RiskAssessmentContext.tsx`**

Add to the `RiskAssessment` interface:

```typescript
suggested_controls: SuggestedControl[];
report_markdown: string | null;
```

Add a new interface before `RiskAssessment`:

```typescript
export interface SuggestedControl {
  risk_id: string;
  control_id: string;
  control_title: string;
  rationale: string;
  relevance_score: number;
}
```

Add to the `Ctx` interface:

```typescript
isGeneratingReport: boolean;
suggestControls: (raId: string) => Promise<void>;
generateReport: (raId: string) => Promise<void>;
report: string | null;
```

Add state in the provider:

```typescript
const [isGeneratingReport, setIsGeneratingReport] = useState(false);
const [report, setReport] = useState<string | null>(null);
```

Add callbacks in the provider:

```typescript
const suggestControls = useCallback(async (raId: string): Promise<void> => {
  const r = await fetch(`/api/risk-assessment/${raId}/suggest-controls`, { method: "POST" });
  if (!r.ok) throw new Error("Failed to suggest controls");
  const data = await r.json();
  if (selectedAssessment?.id === raId) {
    setSelectedAssessment(prev => prev ? { ...prev, suggested_controls: data.suggestions } : prev);
  }
}, [selectedAssessment]);

const generateReport = useCallback(async (raId: string): Promise<void> => {
  setIsGeneratingReport(true);
  try {
    const r = await fetch(`/api/risk-assessment/${raId}/generate-report`, { method: "POST" });
    if (!r.ok) throw new Error("Failed to generate report");
    const data = await r.json();
    setReport(data.report_markdown ?? null);
  } catch (e: any) {
    setError(e.message);
  } finally {
    setIsGeneratingReport(false);
  }
}, []);
```

Include in the `RiskAssessmentContext.Provider value`:

```typescript
isGeneratingReport, suggestControls, generateReport, report,
```

- [ ] **Step 2: Update `risk-assessment.tsx`**

Change `WIZARD_STEPS` to:

```typescript
const WIZARD_STEPS = ["Create", "Questionnaire", "Analyse", "Risks", "Controls", "Report"];
```

Destructure the two new items from `useRiskAssessment()`:

```typescript
isGeneratingReport, suggestControls, generateReport, report,
```

After the **Step 3 (Risks)** block (`wizardStep === 3`), add a **Step 4 (Controls)** block:

```tsx
{/* Step 4: Suggested Controls */}
{wizardStep === 4 && (
  <div className="space-y-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold text-slate-800">Suggested Controls</h3>
      <Button size="sm" onClick={async () => {
        try { await suggestControls(selectedAssessment.id); toast({ title: "Controls suggested" }); }
        catch { toast({ title: "Failed", variant: "destructive" }); }
      }}>
        <Sparkles className="w-4 h-4 mr-1" />Suggest Controls
      </Button>
    </div>
    {(selectedAssessment.suggested_controls ?? []).length === 0 && (
      <p className="text-slate-400 text-sm">Click "Suggest Controls" to rank controls from the library against your risks.</p>
    )}
    {(selectedAssessment.suggested_controls ?? []).map((s, i) => (
      <Card key={i}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">{s.control_title}</p>
              <p className="text-xs text-slate-500 mt-1">{s.rationale}</p>
            </div>
            <Badge variant="outline" className="text-xs">Relevance {s.relevance_score}/5</Badge>
          </div>
        </CardContent>
      </Card>
    ))}
    <Button onClick={() => setWizardStep(5)}>
      Proceed to Report <ChevronRight className="w-4 h-4 ml-1" />
    </Button>
  </div>
)}
```

Change the **Step 4 (Residual)** block to `wizardStep === 5` for **Report**, replace its content:

```tsx
{/* Step 5: Report */}
{wizardStep === 5 && (
  <div className="space-y-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold text-slate-800">Risk Assessment Report</h3>
      <Button size="sm" onClick={async () => {
        try { await generateReport(selectedAssessment.id); toast({ title: "Report generated" }); }
        catch { toast({ title: "Report failed", variant: "destructive" }); }
      }} disabled={isGeneratingReport}>
        {isGeneratingReport ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileBarChart className="w-4 h-4 mr-1" />}
        Generate Report
      </Button>
    </div>
    {report ? (
      <Card>
        <CardContent className="pt-4">
          <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono leading-relaxed">{report}</pre>
        </CardContent>
      </Card>
    ) : (
      <p className="text-slate-400 text-sm">Click "Generate Report" to produce the 9-section Risk Assessment Report.</p>
    )}
  </div>
)}
```

Also update the Residual step (now Step 4, mapped from old Step 4) to be `wizardStep === 3` still via the Risks view having a "View Residual" button that calls `fetchResidual` and stays on step 3 (not a separate wizard step). Remove the old Step 4 Residual block since the wizard now has 6 steps (0–5) and Residual is embedded in the Risks step.

Actually, keep it simpler: add Residual as a sub-tab within the Risks step by adding a toggle. This avoids reshuffling the 0-based step indices dramatically.

Simpler approach: keep the old 5-step wizard (steps 0–4 covering Create/Q/Analyse/Risks/Residual) and add two more steps at indices 5 (Controls) and 6 (Report). Update `WIZARD_STEPS` to 7 items. Adjust the "View Residual" button in step 3 to advance to step 4, Controls button in step 4 to advance to step 5, and Report button in step 5 to advance to step 6.

```typescript
const WIZARD_STEPS = ["Create", "Questionnaire", "Analyse", "Risks", "Residual", "Controls", "Report"];
```

The Residual block stays at `wizardStep === 4`, Controls at `wizardStep === 5`, Report at `wizardStep === 6`. Add forward buttons between each:
- Step 3 (Risks): "View Residual" button calls `fetchResidual` + `setWizardStep(4)`
- Step 4 (Residual): Add "Suggest Controls" button → `setWizardStep(5)`
- Step 5 (Controls): "Proceed to Report" button → `setWizardStep(6)`

- [ ] **Step 3: Run TypeScript type check**

```
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui"
npm run check
```
Expected: 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx kpmg_ui/client/src/pages/risk-assessment.tsx
git commit -m "feat: wire control suggestion + report generation into frontend (SP3 T6)"
```

---

## Self-Review

**Spec coverage:**
- §6.1 Application-only scope ✅ (create form filters by `asset_type === "Application"`)
- §6.2 Assessment creation flow ✅ (name + description + assessor implicit + asset selection)
- §6.3 Linked Asset behavior ✅ (`asset_ids` links to Asset Registry; `analyze_assessment` fetches metadata)
- §6.4 Ad hoc application ❌ — deferred; all applications must be pre-registered in Asset Registry (noted for future work)
- §6.5 yes/no questions + free-text ✅ (`answer: "yes"|"no"|"na"` + `details` field per question)
- §6.6 8 sections ✅ (all 8 sections implemented with 5 questions each)
- §6.7 Hybrid scoring — rule layer + LLM ✅ (`_rule_layer_scores` + Gemini Persona 5 prompt)
- §6.8 Suggested controls from library ✅ (Task 5 — Persona 6 Control Selector, library-only)
- §6.9 9-section report ✅ (Task 5 — Persona 7 Report Writer, locked section structure)
- §9.9 Separate personas ✅ (Persona 5 in `analyze_assessment`, Persona 6 in `suggest_controls`, Persona 7 in `generate_report`)

**Placeholder scan:** No TBDs, no TODOs, all code blocks complete.

**Type consistency:**
- `AnswerType = "yes" | "no" | "na"` — consistent across router, context, page
- `SuggestedControl` interface matches `suggested_controls` list shape from backend
- `report_markdown: string | null` consistent between backend response and context state
- `RiskAssessment.suggested_controls: list[dict]` (backend) / `SuggestedControl[]` (frontend) — shape-compatible

**Ad-hoc applications** (§6.4): Not implemented — requires separate Pydantic model + frontend form. Deferred.

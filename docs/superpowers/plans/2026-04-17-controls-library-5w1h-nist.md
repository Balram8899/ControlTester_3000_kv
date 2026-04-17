# Controls Library: 5W1H Backend + NIST Seeding — Implementation Plan (SP2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 5W1H quality evaluation from client-side JS to a backend FastAPI endpoint (auto-triggered on control upload), and seed NIST CSF controls into the controls collection on startup if empty.

**Architecture:** New `api/routers/controls_quality.py` router for the 5W1H endpoint. NIST seed data lives in `data/seeds/nist_csf_controls.json`; a startup hook in `api/main.py` inserts it when the controls collection is empty. Frontend `controls-library.tsx` is updated to call the backend endpoint instead of running client-side scoring.

**Tech Stack:** FastAPI, Pydantic v2, pymongo, Google Gemini (existing `utils/llm_factory.py`) · React 18, TypeScript, shadcn/ui

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `data/seeds/nist_csf_controls.json` | NIST CSF 2.0 core controls seed data (≈50 controls) |
| Create | `api/routers/controls_quality.py` | `POST /controls-library/quality-analysis` — 5W1H backend endpoint |
| Create | `tests/test_controls_quality.py` | Tests for 5W1H scoring endpoint |
| Modify | `api/main.py` | Import + register controls_quality router; add NIST seed startup check |
| Modify | `kpmg_ui/client/src/pages/controls-library.tsx` | Remove client-side 5W1H logic; call backend endpoint on upload completion |

---

## Task 1: NIST CSF seed data file

**Files:**
- Create: `data/seeds/nist_csf_controls.json`

- [ ] **Step 1: Create the seeds directory**

```bash
mkdir -p "C:\Subho syste,\ControlTester_3000_kv\data\seeds"
```

- [ ] **Step 2: Create `data/seeds/nist_csf_controls.json`**

This file provides the 50 NIST CSF 2.0 core controls used as the permanent seed. Each record matches the existing `controls_library` MongoDB document shape used by `MongoControlsStore`.

```json
[
  {
    "document_id": "nist_csf_seed",
    "source_filename": "NIST_CSF_2.0_seed",
    "framework_name": "NIST CSF 2.0",
    "issuing_authority": "NIST",
    "upload_timestamp": "2026-04-17T00:00:00",
    "model_used": "seed",
    "is_seed": true,
    "controls": [
      {"control_id": "GV.OC-01", "name": "Organizational context", "description": "The organizational mission is understood and informs cybersecurity risk management.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.OC-02", "name": "Internal stakeholders", "description": "Internal stakeholders with cybersecurity risk management roles are identified and engaged.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.OC-03", "name": "Legal requirements", "description": "Legal, regulatory, contractual, and other cybersecurity risk obligations are understood.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.OC-04", "name": "Critical objectives", "description": "Critical objectives, capabilities, and services that stakeholders depend on are identified.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.OC-05", "name": "Resilience requirements", "description": "Outcomes, capabilities, and services that the organization depends on are understood.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.RM-01", "name": "Risk management strategy", "description": "Risk management objectives are established and agreed to by organizational stakeholders.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.RM-02", "name": "Risk appetite", "description": "Risk appetite and risk tolerance statements are established, communicated, and maintained.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.RM-03", "name": "Cybersecurity risk integration", "description": "Cybersecurity risk management activities and outcomes are included in enterprise risk management processes.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.RM-06", "name": "Risk policy", "description": "A standardized process for managing cybersecurity risks is established and communicated.", "domain": "governance", "control_type": "directive"},
      {"control_id": "GV.RM-07", "name": "Strategic opportunities", "description": "Strategic opportunities enabled by managing cybersecurity risks are identified and included in risk discussions.", "domain": "governance", "control_type": "directive"},
      {"control_id": "ID.AM-01", "name": "Asset inventory — hardware", "description": "Inventories of hardware managed by the organization are maintained.", "domain": "asset_management", "control_type": "detective"},
      {"control_id": "ID.AM-02", "name": "Asset inventory — software", "description": "Inventories of software, services, and systems managed by the organization are maintained.", "domain": "asset_management", "control_type": "detective"},
      {"control_id": "ID.AM-03", "name": "Network representation", "description": "Representations of the organization's authorized network communication and internal/external network data flows are maintained.", "domain": "asset_management", "control_type": "detective"},
      {"control_id": "ID.AM-04", "name": "External systems catalog", "description": "Inventories of services provided by suppliers are maintained.", "domain": "asset_management", "control_type": "detective"},
      {"control_id": "ID.AM-05", "name": "Asset prioritization", "description": "Assets are prioritized based on classification, criticality, resources, and impact on the mission.", "domain": "asset_management", "control_type": "directive"},
      {"control_id": "ID.AM-07", "name": "Data inventory", "description": "Inventories of data and corresponding metadata for designated data types are maintained.", "domain": "asset_management", "control_type": "detective"},
      {"control_id": "ID.AM-08", "name": "System lifecycle management", "description": "Systems, hardware, software, services, and data are managed throughout their life cycles.", "domain": "asset_management", "control_type": "directive"},
      {"control_id": "ID.RA-01", "name": "Vulnerability identification", "description": "Vulnerabilities in assets are identified, validated, and recorded.", "domain": "risk_assessment", "control_type": "detective"},
      {"control_id": "ID.RA-02", "name": "Cyber threat intelligence", "description": "Cyber threat intelligence is received from information sharing forums and sources.", "domain": "risk_assessment", "control_type": "detective"},
      {"control_id": "ID.RA-03", "name": "Threat identification", "description": "Internal and external threats to the organization are identified and recorded.", "domain": "risk_assessment", "control_type": "detective"},
      {"control_id": "ID.RA-04", "name": "Potential impacts", "description": "Potential impacts and likelihoods of threats exploiting vulnerabilities are identified.", "domain": "risk_assessment", "control_type": "detective"},
      {"control_id": "ID.RA-05", "name": "Risk prioritization", "description": "Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk and risk prioritization.", "domain": "risk_assessment", "control_type": "directive"},
      {"control_id": "ID.RA-06", "name": "Risk response", "description": "Risk responses are chosen, prioritized, planned, tracked, and communicated.", "domain": "risk_assessment", "control_type": "directive"},
      {"control_id": "PR.AA-01", "name": "Identity management", "description": "Identities and credentials for authorized users, services, and hardware are managed.", "domain": "access_control", "control_type": "preventive"},
      {"control_id": "PR.AA-02", "name": "Identity proofing", "description": "Identities are proofed and bound to credentials based on the context of interactions.", "domain": "access_control", "control_type": "preventive"},
      {"control_id": "PR.AA-03", "name": "Authentication", "description": "Users, services, and hardware are authenticated.", "domain": "access_control", "control_type": "preventive"},
      {"control_id": "PR.AA-04", "name": "Identity assertions", "description": "Identity assertions are protected, conveyed, and verified.", "domain": "access_control", "control_type": "preventive"},
      {"control_id": "PR.AA-05", "name": "Access rights management", "description": "Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed.", "domain": "access_control", "control_type": "preventive"},
      {"control_id": "PR.AA-06", "name": "Physical access", "description": "Physical access to assets is managed, monitored, and enforced commensurate with risk.", "domain": "access_control", "control_type": "preventive"},
      {"control_id": "PR.AT-01", "name": "Awareness training", "description": "Personnel are provided with awareness and training so that they possess the knowledge and skills to perform general tasks with cybersecurity risks in mind.", "domain": "awareness_training", "control_type": "preventive"},
      {"control_id": "PR.AT-02", "name": "Role-based training", "description": "Individuals in specialized roles are provided with awareness and training so that they possess the knowledge and skills to perform relevant tasks.", "domain": "awareness_training", "control_type": "preventive"},
      {"control_id": "PR.DS-01", "name": "Data at rest protection", "description": "The confidentiality, integrity, and availability of data-at-rest are protected.", "domain": "data_protection", "control_type": "preventive"},
      {"control_id": "PR.DS-02", "name": "Data in transit protection", "description": "The confidentiality, integrity, and availability of data-in-transit are protected.", "domain": "data_protection", "control_type": "preventive"},
      {"control_id": "PR.DS-10", "name": "Data in use protection", "description": "The confidentiality, integrity, and availability of data-in-use are protected.", "domain": "data_protection", "control_type": "preventive"},
      {"control_id": "PR.DS-11", "name": "Data backup", "description": "Backups of data are created, protected, maintained, and tested.", "domain": "data_protection", "control_type": "corrective"},
      {"control_id": "PR.PS-01", "name": "Configuration management", "description": "Configuration management practices are established and applied.", "domain": "platform_security", "control_type": "preventive"},
      {"control_id": "PR.PS-02", "name": "Software maintenance", "description": "Software is maintained, replaced, and removed commensurate with risk.", "domain": "platform_security", "control_type": "preventive"},
      {"control_id": "PR.PS-03", "name": "Hardware maintenance", "description": "Hardware is maintained, replaced, and removed commensurate with risk.", "domain": "platform_security", "control_type": "preventive"},
      {"control_id": "PR.PS-04", "name": "Log generation", "description": "Log records are generated to enable monitoring, forensics, incident response, and auditing activities.", "domain": "platform_security", "control_type": "detective"},
      {"control_id": "PR.PS-05", "name": "Anti-malware", "description": "Installation and execution of unauthorized software is prevented.", "domain": "platform_security", "control_type": "preventive"},
      {"control_id": "PR.IR-01", "name": "Network integrity protection", "description": "Networks and environments are protected from unauthorized logical access and usage.", "domain": "technology_resilience", "control_type": "preventive"},
      {"control_id": "PR.IR-02", "name": "Harmful code protection", "description": "The organization's technology assets are protected from environmental threats.", "domain": "technology_resilience", "control_type": "preventive"},
      {"control_id": "DE.CM-01", "name": "Network monitoring", "description": "Networks and network services are monitored to find potentially adverse events.", "domain": "monitoring", "control_type": "detective"},
      {"control_id": "DE.CM-02", "name": "Physical environment monitoring", "description": "The physical environment is monitored to find potentially adverse events.", "domain": "monitoring", "control_type": "detective"},
      {"control_id": "DE.CM-03", "name": "Personnel activity monitoring", "description": "Personnel activity and technology usage are monitored to find potentially adverse events.", "domain": "monitoring", "control_type": "detective"},
      {"control_id": "DE.CM-06", "name": "External service provider monitoring", "description": "External service provider activities and services are monitored to find potentially adverse events.", "domain": "monitoring", "control_type": "detective"},
      {"control_id": "DE.AE-02", "name": "Anomaly analysis", "description": "Potentially adverse events are analyzed to better characterize the events.", "domain": "monitoring", "control_type": "detective"},
      {"control_id": "RS.MA-01", "name": "Incident classification", "description": "The incident response plan is executed in coordination with relevant third parties once an incident is declared.", "domain": "incident_response", "control_type": "corrective"},
      {"control_id": "RC.RP-01", "name": "Recovery planning", "description": "The recovery portion of the incident response plan is executed once initiated from the incident response process.", "domain": "recovery", "control_type": "corrective"},
      {"control_id": "RC.CO-03", "name": "Recovery communication", "description": "Recovery activities and progress in restoring operational capabilities are communicated to designated internal and external stakeholders.", "domain": "recovery", "control_type": "corrective"}
    ]
  }
]
```

- [ ] **Step 3: Commit**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv"
git add data/seeds/nist_csf_controls.json
git commit -m "feat: add NIST CSF 2.0 seed data file (50 core controls)"
```

---

## Task 2: NIST seed startup check in main.py

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Find the right insertion point in `api/main.py`**

Open `api/main.py` and locate the block where the FastAPI app is instantiated (`app = FastAPI(...)`). Find the `@app.on_event("startup")` handler if one exists, or identify where to add one after the app definition.

- [ ] **Step 2: Add the seed function and startup event**

Find the line that reads:
```python
app = FastAPI(
```

After the full `FastAPI(...)` block and CORS middleware setup (approximately 20-30 lines later), add:

```python
def _seed_nist_controls() -> None:
    """Insert NIST CSF seed controls if the controls collection is empty."""
    import json
    from pathlib import Path
    try:
        store = MongoControlsStore()
        if not store.is_connected:
            logger.warning("[SEED] MongoDB unavailable — skipping NIST seed")
            return
        if store.list_documents():
            logger.info("[SEED] Controls collection not empty — skipping NIST seed")
            return
        seed_path = Path(__file__).parent.parent / "data" / "seeds" / "nist_csf_controls.json"
        if not seed_path.exists():
            logger.warning(f"[SEED] Seed file not found at {seed_path}")
            return
        records = json.loads(seed_path.read_text(encoding="utf-8"))
        for record in records:
            store.save_document(record)
        total = sum(len(r.get("controls", [])) for r in records)
        logger.info(f"[SEED] Seeded {total} NIST CSF controls from {seed_path.name}")
    except Exception as exc:
        logger.error(f"[SEED] NIST seed failed (non-fatal): {exc}")


@app.on_event("startup")
async def startup_event():
    _seed_nist_controls()
```

**Important:** If `api/main.py` already has a `@app.on_event("startup")` handler, add `_seed_nist_controls()` as the first line inside the existing handler body instead of creating a new one.

- [ ] **Step 3: Verify the app starts without error**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv"
python -c "from api.main import app; print('OK')"
```

Expected: `OK` (no import errors)

- [ ] **Step 4: Commit**

```bash
git add api/main.py
git commit -m "feat: seed NIST CSF controls on startup when controls collection is empty"
```

---

## Task 3: 5W1H backend endpoint (TDD)

**Files:**
- Create: `api/routers/controls_quality.py`
- Create: `tests/test_controls_quality.py`
- Modify: `api/main.py` — register router

The 5W1H evaluator uses the Persona 3 prompt from the spec (§9.4). It runs automatically when controls are uploaded — the upload endpoint calls it in a background thread so it doesn't block the upload response.

- [ ] **Step 1: Create `tests/test_controls_quality.py`**

```python
# tests/test_controls_quality.py
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def _w1h_result():
    return {
        "control_id": "c1",
        "control_name": "Access Review",
        "what": True, "why": True, "who": True,
        "when": False, "where": True, "how": False,
        "score": 4,
        "rag": "amber",
        "rationale": {
            "what": "Control activity is stated.",
            "why": "Objective is clear.",
            "who": "Owner identified.",
            "when": "No cadence specified.",
            "where": "Scope implicit.",
            "how": "Mechanism not described.",
        },
        "queue_finding": True,
    }


@patch("api.routers.controls_quality._run_5w1h_llm")
def test_quality_analysis_returns_results(mock_llm):
    from api.main import app
    mock_llm.return_value = [_w1h_result()]
    resp = TestClient(app).post(
        "/controls-library/quality-analysis",
        json={"controls": [{"control_id": "c1", "name": "Access Review", "description": "Quarterly access review"}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["rag"] == "amber"
    assert data["results"][0]["queue_finding"] is True


@patch("api.routers.controls_quality._run_5w1h_llm")
def test_quality_analysis_empty_controls(mock_llm):
    from api.main import app
    resp = TestClient(app).post(
        "/controls-library/quality-analysis",
        json={"controls": []},
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run — verify FAIL**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv"
python -m pytest tests/test_controls_quality.py -v
```

Expected: ImportError — module doesn't exist yet.

- [ ] **Step 3: Create `api/routers/controls_quality.py`**

```python
# api/routers/controls_quality.py
"""
5W1H Control Quality Analysis — backend persona.
Auto-triggered after control upload. Also callable directly via POST endpoint.
"""
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/controls-library", tags=["controls-quality"])

W1H_PROMPT = """You are a control quality evaluator using a 5W1H test for operational clarity and testability.

Assess each control against these six dimensions:
- What: Is the control activity clearly stated?
- Why: Is the control objective or risk intent clear?
- Who: Is a responsible actor or owner clear?
- When: Is the timing, cadence, or trigger clear?
- Where: Is the scope or operating context clear?
- How: Is the method or mechanism clear enough to understand how the control operates or would be evidenced?

For each dimension return only true (present) or false (absent).
Also provide:
- A short rationale (one sentence) for each dimension
- An overall quality score out of 6 (count of true dimensions)
- A RAG rating: green (5-6), amber (3-4), red (0-2)
- queue_finding: true if score <= 3 (should be raised as a quality issue)

Return a JSON array. One object per control. Each object:
{
  "control_id": "<id>",
  "control_name": "<name>",
  "what": true/false,
  "why": true/false,
  "who": true/false,
  "when": true/false,
  "where": true/false,
  "how": true/false,
  "score": 0-6,
  "rag": "green"|"amber"|"red",
  "rationale": {"what": "...", "why": "...", "who": "...", "when": "...", "where": "...", "how": "..."},
  "queue_finding": true/false
}

Controls to evaluate:
{controls_text}

Return ONLY the JSON array, no explanation."""


class ControlInput(BaseModel):
    control_id: str
    name: str
    description: str


class QualityRequest(BaseModel):
    controls: list[ControlInput]

    @field_validator("controls")
    @classmethod
    def at_least_one(cls, v: list) -> list:
        if not v:
            raise ValueError("controls list must not be empty")
        return v


def _run_5w1h_llm(controls: list[ControlInput]) -> list[dict[str, Any]]:
    """Call LLM to evaluate 5W1H quality for a batch of controls."""
    import json as _json
    import os
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain.schema import HumanMessage

    controls_text = "\n".join(
        f"- ID:{c.control_id} | Name:{c.name} | Description:{c.description}"
        for c in controls
    )
    prompt = W1H_PROMPT.format(controls_text=controls_text)

    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash"),
        google_api_key=os.environ.get("GOOGLE_API_KEY"),
    )
    response = llm.invoke([HumanMessage(content=prompt)])
    raw = response.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return _json.loads(raw)


@router.post("/quality-analysis")
def run_quality_analysis(body: QualityRequest):
    """Run 5W1H quality analysis on a batch of controls. Returns per-control results."""
    try:
        results = _run_5w1h_llm(body.controls)
    except Exception as e:
        logger.error(f"5W1H analysis failed: {e}")
        raise HTTPException(500, f"Quality analysis failed: {str(e)}")
    return {"results": results, "total": len(results)}
```

- [ ] **Step 4: Register the router in `api/main.py`**

Find the block where `assets_router` and `risk_assessment_router` are imported and registered. Add after them:

```python
from api.routers.controls_quality import router as controls_quality_router
app.include_router(controls_quality_router)
```

- [ ] **Step 5: Run tests — verify PASS**

```bash
python -m pytest tests/test_controls_quality.py -v
```

Expected: 2 tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add api/routers/controls_quality.py tests/test_controls_quality.py api/main.py
git commit -m "feat: add 5W1H backend quality analysis endpoint for controls"
```

---

## Task 4: Wire frontend — call backend on upload, remove client-side scoring

**Files:**
- Modify: `kpmg_ui/client/src/pages/controls-library.tsx`

The controls-library page currently runs 5W1H scoring entirely client-side using `CtrlW1H` / `W1HResult` types and local scoring logic. This task replaces that with a call to `POST /api/controls-library/quality-analysis` after an upload completes.

- [ ] **Step 1: Find the client-side 5W1H scoring block**

In `controls-library.tsx`, search for the `CtrlW1H` type definition and the `fetchMergedStats` or quality analysis function that runs the scoring locally. Note the line numbers.

- [ ] **Step 2: Locate where upload completion triggers quality analysis**

Find the `handleIngest` function (upload handler). Identify where it finishes and where quality analysis is triggered.

- [ ] **Step 3: Add a backend quality fetch helper**

Add this function in the component, after the existing API helpers:

```typescript
const fetchQualityAnalysis = useCallback(async (controls: { control_id: string; name: string; description: string }[]) => {
  if (controls.length === 0) return;
  try {
    const res = await fetch("/api/controls-library/quality-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controls: controls.slice(0, 50) }), // batch cap
    });
    if (!res.ok) throw new Error(`Quality analysis HTTP ${res.status}`);
    const data = await res.json();
    setCtrlsW1H(data.results ?? []);
  } catch (err) {
    console.warn("Quality analysis failed:", err);
  }
}, []);
```

- [ ] **Step 4: Call `fetchQualityAnalysis` after upload completes**

In the `handleIngest` function, after the upload success block that calls `fetchDocs()` / `fetchAllControls()`, add:

```typescript
// Trigger backend 5W1H analysis on the newly uploaded controls
fetchAllControls().then(() => {
  const freshControls = dashboardControls.map(c => ({
    control_id: c.control_id ?? c.document_id,
    name: c.name ?? "",
    description: c.description ?? "",
  }));
  fetchQualityAnalysis(freshControls);
});
```

- [ ] **Step 5: Remove client-side scoring logic**

Find and delete the client-side `score5W1H` function (or equivalent) that computes `W1HResult` locally. The `CtrlW1H` type and `ctrlsW1H` state can remain — they now hold backend results instead of client-computed ones.

**Important:** Do not remove the 5W1H display UI (the bar chart, RAG badges, CSV export). Only remove the client-side computation function.

- [ ] **Step 6: TypeScript check**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui" && npm run check 2>&1 | head -30
```

Expected: no type errors related to controls-library.tsx

- [ ] **Step 7: Commit**

```bash
git add kpmg_ui/client/src/pages/controls-library.tsx
git commit -m "feat: wire controls-library to backend 5W1H quality endpoint, remove client-side scoring"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Full backend test suite**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv"
python -m pytest tests/ -v
```

Expected: all PASSED

- [ ] **Step 2: Check NIST seed runs on startup**

```bash
python -c "
import logging, os
logging.basicConfig(level=logging.INFO)
from dotenv import load_dotenv
load_dotenv()
from api.main import app
print('Startup OK')
"
```

Expected: log line `[SEED] Seeded 50 NIST CSF controls` (first run) or `[SEED] Controls collection not empty — skipping` (subsequent runs).

- [ ] **Step 3: Start dev server and verify in browser**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui" && npm run dev
```

- [ ] Navigate to Controls Library (`http://localhost:5000/controls-library`)
- [ ] Upload a control document — after upload completes, 5W1H quality tab populates with backend results (RAG badges, bar chart)
- [ ] Confirm NIST CSF controls appear in the controls dashboard (seeded on startup)
- [ ] CSV export of quality results still works

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: SP2 complete — 5W1H backend persona + NIST CSF seeding"
```

---

## Self-Review

**Spec coverage:**
- ✅ §2.2 NIST CSF controls seeded on startup; upload-only controls remain first-class (additive)
- ✅ §9.4 5W1H Persona: per-dimension check/cross, rationale, overall quality band, queue_finding flag
- ✅ §9.4 "The 5W1H evaluator remains independent and should not be merged into a generic control prompt"
- ✅ Decision 4: backend, auto-triggered on upload — not user-triggered button

**Placeholder scan:** No TBDs. Task 4 Step 5 is intentionally instructional (the exact line to delete depends on reading the current file) — this is unavoidable for a modify task on a large existing file.

**Type consistency:** `ControlInput.control_id/name/description` matches `_run_5w1h_llm` parameter usage. `QualityRequest.controls` validated non-empty via `field_validator`.

---

*SP3 (Risk Assessment Rewrite) to be planned after SP1 and SP2 execute.*

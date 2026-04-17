# Asset Registry Rewrite — Implementation Plan (SP1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old categorical CIA model and IT/Data/Process/Vendor asset types with the new numeric 1-5 CIA scoring model, new asset type taxonomy, and updated field set, removing `assessment_periodicity` and `next_assessment_due` entirely.

**Architecture:** Pure rewrite of existing modules — `utils/risk_scorer.py`, `api/routers/assets.py`, their tests, and the three frontend files (context, widget, page). A minimal compatibility patch to `api/routers/risk_assessment.py` prevents breakage until SP3 rewrites it. MongoDB collection is dropped and recreated — no migration needed (dev environment).

**Tech Stack:** Python 3.11, FastAPI, Pydantic v2, pymongo, pytest · React 18, TypeScript, shadcn/ui, wouter, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Rewrite | `utils/risk_scorer.py` | `compute_cia_total`, `compute_cia_band`; keep `compute_criticality` as SP3 shim |
| Rewrite | `tests/test_risk_scorer.py` | Tests for new numeric CIA model |
| Rewrite | `api/routers/assets.py` | `AssetCreate`, `AssetUpdate`, `Asset` models; `MongoAssetStore`; CRUD + suggest-controls endpoints |
| Rewrite | `tests/test_assets_api.py` | Tests for new models and endpoints |
| Patch | `api/routers/risk_assessment.py` | Replace `asset.cia_score` ref; keep `compute_criticality` import working |
| Rewrite | `kpmg_ui/client/src/components/CiaRatingWidget.tsx` | Numeric 1-5 buttons per CIA dimension |
| Rewrite | `kpmg_ui/client/src/contexts/AssetRegistryContext.tsx` | TypeScript types matching new backend schema |
| Rewrite | `kpmg_ui/client/src/pages/asset-registry.tsx` | Updated UI: new types, conditional Hosting Type, numeric CIA display |

---

## Task 1: Rewrite risk_scorer.py (TDD)

**Files:**
- Rewrite: `utils/risk_scorer.py`
- Rewrite: `tests/test_risk_scorer.py`

- [ ] **Step 1: Overwrite test file with new tests**

```python
# tests/test_risk_scorer.py
import pytest
from utils.risk_scorer import compute_cia_total, compute_cia_band, compute_criticality


# ── compute_cia_total ──────────────────────────────────────────────────────

def test_cia_total_max():
    assert compute_cia_total(5, 5, 5) == 15

def test_cia_total_min():
    assert compute_cia_total(1, 1, 1) == 3

def test_cia_total_mixed():
    assert compute_cia_total(5, 3, 2) == 10

def test_cia_total_is_simple_sum():
    assert compute_cia_total(2, 4, 3) == 9


# ── compute_cia_band ───────────────────────────────────────────────────────

def test_cia_band_low_boundaries():
    assert compute_cia_band(3) == "Low"
    assert compute_cia_band(5) == "Low"

def test_cia_band_medium_boundaries():
    assert compute_cia_band(6) == "Medium"
    assert compute_cia_band(8) == "Medium"

def test_cia_band_high_boundaries():
    assert compute_cia_band(9) == "High"
    assert compute_cia_band(11) == "High"

def test_cia_band_critical_boundaries():
    assert compute_cia_band(12) == "Critical"
    assert compute_cia_band(15) == "Critical"

def test_cia_band_out_of_range_high():
    with pytest.raises(ValueError):
        compute_cia_band(16)

def test_cia_band_out_of_range_low():
    with pytest.raises(ValueError):
        compute_cia_band(2)


# ── compute_criticality (SP3 shim — existing callers) ─────────────────────

def test_compute_criticality_shim_still_works():
    # risk_assessment.py imports this until SP3 rewrites it
    assert compute_criticality(4.5) == "Critical"
    assert compute_criticality(3.5) == "High"
    assert compute_criticality(2.5) == "Medium"
    assert compute_criticality(1.5) == "Low"
```

- [ ] **Step 2: Run — verify FAIL**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv"
python -m pytest tests/test_risk_scorer.py -v
```

Expected: `ImportError: cannot import name 'compute_cia_total'`

- [ ] **Step 3: Overwrite `utils/risk_scorer.py`**

```python
# utils/risk_scorer.py
"""
CIA scoring utilities.

New model (SP1): numeric 1-5 per dimension, total 3-15, banded.
compute_criticality is kept as a compatibility shim for risk_assessment.py
until SP3 replaces it.
"""

CIA_BAND_THRESHOLDS: list[tuple[int, int, str]] = [
    (3,  5,  "Low"),
    (6,  8,  "Medium"),
    (9,  11, "High"),
    (12, 15, "Critical"),
]

# SP3 shim — kept for risk_assessment.py import compatibility
_CRITICALITY_BANDS: list[tuple[float, float, str]] = [
    (0.0,   2.222, "Low"),
    (2.222, 3.333, "Medium"),
    (3.333, 4.444, "High"),
    (4.444, 5.001, "Critical"),
]


def compute_cia_total(confidentiality: int, integrity: int, availability: int) -> int:
    """Sum three 1-5 CIA scores. Returns 3-15."""
    return confidentiality + integrity + availability


def compute_cia_band(total: int) -> str:
    """Map CIA total (3-15) to a band label."""
    for low, high, label in CIA_BAND_THRESHOLDS:
        if low <= total <= high:
            return label
    raise ValueError(f"CIA total {total} is out of valid range 3-15")


def compute_criticality(cia_score: float) -> str:
    """SP3 compatibility shim. Maps old 1-5 float score to a band. Remove in SP3."""
    for low, high, label in _CRITICALITY_BANDS:
        if low <= cia_score < high:
            return label
    return "Critical"
```

- [ ] **Step 4: Run — verify PASS**

```bash
python -m pytest tests/test_risk_scorer.py -v
```

Expected: 13 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add utils/risk_scorer.py tests/test_risk_scorer.py
git commit -m "feat: rewrite CIA scoring to numeric 1-5 model (3-15 total, banded)"
```

---

## Task 2: Rewrite Asset models + MongoAssetStore (TDD)

**Files:**
- Rewrite: `api/routers/assets.py` (models + store only; routes added in Task 3)
- Rewrite: `tests/test_assets_api.py`

- [ ] **Step 1: Overwrite `tests/test_assets_api.py` with model tests**

```python
# tests/test_assets_api.py
import pytest
from api.routers.assets import AssetCreate, Asset
from utils.risk_scorer import compute_cia_total, compute_cia_band


# ── Model validation ───────────────────────────────────────────────────────

def test_asset_create_application_gets_default_hosting_type():
    a = AssetCreate(
        name="Payments API", description="Handles payment transactions",
        use="Process card payments", asset_type="Application",
        support_type="Vendor", owner="Alice", custodian="Bob",
        location="Cloud", jurisdiction="EU",
        classification="Confidential",
        confidentiality_score=5, integrity_score=5, availability_score=4,
    )
    assert a.hosting_type == "Unspecified"


def test_asset_create_non_application_hosting_type_nulled():
    a = AssetCreate(
        name="Core Switch", description="Network switch",
        use="Route internal traffic", asset_type="Hardware",
        support_type="Company", owner="Alice", custodian="Bob",
        location="HQ DC", jurisdiction="India",
        classification="Internal",
        confidentiality_score=2, integrity_score=3, availability_score=5,
        hosting_type="PaaS",   # should be ignored and set to None
    )
    assert a.hosting_type is None


def test_asset_create_explicit_hosting_type_kept():
    a = AssetCreate(
        name="CRM App", description="Customer CRM",
        use="Manage customer relationships", asset_type="Application",
        support_type="Vendor", owner="Alice", custodian="Bob",
        location="Cloud", jurisdiction="EU",
        classification="Confidential",
        confidentiality_score=3, integrity_score=3, availability_score=3,
        hosting_type="SaaS",
    )
    assert a.hosting_type == "SaaS"


def test_asset_create_cia_score_out_of_range():
    with pytest.raises(Exception):
        AssetCreate(
            name="Test", description="desc", use="use",
            asset_type="Database", support_type="Company",
            owner="A", custodian="B", location="DC",
            jurisdiction="US", classification="Internal",
            confidentiality_score=6, integrity_score=1, availability_score=1,
        )


def test_cia_total_and_band_computed_correctly():
    total = compute_cia_total(5, 5, 4)
    assert total == 14
    assert compute_cia_band(total) == "Critical"

    total2 = compute_cia_total(2, 2, 2)
    assert total2 == 6
    assert compute_cia_band(total2) == "Medium"
```

- [ ] **Step 2: Run — verify FAIL**

```bash
python -m pytest tests/test_assets_api.py -v -k "not endpoint"
```

Expected: `ImportError` — `AssetCreate` doesn't have the new fields yet

- [ ] **Step 3: Overwrite `api/routers/assets.py`** (models + store; routes come in Task 3)

```python
# api/routers/assets.py
import os
import uuid
import logging
from datetime import datetime
from typing import Any, Literal, Optional

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from utils.risk_scorer import compute_cia_total, compute_cia_band
from utils.controls_library import MongoControlsStore
from utils.regulatory_library import MongoLibraryStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assets", tags=["assets"])

# ── Enum literals ─────────────────────────────────────────────────────────

AssetType = Literal[
    "Application", "Hardware", "Database", "Interface/API",
    "Network Component", "Desktop/Client Software", "Other",
]
HostingType = Literal[
    "PaaS", "IaaS", "SaaS", "Internally Hosted",
    "Desktop/Client Software", "Not Hosted", "Unspecified",
]
SupportType = Literal["Company", "Vendor", "Business"]
StatusType = Literal[
    "Operational", "Build in Progress", "Planned Decommissioning",
    "Decommissioned", "Archived",
]
ClassType = Literal["Public", "Internal", "Confidential", "Restricted"]
CIABand = Literal["Low", "Medium", "High", "Critical"]


# ── Pydantic models ───────────────────────────────────────────────────────

class AssetCreate(BaseModel):
    name: str
    description: str
    use: str
    asset_type: AssetType
    hosting_type: Optional[HostingType] = None
    support_type: SupportType
    status: StatusType = "Operational"
    owner: str
    custodian: str
    location: str
    jurisdiction: str
    classification: ClassType
    confidentiality_score: int  # 1-5
    integrity_score: int        # 1-5
    availability_score: int     # 1-5

    @model_validator(mode="after")
    def _validate_fields(self) -> "AssetCreate":
        # CIA scores must be 1-5
        for field in ("confidentiality_score", "integrity_score", "availability_score"):
            v = getattr(self, field)
            if not (1 <= v <= 5):
                raise ValueError(f"{field} must be between 1 and 5, got {v}")
        # Hosting Type: required only for Application, null for all others
        if self.asset_type == "Application":
            if self.hosting_type is None:
                self.hosting_type = "Unspecified"
        else:
            self.hosting_type = None
        return self


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    use: Optional[str] = None
    asset_type: Optional[AssetType] = None
    hosting_type: Optional[HostingType] = None
    support_type: Optional[SupportType] = None
    status: Optional[StatusType] = None
    owner: Optional[str] = None
    custodian: Optional[str] = None
    location: Optional[str] = None
    jurisdiction: Optional[str] = None
    classification: Optional[ClassType] = None
    confidentiality_score: Optional[int] = None
    integrity_score: Optional[int] = None
    availability_score: Optional[int] = None

    @model_validator(mode="after")
    def _validate_cia(self) -> "AssetUpdate":
        for field in ("confidentiality_score", "integrity_score", "availability_score"):
            v = getattr(self, field)
            if v is not None and not (1 <= v <= 5):
                raise ValueError(f"{field} must be between 1 and 5, got {v}")
        return self


class Asset(AssetCreate):
    id: str
    cia_total: int
    cia_band: CIABand
    created_at: str
    updated_at: str


# ── MongoDB store ─────────────────────────────────────────────────────────

class MongoAssetStore:
    def __init__(self, mongo_uri: str | None = None):
        uri = mongo_uri or os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri)
        self.db = self.client["trace_db"]
        self.col = self.db["assets"]
        self.col.create_index("name")
        self.col.create_index("asset_type")
        self.col.create_index("cia_band")
        self.col.create_index("status")

    def _enrich(self, d: dict) -> dict:
        total = compute_cia_total(
            d["confidentiality_score"], d["integrity_score"], d["availability_score"]
        )
        d["cia_total"] = total
        d["cia_band"] = compute_cia_band(total)
        return d

    def _to_asset(self, doc: dict) -> Asset:
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id"))
        return Asset(**doc)

    def create(self, data: AssetCreate) -> Asset:
        now = datetime.utcnow().isoformat()
        doc = self._enrich(data.model_dump())
        doc.update(id=str(uuid.uuid4()), created_at=now, updated_at=now)
        self.col.insert_one({**doc, "_id": doc["id"]})
        return Asset(**doc)

    def list(
        self,
        asset_type_f: str | None = None,
        band_f: str | None = None,
        status_f: str | None = None,
    ) -> list[Asset]:
        q: dict[str, Any] = {}
        if asset_type_f:
            q["asset_type"] = asset_type_f
        if band_f:
            q["cia_band"] = band_f
        if status_f:
            q["status"] = status_f
        return [self._to_asset(d) for d in self.col.find(q)]

    def get(self, asset_id: str) -> Asset | None:
        doc = self.col.find_one({"_id": asset_id})
        return self._to_asset(doc) if doc else None

    def update(self, asset_id: str, data: AssetUpdate) -> Asset | None:
        existing = self.col.find_one({"_id": asset_id})
        if not existing:
            return None
        merged = dict(existing)
        for k, v in data.model_dump().items():
            if v is not None:
                merged[k] = v
        # Re-validate hosting_type conditional after a possible asset_type change
        if merged.get("asset_type") != "Application":
            merged["hosting_type"] = None
        elif merged.get("hosting_type") is None:
            merged["hosting_type"] = "Unspecified"
        merged = self._enrich(merged)
        merged["updated_at"] = datetime.utcnow().isoformat()
        self.col.update_one({"_id": asset_id}, {"$set": merged})
        return self._to_asset(merged)

    def delete(self, asset_id: str) -> bool:
        return self.col.delete_one({"_id": asset_id}).deleted_count == 1


_store: MongoAssetStore | None = None


def get_store() -> MongoAssetStore:
    global _store
    if _store is None:
        _store = MongoAssetStore()
    return _store
```

- [ ] **Step 4: Run model tests — verify PASS**

```bash
python -m pytest tests/test_assets_api.py -v
```

Expected: 5 tests PASSED (endpoint tests don't exist yet — that's fine)

- [ ] **Step 5: Commit**

```bash
git add api/routers/assets.py tests/test_assets_api.py
git commit -m "feat: rewrite Asset models with numeric CIA 1-5, new type taxonomy, drop periodicity"
```

---

## Task 3: Rewrite CRUD route handlers

**Files:**
- Modify: `api/routers/assets.py` — append route handlers after `get_store()`

- [ ] **Step 1: Add failing endpoint tests** (append to `tests/test_assets_api.py`)

```python
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


def _asset_fixture(**overrides) -> Asset:
    base = dict(
        name="Payments API", description="Handles payments",
        use="Process card payments", asset_type="Application",
        hosting_type="SaaS", support_type="Vendor",
        status="Operational", owner="Alice", custodian="Bob",
        location="Cloud", jurisdiction="EU",
        classification="Confidential",
        confidentiality_score=5, integrity_score=5, availability_score=4,
        id="abc123", cia_total=14, cia_band="Critical",
        created_at="2026-04-17T00:00:00",
        updated_at="2026-04-17T00:00:00",
    )
    return Asset(**{**base, **overrides})


@patch("api.routers.assets.get_store")
def test_create_asset_returns_201(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.create.return_value = _asset_fixture()
    mock_get_store.return_value = mock
    resp = TestClient(app).post("/assets", json=dict(
        name="Payments API", description="Handles payments",
        use="Process card payments", asset_type="Application",
        support_type="Vendor", owner="Alice", custodian="Bob",
        location="Cloud", jurisdiction="EU",
        classification="Confidential",
        confidentiality_score=5, integrity_score=5, availability_score=4,
    ))
    assert resp.status_code == 201
    assert resp.json()["cia_band"] == "Critical"
    assert resp.json()["cia_total"] == 14


@patch("api.routers.assets.get_store")
def test_list_assets_returns_200(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.list.return_value = []
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/assets")
    assert resp.status_code == 200
    assert resp.json() == []


@patch("api.routers.assets.get_store")
def test_get_asset_404(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.get.return_value = None
    mock_get_store.return_value = mock
    resp = TestClient(app).get("/assets/nonexistent")
    assert resp.status_code == 404


@patch("api.routers.assets.get_store")
def test_delete_asset_204(mock_get_store):
    from api.main import app
    mock = MagicMock()
    mock.delete.return_value = True
    mock_get_store.return_value = mock
    resp = TestClient(app).delete("/assets/abc123")
    assert resp.status_code == 204
```

- [ ] **Step 2: Run — verify FAIL**

```bash
python -m pytest tests/test_assets_api.py::test_create_asset_returns_201 -v
```

Expected: 404 or 422 — routes not registered yet

- [ ] **Step 3: Append route handlers to `api/routers/assets.py`** (after `get_store()`)

```python
# ── Route handlers ────────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=Asset)
def create_asset(body: AssetCreate):
    return get_store().create(body)


@router.get("", response_model=list[Asset])
def list_assets(
    asset_type: str | None = None,
    cia_band: str | None = None,
    status: str | None = None,
):
    return get_store().list(asset_type, cia_band, status)


@router.get("/{asset_id}", response_model=Asset)
def get_asset(asset_id: str):
    asset = get_store().get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


@router.put("/{asset_id}", response_model=Asset)
def update_asset(asset_id: str, body: AssetUpdate):
    asset = get_store().update(asset_id, body)
    if not asset:
        raise HTTPException(404, "Asset not found")
    return asset


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: str):
    if not get_store().delete(asset_id):
        raise HTTPException(404, "Asset not found")


@router.post("/{asset_id}/suggest-controls")
def suggest_controls(asset_id: str):
    asset = get_store().get(asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    try:
        suggestions = _suggest_controls_llm(asset)
    except Exception as e:
        logger.error(f"Control suggestion failed: {e}")
        raise HTTPException(500, f"LLM suggestion failed: {str(e)}")
    return {"asset_id": asset_id, "suggestions": suggestions}
```

- [ ] **Step 4: Append `_suggest_controls_llm` before the route handlers in `api/routers/assets.py`**

Add this function immediately before the `# ── Route handlers ──` comment:

```python
def _suggest_controls_llm(asset: Asset) -> list[dict]:
    """Call LLM to suggest controls from all library sources."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain.schema import HumanMessage
    import json as _json

    all_controls: list[dict] = []

    try:
        for c in MongoControlsStore().collection.find(
            {}, {"_id": 1, "name": 1, "description": 1}
        ).limit(80):
            all_controls.append({
                "control_id": str(c["_id"]),
                "name": c.get("name", ""),
                "description": c.get("description", ""),
                "source": "controls_library",
            })
    except Exception as e:
        logger.warning(f"controls_library fetch failed: {e}")

    try:
        for r in MongoLibraryStore().collection.find(
            {}, {"_id": 1, "obligation": 1, "domain": 1, "framework_name": 1}
        ).limit(80):
            all_controls.append({
                "control_id": str(r["_id"]),
                "name": r.get("obligation", ""),
                "description": f"{r.get('framework_name', '')} — {r.get('domain', '')}",
                "source": "regulatory_library",
            })
    except Exception as e:
        logger.warning(f"regulatory_library fetch failed: {e}")

    if not all_controls:
        return []

    controls_text = "\n".join(
        f"- ID:{c['control_id']} | {c['name']} | {c['description']} | source:{c['source']}"
        for c in all_controls[:60]
    )

    prompt = f"""You are a cybersecurity risk expert. Select the most relevant controls for this asset.

Asset: {asset.name} | Type: {asset.asset_type} | Hosting: {asset.hosting_type or 'N/A'}
CIA Total: {asset.cia_total}/15 (Band: {asset.cia_band})
Use: {asset.use}
Jurisdiction: {asset.jurisdiction} | Classification: {asset.classification}

Controls available:
{controls_text}

Return a JSON array of up to 10 controls:
[{{"control_id": "...", "name": "...", "source": "...", "rationale": "one sentence"}}]
Return ONLY valid JSON, no explanation."""

    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash"),
        google_api_key=os.environ.get("GOOGLE_API_KEY"),
    )
    response = llm.invoke([HumanMessage(content=prompt)])
    return _json.loads(response.content)
```

- [ ] **Step 5: Run all asset tests — verify PASS**

```bash
python -m pytest tests/test_assets_api.py -v
```

Expected: 9 tests PASSED

- [ ] **Step 6: Commit**

```bash
git add api/routers/assets.py tests/test_assets_api.py
git commit -m "feat: add Asset CRUD endpoints and LLM control suggestion with new CIA model"
```

---

## Task 4: Compatibility patch — risk_assessment.py

**Files:**
- Patch: `api/routers/risk_assessment.py`

After SP1, `risk_assessment.py` references `asset.cia_score` (old field) which no longer exists on `Asset`. This task applies the minimum change to prevent a runtime crash. SP3 will fully rewrite the file.

- [ ] **Step 1: Find the broken reference**

```bash
grep -n "cia_score" "C:\Subho syste,\ControlTester_3000_kv\api\routers\risk_assessment.py"
```

Expected output: one or more lines containing `asset.cia_score` and `cia_score:.2f`

- [ ] **Step 2: Open `api/routers/risk_assessment.py` and find the analyze endpoint**

Locate the section inside `analyze_assessment` that reads:
```python
cia_score = asset.cia_score if asset else 3.0
```
and the f-string line:
```
CIA Score: {cia_score:.2f}/5.00
```

- [ ] **Step 3: Apply the patch**

Replace:
```python
        cia_score = asset.cia_score if asset else 3.0
```
with:
```python
        cia_total = asset.cia_total if asset else 9
        cia_band = asset.cia_band if asset else "Medium"
```

Replace the f-string line:
```
CIA Score: {cia_score:.2f}/5.00
```
with:
```
CIA Total: {cia_total}/15 (Band: {cia_band})
```

- [ ] **Step 4: Run the full test suite — verify no regressions**

```bash
python -m pytest tests/ -v
```

Expected: all PASSED — no references to `cia_score` remain

- [ ] **Step 5: Commit**

```bash
git add api/routers/risk_assessment.py
git commit -m "fix: update risk_assessment.py to use cia_total/cia_band after SP1 CIA model change"
```

---

## Task 5: Rewrite CiaRatingWidget

**Files:**
- Rewrite: `kpmg_ui/client/src/components/CiaRatingWidget.tsx`

- [ ] **Step 1: Overwrite the file**

```tsx
// kpmg_ui/client/src/components/CiaRatingWidget.tsx
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CIADimension = "confidentiality_score" | "integrity_score" | "availability_score";

const SCORE_STYLE: Record<number, string> = {
  1: "bg-emerald-100 border-emerald-400 text-emerald-700 font-semibold",
  2: "bg-lime-100    border-lime-400    text-lime-700    font-semibold",
  3: "bg-amber-100   border-amber-400   text-amber-700   font-semibold",
  4: "bg-orange-100  border-orange-400  text-orange-700  font-semibold",
  5: "bg-red-100     border-red-400     text-red-700     font-semibold",
};

const GUIDANCE: Record<string, Record<number, string>> = {
  Confidentiality: {
    1: "Public — disclosure causes no harm.",
    2: "Internal — limited disclosure impact.",
    3: "Sensitive — moderate disclosure impact.",
    4: "Confidential — significant harm if disclosed.",
    5: "Highly restricted — disclosure causes severe regulatory or reputational harm.",
  },
  Integrity: {
    1: "Corruption causes negligible disruption.",
    2: "Minor errors, easily corrected.",
    3: "Noticeable data errors with moderate impact.",
    4: "Significant corruption, difficult to recover.",
    5: "Corruption causes severe failures, fraud, or safety risk.",
  },
  Availability: {
    1: "Non-critical — outage tolerable.",
    2: "Low-priority — short outages acceptable.",
    3: "Moderate impact — SLA breach possible.",
    4: "High-priority — outage causes business disruption.",
    5: "Mission-critical — outage causes severe operational failure.",
  },
};

function CiaAxis({
  label,
  field,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  field: CIADimension;
  value: number;
  onChange: (field: CIADimension, value: number) => void;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 w-36">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-slate-400 hover:text-slate-600">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs" side="right">
            <p className="font-semibold mb-1">{label} — Score Guide</p>
            {([1, 2, 3, 4, 5] as const).map(n => (
              <p key={n}>
                <span className="font-medium">{n}:</span> {GUIDANCE[label][n]}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as const).map(n => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange(field, n)}
            className={`w-8 h-8 rounded border text-xs font-medium transition-all ${
              value === n
                ? SCORE_STYLE[n]
                : "border-slate-300 text-slate-500 hover:border-slate-400"
            } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-400 w-4">{value}</span>
    </div>
  );
}

export default function CiaRatingWidget({
  confidentiality_score,
  integrity_score,
  availability_score,
  onChange,
  readOnly = false,
}: {
  confidentiality_score: number;
  integrity_score: number;
  availability_score: number;
  onChange: (field: CIADimension, value: number) => void;
  readOnly?: boolean;
}) {
  const total = confidentiality_score + integrity_score + availability_score;
  const band =
    total <= 5  ? "Low" :
    total <= 8  ? "Medium" :
    total <= 11 ? "High" : "Critical";

  const bandColor =
    band === "Low"      ? "text-emerald-700 bg-emerald-100 border-emerald-300" :
    band === "Medium"   ? "text-amber-700   bg-amber-100   border-amber-300"   :
    band === "High"     ? "text-orange-700  bg-orange-100  border-orange-300"  :
                          "text-red-700     bg-red-100     border-red-300";

  return (
    <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CIA Rating</p>
        <div className={`text-xs px-2 py-0.5 rounded border font-semibold ${bandColor}`}>
          {total}/15 · {band}
        </div>
      </div>
      <CiaAxis label="Confidentiality" field="confidentiality_score" value={confidentiality_score} onChange={onChange} readOnly={readOnly} />
      <CiaAxis label="Integrity"       field="integrity_score"       value={integrity_score}       onChange={onChange} readOnly={readOnly} />
      <CiaAxis label="Availability"    field="availability_score"    value={availability_score}    onChange={onChange} readOnly={readOnly} />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui" && npm run check 2>&1 | head -30
```

Expected: no errors on `CiaRatingWidget.tsx`

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/components/CiaRatingWidget.tsx
git commit -m "feat: rewrite CiaRatingWidget with numeric 1-5 buttons and live CIA band display"
```

---

## Task 6: Rewrite AssetRegistryContext

**Files:**
- Rewrite: `kpmg_ui/client/src/contexts/AssetRegistryContext.tsx`

- [ ] **Step 1: Overwrite the file**

```tsx
// kpmg_ui/client/src/contexts/AssetRegistryContext.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type AssetType =
  | "Application" | "Hardware" | "Database" | "Interface/API"
  | "Network Component" | "Desktop/Client Software" | "Other";

export type HostingType =
  | "PaaS" | "IaaS" | "SaaS" | "Internally Hosted"
  | "Desktop/Client Software" | "Not Hosted" | "Unspecified";

export type SupportType = "Company" | "Vendor" | "Business";

export type StatusType =
  | "Operational" | "Build in Progress" | "Planned Decommissioning"
  | "Decommissioned" | "Archived";

export type ClassType = "Public" | "Internal" | "Confidential" | "Restricted";
export type CIABand = "Low" | "Medium" | "High" | "Critical";

export interface Asset {
  id: string;
  name: string;
  description: string;
  use: string;
  asset_type: AssetType;
  hosting_type: HostingType | null;
  support_type: SupportType;
  status: StatusType;
  owner: string;
  custodian: string;
  location: string;
  jurisdiction: string;
  classification: ClassType;
  confidentiality_score: number;
  integrity_score: number;
  availability_score: number;
  cia_total: number;
  cia_band: CIABand;
  created_at: string;
  updated_at: string;
}

export interface AssetCreate {
  name: string;
  description: string;
  use: string;
  asset_type: AssetType;
  hosting_type?: HostingType;
  support_type: SupportType;
  status?: StatusType;
  owner: string;
  custodian: string;
  location: string;
  jurisdiction: string;
  classification: ClassType;
  confidentiality_score: number;
  integrity_score: number;
  availability_score: number;
}

export interface ControlSuggestion {
  control_id: string;
  name: string;
  source: string;
  rationale: string;
}

interface Ctx {
  assets: Asset[];
  selectedAsset: Asset | null;
  isLoading: boolean;
  error: string | null;
  controlSuggestions: ControlSuggestion[];
  isSuggestingControls: boolean;
  fetchAssets: (filters?: { asset_type?: string; cia_band?: string; status?: string }) => Promise<void>;
  selectAsset: (a: Asset | null) => void;
  createAsset: (data: AssetCreate) => Promise<Asset>;
  updateAsset: (id: string, data: Partial<AssetCreate>) => Promise<Asset>;
  deleteAsset: (id: string) => Promise<void>;
  suggestControls: (assetId: string) => Promise<void>;
}

const AssetRegistryContext = createContext<Ctx | null>(null);

export function AssetRegistryProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlSuggestions, setControlSuggestions] = useState<ControlSuggestion[]>([]);
  const [isSuggestingControls, setIsSuggestingControls] = useState(false);

  const fetchAssets = useCallback(async (
    filters?: { asset_type?: string; cia_band?: string; status?: string }
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (filters?.asset_type) p.set("asset_type", filters.asset_type);
      if (filters?.cia_band)   p.set("cia_band",   filters.cia_band);
      if (filters?.status)     p.set("status",     filters.status);
      const r = await fetch(`/api/assets?${p}`);
      if (!r.ok) throw new Error("Failed to fetch assets");
      setAssets(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectAsset = useCallback((a: Asset | null) => {
    setSelectedAsset(a);
    setControlSuggestions([]);
  }, []);

  const createAsset = useCallback(async (data: AssetCreate): Promise<Asset> => {
    const r = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("Failed to create asset");
    const asset: Asset = await r.json();
    setAssets(prev => [asset, ...prev]);
    return asset;
  }, []);

  const updateAsset = useCallback(async (id: string, data: Partial<AssetCreate>): Promise<Asset> => {
    const r = await fetch(`/api/assets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("Failed to update asset");
    const updated: Asset = await r.json();
    setAssets(prev => prev.map(a => a.id === id ? updated : a));
    if (selectedAsset?.id === id) setSelectedAsset(updated);
    return updated;
  }, [selectedAsset]);

  const deleteAsset = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Failed to delete asset");
    setAssets(prev => prev.filter(a => a.id !== id));
    if (selectedAsset?.id === id) setSelectedAsset(null);
  }, [selectedAsset]);

  const suggestControls = useCallback(async (assetId: string): Promise<void> => {
    setIsSuggestingControls(true);
    setControlSuggestions([]);
    try {
      const r = await fetch(`/api/assets/${assetId}/suggest-controls`, { method: "POST" });
      if (!r.ok) throw new Error("Suggestion failed");
      const data = await r.json();
      setControlSuggestions(data.suggestions ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSuggestingControls(false);
    }
  }, []);

  return (
    <AssetRegistryContext.Provider value={{
      assets, selectedAsset, isLoading, error,
      controlSuggestions, isSuggestingControls,
      fetchAssets, selectAsset, createAsset, updateAsset, deleteAsset, suggestControls,
    }}>
      {children}
    </AssetRegistryContext.Provider>
  );
}

export function useAssetRegistry() {
  const ctx = useContext(AssetRegistryContext);
  if (!ctx) throw new Error("useAssetRegistry must be used inside AssetRegistryProvider");
  return ctx;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui" && npm run check 2>&1 | head -40
```

Expected: errors only in `asset-registry.tsx` (old imports) — context itself clean

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/contexts/AssetRegistryContext.tsx
git commit -m "feat: rewrite AssetRegistryContext with new numeric CIA and asset type taxonomy"
```

---

## Task 7: Rewrite asset-registry.tsx

**Files:**
- Rewrite: `kpmg_ui/client/src/pages/asset-registry.tsx`

- [ ] **Step 1: Overwrite the file**

```tsx
// kpmg_ui/client/src/pages/asset-registry.tsx
import { useEffect, useState } from "react";
import {
  Database, Cpu, Server, Network, Monitor, Box, GitBranch,
  Plus, Search, AlertTriangle, Shield, Loader2, Trash2, Zap, X,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useAssetRegistry,
  Asset, AssetCreate, AssetType, HostingType, SupportType, StatusType, ClassType,
} from "@/contexts/AssetRegistryContext";
import CiaRatingWidget from "@/components/CiaRatingWidget";

// ── Icon map ────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<AssetType, any> = {
  "Application":           Server,
  "Hardware":              Cpu,
  "Database":              Database,
  "Interface/API":         GitBranch,
  "Network Component":     Network,
  "Desktop/Client Software": Monitor,
  "Other":                 Box,
};

const BAND_COLOR: Record<string, string> = {
  Critical: "bg-red-100    text-red-700    border-red-300",
  High:     "bg-orange-100 text-orange-700 border-orange-300",
  Medium:   "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low:      "bg-emerald-100 text-emerald-700 border-emerald-300",
};

// ── Form default ────────────────────────────────────────────────────────────

const EMPTY: AssetCreate = {
  name: "", description: "", use: "",
  asset_type: "Application",
  hosting_type: "Unspecified",
  support_type: "Company",
  status: "Operational",
  owner: "", custodian: "",
  location: "", jurisdiction: "",
  classification: "Internal",
  confidentiality_score: 1,
  integrity_score: 1,
  availability_score: 1,
};

// ── Page ────────────────────────────────────────────────────────────────────

type RightTab = "dashboard" | "detail" | "controls";

export default function AssetRegistryPage() {
  const {
    assets, selectedAsset, isLoading,
    controlSuggestions, isSuggestingControls,
    fetchAssets, selectAsset, createAsset, deleteAsset, suggestControls,
  } = useAssetRegistry();
  const { toast } = useToast();

  const [search, setSearch]     = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<AssetCreate>(EMPTY);
  const [tab, setTab]           = useState<RightTab>("dashboard");

  useEffect(() => { fetchAssets(); }, []);

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_type.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    total:    assets.length,
    critical: assets.filter(a => a.cia_band === "Critical").length,
    high:     assets.filter(a => a.cia_band === "High").length,
  };

  function updateForm(field: keyof AssetCreate, value: any) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-clear hosting_type when asset_type changes away from Application
      if (field === "asset_type" && value !== "Application") {
        next.hosting_type = undefined;
      }
      if (field === "asset_type" && value === "Application") {
        next.hosting_type = "Unspecified";
      }
      return next;
    });
  }

  async function handleCreate() {
    try {
      await createAsset(form);
      setShowForm(false);
      setForm(EMPTY);
      toast({ title: "Asset created", description: form.name });
    } catch {
      toast({ title: "Failed to create asset", variant: "destructive" });
    }
  }

  const isFormValid =
    form.name.trim() &&
    form.description.trim() &&
    form.use.trim() &&
    form.owner.trim() &&
    form.custodian.trim() &&
    form.location.trim() &&
    form.jurisdiction.trim();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HeroSection
        title="Asset Registry"
        subtitle="Manage assets, CIA ratings, and control mappings"
        badge="Asset Management"
      />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="Search assets…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button size="sm" className="h-8 px-2" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {isLoading && (
              <div className="flex justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            {filtered.map(asset => {
              const Icon = TYPE_ICON[asset.asset_type] ?? Box;
              const selected = selectedAsset?.id === asset.id;
              return (
                <div
                  key={asset.id}
                  onClick={() => { selectAsset(asset); setTab("dashboard"); }}
                  className={`p-3 border-b border-slate-100 cursor-pointer transition-colors ${
                    selected
                      ? "bg-blue-50 border-l-2 border-l-[#001E62]"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">{asset.name}</span>
                    </div>
                    <Badge className={`text-[10px] px-1.5 py-0 border flex-shrink-0 ${BAND_COLOR[asset.cia_band]}`}>
                      {asset.cia_band}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 ml-6">
                    {asset.asset_type} · CIA {asset.cia_total}/15
                  </p>
                </div>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-8">No assets found</p>
            )}
          </ScrollArea>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {/* Tab bar */}
          <div className="flex gap-1 px-4 pt-3 border-b border-slate-200 bg-white">
            {(["dashboard", "detail", "controls"] as RightTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-[#001E62] text-[#001E62]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t === "controls" ? "Controls Mapping" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">

            {/* Dashboard tab */}
            {tab === "dashboard" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Assets",    value: kpis.total,    icon: Database,       color: "text-blue-600"   },
                    { label: "Critical Assets", value: kpis.critical, icon: AlertTriangle,  color: "text-red-600"    },
                    { label: "High Assets",     value: kpis.high,     icon: Shield,         color: "text-orange-600" },
                  ].map(k => (
                    <Card key={k.label} className="border-slate-200">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">{k.label}</p>
                          <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{k.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="border-slate-200">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Assets by Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.keys(TYPE_ICON) as AssetType[]).map(type => {
                        const Icon = TYPE_ICON[type];
                        return (
                          <div key={type} className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                            <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-700">
                              {assets.filter(a => a.asset_type === type).length}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate">{type}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {selectedAsset && (
                  <Card className="border-[#001E62]">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold text-[#001E62] uppercase tracking-wide">
                        Selected: {selectedAsset.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-1 text-xs text-slate-600">
                      <p><span className="font-medium">CIA Total:</span> {selectedAsset.cia_total}/15</p>
                      <p>
                        <span className="font-medium">Band:</span>{" "}
                        <Badge className={`text-[10px] ${BAND_COLOR[selectedAsset.cia_band]}`}>
                          {selectedAsset.cia_band}
                        </Badge>
                      </p>
                      <p><span className="font-medium">Type:</span> {selectedAsset.asset_type}</p>
                      <p><span className="font-medium">Owner:</span> {selectedAsset.owner} · <span className="font-medium">Custodian:</span> {selectedAsset.custodian}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Detail tab */}
            {tab === "detail" && selectedAsset && (
              <div className="space-y-4 max-w-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{selectedAsset.name}</h3>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs gap-1 text-red-600"
                    onClick={async () => {
                      await deleteAsset(selectedAsset.id);
                      toast({ title: "Asset deleted" });
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {([
                    ["Type",           selectedAsset.asset_type],
                    ["Hosting",        selectedAsset.hosting_type ?? "N/A"],
                    ["Support",        selectedAsset.support_type],
                    ["Status",         selectedAsset.status],
                    ["Classification", selectedAsset.classification],
                    ["Jurisdiction",   selectedAsset.jurisdiction],
                    ["Location",       selectedAsset.location],
                    ["Owner",          selectedAsset.owner],
                    ["Custodian",      selectedAsset.custodian],
                    ["Use",            selectedAsset.use],
                  ] as [string, string][]).map(([l, v]) => (
                    <div key={l} className="p-2 bg-white rounded border border-slate-100">
                      <p className="text-slate-400 text-[10px]">{l}</p>
                      <p className="text-slate-700 font-medium mt-0.5 truncate">{v}</p>
                    </div>
                  ))}
                </div>

                <CiaRatingWidget
                  confidentiality_score={selectedAsset.confidentiality_score}
                  integrity_score={selectedAsset.integrity_score}
                  availability_score={selectedAsset.availability_score}
                  onChange={() => {}}
                  readOnly
                />
              </div>
            )}
            {tab === "detail" && !selectedAsset && (
              <p className="text-xs text-slate-400 text-center mt-12">Select an asset to view details</p>
            )}

            {/* Controls tab */}
            {tab === "controls" && selectedAsset && (
              <div className="space-y-3 max-w-lg">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-600">
                    Controls for <span className="font-semibold">{selectedAsset.name}</span>
                  </p>
                  <Button
                    size="sm" className="h-7 text-xs gap-1"
                    onClick={() => suggestControls(selectedAsset.id)}
                    disabled={isSuggestingControls}
                  >
                    {isSuggestingControls
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Zap className="h-3 w-3" />}
                    Suggest Controls
                  </Button>
                </div>

                {controlSuggestions.map((s, i) => (
                  <div key={i} className="p-3 bg-white rounded border border-blue-100 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-700">{s.name}</p>
                      <Badge className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 flex-shrink-0">
                        {s.source}
                      </Badge>
                    </div>
                    <p className="text-slate-400 mt-1">{s.rationale}</p>
                  </div>
                ))}

                {controlSuggestions.length === 0 && !isSuggestingControls && (
                  <p className="text-xs text-slate-400 text-center py-8">
                    Click "Suggest Controls" to get LLM recommendations from the controls and regulatory libraries.
                  </p>
                )}
              </div>
            )}
            {tab === "controls" && !selectedAsset && (
              <p className="text-xs text-slate-400 text-center mt-12">Select an asset to view controls</p>
            )}

          </ScrollArea>
        </div>
      </div>

      {/* ── Create modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Add Asset</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-3">

                <div>
                  <label className="text-xs font-medium text-slate-600">Name *</label>
                  <Input className="mt-1 h-8 text-xs" value={form.name}
                    onChange={e => updateForm("name", e.target.value)} />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Asset Type *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                    value={form.asset_type}
                    onChange={e => updateForm("asset_type", e.target.value as AssetType)}>
                    {(Object.keys(TYPE_ICON) as AssetType[]).map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {form.asset_type === "Application" && (
                  <div>
                    <label className="text-xs font-medium text-slate-600">Hosting Type</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                      value={form.hosting_type ?? "Unspecified"}
                      onChange={e => updateForm("hosting_type", e.target.value as HostingType)}>
                      {(["PaaS","IaaS","SaaS","Internally Hosted","Desktop/Client Software","Not Hosted","Unspecified"] as HostingType[])
                        .map(h => <option key={h}>{h}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-600">Description *</label>
                  <textarea className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none"
                    rows={2} value={form.description}
                    onChange={e => updateForm("description", e.target.value)} />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Use *</label>
                  <Input className="mt-1 h-8 text-xs" placeholder="What is this asset used for?"
                    value={form.use} onChange={e => updateForm("use", e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Support Type *</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                      value={form.support_type}
                      onChange={e => updateForm("support_type", e.target.value as SupportType)}>
                      {(["Company","Vendor","Business"] as SupportType[]).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Status</label>
                    <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                      value={form.status}
                      onChange={e => updateForm("status", e.target.value as StatusType)}>
                      {(["Operational","Build in Progress","Planned Decommissioning","Decommissioned","Archived"] as StatusType[])
                        .map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Owner *</label>
                    <Input className="mt-1 h-8 text-xs" value={form.owner}
                      onChange={e => updateForm("owner", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Custodian *</label>
                    <Input className="mt-1 h-8 text-xs" value={form.custodian}
                      onChange={e => updateForm("custodian", e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Location *</label>
                    <Input className="mt-1 h-8 text-xs" placeholder="e.g. AWS Sydney"
                      value={form.location} onChange={e => updateForm("location", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Jurisdiction *</label>
                    <Input className="mt-1 h-8 text-xs" placeholder="e.g. AU, EU, IN"
                      value={form.jurisdiction} onChange={e => updateForm("jurisdiction", e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600">Classification *</label>
                  <select className="mt-1 w-full h-8 text-xs border border-slate-200 rounded-md px-2"
                    value={form.classification}
                    onChange={e => updateForm("classification", e.target.value as ClassType)}>
                    {(["Public","Internal","Confidential","Restricted"] as ClassType[]).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                <CiaRatingWidget
                  confidentiality_score={form.confidentiality_score}
                  integrity_score={form.integrity_score}
                  availability_score={form.availability_score}
                  onChange={(field, value) => updateForm(field, value)}
                />

              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={!isFormValid}>
                Create Asset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check — verify clean**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui" && npm run check 2>&1 | head -50
```

Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add kpmg_ui/client/src/pages/asset-registry.tsx
git commit -m "feat: rewrite asset-registry page with new types, conditional Hosting Type, numeric CIA widget"
```

---

## Task 8: Drop stale MongoDB collection + end-to-end verification

The old `assets` collection has documents with the old schema (`type`, `confidentiality: "low"` etc.). It will cause `Asset(**doc)` to crash on load. Drop and recreate.

- [ ] **Step 1: Drop the old collection**

Open a Python shell (or run inline):

```bash
cd "C:\Subho syste,\ControlTester_3000_kv"
python -c "
import pymongo, os
from dotenv import load_dotenv
load_dotenv()
uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
c = pymongo.MongoClient(uri)
c['trace_db']['assets'].drop()
print('assets collection dropped')
"
```

Expected: `assets collection dropped`

- [ ] **Step 2: Full backend test suite**

```bash
python -m pytest tests/ -v
```

Expected: all PASSED

- [ ] **Step 3: Start the dev server**

```bash
cd "C:\Subho syste,\ControlTester_3000_kv\kpmg_ui" && npm run dev
```

- [ ] **Step 4: Smoke test in browser** (`http://localhost:5000/asset-registry`)

- [ ] Asset Registry page loads with empty state
- [ ] Click + → modal opens with all new fields
- [ ] Asset Type = Application → Hosting Type field appears; change to Hardware → Hosting Type field disappears
- [ ] Set CIA scores: C=5, I=5, A=4 → widget shows total 14/15, band "Critical"
- [ ] Submit → asset appears in left panel with "Critical" badge
- [ ] Click asset → Dashboard tab shows CIA 14/15; Detail tab shows all fields correctly
- [ ] Controls tab → click "Suggest Controls" → suggestions return with source badges
- [ ] Navigate to Risk Assessment → wizard still loads (SP3 shim working)

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: SP1 complete — Asset Registry rewrite with numeric CIA model"
```

---

## Self-Review

**Spec coverage:**
- ✅ §5.2 All required fields present (`use` kept, `purpose` dropped per decision 3)
- ✅ §5.3 Asset Type values: Application, Hardware, Database, Interface/API, Network Component, Desktop/Client Software, Other
- ✅ §5.4 Hosting Type conditional on Application; null for all others; defaults to Unspecified
- ✅ §5.5 Support Type: Company, Vendor, Business
- ✅ §5.6 Status: Operational, Build in Progress, Planned Decommissioning, Decommissioned, Archived
- ✅ §5.7 CIA: 1-5 per dimension, Total = C+I+A, Band: 3-5=Low, 6-8=Medium, 9-11=High, 12-15=Critical
- ✅ §5.8 `assessment_periodicity` and `next_assessment_due` absent from all models and tests
- ✅ §10.1 Dark hero + light work surfaces, human-readable labels throughout
- ✅ §10.2 Application vs non-application Hosting Type behaviour enforced in validator and UI

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks complete.

**Type consistency:**
- `CIADimension` in `CiaRatingWidget.tsx` matches field names in `AssetCreate` interface (`confidentiality_score`, `integrity_score`, `availability_score`)
- `Asset` interface in `AssetRegistryContext.tsx` matches `Asset` Pydantic model in `assets.py`
- `AssetType` exported from context and imported by both `asset-registry.tsx` and `CiaRatingWidget.tsx`
- `compute_cia_total` / `compute_cia_band` used consistently across `risk_scorer.py`, `assets.py`, `test_risk_scorer.py`, `test_assets_api.py`

---

*SP2 (Controls Library: 5W1H Backend + NIST Seeding) to be planned next.*

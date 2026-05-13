# Control Testing V2 — Plan 1: Foundation & API Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the persistent data layer, GridFS file storage, and full FastAPI `/ct` router so that sessions, controls, and evidence files can be created, stored, and retrieved — with no LLM or Celery dependency.

**Architecture:** All new backend utility code lives in `utils/control_assurance/`. The FastAPI router `api/routers/ct_v2.py` follows existing project convention and imports from `utils/control_assurance/`. All files (evidence, population, workbooks) stored in a GridFS bucket named `ct_files` inside the existing `trace_db`. Three new MongoDB collections (`ct_sessions`, `ct_controls`, `ct_issues`) with indexes created on startup. Redis AOF persistence added so queued tasks survive VM restarts (fully wired in Sub-plan 2).

**Tech Stack:** FastAPI, pymongo, gridfs (pymongo bundled), Pydantic v2, mongomock (tests only), pytest, TypeScript (Express BFF proxy)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `utils/control_assurance/__init__.py` | Package init |
| Create | `utils/control_assurance/ct_models.py` | Pydantic request/response models |
| Create | `utils/control_assurance/ct_gridfs.py` | GridFS upload / stream / delete helpers for `ct_files` bucket |
| Create | `utils/control_assurance/ct_db.py` | MongoDB client, `_get_db()`, `ensure_indexes()` |
| Create | `api/routers/ct_v2.py` | All `/ct` FastAPI endpoints — imports from `utils/control_assurance/` |
| Create | `api/tests/__init__.py` | Makes `api/tests/` a Python package |
| Create | `api/tests/test_ct_v2.py` | pytest unit tests (mongomock — no running services needed) |
| Create | `api/templates/` | Directory for the blank input template xlsx |
| Modify | `docker-compose.yml` | Add `command` to redis service for AOF persistence |
| Modify | `api/main.py` | Import and register `ct_v2` router |
| Modify | `kpmg_ui/server/routes.ts` | Verify `/api/ct/*` proxy reaches FastAPI |

---

### Task 1: Redis AOF Persistence

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add AOF command to redis service**

In `docker-compose.yml`, the `redis:` service currently has no `command`. Add it immediately after `restart: unless-stopped`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: redis_Trace_KV
    restart: unless-stopped
    command: redis-server --appendonly yes --appendfsync everysec
    ports:
      - "6379:6379"
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 5s
```

- [ ] **Step 2: Verify YAML is valid**

```bash
docker compose config --quiet
```

Expected: no output (exit code 0). Any YAML error will print to stderr.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): enable Redis AOF persistence for Celery restart safety"
```

---

### Task 2: Control Assurance Package + Pydantic Models

**Files:**
- Create: `utils/control_assurance/__init__.py`
- Create: `utils/control_assurance/ct_models.py`
- Create: `api/tests/__init__.py`
- Create: `api/tests/test_ct_models.py`

- [ ] **Step 1: Create the package**

```bash
mkdir -p utils/control_assurance
```

Create empty `utils/control_assurance/__init__.py` and empty `api/tests/__init__.py`.

- [ ] **Step 2: Write the failing tests**

```python
# api/tests/test_ct_models.py
from utils.control_assurance.ct_models import (
    CreateSessionRequest,
    CreateControlRequest,
    ControlStepInput,
    TestingPeriod,
)


def test_create_session_request_parses():
    data = {
        "title": "Q1 ITGC",
        "entity": "Technology",
        "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
        "framework": "SOX s.404",
    }
    req = CreateSessionRequest.model_validate(data)
    assert req.title == "Q1 ITGC"
    assert req.testing_period.from_ == "2026-01-01"
    assert req.testing_period.to == "2026-03-31"
    assert req.description == ""
    assert req.preparer == ""


def test_create_control_request_defaults():
    data = {
        "control_id": "ITGC-001",
        "control_name": "Password Policy",
        "control_type": "Preventive",
        "test_steps": [
            {"label": "A", "description": "Inspect policy", "evidence_required": "Screenshot"}
        ],
    }
    req = CreateControlRequest.model_validate(data)
    assert req.inherent_risk_rating == "Medium"
    assert req.prior_period_result == "N/A"
    assert req.sampling_mode == "sample"
    assert len(req.test_steps) == 1
    assert req.test_steps[0].label == "A"


def test_testing_period_serializes_with_from_alias():
    period = TestingPeriod.model_validate({"from": "2026-01-01", "to": "2026-03-31"})
    serialized = period.model_dump(by_alias=True)
    assert "from" in serialized
    assert serialized["from"] == "2026-01-01"
```

- [ ] **Step 3: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_models.py -v
```

Expected: `ImportError: cannot import name 'CreateSessionRequest'`

- [ ] **Step 4: Write the models file**

```python
# utils/control_assurance/ct_models.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class TestingPeriod(BaseModel):
    model_config = {"populate_by_name": True}
    from_: str = Field(alias="from")
    to: str

    def model_dump(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump(**kwargs)


class SignOffPerson(BaseModel):
    name: str = ""
    initials: str = ""
    date: Optional[str] = None


class SignOff(BaseModel):
    preparer: SignOffPerson = Field(default_factory=SignOffPerson)
    reviewer: SignOffPerson = Field(default_factory=SignOffPerson)
    manager: SignOffPerson = Field(default_factory=SignOffPerson)


class CreateSessionRequest(BaseModel):
    title: str
    description: str = ""
    entity: str
    testing_period: TestingPeriod
    framework: str
    preparer: str = ""


class ControlStepInput(BaseModel):
    label: str
    description: str
    evidence_required: str = ""


class CreateControlRequest(BaseModel):
    control_id: str
    control_name: str
    control_type: str
    domain: str = ""
    framework_reference: str = ""
    inherent_risk_rating: str = "Medium"
    control_owner: str = ""
    frequency: str = ""
    prior_period_result: str = "N/A"
    walkthrough_performed: bool = False
    risk: str = ""
    sampling_mode: str = "sample"
    test_steps: list[ControlStepInput] = Field(default_factory=list)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd api && python -m pytest tests/test_ct_models.py -v
```

Expected: 3 tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add utils/control_assurance/__init__.py utils/control_assurance/ct_models.py \
        api/tests/__init__.py api/tests/test_ct_models.py
git commit -m "feat(ct-v2): Pydantic models in utils/control_assurance"
```

---

### Task 3: MongoDB Client Module

**Files:**
- Create: `utils/control_assurance/ct_db.py`

No separate test file needed — `_get_db()` is tested implicitly through the router tests (Task 4). Index creation is tested by running the app.

- [ ] **Step 1: Write the module**

```python
# utils/control_assurance/ct_db.py
from __future__ import annotations
import os
import pymongo

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_client: pymongo.MongoClient | None = None


def _get_db():
    global _client
    if _client is None:
        _client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client["trace_db"]


def ensure_indexes() -> None:
    """Create indexes on CT collections. Safe to call multiple times (idempotent)."""
    db = _get_db()
    db.ct_sessions.create_index([("created_at", -1)])
    db.ct_controls.create_index([("session_id", 1)])
    db.ct_issues.create_index([("session_id", 1), ("control_id", 1)])
```

- [ ] **Step 2: Commit**

```bash
git add utils/control_assurance/ct_db.py
git commit -m "feat(ct-v2): MongoDB client and index setup in utils/control_assurance"
```

---

### Task 4: GridFS Helper

**Files:**
- Create: `utils/control_assurance/ct_gridfs.py`
- Create: `api/tests/test_ct_gridfs.py`

- [ ] **Step 1: Write the failing tests**

```python
# api/tests/test_ct_gridfs.py
from unittest.mock import MagicMock, patch
from bson import ObjectId


def test_upload_returns_string_id():
    mock_bucket = MagicMock()
    fake_id = ObjectId()
    mock_bucket.put.return_value = fake_id

    with patch("utils.control_assurance.ct_gridfs.get_ct_bucket", return_value=mock_bucket):
        from utils.control_assurance.ct_gridfs import upload_to_gridfs
        result = upload_to_gridfs(b"hello", "test.pdf", {"type": "evidence"})

    assert result == str(fake_id)
    mock_bucket.put.assert_called_once_with(b"hello", filename="test.pdf", metadata={"type": "evidence"})


def test_delete_calls_bucket_delete():
    mock_bucket = MagicMock()
    fake_id = ObjectId()

    with patch("utils.control_assurance.ct_gridfs.get_ct_bucket", return_value=mock_bucket):
        from utils.control_assurance.ct_gridfs import delete_from_gridfs
        delete_from_gridfs(str(fake_id))

    mock_bucket.delete.assert_called_once_with(fake_id)


def test_stream_yields_chunks():
    mock_bucket = MagicMock()
    mock_grid_out = MagicMock()
    mock_grid_out.read.side_effect = [b"chunk1", b"chunk2", b""]
    mock_bucket.get.return_value = mock_grid_out

    with patch("utils.control_assurance.ct_gridfs.get_ct_bucket", return_value=mock_bucket):
        from utils.control_assurance.ct_gridfs import stream_from_gridfs
        chunks = list(stream_from_gridfs(str(ObjectId())))

    assert chunks == [b"chunk1", b"chunk2"]
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_gridfs.py -v
```

Expected: `ImportError: No module named 'utils.control_assurance.ct_gridfs'`

- [ ] **Step 3: Write the helper**

```python
# utils/control_assurance/ct_gridfs.py
from __future__ import annotations
import os
from typing import Iterator

import gridfs
import pymongo
from bson import ObjectId

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_client: pymongo.MongoClient | None = None


def _get_client() -> pymongo.MongoClient:
    global _client
    if _client is None:
        _client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client


def get_ct_bucket() -> gridfs.GridFS:
    db = _get_client()["trace_db"]
    return gridfs.GridFS(db, collection="ct_files")


def upload_to_gridfs(content: bytes, filename: str, metadata: dict) -> str:
    """Upload bytes to ct_files GridFS bucket. Returns string object ID."""
    bucket = get_ct_bucket()
    file_id = bucket.put(content, filename=filename, metadata=metadata)
    return str(file_id)


def download_from_gridfs(gridfs_id: str) -> bytes:
    """Download full file content from ct_files GridFS bucket."""
    bucket = get_ct_bucket()
    grid_out = bucket.get(ObjectId(gridfs_id))
    return grid_out.read()


def stream_from_gridfs(gridfs_id: str) -> Iterator[bytes]:
    """Yield 64 KB chunks for streaming download."""
    bucket = get_ct_bucket()
    grid_out = bucket.get(ObjectId(gridfs_id))
    while chunk := grid_out.read(65536):
        yield chunk


def delete_from_gridfs(gridfs_id: str) -> None:
    """Delete a file from ct_files GridFS bucket by string object ID."""
    bucket = get_ct_bucket()
    bucket.delete(ObjectId(gridfs_id))


def get_file_metadata(gridfs_id: str) -> dict:
    """Return filename, length, and metadata dict for a stored file."""
    bucket = get_ct_bucket()
    grid_out = bucket.get(ObjectId(gridfs_id))
    return {
        "filename": grid_out.filename,
        "length": grid_out.length,
        "metadata": grid_out.metadata or {},
    }
```

- [ ] **Step 4: Run tests**

```bash
cd api && python -m pytest tests/test_ct_gridfs.py -v
```

Expected: 3 tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add utils/control_assurance/ct_gridfs.py api/tests/test_ct_gridfs.py
git commit -m "feat(ct-v2): GridFS helper in utils/control_assurance"
```

---

### Task 5: Session CRUD Endpoints

**Files:**
- Create: `api/routers/ct_v2.py` (session endpoints — more added in Tasks 6–7)
- Create: `api/tests/test_ct_v2.py`

- [ ] **Step 1: Add mongomock to requirements**

Check `api/requirements.txt`. If `mongomock` is absent, add:

```
mongomock>=4.1.2
```

```bash
cd api && pip install mongomock
```

- [ ] **Step 2: Write the failing tests**

```python
# api/tests/test_ct_v2.py
import pytest
import mongomock
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture()
def mock_db():
    client = mongomock.MongoClient()
    return client["trace_db"]


@pytest.fixture()
def api_client(mock_db):
    with patch("utils.control_assurance.ct_db._get_db", return_value=mock_db):
        with patch("utils.control_assurance.ct_gridfs.get_ct_bucket"):
            from api.main import app
            yield TestClient(app)


CREATE_PAYLOAD = {
    "title": "Q1 2026 ITGC",
    "entity": "Technology",
    "testing_period": {"from": "2026-01-01", "to": "2026-03-31"},
    "framework": "SOX s.404",
    "preparer": "Jane Doe",
}


def test_create_session(api_client, mock_db):
    r = api_client.post("/ct/sessions", json=CREATE_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Q1 2026 ITGC"
    assert body["stage"] == "input"
    assert body["entity"] == "Technology"
    assert "id" in body
    assert mock_db.ct_sessions.count_documents({}) == 1


def test_list_sessions_empty(api_client):
    r = api_client.get("/ct/sessions")
    assert r.status_code == 200
    assert r.json() == []


def test_list_sessions_returns_created(api_client):
    api_client.post("/ct/sessions", json=CREATE_PAYLOAD)
    r = api_client.get("/ct/sessions")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["stage"] == "input"
    assert r.json()[0]["control_count"] == 0


def test_get_session_not_found(api_client):
    r = api_client.get("/ct/sessions/nonexistent-id")
    assert r.status_code == 404


def test_get_session_returns_detail(api_client):
    created = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    r = api_client.get(f"/ct/sessions/{created['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == created["id"]
    assert body["controls"] == []


def test_delete_session(api_client, mock_db):
    created = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    r = api_client.delete(f"/ct/sessions/{created['id']}")
    assert r.status_code == 204
    assert mock_db.ct_sessions.count_documents({"_id": created["id"]}) == 0


def test_delete_session_not_found(api_client):
    r = api_client.delete("/ct/sessions/nonexistent-id")
    assert r.status_code == 404


def test_session_status(api_client):
    created = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    r = api_client.get(f"/ct/sessions/{created['id']}/status")
    assert r.status_code == 200
    body = r.json()
    assert body["stage"] == "input"
    assert body["stage_checkpoint"] is None
    assert body["celery_task_id"] is None
```

- [ ] **Step 3: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_v2.py -v
```

Expected: `ImportError` or all `404` — router not yet registered.

- [ ] **Step 4: Write ct_v2.py with session endpoints**

```python
# api/routers/ct_v2.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from utils.control_assurance.ct_db import _get_db
from utils.control_assurance.ct_gridfs import (
    delete_from_gridfs,
    stream_from_gridfs,
    upload_to_gridfs,
)
from utils.control_assurance.ct_models import (
    CreateControlRequest,
    CreateSessionRequest,
)

TEMPLATE_PATH = Path(__file__).parent.parent / "templates" / "SOX_ITGC_Testing_Workpaper_v2.xlsx"

router = APIRouter(prefix="/ct", tags=["control-testing-v2"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session_to_response(doc: dict) -> dict:
    return {**doc, "id": doc["_id"]}


def _control_to_response(doc: dict) -> dict:
    return {**doc, "id": doc["_id"]}


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

@router.post("/sessions", status_code=201)
def create_session(body: CreateSessionRequest) -> dict:
    now = _now()
    doc = {
        "_id": str(uuid.uuid4()),
        "title": body.title,
        "description": body.description,
        "entity": body.entity,
        "testing_period": body.testing_period.model_dump(by_alias=True),
        "framework": body.framework,
        "stage": "input",
        "stage_checkpoint": None,
        "celery_task_id": None,
        "llm_suggestions": [],
        "llm_questions": [],
        "sign_off": {
            "preparer": {"name": body.preparer, "initials": "", "date": None},
            "reviewer": {"name": "", "initials": "", "date": None},
            "manager": {"name": "", "initials": "", "date": None},
        },
        "override_log": [],
        "created_at": now,
        "updated_at": now,
    }
    _get_db().ct_sessions.insert_one(doc)
    return _session_to_response(doc)


@router.get("/sessions")
def list_sessions() -> list:
    db = _get_db()
    docs = list(db.ct_sessions.find({}, sort=[("created_at", -1)]))
    result = []
    for doc in docs:
        control_count = db.ct_controls.count_documents({"session_id": doc["_id"]})
        result.append({
            "id": doc["_id"],
            "title": doc["title"],
            "entity": doc["entity"],
            "framework": doc["framework"],
            "stage": doc["stage"],
            "control_count": control_count,
            "created_at": doc["created_at"],
            "updated_at": doc["updated_at"],
        })
    return result


@router.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    db = _get_db()
    doc = db.ct_sessions.find_one({"_id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    controls = list(db.ct_controls.find({"session_id": session_id}))
    result = _session_to_response(doc)
    result["controls"] = [_control_to_response(c) for c in controls]
    return result


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str) -> None:
    db = _get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    for control in db.ct_controls.find({"session_id": session_id}):
        for ev in control.get("evidence_files", []):
            try:
                delete_from_gridfs(ev["gridfs_id"])
            except Exception:
                pass
        pop_id = control.get("sampling", {}).get("population_file_id")
        if pop_id:
            try:
                delete_from_gridfs(pop_id)
            except Exception:
                pass
        wb_id = control.get("workbook_output_id")
        if wb_id:
            try:
                delete_from_gridfs(wb_id)
            except Exception:
                pass

    db.ct_controls.delete_many({"session_id": session_id})
    db.ct_issues.delete_many({"session_id": session_id})
    db.ct_sessions.delete_one({"_id": session_id})


@router.get("/sessions/{session_id}/status")
def session_status(session_id: str) -> dict:
    doc = _get_db().ct_sessions.find_one(
        {"_id": session_id},
        {"stage": 1, "stage_checkpoint": 1, "celery_task_id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": session_id,
        "stage": doc["stage"],
        "stage_checkpoint": doc.get("stage_checkpoint"),
        "celery_task_id": doc.get("celery_task_id"),
    }
```

- [ ] **Step 5: Register the router in main.py**

In `api/main.py`, find the block of router imports (lines ~67–75). Add:

```python
from api.routers.ct_v2 import router as ct_v2_router
from utils.control_assurance.ct_db import ensure_indexes as ct_ensure_indexes
```

Find where `app.include_router(...)` calls are and add:

```python
app.include_router(ct_v2_router)
```

Find or add a startup event — if there is a `@app.on_event("startup")` function already, add `ct_ensure_indexes()` inside it. If there isn't one, add after `app = FastAPI(...)`:

```python
@app.on_event("startup")
def _ct_startup():
    ct_ensure_indexes()
```

- [ ] **Step 6: Run session tests**

```bash
cd api && python -m pytest tests/test_ct_v2.py -v
```

Expected: 8 tests PASSED.

- [ ] **Step 7: Commit**

```bash
git add api/routers/ct_v2.py api/tests/test_ct_v2.py api/main.py
git commit -m "feat(ct-v2): session CRUD endpoints, router registration, index setup"
```

---

### Task 6: Manual Control Input

**Files:**
- Modify: `api/routers/ct_v2.py` — add `add_controls` endpoint
- Modify: `api/tests/test_ct_v2.py` — add control tests

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_ct_v2.py`:

```python
CONTROL_PAYLOAD = [
    {
        "control_id": "ITGC-001",
        "control_name": "Password Complexity Policy",
        "control_type": "Preventive",
        "domain": "Access Management",
        "framework_reference": "SOX s.404",
        "inherent_risk_rating": "High",
        "control_owner": "John Smith",
        "frequency": "Continuous",
        "prior_period_result": "Effective",
        "walkthrough_performed": False,
        "risk": "Unauthorised system access",
        "sampling_mode": "sample",
        "test_steps": [
            {"label": "A", "description": "Inspect AD password policy", "evidence_required": "AD policy screenshot"},
            {"label": "B", "description": "Verify lockout settings", "evidence_required": "Lockout config"},
        ],
    }
]


def test_add_controls(api_client, mock_db):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    r = api_client.post(f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert len(body) == 1
    ctrl = body[0]
    assert ctrl["control_id"] == "ITGC-001"
    assert ctrl["status"] == "pending"
    assert len(ctrl["test_steps"]) == 2
    assert ctrl["sampling"]["mode"] == "sample"
    assert ctrl["sampling"]["population_ca_verification"]["completeness_passed"] is None
    assert mock_db.ct_controls.count_documents({"session_id": session["id"]}) == 1


def test_add_controls_session_not_found(api_client):
    r = api_client.post("/ct/sessions/bad-id/controls", json=CONTROL_PAYLOAD)
    assert r.status_code == 404


def test_get_session_includes_controls(api_client):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    api_client.post(f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD)
    r = api_client.get(f"/ct/sessions/{session['id']}")
    assert r.status_code == 200
    assert len(r.json()["controls"]) == 1
    assert r.json()["controls"][0]["control_name"] == "Password Complexity Policy"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_v2.py::test_add_controls -v
```

Expected: `404` — endpoint not yet defined.

- [ ] **Step 3: Add endpoint to ct_v2.py**

Append after the `session_status` endpoint:

```python
# ---------------------------------------------------------------------------
# Control input
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/controls", status_code=201)
def add_controls(session_id: str, controls: list[CreateControlRequest]) -> list:
    db = _get_db()
    if not db.ct_sessions.find_one({"_id": session_id}):
        raise HTTPException(status_code=404, detail="Session not found")

    now = _now()
    created = []
    for body in controls:
        doc = {
            "_id": str(uuid.uuid4()),
            "session_id": session_id,
            "control_id": body.control_id,
            "control_name": body.control_name,
            "control_type": body.control_type,
            "domain": body.domain,
            "framework_reference": body.framework_reference,
            "inherent_risk_rating": body.inherent_risk_rating,
            "control_owner": body.control_owner,
            "frequency": body.frequency,
            "prior_period_result": body.prior_period_result,
            "walkthrough_performed": body.walkthrough_performed,
            "risk": body.risk,
            "test_steps": [
                {
                    "step_id": str(uuid.uuid4()),
                    "label": s.label,
                    "description": s.description,
                    "evidence_required": s.evidence_required,
                }
                for s in body.test_steps
            ],
            "sampling": {
                "mode": body.sampling_mode,
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
        created.append(_control_to_response(doc))

    db.ct_sessions.update_one({"_id": session_id}, {"$set": {"updated_at": now}})
    return created
```

- [ ] **Step 4: Run all tests**

```bash
cd api && python -m pytest tests/test_ct_v2.py -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add api/routers/ct_v2.py api/tests/test_ct_v2.py
git commit -m "feat(ct-v2): manual control input endpoint"
```

---

### Task 7: File Upload Endpoints (Population + Evidence)

**Files:**
- Modify: `api/routers/ct_v2.py` — add upload endpoints and `_classify_file_type`
- Modify: `api/tests/test_ct_v2.py` — add upload tests

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_ct_v2.py`:

```python
from unittest.mock import patch as _patch


def _make_session_with_control(api_client):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    controls = api_client.post(
        f"/ct/sessions/{session['id']}/controls", json=CONTROL_PAYLOAD
    ).json()
    return session["id"], controls[0]["id"]


def test_upload_evidence_returns_gridfs_id(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    fake_id = "6642aabbccddeeff00112233"

    with _patch("api.routers.ct_v2.upload_to_gridfs", return_value=fake_id):
        r = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence",
            files=[("files", ("policy.png", b"fake-image-bytes", "image/png"))],
        )

    assert r.status_code == 201
    body = r.json()
    assert len(body) == 1
    assert body[0]["gridfs_id"] == fake_id
    assert body[0]["filename"] == "policy.png"
    assert body[0]["file_type"] == "image"

    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert len(ctrl["evidence_files"]) == 1
    assert ctrl["evidence_files"][0]["gridfs_id"] == fake_id
    assert ctrl["evidence_files"][0]["ca_verification"]["completeness_passed"] is None


def test_upload_evidence_control_not_found(api_client):
    session = api_client.post("/ct/sessions", json=CREATE_PAYLOAD).json()
    r = api_client.post(
        f"/ct/sessions/{session['id']}/controls/bad-ctrl-id/evidence",
        files=[("files", ("policy.png", b"bytes", "image/png"))],
    )
    assert r.status_code == 404


def test_upload_population_stores_gridfs_id(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    fake_id = "6642aabbccddeeff00112244"

    with _patch("api.routers.ct_v2.upload_to_gridfs", return_value=fake_id):
        r = api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/population",
            files=[("file", ("pop.xlsx", b"fake-excel", "application/octet-stream"))],
        )

    assert r.status_code == 201
    assert r.json()["gridfs_id"] == fake_id

    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert ctrl["sampling"]["population_file_id"] == fake_id


def test_file_type_classification():
    from api.routers.ct_v2 import _classify_file_type
    assert _classify_file_type("png") == "image"
    assert _classify_file_type("jpg") == "image"
    assert _classify_file_type("jpeg") == "image"
    assert _classify_file_type("pdf") == "pdf"
    assert _classify_file_type("xlsx") == "excel"
    assert _classify_file_type("xls") == "excel"
    assert _classify_file_type("csv") == "csv"
    assert _classify_file_type("docx") == "docx"
    assert _classify_file_type("txt") == "txt"
    assert _classify_file_type("conf") == "txt"
    assert _classify_file_type("zip") == "zip"
    assert _classify_file_type("bin") == "other"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_v2.py::test_upload_evidence_returns_gridfs_id -v
```

Expected: `404` — endpoint not defined.

- [ ] **Step 3: Add upload endpoints to ct_v2.py**

Append to `api/routers/ct_v2.py`:

```python
# ---------------------------------------------------------------------------
# File type helper
# ---------------------------------------------------------------------------

def _classify_file_type(ext: str) -> str:
    if ext in {"jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp"}:
        return "image"
    if ext == "pdf":
        return "pdf"
    if ext in {"xlsx", "xls"}:
        return "excel"
    if ext == "csv":
        return "csv"
    if ext == "docx":
        return "docx"
    if ext in {"txt", "conf"}:
        return "txt"
    if ext == "zip":
        return "zip"
    return "other"


# ---------------------------------------------------------------------------
# Population upload
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/controls/{control_id}/population", status_code=201)
async def upload_population(
    session_id: str, control_id: str, file: UploadFile = File(...)
) -> dict:
    db = _get_db()
    if not db.ct_controls.find_one({"_id": control_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="Control not found")

    content = await file.read()
    gridfs_id = upload_to_gridfs(
        content,
        file.filename,
        {"type": "population", "session_id": session_id, "control_id": control_id},
    )
    db.ct_controls.update_one(
        {"_id": control_id},
        {"$set": {"sampling.population_file_id": gridfs_id, "updated_at": _now()}},
    )
    return {"gridfs_id": gridfs_id, "filename": file.filename, "status": "uploaded"}


# ---------------------------------------------------------------------------
# Evidence upload (multi-file)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/controls/{control_id}/evidence", status_code=201)
async def upload_evidence(
    session_id: str, control_id: str, files: list[UploadFile] = File(...)
) -> list:
    db = _get_db()
    if not db.ct_controls.find_one({"_id": control_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="Control not found")

    uploaded = []
    for file in files:
        ext = Path(file.filename).suffix.lower().lstrip(".")
        file_type = _classify_file_type(ext)
        content = await file.read()
        gridfs_id = upload_to_gridfs(
            content,
            file.filename,
            {"type": "evidence", "session_id": session_id, "control_id": control_id},
        )
        ev_entry = {
            "gridfs_id": gridfs_id,
            "filename": file.filename,
            "file_type": file_type,
            "mapped_step_labels": [],
            "identified_value": "",
            "annotation_regions": [],
            "ca_verification": {
                "completeness_passed": None,
                "accuracy_passed": None,
                "issues": [],
                "overridden": False,
                "override_reason": None,
            },
        }
        db.ct_controls.update_one(
            {"_id": control_id},
            {"$push": {"evidence_files": ev_entry}, "$set": {"updated_at": _now()}},
        )
        uploaded.append({"gridfs_id": gridfs_id, "filename": file.filename, "file_type": file_type})

    return uploaded
```

Also add `from pathlib import Path` to the imports at the top of `api/routers/ct_v2.py` if not already present.

- [ ] **Step 4: Run all tests**

```bash
cd api && python -m pytest tests/test_ct_v2.py -v
```

Expected: all tests PASSED.

- [ ] **Step 5: Commit**

```bash
git add api/routers/ct_v2.py api/tests/test_ct_v2.py
git commit -m "feat(ct-v2): population and evidence file upload endpoints"
```

---

### Task 8: Evidence Delete + Workbook + Template Download

**Files:**
- Modify: `api/routers/ct_v2.py` — add three remaining endpoints
- Create: `api/templates/` — directory for blank xlsx
- Modify: `api/tests/test_ct_v2.py` — add download/delete tests

- [ ] **Step 1: Create templates directory and copy the workpaper template**

```bash
mkdir -p api/templates
```

Copy `SOX_ITGC_Testing_Workpaper_v2.xlsx` (the file modified during brainstorming) into `api/templates/SOX_ITGC_Testing_Workpaper_v2.xlsx`. This is the blank template served by `GET /ct/template/download`.

- [ ] **Step 2: Write failing tests**

Append to `api/tests/test_ct_v2.py`:

```python
def test_delete_evidence_removes_from_control(api_client, mock_db):
    sid, cid = _make_session_with_control(api_client)
    fake_id = "6642aabbccddeeff00112233"

    with _patch("api.routers.ct_v2.upload_to_gridfs", return_value=fake_id):
        api_client.post(
            f"/ct/sessions/{sid}/controls/{cid}/evidence",
            files=[("files", ("policy.png", b"bytes", "image/png"))],
        )

    with _patch("api.routers.ct_v2.delete_from_gridfs"):
        r = api_client.delete(
            f"/ct/sessions/{sid}/controls/{cid}/evidence/{fake_id}"
        )

    assert r.status_code == 204
    ctrl = mock_db.ct_controls.find_one({"_id": cid})
    assert ctrl["evidence_files"] == []


def test_workbook_not_yet_generated(api_client):
    sid, cid = _make_session_with_control(api_client)
    r = api_client.get(f"/ct/sessions/{sid}/controls/{cid}/workbook")
    assert r.status_code == 404


def test_template_download_returns_xlsx(api_client, tmp_path, monkeypatch):
    import api.routers.ct_v2 as ct_module
    fake_template = tmp_path / "template.xlsx"
    fake_template.write_bytes(b"PK\x03\x04fake-xlsx")
    monkeypatch.setattr(ct_module, "TEMPLATE_PATH", fake_template)

    r = api_client.get("/ct/template/download")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    assert r.content == b"PK\x03\x04fake-xlsx"


def test_template_download_missing_file(api_client, tmp_path, monkeypatch):
    import api.routers.ct_v2 as ct_module
    monkeypatch.setattr(ct_module, "TEMPLATE_PATH", tmp_path / "nonexistent.xlsx")
    r = api_client.get("/ct/template/download")
    assert r.status_code == 404
```

- [ ] **Step 3: Run to verify they fail**

```bash
cd api && python -m pytest tests/test_ct_v2.py::test_delete_evidence_removes_from_control -v
```

Expected: `404` — endpoint not defined.

- [ ] **Step 4: Add three endpoints to ct_v2.py**

Append to `api/routers/ct_v2.py`:

```python
# ---------------------------------------------------------------------------
# Evidence delete
# ---------------------------------------------------------------------------

@router.delete(
    "/sessions/{session_id}/controls/{control_id}/evidence/{gridfs_id}",
    status_code=204,
)
def delete_evidence(session_id: str, control_id: str, gridfs_id: str) -> None:
    db = _get_db()
    if not db.ct_controls.find_one({"_id": control_id, "session_id": session_id}):
        raise HTTPException(status_code=404, detail="Control not found")
    try:
        delete_from_gridfs(gridfs_id)
    except Exception:
        pass
    db.ct_controls.update_one(
        {"_id": control_id},
        {
            "$pull": {"evidence_files": {"gridfs_id": gridfs_id}},
            "$set": {"updated_at": _now()},
        },
    )


# ---------------------------------------------------------------------------
# Workbook download (GridFS stream)
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/controls/{control_id}/workbook")
def download_workbook(session_id: str, control_id: str) -> StreamingResponse:
    db = _get_db()
    control = db.ct_controls.find_one({"_id": control_id, "session_id": session_id})
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    wb_id = control.get("workbook_output_id")
    if not wb_id:
        raise HTTPException(status_code=404, detail="Workbook not yet generated")

    safe_name = control["control_name"].replace(" ", "_")[:40]
    filename = f"workpaper_{control['control_id']}_{safe_name}.xlsx"

    return StreamingResponse(
        stream_from_gridfs(wb_id),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Blank input template download
# ---------------------------------------------------------------------------

@router.get("/template/download")
def download_template() -> StreamingResponse:
    if not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=404, detail="Template file not found on server")

    def _iter():
        with open(TEMPLATE_PATH, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="CT_Input_Template.xlsx"'},
    )
```

- [ ] **Step 5: Run all tests**

```bash
cd api && python -m pytest tests/test_ct_v2.py -v
```

Expected: all tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add api/routers/ct_v2.py api/templates/ api/tests/test_ct_v2.py
git commit -m "feat(ct-v2): evidence delete, workbook stream, template download endpoints"
```

---

### Task 9: Express BFF Verification + End-to-End Smoke Test

**Files:**
- Modify: `kpmg_ui/server/routes.ts` (if generic proxy doesn't cover `/ct/*`)

- [ ] **Step 1: Start services**

```bash
docker compose up --build -d fastapi_api web_ui_agent
```

Wait ~15 seconds for health checks to pass.

- [ ] **Step 2: Test FastAPI directly**

```bash
curl -s http://localhost:8000/ct/sessions | python -m json.tool
```

Expected: `[]`

- [ ] **Step 3: Test through Express BFF**

```bash
curl -s http://localhost:5000/api/ct/sessions | python -m json.tool
```

Expected: `[]`

If you get an Express HTML 404 (not a JSON `[]`), the generic proxy does not cover `/ct/*`. In that case open `kpmg_ui/server/routes.ts` and find how other `/api/*` routes are proxied (look for `FASTAPI_BASE` usage). Add before the catch-all:

```typescript
app.all("/api/ct/*", (req, res) => {
  const targetPath = req.path.replace(/^\/api/, "");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = new URL(FASTAPI_BASE);
  const options = {
    hostname: url.hostname,
    port: parseInt(url.port || "80"),
    path: targetPath + qs,
    method: req.method,
    headers: { ...req.headers, host: url.host },
  };
  const proxy = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on("error", (err) => res.status(502).json({ error: err.message }));
  req.pipe(proxy);
});
```

Rebuild UI and re-test: `docker compose up --build -d web_ui_agent`

- [ ] **Step 4: Full end-to-end smoke test**

```bash
# Create session
SESSION=$(curl -s -X POST http://localhost:5000/api/ct/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke","entity":"Tech","testing_period":{"from":"2026-01-01","to":"2026-03-31"},"framework":"SOX"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Session: $SESSION"

# Add control
curl -s -X POST http://localhost:5000/api/ct/sessions/$SESSION/controls \
  -H "Content-Type: application/json" \
  -d '[{"control_id":"ITGC-001","control_name":"Password Policy","control_type":"Preventive","test_steps":[{"label":"A","description":"Inspect","evidence_required":"Screenshot"}]}]' \
  | python -m json.tool

# Check status
curl -s http://localhost:5000/api/ct/sessions/$SESSION/status | python -m json.tool

# Delete
curl -s -o /dev/null -w "%{http_code}" -X DELETE http://localhost:5000/api/ct/sessions/$SESSION
```

Expected: session created with `stage: "input"`, control shown, status `"input"`, delete returns `204`.

- [ ] **Step 5: Run full test suite**

```bash
cd api && python -m pytest tests/ -v
```

Expected: all tests PASSED, no import errors.

- [ ] **Step 6: TypeScript check**

```bash
cd kpmg_ui && npm run check
```

Expected: 0 errors.

- [ ] **Step 7: Update HANDOFF.md**

Open `docs/HANDOFF.md` and append:

```markdown
## CT V2 — Sub-plan 1: Foundation & API Layer (2026-05-12)

**Status:** Complete

New folder: `utils/control_assurance/` — all CT backend utilities live here.

- `ct_models.py` — Pydantic models for all `/ct` request/response shapes
- `ct_db.py` — MongoDB client, `_get_db()`, `ensure_indexes()`
- `ct_gridfs.py` — GridFS upload/stream/delete for `ct_files` bucket

New router: `api/routers/ct_v2.py` at `/ct` prefix.

Endpoints live:
- `POST/GET/DELETE /ct/sessions` — session CRUD
- `GET /ct/sessions/:id/status` — lightweight stage poll
- `POST /ct/sessions/:id/controls` — manual control input (JSON array)
- `POST /ct/sessions/:id/controls/:cid/population` — population file upload
- `POST /ct/sessions/:id/controls/:cid/evidence` — multi-file evidence upload
- `DELETE /ct/sessions/:id/controls/:cid/evidence/:id` — remove evidence file
- `GET /ct/sessions/:id/controls/:cid/workbook` — stream workbook from GridFS
- `GET /ct/template/download` — serve blank CT_Input_Template.xlsx

Infrastructure: Redis AOF persistence enabled in docker-compose.yml.
Tests: `api/tests/test_ct_v2.py` — all passing with mongomock, no live services needed.

**Next:** Sub-plan 2 — ct_worker Celery container, Stages 1–3 (parse template, LLM review, evidence mapping + C&A gate).
```

- [ ] **Step 8: Commit**

```bash
git add docs/HANDOFF.md kpmg_ui/server/routes.ts
git commit -m "docs: HANDOFF updated, CT V2 Sub-plan 1 complete"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Redis AOF persistence | Task 1 |
| `ct_sessions` / `ct_controls` / `ct_issues` collections + indexes | Task 3, 5 |
| `utils/control_assurance/` package | Task 2 |
| Pydantic models | Task 2 |
| GridFS `ct_files` bucket helpers | Task 4 |
| `POST /ct/sessions` | Task 5 |
| `GET /ct/sessions` | Task 5 |
| `GET /ct/sessions/:id` with controls embedded | Task 5 |
| `GET /ct/sessions/:id/status` | Task 5 |
| `DELETE /ct/sessions/:id` — cascades GridFS deletes | Task 5 |
| `POST /ct/sessions/:id/controls` (manual JSON) | Task 6 |
| `POST /ct/sessions/:id/controls/:cid/population` | Task 7 |
| `POST /ct/sessions/:id/controls/:cid/evidence` (multi-file) | Task 7 |
| `DELETE /ct/sessions/:id/controls/:cid/evidence/:id` | Task 8 |
| `GET /ct/sessions/:id/controls/:cid/workbook` (GridFS stream) | Task 8 |
| `GET /ct/template/download` | Task 8 |
| Express BFF `/api/ct/*` proxy | Task 9 |
| pytest tests for all endpoints | Tasks 2–8 |

**Deferred to later sub-plans (correct):**
- `ct_worker` Celery container and all pipeline stages
- `POST /ct/sessions/:id/upload-template` (Celery task dispatch — stub added in Task 6 as part of Sub-plan 2)
- All LLM review, C&A, mapping, testing, issues endpoints
- Frontend (3 routes, 5 tabs)

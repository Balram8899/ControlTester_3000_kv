# RBAC, Admin Console & Password Policy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side localStorage auth system with a server-side JWT auth system backed by MongoDB, add 4-tier multi-role RBAC enforced in FastAPI, and build an Admin Console with user management, access request workflow, and configurable password policy.

**Architecture:** FastAPI owns auth — every endpoint validates a JWT via `get_current_user` dependency, so the API is protected even if accessed directly on the GCP VM. Express BFF reads the JWT from an httpOnly cookie set by FastAPI and forwards it as `Authorization: Bearer` on every proxy call. Users, access requests, and password policy are stored in MongoDB `trace_db`.

**Tech Stack:** `python-jose[cryptography]` (JWT), `passlib[bcrypt]` (password hashing), `pymongo` (existing), React + wouter (existing), TanStack Query (existing), shadcn/ui (existing).

**Default seed user:** Kartik Varma — `kvarma9@gmail.com` / `Password@1234!` / roles: `["admin"]` / `must_reset_password: false`

---

## File Map

### New — Backend
| File | Responsibility |
|---|---|
| `api/utils/user_store.py` | MongoDB CRUD for `users` and `access_requests` collections |
| `api/utils/seed.py` | Seed default admin user + default password policy on startup |
| `api/utils/password_policy.py` | Validate a plaintext password against the stored policy; check no-reuse |
| `api/utils/auth.py` | JWT encode/decode; `get_current_user` FastAPI dependency; `require_roles()` factory |
| `api/routers/auth.py` | `POST /auth/login`, `POST /auth/logout`, `POST /auth/change-password` |
| `api/routers/admin.py` | User CRUD, access request approval, password policy config, audit log |
| `api/tests/test_auth.py` | Pytest tests for auth router |
| `api/tests/test_admin.py` | Pytest tests for admin router |

### Modified — Backend
| File | Change |
|---|---|
| `api/requirements.txt` | Add `python-jose[cryptography]`, `passlib[bcrypt]` |
| `api/main.py` | Include auth + admin routers; run seed on startup |
| `api/routers/assets.py` | Add `get_current_user` + `require_roles` to write endpoints |
| `api/routers/issues.py` | Add `get_current_user` + `require_roles` to write endpoints |
| `api/routers/control_testing.py` | Add `get_current_user` + `require_roles` to write endpoints |
| `api/routers/risk_assessment.py` | Add `get_current_user` + `require_roles` to write endpoints |
| `api/routers/validation_queue.py` | Add `get_current_user` + `require_roles` to accept/dismiss |
| `docker-compose.yml` | Add `JWT_SECRET_KEY` env var to `fastapi_api` service |

### New — Frontend
| File | Responsibility |
|---|---|
| `kpmg_ui/client/src/pages/request-access.tsx` | Request Access form + email status lookup |
| `kpmg_ui/client/src/pages/set-password.tsx` | Force password reset page with live policy checker |
| `kpmg_ui/client/src/pages/admin.tsx` | Admin Console — Users / Requests / Password Policy / Audit Log tabs |

### Modified — Frontend
| File | Change |
|---|---|
| `kpmg_ui/client/src/contexts/AuthContext.tsx` | Strip localStorage; call FastAPI; add `roles`, `hasRole()` |
| `kpmg_ui/client/src/pages/login.tsx` | Remove register dialog; add "Request Access" link |
| `kpmg_ui/client/src/App.tsx` | Add routes for new pages; add force-reset redirect guard |
| `kpmg_ui/server/routes.ts` | Add cookie-parser; forward JWT cookie as Bearer header |

---

## Task 1: Python dependencies + JWT env var

**Files:**
- Modify: `api/requirements.txt`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add auth libraries to requirements.txt**

Add after the `# FastAPI + server` block:
```
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
```

- [ ] **Step 2: Add JWT_SECRET_KEY to docker-compose.yml**

In the `fastapi_api` service `environment:` section, add:
```yaml
- JWT_SECRET_KEY=change-me-in-production-use-a-long-random-string
```

- [ ] **Step 3: Rebuild to verify dependencies install**
```bash
docker compose up --build -d fastapi_api
docker logs controltester_3000_kv-fastapi_api-1 --tail 20
```
Expected: container starts, no import errors.

- [ ] **Step 4: Commit**
```bash
git add api/requirements.txt docker-compose.yml
git commit -m "feat(auth): add python-jose, passlib, JWT_SECRET_KEY env var"
```

---

## Task 2: MongoDB user store (`api/utils/user_store.py`)

**Files:**
- Create: `api/utils/user_store.py`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_user_store.py`:
```python
import pytest
from unittest.mock import MagicMock, patch
from utils.user_store import UserStore

@pytest.fixture
def store():
    mock_db = MagicMock()
    mock_db["users"].find_one.return_value = None
    mock_db["access_requests"].find_one.return_value = None
    return UserStore(mock_db)

def test_get_by_email_returns_none_when_not_found(store):
    result = store.get_by_email("nobody@example.com")
    assert result is None

def test_create_user_returns_user_with_id(store):
    store.db["users"].insert_one = MagicMock()
    user = store.create_user(
        name="Test", email="test@example.com",
        hashed_password="hash", roles=["viewer"],
        created_by="system"
    )
    assert user["email"] == "test@example.com"
    assert "id" in user
    assert user["must_reset_password"] is True
```

- [ ] **Step 2: Run to verify it fails**
```bash
cd api && python -m pytest tests/test_user_store.py -v
```
Expected: `ImportError: No module named 'utils.user_store'`

- [ ] **Step 3: Implement `api/utils/user_store.py`**

```python
import os, uuid
from datetime import datetime, timezone
from typing import Optional
import pymongo

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")

def _get_db():
    client = pymongo.MongoClient(MONGO_URI)
    return client["trace_db"]


class UserStore:
    def __init__(self, db=None):
        self.db = db or _get_db()

    # ── Users ──────────────────────────────────────────────────────────────

    def get_by_email(self, email: str) -> Optional[dict]:
        doc = self.db["users"].find_one({"email": email.lower()})
        if doc:
            doc["id"] = str(doc.pop("_id"))
        return doc

    def get_by_id(self, user_id: str) -> Optional[dict]:
        doc = self.db["users"].find_one({"_id": user_id})
        if doc:
            doc["id"] = str(doc.pop("_id"))
        return doc

    def list_users(self) -> list:
        docs = list(self.db["users"].find())
        for d in docs:
            d["id"] = str(d.pop("_id"))
        return docs

    def create_user(self, *, name: str, email: str, hashed_password: str,
                    roles: list, created_by: str, must_reset_password: bool = True) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        user_id = str(uuid.uuid4())
        doc = {
            "_id": user_id,
            "name": name,
            "email": email.lower(),
            "hashed_password": hashed_password,
            "roles": roles,
            "status": "active",
            "must_reset_password": must_reset_password,
            "password_history": [hashed_password],
            "password_changed_at": now,
            "last_login_at": None,
            "created_at": now,
            "created_by": created_by,
        }
        self.db["users"].insert_one(doc)
        doc["id"] = doc.pop("_id")
        return doc

    def update_user(self, user_id: str, updates: dict) -> bool:
        result = self.db["users"].update_one({"_id": user_id}, {"$set": updates})
        return result.modified_count > 0

    def delete_user(self, user_id: str) -> bool:
        result = self.db["users"].delete_one({"_id": user_id})
        return result.deleted_count > 0

    # ── Access requests ────────────────────────────────────────────────────

    def create_request(self, *, name: str, email: str, department: str, reason: str) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        req_id = str(uuid.uuid4())
        doc = {
            "_id": req_id,
            "name": name,
            "email": email.lower(),
            "department": department,
            "reason": reason,
            "status": "pending",
            "actioned_by": None,
            "actioned_at": None,
            "rejection_note": None,
            "created_at": now,
        }
        self.db["access_requests"].insert_one(doc)
        doc["id"] = doc.pop("_id")
        return doc

    def get_request_by_email(self, email: str) -> Optional[dict]:
        doc = self.db["access_requests"].find_one(
            {"email": email.lower()},
            sort=[("created_at", pymongo.DESCENDING)]
        )
        if doc:
            doc["id"] = str(doc.pop("_id"))
        return doc

    def list_requests(self, status: Optional[str] = None) -> list:
        filt = {"status": status} if status else {}
        docs = list(self.db["access_requests"].find(filt, sort=[("created_at", pymongo.DESCENDING)]))
        for d in docs:
            d["id"] = str(d.pop("_id"))
        return docs

    def update_request(self, req_id: str, updates: dict) -> bool:
        result = self.db["access_requests"].update_one({"_id": req_id}, {"$set": updates})
        return result.modified_count > 0

    # ── Audit log ──────────────────────────────────────────────────────────

    def log_audit(self, *, actor_email: str, action: str, target: str, detail: str = "") -> None:
        self.db["audit_log"].insert_one({
            "actor_email": actor_email,
            "action": action,
            "target": target,
            "detail": detail,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def list_audit_log(self, limit: int = 200) -> list:
        docs = list(self.db["audit_log"].find(
            {}, sort=[("timestamp", pymongo.DESCENDING)], limit=limit
        ))
        for d in docs:
            d["id"] = str(d.pop("_id"))
        return docs
```

- [ ] **Step 4: Run tests**
```bash
cd api && python -m pytest tests/test_user_store.py -v
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add api/utils/user_store.py api/tests/test_user_store.py
git commit -m "feat(auth): add UserStore for users, access_requests, audit_log"
```

---

## Task 3: Seed default user + password policy (`api/utils/seed.py`)

**Files:**
- Create: `api/utils/seed.py`

- [ ] **Step 1: Create `api/utils/seed.py`**

```python
import os
from passlib.context import CryptContext
from utils.user_store import UserStore

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def run_seed(db) -> None:
    _seed_password_policy(db)
    _seed_admin_user(db)


def _seed_password_policy(db) -> None:
    col = db["password_policy"]
    if col.count_documents({}) == 0:
        col.insert_one({
            "_id": "default",
            "min_length": 12,
            "require_uppercase": True,
            "require_lowercase": True,
            "require_number": True,
            "require_symbol": True,
            "no_reuse_count": 5,
            "expiry_days": 90,
        })


def _seed_admin_user(db) -> None:
    store = UserStore(db)
    if store.get_by_email("kvarma9@gmail.com"):
        return
    store.create_user(
        name="Kartik",
        email="kvarma9@gmail.com",
        hashed_password=pwd_context.hash("Password@1234!"),
        roles=["admin"],
        created_by="system",
        must_reset_password=False,
    )


def get_password_policy(db) -> dict:
    doc = db["password_policy"].find_one({"_id": "default"})
    if not doc:
        return {
            "min_length": 12, "require_uppercase": True, "require_lowercase": True,
            "require_number": True, "require_symbol": True,
            "no_reuse_count": 5, "expiry_days": 90,
        }
    doc.pop("_id", None)
    return doc
```

- [ ] **Step 2: Commit**
```bash
git add api/utils/seed.py
git commit -m "feat(auth): seed default admin (Kartik) and password policy on startup"
```

---

## Task 4: Password policy validator (`api/utils/password_policy.py`)

**Files:**
- Create: `api/utils/password_policy.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_password_policy.py`:
```python
from utils.password_policy import validate_password, check_no_reuse
from passlib.context import CryptContext

POLICY = {
    "min_length": 12, "require_uppercase": True, "require_lowercase": True,
    "require_number": True, "require_symbol": True,
    "no_reuse_count": 5, "expiry_days": 90,
}

def test_valid_password_passes():
    errors = validate_password("ValidPass1!", POLICY)
    assert errors == []

def test_short_password_fails():
    errors = validate_password("Short1!", POLICY)
    assert any("12" in e for e in errors)

def test_missing_uppercase_fails():
    errors = validate_password("validpass1!", POLICY)
    assert any("uppercase" in e.lower() for e in errors)

def test_missing_symbol_fails():
    errors = validate_password("ValidPass123", POLICY)
    assert any("symbol" in e.lower() for e in errors)

def test_no_reuse_detects_previous_password():
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    old_hash = pwd_ctx.hash("ValidPass1!")
    result = check_no_reuse("ValidPass1!", [old_hash], pwd_ctx, 5)
    assert result is False

def test_no_reuse_allows_new_password():
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    old_hash = pwd_ctx.hash("OldPass1!")
    result = check_no_reuse("NewPass2@", [old_hash], pwd_ctx, 5)
    assert result is True
```

- [ ] **Step 2: Run to verify failure**
```bash
cd api && python -m pytest tests/test_password_policy.py -v
```
Expected: `ImportError: No module named 'utils.password_policy'`

- [ ] **Step 3: Implement `api/utils/password_policy.py`**

```python
import re
from typing import List
from passlib.context import CryptContext


def validate_password(password: str, policy: dict) -> List[str]:
    errors = []
    if len(password) < policy.get("min_length", 12):
        errors.append(f"Password must be at least {policy['min_length']} characters.")
    if policy.get("require_uppercase") and not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter.")
    if policy.get("require_lowercase") and not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter.")
    if policy.get("require_number") and not re.search(r"\d", password):
        errors.append("Password must contain at least one number.")
    if policy.get("require_symbol") and not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password):
        errors.append("Password must contain at least one symbol.")
    return errors


def check_no_reuse(new_password: str, history: List[str], pwd_ctx: CryptContext, limit: int) -> bool:
    """Returns True if the new password is NOT in the recent history (allowed)."""
    for old_hash in history[-limit:]:
        if pwd_ctx.verify(new_password, old_hash):
            return False
    return True
```

- [ ] **Step 4: Run tests**
```bash
cd api && python -m pytest tests/test_password_policy.py -v
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add api/utils/password_policy.py api/tests/test_password_policy.py
git commit -m "feat(auth): password policy validator with complexity and no-reuse checks"
```

---

## Task 5: JWT auth utilities (`api/utils/auth.py`)

**Files:**
- Create: `api/utils/auth.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_auth_utils.py`:
```python
import os
os.environ["JWT_SECRET_KEY"] = "test-secret"
from utils.auth import create_access_token, decode_access_token

def test_roundtrip_token():
    token = create_access_token({"sub": "user@example.com", "roles": ["viewer"]})
    payload = decode_access_token(token)
    assert payload["sub"] == "user@example.com"
    assert payload["roles"] == ["viewer"]

def test_invalid_token_returns_none():
    result = decode_access_token("not.a.valid.token")
    assert result is None
```

- [ ] **Step 2: Run to verify failure**
```bash
cd api && python -m pytest tests/test_auth_utils.py -v
```
Expected: `ImportError`

- [ ] **Step 3: Implement `api/utils/auth.py`**

```python
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Cookie

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


async def get_current_user(authorization: Optional[str] = None) -> dict:
    """FastAPI dependency — reads Bearer token from Authorization header."""
    from fastapi import Request
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.startswith("Bearer "):
        raise credentials_exception
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    return payload  # {"sub": email, "roles": [...], "name": ..., "must_reset_password": bool}


def require_roles(*required_roles: str):
    """Dependency factory — raises 403 if user lacks ALL of the required roles."""
    async def check(user: dict = Depends(get_current_user)) -> dict:
        user_roles = set(user.get("roles", []))
        if not any(r in user_roles for r in required_roles):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return check
```

> **Note:** The `get_current_user` dependency reads the `Authorization` header forwarded by the Express BFF. Routers import `get_current_user` and `require_roles` from this module.

- [ ] **Step 4: Fix the dependency signature for FastAPI header injection**

Replace the `get_current_user` function with the proper FastAPI `Header` dependency:

```python
from fastapi import Header

async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.startswith("Bearer "):
        raise credentials_exception
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    return payload
```

- [ ] **Step 5: Run tests**
```bash
cd api && python -m pytest tests/test_auth_utils.py -v
```
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**
```bash
git add api/utils/auth.py api/tests/test_auth_utils.py
git commit -m "feat(auth): JWT encode/decode, get_current_user dependency, require_roles factory"
```

---

## Task 6: Auth router (`api/routers/auth.py`)

**Files:**
- Create: `api/routers/auth.py`
- Create: `api/tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_auth.py`:
```python
import os
os.environ["JWT_SECRET_KEY"] = "test-secret"
os.environ["MONGO_URI"] = "mongodb://localhost:27017"

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from fastapi import FastAPI
from routers.auth import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)

MOCK_USER = {
    "id": "user-1",
    "name": "Kartik",
    "email": "kvarma9@gmail.com",
    "hashed_password": "$2b$12$placeholder",
    "roles": ["admin"],
    "status": "active",
    "must_reset_password": False,
    "password_history": [],
    "password_changed_at": "2026-01-01T00:00:00+00:00",
}

def test_login_wrong_password_returns_401():
    with patch("routers.auth.UserStore") as MockStore, \
         patch("routers.auth.pwd_context") as mock_ctx:
        MockStore.return_value.get_by_email.return_value = MOCK_USER
        mock_ctx.verify.return_value = False
        resp = client.post("/auth/login", json={"email": "kvarma9@gmail.com", "password": "wrong"})
    assert resp.status_code == 401

def test_login_disabled_user_returns_401():
    disabled = {**MOCK_USER, "status": "disabled"}
    with patch("routers.auth.UserStore") as MockStore, \
         patch("routers.auth.pwd_context") as mock_ctx:
        MockStore.return_value.get_by_email.return_value = disabled
        mock_ctx.verify.return_value = True
        resp = client.post("/auth/login", json={"email": "kvarma9@gmail.com", "password": "Password@1234!"})
    assert resp.status_code == 401
```

- [ ] **Step 2: Run to verify failure**
```bash
cd api && python -m pytest tests/test_auth.py -v
```
Expected: `ImportError: cannot import name 'router' from 'routers.auth'`

- [ ] **Step 3: Implement `api/routers/auth.py`**

```python
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from utils.user_store import UserStore
from utils.auth import create_access_token, get_current_user, pwd_context
from utils.password_policy import validate_password, check_no_reuse
from utils.seed import get_password_policy

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(body: LoginRequest):
    store = UserStore()
    user = store.get_by_email(body.email)
    if not user or not pwd_context.verify(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user["status"] == "disabled":
        raise HTTPException(status_code=401, detail="Account is disabled. Contact your administrator.")

    # Check password expiry
    db = store.db
    policy = get_password_policy(db)
    expiry_days = policy.get("expiry_days", 0)
    must_reset = user.get("must_reset_password", False)
    if expiry_days > 0 and not must_reset:
        from datetime import timedelta
        from dateutil.parser import parse as parse_dt
        changed_at = parse_dt(user["password_changed_at"])
        if datetime.now(timezone.utc) > changed_at + timedelta(days=expiry_days):
            must_reset = True
            store.update_user(user["id"], {"must_reset_password": True})

    store.update_user(user["id"], {"last_login_at": datetime.now(timezone.utc).isoformat()})
    store.log_audit(actor_email=user["email"], action="login", target=user["email"])

    token = create_access_token({
        "sub": user["email"],
        "name": user["name"],
        "roles": user["roles"],
        "user_id": user["id"],
        "must_reset_password": must_reset,
    })

    from fastapi.responses import JSONResponse
    response = JSONResponse({
        "user": {
            "email": user["email"],
            "name": user["name"],
            "roles": user["roles"],
            "must_reset_password": must_reset,
        }
    })
    response.set_cookie(
        key="ct3_token",
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=8 * 3600,
    )
    return response


@router.post("/logout")
def logout():
    from fastapi.responses import JSONResponse
    response = JSONResponse({"ok": True})
    response.delete_cookie("ct3_token", path="/")
    return response


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    store = UserStore()
    db_user = store.get_by_email(user["sub"])
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not pwd_context.verify(body.current_password, db_user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    policy = get_password_policy(store.db)
    errors = validate_password(body.new_password, policy)
    if errors:
        raise HTTPException(status_code=400, detail=errors)

    if not check_no_reuse(body.new_password, db_user.get("password_history", []), pwd_context, policy.get("no_reuse_count", 5)):
        raise HTTPException(status_code=400, detail="Password was recently used. Choose a different password.")

    new_hash = pwd_context.hash(body.new_password)
    history = db_user.get("password_history", [])[-9:] + [new_hash]
    store.update_user(db_user["id"], {
        "hashed_password": new_hash,
        "password_history": history,
        "must_reset_password": False,
        "password_changed_at": datetime.now(timezone.utc).isoformat(),
    })
    store.log_audit(actor_email=user["sub"], action="password_change", target=user["sub"])
    return {"ok": True}


@router.get("/policy")
def get_policy():
    """Public — React needs this to show policy rules on set-password page without auth."""
    store = UserStore()
    policy = get_password_policy(store.db)
    return policy
```

- [ ] **Step 4: Run tests**
```bash
cd api && python -m pytest tests/test_auth.py -v
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add api/routers/auth.py api/tests/test_auth.py
git commit -m "feat(auth): auth router — login, logout, change-password with JWT cookie"
```

---

## Task 7: Admin router (`api/routers/admin.py`)

**Files:**
- Create: `api/routers/admin.py`
- Create: `api/tests/test_admin.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_admin.py`:
```python
import os
os.environ["JWT_SECRET_KEY"] = "test-secret"
os.environ["MONGO_URI"] = "mongodb://localhost:27017"

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from fastapi import FastAPI
from routers.admin import router
from utils.auth import create_access_token

app = FastAPI()
app.include_router(router)
client = TestClient(app)

def admin_headers():
    token = create_access_token({"sub": "admin@test.com", "roles": ["admin"], "name": "Admin"})
    return {"Authorization": f"Bearer {token}"}

def analyst_headers():
    token = create_access_token({"sub": "analyst@test.com", "roles": ["analyst"], "name": "Analyst"})
    return {"Authorization": f"Bearer {token}"}

def test_list_users_requires_admin():
    with patch("routers.admin.UserStore"):
        resp = client.get("/admin/users", headers=analyst_headers())
    assert resp.status_code == 403

def test_list_users_returns_list_for_admin():
    with patch("routers.admin.UserStore") as MockStore:
        MockStore.return_value.list_users.return_value = []
        resp = client.get("/admin/users", headers=admin_headers())
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_approve_request_requires_admin():
    with patch("routers.admin.UserStore"):
        resp = client.post("/admin/requests/req-1/approve",
                           json={"roles": ["viewer"]}, headers=analyst_headers())
    assert resp.status_code == 403
```

- [ ] **Step 2: Run to verify failure**
```bash
cd api && python -m pytest tests/test_admin.py -v
```
Expected: `ImportError`

- [ ] **Step 3: Implement `api/routers/admin.py`**

```python
import os, secrets, string
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from utils.user_store import UserStore
from utils.auth import require_roles, get_current_user, pwd_context
from utils.password_policy import validate_password
from utils.seed import get_password_policy

router = APIRouter(prefix="/admin", tags=["admin"])
_require_admin = require_roles("admin")


def _generate_temp_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ── Users ──────────────────────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    name: str
    email: str
    roles: List[str]


class UpdateRolesBody(BaseModel):
    roles: List[str]


@router.get("/users")
def list_users(admin: dict = Depends(_require_admin)):
    store = UserStore()
    users = store.list_users()
    return [{k: v for k, v in u.items() if k != "hashed_password" and k != "password_history"} for u in users]


@router.post("/users")
def create_user(body: CreateUserBody, admin: dict = Depends(_require_admin)):
    store = UserStore()
    if store.get_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already in use.")
    temp_pw = _generate_temp_password()
    user = store.create_user(
        name=body.name, email=body.email,
        hashed_password=pwd_context.hash(temp_pw),
        roles=body.roles, created_by=admin["sub"],
    )
    store.log_audit(actor_email=admin["sub"], action="user_created", target=body.email)
    safe = {k: v for k, v in user.items() if k not in ("hashed_password", "password_history")}
    return {**safe, "temp_password": temp_pw}


@router.patch("/users/{user_id}/roles")
def update_roles(user_id: str, body: UpdateRolesBody, admin: dict = Depends(_require_admin)):
    store = UserStore()
    if not store.update_user(user_id, {"roles": body.roles}):
        raise HTTPException(status_code=404, detail="User not found.")
    store.log_audit(actor_email=admin["sub"], action="roles_updated",
                    target=user_id, detail=str(body.roles))
    return {"ok": True}


@router.patch("/users/{user_id}/status")
def set_status(user_id: str, status: str, admin: dict = Depends(_require_admin)):
    if status not in ("active", "disabled"):
        raise HTTPException(status_code=400, detail="status must be 'active' or 'disabled'")
    store = UserStore()
    if not store.update_user(user_id, {"status": status}):
        raise HTTPException(status_code=404, detail="User not found.")
    store.log_audit(actor_email=admin["sub"], action=f"user_{status}", target=user_id)
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict = Depends(_require_admin)):
    store = UserStore()
    if not store.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found.")
    store.log_audit(actor_email=admin["sub"], action="user_deleted", target=user_id)
    return {"ok": True}


# ── Access requests ────────────────────────────────────────────────────────

class AccessRequestBody(BaseModel):
    name: str
    email: str
    department: str
    reason: str


class ApproveRequestBody(BaseModel):
    roles: List[str]


class RejectRequestBody(BaseModel):
    rejection_note: Optional[str] = ""


@router.post("/requests")
def submit_request(body: AccessRequestBody):
    """Public — no auth required."""
    store = UserStore()
    existing = store.get_request_by_email(body.email)
    if existing and existing["status"] == "pending":
        raise HTTPException(status_code=400, detail="A pending request already exists for this email.")
    req = store.create_request(
        name=body.name, email=body.email,
        department=body.department, reason=body.reason,
    )
    return {"id": req["id"], "status": "pending"}


@router.get("/requests/status")
def check_request_status(email: str):
    """Public — returns only status + rejection_note for the given email."""
    store = UserStore()
    req = store.get_request_by_email(email)
    if not req:
        raise HTTPException(status_code=404, detail="No request found for this email.")
    return {"status": req["status"], "rejection_note": req.get("rejection_note")}


@router.get("/requests")
def list_requests(status: Optional[str] = None, admin: dict = Depends(_require_admin)):
    store = UserStore()
    return store.list_requests(status=status)


@router.post("/requests/{req_id}/approve")
def approve_request(req_id: str, body: ApproveRequestBody, admin: dict = Depends(_require_admin)):
    store = UserStore()
    req = store.db["access_requests"].find_one({"_id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")
    if store.get_by_email(req["email"]):
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    temp_pw = _generate_temp_password()
    user = store.create_user(
        name=req["name"], email=req["email"],
        hashed_password=pwd_context.hash(temp_pw),
        roles=body.roles, created_by=admin["sub"],
    )
    now = datetime.now(timezone.utc).isoformat()
    store.update_request(req_id, {
        "status": "approved", "actioned_by": admin["sub"], "actioned_at": now,
    })
    store.log_audit(actor_email=admin["sub"], action="request_approved", target=req["email"])
    safe = {k: v for k, v in user.items() if k not in ("hashed_password", "password_history")}
    return {**safe, "temp_password": temp_pw}


@router.post("/requests/{req_id}/reject")
def reject_request(req_id: str, body: RejectRequestBody, admin: dict = Depends(_require_admin)):
    store = UserStore()
    req = store.db["access_requests"].find_one({"_id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")
    now = datetime.now(timezone.utc).isoformat()
    store.update_request(req_id, {
        "status": "rejected", "actioned_by": admin["sub"],
        "actioned_at": now, "rejection_note": body.rejection_note,
    })
    store.log_audit(actor_email=admin["sub"], action="request_rejected", target=req["email"])
    return {"ok": True}


# ── Password policy ────────────────────────────────────────────────────────

class PolicyBody(BaseModel):
    min_length: int
    require_uppercase: bool
    require_lowercase: bool
    require_number: bool
    require_symbol: bool
    no_reuse_count: int
    expiry_days: int


@router.get("/policy")
def get_policy(admin: dict = Depends(_require_admin)):
    store = UserStore()
    return get_password_policy(store.db)


@router.put("/policy")
def update_policy(body: PolicyBody, admin: dict = Depends(_require_admin)):
    store = UserStore()
    store.db["password_policy"].update_one(
        {"_id": "default"}, {"$set": body.model_dump()}, upsert=True
    )
    store.log_audit(actor_email=admin["sub"], action="policy_updated", target="password_policy")
    return {"ok": True}


# ── Audit log ──────────────────────────────────────────────────────────────

@router.get("/audit-log")
def get_audit_log(admin: dict = Depends(_require_admin)):
    store = UserStore()
    return store.list_audit_log(limit=500)
```

- [ ] **Step 4: Run tests**
```bash
cd api && python -m pytest tests/test_admin.py -v
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add api/routers/admin.py api/tests/test_admin.py
git commit -m "feat(auth): admin router — user CRUD, access requests, password policy, audit log"
```

---

## Task 8: Wire routers + seed into `main.py`

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Add startup seed and include routers**

Find the `@asynccontextmanager` lifespan or startup section in `api/main.py`. Add the following imports near the top (after existing imports):

```python
from routers.auth import router as auth_router
from routers.admin import router as admin_router
from utils.seed import run_seed
```

- [ ] **Step 2: Add seed call in the lifespan/startup**

Find where other startup logic runs (e.g. the existing `lifespan` function or `@app.on_event("startup")`). Add:

```python
# Inside lifespan or startup handler, after MongoDB client is available:
import pymongo as _pymongo
_seed_db = _pymongo.MongoClient(os.environ.get("MONGO_URI", "mongodb://localhost:27017"))["trace_db"]
run_seed(_seed_db)
```

If there is no existing lifespan, add a startup event after `app = FastAPI(...)`:

```python
@app.on_event("startup")
def startup_event():
    import pymongo as _pymongo
    _seed_db = _pymongo.MongoClient(os.environ.get("MONGO_URI", "mongodb://localhost:27017"))["trace_db"]
    run_seed(_seed_db)
```

- [ ] **Step 3: Include the new routers**

Find the block where existing routers are included (e.g. `app.include_router(assets_router)`). Add:

```python
app.include_router(auth_router)
app.include_router(admin_router)
```

- [ ] **Step 4: Rebuild and verify endpoints appear**
```bash
docker compose up --build -d fastapi_api
docker logs controltester_3000_kv-fastapi_api-1 --tail 30
```
Then visit `http://localhost:8000/docs` — confirm `/auth/login`, `/auth/logout`, `/admin/users`, etc. appear.

- [ ] **Step 5: Smoke-test the seed**
```bash
docker exec controltester_3000_kv-fastapi_api-1 python -c "
import pymongo, os
db = pymongo.MongoClient(os.environ['MONGO_URI'])['trace_db']
print('users:', db['users'].count_documents({}))
print('policy:', db['password_policy'].count_documents({}))
"
```
Expected: `users: 1`, `policy: 1`

- [ ] **Step 6: Test login with seed user**
```bash
curl -c /tmp/cookies.txt -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kvarma9@gmail.com","password":"Password@1234!"}'
```
Expected: `{"user": {"email": "kvarma9@gmail.com", "roles": ["admin"], ...}}`

- [ ] **Step 7: Commit**
```bash
git add api/main.py
git commit -m "feat(auth): wire auth+admin routers and startup seed into main.py"
```

---

## Task 9: Role-gate existing FastAPI routers

**Files:**
- Modify: `api/routers/assets.py`
- Modify: `api/routers/issues.py`
- Modify: `api/routers/control_testing.py`
- Modify: `api/routers/risk_assessment.py`
- Modify: `api/routers/validation_queue.py`

Apply the same pattern to each file. Read each file before editing.

- [ ] **Step 1: assets.py — add auth imports and gate write endpoints**

Add near top of `api/routers/assets.py`:
```python
from fastapi import Depends
from utils.auth import get_current_user, require_roles
_require_analyst = require_roles("analyst", "manager", "admin")
_require_manager  = require_roles("manager", "admin")
```

Add `user: dict = Depends(get_current_user)` to every GET endpoint, and `user: dict = Depends(_require_analyst)` to POST/PUT/PATCH endpoints, and `user: dict = Depends(_require_manager)` to DELETE endpoints.

- [ ] **Step 2: issues.py — gate write and close endpoints**

Same import pattern. Apply `_require_analyst` to create/edit, `_require_manager` to close/delete.

- [ ] **Step 3: control_testing.py — gate session creation and deletion**

Apply `_require_analyst` to session creation and evidence upload, `_require_manager` to delete.

- [ ] **Step 4: risk_assessment.py — gate session creation and deletion**

Apply `_require_analyst` to create/start, `_require_manager` to delete.

- [ ] **Step 5: validation_queue.py — gate accept/dismiss**

Apply `_require_manager = require_roles("manager", "admin")` to accept and dismiss endpoints.

- [ ] **Step 6: Run all existing tests to check nothing broke**
```bash
cd api && python -m pytest tests/ -v
```
Expected: all tests pass.

- [ ] **Step 7: Commit**
```bash
git add api/routers/assets.py api/routers/issues.py api/routers/control_testing.py \
        api/routers/risk_assessment.py api/routers/validation_queue.py
git commit -m "feat(auth): role-gate all existing FastAPI routers with require_roles"
```

---

## Task 10: Express BFF auth middleware (`kpmg_ui/server/routes.ts`)

**Files:**
- Modify: `kpmg_ui/server/routes.ts`

Read the file fully before editing.

- [ ] **Step 1: Add cookie-parser**
```bash
cd kpmg_ui && npm install cookie-parser @types/cookie-parser
```

- [ ] **Step 2: Import and register cookie-parser in `kpmg_ui/server/index.ts`**

Find where `app.use(express.json())` is called. Add before it:
```typescript
import cookieParser from "cookie-parser";
app.use(cookieParser());
```

- [ ] **Step 3: Update `proxyToFastAPI` in `routes.ts` to forward the JWT cookie as Bearer**

In the `proxyToFastAPI` function, find where `headers["host"] = url.host` is set. Add immediately after:
```typescript
const token = (req as any).cookies?.ct3_token;
if (token) {
  headers["authorization"] = `Bearer ${token}`;
}
```

- [ ] **Step 4: Add auth guard middleware before the proxy handler**

Find where `app.all("/api/*", proxyToFastAPI)` is registered. Replace it with:
```typescript
const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/policy",
                           "/api/admin/requests", "/api/admin/requests/status"];

app.all("/api/*", (req, res, next) => {
  const isPublic = PUBLIC_API_PATHS.some(p => req.path === p || req.path.startsWith(p));
  if (!isPublic && !(req as any).cookies?.ct3_token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}, proxyToFastAPI);
```

- [ ] **Step 5: Rebuild UI and verify auth flows**
```bash
docker compose up --build -d web_ui_agent
docker logs controltester_3000_kv-web_ui_agent-1 --tail 20
```

- [ ] **Step 6: Commit**
```bash
git add kpmg_ui/server/routes.ts kpmg_ui/server/index.ts kpmg_ui/package.json kpmg_ui/package-lock.json
git commit -m "feat(auth): Express BFF forwards JWT cookie as Bearer, blocks unauthenticated /api/* requests"
```

---

## Task 11: AuthContext rewrite (`kpmg_ui/client/src/contexts/AuthContext.tsx`)

**Files:**
- Modify: `kpmg_ui/client/src/contexts/AuthContext.tsx`

Read the full file before editing.

- [ ] **Step 1: Rewrite `AuthContext.tsx`**

Replace the entire file content with:
```typescript
import { createContext, useContext, useState, ReactNode } from "react";

export type UserRole = "viewer" | "analyst" | "manager" | "admin";

export type User = {
  email: string;
  name: string;
  roles: UserRole[];
  must_reset_password: boolean;
};

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: (updates: Partial<User>) => void;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = sessionStorage.getItem("ct3_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { ok: false, error: data.detail ?? "Login failed." };
      }
      const data = await resp.json();
      const u: User = data.user;
      sessionStorage.setItem("ct3_user", JSON.stringify(u));
      setUser(u);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Please try again." };
    }
  }

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    sessionStorage.removeItem("ct3_user");
    setUser(null);
  }

  function refreshUser(updates: Partial<User>): void {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      sessionStorage.setItem("ct3_user", JSON.stringify(updated));
      return updated;
    });
  }

  function hasRole(role: UserRole): boolean {
    return user?.roles.includes(role) ?? false;
  }

  function hasAnyRole(...roles: UserRole[]): boolean {
    return roles.some(r => user?.roles.includes(r)) ?? false;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, hasRole, hasAnyRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Run TypeScript check**
```bash
cd kpmg_ui && npm run check
```
Expected: no errors in AuthContext.tsx (other pre-existing errors are acceptable).

- [ ] **Step 3: Commit**
```bash
git add kpmg_ui/client/src/contexts/AuthContext.tsx
git commit -m "feat(auth): rewrite AuthContext — server-side JWT, add roles, hasRole(), hasAnyRole()"
```

---

## Task 12: App.tsx routing — new pages + force-reset guard

**Files:**
- Modify: `kpmg_ui/client/src/App.tsx`

Read the full file before editing.

- [ ] **Step 1: Add imports for new pages**

Add after the existing page imports:
```typescript
import RequestAccessPage from "@/pages/request-access";
import SetPasswordPage from "@/pages/set-password";
import AdminPage from "@/pages/admin";
```

- [ ] **Step 2: Add force-reset redirect and new route cases in `Router()`**

In the `Router` function, find the block that checks `if (!user)` and the `location === "/login"` check. Add the force-reset guard immediately after the `!user` check block:

```typescript
// Force password reset — must happen before any other authenticated route
if (user && user.must_reset_password && location !== "/set-password") {
  return <SetPasswordPage />;
}
```

Add new route cases before the final `return (<AppLayout>...)`:
```typescript
if (location === "/request-access") {
  return <RequestAccessPage />;
}

if (location === "/set-password") {
  return <SetPasswordPage />;
}

if (location === "/admin") {
  if (!user?.roles.includes("admin")) return <div className="p-8 text-red-500">Access denied.</div>;
  return <AdminPage />;
}
```

- [ ] **Step 3: Run TypeScript check**
```bash
cd kpmg_ui && npm run check
```
Expected: only errors about missing page files (next tasks fix those).

- [ ] **Step 4: Commit**
```bash
git add kpmg_ui/client/src/App.tsx
git commit -m "feat(auth): add request-access, set-password, admin routes with force-reset guard"
```

---

## Task 13: Login page update (`kpmg_ui/client/src/pages/login.tsx`)

**Files:**
- Modify: `kpmg_ui/client/src/pages/login.tsx`

Read the full file before editing.

- [ ] **Step 1: Remove register dialog, update login call, add Request Access link**

Make these targeted edits:

1. Remove all register state variables (`showRegister`, `regName`, `regEmail`, `regPassword`, `regConfirm`, `regError`, `registering`) and the `handleRegister` function.

2. Change `login` call from synchronous to async:
```typescript
async function handleLogin(e: React.FormEvent) {
  e.preventDefault();
  setLoggingIn(true);
  setLoginError("");
  const result = await login(email.trim(), password);
  if (result.ok) {
    setLocation("/landing");
  } else {
    setLoginError(result.error ?? "Login failed.");
  }
  setLoggingIn(false);
}
```

3. Replace the "New user?" paragraph and Register Dialog with:
```typescript
<p className="mt-6 text-sm text-[#7A8FA8]">
  Need access?{" "}
  <button
    type="button"
    className="font-semibold text-[#1E49E2] hover:text-[#00338D] transition-colors"
    onClick={() => setLocation("/request-access")}
  >
    Request Access
  </button>
</p>
```

4. Remove the `<Dialog>` import and the entire `<Dialog>` JSX block.

- [ ] **Step 2: TypeScript check**
```bash
cd kpmg_ui && npm run check
```

- [ ] **Step 3: Commit**
```bash
git add kpmg_ui/client/src/pages/login.tsx
git commit -m "feat(auth): replace register dialog with Request Access link on login page"
```

---

## Task 14: `/request-access` page

**Files:**
- Create: `kpmg_ui/client/src/pages/request-access.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

export default function RequestAccessPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"request" | "check">("request");

  // Request form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Status check state
  const [checkEmail, setCheckEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ status: string; rejection_note?: string } | null>(null);
  const [checkError, setCheckError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const resp = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, department, reason }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail ?? "Submission failed.");
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setCheckError("");
    setCheckResult(null);
    try {
      const resp = await fetch(`/api/admin/requests/status?email=${encodeURIComponent(checkEmail)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail ?? "No request found.");
      setCheckResult(data);
    } catch (err: any) {
      setCheckError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const statusColor = checkResult?.status === "approved" ? "text-green-600"
    : checkResult?.status === "rejected" ? "text-red-600" : "text-amber-600";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060e1a] px-4">
      <div className="w-full max-w-md">
        <button onClick={() => setLocation("/login")}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sign In
        </button>

        <div className="rounded-2xl border border-white/10 bg-white p-8">
          <div
            className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
            style={{ background: "linear-gradient(90deg, #7213EA 0%, #1E49E2 56%, #00B8F5 100%)" }}
          />
          <h1 className="text-2xl font-bold text-[#0C233C] mb-1">Request Access</h1>
          <p className="text-sm text-[#5A6B82] mb-6">
            Submit a request to join TRACE. An administrator will review it.
          </p>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {(["request", "check"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  tab === t ? "bg-[#1E49E2] text-white" : "bg-[#F3F7FF] text-[#5A6B82] hover:bg-[#E8F0FE]"
                }`}>
                {t === "request" ? "New Request" : "Check Status"}
              </button>
            ))}
          </div>

          {tab === "request" && !submitted && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {[
                { id: "name", label: "Full Name", value: name, set: setName, placeholder: "Jane Smith" },
                { id: "email", label: "Work Email", value: email, set: setEmail, placeholder: "jane@company.com", type: "email" },
                { id: "dept", label: "Department", value: department, set: setDepartment, placeholder: "Internal Audit" },
              ].map(f => (
                <div key={f.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={f.id} className="text-[11px] font-bold uppercase tracking-[.14em] text-[#5A6B82]">{f.label}</Label>
                  <Input id={f.id} type={f.type ?? "text"} value={f.value} required
                    onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                    className="h-11 rounded-xl border-[#D6E2F5] bg-[#F7FAFF]" />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason" className="text-[11px] font-bold uppercase tracking-[.14em] text-[#5A6B82]">Reason for Access</Label>
                <textarea id="reason" value={reason} required onChange={e => setReason(e.target.value)}
                  placeholder="Briefly explain why you need access to TRACE..."
                  className="min-h-[80px] rounded-xl border border-[#D6E2F5] bg-[#F7FAFF] px-3 py-2 text-sm text-[#0C233C] resize-none focus:outline-none focus:ring-2 focus:ring-[#1E49E2]/30" />
              </div>
              {submitError && <p className="text-sm text-red-500">{submitError}</p>}
              <Button type="submit" disabled={submitting} className="h-11 rounded-xl"
                style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
                {submitting ? "Submitting…" : "Submit Request"}
              </Button>
            </form>
          )}

          {tab === "request" && submitted && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">⏳</div>
              <p className="font-semibold text-[#0C233C]">Request submitted!</p>
              <p className="text-sm text-[#5A6B82] mt-1">An administrator will review your request.</p>
              <button onClick={() => { setTab("check"); setCheckEmail(email); }}
                className="mt-4 text-sm text-[#1E49E2] hover:underline">Check status →</button>
            </div>
          )}

          {tab === "check" && (
            <form onSubmit={handleCheck} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="check-email" className="text-[11px] font-bold uppercase tracking-[.14em] text-[#5A6B82]">Your Email</Label>
                <Input id="check-email" type="email" value={checkEmail} required
                  onChange={e => setCheckEmail(e.target.value)} placeholder="jane@company.com"
                  className="h-11 rounded-xl border-[#D6E2F5] bg-[#F7FAFF]" />
              </div>
              {checkError && <p className="text-sm text-red-500">{checkError}</p>}
              {checkResult && (
                <div className={`rounded-xl border p-4 text-sm ${
                  checkResult.status === "approved" ? "bg-green-50 border-green-200" :
                  checkResult.status === "rejected" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                }`}>
                  <p className={`font-semibold capitalize ${statusColor}`}>
                    {checkResult.status === "pending" ? "⏳ Pending review" :
                     checkResult.status === "approved" ? "✓ Approved — you can now sign in" :
                     "✗ Request not approved"}
                  </p>
                  {checkResult.rejection_note && (
                    <p className="text-[#5A6B82] mt-1">Reason: {checkResult.rejection_note}</p>
                  )}
                </div>
              )}
              <Button type="submit" disabled={checking} className="h-11 rounded-xl"
                style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
                {checking ? "Checking…" : "Check Status"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**
```bash
cd kpmg_ui && npm run check
```

- [ ] **Step 3: Commit**
```bash
git add kpmg_ui/client/src/pages/request-access.tsx
git commit -m "feat(auth): add /request-access page with request form and email status check"
```

---

## Task 15: `/set-password` page

**Files:**
- Create: `kpmg_ui/client/src/pages/set-password.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";

type Policy = {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number: boolean;
  require_symbol: boolean;
};

type Rule = { label: string; test: (p: string, policy: Policy) => boolean };

const RULES: Rule[] = [
  { label: "At least {min} characters", test: (p, pol) => p.length >= pol.min_length },
  { label: "One uppercase letter",       test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter",       test: (p) => /[a-z]/.test(p) },
  { label: "One number",                 test: (p) => /\d/.test(p) },
  { label: "One symbol",                 test: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(p) },
];

export default function SetPasswordPage() {
  const [, setLocation] = useLocation();
  const { user, logout, refreshUser } = useAuth();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/policy").then(r => r.json()).then(setPolicy).catch(() => {});
  }, []);

  const activeRules = RULES.filter(r => {
    if (r.label.includes("uppercase") && !policy?.require_uppercase) return false;
    if (r.label.includes("lowercase") && !policy?.require_lowercase) return false;
    if (r.label.includes("number") && !policy?.require_number) return false;
    if (r.label.includes("symbol") && !policy?.require_symbol) return false;
    return true;
  });

  const ruleLabel = (r: Rule) =>
    r.label.replace("{min}", String(policy?.min_length ?? 12));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true); setError("");
    try {
      const resp = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: currentPw, new_password: password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const msg = Array.isArray(data.detail) ? data.detail.join(" ") : (data.detail ?? "Failed.");
        setError(msg);
        return;
      }
      refreshUser({ must_reset_password: false });
      setLocation("/landing");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060e1a] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #7213EA 0%, #1E49E2 56%, #00B8F5 100%)" }}
        />
        <h1 className="text-2xl font-bold text-[#0C233C] mb-1">Set Your Password</h1>
        <p className="text-sm text-[#5A6B82] mb-6">
          {user?.must_reset_password
            ? "Your account requires a new password before continuing."
            : "Your password has expired. Please set a new one."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[.14em] text-[#5A6B82]">Temporary / Current Password</Label>
            <Input type="password" value={currentPw} required onChange={e => setCurrentPw(e.target.value)}
              placeholder="Enter the password you received" className="h-11 rounded-xl border-[#D6E2F5] bg-[#F7FAFF]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[.14em] text-[#5A6B82]">New Password</Label>
            <Input type="password" value={password} required onChange={e => setPassword(e.target.value)}
              placeholder="Choose a strong password" className="h-11 rounded-xl border-[#D6E2F5] bg-[#F7FAFF]" />
          </div>

          {/* Live policy checker */}
          {policy && password.length > 0 && (
            <div className="rounded-xl bg-[#F7FAFF] border border-[#D6E2F5] p-3 flex flex-col gap-1.5">
              {activeRules.map((r, i) => {
                const ok = r.test(password, policy);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {ok ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-red-400" />}
                    <span className={ok ? "text-green-700" : "text-[#5A6B82]"}>{ruleLabel(r)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-[.14em] text-[#5A6B82]">Confirm New Password</Label>
            <Input type="password" value={confirm} required onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password" className="h-11 rounded-xl border-[#D6E2F5] bg-[#F7FAFF]" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={saving} className="h-11 rounded-xl mt-1"
            style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
            {saving ? "Saving…" : "Set Password & Continue"}
          </Button>
        </form>

        <button onClick={logout} className="mt-4 w-full text-center text-xs text-[#5A6B82] hover:text-red-500 transition-colors">
          Sign out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**
```bash
cd kpmg_ui && npm run check
```

- [ ] **Step 3: Commit**
```bash
git add kpmg_ui/client/src/pages/set-password.tsx
git commit -m "feat(auth): add /set-password page with live policy checker, force-reset flow"
```

---

## Task 16: Admin Console page (`kpmg_ui/client/src/pages/admin.tsx`)

**Files:**
- Create: `kpmg_ui/client/src/pages/admin.tsx`

- [ ] **Step 1: Create the page with 4 tabs**

```typescript
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Users, ClipboardList, Lock, ScrollText, Plus, Check, X } from "lucide-react";

type Tab = "users" | "requests" | "policy" | "audit";

const ALL_ROLES = ["viewer", "analyst", "manager", "admin"] as const;
type Role = typeof ALL_ROLES[number];

const ROLE_COLORS: Record<Role, string> = {
  viewer:  "bg-slate-100 text-slate-600",
  analyst: "bg-amber-100 text-amber-700",
  manager: "bg-blue-100 text-blue-700",
  admin:   "bg-purple-100 text-purple-700",
};

// ── Shared fetch helper ────────────────────────────────────────────────────
async function apiFetch(path: string, opts: RequestInit = {}) {
  const resp = await fetch(path, { credentials: "include", ...opts });
  if (!resp.ok) {
    const d = await resp.json().catch(() => ({}));
    throw new Error(d.detail ?? "Request failed");
  }
  return resp.json();
}

// ── Users Tab ──────────────────────────────────────────────────────────────
function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRoles, setCreateRoles] = useState<Role[]>(["viewer"]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);

  const load = () => {
    setLoading(true);
    apiFetch("/api/admin/users").then(setUsers).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError("");
    try {
      const data = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, email: createEmail, roles: createRoles }),
      });
      setTempPw(data.temp_password);
      setCreateName(""); setCreateEmail(""); setCreateRoles(["viewer"]);
      load();
    } catch (err: any) { setCreateError(err.message); }
    finally { setCreating(false); }
  }

  async function handleUpdateRoles() {
    if (!editUser) return;
    await apiFetch(`/api/admin/users/${editUser.id}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: editRoles }),
    });
    setEditUser(null);
    load();
  }

  async function toggleStatus(u: any) {
    const next = u.status === "active" ? "disabled" : "active";
    await apiFetch(`/api/admin/users/${u.id}/status?status=${next}`, { method: "PATCH" });
    load();
  }

  async function handleDelete(u: any) {
    if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    await apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    load();
  }

  function toggleCreateRole(r: Role) {
    setCreateRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#0C233C]">Users</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}
          style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
          <Plus className="h-4 w-4 mr-1" /> Create User
        </Button>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
        <div className="rounded-xl border border-[#E2EBF8] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7FAFF]">
              <tr>
                {["Name", "Email", "Roles", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-[#E2EBF8] hover:bg-[#F7FAFF]">
                  <td className="px-4 py-3 font-medium text-[#0C233C]">{u.name}</td>
                  <td className="px-4 py-3 text-[#5A6B82]">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles as Role[]).map(r => (
                        <span key={r} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[r]}`}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => { setEditUser(u); setEditRoles(u.roles); }}
                        className="text-xs text-[#1E49E2] hover:underline">Roles</button>
                      <button onClick={() => toggleStatus(u)}
                        className="text-xs text-[#5A6B82] hover:underline disabled:opacity-40"
                        disabled={u.email === me?.email}>
                        {u.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => handleDelete(u)}
                        className="text-xs text-red-500 hover:underline disabled:opacity-40"
                        disabled={u.email === me?.email}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); setTempPw(null); setCreateError(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
          {tempPw ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-green-700 font-medium">User created successfully!</p>
              <div className="rounded-xl bg-[#F7FAFF] border border-[#D6E2F5] p-3">
                <p className="text-[11px] text-[#5A6B82] uppercase tracking-wider mb-1">Temporary Password</p>
                <p className="font-mono font-bold text-[#0C233C] text-lg">{tempPw}</p>
                <p className="text-xs text-[#5A6B82] mt-1">Share this with the user. They will be forced to change it on first login.</p>
              </div>
              <Button onClick={() => { setShowCreate(false); setTempPw(null); }}>Done</Button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">Full Name</Label>
                <Input value={createName} required onChange={e => setCreateName(e.target.value)} placeholder="Jane Smith" className="h-10 rounded-xl" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">Email</Label>
                <Input type="email" value={createEmail} required onChange={e => setCreateEmail(e.target.value)} placeholder="jane@company.com" className="h-10 rounded-xl" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map(r => (
                    <button key={r} type="button" onClick={() => toggleCreateRole(r)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        createRoles.includes(r) ? ROLE_COLORS[r] + " border-transparent" : "bg-white text-[#5A6B82] border-[#D6E2F5]"
                      }`}>{r}</button>
                  ))}
                </div>
              </div>
              {createError && <p className="text-sm text-red-500">{createError}</p>}
              <DialogFooter>
                <Button type="submit" disabled={creating || createRoles.length === 0}
                  style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
                  {creating ? "Creating…" : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Roles Dialog */}
      <Dialog open={!!editUser} onOpenChange={v => !v && setEditUser(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Edit Roles — {editUser?.name}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {ALL_ROLES.map(r => (
              <button key={r} type="button"
                onClick={() => setEditRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  editRoles.includes(r) ? ROLE_COLORS[r] + " border-transparent" : "bg-white text-[#5A6B82] border-[#D6E2F5]"
                }`}>{r}</button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleUpdateRoles} disabled={editRoles.length === 0}
              style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
              Save Roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Requests Tab ───────────────────────────────────────────────────────────
function RequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionReq, setActionReq] = useState<any | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(["viewer"]);
  const [rejectionNote, setRejectionNote] = useState("");
  const [actioning, setActioning] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = () => {
    setLoading(true);
    apiFetch("/api/admin/requests").then(setRequests).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pending = requests.filter(r => r.status === "pending");

  async function handleAction() {
    if (!actionReq) return;
    setActioning(true); setActionError("");
    try {
      if (actionType === "approve") {
        const data = await apiFetch(`/api/admin/requests/${actionReq.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: selectedRoles }),
        });
        setTempPw(data.temp_password);
      } else {
        await apiFetch(`/api/admin/requests/${actionReq.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rejection_note: rejectionNote }),
        });
        setActionReq(null);
        load();
      }
    } catch (err: any) { setActionError(err.message); }
    finally { setActioning(false); }
  }

  const statusChip = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-600",
    };
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[s] ?? ""}`}>{s}</span>;
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[#0C233C]">Access Requests</h2>
        {pending.length > 0 && (
          <span className="h-5 w-5 flex items-center justify-center rounded-full bg-[#1E49E2] text-white text-[10px] font-bold">
            {pending.length}
          </span>
        )}
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
        <div className="rounded-xl border border-[#E2EBF8] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7FAFF]">
              <tr>
                {["Name", "Email", "Department", "Status", "Submitted", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-t border-[#E2EBF8] hover:bg-[#F7FAFF]">
                  <td className="px-4 py-3 font-medium text-[#0C233C]">{r.name}</td>
                  <td className="px-4 py-3 text-[#5A6B82]">{r.email}</td>
                  <td className="px-4 py-3 text-[#5A6B82]">{r.department}</td>
                  <td className="px-4 py-3">{statusChip(r.status)}</td>
                  <td className="px-4 py-3 text-[#5A6B82] text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => { setActionReq(r); setActionType("approve"); setSelectedRoles(["viewer"]); setTempPw(null); setActionError(""); }}
                          className="text-xs text-green-600 hover:underline font-medium">Approve</button>
                        <button onClick={() => { setActionReq(r); setActionType("reject"); setRejectionNote(""); setActionError(""); }}
                          className="text-xs text-red-500 hover:underline">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!actionReq} onOpenChange={v => !v && setActionReq(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionType === "approve" ? "Approve Request" : "Reject Request"}</DialogTitle>
          </DialogHeader>
          {tempPw ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-green-700 font-medium">Request approved!</p>
              <div className="rounded-xl bg-[#F7FAFF] border border-[#D6E2F5] p-3">
                <p className="text-[11px] text-[#5A6B82] uppercase tracking-wider mb-1">Temporary Password for {actionReq?.name}</p>
                <p className="font-mono font-bold text-[#0C233C] text-lg">{tempPw}</p>
                <p className="text-xs text-[#5A6B82] mt-1">Share this with the user. They will be forced to change it on first login.</p>
              </div>
              <Button onClick={() => { setActionReq(null); setTempPw(null); load(); }}>Done</Button>
            </div>
          ) : actionType === "approve" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[#5A6B82]">Assign roles for <strong>{actionReq?.name}</strong>:</p>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map(r => (
                  <button key={r} type="button"
                    onClick={() => setSelectedRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      selectedRoles.includes(r) ? ROLE_COLORS[r] + " border-transparent" : "bg-white text-[#5A6B82] border-[#D6E2F5]"
                    }`}>{r}</button>
                ))}
              </div>
              {actionError && <p className="text-sm text-red-500">{actionError}</p>}
              <DialogFooter>
                <Button onClick={handleAction} disabled={actioning || selectedRoles.length === 0}
                  style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
                  {actioning ? "Approving…" : "Approve & Create Account"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[#5A6B82]">Reject request from <strong>{actionReq?.name}</strong>?</p>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">Reason (optional)</Label>
                <Input value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} placeholder="e.g. Role not applicable" className="h-10 rounded-xl" />
              </div>
              {actionError && <p className="text-sm text-red-500">{actionError}</p>}
              <DialogFooter>
                <Button onClick={handleAction} disabled={actioning} variant="destructive">
                  {actioning ? "Rejecting…" : "Reject Request"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Password Policy Tab ────────────────────────────────────────────────────
function PolicyTab() {
  const [policy, setPolicy] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/policy").then(setPolicy).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaved(false);
    try {
      await apiFetch("/api/admin/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  if (!policy) return <p className="text-sm text-slate-400">Loading…</p>;

  const toggle = (key: string) => setPolicy((p: any) => ({ ...p, [key]: !p[key] }));
  const numField = (key: string, label: string, min: number, max: number) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#0C233C]">{label}</span>
      <input type="number" min={min} max={max} value={policy[key]}
        onChange={e => setPolicy((p: any) => ({ ...p, [key]: parseInt(e.target.value) || min }))}
        className="w-20 h-9 rounded-lg border border-[#D6E2F5] bg-[#F7FAFF] px-3 text-sm text-center" />
    </div>
  );
  const boolField = (key: string, label: string) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#0C233C]">{label}</span>
      <button type="button" onClick={() => toggle(key)}
        className={`w-11 h-6 rounded-full transition-colors relative ${policy[key] ? "bg-[#1E49E2]" : "bg-slate-200"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${policy[key] ? "left-5" : "left-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#0C233C] mb-4">Password Policy</h2>
      <form onSubmit={handleSave} className="max-w-sm flex flex-col gap-4">
        <div className="rounded-xl border border-[#E2EBF8] p-4 flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">Complexity</p>
          {numField("min_length", "Minimum length", 8, 64)}
          {boolField("require_uppercase", "Require uppercase letter")}
          {boolField("require_lowercase", "Require lowercase letter")}
          {boolField("require_number", "Require number")}
          {boolField("require_symbol", "Require symbol")}
        </div>
        <div className="rounded-xl border border-[#E2EBF8] p-4 flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">History &amp; Expiry</p>
          {numField("no_reuse_count", "No reuse of last N passwords", 1, 24)}
          {numField("expiry_days", "Password expires after (days, 0 = never)", 0, 365)}
        </div>
        <Button type="submit" disabled={saving}
          style={{ background: "linear-gradient(135deg, #1E49E2 0%, #00338D 100%)" }}>
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Policy"}
        </Button>
      </form>
    </div>
  );
}

// ── Audit Log Tab ──────────────────────────────────────────────────────────
function AuditLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/audit-log").then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#0C233C] mb-4">Audit Log</h2>
      {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
        <div className="rounded-xl border border-[#E2EBF8] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7FAFF]">
              <tr>
                {["Timestamp", "Actor", "Action", "Target", "Detail"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#5A6B82]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t border-[#E2EBF8] hover:bg-[#F7FAFF]">
                  <td className="px-4 py-2.5 text-xs text-[#5A6B82] whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs text-[#0C233C]">{l.actor_email}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-[#1E49E2]">{l.action}</td>
                  <td className="px-4 py-2.5 text-xs text-[#5A6B82]">{l.target}</td>
                  <td className="px-4 py-2.5 text-xs text-[#5A6B82]">{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    apiFetch("/api/admin/requests?status=pending")
      .then((data: any[]) => setPendingCount(data.length))
      .catch(() => {});
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "users",    label: "Users",           icon: <Users className="h-4 w-4" /> },
    { id: "requests", label: "Requests",         icon: <ClipboardList className="h-4 w-4" /> },
    { id: "policy",   label: "Password Policy",  icon: <Lock className="h-4 w-4" /> },
    { id: "audit",    label: "Audit Log",         icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C233C]">Admin Console</h1>
        <p className="text-sm text-[#5A6B82] mt-1">Manage users, access requests, and platform settings.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#E2EBF8] mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${
              tab === t.id
                ? "border-[#1E49E2] text-[#1E49E2]"
                : "border-transparent text-[#5A6B82] hover:text-[#0C233C]"
            }`}>
            {t.icon}
            {t.label}
            {t.id === "requests" && pendingCount > 0 && (
              <span className="h-4 w-4 flex items-center justify-center rounded-full bg-[#1E49E2] text-white text-[9px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "users"    && <UsersTab />}
      {tab === "requests" && <RequestsTab />}
      {tab === "policy"   && <PolicyTab />}
      {tab === "audit"    && <AuditLogTab />}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**
```bash
cd kpmg_ui && npm run check
```

- [ ] **Step 3: Commit**
```bash
git add kpmg_ui/client/src/pages/admin.tsx
git commit -m "feat(auth): add /admin console page — users, requests, policy, audit log tabs"
```

---

## Task 17: Sidebar nav — Admin section + user footer

**Files:**
- Modify: the sidebar/nav component (locate with `grep -r "Admin\|sidebar\|nav" kpmg_ui/client/src/components --include="*.tsx" -l`)

Read the sidebar component file fully before editing.

- [ ] **Step 1: Locate the sidebar component**
```bash
grep -rl "sidebar\|Sidebar\|nav.*item\|NavItem" kpmg_ui/client/src/components --include="*.tsx" | head -5
```

- [ ] **Step 2: Add Admin Console link**

In the sidebar, find where navigation items are rendered. Add an Admin section using `hasRole`:

```typescript
import { useAuth } from "@/contexts/AuthContext";

// Inside the component:
const { user, logout, hasRole } = useAuth();

// In the nav items list, add at the bottom:
{hasRole("admin") && (
  <>
    <div className="pt-4 pb-1 px-3">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/30">Admin</p>
    </div>
    <NavItem
      href="/admin"
      icon={<Settings className="h-4 w-4" />}
      label="Admin Console"
      badge={pendingRequestCount > 0 ? pendingRequestCount : undefined}
    />
  </>
)}
```

- [ ] **Step 3: Add pending request count fetch**

Add a `useState` + `useEffect` in the sidebar component to fetch the pending count:
```typescript
const [pendingCount, setPendingCount] = useState(0);
useEffect(() => {
  if (hasRole("admin")) {
    fetch("/api/admin/requests?status=pending", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setPendingCount(data.length))
      .catch(() => {});
  }
}, [user]);
```

- [ ] **Step 4: Add user footer (name + logout) if not already present**

At the bottom of the sidebar, before the closing tag:
```typescript
<div className="mt-auto px-3 py-4 border-t border-white/10">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-white truncate">{user?.name}</p>
      <p className="text-[11px] text-white/40 truncate">{user?.email}</p>
    </div>
    <button onClick={logout} title="Sign out"
      className="text-white/40 hover:text-white transition-colors">
      <LogOut className="h-4 w-4" />
    </button>
  </div>
</div>
```

Import `LogOut` from `lucide-react`.

- [ ] **Step 5: TypeScript check + full rebuild**
```bash
cd kpmg_ui && npm run check
docker compose up --build -d
```

- [ ] **Step 6: End-to-end smoke test**

1. Open `http://localhost:5000`
2. Sign in as `kvarma9@gmail.com` / `Password@1234!`
3. Confirm redirect to `/landing`
4. Confirm "Admin Console" appears in sidebar
5. Navigate to `/admin` → confirm all 4 tabs load
6. Create a test user → confirm temp password shown
7. Sign out → confirm redirected to `/login`
8. Navigate to `/request-access` → fill form → submit
9. Sign back in as admin → check Requests tab → badge count visible → approve the request

- [ ] **Step 7: Commit**
```bash
git add kpmg_ui/client/src/components/
git commit -m "feat(auth): add Admin Console link to sidebar with pending badge and user footer"
```

---

## Self-Review Checklist

- [x] **Spec § 2 (roles/entitlements):** `require_roles` applied to all listed endpoints in Task 9 ✓
- [x] **Spec § 3 (FastAPI owns auth):** `get_current_user` on all routers, Express forwards Bearer ✓
- [x] **Spec § 4 (data model):** `users`, `access_requests`, `password_policy`, `audit_log` all created ✓
- [x] **Spec § 5 (two creation paths):** admin direct create (Task 7 admin router) + request approval ✓
- [x] **Spec § 6 (force reset):** `must_reset_password` guard in App.tsx, `/set-password` page ✓
- [x] **Spec § 7 (password policy):** full validation in `password_policy.py`, no-reuse, expiry at login ✓
- [x] **Spec § 8 (new pages):** `/request-access`, `/set-password`, `/admin` all present ✓
- [x] **Spec § 9 (modified files):** AuthContext, login.tsx, App.tsx, routes.ts, sidebar all covered ✓
- [x] **Spec § 10 (GCP):** JWT_SECRET_KEY in docker-compose; note about port 8000 firewall in Task 8 ✓
- [x] **Seed user:** Kartik / kvarma9@gmail.com / Password@1234! / admin / must_reset_password=False ✓
- [x] **Type consistency:** `user.sub` = email throughout; `user.roles` = string[]; `UserStore` used consistently ✓

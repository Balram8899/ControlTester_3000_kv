# LLM Provider Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow runtime switching between Gemini, OpenAI, and Anthropic LLM providers via the Settings UI, with no Docker restart required, and a live Test Connection button.

**Architecture:** Active provider + model are stored in MongoDB `trace_db.settings`. `get_llm()` reads from MongoDB at call time and falls back to `LLM_PROVIDER` env var. API keys live in `.env` only — never stored in DB or transited over the API. A new `GET /settings/llm-status` endpoint makes a real LLM call and returns status; `POST /settings/llm-config` saves the active selection after validating the key is present.

**Tech Stack:** Python/FastAPI (backend), LangChain OpenAI + Anthropic adapters, pymongo, React/TypeScript + TanStack Query (frontend), Shadcn UI components.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `utils/llm_config_store.py` | PROVIDER_REGISTRY, MongoDB read/write, available provider detection |
| Modify | `utils/llm_provider.py` | Add openai/anthropic; read active config from `llm_config_store` |
| Modify | `utils/llm_factory.py` | Update `make_llm()` + `resolve_llm_model_name()` to use active config |
| Create | `api/routers/settings.py` | `GET /settings/llm-status`, `POST /settings/llm-config` |
| Modify | `api/main.py` | Import and register settings router |
| Modify | `api/requirements.txt` | Add `langchain-openai`, `langchain-anthropic` |
| Modify | `.env` | Add OpenAI + Anthropic placeholder vars |
| Modify | `docker-compose.yml` | Pass new env vars to fastapi_api service |
| Create | `tests/test_settings.py` | 8 tests covering status + config endpoints |
| Modify | `kpmg_ui/client/src/pages/settings.tsx` | Add LLM Provider card with dropdowns + test button |

---

## Task 1: Add Python packages

**Files:**
- Modify: `api/requirements.txt`

- [ ] **Step 1: Add packages to requirements.txt**

Open `api/requirements.txt` and add two lines directly after the `langchain-google-genai` line:

```
langchain-openai==0.3.16
langchain-anthropic==0.3.15
```

- [ ] **Step 2: Commit**

```bash
git add api/requirements.txt
git commit -m "feat: add langchain-openai and langchain-anthropic packages"
```

---

## Task 2: Create `utils/llm_config_store.py`

This module is the single source of truth for provider configuration. Both `llm_provider.py` and `llm_factory.py` import from here — keep it import-light to avoid circular dependencies.

**Files:**
- Create: `utils/llm_config_store.py`

- [ ] **Step 1: Write the failing tests first** (in `tests/test_settings.py` — create the file)

```python
import os
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_collection(doc=None):
    col = MagicMock()
    col.find_one.return_value = doc
    return col


# ---------------------------------------------------------------------------
# llm_config_store tests
# ---------------------------------------------------------------------------

def test_get_active_llm_config_returns_db_config_when_present():
    from utils.llm_config_store import get_active_llm_config
    mock_col = _make_mock_collection({"_id": "llm_config", "provider": "openai", "model": "gpt-5.5"})
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        config = get_active_llm_config()
    assert config == {"provider": "openai", "model": "gpt-5.5"}


def test_get_active_llm_config_falls_back_to_env_when_db_empty():
    from utils.llm_config_store import get_active_llm_config
    mock_col = _make_mock_collection(None)
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_LLM_MODEL": "gemini-3-flash-preview"}):
            config = get_active_llm_config()
    assert config["provider"] == "gemini"
    assert config["model"] == "gemini-3-flash-preview"


def test_get_available_providers_filters_by_key():
    from utils.llm_config_store import get_available_providers
    env = {"GOOGLE_API_KEY": "key", "OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": ""}
    with patch.dict(os.environ, env, clear=False):
        available = get_available_providers()
    assert "gemini" in available
    assert "openai" not in available
    assert "anthropic" not in available
    assert "ollama" in available  # ollama has no key requirement


def test_save_llm_config_upserts_document():
    from utils.llm_config_store import save_llm_config
    mock_col = MagicMock()
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        save_llm_config("openai", "gpt-5.5")
    mock_col.update_one.assert_called_once_with(
        {"_id": "llm_config"},
        {"$set": {"provider": "openai", "model": "gpt-5.5"}},
        upsert=True,
    )
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd api && python -m pytest tests/test_settings.py -v
```

Expected: `ImportError` — `utils.llm_config_store` does not exist yet.

- [ ] **Step 3: Create `utils/llm_config_store.py`**

```python
from __future__ import annotations

import os

import pymongo

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_DB_NAME = "trace_db"
_COL_NAME = "settings"
_DOC_ID = "llm_config"

PROVIDER_REGISTRY: dict[str, dict] = {
    "gemini": {
        "key_env": "GOOGLE_API_KEY",
        "model_env": "GOOGLE_LLM_MODEL",
        "default_model": "gemini-3-flash-preview",
        "models": ["gemini-3-flash-preview"],
    },
    "openai": {
        "key_env": "OPENAI_API_KEY",
        "model_env": "OPENAI_LLM_MODEL",
        "default_model": "gpt-5.5",
        "models": ["gpt-5.5", "gpt-5.4"],
    },
    "anthropic": {
        "key_env": "ANTHROPIC_API_KEY",
        "model_env": "ANTHROPIC_LLM_MODEL",
        "default_model": "claude-opus-4-7",
        "models": ["claude-opus-4-7", "claude-sonnet-4-6"],
    },
    "ollama": {
        "key_env": None,
        "model_env": "OLLAMA_LLM_MODEL",
        "default_model": "llama3:latest",
        "models": ["llama3:latest"],
    },
}


def _get_collection():
    client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    return client[_DB_NAME][_COL_NAME]


def get_active_llm_config() -> dict[str, str]:
    """Return active {provider, model}. MongoDB first, env var fallback."""
    try:
        col = _get_collection()
        doc = col.find_one({"_id": _DOC_ID})
        if doc and doc.get("provider") in PROVIDER_REGISTRY:
            provider = doc["provider"]
            model = doc.get("model") or PROVIDER_REGISTRY[provider]["default_model"]
            return {"provider": provider, "model": model}
    except Exception:
        pass

    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    if provider not in PROVIDER_REGISTRY:
        provider = "gemini"
    reg = PROVIDER_REGISTRY[provider]
    model = os.getenv(reg["model_env"], reg["default_model"])
    return {"provider": provider, "model": model}


def save_llm_config(provider: str, model: str) -> None:
    col = _get_collection()
    col.update_one(
        {"_id": _DOC_ID},
        {"$set": {"provider": provider, "model": model}},
        upsert=True,
    )


def get_available_providers() -> list[str]:
    """Return providers whose API key env var is set (or require no key)."""
    return [
        name
        for name, reg in PROVIDER_REGISTRY.items()
        if reg["key_env"] is None or os.getenv(reg["key_env"])
    ]
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd api && python -m pytest tests/test_settings.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/llm_config_store.py tests/test_settings.py
git commit -m "feat: add llm_config_store with MongoDB-backed provider config"
```

---

## Task 3: Update `utils/llm_provider.py`

**Files:**
- Modify: `utils/llm_provider.py`

- [ ] **Step 1: Replace the entire file**

```python
from __future__ import annotations

import os


def get_llm(temperature: float = 0.2):
    """Return the active LLM. Provider + model read from MongoDB, env var fallback."""
    from utils.llm_config_store import get_active_llm_config, PROVIDER_REGISTRY

    config = get_active_llm_config()
    provider = config["provider"]
    model = config["model"]
    reg = PROVIDER_REGISTRY[provider]

    if reg["key_env"]:
        api_key = os.getenv(reg["key_env"])
        if not api_key:
            raise EnvironmentError(
                f"{reg['key_env']} must be set when provider is '{provider}'"
            )

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            temperature=temperature,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model,
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=temperature,
        )

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=model,
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            temperature=temperature,
        )

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=model,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
        temperature=temperature,
    )
```

- [ ] **Step 2: Add a test for `get_llm` reading from DB over env**

Append to `tests/test_settings.py`:

```python
def test_get_llm_uses_db_provider_over_env():
    with patch("utils.llm_config_store._get_collection") as mock_col_fn:
        mock_col = _make_mock_collection(
            {"_id": "llm_config", "provider": "ollama", "model": "llama3:latest"}
        )
        mock_col_fn.return_value = mock_col

        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": "key"}):
            from langchain_ollama import ChatOllama
            import importlib, utils.llm_provider as mod
            importlib.reload(mod)
            llm = mod.get_llm()
        assert isinstance(llm, ChatOllama)
```

- [ ] **Step 3: Run tests**

```bash
cd api && python -m pytest tests/test_settings.py -v
```

Expected: 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add utils/llm_provider.py tests/test_settings.py
git commit -m "feat: llm_provider reads active config from MongoDB with env fallback"
```

---

## Task 4: Update `utils/llm_factory.py`

Update `make_llm()` and `resolve_llm_model_name()` to use the active config. `make_embeddings()` is unchanged — embeddings are always Google/Ollama regardless of LLM provider.

**Files:**
- Modify: `utils/llm_factory.py`

- [ ] **Step 1: Replace `make_llm()` and `resolve_llm_model_name()` in `utils/llm_factory.py`**

Replace lines 27–59 (the two functions) with:

```python
def resolve_llm_model_name(model: str | None = None) -> str:
    """Return the effective LLM model name for the active provider."""
    from utils.llm_config_store import get_active_llm_config
    config = get_active_llm_config()
    if model and model.strip():
        return model.strip()
    return config["model"]


def make_llm(model: str | None = None, temperature: float = 0.1):
    """Return a string-producing LLM chain for the configured provider."""
    from utils.llm_config_store import get_active_llm_config, PROVIDER_REGISTRY

    config = get_active_llm_config()
    provider = config["provider"]
    active_model = model or config["model"]

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY must be set when provider is gemini")
        return ChatGoogleGenerativeAI(
            model=active_model,
            google_api_key=api_key,
            temperature=temperature,
            request_timeout=120,
        ) | StrOutputParser()

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError("OPENAI_API_KEY must be set when provider is openai")
        return ChatOpenAI(
            model=active_model,
            api_key=api_key,
            temperature=temperature,
        ) | StrOutputParser()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY must be set when provider is anthropic")
        return ChatAnthropic(
            model=active_model,
            api_key=api_key,
            temperature=temperature,
        ) | StrOutputParser()

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=active_model,
        temperature=temperature,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    ) | StrOutputParser()
```

- [ ] **Step 2: Run the existing test suite to check for regressions**

```bash
cd api && python -m pytest tests/ -v --ignore=tests/test_settings.py -x
```

Expected: all existing tests PASS. If any fail due to `resolve_llm_model_name` signature change, they will be obvious.

- [ ] **Step 3: Commit**

```bash
git add utils/llm_factory.py
git commit -m "feat: llm_factory make_llm reads active provider from MongoDB"
```

---

## Task 5: Create `api/routers/settings.py`

**Files:**
- Create: `api/routers/settings.py`

- [ ] **Step 1: Write the failing endpoint tests**

Append to `tests/test_settings.py`:

```python
# ---------------------------------------------------------------------------
# Endpoint tests — import TestClient lazily to avoid early FastAPI init
# ---------------------------------------------------------------------------

def _test_client():
    from fastapi.testclient import TestClient
    from api.main import app
    return TestClient(app)


def test_llm_status_returns_ok_on_mocked_llm():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="healthy")
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection(None)):
        with patch("utils.llm_provider.get_llm", return_value=mock_llm):
            with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": "k"}):
                resp = _test_client().get("/settings/llm-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "provider" in data
    assert "model" in data
    assert "latency_ms" in data
    assert "available_providers" in data


def test_llm_status_missing_api_key():
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection({"_id": "llm_config", "provider": "gemini", "model": "gemini-3-flash-preview"})):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": ""}, clear=False):
            resp = _test_client().get("/settings/llm-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"
    assert "GOOGLE_API_KEY" in data["message"]


def test_llm_status_timeout():
    import concurrent.futures
    mock_llm = MagicMock()
    mock_llm.invoke.side_effect = concurrent.futures.TimeoutError()
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection(None)):
        with patch("utils.llm_provider.get_llm", return_value=mock_llm):
            with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": "k"}):
                resp = _test_client().get("/settings/llm-status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"
    assert "timed out" in resp.json()["message"].lower()


def test_llm_config_rejects_unavailable_provider():
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection(None)):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False):
            resp = _test_client().post(
                "/settings/llm-config",
                json={"provider": "anthropic", "model": "claude-opus-4-7"},
            )
    assert resp.status_code == 400
    assert "ANTHROPIC_API_KEY" in resp.json()["detail"]


def test_llm_config_saves_valid_provider():
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}, clear=False):
            resp = _test_client().post(
                "/settings/llm-config",
                json={"provider": "openai", "model": "gpt-5.5"},
            )
    assert resp.status_code == 200
    assert resp.json()["saved"] is True
    mock_col.update_one.assert_called_once()
```

- [ ] **Step 2: Note — endpoint tests run after Task 6**

The tests appended above import `from api.main import app`, which won't have the settings router until Task 6. Write the test code now but run it after Task 6 is complete.

- [ ] **Step 3: Create `api/routers/settings.py`**

```python
from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.llm_config_store import (
    PROVIDER_REGISTRY,
    get_active_llm_config,
    get_available_providers,
    save_llm_config,
)

router = APIRouter(prefix="/settings", tags=["settings"])

_LLM_TIMEOUT_S = 10


class LLMConfigRequest(BaseModel):
    provider: str
    model: str


@router.get("/llm-status")
def llm_status():
    config = get_active_llm_config()
    provider = config["provider"]
    model = config["model"]
    available = get_available_providers()

    reg = PROVIDER_REGISTRY.get(provider, {})
    key_env = reg.get("key_env")
    if key_env and not os.getenv(key_env):
        return {
            "provider": provider,
            "model": model,
            "status": "error",
            "message": f"{key_env} not set",
            "latency_ms": 0,
            "available_providers": available,
        }

    from utils.llm_provider import get_llm

    start = time.time()
    try:
        llm = get_llm()
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(llm.invoke, "Reply with one word: healthy")
            response = future.result(timeout=_LLM_TIMEOUT_S)
        message = response.content if hasattr(response, "content") else str(response)
        return {
            "provider": provider,
            "model": model,
            "status": "ok",
            "message": message.strip(),
            "latency_ms": int((time.time() - start) * 1000),
            "available_providers": available,
        }
    except FuturesTimeout:
        return {
            "provider": provider,
            "model": model,
            "status": "error",
            "message": "Request timed out",
            "latency_ms": int((time.time() - start) * 1000),
            "available_providers": available,
        }
    except Exception as exc:
        return {
            "provider": provider,
            "model": model,
            "status": "error",
            "message": str(exc),
            "latency_ms": int((time.time() - start) * 1000),
            "available_providers": available,
        }


@router.post("/llm-config")
def update_llm_config(body: LLMConfigRequest):
    if body.provider not in PROVIDER_REGISTRY:
        raise HTTPException(status_code=422, detail=f"Unknown provider: {body.provider}")

    reg = PROVIDER_REGISTRY[body.provider]
    key_env = reg.get("key_env")
    if key_env and not os.getenv(key_env):
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' is not available — {key_env} is not set",
        )
    if body.model not in reg["models"]:
        raise HTTPException(
            status_code=422,
            detail=f"Model '{body.model}' is not valid for provider '{body.provider}'",
        )

    save_llm_config(body.provider, body.model)
    return {"provider": body.provider, "model": body.model, "saved": True}
```

- [ ] **Step 4: Run all endpoint tests**

```bash
cd api && python -m pytest tests/test_settings.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/routers/settings.py tests/test_settings.py
git commit -m "feat: add /settings/llm-status and /settings/llm-config endpoints"
```

---

## Task 6: Register router in `api/main.py`

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Add import**

In `api/main.py`, find the block of router imports (around line 67–73). Add after the last router import:

```python
from api.routers.settings import router as settings_router
```

- [ ] **Step 2: Register the router**

Find where the other routers are included with `app.include_router(...)`. Add:

```python
app.include_router(settings_router)
```

- [ ] **Step 3: Run all settings tests now that the router is registered**

```bash
cd api && python -m pytest tests/test_settings.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 4: Verify the route is reachable**

```bash
cd api && python -c "from api.main import app; routes = [r.path for r in app.routes]; assert any('/settings/llm-status' in r for r in routes), routes"
```

Expected: no assertion error.

- [ ] **Step 5: Commit**

```bash
git add api/main.py
git commit -m "feat: register settings router in main.py"
```

---

## Task 7: Update `.env` and `docker-compose.yml`

**Files:**
- Modify: `.env`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add placeholder vars to `.env`**

Append to `.env`:

```
# OpenAI — set OPENAI_API_KEY to enable OpenAI provider
OPENAI_API_KEY=
OPENAI_LLM_MODEL=gpt-5.5

# Anthropic — set ANTHROPIC_API_KEY to enable Anthropic provider
ANTHROPIC_API_KEY=
ANTHROPIC_LLM_MODEL=claude-opus-4-7
```

- [ ] **Step 2: Add env vars to `docker-compose.yml`**

Find the `fastapi_api` service's `environment:` block in `docker-compose.yml`. Add:

```yaml
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_LLM_MODEL=${OPENAI_LLM_MODEL:-gpt-5.5}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ANTHROPIC_LLM_MODEL=${ANTHROPIC_LLM_MODEL:-claude-opus-4-7}
```

- [ ] **Step 3: Commit**

```bash
git add .env docker-compose.yml
git commit -m "feat: add OpenAI and Anthropic env var placeholders"
```

---

## Task 8: Add LLM Provider card to Settings UI

**Files:**
- Modify: `kpmg_ui/client/src/pages/settings.tsx`

- [ ] **Step 1: Add TypeScript types and constants at top of file**

After the existing `interface VectorstoreInfo` block (around line 46), add:

```typescript
interface LLMStatus {
  provider: string;
  model: string;
  status: "ok" | "error";
  message: string;
  latency_ms: number;
  available_providers: string[];
}

const PROVIDER_MODELS: Record<string, string[]> = {
  gemini:    ["gemini-3-flash-preview"],
  openai:    ["gpt-5.5", "gpt-5.4"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6"],
  ollama:    ["llama3:latest"],
};
```

- [ ] **Step 2: Add state and queries inside `SettingsPage` component**

Inside `export default function SettingsPage()`, after the existing `const { toast }` line, add:

```typescript
const [llmProvider, setLlmProvider] = useState<string>("");
const [llmModel, setLlmModel] = useState<string>("");
const [testResult, setTestResult] = useState<LLMStatus | null>(null);
const [testLoading, setTestLoading] = useState(false);

const { data: llmStatus, isLoading: llmStatusLoading } = useQuery<LLMStatus>({
  queryKey: ["/api/settings/llm-status"],
  queryFn: async () => {
    const res = await fetch("/api/settings/llm-status");
    if (!res.ok) throw new Error("Failed to fetch LLM status");
    return res.json();
  },
});

useEffect(() => {
  if (llmStatus) {
    setLlmProvider(llmStatus.provider);
    setLlmModel(llmStatus.model);
  }
}, [llmStatus]);

const saveLLMConfig = useMutation({
  mutationFn: async ({ provider, model }: { provider: string; model: string }) => {
    const res = await fetch("/api/settings/llm-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to save");
    }
    return res.json();
  },
  onSuccess: () => {
    toast({ title: "Provider saved", description: `Now using ${llmProvider} / ${llmModel}` });
    queryClient.invalidateQueries({ queryKey: ["/api/settings/llm-status"] });
  },
  onError: (err: Error) => {
    toast({ title: "Save failed", description: err.message, variant: "destructive" });
  },
});

const handleTestConnection = async () => {
  setTestLoading(true);
  setTestResult(null);
  try {
    const res = await fetch("/api/settings/llm-status");
    const data: LLMStatus = await res.json();
    setTestResult(data);
  } catch {
    setTestResult({ provider: llmProvider, model: llmModel, status: "error", message: "Network error", latency_ms: 0, available_providers: [] });
  } finally {
    setTestLoading(false);
  }
};
```

- [ ] **Step 3: Add the LLM Provider card to the JSX**

Inside the `<TracePageBody>` element, add this card **before** the existing `<Card>` for "LLM Model":

```tsx
<Card>
  <CardHeader>
    <CardTitle>LLM Provider</CardTitle>
    <CardDescription>
      Select the active cloud AI provider and model. API keys must be set in <code>.env</code> before a provider appears here.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {llmStatusLoading && (
      <p className="text-sm text-muted-foreground">Loading provider config...</p>
    )}
    {!llmStatusLoading && (
      <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider</label>
            <Select
              value={llmProvider}
              onValueChange={(val) => {
                setLlmProvider(val);
                setLlmModel(PROVIDER_MODELS[val]?.[0] ?? "");
              }}
            >
              <SelectTrigger className="w-full" data-testid="select-llm-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {(llmStatus?.available_providers ?? []).map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</label>
            <Select value={llmModel} onValueChange={setLlmModel}>
              <SelectTrigger className="w-full" data-testid="select-llm-model">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {(PROVIDER_MODELS[llmProvider] ?? []).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => saveLLMConfig.mutate({ provider: llmProvider, model: llmModel })}
            disabled={saveLLMConfig.isPending || !llmProvider || !llmModel}
            data-testid="btn-save-llm-config"
          >
            {saveLLMConfig.isPending ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testLoading}
            data-testid="btn-test-connection"
          >
            {testLoading ? "Testing..." : "Test Connection"}
          </Button>
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              testResult.status === "ok"
                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
            data-testid="llm-test-result"
          >
            <span>{testResult.status === "ok" ? "✓" : "✗"}</span>
            <span>
              {testResult.status === "ok"
                ? `ok · ${testResult.latency_ms}ms · "${testResult.message}"`
                : testResult.message}
            </span>
          </div>
        )}
      </>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 4: Run TypeScript type check**

```bash
cd kpmg_ui && npm run check
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add kpmg_ui/client/src/pages/settings.tsx
git commit -m "feat: add LLM Provider card to Settings page with runtime switching"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd api && python -m pytest tests/ -v
```

Expected: all tests PASS, including the 9 new ones in `test_settings.py`.

- [ ] **Step 2: Rebuild Docker and smoke-test**

```bash
docker compose up --build -d fastapi_api web_ui_agent
```

Wait ~30 seconds, then:

```bash
docker logs controltester_3000_kv-fastapi_api-1 --tail 20
```

Expected: no startup errors.

- [ ] **Step 3: Curl the status endpoint**

```bash
curl http://localhost:8000/settings/llm-status
```

Expected: JSON with `provider`, `model`, `status`, `available_providers`.

- [ ] **Step 4: Open the Settings page in browser**

Navigate to `http://localhost:5000/settings`. Confirm:
- "LLM Provider" card appears above "LLM Model"
- Provider dropdown shows only providers with keys set
- "Test Connection" returns green badge with latency

- [ ] **Step 5: Test switching provider**

1. Set `OPENAI_API_KEY=<your key>` in `.env`, restart Docker
2. Open Settings → LLM Provider card shows `openai` in dropdown
3. Select `openai / gpt-5.5`, click Save → toast appears
4. Click Test Connection → green badge with `"healthy"`
5. Change back to `gemini`, save, test again

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete LLM provider switching with runtime MongoDB config"
```

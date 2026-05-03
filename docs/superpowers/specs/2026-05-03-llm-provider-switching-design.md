# LLM Provider Switching — Design Spec
**Date:** 2026-05-03  
**Status:** Approved (revised)  
**Scope:** Spec A — Provider switching + test connection UI

---

## Problem

TRACE currently hardcodes Gemini as the only production LLM provider. Users with OpenAI or Anthropic keys cannot use them without modifying source code or restarting Docker. There is also no way to verify a provider is working without running a full pipeline.

---

## Goals

1. Support Gemini, OpenAI, and Anthropic as selectable LLM providers
2. Allow switching provider + model from the Settings UI **at runtime** — no Docker restart required
3. Only show providers in the UI whose API key is already set in `.env`
4. Expose a `GET /settings/llm-status` health-check endpoint that makes a real LLM call
5. Keep API keys in `.env` only — never stored in MongoDB, never sent over the API

---

## Out of Scope

- Writing API keys via the UI
- LLM quality improvements (Spec B)

---

## Architecture

### How Provider Selection Works

API keys stay in `.env` (env vars). The **active provider + model selection** is stored in `trace_db.settings` (MongoDB) as a single document. `get_llm()` reads from MongoDB at call time, falling back to the `LLM_PROVIDER` env var if no DB setting exists.

```
User selects openai / gpt-5.5 in Settings UI
  → POST /settings/llm-config { provider: "openai", model: "gpt-5.5" }
  → saved to trace_db.settings

Any subsequent LLM call
  → get_llm() reads trace_db.settings for active provider + model
  → looks up OPENAI_API_KEY from env vars
  → instantiates ChatOpenAI — no restart needed
```

### Provider + Model Registry (static, in code)

```python
PROVIDER_REGISTRY = {
    "gemini":    { "key_env": "GOOGLE_API_KEY",    "models": ["gemini-3-flash-preview"] },
    "openai":    { "key_env": "OPENAI_API_KEY",    "models": ["gpt-5.5", "gpt-5.4"] },
    "anthropic": { "key_env": "ANTHROPIC_API_KEY", "models": ["claude-opus-4-7", "claude-sonnet-4-6"] },
    "ollama":    { "key_env": None,                "models": ["llama3:latest"] },
}
```

A provider is **available** when its `key_env` is `None` (Ollama) or its env var is non-empty.

---

### Provider Layer Changes

**`utils/llm_provider.py`** — `get_llm()` updated:

1. Query `trace_db.settings` for `{ _id: "llm_config" }` — get `provider` + `model`
2. If not found, fall back to `LLM_PROVIDER` env var + corresponding model env var
3. Instantiate the correct LangChain class based on provider:

```
gemini    → ChatGoogleGenerativeAI  (existing)
openai    → ChatOpenAI              (new — langchain-openai)
anthropic → ChatAnthropic           (new — langchain-anthropic)
ollama    → ChatOllama              (existing)
```

Same pattern applied to **`utils/llm_factory.py`** `make_llm()`.

Env vars per provider (keys only — model now comes from DB or env fallback):

| Provider  | Key env var         | Fallback model env var  | Default model            |
|-----------|---------------------|-------------------------|--------------------------|
| gemini    | `GOOGLE_API_KEY`    | `GOOGLE_LLM_MODEL`      | `gemini-3-flash-preview` |
| openai    | `OPENAI_API_KEY`    | `OPENAI_LLM_MODEL`      | `gpt-5.5`                |
| anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_LLM_MODEL`   | `claude-opus-4-7`        |
| ollama    | _(none)_            | `OLLAMA_LLM_MODEL`      | `llama3:latest`          |

---

### New Router — `api/routers/settings.py`

#### `GET /settings/llm-status`

Returns current active config + available providers + connection test result.

**Logic:**
1. Determine active provider + model (MongoDB → env fallback)
2. Detect available providers by checking which key env vars are set
3. Make a real LLM call: `"Reply with one word: healthy"` with 10s timeout
4. Return result

**Response:**
```json
{
  "provider": "openai",
  "model": "gpt-5.5",
  "status": "ok",
  "message": "healthy",
  "latency_ms": 312,
  "available_providers": ["gemini", "openai"]
}
```

**Error response:**
```json
{
  "provider": "openai",
  "model": "gpt-5.5",
  "status": "error",
  "message": "OPENAI_API_KEY not set",
  "latency_ms": 0,
  "available_providers": ["gemini"]
}
```

#### `POST /settings/llm-config`

Saves active provider + model to MongoDB. Validates that the requested provider is available (key is set) before saving.

**Request body:**
```json
{ "provider": "openai", "model": "gpt-5.5" }
```

**Response:**
```json
{ "provider": "openai", "model": "gpt-5.5", "saved": true }
```

**Error (provider unavailable):**
```json
{ "detail": "Provider 'anthropic' is not available — ANTHROPIC_API_KEY is not set" }
```

Register router in `api/main.py` with prefix `/settings`.

---

### MongoDB — `trace_db.settings`

Single document upserted by `POST /settings/llm-config`:

```json
{ "_id": "llm_config", "provider": "openai", "model": "gpt-5.5" }
```

`get_llm()` reads this document at every call. If absent, falls back to env vars. No migration needed — collection is auto-created on first save.

---

### Settings UI — `kpmg_ui/client/src/pages/settings.tsx`

**On page load:** call `GET /api/settings/llm-status` to get active config + available providers.

**LLM Provider card contains:**

1. **Provider dropdown** — options filtered to `available_providers` only. Providers with no key set are absent (not greyed out — absent). Selecting a new provider resets the model dropdown.

2. **Model dropdown** — options come from the static `PROVIDER_REGISTRY` for the selected provider.

3. **Save button** — calls `POST /api/settings/llm-config`. Shows success toast or inline error.

4. **Test Connection button** — calls `GET /api/settings/llm-status` after save. Shows:
   - Loading spinner during request
   - Green badge: `✓ ok · 312ms · "healthy"`
   - Red badge: `✗ error · <message>`

**Frontend constants:**
```ts
const PROVIDER_MODELS: Record<string, string[]> = {
  gemini:    ["gemini-3-flash-preview"],
  openai:    ["gpt-5.5", "gpt-5.4"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6"],
  ollama:    ["llama3:latest"],
}
```

---

### `.env` Changes

Add placeholder vars — user fills in key, leaves others empty:
```
# OpenAI
OPENAI_API_KEY=
OPENAI_LLM_MODEL=gpt-5.5

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_LLM_MODEL=claude-opus-4-7
```

### `docker-compose.yml` Changes

Add new env vars to the `fastapi_api` service block, sourced from `.env`.

---

## Dependencies

New Python packages:
- `langchain-openai` — `ChatOpenAI`
- `langchain-anthropic` — `ChatAnthropic`

Add to `api/requirements.txt`.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| No DB config + no `LLM_PROVIDER` env | Defaults to `gemini` |
| Required API key missing | `POST /llm-config` rejects; `GET /llm-status` returns `status: error` |
| LLM call raises exception | Caught, returned as `status: error` with message |
| Request timeout (>10s) | `status: error, message: "Request timed out"` |
| Unknown provider in DB | Treated as error, falls back to env var |
| Model not in registry for provider | `POST /llm-config` rejects with 422 |

---

## Tests — `tests/test_settings.py`

| Test | Description |
|---|---|
| `test_llm_status_returns_ok_on_mocked_llm` | Mock `get_llm()` invoke, assert `status: ok` and all fields present |
| `test_llm_status_missing_api_key` | Unset `GOOGLE_API_KEY` with active provider=gemini, assert `status: error` |
| `test_llm_status_unknown_provider` | DB has `provider: "invalid"`, assert `status: error` |
| `test_llm_status_timeout` | Mock invoke raises `TimeoutError`, assert `status: error`, message contains "timed out" |
| `test_llm_status_available_providers_filters_by_key` | Set only `GOOGLE_API_KEY`, assert `available_providers == ["gemini"]` |
| `test_llm_config_save_rejects_unavailable_provider` | `POST /llm-config` with `anthropic` when key unset → 400 |
| `test_llm_config_save_persists_to_db` | `POST /llm-config` with valid provider → assert MongoDB upserted |
| `test_get_llm_reads_from_db_over_env` | DB has `openai`, env has `gemini` → `get_llm()` returns OpenAI instance |

---

## Implementation Order

1. `utils/llm_provider.py` — add openai + anthropic branches; read active config from MongoDB
2. `utils/llm_factory.py` — same
3. `api/requirements.txt` — add `langchain-openai`, `langchain-anthropic`
4. `api/routers/settings.py` — `GET /llm-status` + `POST /llm-config`
5. `api/main.py` — register settings router
6. `.env` — add OpenAI + Anthropic placeholder vars
7. `docker-compose.yml` — add env vars to fastapi_api service
8. `tests/test_settings.py` — all 8 tests
9. `kpmg_ui/client/src/pages/settings.tsx` — LLM Provider card (provider dropdown, model dropdown, save, test)

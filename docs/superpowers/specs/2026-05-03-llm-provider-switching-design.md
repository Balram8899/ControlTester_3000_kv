# LLM Provider Switching — Design Spec
**Date:** 2026-05-03  
**Status:** Approved  
**Scope:** Spec A — Provider switching + test connection UI

---

## Problem

TRACE currently hardcodes Gemini as the only production LLM provider. Users with OpenAI or Anthropic keys cannot use them without modifying source code. There is also no way to verify a provider is working without running a full pipeline.

---

## Goals

1. Support Gemini, OpenAI, and Anthropic as selectable LLM providers via env vars
2. Expose a `GET /settings/llm-status` health-check endpoint that makes a real LLM call
3. Show current provider status and a Test Connection button on the Settings page
4. Keep API keys in `.env` / `docker-compose.yml` — never in MongoDB or transiting the API as plaintext

---

## Out of Scope

- Writing API keys via the UI
- Switching providers without a Docker restart
- LLM quality improvements (Spec B)

---

## Architecture

### Provider Layer

**`utils/llm_provider.py`** — extend `get_llm()` with two new branches:

```
LLM_PROVIDER=gemini    → ChatGoogleGenerativeAI  (existing)
LLM_PROVIDER=openai    → ChatOpenAI              (new)
LLM_PROVIDER=anthropic → ChatAnthropic           (new)
LLM_PROVIDER=ollama    → ChatOllama              (existing)
```

Env vars per provider:

| Provider  | Key env var         | Model env var          | Default model              |
|-----------|---------------------|------------------------|----------------------------|
| gemini    | `GOOGLE_API_KEY`    | `GOOGLE_LLM_MODEL`     | `gemini-3-flash-preview`   |
| openai    | `OPENAI_API_KEY`    | `OPENAI_LLM_MODEL`     | `gpt-5.5`                  |
| anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_LLM_MODEL`  | `claude-opus-4-7`          |
| ollama    | _(none)_            | `OLLAMA_LLM_MODEL`     | `llama3:latest`            |

Same pattern applied to **`utils/llm_factory.py`** `make_llm()`.

---

### New Endpoint — `api/routers/settings.py`

```
GET /settings/llm-status
```

**Logic:**
1. Read `LLM_PROVIDER` from env
2. Check required API key is set — if missing, return error immediately (no LLM call)
3. Instantiate LLM via `get_llm()`
4. Call `llm.invoke("Reply with one word: healthy")` with a 10-second timeout
5. Return response

**Response schema:**
```json
{
  "provider": "openai",
  "model": "gpt-5.5",
  "status": "ok",
  "message": "healthy",
  "latency_ms": 312
}
```

**Error response:**
```json
{
  "provider": "openai",
  "model": "gpt-5.5",
  "status": "error",
  "message": "OPENAI_API_KEY not set",
  "latency_ms": 0
}
```

Register router in `api/main.py` with prefix `/settings`.

---

### Settings UI — `kpmg_ui/client/src/pages/settings.tsx`

Add a **"LLM Provider"** card (read-only display + test button):

**Displays:**
- Active provider (e.g. `openai`)
- Active model (e.g. `gpt-5.5`)
- Known models per provider (static reference list):
  - Gemini: `gemini-3-flash-preview`
  - OpenAI: `gpt-5.5`, `gpt-5.4`
  - Anthropic: `claude-opus-4-7`, `claude-sonnet-4-6`

**Test Connection button:**
- On click: `GET /api/settings/llm-status`
- Shows loading spinner during request
- On success: green badge — `✓ ok · 312ms · "healthy"`
- On error: red badge — `✗ error · OPENAI_API_KEY not set`

---

### `.env` Changes

Add placeholder vars (empty values, user fills in):
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

New Python packages required:
- `langchain-openai` — `ChatOpenAI`
- `langchain-anthropic` — `ChatAnthropic`

Add to `api/requirements.txt`.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| `LLM_PROVIDER` not set | Defaults to `gemini` (existing behaviour) |
| Required API key missing | Immediate error response, no LLM call |
| LLM call raises exception | Catch all exceptions, return `status: error` with message |
| Request timeout (>10s) | Return `status: error, message: "Request timed out"` |
| Unknown `LLM_PROVIDER` value | Return `status: error, message: "Unknown provider: <value>"` |

---

## Tests — `tests/test_settings.py`

| Test | Description |
|---|---|
| `test_llm_status_returns_ok_on_mocked_llm` | Mock `get_llm()` invoke, assert `status: ok` and fields present |
| `test_llm_status_missing_api_key` | Unset `GOOGLE_API_KEY` with `LLM_PROVIDER=gemini`, assert `status: error` |
| `test_llm_status_unknown_provider` | Set `LLM_PROVIDER=invalid`, assert `status: error` |
| `test_llm_status_timeout` | Mock invoke raises `TimeoutError`, assert `status: error, message contains "timed out"` |
| `test_llm_status_returns_provider_and_model` | Assert response includes correct `provider` and `model` fields |

---

## Implementation Order

1. `utils/llm_provider.py` — add openai + anthropic branches
2. `utils/llm_factory.py` — same
3. `api/requirements.txt` — add `langchain-openai`, `langchain-anthropic`
4. `api/routers/settings.py` — new router with `/llm-status`
5. `api/main.py` — register settings router
6. `.env` — add placeholder vars
7. `docker-compose.yml` — add env vars to fastapi_api service
8. `tests/test_settings.py` — all 5 tests
9. `kpmg_ui/client/src/pages/settings.tsx` — LLM Provider card + test button

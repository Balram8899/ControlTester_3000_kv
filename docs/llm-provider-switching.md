# LLM Provider Switching

## What Was Built

Runtime switching between Gemini, OpenAI, Kimi, DeepSeek, Anthropic, and Ollama LLM providers. After the relevant API keys are available inside the container, the active provider and model are stored in MongoDB and read at call time.

## Architecture

```text
Settings UI -> POST /settings/llm-config -> MongoDB trace_db.settings { _id: "llm_config" }
                                           -> get_llm() / make_llm() reads MongoDB first, env var fallback
```

**Key rule:** Do not hardcode a provider in feature code. Always use `get_llm()` or `make_llm()`.

## Configuration Store

### `utils/llm_config_store.py`

Single source of truth for provider config. Imported by `llm_provider.py` and `llm_factory.py`.

```python
from utils.llm_config_store import (
    PROVIDER_REGISTRY,
    get_active_llm_config,
    get_available_providers,
    save_llm_config,
)
```

- `get_active_llm_config()` returns the MongoDB config first, then env fallback.
- `get_available_providers()` returns providers whose required API key is present in env. Ollama is always available.
- `save_llm_config(provider, model)` upserts to MongoDB.
- `PROVIDER_REGISTRY` defines supported providers, key env vars, model env vars, and allowed models.

MongoDB document: `trace_db.settings`, `_id: "llm_config"`, fields: `provider`, `model`.

## API

### `api/routers/settings.py`

Registered at prefix `/settings`.

| Endpoint | Method | Description |
|---|---|---|
| `/settings/llm-status` | GET | Returns active provider/model, connection status, latency, and available providers. |
| `/settings/llm-config` | POST | Saves provider and model to MongoDB. Returns 400 if the API key is unavailable and 422 if the model is not registered. |

`GET /settings/llm-status` response shape:

```json
{
  "provider": "gemini",
  "model": "gemini-3-flash-preview",
  "status": "ok",
  "message": "healthy",
  "latency_ms": 312,
  "available_providers": ["gemini", "ollama"]
}
```

`POST /settings/llm-config` request body:

```json
{ "provider": "openai", "model": "gpt-5.5" }
```

## Runtime LLM Usage

### `utils/llm_provider.py`

`get_llm(temperature)` reads from MongoDB via `get_active_llm_config()` and returns the active provider's LangChain chat model.

```python
from utils.llm_provider import get_llm

llm = get_llm()
llm = get_llm(temperature=0.0)
```

### `utils/llm_factory.py`

`make_llm()` and `resolve_llm_model_name()` read from MongoDB. `make_embeddings()` also reads from MongoDB, but embeddings currently remain Google/Ollama only.

```python
from utils.llm_factory import make_embeddings, make_llm, resolve_llm_model_name

chain = make_llm()
chain = make_llm(model="gpt-5.5", temperature=0.0)
embeddings = make_embeddings()
model_name = resolve_llm_model_name()
```

`get_llm_provider()` and module-level constants are retained for backward compatibility, but `get_active_llm_config()` is authoritative.

## Supported Providers

| Provider | Key env var | Model env var | Default model |
|---|---|---|---|
| `gemini` | `GOOGLE_API_KEY` | `GOOGLE_LLM_MODEL` | `gemini-3-flash-preview` |
| `openai` | `OPENAI_API_KEY` | `OPENAI_LLM_MODEL` | `gpt-5.5` |
| `kimi` | `MOONSHOT_API_KEY` or `KIMI_API_KEY` | `KIMI_LLM_MODEL` | `kimi-k2.6` |
| `deepseek` | `DEEPSEEK_API_KEY` | `DEEPSEEK_LLM_MODEL` | `deepseek-v4-pro` |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_LLM_MODEL` | `claude-opus-4-7` |
| `ollama` | none | `OLLAMA_LLM_MODEL` | `llama3:latest` |

## Environment Variables

Add to `.env`:

```env
# Gemini (default)
GOOGLE_API_KEY=your-key
GOOGLE_LLM_MODEL=gemini-3-flash-preview
GOOGLE_EMBEDDING_MODEL=models/text-embedding-004

# OpenAI - leave blank to hide from Settings UI
OPENAI_API_KEY=
OPENAI_LLM_MODEL=gpt-5.5

# Kimi K2.6 - leave both key vars blank to hide from Settings UI
MOONSHOT_API_KEY=
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_LLM_MODEL=kimi-k2.6
KIMI_TEMPERATURE=0.2
KIMI_THINKING=disabled

# DeepSeek - leave blank to hide from Settings UI
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_LLM_MODEL=deepseek-v4-pro
DEEPSEEK_TEMPERATURE=0.2
DEEPSEEK_THINKING=enabled
DEEPSEEK_REASONING_EFFORT=high

# Anthropic - leave blank to hide from Settings UI
ANTHROPIC_API_KEY=
ANTHROPIC_LLM_MODEL=claude-opus-4-7

# Ollama (always available, no key needed)
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_LLM_MODEL=llama3:latest
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest

# SOP Uplift document-level LLM parallelism
SOP_UPLIFT_DOCUMENT_LLM_WORKERS=3
```

The `fastapi_api` service must pass the provider env vars through in `docker-compose.yml`. If a new key is added to `.env`, recreate the API container once so Docker receives it.

## Settings UI

The Settings page (`/settings`) has an LLM Provider card above the existing LLM Model card. It shows:

- Provider dropdown, listing only providers available in the API container.
- Model dropdown, updated when provider changes.
- Save button, calling `POST /api/settings/llm-config`.
- Test Connection button, calling `GET /api/settings/llm-status`.

## How to Switch Provider at Runtime

1. Set the provider API key in `.env`, for example `OPENAI_API_KEY=...`.
2. Recreate the API container once so the key is available inside Docker:

   ```bash
   docker compose up --build -d fastapi_api
   ```

3. Open `http://localhost:5000/settings`.
4. Select provider and model in the LLM Provider card.
5. Click Save.

After that, no further restart is needed for provider/model changes stored through the Settings UI.

## SOP Uplift Speed Knob

SOP Uplift analyzes complete converted documents. To reduce wall-clock time, document-level LLM extraction calls can run concurrently:

```env
SOP_UPLIFT_DOCUMENT_LLM_WORKERS=3
```

Use `1` to force sequential calls if the provider rate-limits. Increase carefully if the provider and account quota can handle more parallel requests.

## Tests

Settings tests:

```bash
python -m pytest tests/test_settings.py -v
```

SOP Uplift pipeline tests:

```bash
python -m pytest tests/test_sop_uplift_pipeline.py -q
```

## Known Limitations

- `make_embeddings()` only supports Gemini and Ollama.
- `PROVIDER_REGISTRY` model lists are static; adding a new model requires editing `utils/llm_config_store.py`.
- Ollama model discovery is not dynamic; the model list is currently configured in code.

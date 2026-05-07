from __future__ import annotations

import os

import pymongo

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongodb:27017")
_DB_NAME = "trace_db"
_COL_NAME = "settings"
_DOC_ID = "llm_config"
_DOCUMENT_UPLIFT_DOC_ID = "document_uplift_config"
_DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS = 80
_DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS = 5
_DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS = 200

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
    "kimi": {
        "key_env": "MOONSHOT_API_KEY",
        "key_env_aliases": ["KIMI_API_KEY"],
        "model_env": "KIMI_LLM_MODEL",
        "default_model": "kimi-k2.6",
        "models": ["kimi-k2.6"],
        "base_url_env": "KIMI_BASE_URL",
        "default_base_url": "https://api.moonshot.ai/v1",
        "temperature_env": "KIMI_TEMPERATURE",
        "thinking_env": "KIMI_THINKING",
        "default_thinking": "disabled",
    },
    "deepseek": {
        "key_env": "DEEPSEEK_API_KEY",
        "model_env": "DEEPSEEK_LLM_MODEL",
        "default_model": "deepseek-v4-pro",
        "models": ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
        "base_url_env": "DEEPSEEK_BASE_URL",
        "default_base_url": "https://api.deepseek.com",
        "temperature_env": "DEEPSEEK_TEMPERATURE",
        "thinking_env": "DEEPSEEK_THINKING",
        "reasoning_effort_env": "DEEPSEEK_REASONING_EFFORT",
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


_client: pymongo.MongoClient | None = None


def _get_collection() -> object:
    global _client
    if _client is None:
        _client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    return _client[_DB_NAME][_COL_NAME]


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


def get_active_llm_signature() -> str:
    config = get_active_llm_config()
    return f"{config['provider']}:{config['model']}"


def resolve_active_llm_model(_legacy_model: str | None = None) -> str:
    """Return the model selected on Settings, ignoring legacy per-feature model fields."""
    return get_active_llm_config()["model"]


def save_llm_config(provider: str, model: str) -> None:
    col = _get_collection()
    col.update_one(
        {"_id": _DOC_ID},
        {"$set": {"provider": provider, "model": model}},
        upsert=True,
    )


def get_document_uplift_config() -> dict[str, int]:
    seed_value = _coerce_document_uplift_budget(
        os.getenv(
            "MAX_LLM_CALLS_PER_PIPELINE",
            str(_DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS),
        )
    )
    try:
        col = _get_collection()
        doc = col.find_one({"_id": _DOCUMENT_UPLIFT_DOC_ID})
        if doc and "max_llm_calls_per_pipeline" in doc:
            return {
                "max_llm_calls_per_pipeline": _coerce_document_uplift_budget(
                    doc.get("max_llm_calls_per_pipeline")
                )
            }
        save_document_uplift_config(seed_value)
    except Exception:
        return {"max_llm_calls_per_pipeline": seed_value}
    return {"max_llm_calls_per_pipeline": seed_value}


def save_document_uplift_config(max_llm_calls_per_pipeline: int) -> None:
    col = _get_collection()
    col.update_one(
        {"_id": _DOCUMENT_UPLIFT_DOC_ID},
        {
            "$set": {
                "max_llm_calls_per_pipeline": _coerce_document_uplift_budget(
                    max_llm_calls_per_pipeline
                )
            }
        },
        upsert=True,
    )


def _coerce_document_uplift_budget(value: object) -> int:
    try:
        budget = int(value)
    except (TypeError, ValueError):
        budget = _DOCUMENT_UPLIFT_DEFAULT_MAX_LLM_CALLS
    return max(
        _DOCUMENT_UPLIFT_MIN_MAX_LLM_CALLS,
        min(_DOCUMENT_UPLIFT_MAX_MAX_LLM_CALLS, budget),
    )


def get_provider_key_envs(provider: str) -> list[str]:
    reg = PROVIDER_REGISTRY[provider]
    key_envs = []
    if reg.get("key_env"):
        key_envs.append(reg["key_env"])
    key_envs.extend(reg.get("key_env_aliases", []))
    return key_envs


def get_provider_key_label(provider: str) -> str:
    return " or ".join(get_provider_key_envs(provider))


def get_provider_api_key(provider: str) -> str | None:
    for env_name in get_provider_key_envs(provider):
        value = os.getenv(env_name)
        if value:
            return value
    return None


def get_provider_base_url(provider: str) -> str | None:
    reg = PROVIDER_REGISTRY[provider]
    env_name = reg.get("base_url_env")
    if not env_name:
        return None
    return os.getenv(env_name, reg.get("default_base_url"))


def resolve_provider_temperature(provider: str, temperature: float | None) -> float | None:
    env_name = PROVIDER_REGISTRY[provider].get("temperature_env")
    if env_name:
        raw_value = os.getenv(env_name)
        if raw_value not in (None, ""):
            try:
                return float(raw_value)
            except ValueError:
                return temperature
    return temperature


def get_provider_extra_body(provider: str) -> dict:
    reg = PROVIDER_REGISTRY[provider]
    extra_body = {}
    thinking_env = reg.get("thinking_env")
    if thinking_env:
        thinking = os.getenv(thinking_env, reg.get("default_thinking", "")).strip()
        if thinking:
            extra_body["thinking"] = {"type": thinking}
    reasoning_effort_env = reg.get("reasoning_effort_env")
    if reasoning_effort_env:
        reasoning_effort = os.getenv(reasoning_effort_env, reg.get("default_reasoning_effort", "")).strip()
        if reasoning_effort:
            extra_body["reasoning_effort"] = reasoning_effort
    return extra_body

def get_available_providers() -> list[str]:
    """Return providers whose API key env var is set (or require no key)."""
    return [
        name
        for name, reg in PROVIDER_REGISTRY.items()
        if not get_provider_key_envs(name) or get_provider_api_key(name)
    ]


def llm_temperature_kwargs(provider: str, model: str, temperature: float | None) -> dict[str, float]:
    """Return temperature kwargs only when the selected model supports them."""
    if temperature is None:
        return {}
    normalized_model = (model or "").lower()
    if provider == "openai" and normalized_model.startswith(("gpt-5", "o1", "o3", "o4")):
        return {}
    if provider == "gemini" and normalized_model.startswith("gemini-3"):
        return {}
    if provider == "deepseek" and normalized_model == "deepseek-reasoner":
        return {}
    return {"temperature": temperature}

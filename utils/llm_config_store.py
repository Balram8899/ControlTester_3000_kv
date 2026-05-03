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

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.llm_config_store import (
    PROVIDER_REGISTRY,
    get_active_llm_config,
    get_available_providers,
    get_provider_api_key,
    get_provider_key_label,
    save_llm_config,
)
from utils.controls_library import MongoControlsStore
from utils.regulatory_library import MongoLibraryStore

router = APIRouter(prefix="/settings", tags=["settings"])

_LLM_TIMEOUT_S = 10
_PROCESS_STARTED_AT = time.time()


class LLMConfigRequest(BaseModel):
    provider: str
    model: str


def _library_status(store_factory: type) -> dict[str, Any]:
    try:
        docs = store_factory().list_documents()
        count = len(docs)
        return {
            "documents": count,
            "status": "loaded" if count > 0 else "empty",
        }
    except Exception as exc:
        return {
            "documents": 0,
            "status": "unavailable",
            "error": str(exc),
        }


@router.get("/system-status")
def system_status():
    """Fast live status snapshot for the dashboard.

    This intentionally avoids an LLM test call; the settings page owns provider
    connection testing. The dashboard only needs the active configured model and
    library/platform state.
    """
    config = get_active_llm_config()
    return {
        "active_provider": config.get("provider"),
        "active_model": config.get("model"),
        "regulatory_library": _library_status(MongoLibraryStore),
        "controls_library": _library_status(MongoControlsStore),
        "platform": {
            "status": "online",
            "uptime_seconds": int(time.time() - _PROCESS_STARTED_AT),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def _resolve_test_config(provider: str | None, model: str | None) -> dict[str, str]:
    if provider is None and model is None:
        return get_active_llm_config()
    if provider not in PROVIDER_REGISTRY:
        raise HTTPException(status_code=422, detail=f"Unknown provider: {provider}")
    reg = PROVIDER_REGISTRY[provider]
    selected_model = model or reg["default_model"]
    if selected_model not in reg["models"]:
        raise HTTPException(
            status_code=422,
            detail=f"Model '{selected_model}' is not valid for provider '{provider}'",
        )
    return {"provider": provider, "model": selected_model}


@router.get("/llm-status")
def llm_status(provider: str | None = None, model: str | None = None):
    config = _resolve_test_config(provider, model)
    provider = config["provider"]
    model = config["model"]
    available = get_available_providers()

    key_label = get_provider_key_label(provider) if provider in PROVIDER_REGISTRY else ""
    if key_label and not get_provider_api_key(provider):
        return {
            "provider": provider,
            "model": model,
            "status": "error",
            "message": f"{key_label} not set",
            "latency_ms": 0,
            "available_providers": available,
        }

    from utils.llm_provider import get_llm

    start = time.time()
    try:
        llm = get_llm(provider=provider, model=model)
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
    key_label = get_provider_key_label(body.provider)
    if key_label and not get_provider_api_key(body.provider):
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' is not available - {key_label} is not set",
        )
    if body.model not in reg["models"]:
        raise HTTPException(
            status_code=422,
            detail=f"Model '{body.model}' is not valid for provider '{body.provider}'",
        )

    save_llm_config(body.provider, body.model)
    return {"provider": body.provider, "model": body.model, "saved": True}

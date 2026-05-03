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

from __future__ import annotations

import os


def get_llm(
    temperature: float = 0.2,
    provider: str | None = None,
    model: str | None = None,
):
    """Return an LLM. Defaults to the active provider/model unless overridden."""
    from utils.llm_config_store import (
        get_active_llm_config,
        get_provider_api_key,
        get_provider_base_url,
        get_provider_extra_body,
        get_provider_key_label,
        llm_temperature_kwargs,
        resolve_provider_temperature,
    )

    config = get_active_llm_config()
    provider = provider or config["provider"]
    model = model or config["model"]
    resolved_temperature = resolve_provider_temperature(provider, temperature)

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise EnvironmentError(
                f"{get_provider_key_label(provider)} must be set when provider is '{provider}'"
            )
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            **llm_temperature_kwargs(provider, model, resolved_temperature),
        )

    if provider in {"openai", "kimi", "deepseek"}:
        from langchain_openai import ChatOpenAI
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise EnvironmentError(
                f"{get_provider_key_label(provider)} must be set when provider is '{provider}'"
            )
        kwargs = {
            "model": model,
            "api_key": api_key,
            **llm_temperature_kwargs(provider, model, resolved_temperature),
        }
        base_url = get_provider_base_url(provider)
        if base_url:
            kwargs["base_url"] = base_url
        extra_body = get_provider_extra_body(provider)
        if extra_body:
            kwargs["extra_body"] = extra_body
        return ChatOpenAI(**kwargs)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise EnvironmentError(
                f"{get_provider_key_label(provider)} must be set when provider is '{provider}'"
            )
        return ChatAnthropic(
            model=model,
            api_key=api_key,
            **llm_temperature_kwargs(provider, model, resolved_temperature),
        )

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=model,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
        **llm_temperature_kwargs(provider, model, resolved_temperature),
    )

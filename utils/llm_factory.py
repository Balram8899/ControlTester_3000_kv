"""
LLM Factory — single source of truth for LLM and embeddings construction.

Provider is selected via LLM_PROVIDER env var (default: ollama).
Set LLM_PROVIDER=gemini to use Google Gemini with GOOGLE_API_KEY.
"""

import os

from langchain_core.output_parsers import StrOutputParser

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_LLM_MODEL = os.getenv("GOOGLE_LLM_MODEL", "gemini-3-flash-preview")
GOOGLE_EMBEDDING_MODEL = os.getenv("GOOGLE_EMBEDDING_MODEL", "models/text-embedding-004")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "llama3:latest")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")


def get_llm_provider() -> str:
    return os.getenv("LLM_PROVIDER", LLM_PROVIDER).lower()


def resolve_llm_model_name(model: str | None = None) -> str:
    """Return the effective LLM model name for the active provider."""
    from utils.llm_config_store import resolve_active_llm_model
    return resolve_active_llm_model(model)


def make_llm(model: str | None = None, temperature: float = 0.1):
    """Return a string-producing LLM chain for the configured provider."""
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
    provider = config["provider"]
    active_model = config["model"]
    resolved_temperature = resolve_provider_temperature(provider, temperature)

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise EnvironmentError(f"{get_provider_key_label(provider)} must be set when provider is gemini")
        return ChatGoogleGenerativeAI(
            model=active_model,
            google_api_key=api_key,
            request_timeout=120,
            **llm_temperature_kwargs(provider, active_model, resolved_temperature),
        ) | StrOutputParser()

    if provider in {"openai", "kimi", "deepseek"}:
        from langchain_openai import ChatOpenAI
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise EnvironmentError(f"{get_provider_key_label(provider)} must be set when provider is {provider}")
        kwargs = {
            "model": active_model,
            "api_key": api_key,
            **llm_temperature_kwargs(provider, active_model, resolved_temperature),
        }
        base_url = get_provider_base_url(provider)
        if base_url:
            kwargs["base_url"] = base_url
        extra_body = get_provider_extra_body(provider)
        if extra_body:
            kwargs["extra_body"] = extra_body
        return ChatOpenAI(**kwargs) | StrOutputParser()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key = get_provider_api_key(provider)
        if not api_key:
            raise EnvironmentError(f"{get_provider_key_label(provider)} must be set when provider is anthropic")
        return ChatAnthropic(
            model=active_model,
            api_key=api_key,
            **llm_temperature_kwargs(provider, active_model, resolved_temperature),
        ) | StrOutputParser()

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=active_model,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        **llm_temperature_kwargs(provider, active_model, resolved_temperature),
    ) | StrOutputParser()


def make_embeddings(model: str | None = None):
    """Return embeddings for the configured provider."""
    from utils.llm_config_store import get_active_llm_config
    provider = get_active_llm_config()["provider"]

    if provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY must be set when provider is gemini")
        return GoogleGenerativeAIEmbeddings(
            model=model or os.getenv("GOOGLE_EMBEDDING_MODEL", GOOGLE_EMBEDDING_MODEL),
            google_api_key=api_key,
        )

    from langchain_ollama import OllamaEmbeddings
    return OllamaEmbeddings(
        model=model or os.getenv("OLLAMA_EMBEDDING_MODEL", OLLAMA_EMBEDDING_MODEL),
        base_url=os.getenv("OLLAMA_BASE_URL", OLLAMA_BASE_URL),
    )

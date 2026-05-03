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

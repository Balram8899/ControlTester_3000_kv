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
    from utils.llm_config_store import get_active_llm_config
    config = get_active_llm_config()
    if model and model.strip():
        return model.strip()
    return config["model"]


def make_llm(model: str | None = None, temperature: float = 0.1):
    """Return a string-producing LLM chain for the configured provider."""
    from utils.llm_config_store import get_active_llm_config, PROVIDER_REGISTRY

    config = get_active_llm_config()
    provider = config["provider"]
    active_model = model or config["model"]

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY must be set when provider is gemini")
        return ChatGoogleGenerativeAI(
            model=active_model,
            google_api_key=api_key,
            temperature=temperature,
            request_timeout=120,
        ) | StrOutputParser()

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError("OPENAI_API_KEY must be set when provider is openai")
        return ChatOpenAI(
            model=active_model,
            api_key=api_key,
            temperature=temperature,
        ) | StrOutputParser()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY must be set when provider is anthropic")
        return ChatAnthropic(
            model=active_model,
            api_key=api_key,
            temperature=temperature,
        ) | StrOutputParser()

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=active_model,
        temperature=temperature,
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    ) | StrOutputParser()


def make_embeddings(model: str | None = None):
    """Return embeddings for the configured provider."""
    if get_llm_provider() == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        if not GOOGLE_API_KEY:
            raise EnvironmentError("GOOGLE_API_KEY must be set when LLM_PROVIDER=gemini")
        return GoogleGenerativeAIEmbeddings(
            model=model or GOOGLE_EMBEDDING_MODEL,
            google_api_key=GOOGLE_API_KEY,
        )

    from langchain_ollama import OllamaEmbeddings
    return OllamaEmbeddings(
        model=model or OLLAMA_EMBEDDING_MODEL,
        base_url=OLLAMA_BASE_URL,
    )

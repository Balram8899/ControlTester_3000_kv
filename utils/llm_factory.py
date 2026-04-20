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


def make_llm(model: str | None = None, temperature: float = 0.1):
    """Return a string-producing LLM chain for the configured provider."""
    if LLM_PROVIDER == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        if not GOOGLE_API_KEY:
            raise EnvironmentError("GOOGLE_API_KEY must be set when LLM_PROVIDER=gemini")
        return ChatGoogleGenerativeAI(
            model=model or GOOGLE_LLM_MODEL,
            google_api_key=GOOGLE_API_KEY,
            temperature=temperature,
            request_timeout=120,
        ) | StrOutputParser()

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=model or OLLAMA_LLM_MODEL,
        temperature=temperature,
        base_url=OLLAMA_BASE_URL,
    ) | StrOutputParser()


def make_embeddings(model: str | None = None):
    """Return embeddings for the configured provider."""
    if LLM_PROVIDER == "gemini":
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

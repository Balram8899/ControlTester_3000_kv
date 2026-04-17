"""
LLM Factory — single source of truth for Ollama LLM and embeddings construction.

All library pipeline modules (controls_library, regulatory_library,
frameworks_library, regulatory_comparision) must import make_llm / make_embeddings
from here so that OLLAMA_BASE_URL is always read from the environment.

When running in Docker, set OLLAMA_BASE_URL=http://host.docker.internal:11434
in your .env file so the container can reach Ollama on the host machine.
"""

import os

from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_core.output_parsers import StrOutputParser

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "llama3:latest")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")


def make_llm(model: str | None = None, temperature: float = 0.1):
    """Return a string-producing ChatOllama chain pointed at the correct Ollama endpoint."""
    return ChatOllama(
        model=model or OLLAMA_LLM_MODEL,
        temperature=temperature,
        base_url=OLLAMA_BASE_URL,
        keep_alive="30m",
    ) | StrOutputParser()


def make_embeddings(model: str | None = None) -> OllamaEmbeddings:
    """Return OllamaEmbeddings pointed at the correct Ollama endpoint."""
    return OllamaEmbeddings(
        model=model or OLLAMA_EMBEDDING_MODEL,
        base_url=OLLAMA_BASE_URL,
    )

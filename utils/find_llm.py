import os
import requests

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "llama3:8b")
GOOGLE_LLM_MODEL = os.getenv("GOOGLE_LLM_MODEL", "gemini-3-flash-preview")


def get_ollama_model_names():
    response = requests.get(f"{OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=5)
    response.raise_for_status()
    payload = response.json()
    models = sorted(
        {
            model.get("name", "").strip()
            for model in payload.get("models", [])
            if model.get("name")
        }
    )
    return models or [OLLAMA_LLM_MODEL]


def get_google_model_names():
    return [GOOGLE_LLM_MODEL]


def get_model_names():
    """Return available models for the configured provider."""
    if LLM_PROVIDER == "gemini":
        return get_google_model_names()
    return get_ollama_model_names()


def _ollama_models():
    """Streamlit presentation version."""
    return get_ollama_model_names()


def _google_models():
    return get_google_model_names()

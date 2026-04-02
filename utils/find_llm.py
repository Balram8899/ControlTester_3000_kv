import os

GOOGLE_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-3-flash-preview",
]


def get_google_model_names():
    return GOOGLE_MODELS


# Backward-compatible alias used by api/main.py
def get_ollama_model_names():
    return get_google_model_names()


def _google_models():
    """Streamlit presentation version (kept for any remaining references)."""
    return sorted(GOOGLE_MODELS)


# Backward-compatible alias
def _ollama_models():
    return _google_models()

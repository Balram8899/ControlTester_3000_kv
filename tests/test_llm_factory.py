from unittest.mock import patch

from utils.llm_factory import resolve_llm_model_name

_GEMINI_CONFIG = {"provider": "gemini", "model": "gemini-3-flash-preview"}
_OLLAMA_CONFIG = {"provider": "ollama", "model": "llama3:latest"}


def test_resolve_llm_model_name_uses_settings_for_gemini_even_with_legacy_model():
    """Legacy per-feature model fields should not override Settings."""
    with patch("utils.llm_config_store.get_active_llm_config", return_value=_GEMINI_CONFIG):
        assert resolve_llm_model_name("gemini-2.0-flash") == "gemini-3-flash-preview"


def test_resolve_llm_model_name_falls_back_to_config_model_for_gemini():
    """When no model is passed the active config model is returned."""
    with patch("utils.llm_config_store.get_active_llm_config", return_value=_GEMINI_CONFIG):
        assert resolve_llm_model_name(None) == "gemini-3-flash-preview"


def test_resolve_llm_model_name_uses_settings_for_ollama_even_with_legacy_model():
    with patch("utils.llm_config_store.get_active_llm_config", return_value=_OLLAMA_CONFIG):
        assert resolve_llm_model_name("llama3.1:8b") == "llama3:latest"


def test_resolve_llm_model_name_falls_back_to_default_ollama_model():
    with patch("utils.llm_config_store.get_active_llm_config", return_value=_OLLAMA_CONFIG):
        assert resolve_llm_model_name("") == "llama3:latest"

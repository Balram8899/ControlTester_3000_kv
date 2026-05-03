import os
import pytest
from unittest.mock import MagicMock, patch


def _make_mock_collection(doc=None):
    col = MagicMock()
    col.find_one.return_value = doc
    return col


def test_get_active_llm_config_returns_db_config_when_present():
    from utils.llm_config_store import get_active_llm_config
    mock_col = _make_mock_collection({"_id": "llm_config", "provider": "openai", "model": "gpt-5.5"})
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        config = get_active_llm_config()
    assert config == {"provider": "openai", "model": "gpt-5.5"}


def test_get_active_llm_config_falls_back_to_env_when_db_empty():
    from utils.llm_config_store import get_active_llm_config
    mock_col = _make_mock_collection(None)
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_LLM_MODEL": "gemini-3-flash-preview"}):
            config = get_active_llm_config()
    assert config["provider"] == "gemini"
    assert config["model"] == "gemini-3-flash-preview"


def test_get_available_providers_filters_by_key():
    from utils.llm_config_store import get_available_providers
    env = {"GOOGLE_API_KEY": "key", "OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": ""}
    with patch.dict(os.environ, env, clear=False):
        available = get_available_providers()
    assert "gemini" in available
    assert "openai" not in available
    assert "anthropic" not in available
    assert "ollama" in available  # ollama has no key requirement


def test_save_llm_config_upserts_document():
    from utils.llm_config_store import save_llm_config
    mock_col = MagicMock()
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        save_llm_config("openai", "gpt-5.5")
    mock_col.update_one.assert_called_once_with(
        {"_id": "llm_config"},
        {"$set": {"provider": "openai", "model": "gpt-5.5"}},
        upsert=True,
    )


def test_get_llm_uses_db_provider_over_env():
    with patch("utils.llm_config_store._get_collection") as mock_col_fn:
        mock_col = _make_mock_collection(
            {"_id": "llm_config", "provider": "ollama", "model": "llama3:latest"}
        )
        mock_col_fn.return_value = mock_col

        with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": "key"}):
            from langchain_ollama import ChatOllama
            import importlib, utils.llm_provider as mod
            importlib.reload(mod)
            llm = mod.get_llm()
        assert isinstance(llm, ChatOllama)

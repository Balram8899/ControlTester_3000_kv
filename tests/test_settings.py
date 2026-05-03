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


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------

def _test_client():
    from fastapi.testclient import TestClient
    from api.main import app
    return TestClient(app)


def test_llm_status_returns_ok_on_mocked_llm():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="healthy")
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection(None)):
        with patch("utils.llm_provider.get_llm", return_value=mock_llm):
            with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": "k"}):
                resp = _test_client().get("/settings/llm-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "provider" in data
    assert "model" in data
    assert "latency_ms" in data
    assert "available_providers" in data


def test_llm_status_missing_api_key():
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection({"_id": "llm_config", "provider": "gemini", "model": "gemini-3-flash-preview"})):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": ""}, clear=False):
            resp = _test_client().get("/settings/llm-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"
    assert "GOOGLE_API_KEY" in data["message"]


def test_llm_status_timeout():
    import concurrent.futures
    mock_llm = MagicMock()
    mock_llm.invoke.side_effect = concurrent.futures.TimeoutError()
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection(None)):
        with patch("utils.llm_provider.get_llm", return_value=mock_llm):
            with patch.dict(os.environ, {"LLM_PROVIDER": "gemini", "GOOGLE_API_KEY": "k"}):
                resp = _test_client().get("/settings/llm-status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"
    assert "timed out" in resp.json()["message"].lower()


def test_llm_config_rejects_unavailable_provider():
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection(None)):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False):
            resp = _test_client().post(
                "/settings/llm-config",
                json={"provider": "anthropic", "model": "claude-opus-4-7"},
            )
    assert resp.status_code == 400
    assert "ANTHROPIC_API_KEY" in resp.json()["detail"]


def test_llm_config_saves_valid_provider():
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}, clear=False):
            resp = _test_client().post(
                "/settings/llm-config",
                json={"provider": "openai", "model": "gpt-5.5"},
            )
    assert resp.status_code == 200
    assert resp.json()["saved"] is True
    mock_col.update_one.assert_called_once()

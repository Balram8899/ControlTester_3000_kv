import os
import sys
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


def test_provider_registry_includes_kimi_and_deepseek_defaults():
    from utils.llm_config_store import PROVIDER_REGISTRY

    assert PROVIDER_REGISTRY["kimi"]["default_model"] == "kimi-k2.6"
    assert "kimi-k2.6" in PROVIDER_REGISTRY["kimi"]["models"]
    assert PROVIDER_REGISTRY["deepseek"]["default_model"] == "deepseek-v4-pro"
    assert "deepseek-v4-pro" in PROVIDER_REGISTRY["deepseek"]["models"]


def test_get_available_providers_supports_kimi_alias_and_deepseek_key():
    from utils.llm_config_store import get_available_providers

    with patch.dict(
        os.environ,
        {"KIMI_API_KEY": "kimi-key", "DEEPSEEK_API_KEY": "deepseek-key"},
        clear=True,
    ):
        available = get_available_providers()

    assert "kimi" in available
    assert "deepseek" in available
    assert "gemini" not in available
    assert "ollama" in available


def test_temperature_kwargs_omit_for_models_that_reject_non_default_temperature():
    from utils.llm_config_store import llm_temperature_kwargs

    assert llm_temperature_kwargs("openai", "gpt-5.5", 0.2) == {}
    assert llm_temperature_kwargs("gemini", "gemini-3-flash-preview", 0.2) == {}
    assert llm_temperature_kwargs("deepseek", "deepseek-reasoner", 0.2) == {}
    assert llm_temperature_kwargs("anthropic", "claude-opus-4-7", 0.2) == {}
    assert llm_temperature_kwargs("anthropic", "claude-sonnet-4-6", 0.2) == {}
    assert llm_temperature_kwargs("ollama", "llama3:latest", 0.2) == {"temperature": 0.2}


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


def test_get_collection_uses_existing_case_conflicting_mongo_database():
    import utils.llm_config_store as store

    mock_collection = MagicMock()
    mock_db = MagicMock()
    mock_db.__getitem__.return_value = mock_collection
    mock_client = MagicMock()
    mock_client.list_database_names.return_value = ["Trace_db", "admin", "config"]
    mock_client.__getitem__.return_value = mock_db

    with patch.object(store, "_client", None):
        with patch("utils.llm_config_store.pymongo.MongoClient", return_value=mock_client):
            collection = store._get_collection()

    assert collection is mock_collection
    mock_client.__getitem__.assert_called_once_with("Trace_db")
    mock_db.__getitem__.assert_called_once_with("settings")


def test_get_document_uplift_config_reads_db_budget() -> None:
    from utils.llm_config_store import get_document_uplift_config

    mock_col = _make_mock_collection(
        {
            "_id": "document_uplift_config",
            "max_llm_calls_per_pipeline": 35,
        }
    )
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        config = get_document_uplift_config()

    assert config == {"max_llm_calls_per_pipeline": 35}
    mock_col.update_one.assert_not_called()


def test_get_document_uplift_config_seeds_env_budget_when_db_empty() -> None:
    from utils.llm_config_store import get_document_uplift_config

    mock_col = _make_mock_collection(None)
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(os.environ, {"MAX_LLM_CALLS_PER_PIPELINE": "42"}):
            config = get_document_uplift_config()

    assert config == {"max_llm_calls_per_pipeline": 42}
    mock_col.update_one.assert_called_once_with(
        {"_id": "document_uplift_config"},
        {"$set": {"max_llm_calls_per_pipeline": 42}},
        upsert=True,
    )


def test_save_document_uplift_config_clamps_budget_range() -> None:
    from utils.llm_config_store import save_document_uplift_config

    mock_col = MagicMock()
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        save_document_uplift_config(250)

    mock_col.update_one.assert_called_once_with(
        {"_id": "document_uplift_config"},
        {"$set": {"max_llm_calls_per_pipeline": 200}},
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


def test_get_llm_builds_kimi_with_openai_compatible_endpoint_and_thinking_flag():
    mock_col = _make_mock_collection(
        {"_id": "llm_config", "provider": "kimi", "model": "kimi-k2.6"}
    )
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(
            os.environ,
            {
                "MOONSHOT_API_KEY": "moonshot-test-key",
                "KIMI_BASE_URL": "https://api.moonshot.ai/v1",
                "KIMI_THINKING": "disabled",
            },
            clear=False,
        ):
            fake_langchain_openai = MagicMock()
            with patch.dict(sys.modules, {"langchain_openai": fake_langchain_openai}):
                mock_chat = fake_langchain_openai.ChatOpenAI
                expected_llm = MagicMock()
                mock_chat.return_value = expected_llm
                import importlib, utils.llm_provider as mod
                importlib.reload(mod)

                llm = mod.get_llm(temperature=0.25)

    assert llm is expected_llm
    kwargs = mock_chat.call_args.kwargs
    assert kwargs["model"] == "kimi-k2.6"
    assert kwargs["api_key"] == "moonshot-test-key"
    assert kwargs["base_url"] == "https://api.moonshot.ai/v1"
    assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
    assert kwargs["temperature"] == 0.25


def test_get_llm_builds_deepseek_v4_pro_with_openai_compatible_endpoint():
    mock_col = _make_mock_collection(
        {"_id": "llm_config", "provider": "deepseek", "model": "deepseek-v4-pro"}
    )
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(
            os.environ,
            {"DEEPSEEK_API_KEY": "deepseek-test-key"},
            clear=False,
        ):
            fake_langchain_openai = MagicMock()
            with patch.dict(sys.modules, {"langchain_openai": fake_langchain_openai}):
                mock_chat = fake_langchain_openai.ChatOpenAI
                expected_llm = MagicMock()
                mock_chat.return_value = expected_llm
                import importlib, utils.llm_provider as mod
                importlib.reload(mod)

                llm = mod.get_llm(temperature=0.3)

    assert llm is expected_llm
    kwargs = mock_chat.call_args.kwargs
    assert kwargs["model"] == "deepseek-v4-pro"
    assert kwargs["api_key"] == "deepseek-test-key"
    assert kwargs["base_url"] == "https://api.deepseek.com"
    assert kwargs["temperature"] == 0.3


def test_get_llm_builds_deepseek_with_optional_thinking_controls():
    mock_col = _make_mock_collection(
        {"_id": "llm_config", "provider": "deepseek", "model": "deepseek-v4-pro"}
    )
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(
            os.environ,
            {
                "DEEPSEEK_API_KEY": "deepseek-test-key",
                "DEEPSEEK_THINKING": "enabled",
                "DEEPSEEK_REASONING_EFFORT": "high",
            },
            clear=False,
        ):
            fake_langchain_openai = MagicMock()
            with patch.dict(sys.modules, {"langchain_openai": fake_langchain_openai}):
                mock_chat = fake_langchain_openai.ChatOpenAI
                mock_chat.return_value = MagicMock()
                import importlib, utils.llm_provider as mod
                importlib.reload(mod)

                mod.get_llm()

    kwargs = mock_chat.call_args.kwargs
    assert kwargs["extra_body"] == {
        "thinking": {"type": "enabled"},
        "reasoning_effort": "high",
    }


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


def test_llm_status_tests_requested_provider_and_model_without_saving():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="healthy")
    with patch("utils.llm_config_store._get_collection",
               return_value=_make_mock_collection({"_id": "llm_config", "provider": "gemini", "model": "gemini-3-flash-preview"})):
        with patch("utils.llm_provider.get_llm", return_value=mock_llm) as mock_get_llm:
            with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "k"}, clear=False):
                resp = _test_client().get(
                    "/settings/llm-status",
                    params={"provider": "deepseek", "model": "deepseek-v4-pro"},
                )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["provider"] == "deepseek"
    assert data["model"] == "deepseek-v4-pro"
    mock_get_llm.assert_called_once_with(provider="deepseek", model="deepseek-v4-pro")


def test_system_status_returns_config_and_live_library_counts():
    with patch(
        "utils.llm_config_store._get_collection",
        return_value=_make_mock_collection(
            {"_id": "llm_config", "provider": "anthropic", "model": "claude-opus-4-7"}
        ),
    ):
        with patch("api.routers.settings.MongoLibraryStore") as mock_reg_store:
            with patch("api.routers.settings.MongoControlsStore") as mock_ctrl_store:
                mock_reg_store.return_value.list_documents.return_value = [{"document_id": "reg-1"}]
                mock_ctrl_store.return_value.list_documents.return_value = [
                    {"document_id": "ctrl-1"},
                    {"document_id": "ctrl-2"},
                ]

                resp = _test_client().get("/settings/system-status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["active_provider"] == "anthropic"
    assert data["active_model"] == "claude-opus-4-7"
    assert data["regulatory_library"] == {"documents": 1, "status": "loaded"}
    assert data["controls_library"] == {"documents": 2, "status": "loaded"}
    assert data["platform"]["status"] == "online"


def test_models_endpoint_reports_active_settings_model_for_non_ollama_provider():
    with patch(
        "utils.llm_config_store._get_collection",
        return_value=_make_mock_collection(
            {"_id": "llm_config", "provider": "openai", "model": "gpt-5.4"}
        ),
    ):
        resp = _test_client().get("/models")

    assert resp.status_code == 200
    data = resp.json()
    assert data["active_provider"] == "openai"
    assert data["active_model"] == "gpt-5.4"
    assert "gpt-5.4" in data["models"]


def test_models_endpoint_reports_deepseek_v4_pro():
    with patch(
        "utils.llm_config_store._get_collection",
        return_value=_make_mock_collection(
            {"_id": "llm_config", "provider": "deepseek", "model": "deepseek-v4-pro"}
        ),
    ):
        resp = _test_client().get("/models")

    assert resp.status_code == 200
    data = resp.json()
    assert data["active_provider"] == "deepseek"
    assert data["active_model"] == "deepseek-v4-pro"
    assert "deepseek-v4-pro" in data["models"]


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


def test_llm_config_saves_deepseek_v4_pro_when_key_set():
    mock_col = MagicMock()
    mock_col.find_one.return_value = None
    with patch("utils.llm_config_store._get_collection", return_value=mock_col):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "sk-deepseek"}, clear=False):
            resp = _test_client().post(
                "/settings/llm-config",
                json={"provider": "deepseek", "model": "deepseek-v4-pro"},
            )
    assert resp.status_code == 200
    assert resp.json()["saved"] is True
    mock_col.update_one.assert_called_once()

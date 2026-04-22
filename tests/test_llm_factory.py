from utils.llm_factory import resolve_llm_model_name


def test_resolve_llm_model_name_ignores_stale_requested_gemini_model(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GOOGLE_LLM_MODEL", "gemini-3-flash-preview")

    assert resolve_llm_model_name("gemini-2.0-flash") == "gemini-3-flash-preview"


def test_resolve_llm_model_name_preserves_requested_ollama_model(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_LLM_MODEL", "llama3:latest")

    assert resolve_llm_model_name("llama3.1:8b") == "llama3.1:8b"


def test_resolve_llm_model_name_falls_back_to_default_ollama_model(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_LLM_MODEL", "llama3:latest")

    assert resolve_llm_model_name("") == "llama3:latest"

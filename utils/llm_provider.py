import os


def get_llm(temperature: float = 0.2):
    """Return configured LLM. Default: Ollama (llama3:8b). Set LLM_PROVIDER=gemini to use Gemini."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY must be set when LLM_PROVIDER=gemini")
        return ChatGoogleGenerativeAI(
            model=os.environ.get("GOOGLE_LLM_MODEL", "gemini-1.5-flash"),
            google_api_key=api_key,
            temperature=temperature,
        )
    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "llama3:8b"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434"),
        temperature=temperature,
    )

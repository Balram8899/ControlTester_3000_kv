import os

from dotenv import load_dotenv


def main() -> None:
    from google import genai

    load_dotenv()
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
    response = client.models.generate_content(
        model=os.getenv("GOOGLE_LLM_MODEL", "gemini-3-flash-preview"),
        contents="How does AI work in 20 sentences?",
    )
    print(response.text)


if __name__ == "__main__":
    main()

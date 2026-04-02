from google import genai
import os
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
respose = client.models.generate_content(
    model=os.getenv("GOOGLE_LLM_MODEL", "gemini-3-flash-preview"),
    contents="How does AI work in 20 sentences?"
)
print(respose.text)
## Local Ollama setup

1. Make sure Ollama is running on Windows and pull the models you want to use:
   `ollama pull llama3:8b`
   `ollama pull nomic-embed-text:latest`
2. Copy `.env.example` to `.env` and adjust values if needed.
3. Start the app stack with Docker Desktop:
   `docker compose up --build`

The API container is configured to reach your host Ollama instance at
`http://host.docker.internal:11434` by default.

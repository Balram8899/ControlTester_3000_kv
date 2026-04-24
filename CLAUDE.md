# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Trace** is a cybersecurity audit and compliance assessment platform. It uses an LLM (Gemini) and RAG (Retrieval-Augmented Generation) to help auditors analyze evidence, test controls, check regulatory compliance, and generate workpapers.

## Code Navigation

Core principle: search before reading.

Use Socrati CLI to search the indexed codebase before opening files. The index gives you a map of the codebase in milliseconds; raw file reading is expensive and context-consuming.

Prefer socrati cli code searches over grep

- Search with Socrati CLI first to locate the relevant files, symbols, and architecture.
- Read only the small set of files that search identifies as relevant.
- Avoid broad file-by-file exploration unless search results are insufficient.

## Services & Ports

| Service | Port | Description |
|---|---|---|
| Web UI (React/Express) | 5000 | Primary user-facing interface |
| FastAPI backend | 8000 | Core business logic & LLM orchestration |
| Streamlit app | 8501 | Alternative data-science UI |
| Ollama LLM | 11434 | Local GPU-accelerated inference |

## Commands

### Full Stack (Docker — recommended)
```bash
./make.sh                                # Build, start, pull models (llama3:8b + nomic-embed-text)
docker compose up --build -d             # Start all services
docker compose down                      # Stop all services
docker logs fastapi_api                  # View FastAPI logs
docker logs streamlit_app                # View Streamlit logs
```

### FastAPI (api/)
```bash
cd api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Web UI (kpmg_ui/)
```bash
cd kpmg_ui
npm install
npm run dev          # Vite + Express dev server
npm run build        # Production build
npm run start        # Run production build
npm run check        # TypeScript type checking
npm run db:push      # Drizzle ORM schema migrations
```

### Streamlit App (root)
```bash
streamlit run app.py --server.port=8501 --server.address=0.0.0.0
```

## Architecture

### Service Communication
```
React (client) → Express server (server/) → FastAPI (api/main.py) → Ollama LLM
```
- The Express server at `kpmg_ui/server/routes.ts` acts as a proxy/BFF, forwarding `/api/*` requests to FastAPI at `http://fastapi_api:8000`
- In Docker, services communicate over the `ollama-bridge` network using service names as hostnames

### RAG Pipeline (utils/llm_chain.py)
Documents are chunked → embedded with `nomic-embed-text` → stored in a FAISS vectorstore → retrieved at query time and injected into Llama3 context. The vectorstore can be saved/loaded via FastAPI endpoints for session persistence.

### Session & Memory Model
- `AuditSessionStore` (`utils/audit_session_store.py`) tracks per-session audit state
- Each chat session uses `ConversationBufferWindowMemory` (last 10 exchanges) plus a `conversation_vectorstore` for semantic retrieval of older messages
- Sessions are keyed by `session_id` generated at `/session/create`

### Frontend State (kpmg_ui/client/src/contexts/)
Four React Context providers manage application state:
- `ChatContext` — chat messages and model selection
- `EvidenceContext` — uploaded evidence files
- `ControlTestingContext` — control assessment state
- `RegulatoryTestingContext` — regulatory compliance state

### Key FastAPI Endpoints (api/main.py)
- `POST /session/create` — initialize audit session
- `POST /audit/start` — load controls from a test script file
- `POST /audit/upload-evidence` — process and embed evidence documents
- `POST /chat` — conversational query with session memory
- `POST /audit/generate-workpaper` — produce audit workpaper output
- `POST /analyze-query` — classify/analyze a query intent
- `POST /save-vectorstore` / `POST /load-vectorstore` — persist/restore FAISS state
- `GET /models` — list available Ollama models

### Document Processing (utils/)
Multi-format ingestion pipeline (PDF, DOCX, XLSX, PPTX, images) using `Unstructured`, `pypdf`, `python-docx`, and `openpyxl`. Files land in `temp_files/` during processing. Each document chunk is enriched with metadata (source, control domain, confidentiality level).

### Python Utility Modules (utils/)
| File | Purpose |
|---|---|
| `llm_chain.py` | LangChain knowledge base construction and LLM assessment |
| `chat.py` | Conversational logic with memory |
| `audit_analyzer.py` | Evidence-to-control mapping and gap analysis |
| `rcm_compliance_analyzer.py` | RCM (Risk & Control Matrix) compliance checks |
| `regulatory_comparision.py` | Cross-regulatory comparison |
| `workpaper_filler.py` | Fills audit workpaper templates |
| `pdf_generator.py` | PDF report generation |
| `evidence_validator.py` | Evidence quality validation |
| `assessment_schema.py` | Pydantic schemas for assessment data |

## Key Configuration
- `.streamlit/config.toml` — max upload 800MB, max message size 900
- `docker-compose.yml` — `OLLAMA_NUM_GPU=999`, `OLLAMA_NUM_PARALLEL=4`, `VITE_API_URL=http://fastapi_api:8000`
- `kpmg_ui/vite.config.ts` — Vite build and dev proxy config
- `kpmg_ui/shared/` — Zod schemas shared between client and server

## Models Used
- **LLM:** `llama3:8b` (pulled via Ollama)
- **Embeddings:** `nomic-embed-text:latest` (pulled via Ollama)
- Both are pulled automatically by `make.sh` on first setup

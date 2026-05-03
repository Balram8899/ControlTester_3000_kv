# TRACE — Cybersecurity Audit & Compliance Platform

TRACE (ControlTester 3000) is a local AI-powered audit platform for cybersecurity and compliance practitioners. It uses a large language model (Gemini or Ollama/Llama3) with RAG to assist auditors across the full audit lifecycle — from ingesting regulatory frameworks and control libraries through evidence testing, risk assessment, issue tracking, and workpaper generation.

> Runs fully locally via Docker Compose. No cloud infrastructure or external data store required.

---

## Features

- **Regulatory Library** — upload and extract obligations from regulatory documents (MAS TRM, NIST CSF, ISO 27001, etc.)
- **Controls Library** — ingest control libraries; auto-score controls using the 5W1H methodology (Who/What/Where/When/Why/How)
- **Frameworks Library** — upload and manage risk and governance frameworks
- **Asset Registry** — track assets with CIA (Confidentiality/Integrity/Availability) scoring (1–5 scale) and criticality bands
- **Risk Assessment** — LLM-guided questionnaire across 8 domains (100+ questions); generates scored risk report
- **Control Testing** — upload test scripts and evidence; LLM reviews evidence per control and generates audit workpapers
- **Issue Management** — raise, track, and remediate issues with status workflow and evidence attachment
- **Validation Queue** — AI-flagged control quality findings routed for human accept/dismiss review
- **Chat** — context-aware conversational interface over uploaded knowledge bases
- **Reports** — generated markdown and PDF audit workpapers stored persistently

---

## Architecture

```
React UI (port 5000)
    ↓
Express BFF — kpmg_ui/server/routes.ts
    ↓  (strips /api prefix, proxies to FastAPI)
FastAPI — api/main.py + api/routers/*  (port 8000)
    ↓
MongoDB trace_db  (port 27017)   +   LLM (Gemini API or Ollama port 11434)
```

### Services

| Service | Port | Docker container |
|---|---|---|
| Web UI (React + Express) | 5000 | `web_ui_agent` |
| FastAPI backend | 8000 | `fastapi_api` |
| MongoDB | 27017 | `mongodb` |
| Ollama (optional) | 11434 | `ollama` |

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts, Wouter |
| BFF | Express.js (TypeScript) |
| Backend | FastAPI (Python 3.11), Pydantic v2, LangChain |
| Database | MongoDB (`trace_db`) via pymongo |
| LLM (default) | Google Gemini via `GOOGLE_API_KEY` |
| LLM (local) | Ollama — `llama3:8b` + `nomic-embed-text` embeddings |
| RAG | FAISS vectorstores + Graph RAG over library documents |
| Containers | Docker Compose |

---

## Quick Start

### Prerequisites

- Docker Desktop
- A Google Gemini API key **or** a local GPU with Ollama installed

### 1. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```env
# Use Gemini (default)
LLM_PROVIDER=gemini
GOOGLE_API_KEY=your_key_here
GOOGLE_LLM_MODEL=gemini-3-flash-preview

# --- OR use local Ollama ---
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://host.docker.internal:11434
# OLLAMA_LLM_MODEL=llama3:8b
# OLLAMA_EMBEDDING_MODEL=nomic-embed-text:latest
```

If using Ollama, pull models on your host first:

```bash
ollama pull llama3:8b
ollama pull nomic-embed-text:latest
```

The API container reaches your host Ollama at `http://host.docker.internal:11434` by default.

### 2. Start all services

```bash
docker compose up --build -d
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### 3. Useful commands

```bash
# Rebuild a single service
docker compose up --build -d fastapi_api
docker compose up --build -d web_ui_agent

# View logs
docker logs controltester_3000_kv-fastapi_api-1 --tail 50
docker logs controltester_3000_kv-web_ui_agent-1 --tail 50

# Stop everything
docker compose down
```

---

## Development

### FastAPI backend

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Web UI

```bash
cd kpmg_ui
npm install
npm run dev       # Vite + Express dev server on port 5000
npm run check     # TypeScript type checking
npm run build     # Production build
```

### Tests

```bash
cd api
python -m pytest tests/ -v
```

### LLM model source of truth

All backend features must pick up the active LLM provider and model from **Settings** through the shared helpers:

- Use `utils.llm_provider.get_llm()` when you need a chat-model object.
- Use `utils.llm_factory.make_llm()` when you need the string-output LangChain pipeline.
- Use `utils.llm_factory.make_embeddings()` for embeddings.
- Use `utils.llm_factory.resolve_llm_model_name()` only for legacy fields or logging; it returns the Settings-selected model.

Do not read `GOOGLE_LLM_MODEL`, `OPENAI_LLM_MODEL`, `ANTHROPIC_LLM_MODEL`, `OLLAMA_LLM_MODEL`, or `LLM_PROVIDER` directly inside feature code. Those environment variables are only fallbacks used by `utils.llm_config_store` when no Settings document exists. New feature endpoints may keep old `selected_model` request fields for compatibility, but they must not let those fields override Settings.

If the active provider is not configured or its API key is missing, feature code should fail clearly with `Check LLM settings` instead of silently switching models or falling back to local rules.

---

## Repository Layout

```
ControlTester_3000_kv/
├── api/
│   ├── main.py                    # FastAPI app + legacy endpoints
│   ├── Dockerfile
│   └── routers/
│       ├── assets.py              # Asset Registry CRUD + CIA scoring
│       ├── risk_assessment.py     # Risk Assessment sessions + report
│       ├── control_testing.py     # Control Testing sessions + evidence review
│       ├── controls_quality.py    # 5W1H quality analysis endpoint
│       ├── issues.py              # Issue Management CRUD + workflow
│       └── validation_queue.py    # Validation Queue accept/dismiss
├── utils/
│   ├── llm_provider.py            # get_llm() — primary LLM abstraction
│   ├── llm_factory.py             # make_llm() / make_embeddings() for LangChain
│   ├── controls_library.py        # Controls ingestion + MongoDB store
│   ├── regulatory_library.py      # Regulatory obligations extraction + store
│   ├── frameworks_library.py      # Frameworks store
│   ├── risk_scorer.py             # CIA scoring + criticality bands
│   ├── assessment_questions.py    # 100+ question bank for risk assessments
│   ├── rcm_compliance_analyzer.py # RCM Excel/CSV parser + compliance analysis
│   ├── audit_analyzer.py          # Evidence-to-control mapping
│   ├── llm_chain.py               # LangChain RAG pipeline (FAISS)
│   ├── graph_rag.py               # Graph RAG over library documents
│   ├── workpaper_filler.py        # Audit workpaper generation
│   └── pdf_generator.py           # PDF report output
├── kpmg_ui/
│   ├── server/routes.ts           # Express BFF — proxies /api/* to FastAPI
│   └── client/src/
│       ├── pages/                 # One file per route/feature
│       ├── contexts/              # React Context providers per feature
│       └── components/            # Shared UI components
├── tests/                         # pytest suite — mirrors routers/
├── data/
│   └── seeds/
│       └── nist_csf_controls.json # Auto-seeded into controls collection at startup
├── docs/
│   ├── HANDOFF.md                 # Developer handoff + sub-project status
│   └── UI_REDESIGN_AGENT_GUIDE.md # Page-by-page UI + backend map
├── app.py                         # Legacy Streamlit UI (port 8501)
└── docker-compose.yml
```

---

## MongoDB Collections (`trace_db`)

| Collection | Purpose |
|---|---|
| `regulatory_library` | Extracted regulatory obligations |
| `controls_library` | Uploaded controls + 5W1H scores |
| `frameworks_library` | Framework elements |
| `assets` | Asset registry |
| `issues` | Issue tracking |
| `validation_queue` | AI-flagged findings awaiting review |
| `control_testing_sessions` | Control testing state |
| `risk_assessments` | Risk assessment sessions |
| `rcm_reports` | RCM compliance reports (files in GridFS) |

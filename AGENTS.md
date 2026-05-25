# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**TRACE** (ControlTester 3000) is a local cybersecurity audit and compliance platform for internal auditors. It uses an LLM (Gemini/Anthropic/OpenAI by default, Ollama locally) with RAG to:

- Ingest and manage control libraries, regulatory frameworks, and risk frameworks
- Run structured risk assessments via LLM-assisted questionnaires
- Test controls against uploaded evidence documents
- Map controls to regulatory obligations
- Score control quality using 5W1H methodology
- Track issues and validation queue items
- Generate markdown audit workpapers and PDF reports

The platform runs fully locally via Docker Compose. It is **not SaaS** — no cloud infra, no external data store.

## Code Navigation

Core principle: **search before reading.**

Use SocratiCode to search the indexed codebase before opening files. THis is typically found as MCP plugin

```bash
# Search for a symbol or concept
socrati search "asset CIA scoring"
```

- Prefer `socrati search` over Grep for code exploration.
- Read only the small set of files that search identifies as relevant.
- Avoid broad file-by-file exploration unless search results are insufficient.

## Services & Ports

| Service | Port | Notes |
|---|---|---|
| Web UI (React/Express) | 5000 | Primary interface — `web_ui_agent` container |
| FastAPI backend | 8000 | Core logic — `fastapi_api` container |
| MongoDB | 27017 | Primary data store — `mongodb` container |
| Ollama LLM | 11434 | Local GPU inference (optional — Gemini is default) |
| Streamlit app | 8501 | Legacy secondary UI — `app.py` |

## Commands

### Docker (recommended)
```bash
docker compose up --build -d                              # Start all services
docker compose up --build -d fastapi_api                  # Rebuild API only
docker compose up --build -d web_ui_agent                 # Rebuild UI only
docker compose down                                       # Stop all services
docker logs controltester_3000_kv-fastapi_api-1 --tail 50
docker logs controltester_3000_kv-web_ui_agent-1 --tail 50
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
```

### Tests
```bash
cd api
python -m pytest tests/ -v
```

## Architecture

### Request Flow
```
React (client) → Express BFF (kpmg_ui/server/routes.ts) → FastAPI (api/main.py + api/routers/*) → MongoDB + LLM
```

- Express strips the `/api` prefix and forwards to `http://fastapi_api:8000`
- `GET /api/models` is special-cased: Express transforms the FastAPI response into `{ value, label }` objects
- All persistent data lives in **MongoDB** (`trace_db`), not Postgres/Drizzle — ignore any Drizzle references

### LLM Abstraction — CRITICAL RULE

**Never hardcode any provider or model name. Never pass `provider=` or `model=` overrides to `get_llm()` unless there is an explicit per-call technical reason. Always call `get_llm()` with no arguments so the user's Settings screen selection is respected.**

| File | Function | Use when |
|---|---|---|
| `utils/llm_provider.py` | `get_llm()` | Simple generation — new routers, utilities, Celery workers |
| `utils/llm_factory.py` | `make_llm()` / `make_embeddings()` | Embeddings + LangChain chains (llm_chain.py) |

**Provider/model resolution order (highest priority first):**
1. **Settings screen → MongoDB `trace_db.settings`** — written by `save_llm_config()`, read by `get_active_llm_config()`. This is the user's active selection and always wins.
2. **Env vars** (`LLM_PROVIDER`, `GOOGLE_LLM_MODEL`, etc.) — fallback only when no DB config exists.

**For any new service or worker container** (e.g. `ct_worker`): import `get_llm` from `utils/llm_provider.py` and ensure the container has `MONGO_URI` pointing to `trace_db`. This is sufficient — `get_llm()` will automatically pick up the Settings screen selection.

### MongoDB Collections (`trace_db`)

| Collection | Store class | Purpose |
|---|---|---|
| `regulatory_library` | `utils/regulatory_library.py` | Extracted regulatory obligations |
| `controls_library` | `utils/controls_library.py` | Uploaded controls + 5W1H scores |
| `frameworks_library` | `utils/frameworks_library.py` | Framework elements |
| `assets` | `api/routers/assets.py` | Asset registry |
| `issues` | `api/routers/issues.py` | Issue tracking |
| `validation_queue` | `api/routers/validation_queue.py` | AI-flagged findings pending review |
| `control_testing_sessions` | `api/routers/control_testing.py` | Control testing sessions |
| `risk_assessments` | `api/routers/risk_assessment.py` | Risk assessment sessions |
| `rcm_reports` | `utils/rcm_report_store.py` | RCM compliance reports (+ GridFS for files) |

### FastAPI Routers (api/routers/)

| Router | Prefix | Key endpoints |
|---|---|---|
| `assets.py` | `/assets` | CRUD with CIA 1-5 scoring, criticality bands |
| `risk_assessment.py` | `/risk-assessment` | Session create/start/questions/submit/report |
| `control_testing.py` | `/control-testing` | Session CRUD, evidence review, generate-report |
| `controls_quality.py` | `/controls-library` | `POST /quality-analysis` — 5W1H batch scoring |
| `issues.py` | `/issues` | CRUD, evidence attachment, status workflow |
| `validation_queue.py` | `/validation-queue` | accept / dismiss queue items |

Legacy endpoints still in `api/main.py`: `/audit/*`, `/chat`, `/session/*`, `/regulatory-library/*`, `/frameworks-library/*`, `/rcm/*`, `/models`.

### Frontend Pages & Contexts (kpmg_ui/client/src/)

| Page | Route | Context |
|---|---|---|
| `asset-registry.tsx` | `/asset-registry` | `AssetRegistryContext.tsx` |
| `risk-assessment.tsx` | `/risk-assessment` | `RiskAssessmentContext.tsx` |
| `control-testing.tsx` | `/control-testing` | `ControlTestingContext.tsx` |
| `issue-management.tsx` | `/issue-management` | `IssueManagementContext.tsx` |
| `regulatory-library.tsx` | `/regulatory-library` | `LibraryMetricsContext.tsx` |
| `frameworks-library.tsx` | `/frameworks-library` | `LibraryMetricsContext.tsx` |
| `controls-library.tsx` | `/controls-library` | `LibraryMetricsContext.tsx` |
| `chat.tsx` | `/chat` | `ChatContext.ts` |
| `settings.tsx` | `/settings` | none |

### CIA Scoring Model

CIA dimensions (`confidentiality`, `integrity`, `availability`) each store:
- A **max** score (1–5) and a **min** score for range assessments
- `cia_total` = sum of max values; used for criticality band:
  - ≤6 → Low, 7–9 → Medium, 10–12 → High, 13–15 → Critical

### 5W1H Control Quality

Controls are scored on Who/What/Where/When/Why/How (each 0 or 1, max score = 6). Score maps to RAG: 0–3 → red, 4 → amber, 5–6 → green. Findings with `queue_finding: true` are pushed to the `validation_queue` collection for human review.

## Key Configuration

| File | Purpose |
|---|---|
| `docker-compose.yml` | Service definitions, `LLM_PROVIDER`, `GOOGLE_API_KEY`, `MONGO_URI` |
| `kpmg_ui/vite.config.ts` | Vite dev proxy config |
| `.streamlit/config.toml` | Max upload 800 MB |
| `data/seeds/nist_csf_controls.json` | NIST CSF 2.0 seed — auto-inserted at startup if controls collection is empty |

## Python Utility Modules (utils/)

| File | Purpose |
|---|---|
| `llm_provider.py` | `get_llm()` — use for new routers/utilities |
| `llm_factory.py` | `make_llm()` / `make_embeddings()` — use for LangChain chains |
| `controls_library.py` | MongoDB controls store + extraction pipeline |
| `regulatory_library.py` | MongoDB regulatory obligations store + extraction |
| `frameworks_library.py` | MongoDB frameworks store |
| `risk_scorer.py` | CIA scoring, criticality bands, control effectiveness |
| `assessment_questions.py` | 8-section question bank (100+ questions) for risk assessments |
| `rcm_compliance_analyzer.py` | RCM Excel/CSV parser + compliance analysis |
| `audit_analyzer.py` | Evidence-to-control mapping and gap analysis |
| `llm_chain.py` | LangChain knowledge base construction (FAISS + embeddings) |
| `workpaper_filler.py` | Fills audit workpaper templates |
| `pdf_generator.py` | PDF report generation |
| `evidence_validator.py` | Evidence quality validation |
| `graph_rag.py` | Graph-based RAG over library documents |
| `rcm_report_store.py` | MongoDB + GridFS store for RCM reports |

## Development Rules

1. **LLM**: Call `get_llm()` from `utils/llm_provider.py` with no `provider`/`model` overrides. The active provider and model come from the Settings screen (stored in `trace_db.settings`). Never instantiate any LLM class directly. This applies to all containers including `ct_worker`.
2. **Database**: All persistent state goes to MongoDB (`trace_db`). Do not use SQLite, Postgres, or Drizzle for application data.
3. **Testing**: Add pytest tests in `tests/` for every new router. Run `python -m pytest tests/ -v` before committing.
4. **Endpoint naming**: New routers use kebab-case prefixes (`/control-testing`, `/risk-assessment`). Legacy endpoints in `main.py` use snake-case — don't rename them.
5. **Control testing UI**: The current `control-testing.tsx` page still calls `/audit/*` legacy endpoints. Do not switch to `/control-testing/*` in a UI-only change.
6. **HANDOFF.md**: Update `docs/HANDOFF.md` after completing any significant feature or fix.
7. Avoid failing silently and keep adding fallbacks. The goal is to write good clean code, short and efficient. Fail loudly so we can fix and diagnose the issue.
8. Codebase is not to be bloated.

## UI Design System — CRITICAL RULES

Full spec: `docs/superpowers/specs/2026-05-25-trace-ui-design-system.md`  
Reference mockup: `.superpowers/brainstorm/1916-1779711650/content/trace-v3-proper.html`

**Every frontend change must follow these rules. No exceptions.**

### Design Principles
1. Typography creates hierarchy — no decorative gradients on data surfaces
2. Color is functional — navy for primary actions/active state only; status colors only where they carry meaning
3. Borders over shadows — panels use `1px solid var(--border)`; shadows only on shell and modals
4. Icons are Lucide SVG — 15–16px, `stroke-width="1.75"`, no fill. Never emoji or font icons
5. 4px spacing grid — all padding/margin/gap must be multiples of 4px
6. Gradients on primary button only — subtle inset. Never on data cards, headers, or panels

### KPMG Color Palette
| Token | Hex | Use |
|---|---|---|
| `--kpmg-navy` | `#00338D` | Primary button, active sidebar item |
| `--kpmg-cobalt` | `#1E49E2` | Focus rings, links, interactive elements |
| `--kpmg-pacific` | `#00B8F5` | Logo mark, progress fills |
| `--color-success` | `#059669` | Pass/active status |
| `--color-warning` | `#D97706` | Review/pending status |
| `--color-danger` | `#DC2626` | Fail/error status |

### App Shell
- Sidebar: `#0B1526`, 232px expanded / 68px collapsed, 34px item height, grouped nav (Overview / Libraries / Testing / Operations)
- Topbar: 52px, white, `border-bottom: 1px solid var(--border)`, title left + actions right
- `HeroSection.tsx` is **deleted** — replaced by inline page-header pattern per page
- No gradient banners anywhere

### Page Templates (assign the right one to every page)
| Template | Pages |
|---|---|
| **A — List** | Controls Library, Regulatory Library, Frameworks Library, Asset Registry, Issue Management, Reports, Exception Management |
| **B — Detail** | Controls Assurance Detail, Evidence Assessment, Document Uplift Case, Control 360 |
| **C — Wizard** | Controls Assurance New, Risk Assessment (active session), Document Uplift |
| **D — Dashboard/Analytics** | Dashboard, Risk Controls Coverage, Regulation Controls Coverage, Controls Diagnostics, Control Quality Analysis |
| **E — Standalone** | Login, Landing, Not Found |

### Component Rules
- **KPI cards**: white, `rounded-lg`, 3px top-border accent in semantic color. No gradient fill on the card body
- **Status pills**: `rounded-full`, 11px/600, inline dot + label. See spec §5.3 for all variants
- **Tables**: checkbox col, sortable headers (10.5px/700/uppercase), 44px row height, hover `bg-blue-50/60`, row actions on hover
- **Modals**: max-w 560px, `rounded-[14px]`, `--shadow-lg`, header + divider + scrollable body + sticky footer
- **Drawers**: shadcn `<Sheet side="right">`, 480px detail / 640px form
- **Charts**: use `chartTheme.ts` constants (updated per spec §6.1); navy/cobalt/pacific color series; `barSize={24}` bars
- **Empty states**: Lucide icon (muted 30%) + heading + body + CTA. No SVG illustrations
- **Toasts**: shadcn Sonner, bottom-right, left border in semantic color

### What NOT to Change (UI work)
- API calls, fetch hooks, custom hooks — untouched
- FastAPI routers, Python utils — untouched
- MongoDB collections, data models — untouched
- Test files (except fixture updates if a prop signature changes)

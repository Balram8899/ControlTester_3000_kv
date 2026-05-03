# TRACE — Project Handoff Document
**Date:** 2026-04-19 (updated session 2)  
**Branch:** `feature/version_1.2`  
**Status:** Active development — all 4 sub-projects code-complete, risk assessment wizard fully rewritten per v1.2 spec

---

## 1. What Is TRACE?

**TRACE** (Control Tester 3000 / KPMG Audit Platform) is a **cybersecurity audit and compliance assessment platform** built for internal auditors and risk practitioners. It uses a local LLM (Ollama + Llama3:8b) with RAG (FAISS / MongoDB) to:

- Ingest and manage enterprise control libraries, regulatory frameworks, and frameworks
- Run structured risk assessments via LLM-assisted questionnaires
- Test controls against uploaded evidence documents
- Map controls to regulatory obligations
- Score control quality using 5W1H methodology
- Raise and track issues and validation queue items
- Generate markdown audit workpapers and final reports

The platform is **not a SaaS product** — it runs fully locally via Docker Compose on a Windows 11 machine with a local Ollama GPU inference server.

---

## 2. Technology Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts |
| BFF / Proxy | Express.js (`kpmg_ui/server/routes.ts`) — strips `/api` prefix, forwards to FastAPI |
| Backend | FastAPI (Python 3.11) |
| Database | MongoDB (`trace_db`) via pymongo |
| LLM | Ollama — `llama3:8b` for generation, `nomic-embed-text` for embeddings |
| LLM Abstraction | `utils/llm_provider.py` → `get_llm()` — **always use this, never hardcode Gemini or any model** |
| Containers | Docker Compose: `mongodb`, `fastapi_api`, `web_ui_agent` |
| Ports | Web UI: 5000, FastAPI: 8000, Ollama: 11434 |

### Service Names (Docker)
```
mongodb               → mongodb:27017
fastapi_api           → fastapi_api:8000
web_ui_agent          → agent_assess_web (port 5000)
```

### Key Commands
```bash
docker compose up --build -d                  # full rebuild
docker compose up --build -d fastapi_api      # rebuild API only
docker compose up --build -d web_ui_agent     # rebuild UI only
docker logs controltester_3000_kv-fastapi_api-1 --tail 50
```

---

## 3. Repository Layout

```
ControlTester_3000_kv/
├── api/
│   ├── main.py                        # FastAPI app, all legacy endpoints, lifespan/seed
│   ├── Dockerfile                     # includes COPY data ./data for NIST seed
│   └── routers/
│       ├── assets.py                  # Asset Registry CRUD
│       ├── risk_assessment.py         # Risk Assessment full workflow
│       ├── control_testing.py         # Control Testing sessions
│       ├── controls_quality.py        # 5W1H quality analysis (batched, BATCH_SIZE=10)
│       ├── issues.py                  # Issue Management CRUD + workflow
│       └── validation_queue.py        # Validation Queue accept/dismiss
├── utils/
│   ├── llm_provider.py                # get_llm() abstraction — ALWAYS use this
│   ├── controls_library.py            # MongoDB controls store + ingest pipeline
│   ├── regulatory_library.py          # MongoDB regulatory obligations store + extraction
│   ├── frameworks_library.py          # Framework elements store
│   ├── risk_scorer.py                 # CIA scoring, criticality bands, control effectiveness
│   ├── assessment_questions.py        # 8-section question bank (100+ questions)
│   ├── rcm_compliance_analyzer.py     # RCM Excel/CSV parser + compliance analysis
│   └── ...
├── kpmg_ui/
│   └── client/src/
│       ├── pages/
│       │   ├── asset-registry.tsx
│       │   ├── controls-library.tsx
│       │   ├── risk-assessment.tsx
│       │   ├── control-testing.tsx
│       │   ├── regulatory-library.tsx
│       │   ├── frameworks-library.tsx
│       │   ├── issue-management.tsx
│       │   └── ...
│       ├── contexts/
│       │   ├── AssetRegistryContext.tsx
│       │   ├── RiskAssessmentContext.tsx
│       │   ├── ControlTestingContext.tsx
│       │   └── IssueManagementContext.tsx
│       └── components/
│           └── CiaRatingWidget.tsx    # Reusable CIA 1-5 range selector
├── tests/                             # pytest suite (all passing)
│   ├── test_assets_api.py
│   ├── test_risk_assessment_api.py
│   ├── test_control_testing_api.py
│   ├── test_controls_quality.py
│   ├── test_issues_api.py
│   ├── test_validation_queue.py
│   ├── test_risk_scorer.py
│   └── test_assessment_questions.py
├── data/seeds/nist_csf_controls.json  # Auto-seeded at startup if controls empty
└── docs/
    ├── HANDOFF.md                     # This file
    └── superpowers/plans/             # Implementation plans used during dev
```

---

## 4. What Has Been Built (Sub-Projects)

### SP1 — Issue Management
**Status: Complete**

- **Backend:** `api/routers/issues.py` — full CRUD for issues, evidence attachment, status workflow (`Open → In Progress → Resolved → Closed`, also `Returned`)
- **Backend:** `api/routers/validation_queue.py` — accept/dismiss queue items raised by 5W1H analysis
- **Frontend:** `kpmg_ui/client/src/pages/issue-management.tsx` — two-panel layout with severity/status filter dropdowns, Validation Queue tab
- **Context:** `IssueManagementContext.tsx`
- **MongoDB collection:** `issues`, `validation_queue` in `trace_db`

### SP2 — Asset Registry
**Status: Complete**

- **Backend:** `api/routers/assets.py` — CRUD with CIA scoring, `compute_cia_total()`, criticality bands (Low/Medium/High/Critical)
- **Model fields:** `name`, `type` (Application/Hardware/Database/Interface/API/Network/Desktop/Other), `hosting_type`, `support_type`, `confidentiality`, `confidentiality_min`, `integrity`, `integrity_min`, `availability`, `availability_min`, `owner`, `custodian`, `location`, `jurisdiction`, `classification`, `status`
- **CIA ranges:** Each CIA dimension stores both a max value AND a min value (for range assessments). The `cia_total` uses max values for risk-conservative scoring.
- **Frontend:** `asset-registry.tsx` with `CiaRatingWidget` (click to select, click-drag for range), asset detail panel, control suggestions via LLM
- **Context:** `AssetRegistryContext.tsx`

**Important note:** `owner`, `custodian`, `jurisdiction`, `classification` all have defaults (`""`, `""`, `""`, `"Internal"`) — they are NOT required to create an asset. Only `name` and `description` are required for form submission.

### SP3 — Risk Assessment
**Status: Complete + Wizard fully rewritten**

- **Backend:** `api/routers/risk_assessment.py`
  - `POST /risk-assessment/` — create assessment with asset IDs + optional ad hoc apps
  - `POST /risk-assessment/{id}/respond` — save a single Q&A response (still exists)
  - `POST /risk-assessment/{id}/respond-batch` — **NEW** — save all responses for one asset in a single HTTP call (replaces per-question loop)
  - `POST /risk-assessment/{id}/analyze` — hybrid rule-layer + LLM risk identification
  - `POST /risk-assessment/{id}/controls` — apply a control to a risk
  - `POST /risk-assessment/{id}/suggest-controls` — rank controls from library against identified risks
  - `GET /risk-assessment/{id}/residual` — compute residual risk post-controls
  - `POST /risk-assessment/{id}/generate-report` — markdown report
- **Question bank:** `utils/assessment_questions.py` — 8 sections (~12 questions each)
- **Ad hoc applications:** `asset_ids` in MongoDB already includes ad hoc app IDs (merged at create time). Frontend questionnaire tab bar shows all `asset_ids` (real + ad hoc) uniformly.
- **Frontend:** `risk-assessment.tsx` — 7-step wizard: **Create → Questionnaire → Analyse → Risks → Controls → Residual → Report**
- **Context:** `RiskAssessmentContext.tsx` — exports `submitResponseBatch`, `applyControl`

**Key behaviour:**
- **Questionnaire submit:** Uses `submitResponseBatch` — one HTTP call per asset (not per question). Submits all questions including unanswered ones defaulting to "na".
- **Analyse step (step 2):** Auto-triggers `analyzeAssessment` via `useEffect` when step is reached. Shows loading spinner only — no button. Auto-advances to Risks when complete.
- **Controls step (step 4):** Shows suggested controls per risk (auto-fetched via `suggestControls`). User clicks "Apply" per control. Already-applied controls show checkmark.
- **Residual step (step 5):** Auto-fetches residual via `useEffect` on step enter. Shows loading spinner then table.
- **Sticky submit bar** pinned to top of questionnaire; shows asset count and answered count.
- Section progress counter and `answeredCount` both count all answers including N/A.
- Analyse endpoint is lenient when `ra.responses` is empty (logs warning, proceeds with CIA-only scoring).

### SP4 — Control Testing
**Status: Complete**

- **Backend:** `api/routers/control_testing.py`
  - Full testing session lifecycle: Create → Upload Evidence → LLM Evidence Review → Generate Report
  - `POST /control-testing/sessions` — create session with controls from library
  - `POST /control-testing/sessions/{id}/upload-evidence` — attach evidence files
  - `POST /control-testing/sessions/{id}/review-evidence` — LLM analysis of evidence against controls
  - `POST /control-testing/sessions/{id}/generate-report` — markdown workpaper
- **Frontend:** `control-testing.tsx` — 4-step persistent wizard, session list in left panel
- **Context:** `ControlTestingContext.tsx`
- **MongoDB collection:** `control_testing_sessions` in `trace_db`

---

## 5. Library Features (in `api/main.py`)

These are large endpoints living in `main.py` (not yet split into routers):

### Controls Library (`/controls-library/*`)
- `POST /controls-library/ingest` — upload Excel/PDF/Word control documents, LLM extracts controls, runs 5W1H analysis, stores in MongoDB
- `GET /controls-library/all-controls` — returns all controls with `mapped_obligations` field
- `GET /controls-library/documents` — list uploaded documents
- `POST /controls-library/quality-analysis` — 5W1H LLM evaluation (BATCH_SIZE=10)
- `POST /controls-library/remap-obligations` — re-map all controls against current regulatory library
- **Auto-triggers on ingest:** 5W1H quality analysis + obligation mapping

**Excel/CSV column detection** (`utils/rcm_compliance_analyzer.py`): Handles flexible headers — CCF-style (`CCF ID`, `Control Domain`, `Control Theme`), ISO-style (`Control Reference`, `Control Title`), generic (`ID`, `Name`, `Description`). Do NOT revert this — it was deliberately broadened.

### Regulatory Library (`/regulatory-library/*`)
- `POST /regulatory-library/ingest` — extract obligations from regulatory PDFs (RBI, MAS TRM, ISO 27001, NIST, etc.)
- `GET /regulatory-library/documents` — list documents
- `GET /regulatory-library/all-obligations` — flat list of all obligations
- `POST /regulatory-library/remap-obligations` — re-map all controls to obligations (auto-triggers after regulatory ingest)
- **LLM extraction:** `utils/regulatory_library.py` — `ObligationExtractorAgent`, BATCH_SIZE=10, MAX_WORKERS=4
- **Extraction prompt** explicitly excludes: document titles, scope/applicability clauses, definitions sections, preambles. Only extracts actual control-level obligations with "shall/must/required/implement" language.

### Frameworks Library (`/frameworks-library/*`)
- Upload framework documents (NIST CSF, ISO 27001, COBIT, etc.)
- Extract framework elements (controls, objectives, domains)
- Auto-seeded with NIST CSF at startup if empty

---

## 6. MongoDB Database

**Database name:** `trace_db` (lowercase — important, was previously `Trace_db` which caused Windows case-sensitivity errors)

| Collection | Purpose |
|---|---|
| `assets` | Asset registry |
| `risk_assessments` | Risk assessment sessions |
| `control_testing_sessions` | Control testing sessions |
| `issues` | Issue management |
| `validation_queue` | 5W1H quality findings awaiting review |
| `controls_library` | Ingested control documents |
| `regulatory_library` | Ingested regulatory obligation documents |
| `frameworks_library` | Ingested framework documents |
| `nist_controls` | NIST CSF seed data |

**Critical:** Four legacy utility files each have their own MongoDB client. All must use `DB_NAME = "trace_db"`:
- `utils/regulatory_library.py`
- `utils/regulatory_comparision.py`
- `utils/controls_library.py`
- `utils/frameworks_library.py`
- `utils/rcm_report_store.py`

---

## 7. LLM / Model Rules

**Always use `get_llm()` from `utils/llm_provider.py`**. Never hardcode `ChatGoogleGenerativeAI`, `ChatOllama`, or any model name directly in router/utility code. `get_llm()` auto-selects Ollama locally or falls back to Gemini if configured.

```python
from utils.llm_provider import get_llm
llm = get_llm()
response = llm.invoke([HumanMessage(content=prompt)])
```

---

## 8. CIA Rating Widget

`kpmg_ui/client/src/components/CiaRatingWidget.tsx`

- Shows 5 buttons (1–5) per dimension (Confidentiality, Integrity, Availability)
- **Click** a button = select single value (min = max = n)
- **Click and drag** across buttons = select a range (e.g., drag 1→3 highlights 1–2–3)
- Props: `confidentiality`, `confidentiality_min`, `integrity`, `integrity_min`, `availability`, `availability_min`, `onChange(field, min, max)`, `readOnly`
- Used in: `asset-registry.tsx` (create + detail view), `risk-assessment.tsx` (ad hoc app form)

---

## 9. Known Issues / Remaining Work

### SOP Uplift Foundation Added (2026-04-27)

- **Backend:** `api/routers/sop_uplift.py` registered at `/sop-uplift`.
- **Utilities:** `utils/sop_uplift/` now contains V1 modules for case storage, readiness, Markdown conversion, anchors, chunks, content sanitization, tagging, extraction routing, deterministic extractors, corpus mapping, retrieval, rule-based suggestions, prompt templates, JSON LLM orchestration, preview models, DOCX generation, Draw.io/SVG/PDF diagram export, change logs, schema validation, and task state.
- **Frontend:** `kpmg_ui/client/src/pages/sop-uplift.tsx` is routed at `/sop-uplift`, visible in the landing page and sidebar, uses `@xyflow/react` for swimlane preview, and calls case/readiness/chat/analyze/output APIs.
- **Persistence/Reports:** SOP Uplift raw files and generated outputs can be persisted through the SOP Uplift GridFS collection when MongoDB is available, with in-memory fallback for tests. `utils/rcm_report_store.py` supports `report_type="sop_uplift"` records and the Reports page recognizes/downloads SOP Uplift outputs.
- **Amendments implemented:** prompt-injection screening via `content_sanitizer.py`, chunk length capping, structural `<document_content>` delimiters, batch `extract`/`analyze` endpoints, per-stage `processing_state`, CairoSVG-backed diagram PDF path with ReportLab fallback, and SOP Uplift env vars.
- **Current limitation:** Prompt templates and JSON validation are in place, and extract/analyze can opt into the LLM runner, but extraction and suggestions still fall back to deterministic V1 scaffolds. The 21 prompt stages need deeper schema-specific parsing, retry policy, and UX surfacing before this should be treated as complete AI analysis.

### SOP Uplift Swimlane Output Fix (2026-05-03)

- Final generated swimlane artifacts now rebuild the diagram from `revised_sop_sections` at `generate-outputs` time instead of reusing stale `case.diagram_model` preview data.
- Accepted suggestions use `suggested_text`; edited suggestions use `user_text`; rejected and open suggestions are excluded from the implemented process diagram and surfaced through warnings.
- Supporting controls/risks can enrich summaries, but supporting-document-only process steps are not added as flow nodes.
- The swimlane prompt now states the effective SOP source priority, supporting-document enrichment limits, C#/R#/E# anti-invention rules, reference-artifact paths, and sizing/readability guardrails.

### LLM Provider Expansion (2026-05-03)

- Settings now supports `kimi` and `deepseek` alongside Gemini, OpenAI, Anthropic, and Ollama.
- Kimi uses the OpenAI-compatible Moonshot endpoint with `kimi-k2.6` as the default model. Set either `MOONSHOT_API_KEY` or `KIMI_API_KEY`; optional vars are `KIMI_BASE_URL`, `KIMI_TEMPERATURE`, and `KIMI_THINKING`.
- DeepSeek defaults to `deepseek-v4-pro` per the current local preference. Other selectable options are `deepseek-v4-flash`, `deepseek-chat`, and `deepseek-reasoner`; set `DEEPSEEK_API_KEY`, with optional `DEEPSEEK_BASE_URL`, `DEEPSEEK_TEMPERATURE`, `DEEPSEEK_THINKING`, and `DEEPSEEK_REASONING_EFFORT`.
- The Settings Test Connection action can test the currently selected provider/model before saving it.
- Provider-specific client setup remains centralized in `utils/llm_provider.py` and `utils/llm_factory.py`; feature code should still call `get_llm()` or `make_llm()` only.

### Confirmed Bugs (not yet fixed as of last session)
None critical — all reported bugs have been fixed and deployed.

### Functional Gaps / TODO
1. **Exception Management** — removed from sidebar entirely (there is no such module in TRACE).
2. **Issue Management → Evidence attachment UI** — backend supports it but frontend doesn't have file upload in the issue detail panel.
3. **Control Testing — control selection from library** — currently selects all controls in a session; should allow filtering by domain before starting.
4. **Regulatory Library quality** — LLM still occasionally extracts near-obligation sentences (e.g., applicability statements) despite the improved prompt. Would benefit from post-processing filter scoring `enforcement_level`.
5. **5W1H analysis performance** — with 300+ controls, takes ~30 min on CPU Ollama. Quality results only appear after the full batch completes; no streaming progress to the UI.
6. **Regulatory mappings per control** — `mapped_obligations` is populated when a regulatory document is ingested OR when "Re-map" is clicked. If no regulatory documents are uploaded yet, all controls show "No matching obligations found" — this is expected.
7. **Risk Assessment → Inherent risk always scores "Low"** — The rule-layer scoring in `_rule_layer_scores()` (`risk_assessment.py`) is producing low likelihood/impact regardless of questionnaire answers. Likely cause: section/question ID mismatch between what `get_sections()` returns and what the batch-submitted responses store. Debug by logging `section_map` keys vs `r["section_id"]` values on a real submission.
8. **Risk Assessment → Controls step shows no suggestions** — `suggest-controls` endpoint (`POST /{ra_id}/suggest-controls`) is failing silently or returning empty. Check: (a) controls library must be populated first; (b) the LLM prompt in `suggest_controls()` handler may fail if `ra.risks` is empty at call time; (c) check FastAPI logs when "Refresh Suggestions" is clicked.
9. **Risk Assessment → Controls step** — `applyControl` does not currently update `effectiveness_score` (stored as 0.0). Residual calculation uses this, so residual = inherent unless effectiveness is set elsewhere.
8. **Final Report page** — `reports.tsx` exists but unclear if wired to assessment data; needs verification.
9. **Dashboard KPIs** — may not update in real-time after creating assets/assessments; likely needs a refresh trigger.

### UI/UX Gaps
- Issue Management: no inline edit (must delete and re-create)
- Asset Registry: no bulk import
- Controls Library: quality tab only shows up to the first batch submitted after upload; re-triggering requires switching to quality tab (which auto-fetches)
- Risk Assessment: wizard step indicator (1/5, 2/5 etc.) is present but breadcrumb nav could be clearer
- All pages: no loading skeleton states, just spinners

---

## 10. Testing

```bash
cd api
pip install -r requirements.txt
pytest ../tests/ -v
```

All tests are in `tests/`. They use `TestClient` from FastAPI + `mongomock` (no real MongoDB needed for unit tests).

Test files:
- `test_assets_api.py` — CRUD, CIA scoring, criticality bands
- `test_risk_assessment_api.py` — create, submit, analyse, suggest, report
- `test_control_testing_api.py` — session lifecycle
- `test_controls_quality.py` — 5W1H batching, placeholder fallback
- `test_issues_api.py` — CRUD, workflow transitions
- `test_validation_queue.py` — accept/dismiss
- `test_risk_scorer.py` — CIA total, criticality, control effectiveness
- `test_assessment_questions.py` — question bank structure

---

## 11. Decisions Locked (Do Not Change)

| # | Decision |
|---|---|
| D1 | CIA numeric 1–5 (not Low/Medium/High labels) |
| D2 | Drop `periodicity` field from controls |
| D3 | BIA/LEGAL/PIA asset types replaced with standard AssetType enum |
| D4 | 5W1H quality analysis auto-triggers on controls ingest (backend) |
| D5 | All LLM calls go through `get_llm()` — no hardcoded model names |
| D6 | MongoDB database name is `trace_db` (lowercase) — never change back |
| D7 | CCF/custom Excel headers supported via flexible keyword matching in `parse_rcm_excel` |

---

## 12. How to Run Locally

```bash
# Prerequisites: Docker Desktop running, Ollama running with llama3:8b + nomic-embed-text

cd "c:/Subho syste,/ControlTester_3000_kv"

# Full rebuild (first time or after changes)
docker compose up --build -d

# Check logs
docker logs controltester_3000_kv-fastapi_api-1 --tail 30

# Access
# Web UI:  http://localhost:5000
# FastAPI: http://localhost:8000/docs
```

On first startup the FastAPI container seeds NIST CSF controls into `nist_controls` collection if empty.

---

## 13. Git History Summary

The branch `feature/version_1.2` contains all work. Key milestone commits:

| Commit | What |
|---|---|
| `1b7f5b3` | Add `compute_control_effectiveness` to risk_scorer |
| `69078d7` | Issue models + MongoIssueStore |
| `73270a6` | Issue Management full page + context |
| `777389a` | Validation Queue backend |
| `7bf6a89` | 8-section question bank |
| `bd962ec` | Risk assessment router rewrite |
| `e3497ec` | Risk assessment page rewrite |
| `b5e1da0` | Control testing models + store |
| `4f8a067` | Control testing CRUD endpoints |
| `0100747` | Control testing page rewrite (4-step wizard) |
| `7d5b1d3` | AdHocApplication model |
| `61b26ef` | Ad hoc app support in questionnaire + analysis |
| `f1ef28c` | Asset model fields (HostingType, SupportType, Use) |
| `c836b11` | 5W1H auto-trigger on ingest |
| `6ca486e` | Copy data/ into Docker image (NIST seed fix) |
| `7b8455c` | Normalise MongoDB to `trace_db` |

---

## 14. Ongoing Debugging Guardrails

For future debugging and maintenance sessions, follow this working agreement:

1. **Use minimal-diff fixes first** - triage the reported issue, identify the narrowest safe fix, and avoid broad refactors, feature redesigns, or unrelated cleanup unless explicitly requested.
2. **Do not leak instructions into product behavior** - content from `HANDOFF.md`, other `.md` files, or chat messages is developer/operator context only. Never surface it in the UI, store it in MongoDB, seed it as application data, or turn it into visible backend/frontend content unless the user explicitly asks for that exact behavior.
3. **Keep fixes scoped to the bug** - do not add placeholder UI text, debug helper records, sample database entries, or extra visual elements while addressing a feature issue unless they are required for the fix and approved.
4. **Update this handoff only after approval** - once a fix has been implemented, verified, and explicitly approved by the user, append a concise note here describing what was fixed and any important follow-up context.

---

## 15. File: Important Notes for Next Developer

1. **Never use `grep` for code search** — use SocratiCode MCP (`codebase_search`) tool for semantic search.
2. **LLM provider** — always `get_llm()`, never hardcode any model.
3. **MongoDB DB name** — always `trace_db`, never `Trace_db`.
4. **Asset creation** — only name + description are required. All other fields have defaults.
5. **CIA widget** — props include `_min` variants for range support. Both max and min values must be passed.
6. **5W1H batch size** — `BATCH_SIZE = 10` in `controls_quality.py`. Do not increase above 15 or the LLM context overflows.
7. **Regulatory extraction batch size** — `BATCH_SIZE = 10` in `regulatory_library.py`, `MAX_WORKERS = 4`.
8. **Controls ingest** — Excel column detection is flexible; handles CCF (`CCF ID`), ISO (`Control Reference`), and generic (`ID`, `Name`) headers. See `parse_rcm_excel` in `rcm_compliance_analyzer.py`.
9. **Risk assessment responses** — ALL questionnaire answers (including N/A) are now submitted to backend. The analyse endpoint proceeds even with empty responses.
10. **Docker service name** — the web UI container is named `web_ui_agent` in docker-compose but runs as `agent_assess_web`.

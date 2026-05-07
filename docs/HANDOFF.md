# TRACE — Project Handoff Document
**Date:** 2026-04-19 (updated session 2)  
**Branch:** `feature/version_1.2`  
**Status:** Active development — all 4 sub-projects code-complete, risk assessment wizard fully rewritten per v1.2 spec

---

## 2026-05-07 Update - Document Uplift Domain-Agnostic Analysis Addendum

- Scope: implemented the Checkpoint C addendum to broaden Document Uplift analysis beyond RCM-shaped evidence while preserving the original service architecture and keeping Document Uplift independent from `utils/sop_uplift/`.
- Added `docs/document-uplift-severity-calculation.md` as a focused severity/confidence reference. The full architecture/components/processes document is intentionally deferred until the original Document Uplift plan is complete.
- Added normalized fact/finding models in `utils/services/schemas.py`: `DocumentFact`, `NormalizedFinding`, `DiscoveryCandidate`, expanded severity vocabulary (`critical`, `high`, `medium`, `low`, `informational`), richer `SourceReference`, corpus-map extensions, and `agent_follow_up_questions`.
- Added `utils/services/severity.py`, `utils/services/semantic_roles.py`, and `utils/services/generic_findings.py` for deterministic severity helpers, semantic field-role classification, generic structured-document fact generation, seed finding detection, discovery routing, and suggestion mapping.
- Updated `utils/services/excel_pipeline.py` so non-RCM structured documents preserve `_raw_attributes`, `_semantic_roles`, and `_source`, emit normalized facts, and can generate generic high-confidence suggestions without requiring `risk_id` or `control_id`.
- Updated `utils/sop_processing/case_store.py` and `utils/sop_processing/pipeline.py` to persist detailed facts in a separate `document_uplift_facts` collection, keep large facts outside `document_uplift_cases`, merge generic finding summaries, and route low-confidence ambiguity to follow-up questions rather than uplift suggestions.
- Updated `utils/services/analysis.py` to preserve the full severity vocabulary from LLM suggestions and to map unknown raw suggestion categories back to `process_improvement` instead of dropping them.
- Updated `kpmg_ui/client/src/pages/document-uplift.tsx` and added `kpmg_ui/client/src/document-uplift.severity.test.ts` so the UI supports and sorts `critical`, `high`, `medium`, `low`, and `informational`.
- Added/expanded coverage in `tests/services/test_severity.py`, `tests/services/test_schemas.py`, `tests/services/test_semantic_roles.py`, `tests/services/test_generic_findings.py`, `tests/services/test_excel_pipeline.py`, `tests/services/test_analysis.py`, and `tests/test_document_uplift_pipeline.py`.
- Verification run: 92 backend tests passed across the Document Uplift addendum, API, and settings slice; frontend guards `document-uplift.item29`, `document-uplift.item30`, and `document-uplift.severity` passed; `npm run check` and `npm run build` passed with existing PostCSS/chunk-size warnings.
- Remaining original-plan gates from that checkpoint: manual Word 365 review, T8 human usefulness review, and new T9 cross-domain usefulness review.

---

## 2026-05-07 Update - Document Uplift Items 32 and 33 Queue Infrastructure

- Scope: completed the remaining technical infrastructure items from the original Document Uplift plan: Item 32 Celery/Redis wiring and Item 33 final asyncio queue.
- Added `redis` and `celery_worker` services to `docker-compose.yml`. The Celery worker uses the existing API image and starts `celery -A utils.sop_processing.celery_app worker` over the `document_uplift,conversion,chunking,excel,llm,analysis,outputs` queues.
- Added `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `TASK_BACKEND`, `DOCUMENT_UPLIFT_ASYNC_WORKERS`, `DOCUMENT_UPLIFT_QUEUE_MAXSIZE`, and `DOCUMENT_UPLIFT_PIPELINE_TIMEOUT_SECONDS` environment settings.
- Added `celery==5.4.0` and `redis==5.0.4` to both API and root requirements.
- Added `utils/sop_processing/celery_app.py` with the Celery app, task routes, full Document Uplift pipeline task, and small-result service wrappers. Redis never receives markdown, chunk arrays, or full analysis payloads.
- Replaced the interim asyncio `to_thread` dispatch path in `utils/sop_processing/pipeline.py` with `AsyncPipelineQueue`: bounded queue, fixed workers, duplicate-case protection, back-pressure errors, graceful shutdown, and `run_in_executor` for blocking pipeline work.
- FastAPI lifespan in `api/main.py` now starts/stops the async queue when `TASK_BACKEND=asyncio`; celery mode enqueues through Celery and keeps pipeline work outside the API process.
- `DocumentUpliftCaseStore.get_case()` now marks stale running jobs as failed after `DOCUMENT_UPLIFT_PIPELINE_TIMEOUT_SECONDS`.
- Router dispatch errors map to HTTP 409 for duplicate queued/running cases and HTTP 429 when the async queue is full.
- Added tests in `tests/test_document_uplift_infrastructure.py` and expanded `tests/test_document_uplift_pipeline.py` for Celery dispatch, queue behavior, executor usage, stale timeout, and Compose/requirements wiring.
- Verification run: 99 backend tests passed across the Document Uplift, infrastructure, API, and settings slice; frontend guards passed; `npm run check`, `npm run build`, `docker compose config --quiet`, and `docker compose --dry-run build fastapi_api celery_worker` passed.
- Remaining gates are human-only: manual Word 365 review, T8 suggestion usefulness review, and T9 cross-domain usefulness review. The final overall architecture document remains deferred until those gates are complete.

---

## 2026-05-06 Update - Document Uplift Service Foundation

- Scope: implemented Track B Items 7 and 8 only for the new service-based Document Uplift feature; existing SOP Uplift code remains untouched.
- Added `utils/services/__init__.py` and `utils/services/schemas.py` as the shared stateless schema layer for Document Uplift services.
- Added `tests/services/test_schemas.py` with schema contract coverage for identity literals, conversion/chunk defaults, LLM cost records, Excel corpus maps, suggestions, `AnalysisResult`, swimlane output, and `DocumentUpliftCase` defaults.
- Added `utils/services/conversion.py` as the new stateless conversion service for DOCX, PDF, Excel, text, corruption detection, and DOCX style extraction for procedure/policy tags.
- Added `tests/services/test_conversion.py` with contract coverage for DOCX markdown, procedure/policy style profiles, Excel routing as `xlsx`, unsupported extensions, and corrupt PDF partial status.
- Added `utils/services/llm_orchestrator.py` as the new stateless LLM orchestration service with budget checks, JSON retry, call records, cost calculation, and model-aware batch sizing.
- Added `tests/services/test_llm_orchestrator.py` with contract coverage for budget exhaustion, successful JSON calls, call telemetry, malformed JSON retry, Ollama zero-cost, Gemini Flash cost, and batch sizing.
- Added `utils/services/excel_pipeline.py` as the new structured Excel pipeline with schema detection, merged-cell propagation, row completeness scanning, and corpus map output.
- Added `tests/services/test_excel_pipeline.py` with coverage for 500-row RCM processing, ownership gaps, merged cells, row-2 headers, multi-sheet handling, empty-sheet skipping, budget skipping, corpus maps, and capped RowGap-derived suggestions.
- Added `utils/services/analysis.py` as the Item 13 skeleton `analyze_documents()` interface only; full Stage 1 extraction remains deferred to later plan items.
- Added `tests/services/test_analysis.py` with skeleton success and budget-exhaustion coverage.
- Added `utils/sop_processing/sse_events.py` as the Item 18 SSE formatting helper only; no router endpoint was added.
- Added `tests/sop_processing/test_sse_events.py` with SSE event formatting coverage.
- Added Document Uplift budget config helpers in `utils/llm_config_store.py`: `get_document_uplift_config()` and `save_document_uplift_config()`, backed by MongoDB and seeded from `MAX_LLM_CALLS_PER_PIPELINE` only when absent.
- Added `tests/test_settings.py` coverage for reading the DB budget, env seeding, and clamping to the 5-200 range.
- Added `utils/sop_processing/content_sanitizer.py` and `utils/sop_processing/prompts.py` for Item 20, including FD7 delimiter wrapping, injection-risk screening, truncation, all eight prompt templates, and prompt version constants.
- Added `tests/sop_processing/test_content_sanitizer.py` and `tests/test_prompts.py` coverage for sanitizer behavior and prompt contracts.
- Plan/schema correction: Item 11 required a capped `Suggestion` list from RowGap entries, so `ExcelPipelineResult.suggestions` was added to `utils/services/schemas.py` and documented in the plan’s Topic 1 block.
- Build tracking: `docs/document-uplift-build-log.md` marks Items 7, 8, 9, 10, 11, 13, 18, 19, and 20 complete and records the red/green TDD evidence.
- Verification: `python -m pytest tests/test_settings.py tests/test_prompts.py tests/services/ tests/sop_processing/ -v` reports 66 passed with one Pydantic warning for the plan-required `SheetResult.schema` field name.
- Next Document Uplift item: Item 16, but it is blocked because the implementation table lists deferred Track A Item 4 as a dependency.

---

## 2026-05-06 Update - Risk Assessment Page-Local UI Overhaul

- Scope: page-local redesign of `kpmg_ui/client/src/pages/risk-assessment.tsx`; route, providers, backend contracts, and all non-risk-assessment features were deliberately left unchanged.
- New page structure: a TRACE-style assessment workspace with a session rail, dashboard state, create-assessment workspace, and a clearer selected-assessment workflow.
- Preserved workflow stages: `Create`, `Questionnaire`, `Analyse`, `Risks`, `Controls`, `Residual`, and `Report`.
- Functionality preserved: assessment creation, asset loading, section loading, batch questionnaire submission, automatic analysis trigger, control suggestions, control application, residual fetch, report generation, and direct assessment refresh.
- Data sources preserved: `useRiskAssessment()`, `useAssetRegistry()`, and the existing direct refresh call to `GET /api/risk-assessment/{id}`.
- New browser smoke markers: `data-risk-assessment-page`, `data-risk-assessment-rail`, `data-risk-assessment-dashboard`, `data-risk-assessment-create`, `data-risk-assessment-stepper`, `data-risk-assessment-questionnaire`, `data-risk-assessment-analysis`, `data-risk-assessment-risks`, `data-risk-assessment-controls`, `data-risk-assessment-residual`, and `data-risk-assessment-report`.
- Design references added: `docs/ui-overhaul/risk-assessment-design.md`, `docs/ui-overhaul/risk-assessment-mockups.html`, `docs/ui-overhaul/risk-assessment-mockups-board-1.svg`, `docs/ui-overhaul/risk-assessment-mockups-board-2.svg`, and the Risk Assessment entry in `docs/ui-overhaul/ui-overhaul-log.md`.
- Regression coverage added: `kpmg_ui/client/src/risk-assessment.overhaul.test.ts`.
- Verification run: `node --import tsx .\client\src\risk-assessment.overhaul.test.ts`, `npm run check`, and `npm run build`. Build completed with the existing Vite chunk-size and PostCSS `from` option warnings only.

---

## 2026-05-04 Update - SOP Uplift Suggestion Parsing Robustness

- Root cause: useful LLM suggestion responses could be discarded when the model returned structured warning objects instead of plain warning strings. The same strict parsing could invalidate full-document extraction when role/lane hints were returned as objects.
- Fix: `utils/sop_uplift/llm_schemas.py` now normalizes structured warnings and role labels into concise strings, keeps valid suggestions, accepts low-confidence corpus notes as message objects, and makes case-finalization diagram payloads lenient so malformed diagram details do not invalidate the whole finalization response.
- Regression coverage: `tests/test_sop_uplift_modules.py` adds focused tests for preserving suggestions with structured warnings and accepting structured role/warning items from full-document extraction.
- Verification run: `python -m pytest tests/test_sop_uplift_modules.py tests/test_sop_uplift_api.py tests/test_sop_uplift_pipeline.py -q` and `node --import tsx .\client\src\pages\sop-uplift.integration.test.ts`.

---

## 2026-05-04 Update - Dashboard Page-Local UI Overhaul

- Scope: page-local redesign of `kpmg_ui/client/src/pages/dashboard.tsx`; app shell, sidebar, footer, auth flow, routes, providers, APIs, and feature workflows were deliberately left unchanged.
- New Dashboard structure: `Overview`, `Libraries`, `Workflows`, and `Exceptions` tabs. `Overview` follows the approved mockup with a compact dark `DASHBOARD` banner, eight KPI tiles, primary chart grid, `Domain Coverage`, and `Testing Sessions By Status`.
- Data sources preserved and reused: `useLibraryMetrics()`, `useCrossNav()`, `useAssetRegistry()`, `useRiskAssessment()`, `useIssueManagement()`, `useChatContext()`, `/api/settings/system-status`, `/api/control-testing`, `/api/rcm-reports`, `/api/sop-uplift/cases`, `/api/frameworks-library/documents`, `/api/frameworks-library/all-elements`, and existing `setLocation(...)` navigation.
- Dashboard does not add `/api/dashboard-summary` or backend aggregation. Empty states are numeric/source-backed only.
- Design references created: `docs/ui-overhaul/dashboard-design.md` and `docs/ui-overhaul/ui-overhaul-log.md`.
- Regression coverage: `kpmg_ui/client/src/dashboard.overhaul.test.ts` asserts the tab model, default tab, smoke-test tab attributes, preserved status endpoint, no dashboard-summary endpoint, and reference docs.
- Verification run: `node --import tsx .\client\src\dashboard.overhaul.test.ts`, `npm run check`, `npm run build`, plus Playwright smoke on `http://localhost:5175/` for sign-in, tab switching, refresh, mobile resize, and browser console errors.

## 2026-05-07 Update - Dashboard Option 3 Chart-System Refinement

- Scope: dashboard-only refinement of `kpmg_ui/client/src/pages/dashboard.tsx` after live review of label collisions, undersized donut charts, uneven chart motion, low-value `Chat Activity`, and an orphaned `Testing Sessions By Status` card on `Overview`.
- New chart-system behavior: shared bar-chart label density modes, centered framed donut charts with total readouts, shared horizontal/segmented fill animation, and tightened chart card composition across tabs.
- New tab composition:
  - `Overview`: four KPI cards, `Assets By Criticality`, `Assessments By Status`, `Issues By Severity`, `Reports By Type`, and `Domain Coverage`.
  - `Workflows`: module health row plus `Testing Sessions By Status`, `Control Test Results`, `SOP Cases By Status`, and `Reports By Type`.
  - `Chat Activity` removed from the dashboard.
- Data sources preserved: `useLibraryMetrics()`, `useCrossNav()`, `useAssetRegistry()`, `useRiskAssessment()`, `useIssueManagement()`, `/api/settings/system-status`, `/api/control-testing`, `/api/rcm-reports`, `/api/sop-uplift/cases`, `/api/frameworks-library/documents`, `/api/frameworks-library/all-elements`, and existing `setLocation(...)` navigation.
- Design references added: `docs/ui-overhaul/dashboard-option-3-mockups.html` and `docs/ui-overhaul/dashboard-option-3-chart-system.html`. Existing dashboard reference docs were updated to match the shipped composition.

---

## 2026-05-04 Update - Controls Library Page-Local UI Overhaul

- Scope: page-local redesign of `kpmg_ui/client/src/pages/controls-library.tsx`; route, app shell, providers, backend contracts, and data model were deliberately left unchanged.
- New Controls Library structure: one scrollable page with `Upload Policy Documents`, `Documents`, a scoped `Library Dashboard`, `5W1H Quality Charts`, and `5W1H Scores by Control`.
- Duplicate dashboard tabs were removed. The unified dashboard now uses `All Uploaded Database` / `Selected Document` scope so metrics, charts, and table rows can reflect the whole library or one uploaded document.
- Functionality preserved: upload, queued file removal, ingest polling, document selection, delete, clear library, refresh, `Map Obligations`, merged view, backend 5W1H quality analysis, CSV export, mapped obligation navigation, and control detail modal.
- Data sources preserved: `/api/controls-library/documents`, `/api/controls-library/documents/{document_id}`, `/api/controls-library/ingest`, `/api/ingest-task/{task_id}`, `/api/controls-library/remap-obligations`, `/api/controls-library/all-controls`, `/api/controls-library/merged`, `/api/controls-library/quality-analysis`, `useCrossNav()`, and `useLibraryMetrics()`.
- Design reference created: `docs/ui-overhaul/controls-library-design.md`; running log updated in `docs/ui-overhaul/ui-overhaul-log.md`.
- Regression coverage: `kpmg_ui/client/src/controls-library.overhaul.test.ts` asserts preserved endpoints/handlers, scope model, approved one-page section markers, removal of duplicate dashboard tabs, and documentation updates.
- Verification run: `node --import tsx .\client\src\controls-library.overhaul.test.ts`, `npm run check`, `npm run build`, `docker compose build web_ui_agent`, `docker compose up -d --force-recreate web_ui_agent`, `docker compose ps`, and HTTP 200 on `http://localhost:5000/`.
- Browser smoke note: Playwright CLI open was attempted, but local Playwright Chrome was missing and `install-browser chrome` failed due insufficient install privileges.
- 413 fix: Quality analysis now sends capped, batched frontend requests to `/api/controls-library/quality-analysis` instead of posting the full controls corpus in one JSON body. This addresses Express HTTP 413 errors on larger uploaded libraries while preserving the endpoint and backend behavior.
- Quality display fix: Controls Library no longer auto-populates 5W1H-derived dashboard values on page load or immediately after ingest. Quality KPIs, charts, table scoring, CSV export, and detail quality fields show `Data not available` until `Run Quality Check` is clicked.
- Backend `Analysis unavailable` fallback rows are excluded from scoring visuals and listed as unavailable analysis instead of being counted as real `0/6` red findings.
- Visual polish: Controls Library chart typography and graph colors were standardized to TRACE/KPMG tokens, and the control detail modal was restyled as a light TRACE dialog without changing its data or obligation navigation behavior.
- Combined analysis update: the visible `Map Obligations` and `Run Quality Check` actions were consolidated into one `Run Analysis` button that refreshes obligation mappings before running 5W1H quality scoring. `Quality RAG by Process Area` now shows readable TRACE-styled domain bars and `Tagged Domains` pills.

---

## 2026-05-05 Update - Regulatory Testing Page-Local UI Overhaul

- Scope: page-local redesign of `kpmg_ui/client/src/pages/regulatory-testing.tsx`; route, app shell, context, backend endpoints, payload construction, and export handlers were deliberately left unchanged.
- New landing/setup structure: `Regulation vs Regulation` and `RCM vs Regulation` are explicit path cards, followed by the existing upload/library source selectors and a `Run Readiness` card.
- New result structure: post-run output is a four-view workbench: `Summary`, `Domain Drilldown`, `Gap Analysis`, and `Report`.
- Functionality preserved: Regulation A/B upload or library selection, RCM file upload, RCM baseline selection from library or upload, run comparison, export JSON, export markdown report, export PDF, and new comparison reset.
- Data sources preserved: `/api/regulatory-library/documents`, `/api/compare-regulations`, `/api/rcm_compliance_v2`, `/api/rcm_compliance`, and `/api/regulatory-library/gap-analysis/pdf`.
- Design reference created: `docs/ui-overhaul/regulatory-testing-design.md`; running log updated in `docs/ui-overhaul/ui-overhaul-log.md`.
- Regression coverage: `kpmg_ui/client/src/regulatory-testing.overhaul.test.ts` asserts preserved endpoints/actions, redesigned setup/result smoke markers, approved labels, no synthetic feed copy, and documentation updates.
- Verification run: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts`, `node --import tsx .\client\src\pages\regulatory-testing.helpers.test.ts`, `npm run check`, `npm run build`, `docker compose build web_ui_agent`, `docker compose up -d --force-recreate web_ui_agent`, HTTP 200 on `http://localhost:5000/regulatory-testing`, and Playwright CLI smoke on Microsoft Edge for sign-in, setup render, RCM mode switch, mobile resize, and console errors. Vite emitted the existing chunk-size and PostCSS `from` option warnings.
- Setup layout correction: Regulation A/B now uses explicit high-contrast source toggles, compact library selection rows, bounded source-card grid columns, and `min-w-0` guards to avoid horizontal page scroll. Verification rerun: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` and `npm run check`. Containers were not rebuilt for this correction per active UI testing request.
- Result presentation correction: post-run views now use short source labels, a plain-language summary insight, `Coverage By Domain`, a clearer `Gap Matrix`, and a styled `Formatted Report` preview with title-cased markdown headings. Verification rerun: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` and `npm run check`. Containers were not rebuilt for this correction per active UI testing request.

---

## 2026-05-03 Update - SOP Uplift DOCX Export Formatting

- Root cause: `utils/sop_uplift/rewrite_generator.py` generated uplift DOCX files with a fresh `Document()` package, so exported SOPs lost the uploaded Word document's template, paragraph styles, tables, and visual context.
- Fix: SOP/policy `.docx` uploads are now selected as the export base when generating SOP Uplift outputs. The original DOCX package remains intact, and accepted/edited suggestions are inserted as visible `TRACE Uplift Change [...]` blocks near the matched source paragraph.
- Change clarity: generated DOCX exports also append a `TRACE Change Register` with process metadata, original struck-through SOP language, applied SOP language, and rejected suggestions.
- Fallback behavior: cases without a usable source `.docx` continue to use the existing generated DOCX path.
- Regression coverage: `test_generate_docx_preserves_source_docx_formatting_and_inserts_change_blocks` and `test_generate_outputs_uses_uploaded_sop_docx_as_formatted_export_base`.
- Verification run: `python -m pytest tests/test_sop_uplift_api.py tests/test_sop_uplift_outputs.py tests/test_sop_uplift_modules.py tests/test_sop_uplift_persistence_and_prompts.py tests/test_sop_uplift_pipeline.py -q`.

---

## 2026-05-03 Update - SOP Uplift Extraction Latency

- Root cause: full-document SOP Uplift LLM extraction bypassed `max_chunk_chars` by expanding the sanitizer cap to the full document length. Large workbook-derived markdown could be sent to the LLM nearly whole, leaving the UI modal stuck in "Analyzing full documents with AI" for minutes.
- Fix: `utils/sop_uplift/pipeline.py` now honors the configured prompt-size cap for document-level extraction.
- Follow-up speed fix: full-document LLM extraction now runs only for confirmed SOP/policy documents. RCMs, risk registers, evidence, audit reports, and other supporting files stay on the deterministic extraction path and are passed into `case_sop_uplift_suggestions` as compact context.
- Prompt-size controls: SOP/policy full-document prompts now budget anchors with `SOP_UPLIFT_MAX_ANCHORS_PER_PROMPT`, `SOP_UPLIFT_ANCHOR_EXCERPT_CHARS`, and `SOP_UPLIFT_ANCHOR_TEXT_BUDGET_CHARS`. Anchor summaries keep `anchor_id` and `section_path`, omit excerpts already present in the capped body, and cap additional excerpt text.
- Prompt telemetry: `run_json_prompt()` records `prompt_chars`, `raw_chars`, `duration_ms`, `attempts`, and `stage` on prompt run records.
- Regression coverage: `tests/test_sop_uplift_pipeline.py::test_full_pipeline_caps_full_document_prompt_to_max_chunk_chars`.
- Additional regression coverage: `test_full_pipeline_runs_deep_document_analysis_only_for_sop_and_policy_documents`, `test_full_pipeline_skips_deep_document_analysis_when_no_sop_or_policy_is_tagged`, `test_full_document_prompt_anchor_budget_omits_body_duplicates_and_respects_limits`, and prompt telemetry assertions in `tests/test_sop_uplift_persistence_and_prompts.py`.
- Verification run: `python -m pytest tests/test_sop_uplift_pipeline.py -v`, `python -m pytest tests/test_sop_uplift_api.py -v`, and `python -m pytest tests/test_sop_uplift_persistence_and_prompts.py -v`.

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

---

## 16. SOP / Document Uplift Plan Progress - 2026-05-06

Implemented Track A Items 1-6, 12, 14, and 15 from `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`.

Key changes:
- SOP Uplift output storage now fails loudly on GridFS write errors and stores generated output metadata without `content_b64`.
- SOP full-document prompt ceiling is 20,000 chars, and section routing excludes obvious boilerplate sections before LLM extraction.
- SOP pipeline runs have a per-case mutex, stale-running detection, and `TASK_BACKEND` dispatch abstraction with `asyncio` local mode and explicit Celery stub.
- DOCX table conversion now preserves embedded table position for both `utils/sop_uplift/markdown_ingestion.py` and the independent `utils/services/conversion.py` clone.
- SOP schema v2 split storage is in `utils/sop_uplift/case_store.py`: new cases keep markdown/anchors/chunks in `sop_markdown`, `sop_anchors`, and `sop_chunks`; `get_case_content()` hydrates schema v1 and v2 cases.
- Offline migration script added at `scripts/migrate_sop_schema_v2.py` with rollback-safe write ordering and validation/report support.

Current checkpoint:
- Item 17 is frontend-facing. Mockups were created at `docs/superpowers/mockups/2026-05-06-sop-uplift-item17-run-pipeline-mockups.md`.
- Do not edit `kpmg_ui/client/src/pages/sop-uplift.tsx` for Item 17 until the human reviews those mockups.

---

## 17. Document Uplift Item 28 Settings Controls - 2026-05-06

Implemented Item 28 from `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`.

Key changes:
- Added `GET /settings/document-uplift-config` and `POST /settings/document-uplift-config` in `api/routers/settings.py`.
- The endpoints use the existing MongoDB-backed `utils.llm_config_store` Document Uplift budget config helpers seeded by `MAX_LLM_CALLS_PER_PIPELINE`.
- Added the Settings page card "Document Uplift Pipeline Controls" below the existing LLM Provider card, without replacing LLM Provider, LLM Model, context upload, or Navigation Visibility.
- Added frontend source coverage in `kpmg_ui/client/src/pages/settings.document-uplift-config.test.ts`.

Verification:
- `python -m pytest tests\test_settings.py tests\test_document_uplift_api.py -v` passed.
- `node --import tsx .\client\src\pages\settings.document-uplift-config.test.ts` passed.
- `npm run check` and `npm run build` passed.

Current checkpoint:
- Item 29 mockups were approved and Item 29 was implemented; see section 18 below.

---

## 18. Document Uplift Item 29 Frontend Page - 2026-05-06

Implemented Item 29 from `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md` after human approval of the Item 29 mockups.

Key changes:
- Added `/document-uplift` route in `kpmg_ui/client/src/App.tsx`.
- Added a new Document Uplift sidebar entry with `NEW` badge in `kpmg_ui/client/src/components/AppLayout.tsx`.
- Kept SOP Uplift visible, with a tooltip noting it is superseded by Document Uplift.
- Added `kpmg_ui/client/src/pages/document-uplift.tsx` with case explorer/create, upload and tag workflow, pipeline run/generate controls, suggestion queue, document review/edit/reject/accept actions, source references, generated outputs, cost badge, reject-all confirmation, and auto-accepted warning display.
- Added source coverage in `kpmg_ui/client/src/document-uplift.item29.test.ts`.

Verification:
- `node --import tsx .\client\src\document-uplift.item29.test.ts` passed.
- `npm run check` passed.
- `npm run build` passed with existing PostCSS `from` and large chunk warnings.

Current checkpoint:
- Item 29 is complete.
- Next plan item is Item 30: add the Document Uplift SSE endpoint and wire `EventSource` in `document-uplift.tsx` for live progress updates.

---

## 19. Document Uplift Item 30 SSE Progress - 2026-05-06

Implemented Item 30 from `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`.

Key changes:
- Added `GET /document-uplift/cases/{case_id}/pipeline/stream` in `api/routers/document_uplift.py`.
- The stream uses `utils.sop_processing.sse_events.yield_sse_event()` and emits `stage`, `progress`, `complete`, and `error` events from persisted case state.
- Wired `EventSource` in `kpmg_ui/client/src/pages/document-uplift.tsx`.
- The UI maps SSE `step` values to readable labels and updates the pipeline progress bar; existing polling/refetch remains as fallback.
- Added backend and frontend coverage in `tests/test_document_uplift_api.py` and `kpmg_ui/client/src/document-uplift.item30.test.ts`.

Verification:
- `python -m pytest tests\test_document_uplift_api.py -v` passed.
- `node --import tsx .\client\src\document-uplift.item29.test.ts` passed.
- `node --import tsx .\client\src\document-uplift.item30.test.ts` passed.
- `npm run check` and `npm run build` passed.

Current checkpoint:
- Items 29 and 30 are complete.
- Next plan item is Item 31: cross-document data-flow integration test before Checkpoint C.

---

## 20. Document Uplift Item 31 Cross-Document Data Flow - 2026-05-06

Implemented Item 31 from `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`.

Key changes:
- Added `tests/test_document_uplift_pipeline.py::test_cross_document_corpus_map_flows_from_excel_to_analysis`.
- The test runs Stage 1 with a real in-memory Excel RCM through `utils.services.excel_pipeline` and real `utils.services.analysis` flow, with deterministic mocked LLM responses.
- `AnalysisResult` now carries optional `corpus_map`.
- `utils/services/analysis.py` derives `sop_to_control_map` from process steps that include `anchor_id` and control identifiers.
- `utils/sop_processing/pipeline.py` persists both Excel-derived risk/evidence mappings and analysis-derived SOP/control mappings into the case `corpus_map`.

Verification:
- `python -m pytest tests\test_document_uplift_pipeline.py -v` passed.
- `python -m pytest tests\services\test_analysis.py tests\services\test_excel_pipeline.py -v` passed.
- `python -m pytest tests\test_document_uplift_api.py -v` passed.

Current checkpoint:
- Item 31 is complete.
- Next plan step is CHECKPOINT C. This requires an end-to-end local run plus manual verification that Word track-changes opens in Word 365, diagrams render, cost badge is correct, Mongo case document stays under 500KB, and TC-05 cross-document suggestion is present.

---

## 21. Document Uplift Checkpoint C Automated Verification - 2026-05-07

Completed the automated/runtime portions of CHECKPOINT C from `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`.

Key changes verified:
- Rebuilt and recreated `fastapi_api` and `web_ui_agent` with `DOCUMENT_UPLIFT_ENABLED=true`.
- Reran Stage 1 and Stage 2 on live case `fa7cd113-19d0-4505-b565-cd88ea1835c2`.
- Stage 1 persisted `stage1_cost.call_count = 13`.
- Stage 2 persisted `final_cost.call_count = 19` for `gemini-3-flash-preview`.
- Live case has 6 suggestions, including 5 cross-document `mapping_gap` suggestions with both SOP and RCM source references.
- Generated outputs are stored in GridFS and downloadable through `GET /document-uplift/cases/{case_id}/outputs/{output_id}`.
- Direct Mongo BSON size check for the case document is 28,436 bytes, below the 500KB T3 target.

Verification:
- `python -m pytest tests\services\test_analysis.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\test_document_uplift_api.py tests\test_document_uplift_pipeline.py tests\test_settings.py -v` passed: 70 passed.
- `node --import tsx .\client\src\document-uplift.item29.test.ts` passed.
- `node --import tsx .\client\src\document-uplift.item30.test.ts` passed.
- `node --import tsx .\client\src\pages\settings.document-uplift-config.test.ts` passed.
- `npm run check` passed.
- `npm run build` passed with existing PostCSS `from` and large chunk warnings.
- Download endpoint returned HTTP 200 for all outputs: DOCX 18,977 bytes, PNG 507,291 bytes, PDF 32,249 bytes.
- GridFS inspection found valid PNG/PDF signatures and DOCX `word/document.xml`, `word/comments.xml`, `w:ins`, and rationale comments.

Remaining gates:
- Manual Word 365 review of the downloaded DOCX is still required. The live DOCX has insertions and rationale comments; it has no `w:del` because the live accepted suggestions are additive mapping-gap insertions. Replacement/deletion markup is covered by `tests/sop_processing/test_output_generator.py`.
- T8 human usefulness review is still required: randomly sample 3 suggestions and rate at least 2 as useful before permanently enabling the feature flag.
- After those gates, next implementation item is Item 32: Celery + Redis Docker Compose wiring.

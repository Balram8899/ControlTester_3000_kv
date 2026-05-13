# CT V2 Shared Build Log

This log is shared by all four CT V2 implementation plans:

- `2026-05-12-ct-v2-plan-1-foundation.md`
- `2026-05-12-ct-v2-plan-2-pipeline-stages-1-3.md`
- `2026-05-12-ct-v2-plan-3-pipeline-stages-4-5.md`
- `2026-05-12-ct-v2-plan-4-frontend.md`

## How To Use

Before each task, add:

- Date/time
- Plan and task
- Files expected to change
- Starting status

After each task or pause, add:

- What changed
- Verification run and result
- Blockers or risks
- Exact next step

Keep entries short. This is a resume trail, not a second implementation plan.

## Entries

### 2026-05-13 - Plan 4 Task 1 Started

Status: in progress.

Files expected to change: `kpmg_ui/client/src/hooks/useControlTesting.ts`, `kpmg_ui/client/src/pages/control-testing.tsx`, `kpmg_ui/client/src/pages/control-testing-new.tsx`, `kpmg_ui/client/src/pages/control-testing-detail.tsx`, `kpmg_ui/client/src/App.tsx`, frontend source guards, shared build log.

Planned work: add a CT V2 frontend source guard first, then implement the TanStack Query hook layer and canonical Trace-styled pages against the corrected `/api/ct/*` contract.

Next step: add the failing frontend source guard.

### 2026-05-13 - Plan 3 Backend Test Uplift and Completion

Status: complete.

Files changed: `utils/control_assurance/pipeline/stage4_testing.py`, `api/tests/test_ct_pipeline_stages1_3.py`, `api/tests/test_ct_pipeline_stages4_5.py`, `api/tests/test_ct_v2.py`, `api/tests/test_ct_worker_config.py`, `api/tests/test_ct_backend_validation.py`, shared build log.

Changed: added the requested focused backend validation test and adopted the agreed Claude-suggested backend/static tests: C&A gate edge cases, confirm-mapping 409 body shape, begin-analysis empty-state guard, override-log behavior, Stage 3/4 checkpointing, tickmark consistency, exact 20% OE boundary, Stage 5 dispatch, failure checkpointing, GridFS metadata, delete cascade, idempotent issue push, push-all skip behavior, workbook override-log tab, static `get_llm()` no-override scan, resilient Celery task decorator scan, and Redis AOF config check. Kept issue push idempotent instead of returning 409 on retry by design.

Verification: `python -m pytest api\tests -v` passed with 83 tests. `docker compose build fastapi_api ct_worker` passed. `docker compose up -d fastapi_api ct_worker` recreated both services. `docker compose ps fastapi_api ct_worker` showed FastAPI healthy and CT worker up. `docker compose logs ct_worker --tail=80` showed `ct.parse_template`, `ct.llm_review`, `ct.evidence_mapping`, `ct.run_testing`, and `ct.generate_workbooks` registered.

Next step: Plan 4 frontend implementation.

### 2026-05-13 - Plan 3 Task 4 Started

Status: complete.

Files changed: `api/routers/ct_v2.py`, `api/tests/test_ct_v2.py`, shared build log.

Changed: added control result read endpoints, CT issue list/detail/update/push/push-all endpoints, and session sign-off updates. CT issue pushes create normal `issues` collection documents with `source_module: control_testing` and mark the CT issue with `pushed_to_issues` plus `issues_module_id`.

Verification: red run failed with 405/404 for the missing API routes. After implementation, targeted endpoint tests passed, then `python -m pytest api\tests\test_ct_v2.py -v` passed with 22 tests.

Next step: add the focused backend validation test requested by the user, then run the backend verification suite.

### 2026-05-13 - Plan 3 Task 3 Started

Status: complete.

Files changed: `utils/control_assurance/workbook_builder.py`, `utils/control_assurance/pipeline/stage5_workbook.py`, `utils/control_assurance/celery_app.py`, `api/tests/test_ct_pipeline_stages4_5.py`, shared build log.

Changed: added tests for workbook assembly and Stage 5 GridFS output metadata, implemented the workbook builder using `SOX_ITGC_Testing_Workpaper_v2.xlsx` as the preferred base template, added Stage 5 narrative/workbook generation, and registered `ct.generate_workbooks` in the Celery include list. Stage 5 does workbook/narrative work only; CT issue drafting remains in Stage 4 per spec.

Verification: red run failed with missing `workbook_builder` and `stage5_workbook`. After implementation, one workbook placement assertion failed and was fixed by stabilizing the cover-sheet layout. `python -m pytest api\tests\test_ct_pipeline_stages4_5.py -v` passed with 7 tests.

Next step: Plan 3 Task 4, expose control results, CT issue CRUD/push, push-all, and sign-off endpoints.

### 2026-05-13 - Plan 3 Task 2 Started

Status: complete.

Files changed: `utils/control_assurance/pipeline/stage4_testing.py`, `api/tests/test_ct_pipeline_stages4_5.py`, shared build log.

Changed: added Stage 4 tests for canonical test result persistence, CT issue drafting, exception-to-issue linking, and the >20% exception-rate OE override. Replaced the Stage 4 stub with `_run_testing`, canonical response models, issue-drafting persistence to `ct_issues`, and the Celery `ct.run_testing` handoff to Stage 5.

Verification: red run failed with `ImportError` for missing `_run_testing`. After implementation, `python -m pytest api\tests\test_ct_pipeline_stages4_5.py -v` passed with 5 tests.

Next step: Plan 3 Task 3, add workbook builder and Stage 5 workbook generation with tests first.

### 2026-05-13 - Plan 3 Task 1 Started

Status: complete.

Files expected to change: `utils/control_assurance/prompts/control_testing.py`, `utils/control_assurance/prompts/workpaper_narrative.py`, `utils/control_assurance/prompts/issue_drafting.py`, `api/tests/test_ct_pipeline_stages4_5.py`, shared build log.

Changed: added canonical Stage 4-5 prompt contract tests, then implemented prompt builders for control testing, workpaper narrative, and issue drafting. The prompts require the spec fields `todi_results`, `sample_results[].sample_num`, `application`, `item_reference`, `exceptions[].ref`, and canonical issue fields.

Verification: red run failed with `ModuleNotFoundError` for the three missing prompt modules. After implementation, `python -m pytest api\tests\test_ct_pipeline_stages4_5.py -v` passed with 3 tests.

Next step: Plan 3 Task 2, implement Stage 4 testing execution and issue drafting with tests first.

### 2026-05-13 - Plan 2 Task 6 Completed

Status: complete.

Files changed: `docs/HANDOFF.md`, shared build log.

Changed: verified the `ct_worker` Docker service and recorded Plan 2 completion in the project handoff.

Verification: `docker compose up --build -d ct_worker` built and started the worker. `docker compose logs ct_worker --tail=120` showed the worker ready on `ct_pipeline` with `ct.parse_template`, `ct.llm_review`, `ct.evidence_mapping`, and `ct.run_testing` registered. `cd api && python -m pytest tests/ -v` passed with 48 tests.

Next step: Plan 3 Task 1, implement Stage 4 design/operating effectiveness testing contracts.

### 2026-05-13 - Plan 2 Task 5 Started

Status: complete.

Files expected to change: `utils/control_assurance/evidence_extractor.py`, `utils/control_assurance/pipeline/stage3_evidence.py`, `api/routers/ct_v2.py`, `api/tests/test_ct_pipeline_stages1_3.py`, shared build log.

Changed: added evidence extraction helpers, implemented evidence C&A, population C&A, evidence mapping, sampling recommendation/selection, override endpoints, sampling update endpoint, and strict confirm-mapping gate. Added a minimal Stage 4 task stub so `confirm-mapping` can queue the next phase until Plan 3 fills it in.

Verification: red run failed because `_verify_evidence_ca` was missing; after implementation one test exposed a nested evidence update issue, fixed by rewriting the evidence array entry explicitly. `python -m pytest api/tests/test_ct_pipeline_stages1_3.py api/tests/test_ct_prompts.py -v` passed with 21 tests.

Next step: Plan 2 Task 6, build/start `ct_worker`, run API tests, and update handoff.

### 2026-05-13 - Plan 2 Task 4 Started

Status: complete.

Files expected to change: `utils/control_assurance/pipeline/stage2_review.py`, `utils/control_assurance/pipeline/llm_json.py`, `utils/control_assurance/pipeline/stage3_evidence.py`, `api/routers/ct_v2.py`, `api/tests/test_ct_pipeline_stages1_3.py`, shared build log.

Changed: implemented Stage 2 LLM case review, shared JSON invoke/parse/retry helper with `ct_sessions.parse_errors[]` logging, review suggestion/question endpoints, review confirmation gate, and a minimal Stage 3 task stub for queue handoff.

Verification: red run failed because `_run_llm_review` was missing; after implementation, `python -m pytest api/tests/test_ct_pipeline_stages1_3.py -v` passed with 11 tests.

Next step: Plan 2 Task 5, implement Stage 3 evidence C&A, population C&A, sampling, and evidence mapping.

### 2026-05-13 - Plan 2 Task 3 Started

Status: complete.

Files expected to change: `utils/control_assurance/pipeline/`, `api/routers/ct_v2.py`, `api/tests/test_ct_pipeline_stages1_3.py`, shared build log.

Changed: added Stage 1 parser tests, implemented workbook parsing into `ct_controls`, added `POST /ct/sessions/{id}/upload-template`, added `POST /ct/sessions/{id}/begin-analysis`, and added a minimal Stage 2 task stub for queue handoff. `celery_app.py` now has a host-test fallback when Celery is absent locally; Docker still uses real Celery.

Verification: red run failed with missing pipeline package; after implementation, `python -m pytest api/tests/test_ct_pipeline_stages1_3.py -v` passed with 4 tests.

Next step: Plan 2 Task 4, implement Stage 2 LLM case analysis and review confirmation endpoints.

### 2026-05-13 - Plan 2 Task 2 Started

Status: complete.

Files expected to change: `utils/control_assurance/prompts/`, `api/tests/test_ct_prompts.py`, shared build log.

Changed: added prompt contract tests and pure prompt-builder modules for case analysis, population/evidence C&A verification, sampling, and evidence mapping.

Verification: red run failed with `ModuleNotFoundError` for the prompt package; after implementation, `python -m pytest api/tests/test_ct_prompts.py -v` passed with 5 tests.

Next step: Plan 2 Task 3, add Stage 1 workbook parsing and upload-template dispatch.

### 2026-05-13 - Plan 2 Task 1 Started

Status: complete.

Files expected to change: `utils/control_assurance/celery_app.py`, `docker-compose.yml`, `api/tests/test_ct_worker_config.py`, shared build log.

Changed: added a CT Celery app configured for the `ct_pipeline` queue, added a dedicated `ct_worker` Docker Compose service, and added static config tests that do not require host-side Celery installation.

Verification: red test failed because `celery_app.py` and `ct_worker` were missing; after implementation, `python -m pytest api/tests/test_ct_worker_config.py -v` passed with 2 tests and `docker compose config --quiet` passed with no output.

Next step: Plan 2 Task 2, add prompt modules and prompt contract tests.

### 2026-05-13 - Plan 1 Task 9 Completed

Status: complete.

Files changed: `api/tests/conftest.py`, `docs/HANDOFF.md`, shared build log.

Changed: confirmed Express BFF catch-all already proxies `/api/ct/*`, added test import path support for the planned `cd api && pytest tests/` command, and updated `docs/HANDOFF.md` with the CT V2 foundation summary.

Verification: `docker compose up --build -d fastapi_api web_ui_agent` rebuilt and restarted healthy API/UI containers; `http://localhost:8000/ct/sessions` and `http://localhost:5000/api/ct/sessions` both returned `[]`; BFF smoke created a session, added a control, read status `input`, and deleted with 204; `cd api && python -m pytest tests/ -v` passed with 25 tests; `cd kpmg_ui && npm run check` passed.

Next step: Plan 2 Task 1, add CT worker/Celery service wiring and task package skeleton.

### 2026-05-13 - Plan 1 Task 8 Started

Status: complete.

Files expected to change: `api/routers/ct_v2.py`, `api/tests/test_ct_v2.py`, `api/templates/CT_Input_Template.xlsx`, shared build log.

Changed: created the blank CT input template workbook, added tests for evidence delete, workbook not-yet-generated, template download, and missing template handling, then implemented evidence delete, workbook streaming, and template download endpoints.

Verification: `api/templates/CT_Input_Template.xlsx` opens with `Control Data` and `Instructions` sheets. Red delete-evidence run failed with 404 for the missing route; after implementation, `python -m pytest api/tests/test_ct_v2.py -v` passed with 19 tests.

Next step: Plan 1 Task 9, verify Express BFF routing, API tests, TypeScript check, and handoff updates.

### 2026-05-13 - Plan 1 Task 7 Started

Status: complete.

Files expected to change: `api/routers/ct_v2.py`, `api/tests/test_ct_v2.py`, shared build log.

Changed: added upload tests plus file type classification, then implemented population upload and multi-file evidence upload endpoints backed by the CT GridFS helper.

Verification: first test harness run failed before routing because the future mock target did not exist; after making the mock target forward-compatible, the red check failed with 404 for the missing route. After implementation, `python -m pytest api/tests/test_ct_v2.py -v` passed with 15 tests.

Next step: Plan 1 Task 8, add evidence delete, workbook streaming, and CT input template download.

### 2026-05-13 - Plan 1 Task 6 Started

Status: complete.

Files expected to change: `api/routers/ct_v2.py`, `api/tests/test_ct_v2.py`, shared build log.

Changed: added manual control input tests and implemented `POST /ct/sessions/{session_id}/controls` to create draft controls with sampling defaults, test steps, evidence placeholders, conclusions, testing methods, and pending status.

Verification: red run failed with 404 for the missing endpoint; after implementation, `python -m pytest api/tests/test_ct_v2.py -v` passed with 11 tests.

Next step: Plan 1 Task 7, add population and evidence upload tests and endpoints.

### 2026-05-13 - Plan 1 Task 5 Completed

Status: complete.

Files changed: `api/routers/ct_v2.py`, `api/tests/test_ct_v2.py`, `api/main.py`, `api/requirements.txt`, shared build log.

Changed: added the `/ct/sessions` create/list/detail/delete/status router, registered it in FastAPI startup, added CT index startup, and added `mongomock` to API requirements for isolated router tests.

Verification: first red run failed with 404 for the missing route. After implementation the first full run exposed FastAPI's 204 response-body assertion on delete; after tightening the delete response contract, `python -m pytest api/tests/test_ct_v2.py -v` passed with 8 tests.

Next step: Plan 1 Task 6, add manual control input tests and endpoint.

### 2026-05-13 — Plan 1 Task 5 Started

Status: in progress.

Files expected to change: `api/routers/ct_v2.py`, `api/tests/test_ct_v2.py`, `api/main.py`, `api/requirements.txt`, shared build log.

Planned work: add session CRUD tests first, verify `/ct` routes are missing, then implement and register the router plus index startup.

Next step: add router tests and run the red session test.

### 2026-05-13 — Plan 1 Task 4 Started

Status: complete.

Files expected to change: `utils/control_assurance/ct_gridfs.py`, `api/tests/test_ct_gridfs.py`, shared build log.

Changed: added CT GridFS helper for `ct_files` plus upload/delete/stream tests.

Verification: first run failed because `utils.control_assurance.ct_gridfs` was missing; after implementation, `python -m pytest api/tests/test_ct_gridfs.py -v` passed with 3 tests.

Next step: Plan 1 Task 5, implement session CRUD router and tests.

### 2026-05-13 — Plan 1 Task 3 Started

Status: complete.

Files expected to change: `utils/control_assurance/ct_db.py`, shared build log.

Changed: added MongoDB client helper and CT collection index creation.

Verification: `python -c "from utils.control_assurance.ct_db import ensure_indexes, _get_db; print(callable(ensure_indexes), _get_db.__name__)"` passed.

Next step: Plan 1 Task 4, add GridFS helper with tests.

### 2026-05-13 — Plan 1 Task 2 Started

Status: complete.

Files expected to change: `utils/control_assurance/__init__.py`, `utils/control_assurance/ct_models.py`, `api/tests/__init__.py`, `api/tests/test_ct_models.py`, shared build log.

Changed: created the `utils.control_assurance` package, CT Pydantic request models, and focused model tests.

Verification: first run failed with `ModuleNotFoundError: No module named 'utils.control_assurance.ct_models'`; after implementation, `python -m pytest api/tests/test_ct_models.py -v` passed with 3 tests and no warnings.

Next step: Plan 1 Task 3, add MongoDB CT client/index helper.

### 2026-05-13 — Plan 1 Task 1 Started

Status: complete.

Files expected to change: `docker-compose.yml`, shared build log.

Changed: enabled Redis AOF persistence with `redis-server --appendonly yes --appendfsync everysec`.

Verification: `docker compose config --quiet` passed with no output.

Next step: Plan 1 Task 2, create CT model tests and package files.

### 2026-05-13 — Plan Uplift Completed

Status: complete.

Updated all four plans to align with the approved CT V2 spec before implementation. Key corrections: CT input template separated from SOX workpaper template, Stage 1/2 orchestration clarified, C&A gate tightened, canonical Stage 4/5 data contracts documented, workbook GridFS metadata corrected, frontend API shapes and Trace page-style requirements clarified.

Verification: documentation review only; no application tests run.

Next step: start Plan 1 implementation from Task 1, then update this log after each task.

### 2026-05-13 - Plan 4 Controls Assurance Build

Status: built and running.

Files changed: `kpmg_ui/client/src/hooks/useControlTesting.ts`, `kpmg_ui/client/src/pages/controls-assurance.tsx`, `kpmg_ui/client/src/pages/controls-assurance-new.tsx`, `kpmg_ui/client/src/pages/controls-assurance-detail.tsx`, `kpmg_ui/client/src/App.tsx`, `kpmg_ui/client/src/components/AppLayout.tsx`, `kpmg_ui/client/src/controls-assurance.test.ts`, `docs/superpowers/mockups/controls-assurance/controls-assurance-imagegen-board.png`.

Changed: split the CT V2 frontend into a separate new feature named Controls Assurance at `/controls-assurance`, `/controls-assurance/new`, and `/controls-assurance/:id`. Restored the legacy `/control-testing` frontend so the old `/audit/*` wizard remains untouched. Added a sidebar item for Controls Assurance, kept all CT V2 server state behind TanStack Query hooks, and added the approved `$imagegen` mockup board.

Backend impact: legacy `api/routers/control_testing.py` was not modified. `api/main.py` only registers the new `/ct/*` router for Controls Assurance while the old `/audit/*` endpoints remain in place.

Verification: `node --import tsx .\client\src\controls-assurance.test.ts` passed; `npm run check` passed; `node --import tsx .\client\src\control-testing.scroll-shell.test.ts` passed; `npm run build` passed with existing PostCSS `from` and large chunk warnings; `docker compose build web_ui_agent` passed; `docker compose up -d web_ui_agent` passed; `docker compose ps web_ui_agent fastapi_api ct_worker` showed web/API healthy and worker up; HTTP smoke returned 200 for `/control-testing`, `/controls-assurance`, and `/api/ct/sessions`.

Next step: continue functional QA through the live Controls Assurance journey and adjust UX as real data surfaces.

### 2026-05-13 - C&A Source Support Expansion

Status: built and running.

Files changed: `api/routers/ct_v2.py`, `utils/control_assurance/pipeline/stage3_evidence.py`, `utils/control_assurance/prompts/ca_verification.py`, `api/tests/test_ct_v2.py`, `api/tests/test_ct_pipeline_stages1_3.py`, `kpmg_ui/client/src/hooks/useControlTesting.ts`, `kpmg_ui/client/src/pages/controls-assurance-detail.tsx`, `kpmg_ui/client/src/controls-assurance.test.ts`.

Changed: population uploads now store filename and file type, so C&A can process Excel, CSV, PDF, screenshots/images, DOCX, TXT/CONF, and ZIP instead of forcing every population through Excel parsing. Added population and evidence source-support upload endpoints for SQL/SUIM/query screenshots, source report PDFs, timestamps, row-count evidence, reviewer comments, unique-key columns, and expected counts. Stage 3 now includes primary tabular row/unique-count metadata plus support-file OCR/text in the population/evidence C&A prompts.

Frontend: added Source / Query Support upload panels in Population and Evidence, with Unique Key Columns, Expected Count, and Reviewer Comments fields.

Verification: red tests first failed on missing population metadata, missing support routes, Excel-only population extraction, and ignored evidence support files. After implementation: `python -m pytest api/tests -q` passed with 88 tests; `node --import tsx .\client\src\controls-assurance.test.ts` passed; `npm run check` passed; `node --import tsx .\client\src\control-testing.scroll-shell.test.ts` passed; `npm run build` passed with existing PostCSS `from` and large chunk warnings; `docker compose build fastapi_api ct_worker web_ui_agent` passed; `docker compose up -d fastapi_api ct_worker web_ui_agent` passed; `docker compose ps fastapi_api ct_worker web_ui_agent` showed API/web healthy and worker up; HTTP smoke returned 200 for `/controls-assurance`, `/api/ct/sessions`, and `/ct/sessions`.

Next step: run a synthetic case with a SQL/SUIM export plus source screenshot and confirm the LLM C&A rationale correctly references count/unique-count reconciliation.

### 2026-05-13 - Workbook Binary Evidence Fix

Status: fixed and tested.

Files changed: `utils/control_assurance/workbook_builder.py`, `api/tests/test_ct_pipeline_stages4_5.py`.

Changed: workbook generation now treats non-text evidence files such as Excel workbooks, PDFs, screenshots, DOCX files, and ZIPs as binary attachments when writing the Evidence sheet. Instead of decoding raw file bytes into a worksheet cell, the generated workbook writes a safe attachment summary. Text-like files still get a sanitized preview.

Reason: synthetic scenario `10_workbook_ready` failed in Stage 5 because an uploaded `.xlsx` evidence file was decoded as text, producing illegal Excel control characters (`PK...`) that openpyxl refused to write into the output workbook.

Verification: red regression test first reproduced the `IllegalCharacterError`; after the fix, `python -m pytest api/tests/test_ct_pipeline_stages4_5.py::test_build_control_workbook_summarises_binary_excel_evidence_without_crashing -q`, `python -m pytest api/tests/test_ct_pipeline_stages4_5.py -q`, and `python -m pytest api/tests -q` passed. `docker compose build fastapi_api ct_worker` and `docker compose up -d fastapi_api ct_worker` passed; `docker compose ps fastapi_api ct_worker` showed the API healthy and CT worker running.

Next step: rerun workbook-ready synthetic scenario from the UI.

### 2026-05-13 - Workbook Template Switched to Testing Sheet

Status: fixed, tested, and running.

Files changed: `utils/control_assurance/workbook_builder.py`, `api/tests/test_ct_pipeline_stages4_5.py`, shared build log, `docs/HANDOFF.md`.

Changed: Stage 5 workbook generation now loads `utils/Testing sheet.xlsx` and produces the two-tab workbook expected by the new template: `Test of controls` and `Auditor override`. The builder fills the visible auditor form cells for workpaper name, period, preparer, entity, control information, testing methods, sampling methodology, test procedures, sample testing grid, conclusions, deficiency description, and override log.

Data build difference: the old output created separate generated sheets (`Cover`, `Test Steps`, `Sample Results`, `Exceptions`, `Conclusions`, `Evidence`, `Override Log`). The new output writes the same Controls Assurance backend data into the single form-style `Test of controls` sheet and writes overrides into `Auditor override`.

Verification: red tests first failed because the builder still emitted the old generated sheet set. After implementation, `python -m pytest api/tests/test_ct_pipeline_stages4_5.py::test_build_control_workbook_uses_testing_sheet_template_and_visible_cells api/tests/test_ct_pipeline_stages4_5.py::test_build_control_workbook_summarises_binary_excel_evidence_without_crashing api/tests/test_ct_pipeline_stages4_5.py::test_workbook_contains_override_log_tab_when_overrides_exist -q`, `python -m pytest api/tests/test_ct_pipeline_stages4_5.py -q`, and `python -m pytest api/tests -q` passed. `docker compose build fastapi_api ct_worker`, `docker compose up -d fastapi_api ct_worker`, `docker compose ps fastapi_api ct_worker`, and HTTP smoke checks for `/health` and `/ct/sessions` passed.

Next step: rerun the workbook-ready synthetic scenario from the Controls Assurance UI and download the generated workbook to visually inspect the filled `Test of controls` sheet.

### 2026-05-13 - Sample Evidence Tabs and Red Evidence Highlights

Status: fixed, tested, and running.

Files changed: `utils/control_assurance/workbook_builder.py`, `utils/control_assurance/pipeline/stage5_workbook.py`, `api/tests/test_ct_pipeline_stages4_5.py`, shared build log, `docs/HANDOFF.md`.

Changed: generated Controls Assurance workbooks now add one `Sample N` sheet per tested sample. Each sample sheet lists the sample application, item reference, tested step labels, mapped evidence filename/type, and reviewed value. Image evidence is embedded into the sample sheet; when saved `annotation_regions` include a bbox, the embedded image is drawn with a red rectangle around the exact reviewed area. Non-image evidence uses a red-bordered reviewed-value block and a decoded preview where available. Stage 5 now fetches evidence support-file blobs too, so uploaded SQL/SUIM/query screenshots attached to evidence can be included in sample tabs.

Reason: the auditor workpaper needs the main `Test of controls` sheet for summary/results and separate sample tabs for the actual screenshots/evidence behind each sample. Reviewers need a red visual cue showing what the system relied on.

Verification: red test first failed because `Sample 1` was missing. After implementation, `python -m pytest api/tests/test_ct_pipeline_stages4_5.py::test_build_control_workbook_adds_sample_evidence_tab_with_red_boxed_image -q`, `python -m pytest api/tests/test_ct_pipeline_stages4_5.py -q`, and `python -m pytest api/tests -q` passed. `docker compose build fastapi_api ct_worker`, `docker compose up -d fastapi_api ct_worker`, `docker compose ps fastapi_api ct_worker`, and HTTP smoke checks for `/health` and `/ct/sessions` passed.

Next step: rerun the workbook-ready synthetic scenario and visually inspect the generated `Sample 1` sheet against the supplied example screenshot.

### 2026-05-13 - Removed Framework From Create Case Flow

Status: fixed, tested, and running.

Files changed: `kpmg_ui/client/src/pages/controls-assurance-new.tsx`, `kpmg_ui/client/src/hooks/useControlTesting.ts`, `utils/control_assurance/ct_models.py`, `api/routers/ct_v2.py`, `api/tests/test_ct_models.py`, `kpmg_ui/client/src/controls-assurance.test.ts`, shared build log, `docs/HANDOFF.md`.

Changed: removed the `Framework` field from the Controls Assurance new-assessment screen. The frontend no longer stores, validates, or submits a user-entered case framework. The backend now defaults omitted framework metadata to `Controls Assurance`, preserving existing response shape without asking the user for a low-value field.

Verification: red tests first failed because the field was still visible and the backend required `framework`. After implementation, `node --import tsx .\client\src\controls-assurance.test.ts`, `python -m pytest api/tests/test_ct_models.py::test_create_session_request_defaults_framework_when_omitted -q`, `python -m pytest api/tests -q`, `npm run check`, and `npm run build` passed. `docker compose build fastapi_api web_ui_agent`, `docker compose up -d fastapi_api web_ui_agent`, and `docker compose ps fastapi_api web_ui_agent` passed with both containers healthy. HTTP smoke returned 200 for `/controls-assurance/new` and `/health`; a frameworkless session create returned default framework `Controls Assurance` and the smoke session was deleted.

Next step: continue reviewing the create-case flow for other low-value fields that should be inferred or moved later in the workflow.

# Document Uplift Architecture

**Date:** 2026-05-11  
**Status:** Implemented and validated through Checkpoint C, T4, T8, and T9  
**Feature route:** `/document-uplift`  
**Primary plan:** `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`

---

## Purpose

Document Uplift is the TRACE workflow for improving a primary SOP, procedure, policy, or process document by comparing it with uploaded supporting material such as RCMs, risk registers, issue logs, deviation logs, event logs, and other evidence.

The feature is separate from legacy SOP Uplift. It has its own router, services, storage collections, pipeline orchestration, review UI, output generator, and reliability model.

The output set is:

- a Word `.docx` with tracked changes and reviewer comments
- a swimlane `.png`
- a swimlane `.pdf`

---

## High-Level Flow

```text
React Document Uplift page
  -> Express BFF
  -> FastAPI document_uplift router
  -> pipeline dispatch layer
      -> asyncio queue in local/dev mode
      -> Celery + Redis in production mode
  -> stateless service layer
  -> MongoDB + GridFS
  -> reviewed suggestions
  -> Stage 2 DOCX + diagram outputs
```

The frontend never drives document processing loops. It creates cases, uploads files, triggers the backend pipeline, watches status through polling/SSE, lets the user review suggestions, and triggers output generation.

---

## Runtime Modes

| Mode | `TASK_BACKEND` | Execution model | Intended use |
|---|---|---|---|
| Local/dev | `asyncio` | FastAPI starts an in-process bounded async worker queue. Blocking pipeline work runs through `run_in_executor`. | Docker Compose local development and validation |
| Production | `celery` | FastAPI enqueues Celery tasks. `celery_worker` consumes tasks through Redis. | GCP/single-VM production target |

Both modes call the same `run_pipeline(case_id, stage)` logic. The dispatch layer changes where the work runs; the pipeline behavior does not fork by domain or document type.

---

## Core Components

### Frontend

| Component | Role |
|---|---|
| `kpmg_ui/client/src/pages/document-uplift.tsx` | Case explorer, upload/tag flow, pipeline controls, suggestion review, generated output download, cost display |
| `kpmg_ui/client/src/components/AppLayout.tsx` | Adds the Document Uplift navigation entry |
| Settings page Pipeline Controls card | Lets users configure the max LLM calls per Document Uplift pipeline |

The UI supports suggestion review states: `pending`, `accepted`, `rejected`, and `edited`. Structural suggestions that require explicit review are not silently bulk-accepted.

### API Layer

| File | Role |
|---|---|
| `api/routers/document_uplift.py` | Case CRUD, upload, run-pipeline, SSE stream, suggestion review, generate-outputs, output download |
| `api/main.py` | Registers the router and starts/stops the async pipeline queue when `TASK_BACKEND=asyncio` |
| `api/routers/settings.py` | Exposes Document Uplift pipeline budget settings |

Key endpoints:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/document-uplift/cases` | Create a case |
| `POST` | `/document-uplift/cases/{case_id}/upload` | Upload and tag a document |
| `POST` | `/document-uplift/cases/{case_id}/run-pipeline` | Trigger Stage 1 |
| `GET` | `/document-uplift/cases/{case_id}/pipeline/stream` | SSE progress stream |
| `PATCH` | `/document-uplift/cases/{case_id}/suggestions/{suggestion_id}` | Review one suggestion |
| `POST` | `/document-uplift/cases/{case_id}/bulk-review` | Bulk accept/reject eligible suggestions |
| `POST` | `/document-uplift/cases/{case_id}/generate-outputs` | Trigger Stage 2 |
| `GET` | `/document-uplift/cases/{case_id}/outputs/{output_id}` | Download an output |

### Storage Layer

| Collection / bucket | Purpose |
|---|---|
| `document_uplift_cases` | Primary case metadata, status, suggestions, summary, output metadata |
| `document_uplift_inputs` GridFS | Uploaded source files |
| `document_uplift_outputs` GridFS | Generated DOCX/PNG/PDF outputs |
| `document_uplift_markdown` | Converted markdown documents, outside the case doc |
| `document_uplift_anchors` | Extracted anchors, outside the case doc |
| `document_uplift_chunks` | Chunk metadata/content, outside the case doc |
| `document_uplift_facts` | Normalized facts from structured/supporting documents |

The primary case document is kept small. Raw files, outputs, markdown, anchors, chunks, and large normalized fact sets live outside `document_uplift_cases`.

### Pipeline Layer

| File | Role |
|---|---|
| `utils/sop_processing/pipeline.py` | Stage orchestration, async queue, dispatch abstraction, status updates |
| `utils/sop_processing/case_store.py` | MongoDB/GridFS persistence and stale-running recovery |
| `utils/sop_processing/celery_app.py` | Celery app, task routes, Redis broker/result backend |

The authoritative dispatch signature is:

```python
dispatch_pipeline(case_id: str, stage: int = 1) -> dict
```

`stage=1` runs conversion, chunking, Excel processing, and analysis.  
`stage=2` generates the reviewed DOCX and swimlane outputs.

### Service Layer

| File | Role |
|---|---|
| `utils/services/conversion.py` | Converts DOCX/PDF/XLSX/text and extracts style profile hints |
| `utils/services/excel_pipeline.py` | Structured Excel processing, schema detection, row completeness, corpus map contributions, normalized facts |
| `utils/services/analysis.py` | Stage 1 analysis, section classification, terminology, process extraction, cross-document synthesis, deterministic fallbacks |
| `utils/services/generic_findings.py` | Domain-neutral facts and issue signals from non-RCM structured documents |
| `utils/services/semantic_roles.py` | Maps raw fields to semantic roles such as owner, date, status, evidence, and action |
| `utils/services/severity.py` | Deterministic confidence and severity helpers |
| `utils/services/role_assignment_guard.py` | Prevents senior oversight roles from being assigned direct operational work in generated text |
| `utils/services/structural_completeness.py` | Domain-neutral checks for missing escalation, evidence, oversight, playbook, and coverage structures |
| `utils/services/llm_orchestrator.py` | LLM budget, retry, JSON parsing, cost records |
| `utils/sop_processing/prompts.py` | Prompt templates |
| `utils/sop_processing/content_sanitizer.py` | Prompt safety and delimiter handling |
| `utils/sop_processing/output_generator.py` | Stage 2 Word tracked changes and output assembly |
| `utils/sop_processing/diagram_renderer.py` | Deterministic swimlane PNG/PDF rendering |
| `utils/services/schemas.py` | Shared Pydantic contracts |

Services are stateless where possible. Persistence is owned by the case store and pipeline orchestration layer.

---

## Stage 1 Process

1. User creates a case.
2. User uploads one primary procedure/SOP/policy/process document and optional supporting files.
3. Uploads are stored immediately in GridFS.
4. `POST /run-pipeline` dispatches Stage 1.
5. The pipeline converts each file:
   - prose files become markdown, anchors, and chunks
   - Excel files go through the structured record pipeline
6. Excel processing classifies schema, preserves raw attributes, emits normalized facts, and contributes to `corpus_map`.
7. Analysis classifies prose sections and extracts process steps only from relevant procedural content.
8. Cross-document synthesis and deterministic fallbacks produce suggestions.
9. Domain-neutral quality guards run:
   - scope relevance gate for mapping gaps
   - structural completeness checks
   - role/RACI assignment guard
   - reviewer-gating for structural/open-issue findings
10. Case reaches `review_ready`, `partial`, or `failed`.

---

## Suggestion Quality Model

Suggestions are not generated by asking only "is this control missing from the SOP?" The current model asks whether the source fact is within the responsibility of the primary document.

Important controls:

- Purpose/scope anchors are used as the primary scope signal.
- Generic terms are excluded from relevance scoring.
- Fail-soft behavior applies when scope cannot be assessed; ambiguous items are reviewer-gated instead of silently dropped.
- Cross-document LLM prompts include the SOP purpose/scope text.
- Mapping-gap output is normalized into active SOP prose instead of raw RCM cell text.
- Additive Stage 2 insertions compact embedded numbered or unnumbered mini-procedures into one SOP-appropriate sentence.
- Open issues and structural findings can be marked `requires_explicit_review` so they are not auto-applied.

This design is domain-agnostic. It does not use Cyber, ESG, finance, HR, vendor, or other domain blacklists to decide what belongs.

---

## Review Process

After Stage 1:

1. Suggestions start as `pending`.
2. Reviewer can accept, reject, or edit each suggestion.
3. Bulk accept skips suggestions that require explicit review.
4. Stage 2 uses accepted and edited suggestions.
5. Rejected and still-pending reviewer-gated suggestions are not inferred into the final SOP or diagram.

T8 and T9 are human gates:

- T8 checks a sample of suggestions for auditor usefulness.
- T9 checks usefulness across multiple document roles/domains.

Both gates were confirmed complete on 2026-05-11.

---

## Stage 2 Process

1. User triggers `POST /generate-outputs`.
2. Eligible pending suggestions may be auto-accepted with warning metadata.
3. Stage 2 loads the original primary DOCX from GridFS when available.
4. Accepted suggestions are normalized into document-aware edit intents.
5. Output placement chooses section, paragraph, table, role/responsibility, evidence, monitoring, approval, escalation, or reference targets by structure rather than domain-specific wording.
6. The generator writes Word revision XML for tracked insertions/deletions and comments.
7. The swimlane prompt and renderer build diagrams from the current reviewed SOP state.
8. Outputs are stored in GridFS and linked from the case.

Stage 2 protects against known bad shapes:

- raw "performs..." RCM prose
- placeholder evidence text
- acronym damage
- contact-list responsibility contamination
- heading-adjacent insertions when section body text exists
- embedded standalone sub-procedures
- senior oversight roles receiving operational responsibilities directly

---

## Redis and Celery

Redis is used as the Celery broker and result backend in production mode.

| Service | Role |
|---|---|
| `redis` | Broker/result backend at `redis://redis:6379/0` |
| `celery_worker` | Runs `celery -A utils.sop_processing.celery_app worker` |
| `fastapi_api` | Enqueues work when `TASK_BACKEND=celery` |

Queues:

- `document_uplift`
- `conversion`
- `chunking`
- `excel`
- `llm`
- `analysis`
- `outputs`

Redis payload rule:

- pass small identifiers and status metadata only
- do not pass markdown strings, chunk arrays, full analysis payloads, or generated binary outputs through Redis
- source files, markdown, chunks, facts, and outputs belong in MongoDB/GridFS

Current closeout state:

- Redis container is healthy.
- `redis-cli ping` returns `PONG`.
- Celery inspect returns one worker online with `pong`.
- Worker logs show all expected queues and tasks registered.
- No functional Redis/Celery closeout item remains.

Non-blocking hardening note: Celery logs warn that the worker runs as root. This is not a readiness blocker, but production hardening can add a non-root user to the API image/worker service.

---

## Reliability Model

| Risk | Control |
|---|---|
| Duplicate pipeline starts | Async queue tracks active case IDs and rejects duplicates |
| Queue overload | Async queue enforces max queue size and returns back-pressure errors |
| Blocking I/O in async mode | Worker calls `run_pipeline` through `run_in_executor` |
| FastAPI restart mid-pipeline | Case store marks stale running cases as `failed` on next fetch after timeout |
| Large case documents | Heavy content is stored outside the primary case document |
| Redis carrying large payloads | Celery tasks pass IDs and small result metadata only |
| Ambiguous structural suggestions | Reviewer-gated instead of silently auto-applied |

T4 was verified on 2026-05-11:

- a case was seeded as stale `analyzing` / `pipeline_status="running"`
- FastAPI was recreated
- the next case fetch returned `status.stage="failed"` with stale-pipeline error text
- the case was re-triggered and reached `review_ready`

---

## Configuration

| Setting | Meaning |
|---|---|
| `DOCUMENT_UPLIFT_ENABLED` | Enables/disables the feature routes and navigation |
| `TASK_BACKEND` | `asyncio` for local/dev, `celery` for production |
| `MONGO_URI` | MongoDB connection string |
| `DOCUMENT_UPLIFT_MONGO_DB` | Optional DB override; defaults to `trace_db` |
| `CELERY_BROKER_URL` | Redis broker URL |
| `CELERY_RESULT_BACKEND` | Redis result backend URL |
| `DOCUMENT_UPLIFT_ASYNC_WORKERS` | Local async worker count |
| `DOCUMENT_UPLIFT_QUEUE_MAXSIZE` | Local async queue limit |
| `DOCUMENT_UPLIFT_PIPELINE_TIMEOUT_SECONDS` | Stale-running timeout |
| `DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT` | Stage 2 LLM rewrite cap |

LLM provider and model selection use the shared TRACE LLM abstraction and Mongo-backed active config. New code must not instantiate Gemini, OpenAI, Anthropic, Ollama, or other providers directly.

---

## Severity and Confidence

Document Uplift separates confidence from severity.

Confidence bands:

| Band | Range | Meaning |
|---|---:|---|
| High | `>= 0.80` | Direct field, row, section, date, or cited cross-document evidence |
| Medium | `>= 0.50 and < 0.80` | Plausible and source-referenced, but depends on interpretation or mapping |
| Low | `< 0.50` | Weak or ambiguous; route to follow-up unless confirmed |

Severity levels:

| Severity | Meaning |
|---|---|
| `critical` | Could materially break the process, regulatory obligation, customer outcome, recovery, financial integrity, or executive sign-off |
| `high` | Important process/control gap, overdue item, contradiction, or missing accountability |
| `medium` | Meaningful clarity, evidence, ownership, timing, or consistency issue |
| `low` | Minor completeness or wording issue |
| `informational` | Context or follow-up; not applied to Word output by default |

Detailed severity logic lives in `docs/document-uplift-severity-calculation.md`.

---

## Domain-Agnostic Principles

1. Document role is not domain. A risk log, event log, issue tracker, or RCM can belong to any business area.
2. Domain context is metadata, not control flow.
3. Scope relevance is derived from the primary document's own scope and purpose.
4. Semantic roles are inferred from structure, labels, values, and context, not fixed column names only.
5. Unknown domains still process.
6. Unsupported or low-confidence items become follow-up questions or reviewer-gated suggestions.
7. Stage 2 placement is structural and document-aware, not Cyber/ESG/KYC-specific.

---



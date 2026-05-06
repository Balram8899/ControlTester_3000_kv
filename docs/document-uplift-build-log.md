# Document Uplift — Build Log

**Feature:** Document Uplift (`/document-uplift`)  
**Plan reference:** `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md`  
**Total plan items:** 35 (Section 6 — Implementation Sequence: items 1–33 numbered + 23b + 26a)

---

## How to use this file

Read this file **before reading any code** at the start of a new agent session.

1. Find the last entry — it tells you what was last completed and what comes next
2. Check **Next item** to know exactly where to resume
3. Check **Blockers** to know if anything is preventing progress
4. Check **Plan deviations** to understand where the implementation differs from the plan

After completing each file or plan item, append a new entry using the format below. Write immediately — do not batch entries at the end of a session.

---

## Entry format

```markdown
## [YYYY-MM-DD] [Brief description of what was done]

**Plan items addressed:** [item numbers, e.g. "Items 7, 8"]

**Files created:**
- `path/to/file.py` — one sentence describing what it contains

**Files modified:**
- `path/to/file.py` — one sentence describing what changed and why

**Tests written:**
- `tests/path/test_file.py` — N tests, [passing / failing / not yet run]

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item [N] — [description]

**Blockers:** [None / description]

**Plan deviations:** [None / what differs from the plan and why]
```

---

## Progress tracker

Items are listed in **execution order**, not numeric order. Do not reorder. Check off each item before starting the next.

| Item | Track | Description | Status |
|---|---|---|---|
| 1 | A | Fix GridFS saves — remove bare `except: pass`, fail loud | ⬜ not started |
| 2 | A | Move outputs to GridFS-only (remove content_b64 from case doc) | ⬜ not started |
| 3 | A | Raise SOP truncation ceiling to 20,000 chars | ⬜ not started |
| 4 | A | Add section-type routing before LLM extraction | ⬜ not started |
| 5 | A | Background job mutex + stale-job detection | ⬜ not started |
| 6 | A | `TASK_BACKEND` dispatch abstraction (asyncio mode, celery stub) | ⬜ not started |
| 12 | A | Fix DOCX table interleaving in `_docx_to_markdown` | ⬜ not started |
| 14 | A | Move markdown/anchors/chunks to separate collections + dual-read | ⬜ not started |
| 15 | A | Migration script `migrate_sop_schema_v2.py` | ⬜ not started |
| 17 | A | Deprecate SOP Uplift frontend batch polling — remove `/extract`, `/analyze` client calls | ⬜ not started |
| 7 | B | `utils/services/schemas.py` — all shared Pydantic models | ⬜ not started |
| 8 | B | `utils/services/conversion.py` — svc.conversion (docx/pdf/xlsx routing + StyleProfile) | ⬜ not started |
| 9 | B | `utils/services/llm_orchestrator.py` — svc.llm (budget, retry, cost recording) | ⬜ not started |
| 10 | B | `utils/services/excel_pipeline.py` — svc.excel (schema detection + row completeness) | ⬜ not started |
| 11 | B | Populate corpus_map from svc.excel output | ⬜ not started |
| 13 | B | `utils/services/analysis.py` skeleton — svc.analysis (interfaces only) | ⬜ not started |
| 18 | B | `utils/sop_processing/sse_events.py` — SSE helper module only (`yield_sse_event()`), no endpoint yet | ⬜ not started |
| 19 | B | LLM call budget cap — `document_uplift.max_llm_calls_per_pipeline` setting | ⬜ not started |
| 20 | B | `utils/sop_processing/prompts.py` + `content_sanitizer.py` — all 8 prompt functions + FD7 hardening | ⬜ not started |
| 16 | B | Full multi-pass chunked extraction (via svc.analysis, uses prompts from Item 20) | ⬜ not started |
| 21 | B | `utils/services/analysis.py` full — Stage 1 complete (wires Items 16, 20 together) | ⬜ not started |
| — | — | **CHECKPOINT A** — `pytest tests/services/ -v` passing + TC-01 (Excel ≥ 95% rows via direct svc.excel call) + TC-04 (Word ≥ 85% pages via direct svc.analysis call). MongoDB size check deferred to Checkpoint C. | ⬜ not started |
| 26 | B | `utils/sop_processing/case_store.py` — MongoDB + GridFS (outputs + inputs) for `document_uplift_cases` | ⬜ not started |
| 26a | B | `utils/sop_processing/pipeline.py` — pipeline orchestrator: sequences services, owns all persistence | ⬜ not started |
| 27 | B | `api/routers/document_uplift.py` — router skeleton + case CRUD endpoints | ⬜ not started |
| 22 | B | Suggestion review endpoints in router — PATCH /suggestions/{id}, POST /bulk-review, auto-accept logic | ⬜ not started |
| — | — | **CHECKPOINT B** — Stage 1 end-to-end: suggestions populated with `review_status="pending"`, corpus_map non-empty | ⬜ not started |
| 23 | B | `POST /generate-outputs` endpoint + Stage 2 dispatch via `TASK_BACKEND` | ⬜ not started |
| 23b | B | **POC** — track-changes Word XML: test `w:ins`/`w:del` for 3 paragraph types, verify opens in Word 365. Record result in build log before Item 24. | ⬜ not started |
| 24 | B | `utils/sop_processing/output_generator.py` — section rewrite + track-changes Word + swimlane extraction (5 days) | ⬜ not started |
| 25 | B | `utils/sop_processing/diagram_renderer.py` — matplotlib swimlane PNG (300 DPI) + PDF | ⬜ not started |
| 28 | B | Settings page Pipeline Controls card — max LLM calls input | ⬜ not started |
| 29 | B | `kpmg_ui/client/src/pages/document-uplift.tsx` — full UI (5 days) | ⬜ not started |
| 30 | B | Add SSE endpoint to router (Item 27) + wire `EventSource` in `document-uplift.tsx` — render progress bar | ⬜ not started |
| 31 | B | Integration data-flow test: verify cross-document gap analysis runs end-to-end (corpus_map populated → svc.analysis gap output → suggestions contain gap flags) | ⬜ not started |
| — | — | **CHECKPOINT C** — Word track-changes opens in Word 365, diagram renders, cost badge correct, `document_uplift_cases` doc < 500KB (T3), TC-05 passing | ⬜ not started |
| 32 | B | Celery + Redis Docker Compose wiring (`TASK_BACKEND=celery`) | ⬜ not started |
| 33 | B | Full asyncio worker queue + `run_in_executor` for all blocking I/O | ⬜ not started |
| — | — | **T8 GATE** — human reviews 3 suggestions, ≥ 2 rated useful → set `DOCUMENT_UPLIFT_ENABLED=true` | ⬜ not started |

---

*No entries yet — feature not started.*

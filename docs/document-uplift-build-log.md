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
| 1 | A | Fix GridFS saves — remove bare `except: pass`, fail loud | complete |
| 2 | A | Move outputs to GridFS-only (remove content_b64 from case doc) | complete |
| 3 | A | Raise SOP truncation ceiling to 20,000 chars | complete |
| 4 | A | Add section-type routing before LLM extraction | complete |
| 5 | A | Background job mutex + stale-job detection | complete |
| 6 | A | `TASK_BACKEND` dispatch abstraction (asyncio mode, celery stub) | complete |
| 12 | A | Fix DOCX table interleaving in `_docx_to_markdown` | complete |
| 14 | A | Move markdown/anchors/chunks to separate collections + dual-read | complete |
| 15 | A | Migration script `migrate_sop_schema_v2.py` | complete |
| 17 | A | Deprecate SOP Uplift frontend batch polling — remove `/extract`, `/analyze` client calls | complete |
| 7 | B | `utils/services/schemas.py` — all shared Pydantic models | complete |
| 8 | B | `utils/services/conversion.py` — svc.conversion (docx/pdf/xlsx routing + StyleProfile) | complete |
| 9 | B | `utils/services/llm_orchestrator.py` — svc.llm (budget, retry, cost recording) | complete |
| 10 | B | `utils/services/excel_pipeline.py` — svc.excel (schema detection + row completeness) | complete |
| 11 | B | Populate corpus_map from svc.excel output | complete |
| 13 | B | `utils/services/analysis.py` skeleton — svc.analysis (interfaces only) | complete |
| 18 | B | `utils/sop_processing/sse_events.py` — SSE helper module only (`yield_sse_event()`), no endpoint yet | complete |
| 19 | B | LLM call budget cap — `document_uplift.max_llm_calls_per_pipeline` setting | complete |
| 20 | B | `utils/sop_processing/prompts.py` + `content_sanitizer.py` — all 8 prompt functions + FD7 hardening | complete |
| 16 | B | Full multi-pass chunked extraction (via svc.analysis, uses prompts from Item 20) | complete |
| 21 | B | `utils/services/analysis.py` full — Stage 1 complete (wires Items 16, 20 together) | complete |
| — | — | **CHECKPOINT A** — `pytest tests/services/ -v` passing + TC-01 (Excel ≥ 95% rows via direct svc.excel call) + TC-04 (Word ≥ 85% pages via direct svc.analysis call). MongoDB size check deferred to Checkpoint C. | complete |
| 26 | B | `utils/sop_processing/case_store.py` — MongoDB + GridFS (outputs + inputs) for `document_uplift_cases` | complete |
| 26a | B | `utils/sop_processing/pipeline.py` — pipeline orchestrator: sequences services, owns all persistence | complete |
| 27 | B | `api/routers/document_uplift.py` — router skeleton + case CRUD endpoints | complete |
| 22 | B | Suggestion review endpoints in router — PATCH /suggestions/{id}, POST /bulk-review, auto-accept logic | complete |
| — | — | **CHECKPOINT B** — Stage 1 end-to-end: suggestions populated with `review_status="pending"`, corpus_map non-empty | complete |
| 23 | B | `POST /generate-outputs` endpoint + Stage 2 dispatch via `TASK_BACKEND` | complete |
| 23b | B | **POC** — track-changes Word XML: test `w:ins`/`w:del` for 3 paragraph types, verify opens in Word 365. Record result in build log before Item 24. | complete |
| 24 | B | `utils/sop_processing/output_generator.py` — section rewrite + track-changes Word + swimlane extraction (5 days) | complete |
| 25 | B | `utils/sop_processing/diagram_renderer.py` — matplotlib swimlane PNG (300 DPI) + PDF | complete |
| 28 | B | Settings page Pipeline Controls card — max LLM calls input | complete |
| 29 | B | `kpmg_ui/client/src/pages/document-uplift.tsx` — full UI (5 days) | complete |
| 30 | B | Add SSE endpoint to router (Item 27) + wire `EventSource` in `document-uplift.tsx` — render progress bar | complete |
| 31 | B | Integration data-flow test: verify cross-document gap analysis runs end-to-end (corpus_map populated → svc.analysis gap output → suggestions contain gap flags) | complete |
| — | — | **CHECKPOINT C** — Word track-changes opens in Word 365, diagram renders, cost badge correct, `document_uplift_cases` doc < 500KB (T3), TC-05 passing | automated checks complete; Word 365 manual gate pending |
| -- | B addendum | Checkpoint C domain-agnostic analysis remediation: normalized facts, semantic roles, seed findings, discovery routing, severity bands, and T9 tests | complete |
| 32 | B | Celery + Redis Docker Compose wiring (`TASK_BACKEND=celery`) | complete |
| 33 | B | Full asyncio worker queue + `run_in_executor` for all blocking I/O | complete |
| — | — | **T8 GATE** — human reviews 3 suggestions, ≥ 2 rated useful → set `DOCUMENT_UPLIFT_ENABLED=true` | ⬜ not started |
| -- | -- | **T9 GATE** - human reviews cross-domain suggestions against at least 3 different document roles/domains; >= 70% useful | not started |

---

## [2026-05-06] Started Item 7 schema contract tests

**Plan items addressed:** Item 7

**Files created:**
- `tests/services/test_schemas.py` - contract tests for the new Document Uplift shared service schemas.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the test-first start for Item 7 and marked Item 7 in progress.

**Tests written:**
- `tests/services/test_schemas.py` - 7 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\services\test_schemas.py -v` - 7 failed because `utils.services.schemas` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 7 - implement `utils/services/schemas.py` after confirming the schema tests fail for the missing module.

**Blockers:** None

**Plan deviations:** None

## [2026-05-06] Annotated touched settings helper

**Plan items addressed:** Item 19

**Files created:**
- None

**Files modified:**
- `utils/llm_config_store.py` - added a return type annotation to the touched `_get_collection()` helper.
- `docs/document-uplift-build-log.md` - recorded the settings helper annotation cleanup.

**Tests written:**
- None

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 19 - rerun settings verification after annotation cleanup.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 19 budget config

**Plan items addressed:** Item 19

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 19 complete and recorded final verification.
- `docs/HANDOFF.md` - added the Document Uplift budget config handoff note.

**Tests written:**
- `tests/test_settings.py` - 3 new tests, passing.

**Verified:**
- [x] `python -m pytest tests/test_settings.py tests/services/ tests/sop_processing/ -v` passing - 57 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\llm_config_store.py utils\services utils\sop_processing tests\services tests\sop_processing` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\llm_config_store.py utils\services utils\sop_processing tests\services tests\sop_processing` returned no unannotated definitions.

**Next item:** Item 20 - prompts and content sanitizer.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 20 content sanitizer tests

**Plan items addressed:** Item 20

**Files created:**
- `tests/sop_processing/test_content_sanitizer.py` - FD7 tests for delimiter wrapping, injection pattern screening, and sentence-boundary truncation.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 20 in progress and recorded sanitizer test creation.

**Tests written:**
- `tests/sop_processing/test_content_sanitizer.py` - 3 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\sop_processing\test_content_sanitizer.py -v` - 3 failed because `utils.sop_processing.content_sanitizer` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 20 - confirm content sanitizer tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 20 content sanitizer

**Plan items addressed:** Item 20

**Files created:**
- `utils/sop_processing/content_sanitizer.py` - FD7 sanitizer with delimiter wrapping, injection screening, and length truncation.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded content sanitizer implementation.

**Tests written:**
- `tests/sop_processing/test_content_sanitizer.py` - 3 tests, failing before implementation; rerun pending after sanitizer creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 20 - run sanitizer verification before writing prompt tests.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 20 prompt tests

**Plan items addressed:** Item 20

**Files created:**
- `tests/test_prompts.py` - prompt contract tests for all eight prompt template functions.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded prompt test creation.

**Tests written:**
- `tests/test_prompts.py` - 6 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\test_prompts.py -v` - 6 failed because `utils.sop_processing.prompts` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 20 - confirm prompt tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 20 prompt templates

**Plan items addressed:** Item 20

**Files created:**
- `utils/sop_processing/prompts.py` - all eight prompt template functions with version constants and FD7 delimiter usage.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded prompt template implementation.

**Tests written:**
- `tests/test_prompts.py` - 6 tests, failing before implementation; rerun pending after prompt creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 20 - run prompt verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 20 prompts and sanitizer

**Plan items addressed:** Item 20

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 20 complete and recorded final verification.
- `docs/HANDOFF.md` - added the Document Uplift prompt and sanitizer handoff note.

**Tests written:**
- `tests/sop_processing/test_content_sanitizer.py` - 3 tests, passing.
- `tests/test_prompts.py` - 6 tests, passing.

**Verified:**
- [x] `python -m pytest tests/test_settings.py tests/test_prompts.py tests/services/ tests/sop_processing/ -v` passing - 66 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\llm_config_store.py utils\services utils\sop_processing tests\services tests\sop_processing tests\test_prompts.py` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\llm_config_store.py utils\services utils\sop_processing tests\services tests\sop_processing tests\test_prompts.py` returned no unannotated definitions.

**Next item:** Item 16 - full multi-pass chunked extraction for Word/PDF.

**Blockers:** Item 16 lists Item 4 as a dependency, but Track A is explicitly deferred by the active plan directive. Do not start Item 16 until this dependency conflict is resolved or the plan is updated.

**Plan deviations:** None

## [2026-05-06] Added Item 7 shared schema module

**Plan items addressed:** Item 7

**Files created:**
- `utils/services/__init__.py` - package marker for the new stateless Document Uplift service layer.
- `utils/services/schemas.py` - shared Pydantic models and Literal aliases for Document Uplift services, including the Topic 8A `AnalysisResult`.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the Item 7 service package and schema module creation.

**Tests written:**
- `tests/services/test_schemas.py` - 7 tests, failing before implementation; rerun pending after schema module creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 7 - run schema verification and service test suite.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 8 conversion service tests

**Plan items addressed:** Item 8

**Files created:**
- `tests/services/test_conversion.py` - contract tests for the new stateless Document Uplift conversion service.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 8 in progress and recorded conversion test creation.

**Tests written:**
- `tests/services/test_conversion.py` - 6 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\services\test_conversion.py -v` - 6 failed because `utils.services.conversion` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 8 - implement `utils/services/conversion.py`.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 8 conversion service

**Plan items addressed:** Item 8

**Files created:**
- `utils/services/conversion.py` - stateless Document Uplift conversion service with DOCX, PDF, Excel, and text routing plus style extraction.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the Item 8 conversion service implementation.

**Tests written:**
- `tests/services/test_conversion.py` - 6 tests, failing before implementation; green rerun passed after service creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 8 - run full service verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 8 conversion service

**Plan items addressed:** Item 8

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 8 complete and recorded final service verification.
- `docs/HANDOFF.md` - added the Document Uplift conversion service handoff note.

**Tests written:**
- `tests/services/test_conversion.py` - 6 tests, passing.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 13 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 9 - `utils/services/llm_orchestrator.py` LLM orchestration service.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 9 LLM orchestrator tests

**Plan items addressed:** Item 9

**Files created:**
- `tests/services/test_llm_orchestrator.py` - contract tests for LLM budget handling, JSON retry, call records, cost calculation, and model-aware batch sizing.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 9 in progress and recorded LLM orchestrator test creation.

**Tests written:**
- `tests/services/test_llm_orchestrator.py` - 7 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\services\test_llm_orchestrator.py -v` - 7 failed because `utils.services.llm_orchestrator` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 9 - confirm LLM orchestrator tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 9 LLM orchestrator service

**Plan items addressed:** Item 9

**Files created:**
- `utils/services/llm_orchestrator.py` - stateless LLM orchestration service with budget checks, JSON retry, call records, model-aware batch sizing, and cost calculation.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the Item 9 LLM orchestrator implementation.

**Tests written:**
- `tests/services/test_llm_orchestrator.py` - 7 tests, failing before implementation; rerun pending after service creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 9 - run LLM orchestrator verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 9 LLM orchestrator service

**Plan items addressed:** Item 9

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 9 complete and recorded final service verification.
- `docs/HANDOFF.md` - added the Document Uplift LLM orchestrator handoff note.

**Tests written:**
- `tests/services/test_llm_orchestrator.py` - 7 tests, passing.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 20 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 10 - `utils/services/excel_pipeline.py` structured Excel pipeline service.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 10 Excel pipeline tests

**Plan items addressed:** Item 10

**Files created:**
- `tests/services/test_excel_pipeline.py` - contract tests for structured Excel row coverage, gaps, merged cells, headers, sheet handling, budget handling, and corpus maps.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 10 in progress and recorded Excel pipeline test creation.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - 8 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\services\test_excel_pipeline.py -v` - 8 failed because `utils.services.excel_pipeline` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 10 - confirm Excel pipeline tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 10 Excel pipeline service

**Plan items addressed:** Item 10

**Files created:**
- `utils/services/excel_pipeline.py` - stateless structured Excel pipeline with schema detection, in-memory merged-cell propagation, gap scanning, and corpus map population.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the Item 10 Excel pipeline implementation.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - 8 tests, failing before implementation; rerun pending after service creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 10 - run Excel pipeline verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 10 Excel pipeline service

**Plan items addressed:** Item 10

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 10 complete and recorded final service verification.
- `docs/HANDOFF.md` - added the Document Uplift Excel pipeline handoff note.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - 8 tests, passing.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 28 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 11 - populate corpus_map from svc.excel output.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Annotated Item 7 schema tests

**Plan items addressed:** Item 7

**Files created:**
- None

**Files modified:**
- `tests/services/test_schemas.py` - added explicit return type annotations to the helper and all new schema test functions.
- `docs/document-uplift-build-log.md` - recorded the schema test annotation update.

**Tests written:**
- `tests/services/test_schemas.py` - 7 tests, pending rerun after annotation cleanup.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 7 - rerun service verification and static checks after function annotation cleanup.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 7 shared schemas

**Plan items addressed:** Item 7

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 7 complete and recorded final verification.
- `docs/HANDOFF.md` - added a handoff note for the Document Uplift service schema foundation.

**Tests written:**
- `tests/services/test_schemas.py` - 7 tests, passing.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 7 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 8 - `utils/services/conversion.py` document conversion service.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 11 corpus map population

**Plan items addressed:** Item 11

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 11 complete and appended the current authoritative resume point.
- `docs/HANDOFF.md` - updated the Document Uplift service foundation handoff status.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - `test_corpus_map_populated` verifies `risk_to_control_map` and `evidence_to_control_map` are populated from svc.excel output.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 28 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 13 - `utils/services/analysis.py` skeleton interfaces only.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Reopened Item 11 for RowGap suggestion cap

**Plan items addressed:** Item 11

**Files created:**
- None

**Files modified:**
- `tests/services/test_schemas.py` - added coverage for the ExcelPipelineResult suggestions default required by Item 11.
- `tests/services/test_excel_pipeline.py` - added coverage for capped RowGap-to-Suggestion conversion.
- `docs/document-uplift-build-log.md` - reopened Item 11 after rereading the full implementation-sequence row.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - 1 new Item 11 test, not yet run.
- `tests/services/test_schemas.py` - 1 assertion added, not yet run.

**Red phase evidence:**
- `python -m pytest tests\services\test_schemas.py tests\services\test_excel_pipeline.py -v` - 2 failed because `ExcelPipelineResult.suggestions` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 11 - confirm RowGap suggestion tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 11 capped gap suggestions

**Plan items addressed:** Item 11

**Files created:**
- None

**Files modified:**
- `utils/services/schemas.py` - added `ExcelPipelineResult.suggestions` as the shared schema field needed by Item 11.
- `utils/services/excel_pipeline.py` - converts RowGap entries into capped pending suggestions per gap type per sheet.
- `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md` - updated the Topic 1 schema block to include the Item 11 suggestions field.
- `docs/document-uplift-build-log.md` - recorded the schema correction and implementation.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - Item 11 RowGap suggestion cap test, rerun pending.
- `tests/services/test_schemas.py` - ExcelPipelineResult suggestions default assertion, rerun pending.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 11 - rerun service verification after capped suggestion implementation.

**Blockers:** None

**Plan deviations:** Topic 1 lacked an `ExcelPipelineResult.suggestions` field even though Item 11 requires a capped `Suggestion` list from RowGap entries; the plan schema block was updated to make that field explicit.

---

## [2026-05-06] Completed Item 11 RowGap suggestion conversion

**Plan items addressed:** Item 11

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 11 complete after final verification.
- `docs/HANDOFF.md` - updated the Document Uplift service foundation handoff for Item 11.

**Tests written:**
- `tests/services/test_excel_pipeline.py` - 1 new Item 11 test, passing.
- `tests/services/test_schemas.py` - 1 schema assertion, passing.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 29 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 13 - `utils/services/analysis.py` skeleton interfaces only.

**Blockers:** None

**Plan deviations:** Topic 1 lacked an `ExcelPipelineResult.suggestions` field even though Item 11 requires a capped `Suggestion` list from RowGap entries; the plan schema block was updated to make that field explicit.

---

## [2026-05-06] Started Item 13 analysis skeleton tests

**Plan items addressed:** Item 13

**Files created:**
- `tests/services/test_analysis.py` - skeleton interface tests for `analyze_documents()`.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 13 in progress and recorded analysis skeleton test creation.

**Tests written:**
- `tests/services/test_analysis.py` - 2 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\services\test_analysis.py -v` - 2 failed because `utils.services.analysis` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 13 - confirm analysis skeleton tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 13 analysis skeleton

**Plan items addressed:** Item 13

**Files created:**
- `utils/services/analysis.py` - skeleton `analyze_documents()` interface for Stage 1 analysis with no extraction logic.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the Item 13 analysis skeleton implementation.

**Tests written:**
- `tests/services/test_analysis.py` - 2 tests, failing before implementation; rerun pending after skeleton creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 13 - run analysis skeleton verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 13 analysis skeleton

**Plan items addressed:** Item 13

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 13 complete and recorded final verification.
- `docs/HANDOFF.md` - added the Document Uplift analysis skeleton handoff note.

**Tests written:**
- `tests/services/test_analysis.py` - 2 tests, passing.

**Verified:**
- [x] `python -m pytest tests/services/ -v` passing - 31 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services tests\services` returned no unannotated definitions.

**Next item:** Item 18 - `utils/sop_processing/sse_events.py` SSE helper module only.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 18 SSE helper tests

**Plan items addressed:** Item 18

**Files created:**
- `tests/sop_processing/test_sse_events.py` - contract tests for SSE event formatting.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 18 in progress and recorded SSE helper test creation.

**Tests written:**
- `tests/sop_processing/test_sse_events.py` - 2 tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\sop_processing\test_sse_events.py -v` - 2 failed because `utils.sop_processing.sse_events` is missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 18 - confirm SSE helper tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 18 SSE helper

**Plan items addressed:** Item 18

**Files created:**
- `utils/sop_processing/__init__.py` - package marker for new Document Uplift orchestration utilities.
- `utils/sop_processing/sse_events.py` - SSE event formatting helper only; no endpoint.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the Item 18 SSE helper implementation.

**Tests written:**
- `tests/sop_processing/test_sse_events.py` - 2 tests, failing before implementation; rerun pending after helper creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 18 - run SSE helper verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 18 SSE helper

**Plan items addressed:** Item 18

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 18 complete and recorded final verification.
- `docs/HANDOFF.md` - added the Document Uplift SSE helper handoff note.

**Tests written:**
- `tests/sop_processing/test_sse_events.py` - 2 tests, passing.

**Verified:**
- [x] `python -m pytest tests/services/ tests/sop_processing/ -v` passing - 33 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services utils\sop_processing tests\services tests\sop_processing` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services utils\sop_processing tests\services tests\sop_processing` returned no unannotated definitions.

**Next item:** Item 19 - LLM call budget cap setting.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Started Item 19 budget config tests

**Plan items addressed:** Item 19

**Files created:**
- None

**Files modified:**
- `tests/test_settings.py` - added tests for MongoDB-backed Document Uplift LLM budget config and env seeding.
- `docs/document-uplift-build-log.md` - marked Item 19 in progress and recorded budget config test creation.

**Tests written:**
- `tests/test_settings.py` - 3 new tests, failing as expected before implementation.

**Red phase evidence:**
- `python -m pytest tests\test_settings.py -k "document_uplift_config" -v` - 3 failed because Document Uplift config helpers are missing.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 19 - confirm budget config tests fail before implementation.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Added Item 19 budget config helpers

**Plan items addressed:** Item 19

**Files created:**
- None

**Files modified:**
- `utils/llm_config_store.py` - added MongoDB-backed Document Uplift max LLM call budget config helpers with env seeding.
- `docs/document-uplift-build-log.md` - recorded the Item 19 config implementation.

**Tests written:**
- `tests/test_settings.py` - 3 new tests, failing before implementation; rerun pending after helper creation.

**Verified:**
- [ ] `python -m pytest tests/services/ -v` passing
- [ ] No bare `except: pass` introduced
- [ ] All new functions have explicit return type annotations

**Next item:** Item 19 - run budget config verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Current Authoritative Resume Point

**Plan items addressed:** Items 7, 8, 9, 10, 11, 13, 18, 19, 20

**Files created:**
- `utils/services/__init__.py`
- `utils/services/schemas.py`
- `utils/services/conversion.py`
- `utils/services/llm_orchestrator.py`
- `utils/services/excel_pipeline.py`
- `utils/services/analysis.py`
- `utils/sop_processing/__init__.py`
- `utils/sop_processing/sse_events.py`
- `utils/sop_processing/content_sanitizer.py`
- `utils/sop_processing/prompts.py`
- `tests/services/test_schemas.py`
- `tests/services/test_conversion.py`
- `tests/services/test_llm_orchestrator.py`
- `tests/services/test_excel_pipeline.py`
- `tests/services/test_analysis.py`
- `tests/sop_processing/test_sse_events.py`
- `tests/sop_processing/test_content_sanitizer.py`
- `tests/test_prompts.py`

**Files modified:**
- `utils/llm_config_store.py` - added Document Uplift LLM budget config helpers.
- `tests/test_settings.py` - added Document Uplift budget config coverage.
- `docs/HANDOFF.md` - added Document Uplift service foundation handoff notes.
- `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md` - recorded active Track B directive and Item 11 schema correction.
- `docs/document-uplift-build-log.md` - recorded TDD evidence and this resume point.

**Tests written:**
- Service, SOP processing helper, prompt, and settings tests for Items 7, 8, 9, 10, 11, 13, 18, 19, and 20.

**Verified:**
- [x] Previous full targeted verification passed: `python -m pytest tests/test_settings.py tests/test_prompts.py tests/services/ tests/sop_processing/ -v` - 66 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] Final fresh targeted verification passed: `python -m pytest tests/test_settings.py tests/test_prompts.py tests/services/ tests/sop_processing/ -v` - 66 passed, 1 warning for the plan-required `SheetResult.schema` field name.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\llm_config_store.py utils\services utils\sop_processing tests\services tests\sop_processing tests\test_prompts.py` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\llm_config_store.py utils\services utils\sop_processing tests\services tests\sop_processing tests\test_prompts.py` returned no unannotated definitions.
- [x] New feature code does not import from or reference existing SOP Uplift modules - `rg -n "sop_uplift" utils\services utils\sop_processing tests\services tests\sop_processing tests\test_prompts.py` returned no matches.

**Next item:** Item 16 - full multi-pass chunked extraction for Word/PDF.

**Blockers:** Item 16 lists Track A Item 4 as a dependency, but Track A is explicitly deferred by the active plan directive. Do not start Item 16 until this dependency conflict is resolved or the plan is updated.

**Plan deviations:** Topic 1 originally lacked `ExcelPipelineResult.suggestions`, but Item 11 requires a capped `Suggestion` list from RowGap entries. The plan schema block was updated to make that required field explicit.

---

## [2026-05-06] Track A Authorized And UI Mockup Directive Added

**Plan items addressed:** Planning directive update before continuing dependencies.

**Files created:**
- None

**Files modified:**
- `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md` - recorded the human owner's authorization to use Track A and proceed with all tasks.
- `docs/document-uplift-build-log.md` - recorded this resume decision.

**Tests written:**
- Item 16 tests were already added in `tests/services/test_analysis.py` before this authorization update; implementation is paused until Track A dependencies are backfilled.

**Verified:**
- [ ] Track A Item 1 red test pending.
- [ ] No full verification run after this directive-only update.

**Next item:** Backfill Track A Item 1 - fix GridFS saves by removing bare `except: pass` and failing loud.

**Blockers:** None. Track A is now explicitly authorized.

**Plan deviations:** Human owner added a visual review rule: before implementing any UI screen, report surface, diagram output, or other visual deliverable, produce mockups for review first.

---

## [2026-05-06] Captured Item 16 Red Tests And Started Track A Item 1

**Plan items addressed:** Items 16 and 1

**Files created:**
- None

**Files modified:**
- `tests/services/test_analysis.py` - added Item 16 red tests for section classification, terminology propagation, metadata staleness flags, model-aware batching, cross-synthesis skip behavior, and pending suggestions.
- `tests/test_sop_uplift_api.py` - added Track A Item 1 regression coverage for output GridFS save failure returning HTTP 503.
- `docs/document-uplift-build-log.md` - recorded the red-phase transition.

**Tests written:**
- `tests/services/test_analysis.py` - 6 new Item 16 tests, failing as expected because `utils/services/analysis.py` is still the skeleton.
- `tests/test_sop_uplift_api.py` - 1 new Item 1 test, red run pending.

**Verified:**
- [x] `python -m pytest tests\services\test_analysis.py -v` red phase captured - 6 failed, 2 passed, 1 warning; failures are expected missing `analysis.call_llm` orchestration.
- [ ] Track A Item 1 red test pending.

**Next item:** Item 1 - run the new GridFS save failure regression test red, then implement fail-loud output storage.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 1 GridFS Fail-Loud Output Storage

**Plan items addressed:** Item 1

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_api.py` - added a regression test that expects HTTP 503 when output GridFS storage fails.
- `api/routers/sop_uplift.py` - changed `generate_outputs` so `save_output_content()` failures are logged and returned as HTTP 503 instead of silently falling back to base64-only outputs.
- `utils/sop_uplift/case_store.py` - replaced silent GridFS delete cleanup passes with warning logs.
- `docs/document-uplift-build-log.md` - marked Item 1 complete.

**Tests written:**
- `tests/test_sop_uplift_api.py::test_generate_outputs_returns_503_when_gridfs_save_fails` - passing after implementation.

**Verified:**
- [x] `python -m pytest tests\test_sop_uplift_api.py -k "gridfs_save_fails or downloadable_non_placeholder_outputs" -v` passing - 2 passed, 40 deselected.
- [ ] Full Track A/API regression run pending after Item 2.

**Next item:** Item 2 - move outputs to GridFS-only by removing `content_b64` from stored case output metadata.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 2 GridFS-Only Output Metadata

**Plan items addressed:** Item 2

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_api.py` - updated output generation tests to assert generated response and stored case output metadata omit `content_b64`; tests now inspect bytes passed to GridFS.
- `api/routers/sop_uplift.py` - removed base64 payloads from generated output metadata, saves every generated output including the VSDX stub through `save_output_content()`, and keeps only GridFS-backed output metadata in the case document.
- `docs/document-uplift-build-log.md` - marked Item 2 complete.

**Tests written:**
- Existing output generation tests were updated for the new GridFS-only contract.

**Verified:**
- [x] Item 2 red phase captured: selected output tests failed because response metadata still contained `content_b64`.
- [x] `python -m pytest tests\test_sop_uplift_api.py -k "downloadable_non_placeholder_outputs or formatted_export_base or effective_sop_state or gridfs_save_fails" -v` passing - 4 passed, 38 deselected.
- [x] `python -m pytest tests\test_sop_uplift_api.py tests\test_sop_uplift_persistence_and_prompts.py -v` passing - 51 passed.
- [x] No same-line bare `except: pass` remains in touched Track A files - `rg -n "except\s*:\s*pass|except\s+Exception:\s*pass" api\routers\sop_uplift.py utils\sop_uplift\case_store.py tests\test_sop_uplift_api.py` returned no matches.

**Next item:** Item 3 - raise SOP truncation ceiling to 20,000 chars.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 3 SOP Prompt Ceiling

**Plan items addressed:** Item 3

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_pipeline.py` - added a regression test proving the default SOP LLM prompt ceiling carries content beyond the old 4,000-character limit.
- `utils/sop_uplift/content_sanitizer.py` - raised the default sanitizer ceiling to 20,000 characters.
- `utils/sop_uplift/pipeline.py` - raised the default `run_full_sop_pipeline()` chunk ceiling to 20,000 characters.
- `api/routers/sop_uplift.py` - raised run-pipeline and batch-analysis env defaults for `SOP_UPLIFT_MAX_CHUNK_CHARS` to 20,000 while preserving the explicit 20,000 upper bound.
- `docs/document-uplift-build-log.md` - marked Item 3 complete.

**Tests written:**
- `tests/test_sop_uplift_pipeline.py::test_full_pipeline_default_prompt_ceiling_allows_twenty_thousand_chars` - passing after implementation.

**Verified:**
- [x] Item 3 red phase captured: the new default-ceiling test failed because the old 4,000-character default omitted the tail marker.
- [x] `python -m pytest tests\test_sop_uplift_pipeline.py -k "max_chunk_chars or twenty_thousand_chars" -v` passing - 2 passed, 18 deselected.

**Next item:** Item 4 - add section-type routing before LLM extraction.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 4 Section-Type Routing

**Plan items addressed:** Item 4

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_pipeline.py` - added a regression test proving non-procedural SOP sections are not included in the full-document extraction prompt.
- `utils/sop_uplift/pipeline.py` - added heuristic section-type routing for existing SOP Uplift document analysis units; procedural and purpose/scope anchors remain eligible, while document history, definitions, references, and appendix anchors are excluded from the full-document extraction prompt when clearly present.
- `docs/document-uplift-build-log.md` - marked Item 4 complete.

**Tests written:**
- `tests/test_sop_uplift_pipeline.py::test_full_document_extraction_routes_only_procedural_sections` - passing after implementation.

**Verified:**
- [x] Item 4 red phase captured: the new routing test failed because document history, definitions, and references were still present in the LLM prompt.
- [x] `python -m pytest tests\test_sop_uplift_pipeline.py -k "routes_only_procedural_sections or twenty_thousand_chars or max_chunk_chars" -v` passing - 3 passed, 18 deselected.
- [x] `python -m pytest tests\test_sop_uplift_pipeline.py tests\test_sop_uplift_api.py tests\test_sop_uplift_persistence_and_prompts.py -v` passing - 72 passed.

**Next item:** Item 5 - background job mutex + stale-job detection.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 5 Pipeline Mutex and Stale Detection

**Plan items addressed:** Item 5

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_api.py` - added red/green coverage for stale running pipeline recovery, fresh running pipeline no-op behavior, and duplicate start prevention when MongoDB state lags.
- `api/routers/sop_uplift.py` - added an in-process per-case pipeline mutex, timeout-based stale `running` detection, stale failure marking, and mutex release on background completion.
- `docs/document-uplift-build-log.md` - marked Item 5 complete.

**Tests written:**
- `tests/test_sop_uplift_api.py::test_run_pipeline_marks_stale_running_job_failed_before_restart` - passing after implementation.
- `tests/test_sop_uplift_api.py::test_run_pipeline_returns_existing_fresh_running_job_without_new_thread` - passing.
- `tests/test_sop_uplift_api.py::test_run_pipeline_case_mutex_prevents_duplicate_start_when_store_state_lags` - passing after implementation.

**Verified:**
- [x] Item 5 red phase captured: stale jobs did not restart, and two rapid starts created two worker threads when store state lagged.
- [x] `python -m pytest tests\test_sop_uplift_api.py -k "stale_running_job or fresh_running_job or case_mutex" -v` passing - 3 passed, 42 deselected.
- [x] `python -m pytest tests\test_sop_uplift_api.py -k "run_pipeline" -v` passing - 6 passed, 39 deselected.

**Next item:** Item 6 - add `TASK_BACKEND` dispatch abstraction (`asyncio` mode, `celery` stub).

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 6 TASK_BACKEND Dispatch Abstraction

**Plan items addressed:** Item 6

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_api.py` - added red/green coverage for the exact `dispatch_pipeline(case_id, stage=1)` call contract, asyncio backend dispatch, and explicit Celery stub behavior.
- `api/routers/sop_uplift.py` - added `dispatch_pipeline(case_id: str, stage: int = 1) -> None`, routed `TASK_BACKEND=asyncio` through the existing stage-one background worker, made `TASK_BACKEND=celery` fail explicitly with HTTP 501, and persisted pipeline run options before dispatch.
- `docs/document-uplift-build-log.md` - marked Item 6 complete.

**Tests written:**
- `tests/test_sop_uplift_api.py::test_run_pipeline_persists_options_and_calls_dispatch_signature` - passing after implementation.
- `tests/test_sop_uplift_api.py::test_dispatch_pipeline_asyncio_backend_starts_stage_one_background_thread` - passing after implementation.
- `tests/test_sop_uplift_api.py::test_dispatch_pipeline_celery_backend_is_explicit_stub` - passing after implementation.

**Verified:**
- [x] Item 6 red phase captured: no dispatcher existed, and the router still passed options directly to the thread target.
- [x] `python -m pytest tests\test_sop_uplift_api.py -k "dispatch_signature or dispatch_pipeline" -v` passing - 3 passed, 45 deselected.
- [x] `python -m pytest tests\test_sop_uplift_api.py -k "run_pipeline or dispatch_pipeline" -v` passing - 9 passed, 39 deselected.

**Next item:** Item 12 - fix DOCX table interleaving in `_docx_to_markdown`.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 12 DOCX Table Interleaving

**Plan items addressed:** Item 12

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_modules.py` - added a DOCX conversion regression test proving embedded tables remain between surrounding paragraphs.
- `utils/sop_uplift/markdown_ingestion.py` - changed `_docx_to_markdown` to iterate DOCX body XML blocks in order and render paragraphs/tables at their original positions.
- `tests/services/test_conversion.py` - added the same ordering regression for the independent Document Uplift conversion service clone.
- `utils/services/conversion.py` - aligned the independent DOCX conversion clone with the body-order table interleaving behavior while keeping it separate from `utils/sop_uplift/`.
- `docs/document-uplift-build-log.md` - marked Item 12 complete.

**Tests written:**
- `tests/test_sop_uplift_modules.py::test_markdown_conversion_interleaves_docx_tables_at_original_position` - passing after implementation.
- `tests/services/test_conversion.py::test_docx_conversion_interleaves_tables_at_original_position` - passing after implementation.

**Verified:**
- [x] Item 12 red phase captured: SOP converter test failed because the table was appended after the following paragraph.
- [x] Document Uplift service clone red phase captured: service conversion had the same append-at-end behavior.
- [x] `python -m pytest tests\test_sop_uplift_modules.py tests\services\test_conversion.py -k "docx_paragraphs_and_tables or interleaves_docx_tables or docx_conversion_returns_markdown or interleaves_tables" -v` passing - 4 passed, 22 deselected, 1 existing Pydantic warning.

**Next item:** Item 14 - move markdown/anchors/chunks to separate collections + dual-read support.

**Blockers:** None.

**Plan deviations:** None. The independent Document Uplift service clone was updated alongside `_docx_to_markdown` so the new feature does not inherit the fixed Track A defect; it still does not import from `utils/sop_uplift/`.

---

## [2026-05-06] Completed Track A Item 14 Split SOP Content Storage

**Plan items addressed:** Item 14

**Files created:**
- None

**Files modified:**
- `tests/test_sop_uplift_persistence_and_prompts.py` - added red/green coverage for schema v2 split content writes, schema v1 legacy dual-read hydration, and Mongo split collections.
- `utils/sop_uplift/case_store.py` - added `schema_version: 2` new cases, `sop_markdown` / `sop_anchors` / `sop_chunks` collections, `get_case_content()` dual-read support, hydrated `get_case()` returns, and split content cleanup on delete.
- `docs/document-uplift-build-log.md` - marked Item 14 complete.

**Tests written:**
- `tests/test_sop_uplift_persistence_and_prompts.py::test_memory_case_store_splits_schema_v2_content_and_hydrates_reads` - passing after implementation.
- `tests/test_sop_uplift_persistence_and_prompts.py::test_memory_case_store_dual_reads_legacy_schema_v1_embedded_content` - passing.
- `tests/test_sop_uplift_persistence_and_prompts.py::test_mongo_case_store_splits_schema_v2_content_into_separate_collections` - passing after implementation.

**Verified:**
- [x] Item 14 red phase captured: new cases lacked `schema_version: 2`, and heavy content remained embedded.
- [x] `python -m pytest tests\test_sop_uplift_persistence_and_prompts.py -k "schema_v2_content or legacy_schema_v1" -v` passing - 3 passed, 9 deselected.
- [x] `python -m pytest tests\test_sop_uplift_persistence_and_prompts.py -v` passing - 12 passed.
- [x] `python -m pytest tests\test_sop_uplift_api.py tests\test_sop_uplift_persistence_and_prompts.py tests\test_sop_uplift_modules.py -v` passing - 79 passed.

**Next item:** Item 15 - migration script `migrate_sop_schema_v2.py` + validation.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 15 SOP Schema V2 Migration Script

**Plan items addressed:** Item 15

**Files created:**
- `scripts/migrate_sop_schema_v2.py` - offline migration utility that moves schema v1 embedded SOP content into `sop_markdown`, `sop_anchors`, and `sop_chunks`, updates the case document last, validates migrated cases, and writes a JSON migration report.
- `tests/test_migrate_sop_schema_v2.py` - migration tests covering ordered split writes, rollback-safe failure, and validation failures.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 15 complete.

**Tests written:**
- `tests/test_migrate_sop_schema_v2.py::test_migrate_case_writes_split_collections_before_schema_update` - passing after implementation.
- `tests/test_migrate_sop_schema_v2.py::test_migrate_case_leaves_legacy_case_unchanged_when_split_write_fails` - passing after implementation.
- `tests/test_migrate_sop_schema_v2.py::test_validate_migrated_case_requires_split_docs_and_size_limit` - passing after implementation.

**Verified:**
- [x] Item 15 red phase captured: `scripts.migrate_sop_schema_v2` did not exist.
- [x] `python -m pytest tests\test_migrate_sop_schema_v2.py -v` passing - 3 passed.
- [x] `python -m pytest tests\test_migrate_sop_schema_v2.py tests\test_sop_uplift_persistence_and_prompts.py -v` passing - 15 passed.

**Next item:** Item 17 - deprecate SOP Uplift frontend batch polling and enforce single `run-pipeline` trigger.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-06] Item 17 UI Mockup Checkpoint

**Plan items addressed:** Item 17 (mockup checkpoint only)

**Files created:**
- `docs/superpowers/mockups/2026-05-06-sop-uplift-item17-run-pipeline-mockups.md` - review mockups for the SOP Uplift single-run extraction flow before UI implementation.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the required human-review checkpoint before frontend implementation.

**Tests written:**
- None - no UI implementation has started.

**Verified:**
- [x] Mockups created before editing `kpmg_ui/client/src/pages/sop-uplift.tsx`, per human instruction.

**Next item:** Await human review of Item 17 mockups, then implement Item 17 after approval.

**Blockers:** Human review required before UI implementation.

**Plan deviations:** None.

---

## [2026-05-06] Updated Build/Test File Modification Directive

**Plan items addressed:** Global implementation directive

**Files created:**
- None

**Files modified:**
- `docs/superpowers/plans/2026-05-05-sop-uplift-scale-quality-plan.md` - added human authorization to modify Dockerfiles, `docker-compose.yml`, dependency manifests/lockfiles, and requirements files when required for planned implementation, testing, or builds.
- `docs/document-uplift-build-log.md` - recorded the directive update.

**Tests written:**
- None - documentation-only directive update.

**Verified:**
- [x] Plan directive now explicitly permits scoped build/test dependency and Docker changes when needed.

**Next item:** Await human review of Item 17 mockups, then implement Item 17 after approval.

**Blockers:** Human review required before UI implementation.

**Plan deviations:** None.

---

## [2026-05-06] Completed Track A Item 17 SOP Uplift single pipeline trigger

**Plan items addressed:** Item 17

**Files created:**
- None

**Files modified:**
- `kpmg_ui/client/src/pages/sop-uplift.integration.test.ts` - updated the frontend contract to reject legacy `/extract`, `/analyze`, `/tasks/analysis`, per-section analysis, and Continue Analysis controls.
- `kpmg_ui/client/src/pages/sop-uplift.tsx` - removed the frontend `/analyze` batch function, legacy analysis task polling, per-section Analyze button, and Continue Analysis button; rerun controls now reuse `run-pipeline`.
- `docs/document-uplift-build-log.md` - marked Item 17 complete and recorded verification.

**Tests written:**
- `kpmg_ui/client/src/pages/sop-uplift.integration.test.ts` - updated Item 17 assertions; failing before implementation, passing after implementation.

**Red phase evidence:**
- `node --import tsx .\client\src\pages\sop-uplift.integration.test.ts` failed because the page still called `/analyze`.

**Verified:**
- [x] `node --import tsx .\client\src\pages\sop-uplift.integration.test.ts` passing.
- [x] `npm run check` passing.
- [x] `rg -n 'continueAnalysis|refreshAnalysisTask|analysisPending|/analyze|tasks/analysis|Analyze this section|Continue Analysis|onAnalyzeSection|canAnalyze|busy === "analysis"|busy !== "analysis"' kpmg_ui\client\src\pages\sop-uplift.tsx` returned no matches.

**Next item:** Item 16 - full multi-pass chunked extraction for Word/PDF.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Items 16 and 21 analysis service plus Checkpoint A

**Plan items addressed:** Items 16, 21, Checkpoint A

**Files created:**
- None

**Files modified:**
- `utils/services/analysis.py` - replaced the skeleton with Stage 1 orchestration: section classification, terminology extraction, metadata staleness flags, model-aware procedural batching, Excel corpus context, cross-document synthesis hook, suggestion normalization, and pending review defaults.
- `docs/document-uplift-build-log.md` - marked Items 16, 21, and Checkpoint A complete.

**Tests written:**
- `tests/services/test_analysis.py` - Item 16/21 red tests already existed from the earlier TDD checkpoint and now pass.

**Red phase evidence:**
- `python -m pytest tests\services\test_analysis.py -v` failed with 6 failures because the skeleton lacked `call_llm` and Stage 1 orchestration.
- Checkpoint A direct TC-04 validation initially failed at 41/50 pages because procedural batching was followed by the sanitizer's default 4,000-character cap; the procedural sanitizer cap now follows the model-aware batch size.

**Verified:**
- [x] `python -m pytest tests\services\test_analysis.py -v` passing - 8 passed, 1 existing `SheetResult.schema` warning.
- [x] `python -m pytest tests\services\ -v` passing - 38 passed, 1 existing `SheetResult.schema` warning.
- [x] Checkpoint A direct TC-01 validation passed - 500 Excel rows assessed.
- [x] Checkpoint A direct TC-04 validation passed - 50/50 synthetic SOP pages covered, 26 second-half suggestion source references.
- [x] No bare `except: pass` introduced - scan across `utils\services`, `tests\services`, `utils\sop_processing`, and `tests\sop_processing` returned no matches.
- [x] All functions in `utils/services/analysis.py` have explicit return type annotations.

**Next item:** Item 26 - `utils/sop_processing/case_store.py` MongoDB + GridFS storage for Document Uplift.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 26 Document Uplift case store

**Plan items addressed:** Item 26

**Files created:**
- `utils/sop_processing/case_store.py` - independent Document Uplift case store with `document_uplift_cases`, split markdown/anchors/chunks collections, `document_uplift_inputs` GridFS, `document_uplift_outputs` GridFS, and memory fallback.
- `tests/sop_processing/test_case_store.py` - Item 26 tests for split content, input/output bytes, and Document Uplift-only collection boundaries.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 26 complete and recorded verification.

**Tests written:**
- `tests/sop_processing/test_case_store.py` - 2 tests, failing before implementation and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\sop_processing\test_case_store.py -v` failed because `utils.sop_processing.case_store` was missing.

**Verified:**
- [x] `python -m pytest tests\sop_processing\test_case_store.py -v` passing - 2 passed, 1 existing `SheetResult.schema` warning.
- [x] `python -m pytest tests\sop_processing\ -v` passing - 7 passed, 1 existing `SheetResult.schema` warning.

**Next item:** Item 26a - `utils/sop_processing/pipeline.py` Stage 1 orchestrator.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 26a Document Uplift pipeline orchestrator

**Plan items addressed:** Item 26a

**Files created:**
- `utils/sop_processing/pipeline.py` - Stage 1 orchestrator that fetches raw inputs from the Document Uplift case store, runs conversion, local chunking, Excel processing, analysis, and persists all results via the store.
- `tests/test_document_uplift_pipeline.py` - Item 26a tests for service sequencing, failure counters, and `TASK_BACKEND` dispatch behavior.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 26a complete and recorded verification.

**Tests written:**
- `tests/test_document_uplift_pipeline.py` - 4 tests, failing before implementation and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\test_document_uplift_pipeline.py -v` failed because `utils.sop_processing.pipeline` was missing.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_pipeline.py -v` passing - 4 passed, 1 existing `SheetResult.schema` warning.

**Next item:** Item 27 - `api/routers/document_uplift.py` router skeleton + case CRUD endpoints, registered in `api/main.py`.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 27 Document Uplift router skeleton

**Plan items addressed:** Item 27

**Files created:**
- `api/routers/document_uplift.py` - new FastAPI router with feature flag guard, case create/list/get/update/delete, upload, run-pipeline, and suggestions list skeleton endpoints.
- `tests/test_document_uplift_api.py` - API tests for the feature flag, router registration, case CRUD, upload GridFS storage, and Stage 1 dispatch.

**Files modified:**
- `api/main.py` - registered the Document Uplift router with `app.include_router(document_uplift_router)`.
- `docs/document-uplift-build-log.md` - marked Item 27 complete and recorded verification.

**Tests written:**
- `tests/test_document_uplift_api.py` - 4 Item 27 tests, failing before implementation and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\test_document_uplift_api.py -v` failed because `api.routers.document_uplift` was missing.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passing - 4 passed, 1 existing `SheetResult.schema` warning.

**Next item:** Item 22 - suggestion review endpoints.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 22 suggestion review endpoints

**Plan items addressed:** Item 22

**Files created:**
- None

**Files modified:**
- `api/routers/document_uplift.py` - added per-suggestion review updates, bulk accept/reject review, reject-all confirmation token enforcement, and the Stage 2 auto-accept helper with warnings.
- `tests/test_document_uplift_api.py` - added Item 22 API tests for PATCH review state, bulk accept-all, reject-all confirmation, and auto-accept warnings.
- `docs/document-uplift-build-log.md` - marked Item 22 complete and recorded verification.

**Tests written:**
- `tests/test_document_uplift_api.py` - 4 Item 22 tests, failing before implementation and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\test_document_uplift_api.py -v` failed with 4 expected Item 22 failures: review routes returned 404 and `auto_accept_pending_suggestions` did not exist.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passing - 8 passed, 1 existing `SheetResult.schema` warning.
- [x] No bare `except: pass` introduced - scan across `api\routers\document_uplift.py` and `tests\test_document_uplift_api.py` returned no matches.
- [x] All new functions have explicit return type annotations - scan across `api\routers\document_uplift.py` and `tests\test_document_uplift_api.py` returned no unannotated definitions.

**Next item:** Checkpoint B - Stage 1 end-to-end verification.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Checkpoint B Stage 1 verification

**Plan items addressed:** Checkpoint B

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Checkpoint B complete and recorded the verification evidence.

**Tests written:**
- None - Checkpoint B used the existing Stage 1 integration-style pipeline test.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_pipeline.py::test_run_pipeline_sequences_services_and_persists_stage1 -v` passing - confirms a case with 1 Word SOP + 1 Excel RCM runs Stage 1, persists `review_status="pending"` suggestions, and stores a non-empty `corpus_map`.
- [x] `python -m pytest tests\services\ -v` passing - 38 passed, 1 existing `SheetResult.schema` warning.
- [x] No bare `except: pass` introduced during the checkpoint.
- [x] All new functions have explicit return type annotations - no new code was added for this checkpoint.

**Next item:** Item 23 - `POST /document-uplift/cases/{case_id}/generate-outputs` endpoint skeleton and Stage 2 dispatch wiring.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Completed Item 23 generate-outputs skeleton

**Plan items addressed:** Item 23

**Files created:**
- `utils/sop_processing/output_generator.py` - Stage 2 output generator stub that explicitly raises `NotImplementedError` until Items 24 and 25.

**Files modified:**
- `api/routers/document_uplift.py` - added `POST /document-uplift/cases/{case_id}/generate-outputs`; it auto-accepts pending suggestions, returns warnings, and dispatches `dispatch_pipeline(case_id, stage=2)`.
- `utils/sop_processing/pipeline.py` - added Stage 2 dispatch handling that fetches the original DOCX procedure bytes and calls the output generator stub without implementing output generation.
- `tests/test_document_uplift_api.py` - added Item 23 endpoint tests for auto-accept + Stage 2 dispatch and explicit 501 stub behavior.
- `tests/test_document_uplift_pipeline.py` - added Item 23 pipeline tests for the output generator stub and Stage 2 call contract.
- `docs/document-uplift-build-log.md` - marked Item 23 complete and recorded verification.

**Tests written:**
- `tests/test_document_uplift_api.py` - 2 Item 23 tests, failing before implementation and passing after implementation.
- `tests/test_document_uplift_pipeline.py` - 2 Item 23 tests, failing before implementation and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\test_document_uplift_api.py -v` failed because `/generate-outputs` returned 404.
- `python -m pytest tests\test_document_uplift_pipeline.py -v` failed because `utils.sop_processing.output_generator` was missing and Stage 2 had no output generator wiring.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passing - 10 passed, 1 existing `SheetResult.schema` warning.
- [x] `python -m pytest tests\test_document_uplift_pipeline.py -v` passing - 6 passed, 1 existing `SheetResult.schema` warning.
- [x] No bare `except: pass` introduced - scan across touched Item 23 files returned no matches.
- [x] All new functions have explicit return type annotations - scan across touched Item 23 files returned no unannotated definitions.

**Next item:** Item 23b - track-changes Word XML POC script and Word 365 verification.

**Blockers:** Human/Word 365 verification will be required by Item 23b before Item 24 begins.

**Plan deviations:** None

---

## [2026-05-06] Started Item 23b track-changes Word XML POC

**Plan items addressed:** Item 23b

**Files created:**
- `tests/poc_track_changes.py` - manual-only POC script that generates a DOCX with `w:ins` and `w:del` revisions for single-run, multi-run, and table-cell edits.
- `output/doc/document_uplift_track_changes_poc.docx` - generated Word 365 verification artifact.

**Files modified:**
- `docs/document-uplift-build-log.md` - marked Item 23b in progress pending human Word 365 verification.

**Tests written:**
- None - per plan, `tests/poc_track_changes.py` is a manual script, not a pytest test.

**Verified:**
- [x] `python tests\poc_track_changes.py` created `output\doc\document_uplift_track_changes_poc.docx` and validated the DOCX package contains at least three `w:ins` and three `w:del` revisions.
- [x] `python -m pytest tests\poc_track_changes.py -q` skipped collection as intended for the manual POC file.
- [ ] Human Word 365 check pending: open the generated DOCX and confirm no repair prompt appears, Review pane shows tracked insertions/deletions, and all three edits can be accepted/rejected.

**Next item:** Finish Item 23b after Word 365 verification. Do not begin Item 24 until this result is recorded.

**Blockers:** Awaiting human/Word 365 verification of `output\doc\document_uplift_track_changes_poc.docx`.

**Plan deviations:** None

---

## [2026-05-06] Completed Item 23b track-changes Word XML POC

**Plan items addressed:** Item 23b

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the human Word 365 verification result and marked Item 23b complete.

**Tests written:**
- None

**Verified:**
- [x] Human verification passed: `output\doc\document_uplift_track_changes_poc.docx` opens in Word 365, shows tracked changes in the Review pane, and the sample changes are working.

**Next item:** Item 24 - `utils/sop_processing/output_generator.py`, after visual mockups for output DOCX/report and diagram concepts are reviewed.

**Blockers:** Mockup review required before visual output/report/diagram implementation.

**Plan deviations:** None

---

## [2026-05-06] Created Item 24/25 output mockups

**Plan items addressed:** Item 24/25 mockup checkpoint

**Files created:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-output-docx-mockup.svg` - static review image for the track-changes Word output direction.
- `docs/superpowers/mockups/2026-05-06-document-uplift-swimlane-diagram-mockup.svg` - static review image for the matplotlib swimlane output direction.
- `docs/superpowers/mockups/2026-05-06-document-uplift-item24-25-output-mockups.md` - review sheet linking both mockups and the approval checklist.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the required pre-implementation visual mockup checkpoint.

**Tests written:**
- None - mockup-only checkpoint.

**Verified:**
- [x] Mockups were created before implementing Item 24/25 visual output code, per human instruction.
- [x] Human approved the remade mockup direction based on the provided Word review and flowchart reference images.

**Next item:** Item 24 - `utils/sop_processing/output_generator.py`.

**Blockers:** None

**Plan deviations:** The approved imagegen mockup is stored as `docs/superpowers/mockups/2026-05-06-document-uplift-reference-approved-output-mockup.png`; earlier SVG mockups remain as review history.

---

## [2026-05-06] Completed Item 24 output generator

**Plan items addressed:** Item 24

**Files created:**
- `tests/sop_processing/test_output_generator.py` - Item 24 tests for track-changes DOCX output, per-change rationale comments, rejected suggestion handling, and standalone DOCX fallback.

**Files modified:**
- `utils/sop_processing/output_generator.py` - replaced the Stage 2 stub with section rewrite calls, track-changes DOCX generation using real `w:ins` / `w:del` XML, Word comments explaining why each change was suggested, StyleProfile application, standalone fallback output, swimlane spec extraction, and GridFS output storage.
- `utils/sop_processing/pipeline.py` - persists Stage 1 `process_steps` so Stage 2 can use the accepted process flow context.
- `tests/test_document_uplift_pipeline.py` - added process-step persistence coverage and retained the Item 25 readiness marker.
- `docs/document-uplift-build-log.md` - marked Item 24 complete and recorded verification.

**Tests written:**
- `tests/sop_processing/test_output_generator.py` - 3 Item 24 tests, failing before implementation and passing after implementation.
- `tests/test_document_uplift_pipeline.py` - 1 added assertion for `process_steps`, failing before implementation and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\sop_processing\test_output_generator.py -v` failed because `get_store` and the output generator implementation did not exist.
- `python -m pytest tests\test_document_uplift_pipeline.py -v` failed because Stage 1 did not persist `process_steps` and the Item 25 readiness flag did not exist.

**Verified:**
- [x] `python -m pytest tests\sop_processing\test_output_generator.py -v` passing - 3 passed, 1 existing `SheetResult.schema` warning.
- [x] `python -m pytest tests\sop_processing\ tests\test_document_uplift_pipeline.py -v` passing - 16 passed, 1 existing `SheetResult.schema` warning.
- [x] No bare `except: pass` introduced - scan across Item 24 files returned no matches.
- [x] All new functions have explicit return type annotations - scan across Item 24 files returned no unannotated definitions.

**Next item:** Item 25 - `utils/sop_processing/diagram_renderer.py` matplotlib swimlane PNG/PDF.

**Blockers:** Local Python environment is missing `matplotlib`; Item 25 will require adding it to requirements and installing it for tests if available.

**Plan deviations:** None

---

## [2026-05-06] Completed Item 25 diagram renderer

**Plan items addressed:** Item 25

**Files created:**
- `utils/sop_processing/diagram_renderer.py` - deterministic matplotlib swimlane renderer producing 300 DPI PNG and PDF bytes with lane bands, action boxes, decision diamonds, arrows, branch labels, and legend.
- `tests/services/test_diagram_renderer.py` - Item 25 tests for nonempty output bytes, valid PNG header, lane labels, and decision branch arrows.

**Files modified:**
- `utils/sop_processing/output_generator.py` - wired rendered swimlane PNG/PDF outputs into Stage 2 GridFS output storage.
- `tests/sop_processing/test_output_generator.py` - added assertions that Stage 2 stores PNG and PDF diagram outputs.
- `tests/test_document_uplift_pipeline.py` - updated the Item 25 readiness assertion.
- `api/requirements.txt` - added `matplotlib==3.10.3` for the FastAPI/container environment.
- `requirements.txt` - added `matplotlib==3.10.3` for local/test environments.
- `docs/document-uplift-build-log.md` - marked Item 25 complete and recorded verification.

**Tests written:**
- `tests/services/test_diagram_renderer.py` - 4 Item 25 tests, failing before implementation and passing after implementation.
- `tests/sop_processing/test_output_generator.py` - 2 integration assertions for stored PNG/PDF diagram outputs, failing before output-generator wiring and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\services\test_diagram_renderer.py -v` first failed because `matplotlib` was missing, then failed because `utils.sop_processing.diagram_renderer` did not exist.
- `python -m pytest tests\sop_processing\test_output_generator.py -v` failed because Stage 2 did not yet store `diagram_png_file_id` or `diagram_pdf_file_id`.

**Verified:**
- [x] `python -m pytest tests\services\test_diagram_renderer.py -v` passing - 4 passed.
- [x] `python -m pytest tests\sop_processing\test_output_generator.py -v` passing - 3 passed, 1 existing `SheetResult.schema` warning.
- [x] `python -m pytest tests\services\ tests\sop_processing\ tests\test_document_uplift_pipeline.py -v` passing - 58 passed, 1 existing `SheetResult.schema` warning.
- [x] No bare `except: pass` introduced - scan across Item 25 files returned no matches.
- [x] All new functions have explicit return type annotations - scan across Item 25 files returned no unannotated definitions.

**Next item:** Item 28 - Settings page Pipeline Controls card, after UI mockup review.

**Blockers:** Human mockup approval required before Item 28 frontend implementation.

**Plan deviations:** None

---

## [2026-05-06] Created Item 28 Settings mockup

**Plan items addressed:** Item 28 mockup checkpoint

**Files created:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-settings-pipeline-controls-mockup.svg` - static review image for the Settings page Pipeline Controls card.
- `docs/superpowers/mockups/2026-05-06-document-uplift-item28-settings-mockup.md` - review sheet linking the mockup and approval checklist.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the required pre-implementation UI mockup checkpoint.

**Tests written:**
- None - mockup-only checkpoint.

**Verified:**
- [x] Mockup created before editing `kpmg_ui/client/src/pages/settings.tsx`, per human instruction.

**Next item:** Await human review of Item 28 mockup, then implement Item 28 after approval.

**Blockers:** Human mockup approval required before Item 28 implementation.

**Plan deviations:** None

---

## [2026-05-06] Latest status after Item 28 implementation

**Plan items addressed:** Item 28

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - latest status entry so resume order is clear after historical Item 28 mockup entries.

**Tests written:**
- None - status entry only.

**Verified:**
- [x] Item 28 is complete.
- [x] Progress tracker marks Item 28 complete.
- [x] The completed Item 28 entry records passing API tests, frontend source test, `npm run check`, and `npm run build`.

**Next item:** Item 29 - create full-page UI mockups for `kpmg_ui/client/src/pages/document-uplift.tsx` before writing TSX.

**Blockers:** Human mockup approval required before Item 29 implementation.

**Plan deviations:** None

---

## [2026-05-06] Rendered Item 29 UI mockups as PNG

**Plan items addressed:** Item 29 mockup checkpoint

**Files created:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-flow-mockups.png` - rendered bitmap image of the Item 29 UI review board.

**Files modified:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-mockups.md` - linked the PNG as the primary mockup image while keeping the SVG as editable source.
- `docs/document-uplift-build-log.md` - recorded the image mockup render.

**Tests written:**
- None - mockup image render only.

**Verified:**
- [x] PNG rendered from the SVG at 1800x2450.
- [x] PNG was visually inspected after rendering.
- [x] No `document-uplift.tsx` TSX implementation has been started pending human review.

**Next item:** Await human review of Item 29 PNG mockup, then implement Item 29 after approval.

**Blockers:** Human mockup approval required before Item 29 implementation.

**Plan deviations:** None

---

## [2026-05-06] Created Item 29 Document Uplift UI mockups

**Plan items addressed:** Item 29 mockup checkpoint

**Files created:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-flow-mockups.svg` - review board covering case list/create, upload/progress, suggestion review, reject-all confirmation, auto-accept warning, outputs, and cost badge.
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-mockups.md` - review sheet and approval checklist.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the mandatory pre-implementation UI mockup checkpoint for Item 29.

**Tests written:**
- None - mockup-only checkpoint.

**Verified:**
- [x] Mockups were created before editing `kpmg_ui/client/src/pages/document-uplift.tsx`, per human instruction.
- [x] Mockups cover the Item 29 surfaces, with SSE progress shown visually but endpoint implementation deferred to Item 30.

**Next item:** Await human review of Item 29 mockups, then implement Item 29 after approval.

**Blockers:** Human mockup approval required before Item 29 implementation.

**Plan deviations:** None

---

## [2026-05-06] Latest status after Item 29 completion

**Plan items addressed:** Item 29

**Files created:**
- None - this status entry points to the full Item 29 completion entry above.

**Files modified:**
- `docs/document-uplift-build-log.md` - added final resume status after historical mockup entries.

**Tests written:**
- None - status-only entry.

**Verified:**
- [x] Item 29 is marked complete in the progress tracker.
- [x] Item 29 implementation verification passed: `node --import tsx .\client\src\document-uplift.item29.test.ts`, `npm run check`, and `npm run build`.

**Next item:** Item 30 - add SSE endpoint to `api/routers/document_uplift.py` and wire `EventSource` in `kpmg_ui/client/src/pages/document-uplift.tsx`.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Paused during Checkpoint C verification

**Plan items addressed:** CHECKPOINT C, TC-05, T3, output download, cost summary verification

**Files created:**
- None in this status-log update.

**Files modified before pause:**
- `utils/services/analysis.py` - added a narrow deterministic cross-document fallback for TC-05-style owner conflicts and mapping gaps when the structured corpus map exposes a SOP/RCM gap that the LLM does not emit.
- `tests/services/test_analysis.py` - added regression coverage for owner-conflict and mapping-gap suggestions with both SOP anchor and RCM row references.
- `utils/sop_processing/output_generator.py` - fixed Word section margin assignment with `Cm(...)`; added process-step swimlane fallback so Stage 2 still produces a diagram when LLM swimlane JSON is empty or invalid.
- `tests/sop_processing/test_output_generator.py` - added regression coverage for centimeter margins and diagram fallback output.
- `api/routers/document_uplift.py` - added `GET /document-uplift/cases/{case_id}/outputs/{output_id}` so generated GridFS artifacts can be downloaded through the API.
- `tests/test_document_uplift_api.py` - added download endpoint coverage.
- `kpmg_ui/client/src/pages/document-uplift.tsx` - added generated-output download links that point to the new API endpoint.
- `kpmg_ui/client/src/document-uplift.item29.test.ts` - updated the frontend source guard to require the output download API path.
- `utils/sop_processing/pipeline.py` - added Stage 1 and final cost summaries using the active LLM config and persisted them in case status.
- `tests/test_document_uplift_pipeline.py` - added cost-summary assertions and corrected the fake fixture expectation to 3 Stage 1 calls, because that fixture has no Excel sheet-level LLM calls.

**Tests written:**
- `tests/services/test_analysis.py` - cross-document fallback regression tests.
- `tests/sop_processing/test_output_generator.py` - margin and diagram-fallback regression tests.
- `tests/test_document_uplift_api.py` - output download regression test.
- `tests/test_document_uplift_pipeline.py` - Stage 1 and final cost-summary assertions.
- `kpmg_ui/client/src/document-uplift.item29.test.ts` - output download source guard.

**Verified so far:**
- [x] `python -m pytest tests\test_document_uplift_pipeline.py -v` passing - 7 passed after the cost fixture correction.
- [x] Earlier Checkpoint C focused runs passed before the pause: `tests\services\test_analysis.py`, `tests\sop_processing\test_output_generator.py`, `tests\test_document_uplift_api.py -k "download_output"`, and `node --import tsx .\client\src\document-uplift.item29.test.ts`.
- [x] Live case `fa7cd113-19d0-4505-b565-cd88ea1835c2` reached Stage 1 `review_ready` with 6 suggestions, including 5 cross-document `mapping_gap` suggestions with both SOP and RCM source references.
- [x] TC-05 structural requirement passed on that live case: at least one suggestion references both a SOP anchor and an RCM row.
- [x] T3 size check passed on that live case after Stage 2: persisted case payload was approximately 127,867 bytes, below the 500KB target.
- [x] Stage 2 produced three GridFS outputs on that live case: uplifted DOCX, PNG swimlane, and PDF swimlane.
- [x] Binary artifact inspection inside the FastAPI container found valid PNG and PDF signatures. DOCX inspection found `word/document.xml`, `word/comments.xml`, `w:ins`, rationale text, and mapping-gap text.
- [ ] Live DOCX did not contain `w:del` because the current live suggestions were additive mapping gaps. Replacement-style `w:del` remains covered by the output-generator unit test.
- [ ] Broad regression suite not yet rerun after the latest cost/download/UI changes.
- [ ] Docker services not yet rebuilt/recreated after the latest code changes.
- [ ] Live case not yet rerun after the cost-summary change to refresh persisted `final_cost`.
- [ ] Manual Word 365 review of the downloaded DOCX remains pending for Checkpoint C.
- [ ] `docs/HANDOFF.md` still needs the final Checkpoint C update.

**Next item:** Resume CHECKPOINT C by running the broader backend/frontend checks, rebuilding/recreating `fastapi_api` and `web_ui_agent`, rerunning Stage 2 on live case `fa7cd113-19d0-4505-b565-cd88ea1835c2`, verifying the download endpoint and live cost summary, then updating `docs/HANDOFF.md`.

**Blockers:** Work intentionally paused by the human. Manual Word 365 review and T8 human usefulness review cannot be completed by the coding agent alone.

**Plan deviations:** None. The deterministic cross-document fallback is intentionally narrow and only supplements the service-based analysis path when structured corpus mappings already prove the gap.

---

## [2026-05-06] Completed Item 30 SSE pipeline progress

**Plan items addressed:** Item 30

**Files created:**
- `kpmg_ui/client/src/document-uplift.item30.test.ts` - frontend source guard requiring the stream endpoint, `EventSource` listeners, cleanup, and human-readable SSE step labels.

**Files modified:**
- `api/routers/document_uplift.py` - added `GET /document-uplift/cases/{case_id}/pipeline/stream` using `yield_sse_event()` from Item 18, with stage, progress, complete, and error events derived from case store state.
- `tests/test_document_uplift_api.py` - added SSE endpoint coverage for `text/event-stream`, stage data, and terminal complete event.
- `kpmg_ui/client/src/pages/document-uplift.tsx` - wired `EventSource` to `/api/document-uplift/cases/${selectedCaseId}/pipeline/stream`, maps SSE steps to readable labels, updates the progress bar, invalidates case/suggestions on complete, and keeps polling as fallback.
- `docs/document-uplift-build-log.md` - marked Item 30 complete and recorded verification.
- `docs/HANDOFF.md` - added Item 30 handoff context.

**Tests written:**
- `tests/test_document_uplift_api.py::test_pipeline_stream_emits_stage_and_complete_events` - failed with 404 before route implementation and passed after SSE wiring.
- `kpmg_ui/client/src/document-uplift.item30.test.ts` - failed before `EventSource` wiring and passed after implementation.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_api.py -k "pipeline_stream" -v` passing.
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passing - 13 passed, existing warnings only.
- [x] `node --import tsx .\client\src\document-uplift.item29.test.ts` passing.
- [x] `node --import tsx .\client\src\document-uplift.item30.test.ts` passing.
- [x] `npm run check` passing.
- [x] `npm run build` passing, with existing PostCSS `from` and large chunk warnings only.

**Next item:** Item 31 - verify cross-document data flow end-to-end from Excel `corpus_map` through analysis and suggestions.

**Blockers:** None

**Plan deviations:** None. The SSE endpoint streams progress from persisted case state and uses the existing polling/refetch path as fallback.

---

## [2026-05-06] Completed Item 31 cross-document data-flow integration

**Plan items addressed:** Item 31

**Files created:**
- None

**Files modified:**
- `tests/test_document_uplift_pipeline.py` - added an integration test that runs the Stage 1 pipeline with a real in-memory Excel RCM processed by `svc.excel` and real `svc.analysis` flow using mocked LLM responses.
- `utils/services/schemas.py` - added optional `AnalysisResult.corpus_map` so analysis can return SOP-derived corpus mappings.
- `utils/services/analysis.py` - derives `sop_to_control_map` from extracted process steps that include control IDs and anchor IDs, while continuing to pass Excel corpus context into procedural extraction and cross-document synthesis.
- `utils/sop_processing/pipeline.py` - merges analysis-derived `sop_to_control_map` with Excel-derived risk/evidence mappings before persisting the case `corpus_map`.
- `docs/document-uplift-build-log.md` - marked Item 31 complete and recorded verification.
- `docs/HANDOFF.md` - added Item 31 handoff context.

**Tests written:**
- `tests/test_document_uplift_pipeline.py::test_cross_document_corpus_map_flows_from_excel_to_analysis` - failed first because `sop_to_control_map` stayed empty, then passed after analysis mappings were merged into the persisted case corpus map.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_pipeline.py -k "cross_document_corpus_map" -v` passing.
- [x] `python -m pytest tests\test_document_uplift_pipeline.py -v` passing - 7 passed, existing warnings only.
- [x] `python -m pytest tests\services\test_analysis.py tests\services\test_excel_pipeline.py -v` passing - 17 passed, existing warning only.
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passing - 13 passed, existing warnings only.

**Next item:** CHECKPOINT C - end-to-end local verification: upload 1 Word SOP + 1 Excel RCM, run Stage 1, review suggestions in UI, trigger Stage 2, verify Word track-changes opens in Word 365, diagram renders, cost badge is correct, Mongo case document is < 500KB, and TC-05 cross-document suggestion is present.

**Blockers:** Checkpoint C includes manual/local runtime checks and Word 365 review.

**Plan deviations:** None

---

## [2026-05-06] Completed Item 29 Document Uplift frontend page

**Plan items addressed:** Item 29

**Files created:**
- `kpmg_ui/client/src/document-uplift.item29.test.ts` - source-level frontend guard for the new route, sidebar entry, required API wiring, and mandatory UI surfaces.
- `kpmg_ui/client/src/pages/document-uplift.tsx` - full Document Uplift page with case explorer/create flow, upload/tag workflow, pipeline controls, suggestion queue, document review editor, source references, reject-all confirmation, generated outputs, cost display, and auto-accepted warning state.

**Files modified:**
- `kpmg_ui/client/src/App.tsx` - registered `/document-uplift` as a new page route.
- `kpmg_ui/client/src/components/AppLayout.tsx` - added the Document Uplift sidebar entry with `NEW` badge and added the SOP Uplift tooltip noting it is superseded by Document Uplift.
- `docs/document-uplift-build-log.md` - marked Item 29 complete and recorded verification.
- `docs/HANDOFF.md` - added Item 29 handoff context.

**Tests written:**
- `kpmg_ui/client/src/document-uplift.item29.test.ts` - 1 source guard, failed before route/page implementation and passed after the page was wired.

**Red phase evidence:**
- `node --import tsx .\client\src\document-uplift.item29.test.ts` failed before implementation because `App.tsx` did not import or route to `DocumentUpliftPage`.
- The same test later caught the exact planned label mismatch (`Upload and Tag Documents`) before final text correction.

**Verified:**
- [x] `node --import tsx .\client\src\document-uplift.item29.test.ts` passing.
- [x] `npm run check` passing.
- [x] `npm run build` passing, with existing PostCSS `from` and large chunk warnings only.
- [x] Mockups were approved before editing `kpmg_ui/client/src/pages/document-uplift.tsx`.

**Next item:** Item 30 - add SSE endpoint to `api/routers/document_uplift.py` and wire `EventSource` in `kpmg_ui/client/src/pages/document-uplift.tsx` for live progress updates.

**Blockers:** None

**Plan deviations:** None. The Item 29 UI shows progress based on polling/refetch state; the real SSE endpoint and `EventSource` wiring remain deferred to Item 30 as specified.

---

## [2026-05-06] Confirmed Item 28 complete after mockup correction

**Plan items addressed:** Item 28

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - added a final Item 28 status note after the historical mockup entries so the latest entry points to Item 29.

**Tests written:**
- None - status correction only.

**Verified:**
- [x] Item 28 implementation and verification are recorded in the preceding "Completed Item 28 Settings Pipeline Controls" entry.
- [x] Progress tracker marks Item 28 complete.

**Next item:** Item 29 - create full-page UI mockups for `kpmg_ui/client/src/pages/document-uplift.tsx` before writing TSX.

**Blockers:** Human mockup approval required before Item 29 implementation.

**Plan deviations:** None

---

## [2026-05-06] Completed Item 28 Settings Pipeline Controls

**Plan items addressed:** Item 28

**Files created:**
- `kpmg_ui/client/src/pages/settings.document-uplift-config.test.ts` - frontend source guard ensuring the Settings page keeps existing cards and adds the Document Uplift controls below LLM Provider.
- `docs/superpowers/mockups/2026-05-06-document-uplift-settings-current-page-option-mockup.svg` - corrected Settings mockup matching the current page and final Item 28 placement.

**Files modified:**
- `api/routers/settings.py` - added `GET /settings/document-uplift-config` and `POST /settings/document-uplift-config`, backed by the MongoDB settings config helper from Item 19.
- `tests/test_document_uplift_api.py` - added Item 28 endpoint coverage for reading and saving `max_llm_calls_per_pipeline`.
- `kpmg_ui/client/src/pages/settings.tsx` - added the Document Uplift Pipeline Controls card below LLM Provider while preserving LLM Provider, LLM Model, context upload, and Navigation Visibility cards.
- `docs/superpowers/mockups/2026-05-06-document-uplift-item28-settings-mockup.md` - marked the corrected mockup as approved and implemented.
- `docs/document-uplift-build-log.md` - marked Item 28 complete and recorded verification.
- `docs/HANDOFF.md` - added Item 28 handoff context.

**Tests written:**
- `tests/test_document_uplift_api.py` - 2 Item 28 API tests, failing with 404 before implementation and passing after endpoint wiring.
- `kpmg_ui/client/src/pages/settings.document-uplift-config.test.ts` - 1 frontend source guard, failing before the card was added and passing after implementation.

**Red phase evidence:**
- `python -m pytest tests\test_document_uplift_api.py -k "document_uplift_config_endpoint" -v` failed with 404 for both new endpoints before router implementation.
- `node --import tsx .\client\src\pages\settings.document-uplift-config.test.ts` failed because the Settings page did not yet contain the Document Uplift Pipeline Controls card.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passing - 12 passed, existing warnings only.
- [x] `python -m pytest tests\test_settings.py tests\test_document_uplift_api.py -v` passing - 36 passed, existing warnings only.
- [x] `node --import tsx .\client\src\pages\settings.document-uplift-config.test.ts` passing.
- [x] `npm run check` passing.
- [x] `npm run build` passing, with existing large chunk/PostCSS warnings.

**Next item:** Item 29 - create full-page UI mockups for `kpmg_ui/client/src/pages/document-uplift.tsx` before writing TSX, then implement after human approval.

**Blockers:** Human mockup approval required before Item 29 frontend implementation.

**Plan deviations:** None. The final mockup was corrected so the card placement matches Item 28 exactly: below LLM Provider.

---

## [2026-05-06] Remade Item 28 Settings mockup from current page screenshots

**Plan items addressed:** Item 28 mockup checkpoint

**Files created:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-settings-current-page-option-mockup.svg` - corrected static review image showing the existing `/settings` page with only one added Document Uplift Pipeline Controls card.

**Files modified:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-item28-settings-mockup.md` - updated the review sheet to link the corrected mockup and mark the earlier redesign-style mockup as superseded.
- `docs/document-uplift-build-log.md` - recorded the correction checkpoint.

**Tests written:**
- None - mockup-only checkpoint.

**Verified:**
- [x] Corrected mockup preserves existing LLM Provider, LLM Model, General Context, Company Policy Context, and Navigation Visibility sections.
- [x] Mockup was later approved by the human and Item 28 was implemented; see the completed Item 28 entry above.

**Next item:** Item 29 - create full-page UI mockups for `kpmg_ui/client/src/pages/document-uplift.tsx` before writing TSX.

**Blockers:** Human mockup approval required before Item 29 implementation.

**Plan deviations:** None

---

## [2026-05-06] Latest status after Item 29 mockup checkpoint

**Plan items addressed:** Item 29 mockup checkpoint

**Files created:**
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-flow-mockups.svg` - review board covering all Item 29 UI surfaces.
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-flow-mockups.png` - rendered bitmap image of the Item 29 UI review board.
- `docs/superpowers/mockups/2026-05-06-document-uplift-item29-ui-mockups.md` - review sheet and approval checklist.

**Files modified:**
- `docs/document-uplift-build-log.md` - latest status entry so resume order is clear after historical Item 28 entries.

**Tests written:**
- None - mockup-only checkpoint.

**Verified:**
- [x] Item 28 is complete.
- [x] Item 29 mockups exist and parse as SVG.
- [x] Item 29 PNG mockup rendered at 1800x2450 and was visually inspected.
- [x] No `document-uplift.tsx` TSX implementation has been started pending human review.

**Next item:** Await human review of Item 29 mockups, then implement Item 29 after approval.

**Blockers:** Human mockup approval required before Item 29 implementation.

**Plan deviations:** None

---

## [2026-05-06] Latest status after Item 29 completion

**Plan items addressed:** Item 29

**Files created:**
- None - this status entry points to the full Item 29 completion entry above.

**Files modified:**
- `docs/document-uplift-build-log.md` - added final resume status after historical mockup entries.

**Tests written:**
- None - status-only entry.

**Verified:**
- [x] Item 29 is marked complete in the progress tracker.
- [x] Item 29 implementation verification passed: `node --import tsx .\client\src\document-uplift.item29.test.ts`, `npm run check`, and `npm run build`.

**Next item:** Item 30 - add SSE endpoint to `api/routers/document_uplift.py` and wire `EventSource` in `kpmg_ui/client/src/pages/document-uplift.tsx`.

**Blockers:** None

**Plan deviations:** None

---

## [2026-05-06] Latest resume status after Checkpoint C pause

**Plan items addressed:** CHECKPOINT C status update

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - added the current resume point after the Checkpoint C pause.

**Tests written:**
- None - documentation status update only.

**Verified:**
- [x] Progress tracker marks CHECKPOINT C as `in progress`.
- [x] Detailed Checkpoint C status is recorded above in `Paused during Checkpoint C verification`.

**Next item:** Resume CHECKPOINT C from broad backend/frontend regression checks, Docker rebuild/recreate, live Stage 2 rerun for case `fa7cd113-19d0-4505-b565-cd88ea1835c2`, download endpoint verification, live cost-summary verification, and `docs/HANDOFF.md` update.

**Blockers:** Work intentionally paused by the human. Manual Word 365 review and T8 human usefulness review remain human gates.

**Plan deviations:** None

---

## [2026-05-07] Automated Checkpoint C verification after resume

**Plan items addressed:** CHECKPOINT C automated/runtime verification, TC-05, T3, output download, cost badge

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded fresh Checkpoint C automated verification and updated the progress tracker.
- `docs/HANDOFF.md` - added the Checkpoint C automated verification handoff note.

**Tests written:**
- None in this resume step; this was verification and documentation.

**Verified:**
- [x] `python -m pytest tests\services\test_analysis.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\test_document_uplift_api.py tests\test_document_uplift_pipeline.py tests\test_settings.py -v` passing - 70 passed, existing warnings only.
- [x] `node --import tsx .\client\src\document-uplift.item29.test.ts` passing.
- [x] `node --import tsx .\client\src\document-uplift.item30.test.ts` passing.
- [x] `node --import tsx .\client\src\pages\settings.document-uplift-config.test.ts` passing.
- [x] `npm run check` passing.
- [x] `npm run build` passing, with existing PostCSS `from` and large chunk warnings.
- [x] `docker compose build fastapi_api web_ui_agent` completed.
- [x] `DOCUMENT_UPLIFT_ENABLED=true docker compose up -d --force-recreate fastapi_api web_ui_agent` completed; `docker compose ps` showed FastAPI and Web UI healthy.
- [x] Live case `fa7cd113-19d0-4505-b565-cd88ea1835c2` Stage 1 rerun reached `review_ready` with `stage1_cost.call_count = 13`.
- [x] Live Stage 2 rerun completed with `final_cost.call_count = 19`, `provider = gemini`, and `model = gemini-3-flash-preview`.
- [x] TC-05 passed on the live case: 6 total suggestions, 5 cross-document mapping-gap suggestions, each with SOP + RCM references.
- [x] Generated outputs persisted in GridFS: DOCX, PNG swimlane, and PDF swimlane.
- [x] Download endpoint returned HTTP 200 for all three outputs: DOCX 18,977 bytes, PNG 507,291 bytes, PDF 32,249 bytes.
- [x] T3 passed with direct Mongo BSON size check: `document_uplift_cases` document is 28,436 bytes, below the 500KB target.
- [x] GridFS artifact inspection found valid PNG/PDF signatures. DOCX inspection found `word/document.xml`, `word/comments.xml`, `w:ins`, and rationale comments.
- [ ] Live DOCX still has no `w:del` because the accepted live suggestions are additive mapping-gap insertions. Replacement/deletion markup remains covered by the output-generator unit test.
- [ ] Manual Word 365 visual review of the downloaded DOCX remains pending.
- [ ] T8 human usefulness review remains pending.

**Next item:** Human opens the downloaded DOCX in Word 365 and confirms review pane/formatting, then T8 human rates 3 suggestions. After those gates, proceed to Item 32 - Celery + Redis Docker Compose wiring.

**Blockers:** Word 365 manual visual review and T8 usefulness review require the human.

**Plan deviations:** None. The Stage 1 HTTP request exceeded the shell timeout, but the backend job continued and completed successfully; no second Stage 1 run was launched.

---

## [2026-05-07] Drafted domain-agnostic analysis addendum

**Plan items addressed:** Checkpoint C remediation design before Item 32

**Files created:**
- `docs/superpowers/specs/2026-05-07-document-uplift-domain-agnostic-analysis-design.md` - draft design addendum for broadening Document Uplift analysis beyond RCM-shaped fields.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the addendum and proposed quality gate.

**Tests written:**
- None yet - this is the design/spec step before implementation planning.

**Verified:**
- [x] Addendum preserves the existing Document Uplift service architecture.
- [x] Addendum keeps Document Uplift independent from `utils/sop_uplift/`.
- [x] Addendum adds automated test cases TC-13 through TC-18.
- [x] Addendum adds human quality Tollgate T9 for cross-domain suggestion quality.

**Next item:** Human reviews the addendum. If approved, write the detailed implementation plan for the Checkpoint C remediation, then implement before Item 32.

**Blockers:** Human review of the addendum is required before implementation planning.

**Plan deviations:** Proposed sequencing adjustment only: insert a Checkpoint C remediation before Item 32 so the analysis model is domain-agnostic before Celery/Redis infrastructure is built.

---

## [2026-05-07] Revised addendum after pattern-matching review

**Plan items addressed:** Checkpoint C remediation design review

**Files created:**
- None

**Files modified:**
- `docs/superpowers/specs/2026-05-07-document-uplift-domain-agnostic-analysis-design.md` - revised the pattern section to avoid hardcoded checklist behavior while adding implementation-grade detection contracts.
- `docs/document-uplift-build-log.md` - recorded the review response.

**Tests written:**
- None yet - this remains the design/spec review step before implementation planning.

**Verified:**
- [x] Added detection method types and confidence requirements.
- [x] Reframed the pattern table as a seed registry plus discovery pass, not hardcoded if/else logic.
- [x] Added `SourceReference`, `EntityType`, and `NormalizedFinding.confidence` to the design.
- [x] Added threshold/disambiguation rules and TC-19 clean-document precision test.
- [x] Preserved the rule that domain is metadata, not control flow.

**Next item:** Human reviews the revised addendum. If approved, write the detailed implementation plan for the Checkpoint C remediation before implementation.

**Blockers:** Human review of the revised addendum is required before implementation planning.

**Plan deviations:** Proposed sequencing adjustment only: insert the domain-agnostic Checkpoint C remediation before Item 32.

---

## [2026-05-07] Implemented domain-agnostic analysis addendum

**Plan items addressed:** Checkpoint C remediation addendum before Item 32

**Files created:**
- `docs/document-uplift-severity-calculation.md` - focused severity/confidence calculation reference for the addendum implementation.
- `docs/superpowers/plans/2026-05-07-document-uplift-domain-agnostic-analysis-implementation-plan.md` - task-by-task implementation plan for the addendum.
- `tests/services/test_severity.py` - confidence/severity helper coverage.
- `tests/services/test_semantic_roles.py` - semantic field-role classifier coverage.
- `tests/services/test_generic_findings.py` - normalized fact/finding and discovery-routing coverage.
- `kpmg_ui/client/src/document-uplift.severity.test.ts` - frontend severity vocabulary guard.
- `utils/services/severity.py` - deterministic confidence band and severity calculation helpers.
- `utils/services/semantic_roles.py` - semantic role classifier with raw attribute preservation.
- `utils/services/generic_findings.py` - normalized fact generation, seed finding detection, discovery routing, and suggestion mapping.

**Files modified:**
- `docs/superpowers/specs/2026-05-07-document-uplift-domain-agnostic-analysis-design.md` - kept as the implemented addendum to the original Document Uplift plan.
- `utils/services/schemas.py` - added `DocumentFact`, `NormalizedFinding`, `DiscoveryCandidate`, expanded severity vocabulary, richer source references, optional corpus-map extensions, and `agent_follow_up_questions`.
- `utils/services/excel_pipeline.py` - preserved raw structured-row attributes and semantic roles, emitted normalized facts, and added generic suggestions for non-RCM structured documents.
- `utils/services/analysis.py` - preserved full severity vocabulary for LLM suggestions and tolerated unknown raw suggestion categories by mapping them to `process_improvement`.
- `utils/sop_processing/case_store.py` - added `document_uplift_facts` persistence outside the case document plus memory fallback helpers.
- `utils/sop_processing/pipeline.py` - persisted normalized facts, merged generic finding summaries, and kept low-confidence follow-up questions out of uplift suggestions.
- `kpmg_ui/client/src/pages/document-uplift.tsx` - added `critical` and `informational` severity badge/sort support.
- `docs/document-uplift-build-log.md` - recorded implementation and added the T9 human gate to the tracker.
- `docs/HANDOFF.md` - recorded the addendum implementation handoff.

**Tests written:**
- Added/expanded tests for severity bands, schema contracts, semantic role classification, generic fact/finding detection, Excel raw-attribute preservation, analysis severity parsing, pipeline fact persistence, and frontend severity display.

**Verified:**
- [x] `python -m pytest tests\services\test_severity.py tests\services\test_schemas.py tests\services\test_semantic_roles.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\services\test_analysis.py tests\test_document_uplift_pipeline.py tests\test_document_uplift_api.py tests\test_settings.py -v` passed: 92 passed.
- [x] `node --import tsx .\client\src\document-uplift.item29.test.ts` passed.
- [x] `node --import tsx .\client\src\document-uplift.item30.test.ts` passed.
- [x] `node --import tsx .\client\src\document-uplift.severity.test.ts` passed.
- [x] `npm run check` passed.
- [x] `npm run build` passed with existing PostCSS `from` and chunk-size warnings.

**Next item:** Original plan gates remain next: manual Word 365 review, T8 human usefulness review, new T9 cross-domain usefulness review, then Item 32 Celery + Redis Docker Compose wiring.

**Blockers:** Human gates remain required before permanent enablement and before treating Checkpoint C as fully complete.

**Plan deviations:** The addendum was inserted before Item 32 to remediate Checkpoint C quality breadth. Per human instruction, the full overall architecture/components/processes document is deferred until the original plan is complete.

---

## [2026-05-07] Hardened addendum contracts after second review

**Plan items addressed:** Checkpoint C remediation design review

**Files created:**
- None

**Files modified:**
- `docs/superpowers/specs/2026-05-07-document-uplift-domain-agnostic-analysis-design.md` - added severity/confidence bands, semantic role classifier mechanism, discovery pass inputs/outputs, target anchor fields, follow-up routing, and additional precision/disambiguation tests.
- `docs/document-uplift-build-log.md` - recorded the second review response.

**Tests written:**
- None yet - design/spec review only.

**Verified:**
- [x] Severity vocabulary and confidence bands are defined.
- [x] Semantic field-role classifier mechanism is specified without relying on hardcoded field names.
- [x] Discovery pass contract now defines inputs, output schema, routing rules, and confidence behavior.
- [x] `target_anchor_id` and `normalized_entity_name` are included in `NormalizedFinding`.
- [x] Follow-up routing uses the existing `agent_follow_up_questions` field and excludes low-confidence candidates from the suggestion queue and Word output.
- [x] Added TC-20, TC-21, and TC-22 for blank-vs-N/A, segregation-of-duties, and discovery follow-up routing.

**Next item:** Human reviews the hardened addendum. If approved, write the implementation plan for the Checkpoint C remediation.

**Blockers:** Human review of the hardened addendum is required before implementation planning.

**Plan deviations:** Proposed sequencing adjustment only: insert the domain-agnostic Checkpoint C remediation before Item 32.

---

## [2026-05-07] Current status after addendum implementation

**Plan items addressed:** Checkpoint C remediation addendum status correction

**Files created:**
- None

**Files modified:**
- `docs/document-uplift-build-log.md` - made the latest entry reflect that the addendum has now been implemented and verified.
- `docs/superpowers/plans/2026-05-07-document-uplift-domain-agnostic-analysis-implementation-plan.md` - marked addendum tasks complete and deferred the full final architecture document until the original plan is complete.
- `docs/HANDOFF.md` - added the addendum implementation handoff entry.

**Tests written:**
- None in this log correction step.

**Verified:**
- [x] The addendum implementation entry records the 92-test backend run and frontend/typecheck/build verification.
- [x] The implementation plan no longer instructs agents to create `docs/document-uplift-architecture.md` before the original plan is complete.
- [x] The progress tracker includes the completed domain-agnostic remediation and the new T9 human gate.

**Next item:** Original-plan gates remain next: manual Word 365 review, T8 human usefulness review, T9 cross-domain usefulness review, then Item 32 Celery + Redis Docker Compose wiring.

**Blockers:** Human gates are still required before treating Checkpoint C as fully complete.

**Plan deviations:** None beyond the approved addendum sequencing before Item 32. The final overall architecture document remains deferred until the original plan is complete.

---

## [2026-05-07] Completed Items 32 and 33 infrastructure queueing

**Plan items addressed:** Items 32 and 33

**Files created:**
- `utils/sop_processing/celery_app.py` - Celery app configuration, queue routes, document pipeline task, and small-result service task wrappers.
- `tests/test_document_uplift_infrastructure.py` - source/config coverage for Redis, Celery worker wiring, requirements, and Celery route declarations.

**Files modified:**
- `utils/sop_processing/pipeline.py` - replaced the interim asyncio dispatch path with a bounded `AsyncPipelineQueue`, duplicate-case protection, back-pressure errors, graceful shutdown, and `run_in_executor` worker execution.
- `utils/sop_processing/case_store.py` - marks stale running Document Uplift jobs as failed on next case fetch after `DOCUMENT_UPLIFT_PIPELINE_TIMEOUT_SECONDS`.
- `api/main.py` - starts/stops the in-process async Document Uplift queue in FastAPI lifespan when `TASK_BACKEND=asyncio`.
- `api/routers/document_uplift.py` - maps duplicate-job and queue-full dispatch errors to HTTP 409/429.
- `docker-compose.yml` - added Redis and `celery_worker`, plus Celery broker/result backend and async queue environment settings.
- `api/requirements.txt` and `requirements.txt` - added `celery` and `redis` client dependencies.
- `tests/test_document_uplift_pipeline.py` - replaced the celery-stub/inline-asyncio expectations with queue, back-pressure, executor, and stale-job tests.
- `docs/document-uplift-build-log.md` - marked Items 32 and 33 complete.
- `docs/HANDOFF.md` - recorded the infrastructure queueing handoff.

**Tests written:**
- Added coverage for celery dispatch enqueueing, Docker Compose Redis/Celery wiring, Celery route declarations, async queue duplicate rejection, queue-full rejection, worker `run_in_executor`, and stale-running-job timeout.

**Verified:**
- [x] `python -m pytest tests\test_document_uplift_pipeline.py -v` passed: 12 passed.
- [x] `python -m pytest tests\test_document_uplift_infrastructure.py -v` passed: 3 passed.
- [x] `python -m pytest tests\test_document_uplift_api.py -v` passed: 14 passed.
- [x] `python -m pytest tests\services\test_severity.py tests\services\test_schemas.py tests\services\test_semantic_roles.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\services\test_analysis.py tests\test_document_uplift_pipeline.py tests\test_document_uplift_infrastructure.py tests\test_document_uplift_api.py tests\test_settings.py -v` passed: 99 passed.
- [x] `node --import tsx .\client\src\document-uplift.item29.test.ts` passed.
- [x] `node --import tsx .\client\src\document-uplift.item30.test.ts` passed.
- [x] `node --import tsx .\client\src\document-uplift.severity.test.ts` passed.
- [x] `npm run check` passed.
- [x] `npm run build` passed with existing PostCSS `from` and chunk-size warnings.
- [x] `docker compose config --quiet` passed.
- [x] `docker compose --dry-run build fastapi_api celery_worker` passed.

**Next item:** Human gates remain: manual Word 365 review, T8 suggestion usefulness review, and T9 cross-domain usefulness review. After those gates, create the final overall Document Uplift architecture/components/processes document.

**Blockers:** T8/T9 and Word 365 review require the human reviewer. `DOCUMENT_UPLIFT_ENABLED` must remain `false` in committed config until T8 passes.

**Plan deviations:** None for Items 32/33. Celery service wrappers return small status/reference payloads only; the full end-to-end Celery dispatch enqueues the shared pipeline task so API processes still do zero pipeline work in celery mode.

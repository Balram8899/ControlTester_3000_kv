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
| — | — | **CHECKPOINT C** — Word track-changes opens in Word 365, diagram renders, cost badge correct, `document_uplift_cases` doc < 500KB (T3), TC-05 passing | complete - human Word 365 gate confirmed 2026-05-11 |
| -- | B addendum | Checkpoint C domain-agnostic analysis remediation: normalized facts, semantic roles, seed findings, discovery routing, severity bands, and T9 tests | complete |
| 32 | B | Celery + Redis Docker Compose wiring (`TASK_BACKEND=celery`) | complete |
| 33 | B | Full asyncio worker queue + `run_in_executor` for all blocking I/O | complete |
| — | — | **T8 GATE** — human reviews 3 suggestions, ≥ 2 rated useful → set `DOCUMENT_UPLIFT_ENABLED=true` | complete - human usefulness gate confirmed 2026-05-11 |
| -- | -- | **T9 GATE** - human reviews cross-domain suggestions against at least 3 different document roles/domains; >= 70% useful | complete - human cross-domain usefulness gate confirmed 2026-05-11 |

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

---

## [2026-05-07] Word 365 review remediation for DOCX comments and placement

**Plan items addressed:** Manual Word 365 review feedback after Items 32/33

**Files created:**
- None

**Files modified:**
- `utils/sop_processing/output_generator.py` - made DOCX placement source-agnostic and more practical:
  - uses `target_anchor_id` first when present;
  - chooses the best matching extracted process step from suggestion text when no explicit target exists;
  - uses rewritten/proposed text to fuzzy-match real SOP paragraphs before falling back to weak source anchors;
  - avoids matching tiny header/table fragments such as `Date` as edit anchors;
  - removes `Suggested addition:` fallback text;
  - strips Markdown headings and label-style LLM output from Word insertions;
  - resolves source document filenames from case uploads so comments show document names rather than internal file IDs;
  - suppresses internal anchor IDs in comments.
- `utils/sop_processing/pipeline.py` - passes case `document_tags` into Stage 2 so older persisted suggestions can resolve source filenames during output generation.
- `utils/services/schemas.py` - added optional `target_anchor_id` to `Suggestion`.
- `utils/services/generic_findings.py` - propagates `target_anchor_id` from normalized findings into suggestions.
- `utils/services/analysis.py` - preserves richer `SourceReference` metadata and sets `target_anchor_id` on cross-document fallback suggestions.
- `utils/services/excel_pipeline.py` - carries uploaded workbook filenames into corpus-map rows and Excel gap suggestions.
- `tests/sop_processing/test_output_generator.py` - added regression coverage for anchor-aware placement, non-control source placement, source filename resolution, best-step matching, Markdown/prose cleanup, and short-header guardrails.
- `docs/document-uplift-build-log.md` - recorded this remediation.

**Tests written:**
- `test_generate_outputs_places_addition_near_anchor_and_hides_internal_anchor_ids`
- `test_generate_outputs_places_non_control_source_addition_near_target_anchor`
- `test_generate_outputs_resolves_source_filenames_from_case_document_tags`
- `test_generate_outputs_uses_best_process_step_when_target_anchor_is_missing`
- `test_generate_outputs_sanitizes_markdown_rewrite_into_sop_prose`
- `test_generate_outputs_does_not_anchor_additions_to_short_header_fragments`

**Verified:**
- [x] `python -m pytest tests\sop_processing\test_output_generator.py -q` passed: 11 passed.
- [x] `python -m pytest tests\test_document_uplift_api.py tests\test_document_uplift_pipeline.py tests\test_document_uplift_infrastructure.py -q` passed: 29 passed.
- [x] `python -m pytest tests\services\test_generic_findings.py tests\services\test_schemas.py tests\services\test_analysis.py -q` passed earlier in this remediation after schema/analysis/source metadata changes: 25 passed.
- [x] `docker compose build fastapi_api` passed.
- [x] `DOCUMENT_UPLIFT_ENABLED=true TASK_BACKEND=asyncio docker compose up -d --force-recreate fastapi_api` recreated a healthy FastAPI container.
- [x] Live case `fa7cd113-19d0-4505-b565-cd88ea1835c2` Stage 2 regeneration completed and produced 3 outputs.
- [x] Downloaded DOCX inspection found:
  - 5 comments;
  - no `anchor` wording in `word/comments.xml`;
  - no internal file UUIDs in comments;
  - no `Suggested addition` fallback text in `word/document.xml`;
  - no Markdown `###` heading markers in inserted text;
  - 5 `w:ins` insertions and 1 `w:del` deletion where fuzzy replacement was appropriate.
- [x] Comment source references now show readable sources such as `WM_Client_Onboarding_KYC_SOP_v3.1.docx` and `WM_Risk_Controls_Matrix.xlsx - Risk Control Matrix row 13`.

**Known unrelated verification note:**
- A full `python -m pytest tests/ -q` run earlier in this remediation reported 353 passed and 4 failures in unrelated legacy/settings tests:
  - `tests/test_regulatory_comparison_performance.py::test_control_extractor_processes_one_chunk_per_request`
  - `tests/test_regulatory_comparison_performance.py::test_control_extractor_truncates_large_chunk_text_in_prompt`
  - `tests/test_settings.py::test_get_llm_builds_kimi_with_openai_compatible_endpoint_and_thinking_flag`
  - `tests/test_settings.py::test_get_llm_builds_deepseek_v4_pro_with_openai_compatible_endpoint`
  These files/modules were not modified by this remediation.

**Next item:** Human opens the regenerated DOCX in Word 365 from the Document Uplift output link and confirms track changes/comments appear in acceptable locations. T8 and T9 human usefulness gates remain pending before treating the original plan as fully complete.

**Blockers:** Final visual placement and usefulness require human review in Word 365.

**Plan deviations:** None. This was a remediation from the required Word 365 review gate; the implementation remains domain-agnostic and does not hardcode RCM/KYC-specific placement.

---

## [2026-05-07] Holistic edit-target model for coordinated SOP uplift

**Plan items addressed:** Word 365/T8 remediation feedback on suggestion quality and placement; keeps the original cross-document uplift plan domain-agnostic.

**Files modified:**
- `utils/services/schemas.py` - added `SuggestionEditTarget` and `edit_targets` so one finding can produce multiple coordinated edits.
- `utils/services/analysis.py` - mapping-gap fallback now emits procedure and responsibility edit targets when the primary SOP contains a responsibility/RACI-like area, while keeping source/control identifiers in metadata/comments rather than target prose.
- `utils/sop_processing/output_generator.py` - Stage 2 now flattens accepted edit targets into separate Word tracked changes, each with its own target text/anchor and comment.
- `kpmg_ui/client/src/pages/document-uplift.tsx` - review UI now shows multi-target suggestions as `Uplift Targets` and hides internal anchor IDs from source labels.
- `kpmg_ui/client/src/document-uplift.item29.test.ts` - static UI contract now checks for the target review surface.
- Tests updated in `tests/services/test_schemas.py`, `tests/services/test_analysis.py`, and `tests/sop_processing/test_output_generator.py`.

**Tests written:**
- Schema test for `SuggestionEditTarget` and `Suggestion.edit_targets`.
- Analysis regression proving a cross-document mapping gap can produce both `procedure_step` and `role_responsibility` targets without putting source/control IDs in target prose.
- Output regression proving one accepted suggestion can create separate Word insertions in distinct document areas.

**Verified:**
- [x] `python -m pytest tests/services/test_schemas.py tests/services/test_analysis.py tests/sop_processing/test_output_generator.py -q` passed: 32 passed.
- [x] `python -m pytest tests/sop_processing/test_output_generator.py -q` passed: 12 passed.
- [x] `node --import tsx .\client\src\document-uplift.item29.test.ts` passed after elevated rerun because sandboxed `tsx` hit `spawn EPERM`.
- [x] `node --import tsx .\client\src\document-uplift.severity.test.ts` passed.
- [x] `npm run check` passed.
- [x] `docker compose build fastapi_api web_ui_agent` passed. Build retained existing PostCSS `from` and large chunk warnings.
- [x] `DOCUMENT_UPLIFT_ENABLED=true TASK_BACKEND=asyncio docker compose up -d --force-recreate fastapi_api web_ui_agent` completed.
- [x] `docker compose ps` shows `fastapi_api` and `web_ui_agent` healthy.
- [x] `GET http://localhost:5000/api/document-uplift/cases` returned cases, confirming the local feature flag is enabled.

**Current behavior:**
- New analysis runs can store holistic suggestion bundles.
- Accepting a bundled suggestion generates separate tracked changes for each accepted target.
- Existing saved cases/suggestions created before this change do not have `edit_targets`; rerun analysis is required for those cases to gain holistic targets.
- Target-level text editing in the UI is intentionally not added yet; bundled suggestions can be accepted or rejected as a bundle in this pass.

**Next item:** Rerun analysis on the sample case and review a fresh Word 365 output for coordinated procedure/responsibility placement. T8/T9 human usefulness gates remain pending before the original plan is considered complete.

**Plan deviations:** None. This is a domain-neutral extension of the planned cross-document suggestion model; it avoids KYC/RCM-specific placement rules and supports financial, operational, technology, cyber, and other domains through target types rather than hardcoded content.

---

## [2026-05-07] Reran Stage 1 analysis with holistic edit targets

**Plan items addressed:** Word 365/T8 remediation verification for coordinated procedure/responsibility placement.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the live rerun result and next pickup point.

**Verified:**
- [x] `POST /api/document-uplift/cases/fa7cd113-19d0-4505-b565-cd88ea1835c2/run-pipeline` returned `queued` with `TASK_BACKEND=asyncio`.
- [x] Case reached `status.stage="review_ready"`.
- [x] Stage 1 used Gemini `gemini-3-flash-preview` with `call_count=13`.
- [x] Fresh analysis produced 17 pending suggestions.
- [x] 6 suggestions include holistic `edit_targets`.
- [x] Those 6 bundled suggestions each include `procedure_step` and `role_responsibility` targets, confirming the generic coordinated-edit model is active on new analysis output.

**Next item:** Review the refreshed suggestions in the UI, accept/reject/edit as needed, then regenerate Stage 2 outputs and open the new DOCX in Word 365 to confirm coordinated procedure/responsibility placements. T8 and T9 human gates remain pending.

**Blockers:** Word 365 placement review, T8 usefulness review, and T9 cross-domain usefulness review require the human reviewer.

**Plan deviations:** None.

---

## [2026-05-07] Generated refreshed Word output for review

**Plan items addressed:** Word 365/T8 remediation verification for coordinated procedure/responsibility placement.

**Files created:**
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-holistic-rerun.docx` - downloaded refreshed Stage 2 Word output from the Document Uplift API.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the generated review artifact.

**Verified:**
- [x] `POST /api/document-uplift/cases/fa7cd113-19d0-4505-b565-cd88ea1835c2/generate-outputs` returned `queued` and auto-accepted 17 pending suggestions for output generation.
- [x] Case reached `status.stage="complete"`.
- [x] Stage 2 final cost summary reports Gemini `gemini-3-flash-preview` with `call_count=36`.
- [x] Downloaded DOCX package inspection found 22 tracked insertions, 7 tracked deletions, and 22 comments.
- [x] Comments contain no `anchor` wording.
- [x] Document XML contains no `Suggested addition` fallback text and no Markdown `###` heading markers.

**Next item:** Human opens `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-holistic-rerun.docx` in Word 365 and confirms placement, formatting, comments, and review pane behavior. T8 and T9 human usefulness gates remain pending.

**Blockers:** Word 365 visual review, T8 usefulness review, and T9 cross-domain usefulness review require the human reviewer.

**Plan deviations:** None.

---

## [2026-05-07] Added red tests for document-aware output compiler

**Plan items addressed:** Checkpoint C / Word 365 remediation for document-aware Stage 2 output quality.

**Files created:**
- `docs/superpowers/specs/2026-05-07-document-uplift-document-aware-output-compiler-design.md` - domain-neutral design addendum for the document-aware output compiler.
- `tests/sop_processing/test_document_aware_output_compiler.py` - red tests for structural Word output behavior.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the design addendum and failing test evidence.

**Tests written:**
- `test_document_aware_output_updates_responsibility_cell_not_role_cell`
- `test_document_aware_output_reuses_existing_section_and_splits_heading_from_body`
- `test_document_aware_comments_use_specific_change_titles_not_generic_target_labels`

**Red phase evidence:**
- `python -m pytest tests\sop_processing\test_document_aware_output_compiler.py -q` failed as expected: 3 failed.
- Failure 1 confirms responsibility text is currently inserted into a role-name cell.
- Failure 2 confirms heading/body text is currently inserted as one unsafe paragraph with duplicate section wording.
- Failure 3 confirms target-level comments currently use generic labels instead of the specific parent change title.

**Next item:** Implement the document-aware output compiler remediation test-by-test, starting with table/role responsibility placement.

**Blockers:** None for implementation. Word 365 visual review and T8/T9 human usefulness gates remain after regenerated output.

**Plan deviations:** None. The tests are domain-neutral and use generic operations/technology wording rather than KYC or RCM-specific logic.

---

## [2026-05-07] Implemented document-aware output compiler green path

**Plan items addressed:** Checkpoint C / Word 365 remediation for document-aware Stage 2 output quality, plus the original plan's track-changes output and human-review readiness requirements.

**Files created:**
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-document-aware-v4.docx` - final regenerated Word output for review.

**Files modified:**
- `utils/sop_processing/output_generator.py` - added document-aware placement for role/responsibility updates, including responsibility tables and bullet/prose responsibility blocks; blocked fallback placement into role-name cells; improved comments, heading cleanup, active-voice responsibility text, and source labels.
- `tests/sop_processing/test_document_aware_output_compiler.py` - added regression coverage for role-table placement, bullet responsibility placement, heading/body splitting, comment titles/source labels, passive-to-active responsibility wording, and clause-boundary truncation.
- `tests/sop_processing/test_output_generator.py` - aligned existing holistic-output expectations with concise responsibility wording.
- `docs/superpowers/specs/2026-05-07-document-uplift-document-aware-output-compiler-design.md` - captured the domain-neutral design addendum.
- `docs/document-uplift-build-log.md` - recorded implementation and verification status.

**Verified:**
- [x] Red phase: `python -m pytest tests\sop_processing\test_document_aware_output_compiler.py -q` failed as expected before implementation.
- [x] Green phase: `python -m pytest tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 7 passed.
- [x] Adjacent regression suite passed: `python -m pytest tests\services\test_schemas.py tests\services\test_analysis.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 39 passed.
- [x] `docker compose build fastapi_api` passed.
- [x] FastAPI was recreated with `DOCUMENT_UPLIFT_ENABLED=true` and `TASK_BACKEND=asyncio`.
- [x] Live Stage 2 generation for case `fa7cd113-19d0-4505-b565-cd88ea1835c2` reached `status.stage="complete"` with Gemini `gemini-3-flash-preview`, final `call_count=36`.
- [x] Final DOCX XML inspection found 22 tracked insertions, 0 insertions in role-name cells, 6 responsibility-cell insertions, no retained-evidence blobs in responsibility cells, no `responsible for ensuring that` phrasing, no `Owns all` fallback phrasing, no duplicate numbered-heading insertions, no generic comment prefixes, and no `anchor` wording in comments.

**Current review artifact:** `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-document-aware-v4.docx`.

**Next item:** Human opens the final DOCX in Word 365 and reviews visual placement, track changes, comments, and whether responsibility updates are substantively appropriate. T8 and T9 human usefulness gates remain pending.

**Blockers:** Word 365 visual review, T8 usefulness review, and T9 cross-domain usefulness review require the human reviewer.

**Plan deviations:** None. The implementation remains domain-neutral: it keys off document structure, target type, comments/source metadata, and generic grammar patterns, not KYC, RCM, or control-specific hardcoding.

---

## [2026-05-07] Fixed reference-table placement and orthogonal swimlane output

**Plan items addressed:** Stage 2 output quality, diagram export quality, Word 365 review remediation, and accepted-state output correctness.

**Files created:**
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-document-aware-v7.docx` - regenerated Word output after reference-table placement guard.
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v7.png` - regenerated swimlane PNG with orthogonal connector routing.
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v7.pdf` - regenerated swimlane PDF with orthogonal connector routing.

**Files modified:**
- `utils/sop_processing/output_generator.py` - diagrams now generate from the current reviewed SOP state even when zero suggestions are accepted; rejected/pending suggestions are excluded. Non-metadata updates no longer anchor inside reference/catalog/library tables.
- `utils/sop_processing/diagram_renderer.py` - replaced diagonal connector behavior with orthogonal Manhattan routing; added a KPMG/TRACE-style header, standard shape legend, swimlane body, and footer panels.
- `utils/sop_processing/prompts.py` - clarified that swimlane extraction receives the current reviewed SOP state and must not infer rejected/pending changes.
- `tests/sop_processing/test_output_generator.py` - added coverage proving rejected suggestions do not appear in diagram extraction input and zero-accepted-output still diagrams the as-is SOP.
- `tests/sop_processing/test_document_aware_output_compiler.py` - added coverage preventing procedure additions from landing inside reference catalog tables.
- `tests/services/test_diagram_renderer.py` - added coverage for orthogonal connectors, reference-style legend/footer panels, and long lane labels.
- `docs/document-uplift-build-log.md` - recorded the remediation and generated artifacts.

**Verified:**
- [x] Red phase: reference catalog placement test failed before the guard because `PROC-SCREEN-001` anchored into the reference table.
- [x] Green phase: `python -m pytest tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 8 passed.
- [x] Renderer tests passed: `python -m pytest tests\services\test_diagram_renderer.py -q` passed: 7 passed.
- [x] Adjacent regression suite passed: `python -m pytest tests\test_prompts.py tests\services\test_diagram_renderer.py tests\services\test_schemas.py tests\services\test_analysis.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 53 passed.
- [x] `docker compose build fastapi_api` passed.
- [x] FastAPI was recreated with `DOCUMENT_UPLIFT_ENABLED=true` and `TASK_BACKEND=asyncio`.
- [x] Live Stage 2 generation reached `status.stage="complete"` with Gemini `gemini-3-flash-preview`, final `call_count=36`.
- [x] Final DOCX XML inspection found 22 tracked insertions, 0 reference-table insertions, 0 role-name-cell insertions, no generic comment prefixes, and no `anchor` wording in comments.
- [x] Flowchart artifacts are valid: PNG signature true, dimensions 6368 x 2729; PDF signature true.
- [x] Visual PNG check confirms orthogonal horizontal/vertical connectors, KPMG/TRACE header, legend panel, lane body, and footer panels.

**Current review artifacts:**
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-document-aware-v7.docx`
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v7.png`
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v7.pdf`

**Next item:** Human reviews the updated Word output and v7 swimlane artifacts. Cyber and ESG sample packs should be run through the same pipeline as cross-domain checks for T9.

**Blockers:** Human Word 365 visual review, flowchart design review, T8 usefulness review, and T9 cross-domain usefulness review.

**Plan deviations:** None. The changes remain generic and do not hardcode KYC, RCM, swimlane names, or process steps.

---

## [2026-05-08] Tightened generic swimlane renderer and metadata

**Plan items addressed:** Diagram export quality, current-reviewed-state diagram generation, source document traceability, and human review readiness for Stage 2 outputs.

**Files created:**
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-document-aware-v9.docx` - regenerated Word output after renderer metadata propagation.
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v9.png` - regenerated swimlane PNG with standard flowchart styling and primary document header metadata.
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v9.pdf` - regenerated swimlane PDF with the same renderer output.

**Files modified:**
- `utils/services/schemas.py` - added optional `process_owner` and `document_name` metadata to `SwimlaneSpec`.
- `utils/sop_processing/prompts.py` - extended swimlane extraction JSON to request process owner and document name when present.
- `utils/sop_processing/output_generator.py` - carries the primary uploaded procedure/process/policy filename into the swimlane spec; fills a missing process owner from the first extracted lane when the LLM omits it.
- `utils/sop_processing/diagram_renderer.py` - updated standard flowchart styling: navy process boxes, teal decisions, oval start/end terminals, stronger lane dividers, wrapped footer lane legend, shape-specific edge anchors, separate decision branch exits, and orthogonal connector routing.
- `tests/services/test_diagram_renderer.py` - added renderer tests for style tokens, terminal symbols, metadata header text, box-boundary connectors, decision branch exits, and footer wrapping.
- `tests/sop_processing/test_output_generator.py` - added coverage that swimlane metadata uses the primary uploaded procedure filename without hardcoding document names.
- `docs/document-uplift-build-log.md` - recorded the v9 implementation and verification status.

**Verified:**
- [x] Red phase: renderer tests failed before implementation for action border styling, terminal shape type, metadata header, action connector endpoints, decision branch exits, and footer overflow.
- [x] Green phase: `python -m pytest tests\services\test_diagram_renderer.py -q` passed: 13 passed.
- [x] Metadata red/green: `python -m pytest tests\sop_processing\test_output_generator.py::test_generate_outputs_uses_primary_procedure_filename_in_swimlane_metadata -q` failed before implementation and passed after implementation.
- [x] Adjacent regression suite passed: `python -m pytest tests\test_prompts.py tests\services\test_diagram_renderer.py tests\services\test_schemas.py tests\services\test_analysis.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 60 passed.
- [x] `git diff --check` passed for the modified renderer/schema/prompt/output/test files.
- [x] `docker compose build fastapi_api` passed.
- [x] FastAPI was recreated with `DOCUMENT_UPLIFT_ENABLED=true` and `TASK_BACKEND=asyncio`.
- [x] Live Stage 2 generation for case `fa7cd113-19d0-4505-b565-cd88ea1835c2` reached `status.stage="complete"`.
- [x] Final DOCX XML inspection found 30 tracked insertions, 12 tracked deletions, 22 comments, no `anchor` wording, no UUID-like source IDs in comments, and source document labels present.
- [x] Flowchart artifact checks found a valid PNG at 7364 x 3120 and a valid PDF signature.
- [x] Visual PNG check confirms KPMG/TRACE header, actual uploaded document filename, dark swimlane labels, standard shape legend, oval terminals, navy process boxes, and horizontal/vertical connectors.

**Current review artifacts:**
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-uplifted-sop-document-aware-v9.docx`
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v9.png`
- `output/doc/fa7cd113-19d0-4505-b565-cd88ea1835c2-swimlane-v9.pdf`

**Next item:** Human reviews the v9 Word and flowchart artifacts in Word 365. Cyber and ESG sample packs should be run through the same pipeline for T9 cross-domain usefulness.

**Blockers:** Human Word 365 visual review, flowchart design review, T8 usefulness review, and T9 cross-domain usefulness review.

**Plan deviations:** None. The diagram renderer and metadata propagation remain domain-neutral and do not hardcode KYC, RCM, swimlane names, or process steps.

---

## [2026-05-08] T9 Cyber and ESG cross-domain validation run

**Plan items addressed:** T9 cross-domain usefulness review, cross-domain source pack validation, and generated output verification for Cyber and ESG packs.

**Files created:**
- `output/doc/cyber-t9-docx.docx` - Cyber Incident Response uplifted DOCX generated from the T9 validation case.
- `output/doc/cyber-t9-png_diagram.png` - Cyber swimlane PNG generated from the current reviewed Cyber SOP state.
- `output/doc/cyber-t9-pdf_diagram.pdf` - Cyber swimlane PDF generated from the current reviewed Cyber SOP state.
- `output/doc/esg-t9-docx.docx` - ESG Reporting uplifted DOCX generated from the T9 validation case.
- `output/doc/esg-t9-png_diagram.png` - ESG swimlane PNG generated from the current reviewed ESG SOP state.
- `output/doc/esg-t9-pdf_diagram.pdf` - ESG swimlane PDF generated from the current reviewed ESG SOP state.
- `output/doc/cyber-t9-suggestions.json` - raw Cyber suggestion capture.
- `output/doc/esg-t9-suggestions.json` - raw ESG suggestion capture.
- `output/doc/cyber-t9-case.json` - completed Cyber case snapshot.
- `output/doc/esg-t9-case.json` - completed ESG case snapshot.
- `output/doc/cyber-esg-t9-validation-comparison.md` - inferred planted-issue baseline vs detected-suggestion comparison.

**Validation cases:**
- Cybersecurity case `cd10c25f-66a9-4628-99a2-7003949e2c9c` uploaded `cyber_ir_sop.docx`, `cyber_rcm.xlsx`, and `cyber_risk_event_log.xlsx`.
- ESG case `fa6e0b67-22e8-410c-a4f4-7e7ac191f454` uploaded `esg_reporting_sop.docx`, `esg_rcm.xlsx`, and `esg_metric_deviation_log.xlsx`.

**Verified:**
- [x] Both cases reached Stage 1 `review_ready`.
- [x] Cyber generated 21 suggestions.
- [x] ESG generated 5 suggestions.
- [x] Both cases completed Stage 2 output generation with 3 outputs each.
- [x] Cyber diagram PNG is valid at 5460 x 2580.
- [x] ESG diagram PNG is valid at 10410 x 2580.
- [x] The validation comparison was documented in `output/doc/cyber-esg-t9-validation-comparison.md`.

**Findings:**
- Cyber is a partial T9 pass: it found several planted SOP/process issues and RCM mapping gaps, but missed severity taxonomy, chain-of-custody/evidence preservation, internal escalation SLAs, external contact list, document review-cycle, and risk-event-log-derived issues.
- ESG is not a T9 pass yet: it found broad SOP-quality issues, but missed most ESG RCM and metric-deviation-log findings.
- Source traceability remains partial: deterministic mapping-gap suggestions cite source filenames, while several LLM-generated process suggestions have no source references.
- Suggestion quality needs a guard: one Cyber suggestion was blank (`Process Improvement` with no detail/proposed text).

**Next item:** Add a generic, document-aware issue extraction pass over every uploaded document so event logs, deviation logs, control assessments, issue/action trackers, and unstructured procedure content can all produce grounded `DocumentIssueSignal` findings before SOP-anchor placement.

**Blockers:** T9 cross-domain usefulness is not complete until Cyber/ESG gaps above are addressed and regression tests cover the new extraction behavior.

**Plan deviations:** None in execution. The validation shows the original domain-neutral architecture direction is still right, but the current implementation needs broader non-RCM supporting-document issue extraction before T9 can close.

---

## [2026-05-08] T9 fresh Cyber/ESG rerun with generic document issue signals

**Plan items addressed:** T9 cross-domain usefulness review, generic document-aware supporting-evidence analysis, source-grounded findings, and Stage 2 output stability for larger suggestion batches.

**Files created:**
- `output/doc/cyber-fresh-final-t9-docx.docx` - Cyber Incident Response uplifted DOCX from the final fresh validation case.
- `output/doc/cyber-fresh-final-t9-swimlane.png` - Cyber final swimlane PNG using the latest approved renderer style.
- `output/doc/cyber-fresh-final-t9-swimlane.pdf` - Cyber final swimlane PDF.
- `output/doc/cyber-fresh-final-t9-suggestions.json` - Cyber final suggestion capture.
- `output/doc/cyber-fresh-final-t9-case.json` - Cyber final case snapshot.
- `output/doc/esg-fresh-final-t9-docx.docx` - ESG Reporting uplifted DOCX from the final fresh validation case.
- `output/doc/esg-fresh-final-t9-swimlane.png` - ESG final swimlane PNG using the latest approved renderer style.
- `output/doc/esg-fresh-final-t9-swimlane.pdf` - ESG final swimlane PDF.
- `output/doc/esg-fresh-final-t9-suggestions.json` - ESG final suggestion capture.
- `output/doc/esg-fresh-final-t9-case.json` - ESG final case snapshot.
- `output/doc/cyber-esg-fresh-final-t9-validation-comparison.md` - fresh final planted/known issue comparison.

**Files modified:**
- `utils/services/generic_findings.py` - added generic document issue signal detection for metric deviations, SLA/deadline concerns, open issue dependencies, and recurring exceptions; tightened metric-deviation routing so generic control assessment gap/action rows become open issue dependencies rather than false metric findings.
- `utils/services/excel_pipeline.py` - runs generic document issue signal extraction over complete structured sheets, including non-RCM support documents.
- `utils/services/analysis.py` - filters blank/material-less LLM suggestions and normalizes source filename fallback from anchors.
- `utils/sop_processing/output_generator.py` - added `DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT` (default `12`) to cap per-change rewrite calls during large Stage 2 output generation.
- `tests/services/test_generic_findings.py` - added regression coverage for generic metric deviations, recurring exceptions, and control gap/action rows.
- `tests/services/test_excel_pipeline.py` - added regression coverage proving deviation-log rows emit source-grounded suggestions.
- `tests/services/test_analysis.py` - added regression coverage for blank suggestion filtering and source filename fallback.
- `tests/sop_processing/test_output_generator.py` - added regression coverage for the Stage 2 rewrite cap.

**Validation cases:**
- Cybersecurity final fresh case `79a2fe76-b8cb-4c1f-912a-28194b6d4650` uploaded `cyber_ir_sop.docx`, `cyber_rcm.xlsx`, and `cyber_risk_event_log.xlsx`.
- ESG final fresh case `7f32586e-3c3f-4ecd-ba36-973121213d5d` uploaded `esg_reporting_sop.docx`, `esg_rcm.xlsx`, and `esg_metric_deviation_log.xlsx`.

**Verified:**
- [x] Red phase: control assessment gap/action row test failed because numeric gap text was classified as `metric_deviation` instead of `open_issue_dependency`.
- [x] Green phase: `python -m pytest tests\services\test_generic_findings.py::test_control_gap_action_rows_are_not_metric_deviations -q` passed.
- [x] Focused service regression passed: `python -m pytest tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\services\test_analysis.py -q` passed: 34 passed.
- [x] Red phase: Stage 2 rewrite cap test failed because four accepted suggestions produced four LLM rewrite calls despite `DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT=2`.
- [x] Green phase: `python -m pytest tests\sop_processing\test_output_generator.py::test_generate_outputs_caps_stage2_rewrite_calls_for_large_batches -q` passed.
- [x] Focused output/service regression passed: `python -m pytest tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\services\test_analysis.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 56 passed.
- [x] `docker compose build fastapi_api` passed after both fixes.
- [x] FastAPI was recreated with `DOCUMENT_UPLIFT_ENABLED=true` and `TASK_BACKEND=asyncio`.
- [x] Final fresh Cyber case reached `review_ready` with 39 suggestions, then completed Stage 2 with 3 outputs.
- [x] Final fresh ESG case reached `review_ready` with 35 suggestions, then completed Stage 2 with 3 outputs.
- [x] Cyber artifact check: DOCX has 51 comments, 51 tracked insertions, 6 tracked deletions; PNG is valid at 5460 x 2985.
- [x] ESG artifact check: DOCX has 35 comments, 35 tracked insertions, 3 tracked deletions; PNG is valid at 5910 x 2580.

**Findings:**
- Cyber now detects the six open incident-log rows, control-assessment action gaps, control mapping gaps, ownership conflicts, and SOP process omissions.
- ESG now detects metric/target deviations from RCM and metric-deviation logs, control-assessment action gaps, and SOP process omissions.
- The suggestion queue is intentionally prioritized and deduped. It is not a full row-by-row issue-register export.

**Next item:** Human review of the final fresh Cyber/ESG Word and swimlane outputs. If every source row must be represented in the future, add a separate issue-register extraction/export mode instead of overloading the SOP uplift suggestion queue.

**Blockers:** Human review of the final Cyber/ESG outputs and the later UI restructure for a less crowded Document Uplift page.

**Plan deviations:** None. The fixes remain generic and do not hardcode KYC, Cyber, ESG, RCM, swimlane names, or process steps.

---

## [2026-05-08] Paused checkpoint: structural completeness and role/RACI guard

**Status:** Paused at user request before verification. This entry records the work-in-progress state only; it is not a completion claim.

**Why this was started:** Review of the fresh Cyber/ESG outputs showed the engine is now stronger at evidence-driven findings from RCMs, logs, deviation sheets, and support documents, but still needs a document-aware structural completeness pass for missing artifacts such as RACI matrices, severity/classification schemas, escalation matrices, post-event review sections, document control, regulatory calendars, framework/risk mappings, and metric-owner matrices. The Cyber review also showed that senior oversight roles can receive too much hands-on operational language, for example a CISO being assigned investigation or endpoint work.

**Design decision captured:** The fix must stay generic and domain-neutral. It must not hardcode KYC, Cyber, ESG, RCM, or any specific process. Missing artifacts should be inferred from document signals and roles across uploaded Word, PDF, Excel, CSV, and text-like files, covering finance, operations, technology, cyber, ESG, physical security, and other domains. Senior roles should be treated as accountable, consulted, informed, or escalated-to unless the source material explicitly supports hands-on responsibility.

**Files added or modified so far:**
- `utils/services/structural_completeness.py` - new generic structural completeness service started. Intended to add suggestions for missing RACI/role matrix, classification/severity schema, escalation matrix, post-event review, document control, regulatory calendar, metric-owner matrix, and risk appetite linkage based on document signals.
- `utils/services/role_assignment_guard.py` - new guard started to keep senior oversight roles out of operational task wording and route those changes toward RACI-style responsibility clarification.
- `utils/services/analysis.py` - partially integrated the structural completeness suggestions and role assignment guard into the analysis pipeline.
- `tests/services/test_analysis.py` - added red tests for structural completeness and senior-role routing.

**Red tests added before implementation:**
- `test_structural_completeness_detects_missing_raci_and_classification_schema`
- `test_structural_completeness_detects_metric_owner_matrix_from_supporting_facts`
- `test_senior_oversight_owner_is_routed_to_raci_not_operational_responsibility`

**Observed red state:**
- Structural completeness suggestions were not generated for narrative roles, undefined P1/P2-style levels, or support-document metric facts.
- Senior oversight owner suggestions remained routed as `role_responsibility` instead of a RACI-style clarification.

**Not yet verified:**
- The three new tests have not been rerun after the partial implementation.
- No focused regression suite has been rerun for this slice.
- No Docker build/recreate has been run for this slice.
- No fresh Cyber/ESG rerun has been performed with this slice.

**Resume checklist:**
- [ ] Run the three new tests in `tests/services/test_analysis.py`.
- [ ] Fix any failures in the structural completeness service and role assignment guard.
- [ ] Confirm the pass remains domain-neutral and document-aware, not table-only.
- [ ] Run focused service regressions for `analysis`, `generic_findings`, and `excel_pipeline`.
- [ ] Rebuild/recreate FastAPI only after tests pass.
- [ ] Rerun Cyber and ESG cases and compare against the known/planted issue list.
- [ ] Update this log and `docs/HANDOFF.md` after the slice is verified.

**Current blocker:** User explicitly asked to stop and continue later, so implementation remains intentionally paused.

---

## [2026-05-08] Structural completeness and senior-role guard verified

**Plan items addressed:** T9 cross-domain usefulness hardening, document-aware structural completeness, role/RACI quality guard, generic non-RCM/non-domain-specific issue handling, and Docker local enablement for the new Document Uplift feature.

**Files created:**
- `utils/services/structural_completeness.py` - generic structural completeness pass for missing accountability matrices, classification criteria, escalation matrices, post-event review, document control, obligation calendars, metric-owner matrices, and risk-appetite linkage.
- `utils/services/role_assignment_guard.py` - generic guard that routes unsafe senior oversight role + hands-on operational action wording toward RACI/accountability clarification.
- `output/doc/cyber-structural-completeness-docx.docx` - Cyber validation DOCX after the structural completeness slice.
- `output/doc/cyber-structural-completeness-swimlane.png` - Cyber validation swimlane PNG.
- `output/doc/cyber-structural-completeness-swimlane.pdf` - Cyber validation swimlane PDF.
- `output/doc/cyber-structural-completeness-suggestions.json` - Cyber suggestion capture.
- `output/doc/cyber-structural-completeness-case.json` - Cyber Stage 1 case snapshot.
- `output/doc/cyber-structural-completeness-complete-case.json` - Cyber completed case snapshot.
- `output/doc/esg-structural-completeness-docx.docx` - ESG validation DOCX after the structural completeness slice.
- `output/doc/esg-structural-completeness-swimlane.png` - ESG validation swimlane PNG.
- `output/doc/esg-structural-completeness-swimlane.pdf` - ESG validation swimlane PDF.
- `output/doc/esg-structural-completeness-suggestions.json` - ESG suggestion capture.
- `output/doc/esg-structural-completeness-case.json` - ESG Stage 1 case snapshot.
- `output/doc/esg-structural-completeness-complete-case.json` - ESG completed case snapshot.
- `output/doc/cyber-esg-structural-completeness-validation-comparison.md` - planted issue comparison after the structural completeness rerun.

**Files modified:**
- `utils/services/analysis.py` - integrates structural completeness suggestions and applies the role assignment guard before final suggestion normalization.
- `tests/services/test_analysis.py` - adds regression coverage for narrative/bulleted role structures, missing classification criteria, metric-owner matrix inference from supporting facts, and senior oversight role routing.
- `docker-compose.yml` - defaults `DOCUMENT_UPLIFT_ENABLED` to `true` for local Docker services while preserving `DOCUMENT_UPLIFT_ENABLED=false` override support.

**Validation cases:**
- Cyber structural case `cfe2acd7-e656-41cc-be05-80dca0565b74` uploaded `cyber_ir_sop.docx`, `cyber_rcm.xlsx`, and `cyber_risk_event_log.xlsx`.
- ESG structural case `96d0e5a1-4722-4ab6-bc81-48df8d761334` uploaded `esg_reporting_sop.docx`, `esg_rcm.xlsx`, and `esg_metric_deviation_log.xlsx`.

**Verified:**
- [x] The three paused tests were rerun and passed: `3 passed`.
- [x] Focused service regression passed: `python -m pytest tests\services\test_analysis.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py -q` passed: 37 passed.
- [x] Focused output/service regression passed: `python -m pytest tests\services\test_analysis.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 59 passed.
- [x] `docker compose build fastapi_api` passed.
- [x] `docker compose config --quiet` passed after the compose default change.
- [x] FastAPI was recreated with `DOCUMENT_UPLIFT_ENABLED=true` and reported healthy.
- [x] Cyber rerun reached `review_ready` with 44 suggestions, then completed Stage 2 with 3 outputs.
- [x] ESG rerun reached `review_ready` with 44 suggestions, then completed Stage 2 with 3 outputs.
- [x] Cyber artifact check: DOCX has 56 comments, 66 tracked insertions, 8 tracked deletions; PNG is valid at 7710 x 2175.
- [x] ESG artifact check: DOCX has 44 comments, 54 tracked insertions, 8 tracked deletions; PNG is valid at 9060 x 2580.
- [x] Unsafe senior-role text scan found no matches for `CISO performs`, `Chief ... performs`, `Chief ... investigate`, or `performs investigate` in the generated suggestion JSON.

**Findings:**
- Cyber now covers the planted missing RACI/accountability, undefined classification criteria, escalation timing, regulatory obligation calendar, post-event review, document control, and diagram output expectations.
- ESG now covers the planted deviation thresholds, regulatory calendar, metric/data owner matrix, escalation timeframes, cadence, assurance interaction, risk appetite linkage, and validation/data-quality expectations.
- Remaining partial Cyber gaps are generic type-specific playbook coverage, explicit forensic preservation / chain-of-custody, and phase-to-framework mapping.
- Remaining partial ESG gaps are explicit board/committee reporting recipient cadence and category-universe coverage such as all Scope 3 categories.

**Next item:** Add the four remaining generic structural patterns when we continue: playbook/specialized-response matrix, evidence preservation / chain-of-custody, oversight committee reporting matrix, and category coverage matrix. These should remain domain-neutral and should not hardcode Cyber, ESG, KYC, RCM, or a specific process.

**Blockers:** Human review of the new Cyber/ESG DOCX and swimlane artifacts.

**Plan deviations:** None against the domain-neutral architecture. Docker Compose default enablement is an operational change to keep the new Document Uplift feature reachable in local Docker; it can still be disabled with `DOCUMENT_UPLIFT_ENABLED=false`.

---

## [2026-05-08] Structural output formatting guard

**Status:** Implemented and tested.

**Why this was started:** User review showed that broad structural recommendations, for example RACI/accountability tables, could be inserted into the Word output as raw markdown pipe tables. That made the output look like a generated text dump instead of a formatted SOP uplift.

**Key changes:**
- Added `requires_explicit_review` to structural suggestions so generated outputs do not silently auto-accept broad document-structure changes.
- Updated auto-accept and bulk-accept behavior so structural suggestions remain pending unless a reviewer explicitly accepts them.
- Updated DOCX output generation so an explicitly accepted markdown-table suggestion is converted into a native Word table, with surrounding explanation preserved as normal paragraphs.
- Kept the fix generic: the conversion is based on markdown table structure, not on RACI, Cyber, ESG, KYC, RCM, or any specific document type.

**Files modified:**
- `utils/services/schemas.py`
- `utils/services/structural_completeness.py`
- `api/routers/document_uplift.py`
- `utils/sop_processing/output_generator.py`
- `tests/test_document_uplift_api.py`
- `tests/sop_processing/test_output_generator.py`
- `tests/services/test_analysis.py`

**Verification:**
- `python -m pytest tests\test_document_uplift_api.py::test_auto_accept_skips_structural_suggestions_requiring_explicit_review tests\test_document_uplift_api.py::test_bulk_review_accept_all_skips_structural_suggestions_requiring_explicit_review tests\sop_processing\test_output_generator.py::test_generate_outputs_formats_markdown_table_targets_as_word_tables -q` passed: 3 passed.

**Current behavior:**
- Normal accepted suggestions can still be applied to Word outputs.
- Structural completeness suggestions remain in the review queue by default.
- Explicitly accepted table-style structural suggestions render as native Word tables instead of markdown text.

**Remaining gates:** Fresh Cyber/ESG rerun with reviewer-selected structural suggestions, after the user decides which structural recommendations should be accepted into the SOP.

---

## [2026-05-08] Output anchor distribution and same-anchor merge guard

**Status:** Implemented and verified.

**Why this was started:** Review feedback showed that multiple missing-coverage suggestions could stack under one SOP anchor even when their wording clearly belonged to different sections. The deterministic mapping-gap fallback also chose the first procedural anchor for every missing control, which made the issue repeatable across domains.

**Key changes:**
- Mapping-gap fallback now picks the best matching procedure anchor per source row using generic overlap across control/activity/evidence/owner wording and SOP heading/content text.
- Same-anchor additive procedure/evidence/monitoring updates are merged before DOCX write so Word review shows one consolidated tracked-change block instead of many stacked insertions.
- Markdown-table suggestions remain excluded from this merge path so accepted table-style structural suggestions continue to render as native Word tables.
- Local Stage 2 rewrite budget default increased from `12` to `50`; `DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT=-1` still enables unlimited rewrites.
- Docker Compose now passes `DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT=${DOCUMENT_UPLIFT_STAGE2_REWRITE_LIMIT:-50}` to FastAPI and Celery.

**Files modified:**
- `utils/services/analysis.py`
- `utils/sop_processing/output_generator.py`
- `docker-compose.yml`
- `tests/services/test_analysis.py`
- `tests/sop_processing/test_output_generator.py`

**Verification:**
- Red tests failed before implementation for first-anchor targeting and same-anchor stacked insertions.
- `python -m pytest tests\services\test_analysis.py::test_mapping_gap_targets_best_matching_procedure_anchor_not_first_anchor tests\sop_processing\test_output_generator.py::test_generate_outputs_merges_same_anchor_procedure_additions -q` passed: 2 passed.
- `python -m pytest tests\services\test_analysis.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 62 passed.
- `docker compose config --quiet` passed.
- `docker compose build fastapi_api` passed.
- FastAPI was recreated and reported healthy.

**Current behavior:**
- Missing coverage suggestions are routed toward the most compatible SOP section when a better match exists.
- Multiple accepted additive updates for the same anchor/type are consolidated into one tracked insertion/comment.
- The fix remains domain-neutral and does not hardcode Cyber, ESG, KYC, RCM, or any specific process.

**Remaining gates:** Fresh Cyber/ESG rerun and Word review of the generated DOCX artifacts after the desired reviewer selections are confirmed.

---

## [2026-05-08] Localhost Docker port binding fix

**Status:** Implemented and verified.

**Why this was started:** `http://localhost:5000/` was not loading even though the `web_ui_agent` container was running and healthy.

**Root cause:** The web service responded over IPv4 (`127.0.0.1:5000`) but the `localhost` hostname resolved to IPv6 (`::1`) first. Docker's IPv6 localhost path accepted the connection but did not return HTTP data, causing browser and PowerShell requests to hang.

**Key changes:**
- Bound FastAPI to IPv4 loopback only: `127.0.0.1:8000:8000`.
- Bound the web UI to IPv4 loopback only: `127.0.0.1:5000:5000`.
- Recreated `fastapi_api` and `web_ui_agent` so the new bindings took effect.

**Verification:**
- `docker compose config --quiet` passed.
- `curl.exe -I --max-time 10 http://localhost:5000/` returned `200 OK`.
- `Invoke-WebRequest -UseBasicParsing -Uri http://localhost:5000/` returned `200 OK`.
- `Invoke-WebRequest -UseBasicParsing -Uri http://localhost:5000/api/health` returned `200 OK`.
- `Invoke-WebRequest -UseBasicParsing -Uri http://localhost:8000/health` returned `200 OK`.
- `curl.exe -6 -I --max-time 5 http://localhost:5000/` now fails fast instead of hanging, allowing normal localhost clients to use IPv4.

**Current behavior:** `http://localhost:5000/` and `http://127.0.0.1:5000/` both work locally.

---

## [2026-05-11] Remaining structural pattern slice

**Plan items addressed:** T9 cross-domain usefulness hardening; four remaining generic structural patterns from the 2026-05-08 resume note.

**Files created:**
- None

**Files modified:**
- `utils/services/structural_completeness.py` - added generic structural completeness checks for response/playbook matrices, evidence preservation and chain-of-custody, oversight reporting matrices, and category coverage matrices.
- `tests/services/test_analysis.py` - added red/green regression coverage proving each new structural pattern surfaces through the Stage 1 analysis result.
- `docs/document-uplift-build-log.md` - recorded this completion checkpoint.
- `docs/HANDOFF.md` - added the human-facing handoff note for the new structural patterns.

**Tests written:**
- `tests/services/test_analysis.py` - 4 new tests, failing first because the expected structural suggestion titles were absent, then passing after implementation.

**Verified:**
- [x] Red phase: `python -m pytest tests\services\test_analysis.py::test_structural_completeness_detects_missing_response_playbook_matrix tests\services\test_analysis.py::test_structural_completeness_detects_missing_evidence_preservation_requirements tests\services\test_analysis.py::test_structural_completeness_detects_missing_oversight_reporting_matrix tests\services\test_analysis.py::test_structural_completeness_detects_missing_category_coverage_matrix -q` failed with 4 missing-suggestion `StopIteration` failures.
- [x] Green phase: the same targeted test command passed: 4 passed, 1 existing Pydantic warning.
- [x] Focused regression passed: `python -m pytest tests\services\test_analysis.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 66 passed, 15 warnings.
- [x] No bare `except: pass` introduced - `rg -n "except\s*:\s*pass|except\s+[^\r\n]*:\s*pass" utils\services tests\services` returned no matches.
- [x] All new functions have explicit return type annotations - `rg -n "^def .*\)\s*:" utils\services\structural_completeness.py tests\services\test_analysis.py` returned no matches.
- [x] `docker compose config --quiet` passed.
- [x] `docker compose build fastapi_api` passed after Docker permission escalation.
- [x] `docker compose up -d --force-recreate fastapi_api` passed after Docker permission escalation.
- [x] `docker compose ps fastapi_api` reported `Up ... (healthy)` on `127.0.0.1:8000->8000/tcp`.
- [x] `Invoke-WebRequest -UseBasicParsing -Uri http://localhost:8000/health | Select-Object -ExpandProperty StatusCode` returned `200`.

**Current behavior:**
- Structural completeness now adds reviewer-gated suggestions for generic event/scenario playbook matrices when a procedure references multiple response types without a type-specific matrix.
- Evidence-heavy investigation/exception processes now get reviewer-gated preservation and chain-of-custody requirements when custody/integrity controls are absent.
- Board, committee, steering, or oversight reporting references now get a reporting matrix recommendation when recipient, cadence/trigger, content, owner, and evidence are not structured.
- Category/population/scope coverage signals now get a category coverage matrix recommendation when the procedure does not reconcile the full source-document coverage universe.

**Next item:** Fresh Cyber/ESG rerun with the expanded structural pattern set, then human Word 365 review of regenerated DOCX/swimlane outputs and T8/T9 usefulness review. The later Document Uplift UI restructure remains pending.

**Blockers:** Human review is required for Word 365 visual placement and T8/T9 usefulness gates.

**Plan deviations:** None. The implementation remains signal-based and does not hardcode Cyber, ESG, KYC, RCM, swimlane names, or process steps.

---

## [2026-05-11] Prompt quality hardening — holistic SOP uplift, per-call temperature, source traceability

**Plan items addressed:** T9 cross-domain suggestion quality; source traceability; domain-neutral uplift coverage beyond cyber/tech risk.

**Why this was started:** T9 validation showed the `procedural_extraction_prompt` was framed as a corpus-gap detector, not a holistic document quality reviewer. ESG missed most metric/deviation-log findings. Several LLM-generated suggestions had no source citation. The section classifier defaulted ambiguous sections to `procedural`, sending noise through the expensive extraction call. All LLM calls used the same temperature regardless of whether the task was deterministic extraction or creative gap-spotting.

**Files modified:**
- `utils/sop_processing/prompts.py` — three prompts updated (versions bumped to 1.1):
  - `procedural_extraction_prompt`: reframed from corpus-gap detection to holistic SOP quality review across 8 explicit dimensions (clarity, completeness, output requirements, accountability, process depth, supporting-document alignment, terminology consistency, currency). Corpus framing changed from "authority" to "evidence". Added `source_file` field to suggestion JSON output. Added quality floor rules block. Added valid `suggestion_type` enum. Dimension (b) now flags undefined severity/priority labels. Dimension (f) explicitly covers event/deviation log entries as a source of missing process steps.
  - `section_classification_prompt`: fallback changed from `procedural` to `appendix` so ambiguous non-procedural sections are excluded from the extraction batch rather than included.
  - `cross_document_synthesis_prompt`: widened from RCM/risk-specific labels to domain-neutral "supporting document items". Added gap type 6 — recurring event/exception types in supporting documents with no corresponding SOP handling step.
- `utils/services/llm_orchestrator.py` — `call_llm()` accepts a `temperature` parameter (default `0.2`) and passes it to `get_llm()`. Previously all calls used the provider default with no per-call control.
- `utils/services/analysis.py` — six targeted changes:
  - `_call_budgeted()` accepts and forwards `temperature`.
  - `_run_single_anchor_prompt()` defaults to `temperature=0.0` (deterministic extraction for terminology and metadata).
  - `_run_procedural_batch()` passes `temperature=0.3` (wider generative range for gap-spotting).
  - `_run_cross_document_synthesis()` passes `temperature=0.2`.
  - `section_classification` call site passes `temperature=0.0`.
  - `_apply_section_classification()` code fallback changed from `"procedural"` to `"appendix"` to match the updated prompt instruction.
  - `_suggestion_from_raw()`: resolves `source_file` string from LLM output into a `SourceReference` before falling back to the anchor-based reference. LLM-generated suggestions that cite a supporting document filename now carry that citation through to the review UI.

**Files created:**
- None

**Tests written:**
- None — these are prompt and orchestration changes. Existing regression suite (66 tests) covers the call paths. Prompt quality is validated by fresh Cyber/ESG reruns.

**Verified:**
- [ ] Regression suite not yet rerun — pending after Docker rebuild.
- [ ] Fresh Cyber/ESG rerun not yet performed with updated prompts.

**Next item:** `docker compose build fastapi_api`, recreate, then fresh Cyber/ESG rerun. Compare suggestion count, source citation coverage, and T9 planted-issue detection rate against the previous 44-suggestion baseline.

**Blockers:** None — changes are backward-compatible. `source_file` is an additive field; callers that don't emit it fall through to the existing anchor fallback unchanged.

**Plan deviations:** None. All changes remain domain-neutral and do not hardcode Cyber, ESG, KYC, RCM, or any specific process.

---

## [2026-05-11] Gemini default, provider switching persistence, and fresh Cyber/ESG validation

**Status:** Rebuilt and validated. Follow-up quality hardening required.

**Why this was started:** The first fresh Cyber run after the prompt hardening failed into a `partial` state because the active MongoDB LLM setting was Anthropic `claude-opus-4-7`, and that model rejected the new per-call `temperature` parameter. The user then asked to use Gemini as the default active LLM while preserving the runtime provider-switching feature.

**Files modified:**
- `utils/llm_config_store.py` - omits `temperature` for Claude 4 Anthropic models and resolves the existing case-conflicting MongoDB database name before reading/writing `settings`.
- `tests/test_settings.py` - added coverage for Claude 4 temperature omission and for using an existing `Trace_db` database when the configured default is `trace_db`.
- `docs/document-uplift-build-log.md` - recorded this validation checkpoint.
- `docs/HANDOFF.md` - added the same handoff context.

**Runtime configuration:**
- Explicitly persisted MongoDB `settings` document to Gemini:
  - database: existing `Trace_db`
  - collection: `settings`
  - document: `{ "_id": "llm_config", "provider": "gemini", "model": "gemini-3-flash-preview" }`
- Preserved provider switching: `/settings/llm-config` and `/settings/llm-status?provider=...&model=...` remain available and covered by tests.

**Verification:**
- [x] Red test for existing case-conflicting MongoDB database failed before the `_resolve_db_name()` change and passed after implementation.
- [x] `python -m pytest tests\test_settings.py -q` passed: 25 passed, existing warnings only.
- [x] Focused regression passed: `python -m pytest tests\test_settings.py tests\test_prompts.py tests\services\test_llm_orchestrator.py tests\services\test_analysis.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py -q` passed: 103 passed, existing warnings only.
- [x] `docker compose build fastapi_api` passed after Docker permission escalation.
- [x] `docker compose up -d --force-recreate fastapi_api` passed after Docker permission escalation.
- [x] `docker compose ps fastapi_api` reported the rebuilt API `Up ... (healthy)` on `127.0.0.1:8000->8000/tcp`.
- [x] `GET http://localhost:8000/health` returned status `ok`.
- [x] `GET http://localhost:5000/api/health` returned status `ok`.
- [x] `GET http://localhost:8000/settings/system-status` reported active provider/model `gemini` / `gemini-3-flash-preview`.
- [x] `GET http://localhost:8000/settings/llm-status` returned `status: ok` with Gemini.

**Fresh validation cases:**
- Cyber case `6e3c4dd2-6981-4072-b267-64ca581de8cd`
  - Inputs: `cyber_ir_sop.docx`, `cyber_rcm.xlsx`, and `cyber_risk_event_log.xlsx`.
  - Stage 1 reached `review_ready` with 49 suggestions, 11 Gemini calls, and no processing warnings.
  - Stage 2 completed with final Gemini call count 56 and three outputs.
  - Default export behavior auto-accepted 39 non-structural suggestions and left 10 `requires_explicit_review` structural suggestions pending.
  - Downloaded artifacts:
    - `output/doc/cyber-gemini-uplifted-sop.docx`
    - `output/doc/cyber-gemini-swimlane.png`
    - `output/doc/cyber-gemini-swimlane.pdf`
    - `output/doc/cyber-gemini-case-stage1.json`
    - `output/doc/cyber-gemini-suggestions-stage1.json`
    - `output/doc/cyber-gemini-case-final.json`
    - `output/doc/cyber-gemini-suggestions-final.json`
  - Artifact sanity checks: DOCX has 54 tracked insertions, 10 tracked deletions, and 44 comments; PNG is valid at 9510 x 2175; PDF starts with `%PDF-`.
- ESG case `56f2c0e8-9f06-4a2b-8478-15d85ad13103`
  - Inputs: `esg_reporting_sop.docx`, `esg_rcm.xlsx`, and `esg_metric_deviation_log.xlsx`.
  - Stage 1 reached `review_ready` with 49 suggestions, 7 Gemini calls, and no processing warnings.
  - Stage 2 completed with final Gemini call count 46 and three outputs.
  - Default export behavior auto-accepted 38 non-structural suggestions and left 11 `requires_explicit_review` structural suggestions pending.
  - Downloaded artifacts:
    - `output/doc/esg-gemini-uplifted-sop.docx`
    - `output/doc/esg-gemini-swimlane.png`
    - `output/doc/esg-gemini-swimlane.pdf`
    - `output/doc/esg-gemini-case-stage1.json`
    - `output/doc/esg-gemini-suggestions-stage1.json`
    - `output/doc/esg-gemini-case-final.json`
    - `output/doc/esg-gemini-suggestions-final.json`
  - Artifact sanity checks: DOCX has 48 tracked insertions, 10 tracked deletions, and 38 comments; PNG is valid at 7710 x 2175; PDF starts with `%PDF-`.

**Quality findings from suggestion review:**
- Cyber: 18 of 49 suggestions use the deterministic template `Open issue should be reflected in the procedure`, with boilerplate proposed text beginning `Update the procedure to address the open issue...`; 20 suggestions have Excel-only references and no SOP reference; 18 suggestions have no target anchor and no edit targets.
- ESG: 12 of 49 suggestions use the same open-issue template; 32 suggestions have Excel-only references and no SOP reference; 32 suggestions have no target anchor and no edit targets.
- Root cause identified in code:
  - `utils/services/generic_findings.py::_open_issue_findings()` creates the generic open-issue title/proposed-text pattern.
  - `utils/services/structural_completeness.py` still emits placeholder table rows such as `Metric from source documents` and `Category from source documents`.

**Next item:** Design and implement a suggestion-quality gate for deterministic generic findings before another rerun. The likely direction is to keep unsupported Excel-only open issues as queue findings or evidence notes unless they can be mapped to a specific SOP anchor, and to replace placeholder matrix rows with source-derived rows or leave the structural suggestion reviewer-gated only.

**Blockers:** Human usefulness review is required before treating the prompt hardening as successful. The fresh Cyber and ESG runs completed technically, but the suggestion quality is not acceptable yet.

**Plan deviations:** None for validation. The provider switching feature remains intact; only the persisted active selection was set to Gemini.

---

## [2026-05-11] Mapping-gap relevance filter and additive granularity guard

**Status:** Implemented and regression-tested.

**Why this was started:** Fresh Gemini Cyber/ESG validation showed that broad supporting documents were still driving bad SOP insertions. Cyber received out-of-domain controls such as SWIFT, payments, fraud, mobile, and DLP. ESG received in-domain metrics at the wrong granularity, including copied numbered sub-procedures for LTIFR and board composition.

**Files modified:**
- `utils/services/analysis.py`
  - Added a domain-neutral scope vocabulary gate using the SOP `purpose_scope` anchor.
  - Applied the gate inside `_cross_document_mapping_gap_suggestions`, the actual deterministic mapping-gap emitter.
  - Kept no-scope cases fail-soft: suggestions still surface, but `requires_explicit_review=True`.
  - Tightened inferred coverage so matching the same owner/team alone no longer marks a control as already covered; activity/evidence overlap is required unless a control ID is explicit.
  - Added a narrow cross-cutting allow-list for controls such as audit trails and regulated-activity evidence.
  - Finalized the gate as same-anchor responsibility overlap rather than domain exclusions. Production code contains no Cyber/ESG/SWIFT/DLP/fraud/RBI/mobile/CSPM/vendor-management/control-ID blacklist.
- `utils/sop_processing/prompts.py`
  - Threaded SOP scope text into `cross_document_synthesis_prompt`.
  - Added the instruction to ignore supporting-document items owned by another organisational function or SOP.
- `utils/services/generic_findings.py`
  - Marked `open_issue_dependency` suggestions as `requires_explicit_review=True`.
- `utils/sop_processing/output_generator.py`
  - Added a Stage 2 additive granularity guard that compacts copied numbered sub-procedures into one SOP-appropriate sentence when rewrite is unavailable or unsafe.
- `tests/services/test_analysis.py`
  - Added regression coverage for Cyber out-of-domain rejection, in-domain CVSS patching acceptance, ESG LTIFR metric acceptance at step granularity, no-scope fail-soft reviewer gating, prompt scope injection, cross-cutting audit trail acceptance, and a Vendor Management SOP proving the gate is not Cyber-specific.
- `tests/services/test_generic_findings.py`
  - Added reviewer-gating coverage for deterministic open-issue dependency suggestions.
- `tests/sop_processing/test_output_generator.py`
  - Added coverage proving numbered sub-procedure additions are compacted before DOCX output.
- `docs/superpowers/plans/mapping-gap-relevance-filter.md`
  - Updated the plan with implementation corrections and final fail-soft behavior.

**Verified:**
- [x] Red phase: the initial focused tests failed for all intended gaps: out-of-scope Cyber control passed through, no-scope mapping gap was not reviewer-gated, LLM prompt lacked scope, open-issue dependency was not reviewer-gated, and DOCX output kept numbered sub-procedure text.
- [x] Targeted green pass: `python -m pytest tests\services\test_analysis.py::test_cross_document_mapping_gap_fallback_references_primary_sop_and_matrix tests\services\test_analysis.py::test_mapping_gap_relevance_filter_rejects_out_of_scope_controls tests\services\test_analysis.py::test_mapping_gap_accepts_adjacent_metric_at_step_granularity tests\services\test_analysis.py::test_mapping_gap_relevance_filter_allows_cross_cutting_audit_trail tests\services\test_analysis.py::test_mapping_gap_without_scope_is_fail_soft_reviewer_gated tests\services\test_analysis.py::test_cross_document_synthesis_prompt_receives_sop_scope_text tests\services\test_generic_findings.py::test_open_issue_dependency_suggestions_are_review_gated tests\sop_processing\test_output_generator.py::test_generate_outputs_compacts_numbered_subprocedure_additions -q` passed: 8 passed.
- [x] Focused regression passed after final domain-agnostic calibration: `python -m pytest tests\services\test_analysis.py tests\services\test_generic_findings.py tests\services\test_excel_pipeline.py tests\sop_processing\test_output_generator.py tests\sop_processing\test_document_aware_output_compiler.py tests\test_prompts.py -q` passed: 81 passed, existing warnings only.
- [x] Production grep check returned no domain blacklist literals for Cyber/ESG/SWIFT/DLP/fraud/RBI/mobile/CSPM/vendor terms in the changed production files.
- [x] `docker compose build fastapi_api` passed.
- [x] `docker compose up -d --force-recreate fastapi_api` passed.
- [x] `docker compose ps fastapi_api` reported `Up ... (healthy)` on `127.0.0.1:8000->8000/tcp`.
- [x] `GET http://localhost:8000/health` returned `200`.

**Live validation note:** An intermediate Cyber rerun before the final same-anchor calibration reached `review_ready` with 39 suggestions and 7 mapping gaps, with zero SWIFT/DLP/mobile/fraud/RBI/CSPM hits in mapping gaps. Final Cyber/ESG reruns should be repeated on the latest rebuilt container before treating the quality gate as complete.

**Next item:** Rerun the Cyber and ESG Gemini cases on the latest rebuilt API image. Expected improvement is a sharp drop in deterministic `mapping_gap` noise, zero SWIFT/DLP/mobile/fraud/RBI self-assessment suggestions in Cyber mapping gaps, and ESG additions that reference LTIFR/board metrics without embedding full standalone sub-procedures.

**Blockers:** None for code. Human usefulness review is still required after the fresh Cyber/ESG rerun.

**Plan deviations:** The original plan said fail-open when scope is absent; implementation uses fail-soft reviewer gating instead. The original plan also described additive insertions as bypassing rewrite entirely; implementation preserves the rewrite path and adds a granularity guard for no-budget/failed-rewrite cases.

---

## [2026-05-11] Scope-gate final Cyber/ESG rerun

**Status:** Complete. Fresh Gemini Stage 1 and Stage 2 runs succeeded on the rebuilt API.

**Runtime configuration:**
- Active provider/model: `gemini` / `gemini-3-flash-preview`.
- FastAPI was rebuilt and recreated before the final rerun.
- `GET http://localhost:8000/health` returned `200`.

**Final validation cases:**
- Cyber case `00555b2b-1e3c-4738-9228-b3414463258d`
  - Stage 1 status: `review_ready`.
  - Stage 1 timing from stored case timestamps: about 1 min 58 sec.
  - Stage 1 suggestions: 39 total, 2 `mapping_gap`, 18 open-issue dependency notes, 28 reviewer-gated.
  - Cyber mapping-gap titles: `Add SOP coverage for CC-001`, `Add SOP coverage for CC-019`.
  - Cyber bad-domain keyword check in mapping gaps: zero hits for SWIFT, DLP, mobile, fraud, transaction monitoring, RBI/self-assessment, CSPM, payments, and Data Loss Prevention.
  - Remaining bad-domain keywords are only in reviewer-gated open-issue notes, not deterministic mapping gaps.
  - Stage 2 status: `complete`, 3 outputs, final Gemini call count 23.
  - Stage 2 auto-accepted 11 suggestions and left 28 reviewer-gated suggestions pending.
- ESG case `b8805497-244f-4b98-9305-31f1b1f68ac3`
  - Stage 1 status: `review_ready`.
  - Stage 1 timing from stored case timestamps: about 2 min 02 sec.
  - Stage 1 suggestions: 48 total, 0 `mapping_gap`, 12 open-issue dependency notes, 23 reviewer-gated.
  - ESG copied-subprocedure check: zero markers for `4.2.1`, `4.2.2`, `4.2.3`, `Escalation Protocol`, `Remediation and Evidencing`, `Management of Lost Time Injury`, and `Independent Director Composition`.
  - Stage 2 status: `complete`, 3 outputs, final Gemini call count 34.
  - Stage 2 auto-accepted 25 suggestions and left 23 reviewer-gated suggestions pending.

**Downloaded artifacts:**
- `output/doc/cyber-scopegate-final2-00555b2b-1e3c-4738-9228-b3414463258d-uplifted-sop.docx`
- `output/doc/cyber-scopegate-final2-00555b2b-1e3c-4738-9228-b3414463258d-swimlane.png`
- `output/doc/cyber-scopegate-final2-00555b2b-1e3c-4738-9228-b3414463258d-swimlane.pdf`
- `output/doc/cyber-scopegate-final2-case-stage1.json`
- `output/doc/cyber-scopegate-final2-suggestions-stage1.json`
- `output/doc/cyber-scopegate-final2-case-final.json`
- `output/doc/cyber-scopegate-final2-suggestions-final.json`
- `output/doc/esg-scopegate-final2-b8805497-244f-4b98-9305-31f1b1f68ac3-uplifted-sop.docx`
- `output/doc/esg-scopegate-final2-b8805497-244f-4b98-9305-31f1b1f68ac3-swimlane.png`
- `output/doc/esg-scopegate-final2-b8805497-244f-4b98-9305-31f1b1f68ac3-swimlane.pdf`
- `output/doc/esg-scopegate-final2-case-stage1.json`
- `output/doc/esg-scopegate-final2-suggestions-stage1.json`
- `output/doc/esg-scopegate-final2-case-final.json`
- `output/doc/esg-scopegate-final2-suggestions-final.json`
- `output/doc/scopegate-final2-stage1-quality-summary.json`
- `output/doc/scopegate-final2-output-download-summary.json`
- `output/doc/scopegate-final2-artifact-sanity.json`

**Artifact sanity checks:**
- Cyber DOCX: 22 tracked insertions, 12 tracked deletions, 12 comments; no numbered sub-procedure markers.
- ESG DOCX: 35 tracked insertions, 8 tracked deletions, 25 comments; no numbered sub-procedure markers.
- Cyber PNG/PDF: valid PNG signature and valid `%PDF-` header.
- ESG PNG/PDF: valid PNG signature and valid `%PDF-` header.

**Current quality conclusion:**
- The deterministic mapping-gap noise problem is materially reduced in the Cyber run, and the previously observed out-of-domain controls are no longer present as mapping gaps.
- The ESG copied-subprocedure issue is not present in Stage 1 suggestions or final DOCX output.
- Reviewer-gated open-issue notes still contain some cross-domain source facts; that is acceptable for this slice because they are not auto-applied, but they remain a UX/review-quality issue for a later deterministic-finding cleanup.

**Next item:** Human review of the generated Cyber and ESG DOCX outputs in Word 365, especially whether the remaining non-gated insertions are useful enough and whether reviewer-gated open issues should be shown differently in the UI.

---

## [2026-05-11] Additive insertion prose quality — RCM verb stripping, evidence placeholder, domain-agnostic subprocedure compaction

**Plan items addressed:** Part 3 of mapping-gap relevance filter plan (additive granularity guard)

**Problem addressed:** After the scope gate, two quality problems remained in additive insertions:
1. Double-verb: `_role_activity_sentence` wrapped raw RCM description text (e.g. "Performs endpoint EDR...") with an additional "performs", producing "The IT Security performs performs endpoint EDR...".
2. Placeholder evidence: when `evidence_ref` was absent in the RCM row, the function appended "Retained evidence includes the relevant evidence." — a useless filler sentence.
3. Domain-hardcoded sub-procedure detection: `_looks_like_embedded_subprocedure` and `_remove_subprocedure_markers` in `output_generator.py` contained ESG-specific heading strings ("Identification and Thresholds", "Escalation Protocol", "Remediation and Evidencing", "Procedure Overview", "Scope Expansion") — these would fail silently for any other domain.

**Files modified:**
- `utils/services/analysis.py`
  - Added `_RCM_VERB_PREFIX` regex: strips leading action verbs ("Performs", "Reviews", "Monitors", etc.) from RCM description text before sentence construction — domain-agnostic regex, not a keyword list.
  - Added `_EVIDENCE_PLACEHOLDER` set: known empty-value strings ("the relevant evidence", "n/a", "none", etc.).
  - `_role_activity_sentence`: strips `_RCM_VERB_PREFIX` from activity text before wrapping with "performs"; omits the evidence clause entirely when evidence is empty or a placeholder value.
  - `_cross_document_mapping_gap_suggestions`: parent `proposed_text` now calls `_role_activity_sentence(owner, activity, evidence)` instead of the old raw template string.
- `utils/sop_processing/output_generator.py`
  - `_looks_like_embedded_subprocedure`: removed hardcoded ESG heading markers; replaced with structural pattern detection — multi-level numbered headings (≥2), single-level "N. Heading" patterns (≥3), or multi-section capitalised phrase structure with long text (≥3 sections, >300 chars). Works for any domain.
  - `_remove_subprocedure_markers`: removed hardcoded ESG heading names; replaced with generic single-level numbered heading stripping (`\d{1,2}\.\s+[A-Z]`).
- `utils/sop_processing/prompts.py`
  - `sop_section_rewrite_prompt` (version 1.0 → 1.1): added explicit instruction that for additive insertions (no original SOP text), the output must be a single active-voice procedure sentence — not a copied sub-procedure, numbered heading structure, or raw control matrix entry.

**Next item:** Rebuild API container and rerun Cyber/ESG validation cases to verify no "Performs performs..." double-verb, no "Retained evidence includes the relevant evidence." placeholder, and no embedded sub-procedure structure in additive insertions.

---

## [2026-05-11] Placement quality — heading anchor and contact list contamination

**Plan items addressed:** Output placement correctness (Word output quality)

**Problems addressed:**
1. Additive insertions were being placed immediately after section headings. `_paragraph_for_addition` anchored to the best-matching paragraph, but if that paragraph was a heading, the new text landed directly below the heading rather than at the end of the section body.
2. `_find_role_responsibility_cell` was targeting contact list tables (Name/Role/Phone/Email/Escalation) as if they were RACI/responsibility tables. CISO and SOC responsibility insertions were landing inside the contact list rather than the responsibilities table. Root causes: (a) "activity"/"activities" were in the responsibility token list — too broad, matching "Escalation Activity" columns; (b) no exclusion for tables with contact-info columns.

**Files modified:**
- `utils/sop_processing/output_generator.py`
  - `_find_role_responsibility_cell`: removed "activity"/"activities" from responsibility_tokens (too broad). Added `_table_has_descriptive_responsibility_column` structural check — a table is only eligible for responsibility insertion if its responsibility column cells average ≥5 words per row. Contact lists, escalation matrices, and directory tables have short single-value cells and fail this check regardless of domain or column naming.
  - `_paragraph_for_addition`: after finding the anchor paragraph, calls new `_last_body_paragraph_in_section` to walk past the heading to the last non-empty body paragraph in that section before the next heading.
  - Added `_is_heading_paragraph`: checks `paragraph.style.name.startswith("heading")`.
  - Added `_last_body_paragraph_in_section`: if anchor is a heading, walks forward through `document.paragraphs` until the next heading, returning the last body paragraph found.

**Next item:** Rebuild API and rerun Cyber/ESG to verify: insertions land at end of section body (not after heading); CISO/SOC responsibilities update the correct table; contact list is untouched.

---

## [2026-05-11] DOCX quality follow-up - prose, placement, and role target gating

**Status:** Implemented and locally verified.

**Problems addressed from DOCX review:**
1. RCM prose was still awkward after verb stripping because `_role_activity_sentence` could add `performs` back to noun/state phrases.
2. Acronym-leading activity text could be lowercased, producing examples like `fSISAC`.
3. Plain mapping-gap rows created responsibility edit targets too broadly, which fed wrong CISO/SOC-style responsibility insertions.
4. Vague escalation language such as `escalate if needed` was not deterministically flagged.
5. Heading-targeted additions could still land immediately below a section heading because `python-docx` paragraph wrappers were compared by object identity rather than their underlying XML element.
6. Short unnumbered mini-procedures could still bypass the numbered sub-procedure compaction guard.

**Domain-agnostic implementation:**
- `utils/services/analysis.py`
  - Reworked `_role_activity_sentence` to parse the leading RCM verb, preserve useful verbs (`reviews`, `monitors`, etc.), drop weak `performs` wrappers, convert state phrases such as `EDR deployed` into `ensures that EDR is deployed`, suppress placeholder evidence, and preserve acronym casing.
  - Added responsibility-target gating so ordinary control rows produce only a procedure-step target. A role/responsibility target is emitted only when the source row explicitly contains accountability/responsibility language, or when a senior oversight role is assigned operational work that should be converted to RACI by the guard.
- `utils/services/role_assignment_guard.py`
  - Added third-person operational verb forms so senior-role operational proposals like `investigates` are still routed away from direct responsibility wording and into RACI.
- `utils/services/structural_completeness.py`
  - Added vague escalation phrases: `if needed`, `if required`, `if necessary`, `as needed`, `as required`, `when necessary`, and `where necessary`.
- `utils/sop_processing/output_generator.py`
  - Added short inline heading-sequence detection for unnumbered embedded sub-procedures, based on repeated title-case labels followed by procedural body text.
  - Fixed `_last_body_paragraph_in_section` to compare `paragraph._p is anchor._p`, so heading anchors resolve to the end of the section body.

**Regression coverage added:**
- RCM cell prose does not produce `performs endpoint`, does not include placeholder evidence, and preserves `FSISAC`.
- Useful verbs such as `Reviews` remain active-voice verbs.
- Plain mapping-gap controls do not create role-responsibility targets.
- Explicit accountability rows still create role-responsibility targets.
- Senior oversight owner + operational activity routes to RACI.
- `escalates if needed` produces the escalation trigger/timeframe suggestion.
- Contact-style tables stay untouched while real responsibility tables receive role updates.
- Heading-targeted additions are inserted after the section body, before the next heading.
- Short unnumbered identification/escalation/remediation mini-procedures compact to one SOP sentence.

**Verification:**
- Focused new regression run: `python -m pytest tests/services/test_analysis.py::test_role_activity_sentence_normalizes_rcm_cell_text_without_acronym_damage tests/services/test_analysis.py::test_mapping_gap_skips_role_responsibility_target_for_plain_control_activity tests/services/test_analysis.py::test_mapping_gap_keeps_role_responsibility_target_for_explicit_accountability tests/services/test_analysis.py::test_structural_completeness_flags_escalate_if_needed_language tests/sop_processing/test_output_generator.py::test_generate_outputs_keeps_role_responsibility_insertions_out_of_contact_tables tests/sop_processing/test_output_generator.py::test_generate_outputs_places_heading_anchor_additions_after_section_body tests/sop_processing/test_output_generator.py::test_generate_outputs_compacts_unnumbered_embedded_subprocedure_additions -q` passed: 7 passed.
- Affected file run: `python -m pytest tests/services/test_analysis.py tests/sop_processing/test_output_generator.py -q` passed: 52 passed, existing warnings only.
- Broader service run: `python -m pytest tests/services -q` passed: 100 passed, existing pydantic warning only.
- `docker compose build fastapi_api` passed.
- `docker compose up -d --force-recreate fastapi_api` passed.
- `docker compose ps fastapi_api` reported `Up ... (healthy)`.
- `GET http://localhost:8000/health` returned `200`.

**Next item:** Rerun Cyber/ESG on the rebuilt API and inspect tracked insertions for no raw `performs endpoint` phrasing, no placeholder evidence sentence, no `fSISAC`, no heading-adjacent insertion when body text exists, no contact-list responsibility insertions, and no short unnumbered mini-procedure blocks.

---

## [2026-05-11] Qualityfix Cyber/ESG rerun after prose/placement patch

**Status:** Complete. Fresh/recovered validation succeeded on the rebuilt API.

**Runtime note:**
- The first Cyber run was interrupted from the terminal after the case had already reached Stage 2. The case continued server-side and was resumed from `complete`.
- FastAPI was healthy before continuing.

**Validation cases:**
- Cyber case `2f62929c-7df1-46a2-837e-99e235a50d3a`
  - Final status: `complete`.
  - Suggestions: 39 total, 2 `mapping_gap`, 28 reviewer-gated.
  - Outputs downloaded:
    - `output/doc/cyber-qualityfix-2f62929c-7df1-46a2-837e-99e235a50d3a-2f62929c-7df1-46a2-837e-99e235a50d3a-uplifted-sop.docx`
    - `output/doc/cyber-qualityfix-2f62929c-7df1-46a2-837e-99e235a50d3a-2f62929c-7df1-46a2-837e-99e235a50d3a-swimlane.png`
    - `output/doc/cyber-qualityfix-2f62929c-7df1-46a2-837e-99e235a50d3a-2f62929c-7df1-46a2-837e-99e235a50d3a-swimlane.pdf`
  - DOCX sanity: 10 tracked insertions, 7 tracked deletions, 10 comments.
  - Tracked insertion scan: zero hits for `performs endpoint`, `Retained evidence includes the relevant evidence`, `fSISAC`, `Identification and Thresholding`, inline `Escalation The`, and inline `Remediation The`.
  - Structure scan: no tracked insertions in the Cyber contact table; no heading-adjacent insertion pattern where body text follows.
  - Artifact headers valid: DOCX zip, PNG signature, and PDF header.
- ESG case `d64604c4-c7e2-43d2-bfff-d356d74b0936`
  - Final status: `complete`.
  - Suggestions: 48 total, 0 `mapping_gap`, 23 reviewer-gated.
  - Outputs downloaded:
    - `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-d64604c4-c7e2-43d2-bfff-d356d74b0936-uplifted-sop.docx`
    - `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-d64604c4-c7e2-43d2-bfff-d356d74b0936-swimlane.png`
    - `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-d64604c4-c7e2-43d2-bfff-d356d74b0936-swimlane.pdf`
  - DOCX sanity: 25 tracked insertions, 4 tracked deletions, 25 comments.
  - Tracked insertion scan: zero hits for `performs endpoint`, `Retained evidence includes the relevant evidence`, `fSISAC`, `Identification and Thresholding`, inline `Escalation The`, and inline `Remediation The`.
  - Structure scan: no heading-adjacent insertion pattern where body text follows.
  - Artifact headers valid: DOCX zip, PNG signature, and PDF header.

**Saved validation files:**
- `output/doc/qualityfix-rerun-summary.json`
- `output/doc/qualityfix-rerun-structure-scan.json`
- `output/doc/cyber-qualityfix-2f62929c-7df1-46a2-837e-99e235a50d3a-case-final.json`
- `output/doc/cyber-qualityfix-2f62929c-7df1-46a2-837e-99e235a50d3a-suggestions-final.json`
- `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-case-stage1.json`
- `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-suggestions-stage1.json`
- `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-case-final.json`
- `output/doc/esg-qualityfix-d64604c4-c7e2-43d2-bfff-d356d74b0936-suggestions-final.json`

**Current quality conclusion:**
- The specific DOCX issues raised in review are fixed in the rerun sanity scans: raw RCM `performs endpoint` phrasing, placeholder evidence text, `fSISAC`, heading-adjacent insertion, contact-list contamination, and short unnumbered mini-procedure markers.
- ESG still has several accepted metric-specific additions inside tables; they are now sentence-shaped rather than embedded mini-procedures. Human review should decide whether table-cell placement is desirable or whether metric-specific additions should instead be grouped into a generic deviation-handling step.

---

## [2026-05-11] Human gates confirmed for Document Uplift plan

**Plan items addressed:** CHECKPOINT C manual Word 365 gate, T8 suggestion usefulness gate, T9 cross-domain usefulness gate

**Files modified:**
- `docs/document-uplift-build-log.md` - updated the progress tracker to mark Checkpoint C manual Word review, T8, and T9 complete based on human confirmation.
- `docs/HANDOFF.md` - updated current handoff status so the remaining work reflects closeout rather than pending human gates.

**Verified:**
- [x] Human confirmed the prior remaining items 1, 2, and 3 are done: Word 365 review, T8 usefulness review, and T9 cross-domain usefulness review.
- [x] Progress tracker now records Checkpoint C, T8, and T9 as complete.

**Next item:** Record/pass T4 Pipeline Reliability restart/retry evidence if it has not already been evidenced, then create the final Document Uplift architecture/components/process document.

**Blockers:** None for documentation. T4 requires a runtime restart/retry check if no prior pass evidence is found.

**Plan deviations:** None.

---

## [2026-05-11] T4 restart/retry and Redis/Celery closeout verification

**Plan items addressed:** T4 Pipeline Reliability, Redis/Celery production queue readiness from Items 32-33

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded the T4 runtime smoke and Redis/Celery health evidence.
- `docs/HANDOFF.md` - updated remaining closeout to remove T4 and Redis as pending items.

**Verified:**
- [x] Focused reliability/Redis tests passed: `python -m pytest tests\test_document_uplift_infrastructure.py tests\test_document_uplift_pipeline.py::test_dispatch_pipeline_celery_enqueues_task tests\test_document_uplift_pipeline.py::test_async_queue_rejects_duplicate_case tests\test_document_uplift_pipeline.py::test_async_queue_rejects_when_full tests\test_document_uplift_pipeline.py::test_async_queue_worker_uses_run_in_executor tests\test_document_uplift_pipeline.py::test_get_case_marks_stale_running_pipeline_failed -q` returned `8 passed`.
- [x] `docker compose config --quiet` passed.
- [x] `docker compose ps redis celery_worker fastapi_api` showed Redis healthy, Celery worker up, and FastAPI healthy.
- [x] Runtime T4 smoke: created case `a11738aa-c8a7-431d-a951-a8b68bf6d894`, seeded it in Docker-network Mongo as stale `status.stage="analyzing"` with `pipeline_status="running"`, recreated FastAPI with `docker compose up -d --force-recreate fastapi_api`, then fetched the case. It returned `status.stage="failed"`, `pipeline_status="failed"`, and `pipeline_error="Document Uplift pipeline stale for more than 3600 seconds"`.
- [x] Runtime retry smoke: `POST /document-uplift/cases/a11738aa-c8a7-431d-a951-a8b68bf6d894/run-pipeline` returned `queued` with `task_backend="asyncio"`, and the case reached `review_ready` with `pipeline_status="success"`.
- [x] Runtime cleanup: deleted smoke case `a11738aa-c8a7-431d-a951-a8b68bf6d894`; delete returned HTTP `204`.
- [x] Redis direct check passed: `docker compose exec -T redis redis-cli ping` returned `PONG`.
- [x] Celery worker check passed: `docker compose exec -T celery_worker celery -A utils.sop_processing.celery_app inspect ping --timeout=10` returned `celery@0e70c7eef565: OK` / `pong`.
- [x] Celery logs confirm the worker is connected to `redis://redis:6379/0`, declares queues `document_uplift`, `conversion`, `chunking`, `excel`, `llm`, `analysis`, and `outputs`, and has the corresponding tasks registered.

**Redis perspective:** No functional Redis/Celery closeout item remains. The only non-blocking hardening note from logs is Celery's standard warning that the worker runs as root; this is not a T4 or Redis-readiness blocker, but can be handled later by adding a non-root user to the API image/worker service.

**Next item:** Create the final Document Uplift architecture/components/process document.

**Blockers:** None.

**Plan deviations:** None.

---

## [2026-05-11] Final Document Uplift architecture reference

**Plan items addressed:** Final architecture/components/process closeout document

**Files created:**
- `docs/document-uplift-architecture.md` - final reference for Document Uplift architecture, components, Stage 1/Stage 2 process, storage, Redis/Celery, reliability, configuration, severity/confidence bands, and domain-agnostic principles.

**Files modified:**
- `docs/document-uplift-build-log.md` - recorded final architecture document creation.
- `docs/HANDOFF.md` - updated current status to point to the final architecture reference.

**Verified:**
- [x] The deferred architecture path from the addendum now exists: `docs/document-uplift-architecture.md`.
- [x] The document records that Checkpoint C, T4, T8, T9, Redis/Celery readiness, and Items 1-33/23b/26a are complete.

**Next item:** None from the original Document Uplift plan.

**Blockers:** None.

**Plan deviations:** None.

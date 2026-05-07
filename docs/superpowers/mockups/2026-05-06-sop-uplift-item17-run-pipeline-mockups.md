# SOP Uplift Item 17 UI Mockups - Run-Pipeline Only

**Plan item:** Track A Item 17 - deprecate frontend batch polling and enforce single `run-pipeline` trigger  
**Review status:** Awaiting human review before UI implementation  
**Scope:** Existing SOP Uplift page only. No Document Uplift screens yet.

## Design Basis

**Visual thesis:** Keep the existing TRACE workbench structure, but make extraction feel like one reliable backend job instead of a manual step-through loop.

**Content plan:** Upload/tag readiness -> one extraction action -> running status dialog -> review suggestions -> outputs gate.

**Interaction thesis:** One primary CTA starts the job; progress is read-only and resilient; failure states give a retry path without exposing `/extract` or `/analyze` batch mechanics.

## Behavior Changes To Review

- Remove frontend calls to `POST /extract`.
- Remove frontend calls to `POST /analyze`.
- Remove "Analyze this section" from SOP preview highlights.
- Remove "Continue Analysis" from the review section.
- Keep `POST /run-pipeline` as the only extraction/analysis trigger.
- Keep polling only for `GET /tasks/pipeline` status.
- Keep existing outputs flow, enabled only after pipeline status is `complete`.

## Screen 1 - Ready To Run

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ SOP Uplift                                                                  │
│ Upload SOPs, policies, control matrices, risks, evidence, and diagrams.      │
└──────────────────────────────────────────────────────────────────────────────┘

┌ CASE SETUP & UPLOAD ────────────────────────────────────────────────────────┐
│ [Case details] [Upload buckets] [Tag review table]                           │
│                                                                              │
│ Readiness: Ready for extraction                                               │
│ Required: SOP/procedure found                                                 │
│ Recommended: RCM, risk register, evidence                                     │
│                                                                              │
│ [Play icon] Run Extraction                                                    │
└──────────────────────────────────────────────────────────────────────────────┘

┌ PROCESS STATUS ──────────────────────────────────────────────────────────────┐
│ Extraction      not started                                                  │
│ Analysis        not started                                                  │
│ Suggestions     0 open                                                        │
│ Outputs         locked                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Primary CTA:** `Run Extraction`  
**Disabled when:** readiness cannot analyze, upload/tag step incomplete, or a pipeline is already running.  
**Removed controls:** no per-section analyze buttons, no continue-analysis button.

## Screen 2 - Pipeline Running Dialog

```text
┌ Running Extraction ──────────────────────────────────────────────────────────┐
│ TRACE is reviewing case files. You can leave this page and return later.      │
│                                                                              │
│ [████████████████░░░░░░░░░░░░░░] 42% complete                                │
│                                                                              │
│ Current phase: Analyzing procedural sections                                  │
│ Completed: 42 / 100                                                           │
│ Pending:   58                                                                 │
│                                                                              │
│ Recent warnings                                                               │
│ - Converted access_sop.docx with layout warning                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Dialog remains modal-style:** status only, no manual batch controls.  
**Close behavior:** dialog can close when complete or failed; polling continues while the page is open.  
**Copy note:** avoid saying "batch", "chunk", `/extract`, or `/analyze`.

## Screen 3 - Review Ready

```text
┌ REVIEW SUGGESTIONS ──────────────────────────────────────────────────────────┐
│ Extraction complete. Review the suggested SOP changes before generating       │
│ outputs.                                                                      │
│                                                                              │
│ Open 12    Accepted 0    Rejected 0    Edited 0                               │
│                                                                              │
│ [Suggestion queue]             [SOP preview with highlights]                  │
│ - Add control owner            No "Analyze this section" button               │
│ - Add review frequency         Highlights open the suggestion drawer/list item │
│ - Add evidence retention       Review actions remain unchanged                │
└──────────────────────────────────────────────────────────────────────────────┘

┌ OUTPUTS & REPORTS ───────────────────────────────────────────────────────────┐
│ [Generate Outputs] enabled after extraction complete                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Removed control:** `Continue Analysis`.  
**Review workflow:** unchanged after suggestions exist.

## Screen 4 - Failed Or Stale Pipeline

```text
┌ PROCESS STATUS ──────────────────────────────────────────────────────────────┐
│ Extraction failed                                                             │
│ The previous pipeline run was marked stale and can be retried.                │
│                                                                              │
│ Error detail                                                                  │
│ Previous pipeline run was marked stale after 3600 seconds and can be retried. │
│                                                                              │
│ [Refresh icon] Retry Extraction                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Retry action:** calls `POST /run-pipeline` again.  
**No recovery controls:** do not reveal legacy batch endpoints.

## Screen 5 - Review Ready With No Suggestions

```text
┌ REVIEW SUGGESTIONS ──────────────────────────────────────────────────────────┐
│ No suggestions generated                                                      │
│ The uploaded document appears to contain only boilerplate sections such as     │
│ purpose, scope, definitions, or references. Upload a document with procedural  │
│ content to generate suggestions.                                              │
│                                                                              │
│ [Upload Additional SOP]   [Retry Extraction]                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Reason:** required by TC-11 so `review_ready` with zero suggestions never appears blank.  
**Source:** display `processing_state.pipeline.warnings` when present.

## Implementation Notes After Approval

- Keep existing page structure and visual language; no new route.
- In `kpmg_ui/client/src/pages/sop-uplift.tsx`, remove `continueAnalysis()` and any `fetch(.../analyze)` call sites.
- Remove `onAnalyzeSection` behavior from preview highlights or pass no-op/undefined so per-section buttons disappear.
- Preserve `startPipeline()` and `refreshPipelineTask()`, but ensure the task id is always `pipeline`.
- Keep backend batch endpoints available for compatibility unless a later plan item removes them server-side.

# TRACE UI Overhaul Log

This log records page-by-page UI overhaul decisions, implementation scope, verification, and follow-up items. Use it as the starting reference before redesigning another page.

## Dashboard

Date: 2026-05-04

### Design Intent

Create a page-local operational overview for TRACE without changing existing app behavior. The page shows only current metrics, statuses, and charts from existing page data sources.

### Approved Mockup Notes

- Four local tabs: `Overview`, `Libraries`, `Workflows`, and `Exceptions`.
- `Overview` is the default first screen and now follows the later option-3 direction: compact dark `DASHBOARD` banner, four number-first KPI cards, a three-chart operational row, and a lower `Reports By Type` / `Domain Coverage` row.
- KPI cards were revised to match the later reference crop: no KPI icons, larger metric values, muted uppercase labels, source-backed pills, and softer rounded white cards.
- `Libraries` contains regulatory, controls, and frameworks metrics, charts, cross-library diagnostics, and coverage summary.
- `Workflows` contains activity metrics for risk assessment, control testing, regulatory testing, final reporting, SOP Uplift, and reports; `Testing Sessions By Status` was moved here from `Overview`.
- `Exceptions` contains issue, validation queue, failed control, gap, duplicate, and risk-band signals.
- Shared chart fixes applied: long labels rotate instead of colliding, donut charts now use a centered framed layout, and horizontal / segmented charts use a common fill animation.
- `Chat Activity` was removed from the dashboard because it was not a useful first-class dashboard signal.

### Files Changed

- `kpmg_ui/client/src/pages/dashboard.tsx`
- `kpmg_ui/client/src/dashboard.overhaul.test.ts`
- `docs/ui-overhaul/dashboard-design.md`
- `docs/ui-overhaul/dashboard-option-3-mockups.html`
- `docs/ui-overhaul/dashboard-option-3-chart-system.html`
- `docs/ui-overhaul/ui-overhaul-log.md`

### Data Sources Preserved

- `useLibraryMetrics()`
- `useCrossNav()`
- `useAssetRegistry()`
- `useRiskAssessment()`
- `useIssueManagement()`
- `/api/settings/system-status`
- `/api/control-testing`
- `/api/rcm-reports`
- `/api/sop-uplift/cases`
- `/api/frameworks-library/documents`
- `/api/frameworks-library/all-elements`
- Existing route navigation through `setLocation(...)`

### Functionality Deliberately Untouched

- App shell, sidebar, footer, auth, route mounting, and providers.
- Backend APIs and persistent data model.
- Existing module workflows and endpoint contracts.
- Dashboard v1 does not introduce `/api/dashboard-summary`.

### Test Results

- `node --import tsx .\client\src\dashboard.overhaul.test.ts`: passed.
- `npm run check`: passed.
- `npm run build`: passed. Vite emitted existing chunk-size and PostCSS `from` option warnings.
- Browser smoke on `http://localhost:5175/`: passed. Verified sign-in, Dashboard render, `Libraries` / `Workflows` / `Exceptions` tab switches, refresh click, mobile resize at 390 x 844, and zero browser console errors.

### Follow-Up Items

- Consider a backend summary endpoint only after repeated direct reads become a measurable performance issue.
- Keep Dashboard empty states numeric and source-backed.
- Browser smoke the updated chart frames and label behavior on `Overview`, `Libraries`, and `Workflows`.
- Use the Dashboard tab and documentation pattern as the reference for later page overhauls.

## Controls Library

Date: 2026-05-04

### Design Intent

Create a page-local, one-scroll Controls Library workspace that preserves upload, documents, obligation mapping, merged controls, quality analysis, filters, export, and detail review behavior while aligning the page with the approved KPMG TRACE mockups.

### Approved Mockup Notes

- Keep `Upload Policy Documents` as a vertical, full-width upload bar with policy context, dropzone, queued files, and `Extract Controls`.
- Keep `Documents` below upload with the visible action row: `Dashboard`, `Merged`, refresh, and `Map Obligations`.
- Replace duplicate `Overview` / `Quality Analysis` tabs with one scoped `Library Dashboard`.
- Scope control supports `All Uploaded Database` and `Selected Document`.
- Dashboard cards use number-first white KPI cards with thin accent bars.
- Lower-page sections preserve `Domain Distribution`, `Controls-Obligations Coverage`, `5W1H Quality Charts`, `5W1H Scores by Control`, `Export CSV`, and the control detail modal.
- 5W1H metrics now stay `Data not available` until `Run Quality Check` is clicked successfully.
- Backend quality fallback rows marked `Analysis unavailable` are excluded from visual scoring instead of being counted as real red findings.
- Graph colors and chart typography were standardized to TRACE/KPMG tokens, and the control detail modal was restyled to match the light page surface.
- `Map Obligations` and quality scoring are now surfaced as one `Run Analysis` action. It refreshes mappings first and then runs 5W1H quality scoring.
- `Quality RAG by Process Area` now uses custom TRACE-styled stacked bars with explicit `Tagged Domains` pills so extracted domain tags are readable.

### Files Changed

- `kpmg_ui/client/src/pages/controls-library.tsx`
- `kpmg_ui/client/src/controls-library.overhaul.test.ts`
- `docs/ui-overhaul/controls-library-design.md`
- `docs/ui-overhaul/ui-overhaul-log.md`

### Data Sources Preserved

- `/api/controls-library/documents`
- `/api/controls-library/documents/{document_id}`
- `/api/controls-library/ingest`
- `/api/ingest-task/{task_id}`
- `/api/controls-library/remap-obligations`
- `/api/controls-library/all-controls`
- `/api/controls-library/merged`
- `/api/controls-library/quality-analysis`
- Existing `useCrossNav()` and `useLibraryMetrics()`

### Functionality Deliberately Untouched

- Route mounting, app shell, auth, providers, and backend contracts.
- Upload, polling, delete, clear library, remap obligations, merged view, quality analysis, CSV export, and mapped obligation navigation.
- Existing control detail modal behavior and data fields.
- 413 payload fix keeps the same quality-analysis endpoint but sends capped, batched frontend requests so larger uploaded control libraries do not exceed the Express JSON request limit.
- The backend quality-analysis endpoint remains unchanged. The page only changes when and how frontend quality results are displayed.

### Test Results

- `node --import tsx .\client\src\controls-library.overhaul.test.ts`: passed.
- `npm run check`: passed.
- `npm run build`: passed. Vite emitted existing chunk-size and PostCSS `from` option warnings.
- `docker compose build web_ui_agent`: passed.
- `docker compose up -d --force-recreate web_ui_agent`: passed.
- 413 fix rerun: `node --import tsx .\client\src\controls-library.overhaul.test.ts`, `npm run check`, `npm run build`, `docker compose build web_ui_agent`, and `docker compose up -d --force-recreate web_ui_agent` passed.
- Quality unavailable-state and style guard rerun: `node --import tsx .\client\src\controls-library.overhaul.test.ts` and `npm run check` passed.
- Combined analysis action and process-area chart guard rerun: `node --import tsx .\client\src\controls-library.overhaul.test.ts` and `npm run check` passed.
- `docker compose ps`: `agent_assess_web_Trace_KV` healthy on port 5000.
- `Invoke-WebRequest http://localhost:5000/`: HTTP 200.
- Browser smoke via Playwright CLI was attempted but blocked because the local Chrome distribution was missing and `install-browser chrome` failed due insufficient install privileges.

### Follow-Up Items

- Browser smoke test the one-page scroll, document selection scope, `Map Obligations`, merged view, filters, export button visibility, and modal open/close after rebuild.

## Regulatory Testing

Date: 2026-05-05

### Design Intent

Create a page-local Regulatory Testing workspace that keeps existing comparison functionality intact while making both setup and post-run review easier to understand. The page now frames the work as `Regulation vs Regulation` or `RCM vs Regulation`, then turns results into an operational comparison workbench instead of separate dark data dumps.

### Approved Mockup Notes

- Use the same KPMG TRACE shell and hero.
- Show `Regulation vs Regulation` and `RCM vs Regulation` as explicit comparison paths.
- Keep upload and library selection in the landing/setup state.
- Keep a `Run Readiness` card with `Data not available` until required inputs exist.
- After analysis, show a source strip, `Summary`, `Domain Drilldown`, `Gap Analysis`, and `Report`.
- Surface concise metrics and review areas from live analysis data only.
- Preserve export JSON, report, PDF, and new comparison actions.

### Files Changed

- `kpmg_ui/client/src/pages/regulatory-testing.tsx`
- `kpmg_ui/client/src/regulatory-testing.overhaul.test.ts`
- `docs/ui-overhaul/regulatory-testing-design.md`
- `docs/ui-overhaul/ui-overhaul-log.md`

### Data Sources Preserved

- `/api/regulatory-library/documents`
- `/api/compare-regulations`
- `/api/rcm_compliance_v2`
- `/api/rcm_compliance`
- `/api/regulatory-library/gap-analysis/pdf`
- Existing `RegulatoryTestingContext` state and helper functions.

### Functionality Deliberately Untouched

- Route mounting, app shell, providers, and backend contracts.
- Regulation A/B upload and library selection.
- RCM document upload.
- RCM regulation source selection from library or upload.
- Existing FormData payloads, run handler, reset handler, and export handlers.

### Test Results

- Red step captured: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` failed before implementation because the new result-view model and smoke markers were absent.
- `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts`: passed.
- `node --import tsx .\client\src\pages\regulatory-testing.helpers.test.ts`: passed.
- `npm run check`: passed.
- `npm run build`: passed. Vite emitted existing chunk-size and PostCSS `from` option warnings.
- `docker compose build web_ui_agent`: passed.
- `docker compose up -d --force-recreate web_ui_agent`: passed after paused containers were unpaused.
- `Invoke-WebRequest http://localhost:5000/regulatory-testing`: HTTP 200.
- Browser smoke via Playwright CLI on Microsoft Edge: passed for seeded local sign-in, Reg-vs-Reg setup render, RCM-vs-Reg mode switch, disabled run/readiness states, mobile viewport resize at 390 x 844, and zero console errors/warnings.
- Setup layout correction rerun: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` and `npm run check` passed. Containers were not rebuilt for this correction per active UI testing request.
- Result presentation correction rerun: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` and `npm run check` passed. The result workbench now uses shortened source labels, plain-language summary text, `Coverage By Domain`, `Gap Matrix`, and `Formatted Report`; containers were not rebuilt per active UI testing request.

### Follow-Up Items

- Run a real Reg-vs-Reg comparison and RCM-vs-Reg comparison with sample files once backend containers are available.

## Risk Assessment

Date: 2026-05-06

### Design Intent

Create a page-local Risk Assessment overhaul that keeps the workflow and endpoints intact while replacing the older generic workbench with a clearer TRACE-style assessment experience.

### Approved Mockup Notes

- Keep the existing app shell and route.
- Follow the newer TRACE page language used across the recent overhaul work.
- Keep the current feature workflow intact:
  - assessment dashboard
  - create assessment
  - questionnaire
  - analysis running
  - identified risks
  - control application
  - residual risk
  - final report
- Keep the left app navigation and Risk Assessment route identity.
- Treat each wizard stage as its own clear review surface instead of one long generic workbench.
- Use only realistic utility copy and workflow labels.

### Files Changed

- `kpmg_ui/client/src/pages/risk-assessment.tsx`
- `kpmg_ui/client/src/risk-assessment.overhaul.test.ts`
- `docs/ui-overhaul/risk-assessment-design.md`
- `docs/ui-overhaul/risk-assessment-mockups.html`
- `docs/ui-overhaul/risk-assessment-mockups-board-1.svg`
- `docs/ui-overhaul/risk-assessment-mockups-board-2.svg`
- `docs/ui-overhaul/ui-overhaul-log.md`
- `docs/HANDOFF.md`

### Data Sources Preserved

- `useRiskAssessment()`
- `useAssetRegistry()`
- `GET /api/risk-assessment/{id}` refresh path

### Functionality Deliberately Untouched

- Risk assessment providers, APIs, contracts, and wizard behavior.
- Any non-risk-assessment page or shared shell logic.

### Test Results

- `node --import tsx .\client\src\risk-assessment.overhaul.test.ts`: passed.
- `npm run check`: passed.
- `npm run build`: passed. Vite emitted the existing chunk-size and PostCSS `from` option warnings.

### Follow-Up Items

- Browser smoke the redesigned flow after build verification.

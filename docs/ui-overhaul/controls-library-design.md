# Controls Library Page-Local UI Overhaul

## Design Intent

The Controls Library redesign keeps the existing ingestion, document management, obligation mapping, merged view, quality analysis, filtering, export, and detail modal behavior intact while changing the page into one scrollable operational workspace.

The page is organized for a reviewer who starts with upload/documents, then scans metrics, then drills into 5W1H quality and mapped obligations. No backend API or route changes are introduced.

## Approved Mockup Notes

- Keep the upload bar vertical and full-width, matching the current Controls Library reference: policy context, dropzone, queued files, and `Extract Controls`.
- Keep `Documents` directly below upload with the existing actions: `Dashboard`, `Merged`, refresh, clear, and a visible `Map Obligations`.
- Latest interaction update: `Map Obligations` and 5W1H quality scoring are presented as one `Run Analysis` action. The action first refreshes obligation mappings, then runs the quality check.
- Remove duplicate `Overview` / `Quality Analysis` dashboard tabs.
- Use one `Library Dashboard` with a scope control:
  - `All Uploaded Database`
  - `Selected Document`
- All KPI cards are number-first white cards with thin top accent bars.
- Preserve lower-page scrolling for domain distribution, controls-obligations coverage, 5W1H charts, 5W1H table, export, and the control detail modal.

## Data Sources Preserved

- `GET /api/controls-library/documents`
- `GET /api/controls-library/documents/{document_id}`
- `POST /api/controls-library/ingest`
- `GET /api/ingest-task/{task_id}`
- `DELETE /api/controls-library/documents/{document_id}`
- `DELETE /api/controls-library/all`
- `POST /api/controls-library/remap-obligations`
- `GET /api/controls-library/all-controls`
- `GET /api/controls-library/merged`
- `POST /api/controls-library/quality-analysis`
- Existing `useCrossNav()` and `useLibraryMetrics()` behavior

## Functionality Deliberately Untouched

- The `/controls-library` route and app shell.
- Upload file selection, queued file removal, model selection from `localStorage`, ingest polling, and post-ingest refresh.
- Document selection and document-level control loading.
- Delete document and clear library flows.
- Remap obligations flow and regulatory-library navigation from mapped obligation IDs.
- Merged controls fetch.
- Backend 5W1H quality analysis and CSV export.
- Existing control detail modal data: citation, description, metadata, keywords, 5W1H flags, and mapped obligations.

## Implementation Notes

- Added page-local scope state: `type ControlsDashboardScope = "all" | "selected-document"`.
- Dashboard metrics, domain bars, charts, and table filter against the active scope.
- `Merged` remains an action/view for deduplicated controls, not a second dashboard.
- Empty states are based on live absence of documents or quality results; no synthetic feed content is rendered.
- Quality analysis requests are batched and descriptions are capped before posting to `/api/controls-library/quality-analysis`. This preserves the existing endpoint while avoiding Express HTTP 413 errors for large uploaded control libraries.
- 5W1H-derived KPIs, charts, table scores, CSV export, and control quality details remain `Data not available` until the user explicitly runs `Run Quality Check`.
- Backend fallback rows whose rationale says `Analysis unavailable` are excluded from KPI/chart/table scoring and surfaced as unavailable analysis, not as real `0/6` red findings.
- Chart typography and graph colors are standardized to TRACE/KPMG tokens: Arial ticks/legends, KPMG blue/pacific/teal/purple/green/amber, and no off-palette category colors.
- `Quality RAG by Process Area` uses controlled TRACE typography instead of cramped chart-axis labels and exposes visible `Tagged Domains` pills based on the extracted control domain tags.
- The control detail modal was restyled as a light TRACE dialog while preserving citation, description, metadata, keywords, 5W1H flags, mapped obligations, and obligation navigation.

## Test Evidence

- `node --import tsx .\client\src\controls-library.overhaul.test.ts` passed on 2026-05-04.
- `npm run check` passed on 2026-05-04.
- `npm run build` passed on 2026-05-04.
- `docker compose build web_ui_agent` passed on 2026-05-04.
- `docker compose up -d --force-recreate web_ui_agent` passed on 2026-05-04.
- 413 fix verification repeated on 2026-05-04: `node --import tsx .\client\src\controls-library.overhaul.test.ts`, `npm run check`, `npm run build`, `docker compose build web_ui_agent`, and `docker compose up -d --force-recreate web_ui_agent`.
- Quality unavailable-state verification added on 2026-05-04: `node --import tsx .\client\src\controls-library.overhaul.test.ts` and `npm run check`.
- Combined analysis button and process-area domain tag verification added on 2026-05-04: `node --import tsx .\client\src\controls-library.overhaul.test.ts` and `npm run check`.
- `docker compose ps` showed `agent_assess_web_Trace_KV` healthy on port 5000.
- `Invoke-WebRequest http://localhost:5000/` returned HTTP 200.
- Playwright CLI browser smoke could not complete because the local Playwright Chrome distribution was missing and the attempted `install-browser chrome` failed due insufficient install privileges.

## Follow-Up Items

- Add browser smoke screenshots for desktop and mobile after the local container rebuild.
- Consider adding backend-provided per-document duplicate stats later if selected-document duplicate metrics become required.

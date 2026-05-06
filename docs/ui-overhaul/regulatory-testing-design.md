# Regulatory Testing Page-Local UI Overhaul

## Design Intent

Redesign `kpmg_ui/client/src/pages/regulatory-testing.tsx` as a focused comparison workspace while preserving the existing Regulatory Testing route, app shell, providers, upload flows, library selections, analysis endpoints, and export actions.

The previous page exposed setup and results as dark, tabbed data dumps. The redesign makes the first decision explicit: `Regulation vs Regulation` or `RCM vs Regulation`. After analysis, the page becomes a four-view workbench that answers the review questions first: what was compared, where the coverage aligns, where the differences are, and what needs review.

## Approved Mockup Notes

- Keep the existing TRACE/KPMG shell, hero, sidebar, route, and local context.
- Keep both functional paths:
  - `Regulation vs Regulation`
  - `RCM vs Regulation`
- Keep upload and library-source selection for both paths.
- Replace the heavy dark setup/result panels with light TRACE cards, section headers, white KPI tiles, readable tables, and concise review surfaces.
- Collapse the old result tabs into four views:
  - `Summary`
  - `Domain Drilldown`
  - `Gap Analysis`
  - `Report`
- Do not invent legal findings, feed text, or placeholder counts. Use `Data not available` where analysis has not produced a value.
- Preserve scrolling and all export actions.

## Files Changed

- `kpmg_ui/client/src/pages/regulatory-testing.tsx`
- `kpmg_ui/client/src/regulatory-testing.overhaul.test.ts`
- `docs/ui-overhaul/regulatory-testing-design.md`
- `docs/ui-overhaul/ui-overhaul-log.md`
- `docs/HANDOFF.md`

## Data Sources Preserved

- `GET /api/regulatory-library/documents`
- `POST /api/compare-regulations`
- `POST /api/rcm_compliance_v2`
- `POST /api/rcm_compliance`
- `POST /api/regulatory-library/gap-analysis/pdf`
- Existing `RegulatoryTestingContext` state for mode, uploaded regulation files, RCM file, selected library documents, processing status, and comparison results.

## Functionality Deliberately Untouched

- Route mounting and app shell.
- Upload/dropzone behavior for Regulation A, Regulation B, RCM document, and uploaded RCM baseline regulations.
- Library-document selection and multi-select behavior.
- FormData payload construction for regulation comparison and RCM comparison.
- Existing endpoint selection through `getRcmComparisonEndpoint(...)`.
- `handleRunComparison`, `handleExportResults`, `handleExportMarkdown`, `handleExportPdf`, and `handleNewComparison`.
- Existing backend response schemas and persistence behavior.

## Implementation Notes

- Added page-local result view state:
  - `type RegulatoryResultView = "summary" | "domain-drilldown" | "gap-analysis" | "report"`
- Added setup smoke markers for browser checks:
  - `data-regulatory-testing-landing`
  - `data-regulatory-testing-paths`
  - `data-regulatory-testing-reg-setup`
  - `data-regulatory-testing-rcm-setup`
  - `data-regulatory-testing-readiness`
- Added result smoke markers:
  - `data-regulatory-testing-source-strip`
  - `data-regulatory-testing-comparison-overview`
  - `data-regulatory-testing-domain-drilldown`
  - `data-regulatory-testing-gap-workbench`
  - `data-regulatory-testing-report-preview`
- Reg-vs-Reg summary surfaces source-backed controls, shared domains, source-only coverage, stringency status, coverage balance, difference rows, and priority review areas.
- RCM-vs-Reg summary reuses available filenames, domain reports, suggestion counts, executive summary, and report export behavior without generating synthetic content.
- Setup layout correction on 2026-05-05:
  - Regulation A/B source cards now use explicit high-contrast `Upload` / `Library` toggle buttons.
  - Library rows use explicit TRACE text colors so loaded regulations remain readable.
  - Source-card grids use bounded `minmax(0, 1fr)` columns, `min-w-0`, and compact scroll areas to avoid horizontal page overflow.
  - Library selection stays compact instead of expanding the setup surface with empty space.
- Result view correction on 2026-05-05:
  - Long raw source names are shortened for UI display while full names remain available as hover titles.
  - Summary now explains the comparison in plain language and uses source-backed counts only.
  - Removed confusing labels such as `Higher Stringency`, `From Analysis`, `Gap Workbench`, and `Domain Drilldown`.
  - Result tabs now use `Summary`, `Coverage By Domain`, `Gap Analysis`, and `Report`.
  - Gap Analysis now uses a direct source coverage matrix.
  - Report view is now `Formatted Report` with report-header styling and title-cased markdown headings.

## Test Evidence

- Red step: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` failed before implementation because the redesigned result view model and markers were absent.
- `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` passed on 2026-05-05.
- `node --import tsx .\client\src\pages\regulatory-testing.helpers.test.ts` passed on 2026-05-05.
- `npm run check` passed on 2026-05-05.
- `npm run build` passed on 2026-05-05. Vite emitted the existing chunk-size and PostCSS `from` option warnings.
- `docker compose build web_ui_agent` passed on 2026-05-05.
- `docker compose up -d --force-recreate web_ui_agent` passed on 2026-05-05 after paused containers were unpaused.
- `Invoke-WebRequest http://localhost:5000/regulatory-testing` returned HTTP 200 on 2026-05-05.
- Browser smoke via Playwright CLI on Microsoft Edge passed on 2026-05-05:
  - Signed in with the seeded local user.
  - Loaded `http://localhost:5000/regulatory-testing`.
  - Verified the Reg-vs-Reg setup state.
  - Switched to the RCM-vs-Reg setup state.
  - Verified `Data not available` readiness states before required inputs.
  - Resized to 390 x 844 for mobile smoke.
  - Browser console reported 0 errors and 0 warnings.
- Setup layout correction: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` and `npm run check` passed on 2026-05-05. Containers were not rebuilt for this correction per testing request.
- Result view correction: `node --import tsx .\client\src\regulatory-testing.overhaul.test.ts` and `npm run check` passed on 2026-05-05. Containers were not rebuilt for this correction per testing request.

## Follow-Up Items

- Verify both comparison paths with real sample files after backend services are available.
- Consider extracting the new result workbench into page-local subcomponents if the page continues to grow.

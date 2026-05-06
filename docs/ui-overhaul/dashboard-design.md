# Dashboard Page-Local UI Overhaul

## Design Intent

The Dashboard is the first page in the TRACE UI overhaul and is scoped to page-local changes only. It behaves as an operational overview: fast to scan, calm, and built from current TRACE records.

The implementation uses existing feature contexts and list endpoints only. It does not add a new backend dashboard summary endpoint or change any provider, route, shell, or feature behavior.

## Approved Mockup Notes

The approved structure is a tabbed dashboard inside the existing app shell:

- `Overview`: compact dark `DASHBOARD` banner, tabs, eight KPI tiles, four primary chart panels, and the lower `Domain Coverage` / `Testing Sessions By Status` row from the approved mockup.
- `Libraries`: regulatory, controls, and frameworks metrics plus coverage, quality, duplicate, and gap diagnostics.
- `Workflows`: activity metrics for risk assessment, control testing, regulatory testing, final reporting, SOP Uplift, reports, and chat.
- `Exceptions`: issue, validation queue, failed control, library gap, duplicate, and risk-band signals.

Visual direction:

- Align to the current KPMG TRACE dark hero and light operational workspace.
- Use restrained cards, section headers, brand color accents, and compact utility copy.
- Show only metrics, counts, statuses, and charts backed by current data sources.
- KPI cards follow the latest reference: number-first, no KPI icons, four-up rows, soft rounded white cards, a thin accent bar, muted uppercase labels, one supporting line, and an optional source-backed pill.
- Chart panels follow the same reference density: plain white cards, simple titles, larger plot area, footer totals, and minimal toolbar chrome.

## Data Sources Preserved

- `useLibraryMetrics()` remains the source for regulatory/control library metrics, charts, coverage, duplicates, and quality indicators.
- `useCrossNav()` remains the source for cross-page quality analysis navigation.
- `useAssetRegistry()`, `useRiskAssessment()`, `useIssueManagement()`, and `useChatContext()` provide current page state.
- `/api/settings/system-status`, `/api/control-testing`, `/api/rcm-reports`, `/api/sop-uplift/cases`, `/api/frameworks-library/documents`, and `/api/frameworks-library/all-elements` are read directly.
- Existing `setLocation(...)` navigation targets remain unchanged.

## Functionality Deliberately Untouched

- App shell, sidebar, footer, auth flow, route mounting, and providers.
- Regulatory library, controls library, control testing, risk assessment, issue management, reports, chat, and final reporting behavior.
- Backend APIs and MongoDB collections.
- Backend aggregation logic.

## Implementation Notes

- Page-local tab state uses `type DashboardTab = "overview" | "libraries" | "workflows" | "exceptions"`.
- The default active tab is `overview`.
- Browser smoke checks can target tab triggers via `data-dashboard-tab`.
- Empty states show `No Records`; no synthetic activity text is generated.

## Test Evidence

- `node --import tsx .\client\src\dashboard.overhaul.test.ts` passed on 2026-05-04.
- `npm run check` passed on 2026-05-04.
- `npm run build` passed on 2026-05-04.
- Browser smoke passed on 2026-05-04 against `http://localhost:5175/`:
  - signed in with the local default account;
  - verified Dashboard rendered from the source dev server;
  - clicked `Libraries`, `Workflows`, and `Exceptions` tabs;
  - clicked `Refresh Dashboard` and remained on `/`;
  - resized to 390 x 844 and checked the mobile-width snapshot;
  - checked browser console errors: 0.

## Follow-Up Items

- Consider a backend dashboard summary endpoint only after two or more feature pages expose stable summary contracts.
- Reuse this document format for each subsequent page overhaul.

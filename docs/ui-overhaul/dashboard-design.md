# Dashboard Page-Local UI Overhaul

## Design Intent

The Dashboard is the first page in the TRACE UI overhaul and is scoped to page-local changes only. It behaves as an operational overview: fast to scan, calm, and built from current TRACE records.

The implementation uses existing feature contexts and list endpoints only. It does not add a new backend dashboard summary endpoint or change any provider, route, shell, or feature behavior.

## Approved Mockup Notes

The approved structure is a tabbed dashboard inside the existing app shell, with the later option-3 chart-system refinements applied:

- `Overview`: compact dark `DASHBOARD` banner, four top KPI tiles, a three-chart operational row, and a lower `Reports By Type` / `Domain Coverage` row. `Testing Sessions By Status` is intentionally removed from this first page so the tab scans faster.
- `Libraries`: regulatory, controls, and frameworks diagnostics with rotated long-domain labels, balanced donut charts, and the same card rhythm as the rest of the dashboard.
- `Workflows`: activity metrics for risk assessment, control testing, regulatory testing, final reporting, and SOP Uplift, plus `Assessments By Status`, `Testing Sessions By Status`, `Control Test Results`, `SOP Cases By Status`, and `Reports By Type`.
- `Exceptions`: issue, validation queue, failed control, library gap, duplicate, and risk-band signals.

Visual direction:

- Align to the KPMG TRACE dark banner and light operational workspace.
- Use one consistent chart grammar across tabs: shared card frames, shared footer totals, shared legend spacing, and restrained chart motion.
- Show only metrics, counts, statuses, and charts backed by current data sources.
- KPI cards remain number-first, no KPI icons, soft rounded white cards, thin accent bars, muted uppercase labels, one supporting line, and source-backed pills.
- Donut charts now render inside a stable square chart frame with centered total text and a separated legend column.
- Long categorical x-axis labels rotate or compact instead of overlapping the plot area.
- Horizontal percent bars and segmented status charts animate with the same left-to-right fill motion.
- `Chat Activity` is removed from the dashboard.

## Data Sources Preserved

- `useLibraryMetrics()` remains the source for regulatory/control library metrics, charts, coverage, duplicates, and quality indicators.
- `useCrossNav()` remains the source for cross-page quality analysis navigation.
- `useAssetRegistry()`, `useRiskAssessment()`, and `useIssueManagement()` provide current page state.
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
- The shared bar-chart helper supports label-density modes so long labels can rotate on narrow cards.
- `Testing Sessions By Status` is rendered only in the `Workflows` tab.
- The dashboard chart system uses balanced donut framing and a shared `dashboardScaleX` animation for horizontal fills.

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
- Browser smoke the revised chart layout at desktop and mobile widths to confirm no label clipping or donut-frame crowding.
- Reuse this document format for each subsequent page overhaul.

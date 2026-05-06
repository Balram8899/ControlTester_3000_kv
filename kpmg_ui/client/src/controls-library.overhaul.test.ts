import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const source = read("client/src/pages/controls-library.tsx");

assert.doesNotMatch(
  source,
  /<<<<<<<|=======|>>>>>>>/,
  "Controls Library source should not contain merge conflict markers",
);

for (const endpoint of [
  "/api/controls-library/documents",
  "/api/controls-library/ingest",
  "/api/ingest-task/",
  "/api/controls-library/remap-obligations",
  "/api/controls-library/all-controls",
  "/api/controls-library/merged",
  "/api/controls-library/quality-analysis",
]) {
  assert.match(
    source,
    new RegExp(endpoint.replace(/[/-]/g, "\\$&")),
    `Controls Library should preserve existing endpoint ${endpoint}`,
  );
}

for (const handler of [
  "handleIngest",
  "handleDelete",
  "handleClearLibrary",
  "handleRemapObligations",
  "handleDocClick",
  "fetchMerged",
  "fetchQualityAnalysis",
  "exportQualityCSV",
  "setSelectedQualityControl",
  "handleObligationClick",
]) {
  assert.match(
    source,
    new RegExp(handler),
    `Controls Library should preserve existing ${handler} behavior`,
  );
}

assert.match(
  source,
  /type ControlsDashboardScope = "all" \| "selected-document"/,
  "Controls Library should add a page-local dashboard scope model",
);

for (const marker of [
  'data-controls-library-upload-bar="true"',
  'data-controls-library-actions="true"',
  'data-controls-library-scope="true"',
  'data-controls-library-unified-dashboard="true"',
  'data-controls-library-quality-charts="true"',
  'data-controls-library-quality-table="true"',
]) {
  assert.match(
    source,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Controls Library should expose ${marker} for browser smoke checks`,
  );
}

assert.doesNotMatch(
  source,
  /dashboardTab|setDashboardTab|Overview"\) \| "quality|Quality Analysis<\/>/,
  "Controls Library should not keep duplicate Overview / Quality Analysis dashboard tabs",
);

assert.match(
  source,
  /const QUALITY_ANALYSIS_BATCH_SIZE = \d+/,
  "Controls Library should cap quality-analysis request batches to avoid HTTP 413 payloads",
);

assert.match(
  source,
  /const QUALITY_ANALYSIS_DESCRIPTION_LIMIT = \d+/,
  "Controls Library should cap per-control quality-analysis descriptions to avoid oversized JSON payloads",
);

assert.match(
  source,
  /buildQualityPayloadControls/,
  "Controls Library should normalize quality-analysis payloads before sending them",
);

assert.match(
  source,
  /slice\(i, i \+ QUALITY_ANALYSIS_BATCH_SIZE\)/,
  "Controls Library should POST quality analysis in batches rather than one corpus-sized payload",
);

assert.doesNotMatch(
  source,
  /body:\s*JSON\.stringify\(\{\s*controls\s*\}\)/,
  "Controls Library should not POST the full controls array in a single quality-analysis request",
);

assert.match(
  source,
  /qualityAnalysisRequested/,
  "Controls Library should track whether the user explicitly ran quality analysis",
);

assert.doesNotMatch(
  source,
  /if \(ctrlsW1H\.length === 0 && !qualityLoading\)[\s\S]*?fetchQualityAnalysis\(/,
  "Controls Library should not auto-populate 5W1H metrics on page load",
);

assert.doesNotMatch(
  source,
  /const freshControls = await fetchAllControls\(\);[\s\S]{0,600}?fetchQualityAnalysis\(/,
  "Controls Library should not auto-run 5W1H analysis immediately after ingest",
);

assert.match(
  source,
  /Data not available/,
  "Controls Library should show an explicit unavailable state before quality analysis is run",
);

assert.match(
  source,
  /isUnavailableQualityResult/,
  "Controls Library should detect backend unavailable quality fallback rows",
);

assert.match(
  source,
  /qualityAvailable/,
  "Controls Library should tag quality rows as available before including them in metrics",
);

assert.match(
  source,
  /filter\(c => c\.qualityAvailable\)/,
  "Controls Library should exclude unavailable quality rows from charts and KPIs",
);

assert.match(
  source,
  /unavailable analysis/,
  "Controls Library should explain when backend quality analysis returned unavailable rows",
);

assert.match(
  source,
  /handleRunAnalysis/,
  "Controls Library should expose one combined Run Analysis action",
);

assert.match(
  source,
  /Run Analysis/,
  "Controls Library should label the combined obligations and quality action as Run Analysis",
);

assert.doesNotMatch(
  source,
  /Run Quality Check|Refresh Quality Check/,
  "Controls Library should not show a separate quality-analysis button when Run Analysis exists",
);

assert.match(
  source,
  /data-controls-library-domain-tags="true"/,
  "Controls Library process-area chart should show readable tagged domain pills",
);

assert.match(
  source,
  /ProcessAreaRagBars/,
  "Controls Library should render process-area RAG as controlled TRACE typography instead of cramped axis labels",
);

assert.match(
  source,
  /data-controls-library-detail-modal="true"/,
  "Controls Library control detail modal should expose a smoke-test marker after restyling",
);

assert.match(
  source,
  /CHART_TEXT_STYLE/,
  "Controls Library charts should centralize TRACE typography styling",
);

assert.match(
  source,
  /fontFamily:\s*"Arial"/,
  "Controls Library charts should use the TRACE/KPMG Arial typography",
);

for (const offPaletteColor of ["#F97316", "#8B5CF6", "#EC4899", "#10B981", "#0EA5E9"]) {
  assert.doesNotMatch(
    source,
    new RegExp(offPaletteColor, "i"),
    `Controls Library graphs should avoid off-palette color ${offPaletteColor}`,
  );
}

for (const label of [
  "Upload Policy Documents",
  "Policy Documents",
  "Documents",
  "Run Analysis",
  "All Uploaded Database",
  "Selected Document",
  "Library Dashboard",
  "Controls-Obligations Coverage",
  "Potential Duplicates",
  "Domain Distribution",
  "5W1H Quality Charts",
  "RAG Distribution",
  "5W1H Element Prevalence",
  "Quality RAG by Process Area",
  "5W1H Scores by Control",
  "Export CSV",
]) {
  assert.match(
    source,
    new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Controls Library should include the approved one-page section/metric label ${label}`,
  );
}

for (const forbidden of [
  /Future feed/i,
  /Feed planned/i,
  /coming soon/i,
  /lorem/i,
  /random AI/i,
]) {
  assert.doesNotMatch(
    source,
    forbidden,
    "Controls Library should not render generated/future placeholder feed copy",
  );
}

const designDoc = read("../docs/ui-overhaul/controls-library-design.md");
const overhaulLog = read("../docs/ui-overhaul/ui-overhaul-log.md");

assert.match(
  designDoc,
  /Controls Library Page-Local UI Overhaul/,
  "Controls Library design reference should describe this page-local overhaul",
);

assert.match(
  overhaulLog,
  /Controls Library/,
  "The running UI overhaul log should include the Controls Library entry",
);

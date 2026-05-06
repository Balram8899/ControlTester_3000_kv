import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const source = read("client/src/pages/regulatory-testing.tsx");
const designDocPath = "../docs/ui-overhaul/regulatory-testing-design.md";
const overhaulLogPath = "../docs/ui-overhaul/ui-overhaul-log.md";

assert.doesNotMatch(
  source,
  /<<<<<<<|=======|>>>>>>>/,
  "Regulatory Testing source should not contain merge conflict markers",
);

for (const endpoint of [
  "/api/regulatory-library/documents",
  "/api/compare-regulations",
  "/api/regulatory-library/gap-analysis/pdf",
]) {
  assert.match(
    source,
    new RegExp(endpoint.replace(/[/-]/g, "\\$&")),
    `Regulatory Testing should preserve endpoint ${endpoint}`,
  );
}

for (const preservedBehavior of [
  "getRcmComparisonEndpoint",
  "handleRunComparison",
  "handleExportResults",
  "handleExportMarkdown",
  "handleExportPdf",
  "handleNewComparison",
  "handleModeSwitch",
  "renderRegulationSlot",
  "dropzone-regulation",
  "dropzone-rcm-regulations",
  "dropzone-rcm",
  "button-run-comparison",
  "button-export-results",
  "button-export-markdown",
  "button-export-pdf",
  "button-new-comparison",
]) {
  assert.match(
    source,
    new RegExp(preservedBehavior.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Regulatory Testing should preserve ${preservedBehavior}`,
  );
}

assert.match(
  source,
  /type RegulatoryResultView = "summary" \| "domain-drilldown" \| "gap-analysis" \| "report"/,
  "Regulatory Testing should model the redesigned result views locally",
);

for (const marker of [
  'data-regulatory-testing-landing="true"',
  'data-regulatory-testing-paths="true"',
  'data-regulatory-testing-reg-setup="true"',
  'data-regulatory-testing-source-card="true"',
  'data-regulatory-testing-source-picker="true"',
  'data-regulatory-testing-library-list',
  'data-regulatory-testing-rcm-setup="true"',
  'data-regulatory-testing-readiness="true"',
  'data-regulatory-testing-source-strip="true"',
  'data-regulatory-testing-comparison-overview="true"',
  'data-regulatory-testing-domain-drilldown="true"',
  'data-regulatory-testing-gap-workbench="true"',
  'data-regulatory-testing-report-preview="true"',
]) {
  assert.match(
    source,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Regulatory Testing should expose ${marker} for browser smoke checks`,
  );
}

assert.match(
  source,
  /sourcePickerButtonClass/,
  "Regulation source picker should use explicit high-contrast local button styling",
);

assert.match(
  source,
  /aria-pressed=\{slot\.source === "library"\}/,
  "Regulation library source button should expose pressed state",
);

assert.match(
  source,
  /lg:grid-cols-\[minmax\(0,1fr\)_40px_minmax\(0,1fr\)\]/,
  "Regulation setup grid should bound both source columns to avoid horizontal page overflow",
);

assert.doesNotMatch(
  source,
  /lg:grid-cols-\[1fr_42px_1fr\]/,
  "Regulation setup grid should not use unbounded source columns that create side scroll",
);

assert.match(
  source,
  /max-h-48/,
  "Library regulation list should stay compact when source is switched to Library",
);

for (const label of [
  "Regulation vs Regulation",
  "RCM vs Regulation",
  "Analysis Setup",
  "Run Readiness",
  "Data not available",
  "Comparison Overview",
  "Coverage Balance",
  "Where The Differences Are",
  "Priority Review Areas",
  "Coverage By Domain",
  "Gap Matrix",
  "Formatted Report",
]) {
  assert.match(
    source,
    new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Regulatory Testing should include redesigned label ${label}`,
  );
}

for (const resultUiHelper of [
  "formatSourceName",
  "sourceALabel",
  "sourceBLabel",
  "comparisonInsight",
  "sourceAGapCount",
  "sourceBGapCount",
  "renderCoverageByDomain",
  "renderGapMatrix",
  "renderFormattedReport",
]) {
  assert.match(
    source,
    new RegExp(resultUiHelper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Regulatory Testing results should include ${resultUiHelper}`,
  );
}

for (const confusingResultCopy of [
  "Higher Stringency",
  "From Analysis",
  "Gap Workbench",
  "Domain Drilldown",
  "Gap Heatmap",
  "Top Gaps To Resolve",
  "Controls Analysed",
]) {
  assert.doesNotMatch(
    source,
    new RegExp(confusingResultCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Regulatory Testing should not expose confusing result copy: ${confusingResultCopy}`,
  );
}

for (const offPaletteColor of ["#F97316", "#8B5CF6", "#EC4899", "#10B981", "#0EA5E9"]) {
  assert.doesNotMatch(
    source,
    new RegExp(offPaletteColor, "i"),
    `Regulatory Testing should avoid off-palette color ${offPaletteColor}`,
  );
}

for (const forbidden of [
  /lorem/i,
  /random AI/i,
  /generated feed/i,
  /coming soon/i,
]) {
  assert.doesNotMatch(
    source,
    forbidden,
    "Regulatory Testing should not render generated placeholder feed copy",
  );
}

assert.equal(
  fs.existsSync(path.resolve(designDocPath)),
  true,
  "Regulatory Testing design reference should exist",
);

assert.match(
  read(designDocPath),
  /Regulatory Testing Page-Local UI Overhaul/,
  "Regulatory Testing design reference should describe this page-local overhaul",
);

assert.match(
  read(overhaulLogPath),
  /Regulatory Testing/,
  "The running UI overhaul log should include the Regulatory Testing entry",
);

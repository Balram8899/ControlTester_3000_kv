import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const dashboardSource = read("client/src/pages/dashboard.tsx");

assert.doesNotMatch(
  dashboardSource,
  /<<<<<<<|=======|>>>>>>>/,
  "Dashboard source should not contain merge conflict markers",
);

assert.match(
  dashboardSource,
  /type DashboardTab = "overview" \| "libraries" \| "workflows" \| "exceptions"/,
  "Dashboard should define the page-local tab model for the overhaul",
);

assert.match(
  dashboardSource,
  /useState<DashboardTab>\("overview"\)/,
  "Dashboard should default to the Overview tab without changing routes",
);

for (const tab of ["overview", "libraries", "workflows", "exceptions"]) {
  assert.match(
    dashboardSource,
    new RegExp(`data-dashboard-tab="${tab}"`),
    `Dashboard should expose a ${tab} tab trigger for browser smoke checks`,
  );
}

assert.match(
  dashboardSource,
  /\/api\/settings\/system-status/,
  "Dashboard should preserve the existing system status endpoint",
);

for (const endpoint of [
  "/api/control-testing",
  "/api/rcm-reports",
  "/api/sop-uplift/cases",
  "/api/frameworks-library/documents",
  "/api/frameworks-library/all-elements",
]) {
  assert.match(
    dashboardSource,
    new RegExp(endpoint.replace(/[/-]/g, "\\$&")),
    `Dashboard should read real page data from ${endpoint}`,
  );
}

for (const hook of [
  "useAssetRegistry",
  "useRiskAssessment",
  "useIssueManagement",
  "useChatContext",
]) {
  assert.match(
    dashboardSource,
    new RegExp(hook),
    `Dashboard should consume existing ${hook} state instead of placeholder feed data`,
  );
}

assert.doesNotMatch(
  dashboardSource,
  /\/api\/dashboard-summary/,
  "Dashboard v1 should not add a new dashboard aggregation endpoint",
);

for (const forbidden of [
  /Future Feature Feed/i,
  /Future feed/i,
  /Feed planned/i,
  /V1 keeps/i,
  /coming soon/i,
]) {
  assert.doesNotMatch(
    dashboardSource,
    forbidden,
    "Dashboard should not render placeholder or generated future-feed copy",
  );
}

for (const label of [
  "DASHBOARD",
  "Last Refresh",
  "Library Documents",
  "Controls",
  "Assets",
  "Risk Assessments",
  "Testing Sessions",
  "Open Issues",
  "Reports",
  "Validation Queue",
  "Assets By Criticality",
  "Assessments By Status",
  "Testing Sessions By Status",
  "Issues By Severity",
  "Reports By Type",
  "Domain Coverage",
  "SOP Cases By Status",
]) {
  assert.match(
    dashboardSource,
    new RegExp(label),
    `Dashboard should include a real-data chart labelled ${label}`,
  );
}

assert.match(
  dashboardSource,
  /data-dashboard-banner="true"/,
  "Dashboard should include the compact dark dashboard banner from the approved mockup",
);

assert.match(
  dashboardSource,
  /function KpiMetricCard/,
  "Dashboard should use mockup-style KPI metric cards",
);

assert.match(
  dashboardSource,
  /data-dashboard-kpi-style="reference-number-card"/,
  "Dashboard KPI cards should use the reference number-first card style",
);

assert.match(
  dashboardSource,
  /xl:grid-cols-4/,
  "Dashboard KPI cards should render in four-up rows like the reference dashboard",
);

const designDoc = read("../docs/ui-overhaul/dashboard-design.md");
const overhaulLog = read("../docs/ui-overhaul/ui-overhaul-log.md");

assert.match(
  designDoc,
  /Dashboard Page-Local UI Overhaul/,
  "Dashboard design reference should describe this page-local overhaul",
);

assert.match(
  overhaulLog,
  /Dashboard/,
  "The running UI overhaul log should include the Dashboard entry",
);

for (const docSource of [designDoc, overhaulLog]) {
  assert.doesNotMatch(
    docSource,
    /Future feed|Feed planned|random|placeholder/i,
    "Dashboard documentation should reflect real metrics only",
  );
}

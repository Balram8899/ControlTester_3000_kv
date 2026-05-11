import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");
const layoutSource = fs.readFileSync(path.resolve("client/src/components/AppLayout.tsx"), "utf8");
const pagePath = path.resolve("client/src/pages/document-uplift.tsx");
const casePagePath = path.resolve("client/src/pages/document-uplift-case.tsx");

assert.match(appSource, /DocumentUpliftPage/, "App must import the Document Uplift page");
assert.match(appSource, /path:\s*"\/document-uplift"/, "App must expose the /document-uplift route");
assert.match(layoutSource, /Document Uplift/, "Sidebar must include Document Uplift");
assert.match(layoutSource, /badge:\s*"NEW"/, "Document Uplift sidebar entry must show a NEW badge");
assert.match(
  layoutSource,
  /Superseded by Document Uplift/,
  "SOP Uplift sidebar entry must explain that Document Uplift supersedes it",
);

assert.ok(fs.existsSync(pagePath), "Document Uplift page file must exist");
assert.ok(fs.existsSync(casePagePath), "Document Uplift case page file must exist");
const pageSource = fs.readFileSync(pagePath, "utf8");
const casePageSource = fs.readFileSync(casePagePath, "utf8");
const combinedSource = `${pageSource}\n${casePageSource}`;

[
  "/api/document-uplift/cases",
  "/api/document-uplift/cases/${caseId}",
  "/api/document-uplift/cases/${caseId}/upload",
  "/api/document-uplift/cases/${caseId}/run-pipeline",
  "/api/document-uplift/cases/${caseId}/suggestions",
  "/api/document-uplift/cases/${caseId}/suggestions/${suggestionId}",
  "/api/document-uplift/cases/${caseId}/suggestions/bulk-review",
  "/api/document-uplift/cases/${caseId}/generate-outputs",
  "/api/document-uplift/cases/${caseId}/outputs/${output.output_id}",
].forEach((endpoint) => {
  assert.match(combinedSource, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${endpoint} must be wired`);
});

[
  "Your Cases",
  "Upload and Tag Documents",
  "Decision Queue",
  "Document Library",
  "Review Suggestions",
  "Generated Outputs",
  "Accept All",
  "Reject All",
  "Move To Export",
  "Cost",
].forEach((label) => {
  assert.match(combinedSource, new RegExp(label), `${label} must be present in the Item 29 UI`);
});

assert.match(pageSource, /data-testid="document-uplift-page"/);
assert.match(casePageSource, /ActionButton label="Run Pipeline"/, "Run Pipeline must live in the processing workspace");
assert.match(casePageSource, /ActionButton label="Generate Outputs"/, "Generate Outputs must live in the export workspace");
assert.doesNotMatch(casePageSource, /data-testid="document-uplift-run-pipeline"/, "Run Pipeline must not be duplicated in the top shell nav");
assert.doesNotMatch(casePageSource, /data-testid="document-uplift-generate-outputs"/, "Generate Outputs must not be duplicated in the top shell nav");

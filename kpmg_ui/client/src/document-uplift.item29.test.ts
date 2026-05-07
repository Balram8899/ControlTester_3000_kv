import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");
const layoutSource = fs.readFileSync(path.resolve("client/src/components/AppLayout.tsx"), "utf8");
const pagePath = path.resolve("client/src/pages/document-uplift.tsx");

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
const pageSource = fs.readFileSync(pagePath, "utf8");

[
  "/api/document-uplift/cases",
  "/api/document-uplift/cases/${selectedCaseId}",
  "/api/document-uplift/cases/${selectedCaseId}/upload",
  "/api/document-uplift/cases/${selectedCaseId}/run-pipeline",
  "/api/document-uplift/cases/${selectedCaseId}/suggestions",
  "/api/document-uplift/cases/${selectedCaseId}/suggestions/${suggestionId}",
  "/api/document-uplift/cases/${selectedCaseId}/suggestions/bulk-review",
  "/api/document-uplift/cases/${selectedCaseId}/generate-outputs",
  "/api/document-uplift/cases/${selectedCaseId}/outputs/${output.output_id}",
].forEach((endpoint) => {
  assert.match(pageSource, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${endpoint} must be wired`);
});

[
  "Case Explorer",
  "Upload and Tag Documents",
  "Suggestion Queue",
  "Document Review",
  "Source References",
  "Generated Outputs",
  "Accept All",
  "Reject All",
  "REJECT_ALL",
  "auto-accepted",
  "Cost",
  "PIPELINE_STEPS",
].forEach((label) => {
  assert.match(pageSource, new RegExp(label), `${label} must be present in the Item 29 UI`);
});

assert.match(pageSource, /data-testid="document-uplift-page"/);
assert.match(pageSource, /data-testid="document-uplift-run-pipeline"/);
assert.match(pageSource, /data-testid="document-uplift-generate-outputs"/);

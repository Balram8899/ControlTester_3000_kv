import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const source = read("client/src/pages/risk-assessment.tsx");
const contextSource = read("client/src/contexts/RiskAssessmentContext.tsx");

assert.doesNotMatch(
  source,
  /<<<<<<<|=======|>>>>>>>/,
  "Risk Assessment source should not contain merge conflict markers",
);

for (const hook of ["useRiskAssessment", "useAssetRegistry", "useToast"]) {
  assert.match(
    source,
    new RegExp(hook),
    `Risk Assessment should preserve existing ${hook} usage`,
  );
}

for (const endpoint of ["/api/risk-assessment", "/api/risk-assessment/${assessmentId}"]) {
  assert.match(
    source,
    new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Risk Assessment should preserve existing endpoint path ${endpoint}`,
  );
}

assert.match(
  contextSource,
  /\/api\/risk-assessment\/sections/,
  "Risk Assessment should preserve section loading through the existing context endpoint",
);

for (const handler of [
  "createAssessment",
  "submitResponseBatch",
  "analyzeAssessment",
  "suggestControls",
  "applyControl",
  "fetchResidual",
  "generateReport",
]) {
  assert.match(
    source,
    new RegExp(handler),
    `Risk Assessment should preserve existing ${handler} behavior`,
  );
}

for (const marker of [
  'data-risk-assessment-page="true"',
  'data-risk-assessment-rail="true"',
  'data-risk-assessment-dashboard="true"',
  'data-risk-assessment-create="true"',
  'data-risk-assessment-stepper="true"',
  'data-risk-assessment-questionnaire="true"',
  'data-risk-assessment-analysis="true"',
  'data-risk-assessment-risks="true"',
  'data-risk-assessment-controls="true"',
  'data-risk-assessment-residual="true"',
  'data-risk-assessment-report="true"',
]) {
  assert.match(
    source,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Risk Assessment should expose ${marker} for browser smoke checks`,
  );
}

for (const label of [
  "Assessment Dashboard",
  "Create New Assessment",
  "Application Response Capture",
  "Running Risk Analysis",
  "Identified Risks",
  "Apply Controls To Risks",
  "Residual Risk Review",
  "Risk Assessment Report",
  "Define Assessment Scope",
  "Run The Questionnaire",
  "Review And Report",
]) {
  assert.match(
    source,
    new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Risk Assessment should include the redesigned screen label ${label}`,
  );
}

for (const forbidden of [
  /trace-workbench-shell/,
  /trace-workbench-layout/,
  /rightTab/,
  /No assessments yet\. Create one to get started\./,
]) {
  assert.doesNotMatch(
    source,
    forbidden,
    "Risk Assessment should no longer use the older workbench layout patterns",
  );
}

const designDoc = read("../docs/ui-overhaul/risk-assessment-design.md");
const overhaulLog = read("../docs/ui-overhaul/ui-overhaul-log.md");

assert.match(
  designDoc,
  /Risk Assessment/,
  "Risk Assessment design reference should exist",
);

assert.match(
  overhaulLog,
  /Risk Assessment/,
  "The running UI overhaul log should include the Risk Assessment entry",
);

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const pageSource = fs.readFileSync(path.resolve("client/src/pages/document-uplift-case.tsx"), "utf8");

assert.match(
  pageSource,
  /type SuggestionSeverity = "critical" \| "high" \| "medium" \| "low" \| "informational"/,
  "Document Uplift should support the full severity vocabulary",
);
assert.match(pageSource, /critical:/, "Severity badge styles must include critical");
assert.match(pageSource, /informational:/, "Severity badge styles must include informational");
assert.match(
  pageSource,
  /critical: 0,\s*high: 1,\s*medium: 2,\s*low: 3,\s*informational: 4/s,
  "Suggestion sorting must order critical before high/medium/low/informational",
);

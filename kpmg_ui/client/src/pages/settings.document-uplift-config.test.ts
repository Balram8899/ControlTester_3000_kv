import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const settingsSource = fs.readFileSync(path.resolve("client/src/pages/settings.tsx"), "utf8");

const llmProviderIndex = settingsSource.indexOf("LLM Provider");
const llmModelIndex = settingsSource.indexOf("LLM Model");
const pipelineControlsIndex = settingsSource.indexOf("Document Uplift Pipeline Controls");
const navigationVisibilityIndex = settingsSource.indexOf("Navigation Visibility");

assert.ok(llmProviderIndex >= 0, "Settings page must keep the existing LLM Provider card");
assert.ok(llmModelIndex >= 0, "Settings page must keep the existing LLM Model card");
assert.ok(navigationVisibilityIndex >= 0, "Settings page must keep the existing Navigation Visibility card");
assert.ok(pipelineControlsIndex >= 0, "Settings page must add the Document Uplift Pipeline Controls card");
assert.ok(
  llmProviderIndex < pipelineControlsIndex,
  "Document Uplift Pipeline Controls must be below the LLM Provider card",
);
assert.ok(
  pipelineControlsIndex < llmModelIndex,
  "Document Uplift Pipeline Controls must be inserted immediately before the existing LLM Model card",
);
assert.ok(
  pipelineControlsIndex < navigationVisibilityIndex,
  "Document Uplift Pipeline Controls must not replace the Navigation Visibility card",
);

assert.match(
  settingsSource,
  /fetch\("\/api\/settings\/document-uplift-config"\)/,
  "Settings page must fetch the Document Uplift pipeline config",
);
assert.match(
  settingsSource,
  /method:\s*"POST"[\s\S]*max_llm_calls_per_pipeline/,
  "Settings page must save max_llm_calls_per_pipeline with POST",
);
assert.match(
  settingsSource,
  /data-testid="input-document-uplift-max-llm-calls"/,
  "Settings page must expose a testable max LLM calls input",
);

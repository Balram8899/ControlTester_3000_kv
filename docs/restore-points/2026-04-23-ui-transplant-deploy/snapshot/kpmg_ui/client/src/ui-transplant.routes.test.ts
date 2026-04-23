import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");
const landingSource = fs.readFileSync(path.resolve("client/src/pages/landing.tsx"), "utf8");

assert.match(
  appSource,
  /controls-diagnostics/,
  "App routes should expose the transplanted Controls Diagnostics experience",
);

assert.doesNotMatch(
  landingSource,
  /path:\s*"\/risk-register"/,
  "Landing should not keep the fork's unresolved Risk Register link",
);

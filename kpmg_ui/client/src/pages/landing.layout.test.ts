import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const landingSource = readFileSync(resolve("client/src/pages/landing.tsx"), "utf8");

assert.equal(
  landingSource.includes("Control workspace"),
  false,
  "Landing page should not show the old Control workspace hero title",
);

assert.equal(
  landingSource.includes("landing-intro-panel"),
  false,
  "Landing page should go straight to the module tiles without the intro panel",
);

assert.match(
  landingSource,
  /landing-directory-panel/,
  "Landing page should group retained modules inside the new directory panel sections",
);

assert.match(
  landingSource,
  /kpmg-summary-panel/,
  "Landing page should include the transplanted operating summary panel",
);

assert.match(
  landingSource,
  /rounded-\[18px\]/,
  "Landing page should use the new rounded section surfaces introduced by the transplanted UI",
);

assert.match(
  landingSource,
  /Select a workspace below to begin/,
  "Landing page should preserve the workspace-entry call to action above the module directory",
);

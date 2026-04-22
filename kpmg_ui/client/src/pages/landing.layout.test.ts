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
  /rounded-\[22px\]/,
  "Landing module tiles should use a rounded Material-style surface",
);

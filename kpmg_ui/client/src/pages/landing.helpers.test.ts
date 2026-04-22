import assert from "node:assert/strict";

import { LANDING_MODULES } from "./landing.helpers";

assert.deepEqual(
  LANDING_MODULES.map((module) => module.title),
  [
    "Dashboard",
    "Regulatory Library",
    "Reports",
    "Asset Registry",
    "Risk Assessment",
    "Final Reporting",
    "Control Testing",
    "Chat",
    "Issue Management",
  ],
  "Landing should keep only the requested workspace cards in the requested order",
);

assert.equal(
  LANDING_MODULES.length,
  9,
  "Landing should reduce the workspace directory to nine destination cards",
);

assert.equal(
  LANDING_MODULES.some((module) => module.title === "Controls Library"),
  false,
  "Landing should no longer show the controls library card",
);

assert.equal(
  LANDING_MODULES.some((module) => module.title === "Frameworks Library"),
  false,
  "Landing should no longer show the frameworks library card",
);

assert.equal(
  LANDING_MODULES.some((module) => module.title === "Regulatory Testing"),
  false,
  "Landing should no longer show the regulatory testing card",
);

assert.equal(
  LANDING_MODULES.some((module) => module.title === "Settings"),
  false,
  "Landing should no longer show the settings card",
);

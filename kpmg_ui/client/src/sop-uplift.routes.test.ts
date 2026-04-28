import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");
const appLayoutSource = fs.readFileSync(path.resolve("client/src/components/AppLayout.tsx"), "utf8");
const landingSource = fs.readFileSync(path.resolve("client/src/pages/landing.tsx"), "utf8");
const reportsSource = fs.readFileSync(path.resolve("client/src/pages/reports.tsx"), "utf8");

assert.match(appSource, /sop-uplift/, "App routes should expose the SOP Uplift page");
assert.match(appLayoutSource, /SOP Uplift/, "Sidebar should include SOP Uplift");
assert.match(landingSource, /Upload SOPs, controls, risks, evidence, and diagrams/, "Landing should include the SOP Uplift tile copy");
assert.match(reportsSource, /SOP Uplift/, "Reports should recognize SOP Uplift records");
assert.match(reportsSource, /\/api\/sop-uplift\/cases/, "Reports should download SOP Uplift outputs through the SOP Uplift API");

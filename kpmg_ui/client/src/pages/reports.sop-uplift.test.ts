import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("client/src/pages/reports.tsx"), "utf8");

assert.match(source, /sop_uplift/, "Reports should recognize SOP Uplift report summaries");
assert.match(source, /Outputs & Reports/, "SOP Uplift reports should use the mockup reports heading");
assert.match(source, /Generated artifacts/, "SOP Uplift reports should render generated artifact cards");
assert.match(source, /Swimlane preview/, "SOP Uplift reports should include a swimlane preview section");
assert.match(source, /Control summary/, "SOP Uplift reports should include report-side control summary");
assert.match(source, /Risk summary/, "SOP Uplift reports should include report-side risk summary");

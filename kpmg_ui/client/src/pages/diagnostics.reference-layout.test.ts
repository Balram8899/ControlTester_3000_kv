import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const standalonePageSource = read("client/src/components/TraceStandalonePage.tsx");
const diagnosticsSource = read("client/src/pages/controls-diagnostics.tsx");
const riskCoverageSource = read("client/src/pages/risk-controls-coverage.tsx");
const qualitySource = read("client/src/pages/control-quality-analysis.tsx");

assert.match(
  standalonePageSource,
  /TraceNavBar/,
  "TraceStandalonePage should own the shared standalone page shell with the TRACE nav bar",
);

assert.match(
  diagnosticsSource,
  /<TraceStandalonePage/,
  "Controls Diagnostics should use the standalone TRACE page shell",
);

assert.equal(
  diagnosticsSource.includes("How It Works"),
  false,
  "Controls Diagnostics should not render the old instructional hero-forward filler section",
);

assert.match(
  riskCoverageSource,
  /<TraceStandalonePage/,
  "Risk Controls Coverage should use the standalone TRACE page shell",
);

assert.equal(
  riskCoverageSource.includes("How it works:"),
  false,
  "Risk Controls Coverage should not keep the old explanatory callout copy",
);

assert.match(
  qualitySource,
  /<TraceStandalonePage/,
  "Control Quality Analysis should use the standalone TRACE page shell",
);

assert.equal(
  qualitySource.includes("Assess control documentation quality using the"),
  false,
  "Control Quality Analysis should not keep the old long-form hero explainer copy",
);

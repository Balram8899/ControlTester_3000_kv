import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const dashboardSource = read("client/src/pages/dashboard.tsx");
const controlTestingSource = read("client/src/pages/control-testing.tsx");
const reportsSource = read("client/src/pages/reports.tsx");
const controlsLibrarySource = read("client/src/pages/controls-library.tsx");
const regulatoryLibrarySource = read("client/src/pages/regulatory-library.tsx");

assert.match(
  dashboardSource,
  /<TracePageBody/,
  "Dashboard should use the shared TracePageBody wrapper for the hero-forward rollout",
);

assert.match(
  controlTestingSource,
  /<TracePageBody/,
  "Control Testing should use the shared TracePageBody wrapper for the hero-forward rollout",
);

assert.match(
  reportsSource,
  /<TracePageBody/,
  "Reports should use the shared TracePageBody wrapper for the hero-forward rollout",
);

assert.match(
  controlsLibrarySource,
  /trace-workbench-shell/,
  "Controls Library should opt into the shared workbench shell hook",
);

assert.match(
  regulatoryLibrarySource,
  /trace-workbench-shell/,
  "Regulatory Library should opt into the shared workbench shell hook",
);

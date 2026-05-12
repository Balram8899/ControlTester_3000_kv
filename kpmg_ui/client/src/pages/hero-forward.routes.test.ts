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
  dashboardSource,
  /<HeroSection[\s\S]*title="Dashboard"/,
  "Dashboard should use the shared feature hero with TRACE landing back navigation",
);

assert.doesNotMatch(
  dashboardSource,
  /import TraceNavBar/,
  "Dashboard should not bypass the shared feature hero with a direct TraceNavBar-only header",
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
  controlsLibrarySource,
  /<HeroSection[\s\S]*title="Controls Library"/,
  "Controls Library should use the shared feature hero with TRACE landing back navigation",
);

assert.doesNotMatch(
  controlsLibrarySource,
  /<Footer \/>/,
  "Controls Library should rely on the AppLayout shell footer instead of rendering a duplicate page footer",
);

assert.match(
  regulatoryLibrarySource,
  /trace-workbench-shell/,
  "Regulatory Library should opt into the shared workbench shell hook",
);

assert.match(
  regulatoryLibrarySource,
  /<HeroSection[\s\S]*title="Regulatory Library"/,
  "Regulatory Library should use the shared feature hero with TRACE landing back navigation",
);

assert.equal(
  regulatoryLibrarySource.includes("Regulatory Corpus"),
  false,
  "Regulatory Library should not bypass the shared hero with a local corpus banner",
);

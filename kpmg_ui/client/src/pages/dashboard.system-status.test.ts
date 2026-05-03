import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dashboardSource = fs.readFileSync(path.resolve("client/src/pages/dashboard.tsx"), "utf8");

assert.match(
  dashboardSource,
  /fetch\("\/api\/settings\/system-status"\)/,
  "Dashboard should load live system status from the backend",
);

assert.match(
  dashboardSource,
  /systemStatus\?\.active_model/,
  "Dashboard active model should come from the live system status response",
);

assert.match(
  dashboardSource,
  /systemStatus\?\.regulatory_library\?\.documents/,
  "Dashboard regulatory library count should use live backend data",
);

assert.match(
  dashboardSource,
  /systemStatus\?\.controls_library\?\.documents/,
  "Dashboard controls library count should use live backend data",
);

assert.match(
  dashboardSource,
  /systemStatus\?\.platform\?\.status/,
  "Dashboard platform status should use live backend data",
);

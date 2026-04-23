import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve("package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
};

assert.equal(
  packageJson.scripts?.dev,
  "tsx scripts/dev-server.mjs",
  "The dev script should use a Windows-safe wrapper instead of inline Unix env assignment",
);

assert.equal(
  packageJson.scripts?.start,
  "node scripts/start-server.mjs",
  "The start script should use a Windows-safe wrapper instead of inline Unix env assignment",
);

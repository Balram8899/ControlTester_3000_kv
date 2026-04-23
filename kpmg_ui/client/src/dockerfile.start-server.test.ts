import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const dockerfileSource = readFileSync(resolve("Dockerfile"), "utf8");
const startScript = packageJson.scripts?.start ?? "";

if (startScript.includes("scripts/start-server.mjs")) {
  assert.match(
    dockerfileSource,
    /COPY --from=builder \/kpmg_ui\/scripts \.\/scripts/,
    "Docker runtime image must copy the scripts directory when npm start depends on scripts/start-server.mjs",
  );
}

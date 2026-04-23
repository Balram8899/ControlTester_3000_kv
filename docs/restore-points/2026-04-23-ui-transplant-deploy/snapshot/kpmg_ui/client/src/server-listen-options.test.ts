import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const serverSource = fs.readFileSync(
  path.resolve("server/index.ts"),
  "utf8",
);

assert.doesNotMatch(
  serverSource,
  /reusePort:\s*true/,
  "The server should not unconditionally enable reusePort because that breaks preview startup on Windows",
);

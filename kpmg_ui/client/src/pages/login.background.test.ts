import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loginSource = readFileSync(resolve("client/src/pages/login.tsx"), "utf8");

assert.match(
  loginSource,
  /function VisualPanel/,
  "Login page should define the full-width visual backdrop panel used by the transplanted UI",
);

assert.match(
  loginSource,
  /<VisualPanel \/>/,
  "Login page should render the visual backdrop behind the sign-in surface",
);

assert.match(
  loginSource,
  /max-w-\[420px\]/,
  "Login form should stay compact relative to the full-page visual backdrop",
);

assert.match(
  loginSource,
  /TRACE workspace/,
  "Login panel should preserve the TRACE workspace label in the transplanted shell",
);

assert.match(
  loginSource,
  /admin@bank\.com/,
  "Login page should preserve the local admin email flow used by the current repo state",
);

assert.equal(
  loginSource.includes("kpmguser"),
  false,
  "Login page should not switch to the fork-only kpmguser credential default",
);

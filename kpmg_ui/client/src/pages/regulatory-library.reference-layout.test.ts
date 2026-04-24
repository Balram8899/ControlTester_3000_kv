import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve("client/src/pages/regulatory-library.tsx"),
  "utf8",
);

assert.match(
  source,
  /TraceStatusRibbon/,
  "Regulatory Library should use the shared status ribbon primitive for the redesign",
);

assert.match(
  source,
  /TracePanel/,
  "Regulatory Library should use the shared panel primitive for the redesigned workbench",
);

assert.match(
  source,
  /overflowY:\s*"auto"/,
  "Regulatory Library left rail should explicitly preserve vertical scrolling because shared rail CSS defaults to overflow hidden",
);

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appLayoutSource = fs.readFileSync(
  path.resolve("client/src/components/AppLayout.tsx"),
  "utf8",
);
const brandOverrideCss = fs.readFileSync(
  path.resolve("client/src/styles/kpmg-brand-override.css"),
  "utf8",
);

assert.match(
  appLayoutSource,
  /w-\[154px\]/,
  "Sidebar should use the compact fixed-width rail from the KPMG reference",
);

assert.match(
  appLayoutSource,
  /kpmg-sidebar-logo-white/,
  "Sidebar should render the KPMG logo using the white-on-blue treatment",
);

assert.equal(
  appLayoutSource.includes("Control workspace"),
  false,
  "Sidebar should not show the previous workspace descriptor copy",
);

assert.match(
  appLayoutSource,
  /Last refreshed/,
  "Sidebar should include the quiet refresh timestamp footer",
);

assert.match(
  brandOverrideCss,
  /filter:\s*brightness\(0\)\s+invert\(1\)/,
  "Brand CSS should convert the transparent KPMG asset to white for the blue rail",
);

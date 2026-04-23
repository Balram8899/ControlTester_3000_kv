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
  /useState\(true\)/,
  "Sidebar should start in the collapsed state used by the fork UI",
);

assert.match(
  appLayoutSource,
  /Expand sidebar/,
  "Sidebar should include the collapse and expand control from the fork UI",
);

assert.equal(
  appLayoutSource.includes("button-theme-toggle"),
  false,
  "Fork shell should not keep the local top-header theme toggle",
);

assert.match(
  appLayoutSource,
  /<Footer \/>/,
  "App layout should render the shared footer below page content",
);

assert.match(
  appLayoutSource,
  /trace-shell-main/,
  "App layout should wrap authenticated content in the shared hero-forward shell surface",
);

assert.match(
  brandOverrideCss,
  /filter:\s*brightness\(0\)\s+invert\(1\)/,
  "Brand CSS should still support the white-logo treatment where it is used",
);

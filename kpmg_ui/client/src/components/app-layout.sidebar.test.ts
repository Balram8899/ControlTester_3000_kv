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
const traceNavSource = fs.readFileSync(
  path.resolve("client/src/components/TraceNavBar.tsx"),
  "utf8",
);
const footerSource = fs.readFileSync(
  path.resolve("client/src/components/Footer.tsx"),
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
  appLayoutSource,
  /trace-sidebar-brand/,
  "Sidebar brand area should use the shared shell header height token",
);

assert.match(
  appLayoutSource,
  /trace-sidebar-user/,
  "Sidebar user area should use the integrated shell footer treatment",
);

assert.match(
  traceNavSource,
  /Back to TRACE landing/,
  "Feature page breadcrumb ribbon should expose explicit back navigation to the TRACE landing page",
);

assert.match(
  footerSource,
  /flex-nowrap/,
  "Shell footer should stay compact instead of wrapping legal text into a tall block",
);

assert.match(
  brandOverrideCss,
  /--trace-shell-header-height:\s*80px/,
  "Brand CSS should define the shared top ribbon and sidebar header height",
);

assert.match(
  brandOverrideCss,
  /--trace-shell-footer-height:\s*30px/,
  "Brand CSS should define the compact feature shell footer height",
);

assert.match(
  brandOverrideCss,
  /filter:\s*brightness\(0\)\s+invert\(1\)/,
  "Brand CSS should still support the white-logo treatment where it is used",
);

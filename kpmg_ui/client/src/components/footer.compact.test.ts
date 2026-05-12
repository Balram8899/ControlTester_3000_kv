import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const footerSource = fs.readFileSync(
  path.resolve("client/src/components/Footer.tsx"),
  "utf8",
);
const brandOverrideCss = fs.readFileSync(
  path.resolve("client/src/styles/kpmg-brand-override.css"),
  "utf8",
);

assert.match(
  footerSource,
  /flex-nowrap/,
  "Shared footer should stay on one line inside the feature shell",
);

assert.match(
  footerSource,
  /text-\[9px\]/,
  "Legal footer copy should be smaller than normal product body copy",
);

assert.match(
  footerSource,
  /className="trace-footer__badge/,
  "Confidential label should use the shared compact badge styling",
);

assert.match(
  brandOverrideCss,
  /--trace-shell-footer-height:\s*30px/,
  "Brand footer should reserve the compact feature-shell height token",
);

assert.match(
  brandOverrideCss,
  /\.trace-footer__badge\s*{[\s\S]*?border-radius:\s*999px/,
  "Confidential badge should stay visually quiet and pill-shaped",
);

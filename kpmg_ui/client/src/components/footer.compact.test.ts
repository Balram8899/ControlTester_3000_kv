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
  /py-1(?:\s|")/,
  "Shared footer should use compact vertical padding",
);

assert.match(
  footerSource,
  /text-\[9\.5px\]/,
  "Legal footer copy should be smaller than normal product body copy",
);

assert.match(
  footerSource,
  /className="trace-footer__badge/,
  "Confidential label should use the shared compact badge styling",
);

assert.match(
  brandOverrideCss,
  /\.trace-footer\s*{[\s\S]*?min-height:\s*40px/,
  "Brand footer should reserve a compact, natural product-shell height",
);

assert.match(
  brandOverrideCss,
  /\.trace-footer__badge\s*{[\s\S]*?border-radius:\s*999px/,
  "Confidential badge should stay visually quiet and pill-shaped",
);

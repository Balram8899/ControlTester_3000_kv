import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const heroSectionSource = fs.readFileSync(
  path.resolve("client/src/components/HeroSection.tsx"),
  "utf8",
);

assert.match(
  heroSectionSource,
  /trace-page-hero/,
  "HeroSection should render the shared hero-forward section wrapper",
);

assert.match(
  heroSectionSource,
  /trace-page-hero__inner/,
  "HeroSection should include the shared hero content container",
);

assert.match(
  heroSectionSource,
  /subtitle/,
  "HeroSection should continue to support subtitle content inside the new hero shell",
);

assert.equal(
  heroSectionSource.includes("Active workspace"),
  false,
  "HeroSection should not inject workspace pill filler copy into page headers",
);

assert.equal(
  heroSectionSource.includes("Consistent shell, larger work surfaces, and clearer summary framing."),
  false,
  "HeroSection should not inject explanatory caption filler into page headers",
);

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const brandCss = fs.readFileSync(path.resolve("client/src/styles/kpmg-brand-override.css"), "utf8");

assert.match(
  brandCss,
  /\.hero-section\s*\{[\s\S]*?background:\s*#0C233C;/,
  "Shared TRACE feature ribbons should use the Asset Registry dark navy base colour",
);

assert.doesNotMatch(
  brandCss,
  /\.hero-section\s*\{[\s\S]*?background:\s*linear-gradient\(135deg,\s*#0c233c\s*0%,\s*#0f2f5f\s*52%,\s*#1e49e2\s*100%\)/i,
  "Shared TRACE feature ribbons should not use the previous bright cobalt sweep",
);

for (const orbToken of [
  "rgba(114, 19, 234, 0.45)",
  "rgba(30, 73, 226, 0.45)",
]) {
  assert.match(
    brandCss,
    new RegExp(orbToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Shared TRACE feature ribbons should keep the approved Asset Registry orb tone ${orbToken}`,
  );
}

for (const unchangedSizeToken of [
  "padding: 18px 24px 24px;",
  "padding: 14px 16px 22px;",
]) {
  assert.match(
    brandCss,
    new RegExp(unchangedSizeToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Shared TRACE feature ribbon sizing should remain unchanged: ${unchangedSizeToken}`,
  );
}

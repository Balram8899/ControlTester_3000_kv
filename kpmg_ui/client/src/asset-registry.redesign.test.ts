import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("client/src/pages/asset-registry.tsx"), "utf8");

assert.doesNotMatch(
  source,
  /<<<<<<<|=======|>>>>>>>/,
  "Asset Registry source should not contain merge conflict markers",
);

for (const marker of [
  'data-asset-registry-hero="true"',
  'data-asset-registry-kpis="true"',
  'data-asset-registry-inventory="true"',
  'data-asset-registry-inspector="true"',
  'data-asset-registry-detail="true"',
  'data-asset-registry-controls="true"',
  'data-asset-registry-create-panel="true"',
]) {
  assert.match(
    source,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Asset Registry should expose ${marker} for browser smoke checks`,
  );
}

for (const behavior of [
  "fetchAssets",
  "selectAsset",
  "createAsset",
  "deleteAsset",
  "suggestControls",
  "CiaRatingWidget",
  "handleCreate",
]) {
  assert.match(
    source,
    new RegExp(behavior),
    `Asset Registry redesign should preserve ${behavior}`,
  );
}

for (const label of [
  "Asset Registry",
  "Add Asset",
  "Asset Inventory",
  "Selected Asset",
  "Assets By Type",
  "Asset Dossier",
  "Controls Mapping",
  "Add Asset With CIA Rating",
]) {
  assert.match(
    source,
    new RegExp(label),
    `Asset Registry should include approved label ${label}`,
  );
}

for (const removedHeroControl of [
  "Asset Intelligence",
  "Filter Register",
  "SlidersHorizontal",
  "showFilters",
  'style={{ padding: "52px 0 56px" }}',
]) {
  assert.doesNotMatch(
    source,
    new RegExp(removedHeroControl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Asset Registry ribbon should not retain oversized hero/control marker ${removedHeroControl}`,
  );
}

assert.match(
  source,
  /<div className="h-full overflow-auto bg-\[#F0F2F7\]"/,
  "Asset Registry should use the TRACE page scroll root",
);

assert.match(
  source,
  /import HeroSection from "@\/components\/HeroSection"/,
  "Asset Registry should use the shared TRACE hero so ribbon sizing matches the other feature pages",
);

assert.match(
  source,
  /<HeroSection\s+title="Asset Registry"/,
  "Asset Registry shared hero should render the page title through HeroSection",
);

for (const forbiddenImport of [
  /from "@\/components\/ui\/card"/,
  /from "@\/components\/ui\/button"/,
  /from "@\/components\/ui\/badge"/,
]) {
  assert.doesNotMatch(
    source,
    forbiddenImport,
    "Asset Registry page-level UI should use TRACE inline page patterns rather than shadcn cards/buttons/badges",
  );
}

for (const offPalette of ["orange", "#F97316", "#FB923C", "#EA580C"]) {
  assert.doesNotMatch(
    source,
    new RegExp(offPalette, "i"),
    `Asset Registry should avoid off-palette orange styling: ${offPalette}`,
  );
}

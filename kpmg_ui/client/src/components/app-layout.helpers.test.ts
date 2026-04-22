import assert from "node:assert/strict";

import {
  ACTIVE_PAGE_CLASSNAME,
  APP_LAYOUT_CONTENT_CLASSNAME,
  APP_LAYOUT_MAIN_CLASSNAME,
  HIDEABLE_TABS,
} from "./app-layout.helpers";

assert.equal(
  HIDEABLE_TABS.some((tab) => tab.path === "/asset-registry" && tab.title === "Asset Registry"),
  true,
  "Sidebar navigation should include Asset Registry as a visible workspace link",
);

assert.equal(
  APP_LAYOUT_CONTENT_CLASSNAME.includes("min-h-0"),
  true,
  "The app content column must be allowed to shrink so page scroll areas can receive a bounded height",
);

assert.equal(
  APP_LAYOUT_MAIN_CLASSNAME.includes("min-h-0"),
  true,
  "The app main region must be allowed to shrink inside the full-height shell",
);

assert.equal(
  ACTIVE_PAGE_CLASSNAME.includes("min-h-0"),
  true,
  "The active page wrapper must not force scrollable pages taller than the viewport",
);

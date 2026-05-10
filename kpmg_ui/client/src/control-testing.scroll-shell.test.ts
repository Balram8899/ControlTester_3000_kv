import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

const appSource = read("client/src/App.tsx");
const appLayoutSource = read("client/src/components/AppLayout.tsx");
const controlTestingSource = read("client/src/pages/control-testing.tsx");
const brandCss = read("client/src/styles/kpmg-brand-override.css");

assert.match(
  appLayoutSource,
  /trace-shell-main[^"]*min-h-0[^"]*overflow-hidden/,
  "The shell content column must shrink and clip so page scroll cannot continue below the footer",
);

assert.match(
  appSource,
  /location === path \? "h-full min-h-0 overflow-hidden"/,
  "Active mounted pages need min-h-0 so nested page scroll containers stay bounded",
);

assert.match(
  controlTestingSource,
  /className="h-full min-h-0 overflow-hidden flex flex-col"/,
  "Control Testing root must bound its internal TracePageBody scroll area",
);

assert.match(
  brandCss,
  /\.trace-page-body\s*{[\s\S]*?min-height:\s*0/,
  "TracePageBody must set min-height: 0 so it scrolls inside flex page shells instead of growing under the footer",
);

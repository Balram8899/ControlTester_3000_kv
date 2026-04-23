import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve("client/src/components/ui/scroll-area.tsx"),
  "utf8",
);

assert.match(
  source,
  /min-h-0/,
  "ScrollArea should enforce min-h-0 so nested flex layouts can scroll correctly",
);

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const pageSource = fs.readFileSync(path.resolve("client/src/pages/document-uplift.tsx"), "utf8");

assert.match(
  pageSource,
  /\/api\/document-uplift\/cases\/\$\{selectedCaseId\}\/pipeline\/stream/,
  "Document Uplift page must connect to the Item 30 pipeline stream endpoint",
);
assert.match(pageSource, /new EventSource/, "Document Uplift page must use EventSource for live progress");
assert.match(pageSource, /addEventListener\("stage"/, "Document Uplift page must handle stage SSE events");
assert.match(pageSource, /addEventListener\("progress"/, "Document Uplift page must handle progress SSE events");
assert.match(pageSource, /addEventListener\("complete"/, "Document Uplift page must handle complete SSE events");
assert.match(pageSource, /addEventListener\("error"/, "Document Uplift page must handle error SSE events");
assert.match(pageSource, /eventSource\.close\(\)/, "Document Uplift page must close EventSource connections");
assert.match(pageSource, /formatSseProgressLabel/, "Document Uplift page must map SSE steps to readable labels");
assert.match(pageSource, /section_classification/, "SSE label map must cover section classification");
assert.match(pageSource, /terminology_extraction/, "SSE label map must cover terminology extraction");
assert.match(pageSource, /extraction_batch/, "SSE label map must cover extraction batches");
assert.match(pageSource, /excel_schema_detection/, "SSE label map must cover Excel schema detection");
assert.match(pageSource, /cross_document_synthesis/, "SSE label map must cover cross-document synthesis");
assert.match(pageSource, /diagram_render/, "SSE label map must cover diagram rendering");
assert.match(pageSource, /documentUpliftProgressLabel/, "UI must render the live SSE progress label");

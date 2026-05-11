import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");
const landingPath = path.resolve("client/src/pages/document-uplift.tsx");
const casePath = path.resolve("client/src/pages/document-uplift-case.tsx");

assert.ok(fs.existsSync(landingPath), "Document Uplift landing page must exist");
assert.ok(fs.existsSync(casePath), "Document Uplift case detail page must exist");

const landingSource = fs.readFileSync(landingPath, "utf8");
const caseSource = fs.readFileSync(casePath, "utf8");

assert.match(appSource, /DocumentUpliftCasePage/, "App must import the case detail page");
assert.match(
  appSource,
  /location\.startsWith\("\/document-uplift\/"\)/,
  "App must route /document-uplift/:caseId inside the TRACE shell",
);

assert.match(landingSource, /DOCUMENT INTELLIGENCE/, "Landing hero must use the approved label");
assert.match(landingSource, /How It Works/, "Landing page must include the workflow section");
assert.match(landingSource, /Your Cases/, "Landing page must include the case list");
assert.match(landingSource, /apex_uplift_hiw_open/, "How It Works collapsed state must persist");

assert.match(caseSource, /import \{ renderAsync \} from "docx-preview"/, "Case page must use docx-preview locally");
assert.match(caseSource, /import TraceNavBar from "@\/components\/TraceNavBar"/, "Case page must use the compact TRACE shell nav");
assert.doesNotMatch(caseSource, /import HeroSection from "@\/components\/HeroSection"/, "Case detail page must not spend vertical space on the full hero");
assert.doesNotMatch(caseSource, /<TraceNavBar[\s\S]*actions=\{/, "Case shell nav must not duplicate workflow actions already available in the workspace");
assert.match(
  caseSource,
  /\/api\/document-uplift\/cases\/\$\{caseId\}\/files\/\$\{file\.file_id\}\/content/,
  "Case page must fetch uploaded bytes from the Document Uplift preview endpoint",
);
assert.doesNotMatch(caseSource, /from "\.\/sop-uplift|from "\.\.\/sop-uplift|pages\/sop-uplift/, "Case page must not depend on SOP Uplift modules");
assert.match(caseSource, /trace-docx-preview/, "Case page must render DOCX into the TRACE preview container");
assert.match(caseSource, /Documents/, "Case page must include Documents tab");
assert.match(caseSource, /Processing/, "Case page must include Processing tab");
assert.match(caseSource, /Review Suggestions/, "Case page must include Review Suggestions tab");
assert.match(caseSource, /Export/, "Case page must include Export tab");
assert.match(caseSource, /MoveToExportDialog/, "Case page must gate export with a confirmation dialog");
assert.match(caseSource, /h-full min-h-0 overflow-hidden/, "Case page must fit inside the existing TRACE shell");
assert.match(caseSource, /onPreviewFile=\{\(fileId\) => \{[\s\S]*setActiveTab\("review"\)/, "Document preview action must open the review viewer");
assert.match(caseSource, /Extracted Preview Fallback/, "Viewer must show extracted markdown if native file preview cannot load");
assert.match(caseSource, /DocumentPreviewDialog/, "Review page must provide a detached document preview dialog");
assert.match(caseSource, /aria-label="Open document preview"/, "Magnifying glass must open the detached document preview");
assert.match(caseSource, /initialZoom=\{75\}/, "Embedded document preview must default to a fit-oriented zoom");
assert.match(caseSource, /xl:grid-cols-\[minmax\(0,1fr\)_420px\]/, "Review queue must leave enough horizontal space for the document viewer");
assert.match(caseSource, /editPanelOpen/, "Review edit fields must be collapsible instead of permanently crowding the queue");
assert.doesNotMatch(caseSource, /Run Configuration|Live Event Stream|Quality Checklist|Run Summary/, "Case tabs must not reserve right-side panels for low-value status summaries");
assert.ok((caseSource.match(/trace-white-dialog/g) ?? []).length >= 2, "Case dialogs must use the white TRACE modal treatment");
assert.ok((landingSource.match(/trace-white-dialog/g) ?? []).length >= 2, "Landing dialogs must use the white TRACE modal treatment");
assert.match(landingSource, /placeholder:text-\[#8492A6\]/, "Dialog form fields must use the light TRACE placeholder treatment");

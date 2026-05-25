import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.resolve(relativePath));
}

assert.ok(
  exists("client/src/hooks/useControlTesting.ts"),
  "Controls Assurance must expose a TanStack Query hook layer at client/src/hooks/useControlTesting.ts",
);

const hooksSource = read("client/src/hooks/useControlTesting.ts");
const legacyControlTestingSource = read("client/src/pages/control-testing.tsx");
const listPageSource = read("client/src/pages/controls-assurance.tsx");
const appSource = read("client/src/App.tsx");
const layoutSource = read("client/src/components/AppLayout.tsx");

assert.match(hooksSource, /useCtSessions/, "Hook layer must expose useCtSessions");
assert.match(hooksSource, /useCtSession/, "Hook layer must expose useCtSession");
assert.match(hooksSource, /useCtControls/, "Hook layer must expose useCtControls");
assert.match(hooksSource, /useConfirmMapping/, "Hook layer must expose useConfirmMapping");
assert.match(hooksSource, /usePushAllCtIssues/, "Hook layer must expose usePushAllCtIssues");
assert.match(hooksSource, /useUploadPopulationSupport/, "Hook layer must expose population source-support upload");
assert.match(hooksSource, /useUploadEvidenceSupport/, "Hook layer must expose evidence source-support upload");
assert.match(hooksSource, /parseCtControls/, "Hook layer must expose screen-entered control parsing");
assert.match(hooksSource, /useUpdateCtControl/, "Hook layer must expose editable finalized-control updates");
assert.match(hooksSource, /useFinalizeControls/, "Hook layer must expose control finalization");
assert.match(hooksSource, /\/api\/ct\/sessions/, "Hook layer must call the /api/ct session API");
assert.match(hooksSource, /\/controls\/parse/, "Hook layer must call the controls parse API");
assert.match(hooksSource, /\/finalize-controls/, "Hook layer must call the controls finalization API");
assert.match(hooksSource, /population\/support-files/, "Hook layer must call the population support-files API");
assert.match(hooksSource, /evidence\/\$\{evidenceGridfsId\}\/support-files/, "Hook layer must call the evidence support-files API");
assert.match(hooksSource, /FormData/, "File upload mutations must use FormData");
assert.doesNotMatch(
  hooksSource,
  /provider\s*:|model\s*:/,
  "Frontend must not hardcode LLM provider/model payloads for Controls Assurance",
);

assert.ok(
  exists("client/src/pages/controls-assurance-new.tsx"),
  "Controls Assurance must include a create-assessment page",
);
assert.ok(
  exists("client/src/pages/controls-assurance-detail.tsx"),
  "Controls Assurance must include a five-tab detail page",
);

const createPageSource = read("client/src/pages/controls-assurance-new.tsx");
const detailPageSource = read("client/src/pages/controls-assurance-detail.tsx");

assert.doesNotMatch(
  listPageSource + createPageSource + detailPageSource,
  /ControlTestingContext|useControlTesting\(/,
  "Controls Assurance pages must not use the legacy ControlTestingContext",
);
assert.match(
  legacyControlTestingSource,
  /\/audit\/start|auditUploadEvidence|generateWorkpaper/,
  "Legacy Control Testing page must remain wired to the old audit flow",
);

for (const label of ["Case Analysis", "Population", "Evidence", "Testing", "Results"]) {
  assert.match(detailPageSource, new RegExp(label), `Detail page must render ${label} tab`);
}

assert.match(hooksSource, /refetchInterval:\s*\(query\)/, "Session query must stop polling on terminal stages");
assert.match(detailPageSource, /overrideReason\.trim\(\)\.length < 10/, "Override modal must enforce 10-character reason");
assert.match(detailPageSource, /Push All Issues/, "Results tab must expose Push All Issues");
assert.match(detailPageSource, /unresolved_files/, "Evidence gate errors must list unresolved filenames");
assert.match(detailPageSource, /Source \/ Query Support/, "Detail page must expose source/query support uploads for C&A");
assert.match(detailPageSource, /Unique Key Columns/, "Detail page must collect unique key columns for C&A reconciliation");
assert.match(detailPageSource, /Expected Count/, "Detail page must collect expected count for source-to-export reconciliation");

assert.match(listPageSource, /bg-\[#F0F2F7\]/, "List page must use the canonical Trace page background");
assert.match(listPageSource, /New Assessment/, "List page must expose New Assessment navigation");
assert.match(listPageSource, /Controls Assurance/, "List page must be branded as Controls Assurance");
assert.match(createPageSource, /Control Data Entry/, "Create page must support simplified screen-entry parsing");
assert.match(createPageSource, /Risk Statement/, "Create page must collect risk statement when available");
assert.match(createPageSource, /Test Steps/, "Create page must collect test procedures as user-provided text");
assert.match(createPageSource, /Additional Sampling Guidance/, "Create page must collect sampling context");
assert.doesNotMatch(createPageSource, /Add Step A-F/, "Create page must not expose the old fixed A-F step builder");
assert.doesNotMatch(createPageSource, /test_steps\.length >= 6/, "Create page must not enforce a six-step cap");
assert.match(createPageSource, /Download Template/, "Create page must support template download");
assert.doesNotMatch(createPageSource, /<Field label="Framework">/, "Create page must not ask users for case framework");
assert.doesNotMatch(createPageSource, /session\.framework\.trim/, "Create page validation must not require framework");
assert.doesNotMatch(createPageSource, /updateSession\("framework"/, "Create page must not expose framework editing");
assert.match(detailPageSource, /Control Finalization Review/, "Detail page must show final LLM/user-derived control setup before population");
assert.match(detailPageSource, /Finalize Control Setup/, "Detail page must expose a confirmation action for control setup");
assert.match(detailPageSource, /LLM Derived/, "Detail page must distinguish LLM-derived fields");
assert.match(detailPageSource, /controls_finalized/, "Detail page must respect the controls_finalized gate");
assert.match(detailPageSource, /Additional Sampling Guidance/, "Detail page must allow review of additional sampling guidance");
assert.match(detailPageSource, /pendingSuggestions/, "Detail page must track unresolved suggestion status");
assert.match(detailPageSource, /unansweredQuestions/, "Detail page must track unanswered LLM review questions");
assert.match(detailPageSource, /Finalize Control Setup First/, "Confirm CTA must explain the control finalization precondition");
assert.match(detailPageSource, /Answer Questions First/, "Confirm CTA must explain unanswered question preconditions");
assert.match(detailPageSource, /Resolve Suggestions First/, "Confirm CTA must explain pending suggestion preconditions");
assert.match(detailPageSource, /Case analysis is ready to confirm/, "Confirm CTA must expose the ready state once gates are clear");
assert.match(detailPageSource, /suggestion\.status === "accepted"/, "Resolved suggestions must show accepted status");
assert.match(detailPageSource, /suggestion\.status === "dismissed"/, "Resolved suggestions must show dismissed status");
assert.match(detailPageSource, /handleSuggestionStatus/, "Suggestion decisions must surface mutation errors");
assert.match(detailPageSource, /handleAnswerQuestion/, "Question answers must surface mutation errors");
assert.match(detailPageSource, /description: extractGateMessage\(error\)/, "Review actions must show backend failure details");

assert.match(appSource, /ControlsAssuranceNewPage/, "App router must import Controls Assurance create page");
assert.match(appSource, /ControlsAssuranceDetailPage/, "App router must import Controls Assurance detail page");
assert.match(appSource, /location === "\/controls-assurance\/new"/, "App router must handle /controls-assurance/new");
assert.match(appSource, /location\.startsWith\("\/controls-assurance\/"\)/, "App router must handle /controls-assurance/:id");
assert.match(layoutSource, /Controls Assurance/, "Sidebar must expose Controls Assurance as a separate feature");

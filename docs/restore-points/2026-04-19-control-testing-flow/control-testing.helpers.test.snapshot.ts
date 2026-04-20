import assert from "node:assert/strict";

import {
  CONTROL_TESTING_API,
  canGenerateWorkpaper,
  getControlTestingStepNumber,
} from "./control-testing.helpers";

assert.equal(
  CONTROL_TESTING_API.start,
  "/api/audit/start",
  "Control testing should start by parsing a test script via the audit start endpoint",
);

assert.equal(
  CONTROL_TESTING_API.uploadEvidence,
  "/api/audit/upload-evidence",
  "Evidence submission should use the audit evidence endpoint",
);

assert.equal(
  CONTROL_TESTING_API.generateWorkpaper,
  "/api/audit/generate-workpaper",
  "Workpaper generation should use the audit workpaper endpoint",
);

assert.equal(
  getControlTestingStepNumber("upload_script"),
  1,
  "Uploading the test script should be step 1",
);

assert.equal(
  getControlTestingStepNumber("review_checklist"),
  2,
  "Reviewing the parsed checklist should stay in the evidence step",
);

assert.equal(
  getControlTestingStepNumber("upload_evidence"),
  2,
  "Uploading evidence should remain in step 2",
);

assert.equal(
  getControlTestingStepNumber("generating"),
  3,
  "Workpaper generation should be step 3",
);

assert.equal(
  getControlTestingStepNumber("results"),
  3,
  "Completed results should stay in the workpaper step",
);

assert.equal(
  canGenerateWorkpaper(true, null),
  true,
  "Ready sessions should allow workpaper generation immediately",
);

assert.equal(
  canGenerateWorkpaper(false, {
    total_controls: 3,
    received: 1,
    pending: 2,
    rejected: 0,
  }),
  true,
  "Partially satisfied sessions should still allow force generation",
);

assert.equal(
  canGenerateWorkpaper(false, {
    total_controls: 3,
    received: 0,
    pending: 3,
    rejected: 0,
  }),
  false,
  "Sessions without any accepted evidence should not offer workpaper generation yet",
);

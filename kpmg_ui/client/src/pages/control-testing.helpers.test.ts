import assert from "node:assert/strict";

import {
  CONTROL_TESTING_API,
  canGenerateWorkpaper,
  getControlTestingStepNumber,
} from "./control-testing.helpers";
import { resolveSelectedModel } from "@/lib/modelSelection";

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

assert.equal(
  resolveSelectedModel("gemini-3-flash-preview", [
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ]),
  "gemini-3-flash-preview",
  "A valid stored model should be preserved",
);

assert.equal(
  resolveSelectedModel("gemini-2.0-flash", [
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ]),
  "gemini-3-flash-preview",
  "An invalid stored model should fall back to the first available model",
);

assert.equal(
  resolveSelectedModel("gemini-2.0-flash", undefined),
  "gemini-2.0-flash",
  "Without a fresh model list, the helper should preserve the stored model",
);

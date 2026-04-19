import assert from "node:assert/strict";

import {
  canRunRcmComparison,
  getRcmComparisonEndpoint,
  getRcmProcessingDescription,
} from "./regulatory-testing.helpers";

const rcmFile = new File(["rcm"], "sample-rcm.xlsx");
const uploadedRegulation = new File(["regulation"], "sample-regulation.pdf");

assert.equal(
  getRcmComparisonEndpoint("library"),
  "/api/rcm_compliance_v2",
  "Library-backed RCM runs should use the library endpoint",
);

assert.equal(
  getRcmComparisonEndpoint("upload"),
  "/api/rcm_compliance",
  "Uploaded regulation RCM runs should use the upload endpoint",
);

assert.equal(
  canRunRcmComparison("library", ["doc-1"], [], rcmFile),
  true,
  "Library source should allow runs when at least one document and an RCM file are present",
);

assert.equal(
  canRunRcmComparison("library", [], [uploadedRegulation], rcmFile),
  false,
  "Library source should ignore uploaded regulations",
);

assert.equal(
  canRunRcmComparison("upload", [], [uploadedRegulation], rcmFile),
  true,
  "Upload source should allow runs when at least one uploaded regulation and an RCM file are present",
);

assert.equal(
  canRunRcmComparison("upload", ["doc-1"], [], rcmFile),
  false,
  "Upload source should ignore library selections",
);

assert.equal(
  getRcmProcessingDescription("library", ["doc-1", "doc-2"], []),
  "Comparing RCM against 2 library regulation(s)",
  "Library progress copy should reflect library selection count",
);

assert.equal(
  getRcmProcessingDescription("upload", [], [uploadedRegulation]),
  "Comparing RCM against 1 uploaded regulation(s)",
  "Upload progress copy should reflect uploaded regulation count",
);

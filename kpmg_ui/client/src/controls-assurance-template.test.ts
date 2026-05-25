import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import { parseControlsTemplateWorkbook } from "./lib/controls-assurance-template";

function workbookBytes(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Control Data");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

const parsedNewTemplate = parseControlsTemplateWorkbook(
  workbookBytes([
    [
      "Control ID",
      "Risk statement",
      "Control Name/ Control Title",
      "Control description",
      "Control Type",
      "Domain / Category",
      "Control Owner",
      "Frequency",
      "Walkthrough Performed",
      "Sampling Mode",
      "Test objectives",
      "Test Steps",
      "Evidence requirements",
      "Additional Sampling guidance",
    ],
    [
      "PWD-001",
      "Weak passwords could allow unauthorized access to systems",
      "Password Complexity Policy",
      "Password complexity is configured and enforced",
      "Preventive",
      "Password settings",
      "IT Security Team",
      "Continuous",
      "No",
      "Walkthrough (1 sample)",
      "Verify password complexity requirements",
      "1. Review the AD configuration screenshot. 2. Compare minimum length against policy.",
      "AD configuration screenshot",
      "Exclude tickers beginning with 013, 014, or 105.",
    ],
  ]),
);

assert.equal(parsedNewTemplate.length, 1);
assert.equal(parsedNewTemplate[0].control_id, "PWD-001");
assert.equal(parsedNewTemplate[0].risk_statement, "Weak passwords could allow unauthorized access to systems");
assert.equal(parsedNewTemplate[0].control_title, "Password Complexity Policy");
assert.equal(parsedNewTemplate[0].control_description, "Password complexity is configured and enforced");
assert.equal(parsedNewTemplate[0].domain_category, "Password settings");
assert.equal(parsedNewTemplate[0].test_steps, "1. Review the AD configuration screenshot. 2. Compare minimum length against policy.");
assert.equal(parsedNewTemplate[0].additional_sampling_context, "Exclude tickers beginning with 013, 014, or 105.");

const parsedLegacyTemplate = parseControlsTemplateWorkbook(
  workbookBytes([
    [
      "Control ID",
      "Control Name",
      "Control Type",
      "Domain",
      "Framework Reference",
      "Inherent Risk Rating",
      "Control Owner",
      "Frequency",
      "Prior Period Result",
      "Walkthrough Performed",
      "Sampling Mode",
      "Step A Description",
      "Step A Evidence Required",
      "Step B Description",
      "Step B Evidence Required",
    ],
    [
      "ITGC-001",
      "Password Policy",
      "Preventive",
      "Access Mgmt",
      "SOX s.404",
      "High",
      "John Smith",
      "Continuous",
      "Effective",
      "No",
      "Sample",
      "Inspect AD policy",
      "AD screenshot",
      "Check lockout",
      "Lockout config",
    ],
  ]),
);

assert.equal(parsedLegacyTemplate.length, 1);
assert.equal(parsedLegacyTemplate[0].control_id, "ITGC-001");
assert.equal(parsedLegacyTemplate[0].control_title, "Password Policy");
assert.equal(parsedLegacyTemplate[0].domain_category, "Access Mgmt");
assert.equal(parsedLegacyTemplate[0].test_steps, "1. Inspect AD policy\n2. Check lockout");
assert.equal(parsedLegacyTemplate[0].evidence_requirements, "AD screenshot\nLockout config");

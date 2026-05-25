import * as XLSX from "xlsx";

import type { ParseControlBody } from "../hooks/useControlTesting";

const STEP_LABELS = ["A", "B", "C", "D", "E", "F"];

type WorkbookRow = Record<string, string>;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstValue(row: WorkbookRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return "";
}

function rowRecord(headers: unknown[], row: unknown[]): WorkbookRow {
  return headers.reduce<WorkbookRow>((record, header, index) => {
    const key = normalizeHeader(header);
    if (key) record[key] = cellText(row[index]);
    return record;
  }, {});
}

function legacyStepDescriptions(row: WorkbookRow): string[] {
  return STEP_LABELS.map((label) => firstValue(row, `Step ${label} Description`)).filter(Boolean);
}

function legacyEvidenceRequirements(row: WorkbookRow): string[] {
  return STEP_LABELS.map((label) => firstValue(row, `Step ${label} Evidence Required`)).filter(Boolean);
}

function numberedSteps(steps: string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function toControlDraft(row: WorkbookRow): ParseControlBody {
  const stepDescriptions = legacyStepDescriptions(row);
  const evidenceRequirements = legacyEvidenceRequirements(row);

  return {
    control_id: firstValue(row, "Control ID", "Control Number"),
    risk_statement: firstValue(row, "Risk statement", "Risk"),
    control_title: firstValue(row, "Control Name/ Control Title", "Control Name", "Control Title"),
    control_description: firstValue(row, "Control description", "Description"),
    control_type: firstValue(row, "Control Type"),
    domain_category: firstValue(row, "Domain / Category", "Domain"),
    control_owner: firstValue(row, "Control Owner"),
    frequency: firstValue(row, "Frequency"),
    walkthrough_performed: firstValue(row, "Walkthrough Performed"),
    sampling_mode: firstValue(row, "Sampling Mode"),
    test_objectives: firstValue(row, "Test objectives"),
    test_steps: firstValue(row, "Test Steps") || numberedSteps(stepDescriptions),
    evidence_requirements: firstValue(row, "Evidence requirements") || evidenceRequirements.join("\n"),
    additional_sampling_context: firstValue(row, "Additional Sampling guidance", "Additional Sampling Context"),
  };
}

function hasControlContent(control: ParseControlBody): boolean {
  return Boolean(
    control.control_id ||
      control.control_title ||
      control.risk_statement ||
      control.control_description ||
      control.test_steps ||
      control.evidence_requirements,
  );
}

export function parseControlsTemplateWorkbook(buffer: ArrayBuffer): ParseControlBody[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
  const [headers = [], ...dataRows] = rows;

  return dataRows.map((row) => toControlDraft(rowRecord(headers, row))).filter(hasControlContent);
}

export async function parseControlsTemplateFile(file: File): Promise<ParseControlBody[]> {
  return parseControlsTemplateWorkbook(await file.arrayBuffer());
}

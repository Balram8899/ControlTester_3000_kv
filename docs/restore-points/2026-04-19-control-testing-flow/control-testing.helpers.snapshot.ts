export type AuditStep =
  | "landing"
  | "upload_script"
  | "review_checklist"
  | "upload_evidence"
  | "generating"
  | "results";

export interface EvidenceSummary {
  total_controls: number;
  received: number;
  pending: number;
  rejected: number;
}

export interface AuditSessionState {
  sessionId: string | null;
  currentStep: AuditStep;
  testScriptFile: File | null;
  controlsFound: number;
  evidenceChecklist: Array<{
    control_id: string;
    control_description: string;
    evidence_required: string;
    status: string;
  }>;
  warnings: string[];
  evidenceFiles: File[];
  filesProcessed: Array<{
    filename: string;
    validation_status: string;
    content_type_detected?: string;
    satisfies_controls?: string[];
    reason: string;
  }>;
  evidenceSummary: EvidenceSummary | null;
  pendingControls: Array<{
    control_id: string;
    control_description?: string;
    evidence_required?: string;
    status: string;
  }>;
  readyToGenerate: boolean;
  isProcessing: boolean;
  workpaperFilename: string | null;
  downloadUrl: string | null;
  workpaperSummary: {
    controls_tested: number;
    controls_with_evidence: number;
    controls_without_evidence: number;
    overall_result: string;
    pass_count: number;
    fail_count: number;
    partial_count: number;
    no_evidence_count: number;
    severity_counts?: { high: number; medium: number; low: number };
  } | null;
  resultMessage: string | null;
  error: string | null;
}

export const CONTROL_TESTING_API = {
  start: "/api/audit/start",
  uploadEvidence: "/api/audit/upload-evidence",
  generateWorkpaper: "/api/audit/generate-workpaper",
} as const;

export const initialAuditSessionState: AuditSessionState = {
  sessionId: null,
  currentStep: "upload_script",
  testScriptFile: null,
  controlsFound: 0,
  evidenceChecklist: [],
  warnings: [],
  evidenceFiles: [],
  filesProcessed: [],
  evidenceSummary: null,
  pendingControls: [],
  readyToGenerate: false,
  isProcessing: false,
  workpaperFilename: null,
  downloadUrl: null,
  workpaperSummary: null,
  resultMessage: null,
  error: null,
};

export function getControlTestingStepNumber(step: AuditStep): number {
  if (step === "upload_script") {
    return 1;
  }
  if (step === "review_checklist" || step === "upload_evidence") {
    return 2;
  }
  if (step === "generating" || step === "results") {
    return 3;
  }
  return 0;
}

export function canGenerateWorkpaper(
  readyToGenerate: boolean,
  evidenceSummary: EvidenceSummary | null,
): boolean {
  if (readyToGenerate) {
    return true;
  }

  return Boolean(evidenceSummary && evidenceSummary.received > 0);
}

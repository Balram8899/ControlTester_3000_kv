import { createContext, useContext, useState, ReactNode } from "react";

export type AuditStep = "landing" | "upload_script" | "review_checklist" | "upload_evidence" | "generating" | "results";

export interface EvidenceChecklistItem {
  control_id: string;
  control_description: string;
  evidence_required: string;
  status: string;
}

export interface FileProcessedResult {
  filename: string;
  validation_status: string;
  content_type_detected?: string;
  satisfies_controls?: string[];
  reason: string;
}

export interface EvidenceSummary {
  total_controls: number;
  received: number;
  pending: number;
  rejected: number;
}

export interface PendingControl {
  control_id: string;
  control_description?: string;
  evidence_required?: string;
  status: string;
}

export interface WorkpaperSummary {
  controls_tested: number;
  controls_with_evidence: number;
  controls_without_evidence: number;
  overall_result: string;
  pass_count: number;
  fail_count: number;
  partial_count: number;
  no_evidence_count: number;
  severity_counts?: { high: number; medium: number; low: number };
}

export interface AuditSessionState {
  sessionId: string | null;
  currentStep: AuditStep;
  testScriptFile: File | null;
  controlsFound: number;
  evidenceChecklist: EvidenceChecklistItem[];
  warnings: string[];
  evidenceFiles: File[];
  filesProcessed: FileProcessedResult[];
  evidenceSummary: EvidenceSummary | null;
  pendingControls: PendingControl[];
  readyToGenerate: boolean;
  isProcessing: boolean;
  workpaperFilename: string | null;
  downloadUrl: string | null;
  workpaperSummary: WorkpaperSummary | null;
  resultMessage: string | null;
  error: string | null;
}

interface ControlTestingContextType extends AuditSessionState {
  setTestScriptFile: (file: File | null) => void;
  setCurrentStep: (step: AuditStep) => void;
  setSessionData: (data: Partial<AuditSessionState>) => void;
  addEvidenceFiles: (files: File[]) => void;
  setEvidenceFiles: (files: File[]) => void;
  appendFilesProcessed: (results: FileProcessedResult[]) => void;
  resetState: () => void;
}

const initialState: AuditSessionState = {
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

const ControlTestingContext = createContext<ControlTestingContextType | undefined>(undefined);

export function ControlTestingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuditSessionState>({ ...initialState });

  const setTestScriptFile = (file: File | null) => {
    setState(prev => ({ ...prev, testScriptFile: file }));
  };

  const setCurrentStep = (step: AuditStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  };

  const setSessionData = (data: Partial<AuditSessionState>) => {
    setState(prev => ({ ...prev, ...data }));
  };

  const addEvidenceFiles = (files: File[]) => {
    setState(prev => ({ ...prev, evidenceFiles: [...prev.evidenceFiles, ...files] }));
  };

  const setEvidenceFiles = (files: File[]) => {
    setState(prev => ({ ...prev, evidenceFiles: files }));
  };

  const appendFilesProcessed = (results: FileProcessedResult[]) => {
    setState(prev => ({ ...prev, filesProcessed: [...prev.filesProcessed, ...results] }));
  };

  const resetState = () => {
    setState({ ...initialState });
  };

  return (
    <ControlTestingContext.Provider
      value={{
        ...state,
        setTestScriptFile,
        setCurrentStep,
        setSessionData,
        addEvidenceFiles,
        setEvidenceFiles,
        appendFilesProcessed,
        resetState,
      }}
    >
      {children}
    </ControlTestingContext.Provider>
  );
}

export function useControlTesting() {
  const context = useContext(ControlTestingContext);
  if (!context) {
    throw new Error("useControlTesting must be used within a ControlTestingProvider");
  }
  return context;
}
import { createContext, useContext, useState, type ReactNode } from "react";

import { type AuditStep, initialAuditSessionState, type AuditSessionState } from "@/pages/control-testing.helpers";

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

interface ControlTestingContextType extends AuditSessionState {
  setTestScriptFile: (file: File | null) => void;
  setCurrentStep: (step: AuditStep) => void;
  setSessionData: (data: Partial<AuditSessionState>) => void;
  addEvidenceFiles: (files: File[]) => void;
  setEvidenceFiles: (files: File[]) => void;
  appendFilesProcessed: (results: FileProcessedResult[]) => void;
  resetState: () => void;
}

const ControlTestingContext = createContext<ControlTestingContextType | undefined>(undefined);

export function ControlTestingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuditSessionState>({ ...initialAuditSessionState });

  const setTestScriptFile = (file: File | null) => {
    setState((prev) => ({ ...prev, testScriptFile: file }));
  };

  const setCurrentStep = (step: AuditStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const setSessionData = (data: Partial<AuditSessionState>) => {
    setState((prev) => ({ ...prev, ...data }));
  };

  const addEvidenceFiles = (files: File[]) => {
    setState((prev) => ({ ...prev, evidenceFiles: [...prev.evidenceFiles, ...files] }));
  };

  const setEvidenceFiles = (files: File[]) => {
    setState((prev) => ({ ...prev, evidenceFiles: files }));
  };

  const appendFilesProcessed = (results: FileProcessedResult[]) => {
    setState((prev) => ({ ...prev, filesProcessed: [...prev.filesProcessed, ...results] }));
  };

  const resetState = () => {
    setState({ ...initialAuditSessionState });
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

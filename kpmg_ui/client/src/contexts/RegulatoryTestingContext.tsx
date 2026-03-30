import { createContext, useContext, useState, ReactNode } from "react";

type ComparisonMode = "regulation" | "rcm" | "library";

export interface DocumentAnalysis {
  framework_name: string;
  issuing_authority: string;
  target_industry: string;
  regulatory_approach: string | null;
  key_focus_areas: string[];
  governance_model: string | null;
  enforcement_style: string | null;
  date_issued: string | null;
}

export interface StringencyScores {
  prescriptiveness: number;
  measurability: number;
  enforcement: number;
  scope: number;
  independence: number;
  overall: number;
}

export interface ControlComparison {
  source: string;
  control_statement: string;
  stringency_scores: StringencyScores;
  compliance_percentage: number;
}

export interface ControlGroupItem {
  control_domain: string;
  risk_addressed: string;
  most_stringent_source: string;
  most_stringent_control: string;
  baseline_stringency: StringencyScores;
  comparisons: ControlComparison[];
  group_size: number;
}

export interface DomainAnalysisItem {
  control_groups: number;
  source_scores: Record<string, number>;
  most_stringent: string;
  winner_score: number;
}

export interface OverallStringencyItem {
  average_stringency: number;
  median_stringency: number;
  control_count: number;
  score_distribution: Record<string, number>;
}

export interface StringencyAnalysis {
  domain_analysis: Record<string, DomainAnalysisItem>;
  control_groups: ControlGroupItem[];
  overall_stringency: Record<string, OverallStringencyItem>;
  total_controls: number;
  total_groups: number;
}

export interface DomainCoverageItem {
  present_in: string[];
  absent_in: string[];
  coverage_pct: number;
}

export interface DocumentGapItem {
  covered_domains: string[];
  missing_domains: string[];
  domain_coverage_pct: number;
  unique_controls: { domain: string; control_statement: string; risk_addressed: string }[];
}

export interface SharedControlItem {
  domain: string;
  group_size: number;
  docs_present: string[];
  representative_statement: string;
}

export interface GapAnalysis {
  domain_coverage: Record<string, DomainCoverageItem>;
  document_gaps: Record<string, DocumentGapItem>;
  shared_controls: SharedControlItem[];
  gap_summary: {
    most_gaps_in: string | null;
    best_covered: string | null;
    domains_with_universal_coverage: string[];
    total_domains_found: number;
    shared_control_groups: number;
  };
}

export interface ComparisonResultsData {
  success: boolean;
  request_id: string;
  analysis_timestamp?: string;
  model_used?: string;
  documents?: string[];
  document_analyses?: Record<string, DocumentAnalysis>;
  extracted_controls?: number;
  control_groups?: number;
  stringency_analysis?: StringencyAnalysis;
  gap_analysis?: GapAnalysis;
  final_report?: string;
  metadata?: {
    chunks_processed: number;
    pages_analyzed: number;
    similarity_threshold: number;
    kb_enriched?: boolean;
  };
  artifacts_location?: string;
  error?: string;
  filenames?: string[];
  analysis?: Record<string, unknown>;
  suggestions_summary_counts?: Record<string, number>;
  executive_summary?: string;
  domain_reports?: Record<string, string>;
}

// ── Regulatory Library types ──────────────────────────────────────────────────

export interface LibraryObligation {
  obligation_id: string;
  section_reference: string;
  obligation_text: string;
  domain: string;
  enforcement_level: string;
  obligation_type: string;
  keywords: string[];
  specificity_level: string;
  has_metric: boolean;
  has_frequency: boolean;
}

export interface LibraryDocument {
  document_id: string;
  framework_name: string;
  issuing_authority: string;
  source_filename: string;
  upload_timestamp: string;
  model_used?: string;
  total_obligations: number;
  obligations_by_domain?: Record<string, number>;
  obligations?: LibraryObligation[];
}

// ── Internal mode state ───────────────────────────────────────────────────────

interface ModeState {
  regulationFiles: File[];
  rcmFile: File | null;
  isProcessing: boolean;
  comparisonResults: ComparisonResultsData | null;
}

interface RegulatoryTestingState {
  mode: ComparisonMode;
  setMode: (mode: ComparisonMode) => void;
  regulationFiles: File[];
  setRegulationFiles: (files: File[]) => void;
  addRegulationFiles: (files: File[]) => void;
  rcmFile: File | null;
  setRcmFile: (file: File | null) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  comparisonResults: ComparisonResultsData | null;
  setComparisonResults: (results: ComparisonResultsData | null) => void;
  resetState: () => void;
  resetForNewComparison: () => void;
  // Library state
  libraryDocuments: LibraryDocument[];
  setLibraryDocuments: (docs: LibraryDocument[]) => void;
  libraryLoading: boolean;
  setLibraryLoading: (v: boolean) => void;
}

const RegulatoryTestingContext = createContext<RegulatoryTestingState | undefined>(undefined);

const initialModeState: ModeState = {
  regulationFiles: [],
  rcmFile: null,
  isProcessing: false,
  comparisonResults: null,
};

export function RegulatoryTestingProvider({ children }: { children: ReactNode }) {
  const [mode, setModeInternal] = useState<ComparisonMode>("regulation");

  const [regulationModeState, setRegulationModeState] = useState<ModeState>({ ...initialModeState });
  const [rcmModeState, setRcmModeState] = useState<ModeState>({ ...initialModeState });

  // Library-specific state (independent of comparison modes)
  const [libraryDocuments, setLibraryDocuments] = useState<LibraryDocument[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const currentState = mode === "regulation" ? regulationModeState : rcmModeState;
  const setCurrentState = mode === "regulation" ? setRegulationModeState : setRcmModeState;

  const setMode = (newMode: ComparisonMode) => {
    setModeInternal(newMode);
  };

  const setRegulationFiles = (files: File[]) => {
    setCurrentState(prev => ({ ...prev, regulationFiles: files }));
  };

  const addRegulationFiles = (newFiles: File[]) => {
    setCurrentState(prev => ({ ...prev, regulationFiles: [...prev.regulationFiles, ...newFiles] }));
  };

  const setRcmFile = (file: File | null) => {
    setCurrentState(prev => ({ ...prev, rcmFile: file }));
  };

  const setIsProcessing = (processing: boolean) => {
    setCurrentState(prev => ({ ...prev, isProcessing: processing }));
  };

  const setComparisonResults = (results: ComparisonResultsData | null) => {
    setCurrentState(prev => ({ ...prev, comparisonResults: results }));
  };

  const resetState = () => {
    setModeInternal("regulation");
    setRegulationModeState({ ...initialModeState });
    setRcmModeState({ ...initialModeState });
  };

  const resetForNewComparison = () => {
    setCurrentState({ ...initialModeState });
  };

  return (
    <RegulatoryTestingContext.Provider
      value={{
        mode,
        setMode,
        regulationFiles: currentState.regulationFiles,
        setRegulationFiles,
        addRegulationFiles,
        rcmFile: currentState.rcmFile,
        setRcmFile,
        isProcessing: currentState.isProcessing,
        setIsProcessing,
        comparisonResults: currentState.comparisonResults,
        setComparisonResults,
        resetState,
        resetForNewComparison,
        libraryDocuments,
        setLibraryDocuments,
        libraryLoading,
        setLibraryLoading,
      }}
    >
      {children}
    </RegulatoryTestingContext.Provider>
  );
}

export function useRegulatoryTesting() {
  const context = useContext(RegulatoryTestingContext);
  if (!context) {
    throw new Error("useRegulatoryTesting must be used within a RegulatoryTestingProvider");
  }
  return context;
}

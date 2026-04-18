import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ── Domain types ──────────────────────────────────────────────────────────

export type AnswerType = "yes" | "no" | "na";
export type StatusType = "draft" | "in_progress" | "risks_identified" | "controls_applied" | "complete";
export type RiskBand = "Low" | "Medium" | "High" | "Critical";
export type QuestionType = "Exposure" | "Control" | "Context";

export interface Question {
  id: string;
  text: string;
  question_type: QuestionType;
}

export interface Section {
  id: string;
  title: string;
  questions: Question[];
}

export interface SectionResponse {
  id?: string;
  asset_id: string;
  section_id: string;
  question_id: string;
  answer: AnswerType;
  details: string;
  submitted_at?: string;
}

export interface Risk {
  id: string;
  asset_id: string;
  title: string;
  description: string;
  risk_category: string;
  likelihood_score: number;
  impact_score: number;
  inherent_risk_score: number;
  inherent_risk_band: RiskBand;
  residual_risk_score: number;
  residual_risk_band: RiskBand;
  source: string;
  human_rationale: string;
  status: string;
}

export interface AppliedControl {
  id: string;
  risk_id: string;
  control_id: string;
  source: string;
  human_rationale: string;
  effectiveness_score: number;
  applied_at: string;
}

export interface SuggestedControl {
  risk_id: string;
  control_id: string;
  control_title: string;
  rationale: string;
  relevance_score: number;
}

export interface ResidualResult {
  risk_id: string;
  risk_title: string;
  asset_id: string;
  inherent_risk_score: number;
  inherent_risk_band: RiskBand;
  controls_applied: number;
  avg_effectiveness: number;
  residual_risk_score: number;
  residual_risk_band: RiskBand;
}

export interface AdHocApplication {
  id?: string;
  name: string;
  description?: string;
  assessment_context?: string;
  business_context?: string;
  purpose?: string;
  use?: string;
  confidentiality?: number;
  integrity?: number;
  availability?: number;
  hosting_type?: string | null;
  support_type?: string | null;
  owner?: string;
  custodian?: string;
  jurisdiction?: string;
  classification?: string;
  internet_exposure?: boolean;
  data_sensitivity_summary?: string;
  primary_users?: string;
  key_integrations?: string;
}

export interface RiskAssessment {
  id: string;
  title: string;
  description: string;
  status: StatusType;
  asset_ids: string[];
  ad_hoc_applications: AdHocApplication[];
  responses: SectionResponse[];
  risks: Risk[];
  applied_controls: AppliedControl[];
  suggested_controls: SuggestedControl[];
  report_markdown: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskAssessmentCreate {
  title: string;
  description: string;
  asset_ids?: string[];
  ad_hoc_applications?: AdHocApplication[];
}

// ── Context interface ─────────────────────────────────────────────────────

interface Ctx {
  assessments: RiskAssessment[];
  selectedAssessment: RiskAssessment | null;
  sections: Section[];
  residualResults: ResidualResult[];
  isLoading: boolean;
  isAnalyzing: boolean;
  isGeneratingReport: boolean;
  error: string | null;
  report: string | null;
  fetchAssessments: () => Promise<void>;
  selectAssessment: (a: RiskAssessment | null) => void;
  createAssessment: (data: RiskAssessmentCreate) => Promise<RiskAssessment>;
  fetchSections: () => Promise<void>;
  submitResponse: (
    raId: string,
    assetId: string,
    sectionId: string,
    questionId: string,
    answer: AnswerType,
    details: string,
  ) => Promise<void>;
  analyzeAssessment: (raId: string) => Promise<void>;
  addHumanRisk: (raId: string, risk: Omit<Risk, "id" | "inherent_risk_score" | "inherent_risk_band" | "residual_risk_score" | "residual_risk_band" | "source" | "status">) => Promise<void>;
  applyControl: (raId: string, riskId: string, controlId: string, source: string, rationale: string) => Promise<void>;
  fetchResidual: (raId: string) => Promise<void>;
  suggestControls: (raId: string) => Promise<void>;
  generateReport: (raId: string) => Promise<void>;
}

const RiskAssessmentContext = createContext<Ctx | null>(null);

export function RiskAssessmentProvider({ children }: { children: ReactNode }) {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [residualResults, setResidualResults] = useState<ResidualResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/risk-assessment");
      if (!r.ok) throw new Error("Failed to fetch assessments");
      setAssessments(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectAssessment = useCallback((a: RiskAssessment | null) => {
    setSelectedAssessment(a);
    setResidualResults([]);
    setReport(null);
  }, []);

  const createAssessment = useCallback(async (data: RiskAssessmentCreate): Promise<RiskAssessment> => {
    const r = await fetch("/api/risk-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("Failed to create assessment");
    const ra: RiskAssessment = await r.json();
    setAssessments(prev => [ra, ...prev]);
    return ra;
  }, []);

  const fetchSections = useCallback(async () => {
    try {
      const r = await fetch("/api/risk-assessment/sections");
      if (!r.ok) throw new Error("Failed to fetch sections");
      const data = await r.json();
      setSections(data.sections ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const submitResponse = useCallback(async (
    raId: string,
    assetId: string,
    sectionId: string,
    questionId: string,
    answer: AnswerType,
    details: string,
  ): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, section_id: sectionId, question_id: questionId, answer, details }),
    });
    if (!r.ok) throw new Error("Failed to submit response");
    const updated = await fetch(`/api/risk-assessment/${raId}`);
    if (updated.ok) {
      const ra: RiskAssessment = await updated.json();
      setSelectedAssessment(ra);
      setAssessments(prev => prev.map(a => a.id === raId ? ra : a));
    }
  }, []);

  const analyzeAssessment = useCallback(async (raId: string): Promise<void> => {
    setIsAnalyzing(true);
    try {
      const r = await fetch(`/api/risk-assessment/${raId}/analyze`, { method: "POST" });
      if (!r.ok) throw new Error("Analysis failed");
      const data = await r.json();
      setSelectedAssessment(prev => prev ? { ...prev, risks: data.risks, status: "risks_identified" } : prev);
      setAssessments(prev => prev.map(a => a.id === raId ? { ...a, risks: data.risks, status: "risks_identified" } : a));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const addHumanRisk = useCallback(async (raId: string, risk: any): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/risks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(risk),
    });
    if (!r.ok) throw new Error("Failed to add risk");
    const data = await r.json();
    setSelectedAssessment(prev => prev?.id === raId ? { ...prev, risks: [...prev.risks, data.risk] } : prev);
  }, []);

  const applyControl = useCallback(async (
    raId: string,
    riskId: string,
    controlId: string,
    source: string,
    rationale: string,
  ): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ risk_id: riskId, control_id: controlId, source, human_rationale: rationale }),
    });
    if (!r.ok) throw new Error("Failed to apply control");
  }, []);

  const fetchResidual = useCallback(async (raId: string): Promise<void> => {
    try {
      const r = await fetch(`/api/risk-assessment/${raId}/residual`);
      if (!r.ok) throw new Error("Failed to fetch residual");
      const data = await r.json();
      setResidualResults(data.residual_risks ?? []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const suggestControls = useCallback(async (raId: string): Promise<void> => {
    const r = await fetch(`/api/risk-assessment/${raId}/suggest-controls`, { method: "POST" });
    if (!r.ok) throw new Error("Failed to suggest controls");
    const data = await r.json();
    setSelectedAssessment(prev =>
      prev?.id === raId ? { ...prev, suggested_controls: data.suggestions ?? [] } : prev
    );
    setAssessments(prev =>
      prev.map(a => a.id === raId ? { ...a, suggested_controls: data.suggestions ?? [] } : a)
    );
  }, []);

  const generateReport = useCallback(async (raId: string): Promise<void> => {
    setIsGeneratingReport(true);
    try {
      const r = await fetch(`/api/risk-assessment/${raId}/generate-report`, { method: "POST" });
      if (!r.ok) throw new Error("Failed to generate report");
      const data = await r.json();
      setReport(data.report_markdown ?? null);
      setSelectedAssessment(prev =>
        prev?.id === raId ? { ...prev, report_markdown: data.report_markdown, status: "complete" } : prev
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  }, []);

  return (
    <RiskAssessmentContext.Provider value={{
      assessments, selectedAssessment, sections, residualResults,
      isLoading, isAnalyzing, isGeneratingReport, error, report,
      fetchAssessments, selectAssessment, createAssessment,
      fetchSections, submitResponse, analyzeAssessment,
      addHumanRisk, applyControl, fetchResidual,
      suggestControls, generateReport,
    }}>
      {children}
    </RiskAssessmentContext.Provider>
  );
}

export function useRiskAssessment() {
  const ctx = useContext(RiskAssessmentContext);
  if (!ctx) throw new Error("useRiskAssessment must be used inside RiskAssessmentProvider");
  return ctx;
}

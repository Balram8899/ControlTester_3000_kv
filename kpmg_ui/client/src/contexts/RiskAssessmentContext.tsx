// kpmg_ui/client/src/contexts/RiskAssessmentContext.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type StatusType = "draft" | "in_progress" | "risks_identified" | "controls_applied" | "complete";
export type RiskBand = "Low" | "Medium" | "High" | "Critical";
export type AssessmentType = "BIA" | "LEGAL" | "PIA";

export interface RiskAssessment {
  id: string;
  title: string;
  description: string;
  status: StatusType;
  asset_ids: string[];
  initial_inherent_ratings: Record<string, string>;
  responses: ResponseRecord[];
  risks: Risk[];
  applied_controls: AppliedControl[];
  created_at: string;
  updated_at: string;
}

export interface ResponseRecord {
  id: string;
  asset_id: string;
  assessment_type: AssessmentType;
  question_id: string;
  response_text: string;
  submitted_at: string;
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
  source: "llm_generated" | "human_added";
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

export interface Question {
  id: string;
  question_text: string;
  guidance_text: string;
  required: boolean;
  order: number;
}

export interface ResidualRiskResult {
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

export interface RiskAssessmentCreate {
  title: string;
  description: string;
  asset_ids: string[];
  initial_inherent_ratings: Record<string, string>;
}

interface Ctx {
  assessments: RiskAssessment[];
  selectedAssessment: RiskAssessment | null;
  questions: Record<AssessmentType, Question[]>;
  residualResults: ResidualRiskResult[];
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  fetchAssessments: () => Promise<void>;
  selectAssessment: (a: RiskAssessment | null) => void;
  createAssessment: (data: RiskAssessmentCreate) => Promise<RiskAssessment>;
  fetchQuestions: (type: AssessmentType) => Promise<void>;
  submitResponse: (raId: string, assetId: string, type: AssessmentType, questionId: string, text: string) => Promise<void>;
  analyzeAssessment: (raId: string) => Promise<void>;
  addHumanRisk: (raId: string, risk: Omit<Risk, "id" | "inherent_risk_score" | "inherent_risk_band" | "residual_risk_score" | "residual_risk_band" | "source" | "status">) => Promise<void>;
  applyControl: (raId: string, riskId: string, controlId: string, source: string, rationale: string) => Promise<void>;
  fetchResidual: (raId: string) => Promise<void>;
  refreshAssessment: (raId: string) => Promise<void>;
}

const RiskAssessmentContext = createContext<Ctx | null>(null);

export function RiskAssessmentProvider({ children }: { children: ReactNode }) {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [questions, setQuestions] = useState<Record<AssessmentType, Question[]>>({ BIA: [], LEGAL: [], PIA: [] });
  const [residualResults, setResidualResults] = useState<ResidualRiskResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const r = await fetch("/api/risk-assessment");
      if (!r.ok) throw new Error("Failed to fetch assessments");
      setAssessments(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, []);

  const selectAssessment = useCallback((a: RiskAssessment | null) => {
    setSelectedAssessment(a);
    setResidualResults([]);
  }, []);

  const refreshAssessment = useCallback(async (raId: string) => {
    const r = await fetch(`/api/risk-assessment/${raId}`);
    if (!r.ok) return;
    const updated: RiskAssessment = await r.json();
    setAssessments(p => p.map(a => a.id === raId ? updated : a));
    setSelectedAssessment(prev => prev?.id === raId ? updated : prev);
  }, []);

  const createAssessment = useCallback(async (data: RiskAssessmentCreate): Promise<RiskAssessment> => {
    const r = await fetch("/api/risk-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error("Failed to create assessment");
    const ra: RiskAssessment = await r.json();
    setAssessments(p => [ra, ...p]);
    return ra;
  }, []);

  const fetchQuestions = useCallback(async (type: AssessmentType) => {
    const r = await fetch(`/api/risk-assessment/questions/${type}`);
    if (!r.ok) return;
    const data = await r.json();
    setQuestions(p => ({ ...p, [type]: data.questions }));
  }, []);

  const submitResponse = useCallback(async (raId: string, assetId: string, type: AssessmentType, questionId: string, text: string) => {
    const r = await fetch(`/api/risk-assessment/${raId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, assessment_type: type, question_id: questionId, response_text: text }),
    });
    if (!r.ok) throw new Error("Failed to submit response");
    await refreshAssessment(raId);
  }, [refreshAssessment]);

  const analyzeAssessment = useCallback(async (raId: string) => {
    setIsAnalyzing(true); setError(null);
    try {
      const r = await fetch(`/api/risk-assessment/${raId}/analyze`, { method: "POST" });
      if (!r.ok) throw new Error("Analysis failed");
      await refreshAssessment(raId);
    } catch (e: any) { setError(e.message); }
    finally { setIsAnalyzing(false); }
  }, [refreshAssessment]);

  const addHumanRisk = useCallback(async (raId: string, risk: any) => {
    const r = await fetch(`/api/risk-assessment/${raId}/risks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(risk),
    });
    if (!r.ok) throw new Error("Failed to add risk");
    await refreshAssessment(raId);
  }, [refreshAssessment]);

  const applyControl = useCallback(async (raId: string, riskId: string, controlId: string, source: string, rationale: string) => {
    const r = await fetch(`/api/risk-assessment/${raId}/controls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ risk_id: riskId, control_id: controlId, source, human_rationale: rationale }),
    });
    if (!r.ok) throw new Error("Failed to apply control");
    await refreshAssessment(raId);
  }, [refreshAssessment]);

  const fetchResidual = useCallback(async (raId: string) => {
    const r = await fetch(`/api/risk-assessment/${raId}/residual`);
    if (!r.ok) return;
    const data = await r.json();
    setResidualResults(data.residual_risks ?? []);
  }, []);

  return (
    <RiskAssessmentContext.Provider value={{
      assessments, selectedAssessment, questions, residualResults, isLoading, isAnalyzing, error,
      fetchAssessments, selectAssessment, createAssessment, fetchQuestions,
      submitResponse, analyzeAssessment, addHumanRisk, applyControl, fetchResidual, refreshAssessment,
    }}>
      {children}
    </RiskAssessmentContext.Provider>
  );
}

export function useRiskAssessment() {
  const ctx = useContext(RiskAssessmentContext);
  if (!ctx) throw new Error("useRiskAssessment must be inside RiskAssessmentProvider");
  return ctx;
}

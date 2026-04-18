// kpmg_ui/client/src/pages/risk-assessment.tsx
import { useEffect, useState } from "react";
import {
  ChevronDown, ChevronRight,
  CheckCircle2, FileBarChart, Loader2, Plus, ShieldAlert, Sparkles,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useRiskAssessment,
  AnswerType,
  Section,
} from "@/contexts/RiskAssessmentContext";
import { useAssetRegistry } from "@/contexts/AssetRegistryContext";

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", in_progress: "In Progress",
  risks_identified: "Risks Identified", controls_applied: "Controls Applied", complete: "Complete",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-300",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300",
  risks_identified: "bg-amber-100 text-amber-700 border-amber-300",
  controls_applied: "bg-violet-100 text-violet-700 border-violet-300",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-300",
};
const BAND_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-300",
  High: "bg-orange-100 text-orange-700 border-orange-300",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  Low: "bg-emerald-100 text-emerald-700 border-emerald-300",
};
const ANSWER_STYLE: Record<AnswerType, string> = {
  yes: "bg-red-100 text-red-700 border-red-300 font-semibold",
  no: "bg-emerald-100 text-emerald-700 border-emerald-300 font-semibold",
  na: "bg-slate-100 text-slate-500 border-slate-300",
};

const WIZARD_STEPS = ["Create", "Questionnaire", "Analyse", "Risks", "Residual", "Controls", "Report"];

type RightTab = "dashboard" | "wizard";

// ── Local Q&A state types ─────────────────────────────────────────────────

interface LocalAnswer {
  answer: AnswerType;
  details: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function RiskAssessmentPage() {
  const {
    assessments, selectedAssessment, sections, residualResults,
    isLoading, isAnalyzing, isGeneratingReport, error, report,
    fetchAssessments, selectAssessment, createAssessment,
    fetchSections, submitResponse, analyzeAssessment, addHumanRisk, fetchResidual,
    suggestControls, generateReport,
  } = useRiskAssessment();
  const { assets, fetchAssets } = useAssetRegistry();
  const { toast } = useToast();

  const [rightTab, setRightTab] = useState<RightTab>("dashboard");
  const [wizardStep, setWizardStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [form, setForm] = useState<{ title: string; description: string; selectedAssetIds: string[] }>({
    title: "", description: "", selectedAssetIds: [],
  });

  // Q&A state
  const [qaAssetIdx, setQaAssetIdx] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  // answers[assetId][sectionId][questionId] = LocalAnswer
  const [answers, setAnswers] = useState<Record<string, Record<string, Record<string, LocalAnswer>>>>({});
  const [submittingQa, setSubmittingQa] = useState(false);

  useEffect(() => { fetchAssessments(); fetchAssets(); fetchSections(); }, []);

  // ── KPIs ──────────────────────────────────────────────────────────────

  const active = assessments.filter(a => a.status !== "complete").length;
  const allRisks = assessments.flatMap(a => a.risks);
  const highCrit = allRisks.filter(r =>
    r.inherent_risk_band === "Critical" || r.inherent_risk_band === "High"
  ).length;
  const drafts = assessments.filter(a => a.status === "draft").length;

  // ── Helpers ───────────────────────────────────────────────────────────

  function setAnswer(assetId: string, sectionId: string, questionId: string, answer: AnswerType) {
    setAnswers(prev => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {}),
        [sectionId]: {
          ...(prev[assetId]?.[sectionId] ?? {}),
          [questionId]: { answer, details: prev[assetId]?.[sectionId]?.[questionId]?.details ?? "" },
        },
      },
    }));
  }

  function setDetails(assetId: string, sectionId: string, questionId: string, details: string) {
    setAnswers(prev => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {}),
        [sectionId]: {
          ...(prev[assetId]?.[sectionId] ?? {}),
          [questionId]: { answer: prev[assetId]?.[sectionId]?.[questionId]?.answer ?? "na", details },
        },
      },
    }));
  }

  function answeredCount(assetId: string): number {
    const assetAnswers = answers[assetId] ?? {};
    return Object.values(assetAnswers).flatMap(s => Object.values(s)).filter(a => a.answer !== "na").length;
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!form.title || form.selectedAssetIds.length === 0) {
      toast({ title: "Title and at least one asset required", variant: "destructive" });
      return;
    }
    try {
      const ra = await createAssessment({
        title: form.title,
        description: form.description,
        asset_ids: form.selectedAssetIds,
      });
      selectAssessment(ra);
      setShowCreate(false);
      setWizardStep(1);
      setRightTab("wizard");
      setQaAssetIdx(0);
      setExpandedSection(sections[0]?.id ?? null);
      toast({ title: "Assessment created" });
    } catch {
      toast({ title: "Failed to create assessment", variant: "destructive" });
    }
  }

  async function handleSubmitQa() {
    if (!selectedAssessment) return;
    const assetId = selectedAssessment.asset_ids[qaAssetIdx];
    setSubmittingQa(true);
    try {
      for (const section of sections) {
        for (const question of section.questions) {
          const local = answers[assetId]?.[section.id]?.[question.id];
          if (local && local.answer !== "na") {
            await submitResponse(
              selectedAssessment.id, assetId, section.id, question.id, local.answer, local.details,
            );
          }
        }
      }
      if (qaAssetIdx < selectedAssessment.asset_ids.length - 1) {
        setQaAssetIdx(i => i + 1);
        setExpandedSection(sections[0]?.id ?? null);
        toast({ title: "Responses saved — next application" });
      } else {
        setWizardStep(2);
        toast({ title: "All responses submitted — ready to analyse" });
      }
    } catch {
      toast({ title: "Failed to save responses", variant: "destructive" });
    } finally {
      setSubmittingQa(false);
    }
  }

  async function handleAnalyse() {
    if (!selectedAssessment) return;
    try {
      await analyzeAssessment(selectedAssessment.id);
      setWizardStep(3);
      toast({ title: "Analysis complete" });
    } catch {
      toast({ title: "Analysis failed", variant: "destructive" });
    }
  }

  async function handleFetchResidual() {
    if (!selectedAssessment) return;
    await fetchResidual(selectedAssessment.id);
    setWizardStep(4);
  }

  // ── Section accordion helpers ─────────────────────────────────────────

  function sectionProgress(assetId: string, section: Section): number {
    const sectionAnswers = answers[assetId]?.[section.id] ?? {};
    return Object.values(sectionAnswers).filter(a => a.answer !== "na").length;
  }

  // ── Render ────────────────────────────────────────────────────────────

  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? id;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <HeroSection
        title="Risk Assessment"
        subtitle="Application risk assessments — questionnaire, inherent scoring, residual analysis"
        icon={ShieldAlert}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel: assessment list ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100">
            <Button className="w-full" size="sm" onClick={() => { setShowCreate(true); setRightTab("dashboard"); }}>
              <Plus className="w-4 h-4 mr-2" /> New Assessment
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin w-5 h-5 text-slate-400" /></div>
            ) : assessments.map(a => (
              <button
                key={a.id}
                onClick={() => { selectAssessment(a); setRightTab("wizard"); setWizardStep(a.status === "draft" ? 0 : a.status === "in_progress" ? 1 : a.status === "risks_identified" ? 3 : 4); }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedAssessment?.id === a.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
              >
                <p className="font-medium text-sm text-slate-800 truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[a.status]}`}>
                    {STATUS_LABELS[a.status]}
                  </Badge>
                  <span className="text-xs text-slate-400">{a.asset_ids.length} app{a.asset_ids.length !== 1 ? "s" : ""}</span>
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-auto p-6">
          {/* Create modal */}
          {showCreate && (
            <Card className="max-w-lg mx-auto mb-6">
              <CardHeader><CardTitle>New Risk Assessment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Assessment title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                <Textarea placeholder="High-level description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Select applications in scope *</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
                    {assets.map(a => (
                      <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={form.selectedAssetIds.includes(a.id)}
                          onChange={e => setForm(p => ({
                            ...p,
                            selectedAssetIds: e.target.checked
                              ? [...p.selectedAssetIds, a.id]
                              : p.selectedAssetIds.filter(id => id !== a.id),
                          }))}
                        />
                        <span className="text-sm">{a.name}</span>
                        <Badge variant="outline" className={`text-xs ml-auto ${BAND_COLOR[a.criticality]}`}>{a.criticality}</Badge>
                      </label>
                    ))}
                    {assets.length === 0 && (
                      <p className="text-xs text-slate-400 p-2">No applications in Asset Registry yet.</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreate}>Create</Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dashboard */}
          {!selectedAssessment && !showCreate && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-blue-600">{active}</p><p className="text-sm text-slate-500">Active Assessments</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-orange-600">{highCrit}</p><p className="text-sm text-slate-500">High / Critical Risks</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-2xl font-bold text-slate-500">{drafts}</p><p className="text-sm text-slate-500">Drafts</p></CardContent></Card>
              </div>
              <p className="text-slate-400 text-sm">Select an assessment from the left, or create a new one.</p>
            </div>
          )}

          {/* Wizard */}
          {selectedAssessment && rightTab === "wizard" && (
            <div className="max-w-3xl">
              {/* Stepper */}
              <div className="flex items-center gap-2 mb-6">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${i < wizardStep ? "bg-emerald-500 border-emerald-500 text-white" : i === wizardStep ? "bg-blue-500 border-blue-500 text-white" : "bg-white border-slate-300 text-slate-400"}`}>
                      {i < wizardStep ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === wizardStep ? "text-blue-600" : "text-slate-400"}`}>{label}</span>
                    {i < WIZARD_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 ml-1" />}
                  </div>
                ))}
              </div>

              {/* Step 0: Summary */}
              {wizardStep === 0 && (
                <Card>
                  <CardHeader><CardTitle>{selectedAssessment.title}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600">{selectedAssessment.description}</p>
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-1">Applications in scope</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedAssessment.asset_ids.map(id => (
                          <Badge key={id} variant="outline">{assetName(id)}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button onClick={() => { setWizardStep(1); setExpandedSection(sections[0]?.id ?? null); }}>
                      Start Questionnaire <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 1: Questionnaire */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  {/* Asset tab bar */}
                  <div className="flex gap-2">
                    {selectedAssessment.asset_ids.map((id, idx) => (
                      <button
                        key={id}
                        onClick={() => setQaAssetIdx(idx)}
                        className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${idx === qaAssetIdx ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}
                      >
                        {assetName(id)}
                        <span className="ml-1 text-xs opacity-70">({answeredCount(id)})</span>
                      </button>
                    ))}
                  </div>

                  {/* Section accordion */}
                  {sections.map(section => {
                    const assetId = selectedAssessment.asset_ids[qaAssetIdx];
                    const done = sectionProgress(assetId, section);
                    const total = section.questions.length;
                    const isOpen = expandedSection === section.id;
                    return (
                      <Card key={section.id} className={isOpen ? "ring-1 ring-blue-300" : ""}>
                        <button
                          className="w-full flex items-center justify-between px-4 py-3 text-left"
                          onClick={() => setExpandedSection(isOpen ? null : section.id)}
                        >
                          <div className="flex items-center gap-3">
                            {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            <span className="font-medium text-sm text-slate-800">{section.title}</span>
                          </div>
                          <Badge variant="outline" className={done === total ? "border-emerald-400 text-emerald-600" : "border-slate-300 text-slate-500"}>
                            {done}/{total}
                          </Badge>
                        </button>
                        {isOpen && (
                          <CardContent className="pt-0 space-y-4">
                            {section.questions.map(q => {
                              const local = answers[assetId]?.[section.id]?.[q.id];
                              return (
                                <div key={q.id} className="border-t pt-3">
                                  <div className="flex items-start gap-2 mb-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded border ${q.question_type === "Exposure" ? "bg-orange-50 text-orange-600 border-orange-200" : q.question_type === "Control" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                                      {q.question_type}
                                    </span>
                                    <p className="text-sm text-slate-700 flex-1">{q.text}</p>
                                  </div>
                                  <div className="flex gap-2 mb-2">
                                    {(["yes", "no", "na"] as AnswerType[]).map(a => (
                                      <button
                                        key={a}
                                        onClick={() => setAnswer(assetId, section.id, q.id, a)}
                                        className={`px-3 py-1 rounded border text-xs transition-colors ${local?.answer === a ? ANSWER_STYLE[a] : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"}`}
                                      >
                                        {a === "na" ? "N/A" : a.toUpperCase()}
                                      </button>
                                    ))}
                                  </div>
                                  {local?.answer && local.answer !== "na" && (
                                    <Textarea
                                      placeholder="Additional details (optional)"
                                      value={local.details}
                                      onChange={e => setDetails(assetId, section.id, q.id, e.target.value)}
                                      rows={2}
                                      className="text-sm"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}

                  <Button onClick={handleSubmitQa} disabled={submittingQa} className="mt-2">
                    {submittingQa && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {qaAssetIdx < selectedAssessment.asset_ids.length - 1 ? "Save & Next Application" : "Submit All Responses"}
                  </Button>
                </div>
              )}

              {/* Step 2: Analyse */}
              {wizardStep === 2 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" />Run Risk Analysis</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600">
                      The analysis uses a hybrid rule-layer + Gemini LLM model to identify 2–4 specific risks per application
                      from your questionnaire responses.
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedAssessment.responses.length} responses submitted across {selectedAssessment.asset_ids.length} application(s).
                    </p>
                    <Button onClick={handleAnalyse} disabled={isAnalyzing}>
                      {isAnalyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analysing…</> : "Run Analysis"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Risks */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Identified Risks ({selectedAssessment.risks.length})</h3>
                    <Button size="sm" variant="outline" onClick={() => setWizardStep(4)}>
                      View Residual <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  {selectedAssessment.risks.map(r => (
                    <Card key={r.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm text-slate-800">{r.title}</p>
                            <p className="text-xs text-slate-500 mt-1">{r.description}</p>
                          </div>
                          <Badge variant="outline" className={BAND_COLOR[r.inherent_risk_band]}>
                            {r.inherent_risk_band}
                          </Badge>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                          <span>Likelihood: {r.likelihood_score}/5</span>
                          <span>Impact: {r.impact_score}/5</span>
                          <span>Score: {r.inherent_risk_score}</span>
                          <Badge variant="outline" className="text-xs">{r.risk_category}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {selectedAssessment.risks.length === 0 && (
                    <p className="text-slate-400 text-sm">No risks identified yet. Run analysis first.</p>
                  )}
                </div>
              )}

              {/* Step 4: Residual */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Residual Risk</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleFetchResidual}>
                        <FileBarChart className="w-4 h-4 mr-1" />Refresh
                      </Button>
                      <Button size="sm" onClick={() => setWizardStep(5)}>
                        Suggest Controls <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                  {residualResults.length === 0 && (
                    <Button onClick={handleFetchResidual}>Calculate Residual Risk</Button>
                  )}
                  {residualResults.map(r => (
                    <Card key={r.risk_id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-slate-800">{r.risk_title}</p>
                          <div className="flex gap-2">
                            <Badge variant="outline" className={BAND_COLOR[r.inherent_risk_band]}>
                              Inherent: {r.inherent_risk_band}
                            </Badge>
                            <Badge variant="outline" className={BAND_COLOR[r.residual_risk_band]}>
                              Residual: {r.residual_risk_band}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-slate-500">
                          <span>Controls: {r.controls_applied}</span>
                          <span>Avg effectiveness: {(r.avg_effectiveness * 100).toFixed(0)}%</span>
                          <span>Residual score: {r.residual_risk_score}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Step 5: Suggested Controls */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Suggested Controls</h3>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => {
                        try { await suggestControls(selectedAssessment.id); toast({ title: "Controls suggested" }); }
                        catch { toast({ title: "Failed to suggest controls", variant: "destructive" }); }
                      }}>
                        <Sparkles className="w-4 h-4 mr-1" />Suggest Controls
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setWizardStep(6)}>
                        Proceed to Report <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                  {(selectedAssessment.suggested_controls ?? []).length === 0 && (
                    <p className="text-slate-400 text-sm">Click "Suggest Controls" to rank controls from the library against your risks.</p>
                  )}
                  {(selectedAssessment.suggested_controls ?? []).map((s, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{s.control_title}</p>
                            <p className="text-xs text-slate-500 mt-1">{s.rationale}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">Relevance {s.relevance_score}/5</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Step 6: Report */}
              {wizardStep === 6 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Risk Assessment Report</h3>
                    <Button size="sm" onClick={async () => {
                      try { await generateReport(selectedAssessment.id); toast({ title: "Report generated" }); }
                      catch { toast({ title: "Report failed", variant: "destructive" }); }
                    }} disabled={isGeneratingReport}>
                      {isGeneratingReport ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileBarChart className="w-4 h-4 mr-1" />}
                      Generate Report
                    </Button>
                  </div>
                  {report ? (
                    <Card>
                      <CardContent className="pt-4">
                        <pre className="whitespace-pre-wrap text-xs text-slate-700 font-mono leading-relaxed">{report}</pre>
                      </CardContent>
                    </Card>
                  ) : (
                    <p className="text-slate-400 text-sm">Click "Generate Report" to produce the 9-section Risk Assessment Report.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

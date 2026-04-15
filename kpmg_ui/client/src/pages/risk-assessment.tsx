import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight,
  FileBarChart, Layers, Loader2, Plus, ShieldAlert, ShieldCheck, Sparkles, X,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useRiskAssessment, AssessmentType, RiskAssessmentCreate } from "@/contexts/RiskAssessmentContext";
import { useAssetRegistry } from "@/contexts/AssetRegistryContext";

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

const WIZARD_STEPS = ["Create", "Q&A", "Analyse", "Risks", "Residual"];

type RightTab = "dashboard" | "wizard" | "register";

export default function RiskAssessmentPage() {
  const {
    assessments, selectedAssessment, questions, residualResults,
    isLoading, isAnalyzing, error,
    fetchAssessments, selectAssessment, createAssessment, fetchQuestions,
    submitResponse, analyzeAssessment, addHumanRisk, fetchResidual,
  } = useRiskAssessment();
  const { assets, fetchAssets } = useAssetRegistry();
  const { toast } = useToast();

  const [rightTab, setRightTab] = useState<RightTab>("dashboard");
  const [wizardStep, setWizardStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [form, setForm] = useState<{ title: string; description: string; selectedAssetIds: string[]; ratings: Record<string, string> }>({
    title: "", description: "", selectedAssetIds: [], ratings: {},
  });

  // Q&A state
  const [qaTab, setQaTab] = useState<AssessmentType>("BIA");
  const [qaAssetIdx, setQaAssetIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittingQa, setSubmittingQa] = useState(false);

  useEffect(() => { fetchAssessments(); fetchAssets(); }, []);
  useEffect(() => {
    if (selectedAssessment && rightTab === "wizard") {
      fetchQuestions("BIA"); fetchQuestions("LEGAL"); fetchQuestions("PIA");
    }
  }, [selectedAssessment, rightTab]);

  // KPIs
  const active = assessments.filter(a => a.status !== "complete").length;
  const allRisks = assessments.flatMap(a => a.risks);
  const highCrit = allRisks.filter(r => r.inherent_risk_band === "Critical" || r.inherent_risk_band === "High").length;
  const overdue = assessments.filter(a => a.status === "draft").length;

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!form.title || form.selectedAssetIds.length === 0) {
      toast({ title: "Title and at least one asset required", variant: "destructive" }); return;
    }
    try {
      const ra = await createAssessment({
        title: form.title,
        description: form.description,
        asset_ids: form.selectedAssetIds,
        initial_inherent_ratings: form.ratings,
      });
      selectAssessment(ra);
      setShowCreate(false);
      setForm({ title: "", description: "", selectedAssetIds: [], ratings: {} });
      setRightTab("wizard");
      setWizardStep(1);
      fetchQuestions("BIA"); fetchQuestions("LEGAL"); fetchQuestions("PIA");
      toast({ title: "Assessment created", description: ra.title });
    } catch { toast({ title: "Failed to create assessment", variant: "destructive" }); }
  }

  async function handleSubmitQa() {
    if (!selectedAssessment) return;
    const assetId = selectedAssessment.asset_ids[qaAssetIdx];
    const qs = questions[qaTab];
    setSubmittingQa(true);
    try {
      for (const q of qs) {
        const key = `${assetId}_${qaTab}_${q.id}`;
        const text = answers[key];
        if (text?.trim()) {
          await submitResponse(selectedAssessment.id, assetId, qaTab, q.id, text);
        }
      }
      toast({ title: `${qaTab} responses saved` });
    } catch { toast({ title: "Failed to save responses", variant: "destructive" }); }
    finally { setSubmittingQa(false); }
  }

  async function handleAnalyze() {
    if (!selectedAssessment) return;
    await analyzeAssessment(selectedAssessment.id);
    if (!error) {
      setWizardStep(3);
      toast({ title: "Analysis complete", description: "Risks identified by LLM" });
    } else {
      toast({ title: "Analysis failed", description: error, variant: "destructive" });
    }
  }

  async function handleResidual() {
    if (!selectedAssessment) return;
    await fetchResidual(selectedAssessment.id);
    setWizardStep(4);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <HeroSection
        title="Risk Assessment"
        subtitle="5-step BIA · Legal/Reg · PIA workflow with LLM-assisted risk identification"
        icon={ShieldAlert}
        actions={
          <Button size="sm" className="gap-1 border-white/15 bg-white/5 text-white hover:bg-white/10" variant="outline"
            onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> New Assessment
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Assessments</p>
          </div>
          <ScrollArea className="flex-1">
            {isLoading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
            {assessments.map(ra => {
              const sel = selectedAssessment?.id === ra.id;
              return (
                <button key={ra.id} type="button" onClick={() => { selectAssessment(ra); setRightTab("dashboard"); setWizardStep(0); }}
                  className={`w-full border-b border-slate-100 p-3 text-left transition-colors ${sel ? "bg-blue-50 border-l-2 border-l-[#001E62]" : "hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-800">{ra.title}</span>
                    <Badge className={`border text-[10px] flex-shrink-0 ${STATUS_COLOR[ra.status]}`}>{STATUS_LABELS[ra.status]}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{ra.asset_ids.length} asset{ra.asset_ids.length !== 1 ? "s" : ""} · {ra.risks.length} risks</p>
                </button>
              );
            })}
            {!isLoading && assessments.length === 0 && (
              <div className="p-4 text-center">
                <p className="text-xs text-slate-400">No assessments yet.</p>
                <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setShowCreate(true)}>
                  <Plus className="mr-1 h-3 w-3" /> New
                </Button>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-50">
          <div className="flex gap-1 border-b border-slate-200 bg-white px-4 pt-3">
            {([["dashboard", "Dashboard"], ["wizard", "Assessment Wizard"], ["register", "Risk Register"]] as const).map(([tab, label]) => (
              <button key={tab} type="button" onClick={() => setRightTab(tab)}
                className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${rightTab === tab ? "border-[#001E62] text-[#001E62]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 p-4">
            {/* ── Dashboard ── */}
            {rightTab === "dashboard" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[
                    { label: "Active Assessments", value: active, icon: Layers, color: "text-blue-600" },
                    { label: "Risks Identified", value: allRisks.length, icon: AlertTriangle, color: "text-amber-600" },
                    { label: "High / Critical Risks", value: highCrit, icon: ShieldAlert, color: "text-red-600" },
                    { label: "Drafts Pending", value: overdue, icon: FileBarChart, color: "text-violet-600" },
                  ].map(k => (
                    <Card key={k.label}>
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">{k.label}</p>
                          <k.icon className={`h-4 w-4 ${k.color}`} />
                        </div>
                        <p className="text-3xl font-bold text-slate-800">{k.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {selectedAssessment ? (
                  <Card className="border-[#001E62]">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-semibold text-[#001E62] uppercase tracking-wide">{selectedAssessment.title}</CardTitle>
                        <Badge className={`border text-[10px] ${STATUS_COLOR[selectedAssessment.status]}`}>{STATUS_LABELS[selectedAssessment.status]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-2 text-xs text-slate-600">
                      <p><span className="font-medium">Assets:</span> {selectedAssessment.asset_ids.length} in scope</p>
                      <p><span className="font-medium">Responses:</span> {selectedAssessment.responses.length} submitted</p>
                      <p><span className="font-medium">Risks:</span> {selectedAssessment.risks.length} identified</p>
                      <p><span className="font-medium">Controls Applied:</span> {selectedAssessment.applied_controls.length}</p>
                      <Button size="sm" className="mt-2 h-7 text-xs gap-1" onClick={() => setRightTab("wizard")}>
                        Open Wizard <ArrowRight className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center text-sm text-slate-400">
                      Select an assessment from the left panel, or <button className="text-blue-600 underline" onClick={() => setShowCreate(true)}>create a new one</button>.
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── Wizard ── */}
            {rightTab === "wizard" && (
              <div className="space-y-4 max-w-2xl">
                {!selectedAssessment ? (
                  <Card><CardContent className="p-6 text-center text-sm text-slate-400">Select or create an assessment first.</CardContent></Card>
                ) : (
                  <>
                    {/* Step indicator */}
                    <div className="flex items-center gap-1">
                      {WIZARD_STEPS.map((s, idx) => (
                        <div key={s} className="flex items-center gap-1">
                          <button type="button" onClick={() => setWizardStep(idx)}
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${wizardStep === idx ? "bg-[#001E62] text-white" : idx < wizardStep ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                            {idx < wizardStep ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                          </button>
                          <span className={`text-[10px] font-medium ${wizardStep === idx ? "text-[#001E62]" : "text-slate-400"}`}>{s}</span>
                          {idx < WIZARD_STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                        </div>
                      ))}
                    </div>

                    {/* Step 0: Overview */}
                    {wizardStep === 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm">Assessment Overview</CardTitle></CardHeader>
                        <CardContent className="space-y-2 text-xs text-slate-600">
                          <p><span className="font-medium">Title:</span> {selectedAssessment.title}</p>
                          <p><span className="font-medium">Description:</span> {selectedAssessment.description || "—"}</p>
                          <p><span className="font-medium">Assets in scope:</span> {selectedAssessment.asset_ids.length}</p>
                          <p><span className="font-medium">Status:</span> <Badge className={`border text-[10px] ${STATUS_COLOR[selectedAssessment.status]}`}>{STATUS_LABELS[selectedAssessment.status]}</Badge></p>
                          <div className="mt-3">
                            <p className="font-medium mb-1">Initial risk ratings:</p>
                            {Object.entries(selectedAssessment.initial_inherent_ratings).map(([aid, band]) => (
                              <div key={aid} className="flex justify-between py-0.5">
                                <span className="text-slate-500 truncate max-w-xs">{assets.find(a => a.id === aid)?.name ?? aid}</span>
                                <Badge className={`border text-[10px] ${BAND_COLOR[band]}`}>{band}</Badge>
                              </div>
                            ))}
                          </div>
                          <Button size="sm" className="mt-3 h-7 text-xs gap-1" onClick={() => setWizardStep(1)}>
                            Start Q&A <ArrowRight className="h-3 w-3" />
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {/* Step 1: Q&A */}
                    {wizardStep === 1 && (
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Step 2 — Q&A</CardTitle>
                            <div className="flex gap-1">
                              {(["BIA", "LEGAL", "PIA"] as AssessmentType[]).map(t => (
                                <button key={t} type="button" onClick={() => setQaTab(t)}
                                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${qaTab === t ? "bg-[#001E62] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          {selectedAssessment.asset_ids.length > 1 && (
                            <div className="flex gap-1 mt-2">
                              {selectedAssessment.asset_ids.map((aid, idx) => (
                                <button key={aid} type="button" onClick={() => setQaAssetIdx(idx)}
                                  className={`rounded px-2 py-0.5 text-[10px] transition-colors ${qaAssetIdx === idx ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                  {assets.find(a => a.id === aid)?.name ?? `Asset ${idx + 1}`}
                                </button>
                              ))}
                            </div>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(questions[qaTab] ?? []).map(q => {
                            const key = `${selectedAssessment.asset_ids[qaAssetIdx]}_${qaTab}_${q.id}`;
                            const existing = selectedAssessment.responses.find(
                              r => r.asset_id === selectedAssessment.asset_ids[qaAssetIdx] && r.assessment_type === qaTab && r.question_id === q.id
                            );
                            return (
                              <div key={q.id} className="space-y-1">
                                <p className="text-xs font-medium text-slate-700">{q.order}. {q.question_text} {q.required && <span className="text-red-500">*</span>}</p>
                                <p className="text-[10px] text-slate-400 italic">{q.guidance_text}</p>
                                {existing ? (
                                  <div className="rounded bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-700 flex gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                    <span>{existing.response_text}</span>
                                  </div>
                                ) : (
                                  <textarea
                                    className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-[#001E62] focus:outline-none"
                                    rows={2}
                                    placeholder="Enter your response…"
                                    value={answers[key] ?? ""}
                                    onChange={e => setAnswers(p => ({ ...p, [key]: e.target.value }))}
                                  />
                                )}
                              </div>
                            );
                          })}
                          <div className="flex justify-between pt-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setWizardStep(0)}>Back</Button>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSubmitQa} disabled={submittingQa}>
                                {submittingQa ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Responses"}
                              </Button>
                              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setWizardStep(2)}>
                                Next <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Step 2: Analyse */}
                    {wizardStep === 2 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm">Step 3 — LLM Analysis</CardTitle></CardHeader>
                        <CardContent className="space-y-3 text-xs text-slate-600">
                          <p>The LLM will analyse all Q&A responses and identify risks with inherent risk scores.</p>
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1">
                            <p><span className="font-medium">Responses submitted:</span> {selectedAssessment.responses.length}</p>
                            <p><span className="font-medium">Assets:</span> {selectedAssessment.asset_ids.length}</p>
                          </div>
                          {selectedAssessment.risks.length > 0 && (
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 flex gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                              <p className="text-emerald-700">{selectedAssessment.risks.length} risks already identified. Re-run to refresh.</p>
                            </div>
                          )}
                          <div className="flex justify-between pt-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setWizardStep(1)}>Back</Button>
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAnalyze} disabled={isAnalyzing}>
                              {isAnalyzing ? <><Loader2 className="h-3 w-3 animate-spin" /> Analysing…</> : <><Sparkles className="h-3 w-3" /> Run Analysis</>}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Step 3: Risks */}
                    {wizardStep === 3 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm">Step 4 — Risk Register</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {selectedAssessment.risks.length === 0 ? (
                            <p className="text-xs text-slate-400">No risks identified yet. Run analysis first.</p>
                          ) : selectedAssessment.risks.map(r => (
                            <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-800">{r.title}</p>
                                <div className="flex gap-1 flex-shrink-0">
                                  <Badge className={`border text-[10px] ${BAND_COLOR[r.inherent_risk_band]}`}>{r.inherent_risk_band}</Badge>
                                  <Badge className="border text-[10px] bg-slate-100 text-slate-500 border-slate-200">{r.source === "human_added" ? "Human" : "LLM"}</Badge>
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-500">{r.description}</p>
                              <p className="text-[10px] text-slate-400">
                                L:{r.likelihood_score} × I:{r.impact_score} = {r.inherent_risk_score} · {r.risk_category}
                              </p>
                            </div>
                          ))}
                          <div className="flex justify-between pt-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setWizardStep(2)}>Back</Button>
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleResidual}>
                              Calculate Residual Risk <ArrowRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Step 4: Residual */}
                    {wizardStep === 4 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm">Step 5 — Residual Risk Output</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {residualResults.length === 0 ? (
                            <p className="text-xs text-slate-400">No residual risk data. Apply controls first or click Calculate.</p>
                          ) : residualResults.map(r => (
                            <div key={r.risk_id} className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-slate-800">{r.risk_title}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded bg-slate-50 p-2">
                                  <p className="text-[10px] text-slate-400 uppercase">Inherent Risk</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Badge className={`border text-[10px] ${BAND_COLOR[r.inherent_risk_band]}`}>{r.inherent_risk_band}</Badge>
                                    <span className="text-slate-600 text-[10px]">(score: {r.inherent_risk_score})</span>
                                  </div>
                                </div>
                                <div className="rounded bg-slate-50 p-2">
                                  <p className="text-[10px] text-slate-400 uppercase">Residual Risk</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Badge className={`border text-[10px] ${BAND_COLOR[r.residual_risk_band]}`}>{r.residual_risk_band}</Badge>
                                    <span className="text-slate-600 text-[10px]">(score: {r.residual_risk_score})</span>
                                  </div>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400">{r.controls_applied} control{r.controls_applied !== 1 ? "s" : ""} applied · avg effectiveness {Math.round(r.avg_effectiveness * 100)}%</p>
                            </div>
                          ))}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setWizardStep(3)}>Back</Button>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Risk Register ── */}
            {rightTab === "register" && (
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">All Identified Risks</p>
                  <Badge className="border text-[10px] bg-slate-100 text-slate-600 border-slate-200">{allRisks.length} total</Badge>
                </div>
                {allRisks.length === 0 ? (
                  <Card><CardContent className="p-6 text-center text-sm text-slate-400">No risks identified yet. Run an assessment wizard to identify risks.</CardContent></Card>
                ) : allRisks.map(r => (
                  <div key={r.id} className="rounded-xl border border-slate-100 bg-white p-3 space-y-1 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">{r.title}</p>
                      <div className="flex gap-1 flex-shrink-0">
                        <Badge className={`border text-[10px] ${BAND_COLOR[r.inherent_risk_band]}`}>{r.inherent_risk_band}</Badge>
                        {r.residual_risk_band !== r.inherent_risk_band && (
                          <Badge className={`border text-[10px] ${BAND_COLOR[r.residual_risk_band]}`}>→ {r.residual_risk_band}</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">{r.description}</p>
                    <p className="text-[10px] text-slate-400">{r.risk_category} · L:{r.likelihood_score} × I:{r.impact_score} = {r.inherent_risk_score}</p>
                    {r.human_rationale && <p className="text-[10px] text-blue-500 italic">{r.human_rationale}</p>}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-800">New Risk Assessment</h2>
              <button onClick={() => setShowCreate(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>
            <ScrollArea className="flex-1 px-5 py-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Title *</label>
                  <Input className="mt-1 h-8 text-xs" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Q2 2026 Customer Data Risk Assessment" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Description</label>
                  <textarea className="mt-1 w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-xs" rows={2}
                    value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Select Assets *</label>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
                    {assets.filter(a => a.status === "Active").map(a => {
                      const sel = form.selectedAssetIds.includes(a.id);
                      return (
                        <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-slate-50">
                          <input type="checkbox" checked={sel} onChange={() => {
                            setForm(p => {
                              const ids = sel ? p.selectedAssetIds.filter(id => id !== a.id) : [...p.selectedAssetIds, a.id];
                              const ratings = { ...p.ratings };
                              if (!sel) ratings[a.id] = a.criticality;
                              else delete ratings[a.id];
                              return { ...p, selectedAssetIds: ids, ratings };
                            });
                          }} className="h-3 w-3" />
                          <span className="text-xs text-slate-700 flex-1">{a.name}</span>
                          <Badge className={`border text-[10px] ${BAND_COLOR[a.criticality]}`}>{a.criticality}</Badge>
                        </label>
                      );
                    })}
                    {assets.filter(a => a.status === "Active").length === 0 && (
                      <p className="text-xs text-slate-400 p-1">No active assets. Create assets in the Asset Registry first.</p>
                    )}
                  </div>
                </div>
                {form.selectedAssetIds.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-600">Initial Inherent Risk Rating (per asset)</label>
                    <div className="mt-1 space-y-1">
                      {form.selectedAssetIds.map(aid => {
                        const asset = assets.find(a => a.id === aid);
                        return (
                          <div key={aid} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-600 truncate flex-1">{asset?.name ?? aid}</span>
                            <select className="h-7 rounded border border-slate-200 px-1 text-xs"
                              value={form.ratings[aid] ?? "Medium"}
                              onChange={e => setForm(p => ({ ...p, ratings: { ...p.ratings, [aid]: e.target.value } }))}>
                              {["Low", "Medium", "High", "Critical"].map(b => <option key={b}>{b}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={!form.title || form.selectedAssetIds.length === 0}>Create & Start</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

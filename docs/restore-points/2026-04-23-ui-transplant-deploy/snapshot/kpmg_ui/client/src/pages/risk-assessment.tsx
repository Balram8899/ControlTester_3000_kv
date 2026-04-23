// kpmg_ui/client/src/pages/risk-assessment.tsx
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown, ChevronRight,
  CheckCircle2, FileBarChart, Loader2, Plus, ShieldAlert, Sparkles,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import HowItWorks from "@/components/HowItWorks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useRiskAssessment,
  AdHocApplication,
  AnswerType,
  Section,
} from "@/contexts/RiskAssessmentContext";
import { useAssetRegistry } from "@/contexts/AssetRegistryContext";
import CiaRatingWidget from "@/components/CiaRatingWidget";

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

const WIZARD_STEPS = ["Create", "Questionnaire", "Analyse", "Risks", "Controls", "Residual", "Report"];

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
    fetchSections, submitResponseBatch, analyzeAssessment, addHumanRisk,
    applyControl, fetchResidual, suggestControls, generateReport,
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
  const [adHocApps, setAdHocApps] = useState<AdHocApplication[]>([]);
  const [showAdHocForm, setShowAdHocForm] = useState(false);
  const [adHocDraft, setAdHocDraft] = useState<AdHocApplication>({
    name: "", description: "", assessment_context: "", confidentiality: 3, integrity: 3, availability: 3,
  });

  // Q&A state
  const [qaAssetIdx, setQaAssetIdx] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  // answers[assetId][sectionId][questionId] = LocalAnswer
  const [answers, setAnswers] = useState<Record<string, Record<string, Record<string, LocalAnswer>>>>({});
  const [submittingQa, setSubmittingQa] = useState(false);

  useEffect(() => { fetchAssessments(); fetchAssets(); fetchSections(); }, []);

  // Auto-trigger analysis on entering step 2
  useEffect(() => {
    if (wizardStep !== 2 || !selectedAssessment || isAnalyzing) return;
    if (selectedAssessment.risks.length > 0) { setWizardStep(3); return; }
    analyzeAssessment(selectedAssessment.id).then(() => setWizardStep(3)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, selectedAssessment?.id]);

  // Auto-suggest controls on entering step 4
  useEffect(() => {
    if (wizardStep !== 4 || !selectedAssessment) return;
    if ((selectedAssessment.suggested_controls ?? []).length === 0) {
      suggestControls(selectedAssessment.id).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, selectedAssessment?.id]);

  // Auto-fetch residual on entering step 5
  useEffect(() => {
    if (wizardStep !== 5 || !selectedAssessment) return;
    fetchResidual(selectedAssessment.id).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep, selectedAssessment?.id]);

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
    return Object.values(assetAnswers).flatMap(s => Object.values(s)).length; // count all including N/A
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!form.title || (form.selectedAssetIds.length === 0 && adHocApps.length === 0)) {
      toast({ title: "Title and at least one application required", variant: "destructive" });
      return;
    }
    try {
      const ra = await createAssessment({
        title: form.title,
        description: form.description,
        asset_ids: form.selectedAssetIds,
        ad_hoc_applications: adHocApps,
      });
      selectAssessment(ra);
      setShowCreate(false);
      setAdHocApps([]);
      setWizardStep(1);
      setRightTab("wizard");
      setQaAssetIdx(0);
      setExpandedSection(sections[0]?.id ?? null);
      toast({ title: "Assessment created" });
    } catch {
      toast({ title: "Failed to create assessment", variant: "destructive" });
    }
  }

  function handleAddAdHoc() {
    if (!adHocDraft.name?.trim()) return;
    setAdHocApps(prev => [...prev, { ...adHocDraft }]);
    setAdHocDraft({ name: "", description: "", assessment_context: "", confidentiality: 3, integrity: 3, availability: 3 });
    setShowAdHocForm(false);
  }

  async function handleSubmitQa() {
    if (!selectedAssessment) return;
    const assetId = selectedAssessment.asset_ids[qaAssetIdx];
    setSubmittingQa(true);
    try {
      const responses = sections.flatMap(section =>
        section.questions.map(question => {
          const local = answers[assetId]?.[section.id]?.[question.id];
          return {
            asset_id: assetId,
            section_id: section.id,
            question_id: question.id,
            answer: (local?.answer ?? "na") as AnswerType,
            details: local?.details ?? "",
          };
        })
      );
      await submitResponseBatch(selectedAssessment.id, responses);
      if (qaAssetIdx < selectedAssessment.asset_ids.length - 1) {
        setQaAssetIdx(i => i + 1);
        setExpandedSection(sections[0]?.id ?? null);
        toast({ title: "Responses saved — next application" });
      } else {
        setWizardStep(2);
        toast({ title: "All responses submitted — running analysis…" });
      }
    } catch {
      toast({ title: "Failed to save responses", variant: "destructive" });
    } finally {
      setSubmittingQa(false);
    }
  }

  async function refreshAssessment(raId: string) {
    try {
      const r = await fetch(`/api/risk-assessment/${raId}`);
      if (r.ok) { const ra = await r.json(); selectAssessment(ra); }
    } catch { /* non-critical */ }
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
    return Object.values(sectionAnswers).length; // count all answers including N/A
  }

  // ── Render ────────────────────────────────────────────────────────────

  const assetName = (id: string) =>
    assets.find(a => a.id === id)?.name ??
    selectedAssessment?.ad_hoc_applications?.find(a => a.id === id)?.name ??
    id;

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
            {error && (
              <div className="mx-3 mt-3 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-600">{error}</div>
            )}
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin w-5 h-5 text-slate-400" /></div>
            ) : assessments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10 px-4">No assessments yet. Create one to get started.</p>
            ) : assessments.map(a => (
              <button
                key={a.id}
                onClick={() => { selectAssessment(a); setRightTab("wizard"); setWizardStep(a.status === "draft" ? 0 : a.status === "in_progress" ? 1 : a.status === "risks_identified" ? 3 : a.status === "controls_applied" ? 5 : a.status === "complete" ? 6 : 3); }}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedAssessment?.id === a.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
              >
                <p className="font-medium text-sm text-slate-800 truncate">{a.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLOR[a.status]}`}>
                    {STATUS_LABELS[a.status]}
                  </Badge>
                  <span className="text-xs text-slate-400">{a.asset_ids.length + (a.ad_hoc_applications?.length ?? 0)} app{(a.asset_ids.length + (a.ad_hoc_applications?.length ?? 0)) !== 1 ? "s" : ""}</span>
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
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Assessment title <span className="text-red-500">*</span></label>
                  <Input placeholder="e.g. FY2025 Cloud App Risk Review" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Description</label>
                  <Textarea placeholder="High-level description of the assessment scope" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
                </div>
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
                {/* Ad hoc applications */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">Ad hoc applications</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdHocForm(v => !v)}>
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  {adHocApps.map((app, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200 mb-1 text-xs">
                      <span className="font-medium text-slate-700">{app.name}</span>
                      <button className="text-slate-400 hover:text-red-500 text-xs ml-2" onClick={() => setAdHocApps(p => p.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  {showAdHocForm && (
                    <div className="border rounded p-3 space-y-2 bg-slate-50 mt-1">
                      <Input placeholder="Application name *" className="h-7 text-xs"
                        value={adHocDraft.name ?? ""} onChange={e => setAdHocDraft(p => ({ ...p, name: e.target.value }))} />
                      <Textarea placeholder="Description" rows={1} className="text-xs"
                        value={adHocDraft.description ?? ""} onChange={e => setAdHocDraft(p => ({ ...p, description: e.target.value }))} />
                      <Input placeholder="Assessment context (what this assessment is about)" className="h-7 text-xs"
                        value={adHocDraft.assessment_context ?? ""} onChange={e => setAdHocDraft(p => ({ ...p, assessment_context: e.target.value }))} />
                      <CiaRatingWidget
                        confidentiality={adHocDraft.confidentiality ?? 3}
                        confidentiality_min={adHocDraft.confidentiality ?? 3}
                        integrity={adHocDraft.integrity ?? 3}
                        integrity_min={adHocDraft.integrity ?? 3}
                        availability={adHocDraft.availability ?? 3}
                        availability_min={adHocDraft.availability ?? 3}
                        onChange={(field, _min, max) => setAdHocDraft(p => ({ ...p, [field]: max }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={handleAddAdHoc} disabled={!adHocDraft.name?.trim()}>Add</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAdHocForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <Button onClick={handleCreate} disabled={!form.title.trim() || (form.selectedAssetIds.length === 0 && adHocApps.length === 0)}>Create</Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  {!form.title.trim() && <span className="text-xs text-red-500">Title required</span>}
                  {form.title.trim() && form.selectedAssetIds.length === 0 && adHocApps.length === 0 && (
                    <span className="text-xs text-red-500">Select or add at least one application</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dashboard */}
          {!selectedAssessment && !showCreate && (
            <div>
              <HowItWorks
                steps={[
                  { number: 1, title: "Define Assessment Scope", desc: "Create an assessment, name it, and select the applications or assets in scope. Ad-hoc entries can be added where an asset isn't in the register.", color: "#7213EA" },
                  { number: 2, title: "Capture Risks & Scoring", desc: "Walk through the guided wizard to record inherent and residual risks, link controls, and apply structured scoring across impact and likelihood dimensions.", color: "#1E49E2" },
                  { number: 3, title: "Finalise & Report", desc: "Review scored results, tag drafts vs. active assessments, and export the risk assessment output for reporting and downstream workflows.", color: "#098E7E" },
                ]}
              />
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
                  {/* Sticky submit bar */}
                  <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border border-slate-200 rounded-lg px-4 py-2 flex items-center justify-between shadow-sm">
                    <span className="text-xs text-slate-500">
                      {selectedAssessment.asset_ids.indexOf(selectedAssessment.asset_ids[qaAssetIdx]) + 1} of {selectedAssessment.asset_ids.length} application(s)
                      · {answeredCount(selectedAssessment.asset_ids[qaAssetIdx])} answered
                    </span>
                    <Button size="sm" onClick={handleSubmitQa} disabled={submittingQa}>
                      {submittingQa && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {qaAssetIdx < selectedAssessment.asset_ids.length - 1 ? "Save & Next →" : "Submit All Responses →"}
                    </Button>
                  </div>
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

                </div>
              )}

              {/* Step 2: Analyse — auto-triggered */}
              {wizardStep === 2 && (
                <Card>
                  <CardContent className="pt-6 flex flex-col items-center gap-4 py-12">
                    <Sparkles className="w-10 h-10 text-violet-400 animate-pulse" />
                    <p className="font-semibold text-slate-700">Running Risk Analysis…</p>
                    <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                    <p className="text-sm text-slate-500 text-center max-w-sm">
                      Applying rule-based scoring and LLM analysis to identify specific risks per application.
                      This may take a minute.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Risks */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Identified Risks ({selectedAssessment.risks.length})</h3>
                    <Button size="sm" onClick={() => setWizardStep(4)}>
                      Apply Controls <ChevronRight className="w-4 h-4 ml-1" />
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

              {/* Step 4: Controls */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Apply Controls to Risks</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={async () => {
                        try { await suggestControls(selectedAssessment.id); toast({ title: "Suggestions refreshed" }); }
                        catch { toast({ title: "Failed to refresh suggestions", variant: "destructive" }); }
                      }}>
                        <Sparkles className="w-4 h-4 mr-1" />Refresh Suggestions
                      </Button>
                      <Button size="sm" onClick={() => setWizardStep(5)}>
                        Calculate Residual <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                  {selectedAssessment.risks.length === 0 && (
                    <p className="text-slate-400 text-sm">No risks found. Go back and re-run analysis.</p>
                  )}
                  {selectedAssessment.risks.map(risk => {
                    const suggestions = (selectedAssessment.suggested_controls ?? []).filter(s => s.risk_id === risk.id);
                    const applied = selectedAssessment.applied_controls.filter(c => c.risk_id === risk.id);
                    return (
                      <Card key={risk.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1">
                              <p className="font-medium text-sm text-slate-800">{risk.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{risk.description}</p>
                            </div>
                            <Badge variant="outline" className={BAND_COLOR[risk.inherent_risk_band]}>
                              {risk.inherent_risk_band}
                            </Badge>
                          </div>
                          {applied.length > 0 && (
                            <div className="mb-3 space-y-1">
                              <p className="text-xs font-semibold text-emerald-700">Applied ({applied.length})</p>
                              {applied.map(c => (
                                <div key={c.id} className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                                  <CheckCircle2 className="w-3 h-3 flex-shrink-0" />{c.control_id}
                                </div>
                              ))}
                            </div>
                          )}
                          {suggestions.length === 0 && applied.length === 0 && (
                            <p className="text-xs text-slate-400 italic">Loading suggestions…</p>
                          )}
                          {suggestions.map((s, i) => {
                            const alreadyApplied = applied.some(c => c.control_id === s.control_id);
                            return (
                              <div key={i} className="flex items-start justify-between gap-2 py-2 border-t">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-slate-700">{s.control_title}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{s.rationale}</p>
                                  <Badge variant="outline" className="text-xs mt-1">Relevance {s.relevance_score}/5</Badge>
                                </div>
                                {alreadyApplied ? (
                                  <span className="text-xs text-emerald-600 flex items-center gap-1 pt-1 flex-shrink-0">
                                    <CheckCircle2 className="w-3 h-3" />Applied
                                  </span>
                                ) : (
                                  <Button size="sm" className="h-7 text-xs mt-1 flex-shrink-0" onClick={async () => {
                                    try {
                                      await applyControl(selectedAssessment.id, risk.id, s.control_id, "suggested", s.rationale);
                                      await refreshAssessment(selectedAssessment.id);
                                      toast({ title: "Control applied" });
                                    } catch {
                                      toast({ title: "Failed to apply control", variant: "destructive" });
                                    }
                                  }}>Apply</Button>
                                )}
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Step 5: Residual Risk — auto-triggered */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800">Residual Risk</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => fetchResidual(selectedAssessment.id)}>
                        <FileBarChart className="w-4 h-4 mr-1" />Refresh
                      </Button>
                      <Button size="sm" onClick={() => setWizardStep(6)}>
                        Generate Report <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                  {residualResults.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-3">
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                      <p className="text-sm text-slate-500">Calculating residual risk…</p>
                    </div>
                  ) : residualResults.map(r => (
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
                          <span>Controls applied: {r.controls_applied}</span>
                          <span>Avg effectiveness: {(r.avg_effectiveness * 100).toFixed(0)}%</span>
                          <span>Residual score: {r.residual_risk_score}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Step 6: Final Report */}
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
                        <div className="prose prose-sm max-w-none text-slate-700 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_table]:text-xs [&_th]:bg-slate-50 [&_td]:border [&_th]:border [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                        </div>
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

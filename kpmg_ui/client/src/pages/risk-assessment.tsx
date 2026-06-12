import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  FileUp,
  Layers3,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import HowItWorks from "@/components/HowItWorks";
import {
  TraceLockedState,
  TraceMetricCard,
  TracePanel,
  TraceSectionHeading,
  TraceStatusRibbon,
} from "@/components/TraceAnalysisPrimitives";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import CiaRatingWidget from "@/components/CiaRatingWidget";
import { useToast } from "@/hooks/use-toast";
import { useAssetRegistry } from "@/contexts/AssetRegistryContext";
import {
  type AdHocApplication,
  type AnswerType,
  type ContextProfile,
  type ResidualResult,
  type Risk,
  type RiskAssessment,
  type Section,
  type SuggestedControl,
  type SuggestedQuestion,
  useRiskAssessment,
} from "@/contexts/RiskAssessmentContext";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  risks_identified: "Risks Identified",
  controls_applied: "Controls Applied",
  complete: "Complete",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "border-[#DCE3EE] bg-[#F3F6FA] text-[#6A748A]",
  in_progress: "border-[#C9D7FF] bg-[#EEF2FF] text-[#1E49E2]",
  risks_identified: "border-[#F6D3A0] bg-[#FFF4E8] text-[#AB5C00]",
  controls_applied: "border-[#D7C0FA] bg-[#F3F0FF] text-[#7213EA]",
  complete: "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]",
};

const BAND_CLASS: Record<string, string> = {
  Critical: "border-[#F3C6CF] bg-[#FEEBED] text-[#E5001B]",
  High: "border-[#F6D3A0] bg-[#FFF4E8] text-[#AB5C00]",
  Medium: "border-[#F8E8B7] bg-[#FFF9E8] text-[#8A6A00]",
  Low: "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]",
};

const PRIORITY_CLASS: Record<string, string> = {
  high: "border-[#F3C6CF] bg-[#FEEBED] text-[#E5001B]",
  medium: "border-[#F6D3A0] bg-[#FFF4E8] text-[#AB5C00]",
  low: "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]",
};

const ANSWER_CLASS: Record<AnswerType, string> = {
  yes: "border-[#F3C6CF] bg-[#FEEBED] text-[#E5001B]",
  no: "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]",
  na: "border-[#DCE3EE] bg-[#F3F6FA] text-[#6A748A]",
};

const WIZARD_STEPS = ["Create", "Context", "Questionnaire", "Analyse", "Risks", "Controls", "Residual", "Report"];

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#1E49E2] px-5 py-3 text-[14px] font-bold text-white transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:bg-[#8EA4D9]";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#DCE3EE] bg-white px-5 py-3 text-[14px] font-bold text-[#0C233C] transition-colors hover:bg-[#F7F9FC] disabled:cursor-not-allowed disabled:text-[#9AA8BC]";
const SOFT_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#EEF2FF] px-4 py-2.5 text-[13px] font-bold text-[#1E49E2] transition-colors hover:bg-[#E3EBFF] disabled:cursor-not-allowed disabled:text-[#93A6D8]";

const EMPTY_CONTEXT_PROFILE: ContextProfile = {
  project_context: "",
  business_impact: "",
  overall_project_summary: "",
  regulatory_context: "",
  security_requirements: "",
  jira_context: "",
  free_text_context: "",
};

interface LocalAnswer {
  answer: AnswerType;
  details: string;
}

function statusToStep(status: RiskAssessment["status"]) {
  switch (status) {
    case "draft":
      return 0;
    case "in_progress":
      return 2;
    case "risks_identified":
      return 4;
    case "controls_applied":
      return 6;
    case "complete":
      return 7;
    default:
      return 0;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "Recently updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function assessmentAppCount(assessment: RiskAssessment) {
  return assessment.asset_ids.length + (assessment.ad_hoc_applications?.length ?? 0);
}

function statusToneTitle(assessment: RiskAssessment | null) {
  if (!assessment) return "Ready To Begin";
  return STATUS_LABELS[assessment.status] ?? "Assessment Selected";
}

function sectionProgress(
  answers: Record<string, Record<string, Record<string, LocalAnswer>>>,
  assetId: string,
  section: Section,
) {
  return Object.values(answers[assetId]?.[section.id] ?? {}).length;
}

function getAssessmentRiskSummary(assessment: RiskAssessment | null) {
  if (!assessment) return "Select or create a risk assessment to begin the workflow.";
  if (assessment.status === "draft") return "Assessment scope is set. Add context and start the questionnaire when ready.";
  if (assessment.status === "in_progress") return "Questionnaire responses are being captured across the applications in scope.";
  if (assessment.status === "risks_identified") return "Inherent risks are available and ready for control application.";
  if (assessment.status === "controls_applied") return "Controls have been applied and the residual view is available for review.";
  if (assessment.status === "complete") return "The assessment is complete and ready for report review or rerun.";
  return "Assessment selected.";
}

function StepPill({ label, index, currentStep }: { label: string; index: number; currentStep: number }) {
  const complete = index < currentStep;
  const active = index === currentStep;
  const className = complete
    ? "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]"
    : active
      ? "border-[#1E49E2] bg-[#1E49E2] text-white"
      : "border-[#DCE3EE] bg-white text-[#7E91AE]";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-bold ${className}`}
      data-risk-assessment-step={label.toLowerCase()}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/20 bg-current/10 text-[11px]">
        {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
      </span>
      {label}
    </div>
  );
}

function StatusBadge({ status }: { status: RiskAssessment["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${STATUS_CLASS[status] ?? STATUS_CLASS.draft}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function BandBadge({ band }: { band: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold ${BAND_CLASS[band] ?? BAND_CLASS.Medium}`}
    >
      {band}
    </span>
  );
}

function SurfaceSection({
  eyebrow,
  title,
  action,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-[#DCE3EE] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(12,35,60,0.26)] ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[#00338D]">{eyebrow}</p>
          ) : null}
          <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#0C233C]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RiskSummaryCard({ risk }: { risk: Risk }) {
  return (
    <div className="rounded-[20px] border border-[#DCE3EE] bg-white p-5 shadow-[0_16px_34px_-30px_rgba(12,35,60,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold tracking-[-0.02em] text-[#0C233C]">{risk.title}</h3>
          <p className="mt-2 text-[13px] leading-6 text-[#5A6478]">{risk.description}</p>
        </div>
        <BandBadge band={risk.inherent_risk_band} />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-[#7388A8]">
        <span>Likelihood {risk.likelihood_score}/5</span>
        <span>Impact {risk.impact_score}/5</span>
        <span>Score {risk.inherent_risk_score}</span>
        <span>{risk.risk_category}</span>
      </div>
    </div>
  );
}

function AppliedControlChip({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#BFE7D1] bg-[#EDFBF5] px-3 py-1.5 text-[11px] font-bold text-[#009A44]">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function SuggestedControlRow({
  suggestion,
  alreadyApplied,
  onApply,
}: {
  suggestion: SuggestedControl;
  alreadyApplied: boolean;
  onApply: () => Promise<void>;
}) {
  return (
    <div className="rounded-[16px] border border-[#E2E6EF] bg-[#FBFCFE] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#0C233C]">{suggestion.control_title}</p>
          <p className="mt-1.5 text-[12px] leading-6 text-[#7388A8]">{suggestion.rationale}</p>
          <div className="mt-3 inline-flex rounded-full border border-[#DCE3EE] bg-white px-3 py-1 text-[11px] font-bold text-[#6A748A]">
            Relevance {suggestion.relevance_score}/5
          </div>
        </div>
        {alreadyApplied ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#BFE7D1] bg-[#EDFBF5] px-3 py-1 text-[11px] font-bold text-[#009A44]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Applied
          </span>
        ) : (
          <button className={SOFT_BUTTON} onClick={() => void onApply()}>
            Apply
          </button>
        )}
      </div>
    </div>
  );
}

function ResidualCard({ result }: { result: ResidualResult }) {
  const inherentWidth = Math.min(100, result.inherent_risk_score * 4);
  const residualWidth = Math.min(100, result.residual_risk_score * 4);
  const residualBarClass =
    result.residual_risk_band === "Low"
      ? "bg-[linear-gradient(90deg,#009A44_0%,#098E7E_100%)]"
      : result.residual_risk_band === "Medium"
        ? "bg-[linear-gradient(90deg,#EAAA00_0%,#F2B100_100%)]"
        : "bg-[linear-gradient(90deg,#EAAA00_0%,#E5001B_100%)]";

  return (
    <div className="rounded-[20px] border border-[#DCE3EE] bg-white p-5 shadow-[0_16px_34px_-30px_rgba(12,35,60,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold tracking-[-0.02em] text-[#0C233C]">{result.risk_title}</h3>
          <p className="mt-1 text-[12px] text-[#7388A8]">{result.controls_applied} controls applied</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BandBadge band={result.inherent_risk_band} />
          <BandBadge band={result.residual_risk_band} />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8492A6]">Inherent</div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#DCE3EE]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#E5001B_0%,#F05A6C_100%)]" style={{ width: `${inherentWidth}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#8492A6]">Residual</div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#DCE3EE]">
            <div className={`h-full rounded-full ${residualBarClass}`} style={{ width: `${residualWidth}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-[#7388A8]">
        <span>Avg effectiveness {(result.avg_effectiveness * 100).toFixed(0)}%</span>
        <span>Residual score {result.residual_risk_score}</span>
      </div>
    </div>
  );
}

function CommandDeckMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/12 bg-white/8 px-4 py-4 backdrop-blur-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/58">{label}</div>
      <div className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-1 text-[12px] leading-6 text-white/64">{detail}</div>
    </div>
  );
}

export default function RiskAssessmentPage() {
  const {
    assessments,
    selectedAssessment,
    sections,
    residualResults,
    isLoading,
    isAnalyzing,
    isGeneratingReport,
    isSuggestingQuestions,
    error,
    report,
    fetchAssessments,
    selectAssessment,
    createAssessment,
    fetchSections,
    submitResponseBatch,
    analyzeAssessment,
    applyControl,
    fetchResidual,
    suggestControls,
    generateReport,
    updateContextProfile,
    uploadContextFile,
    suggestContextQuestions,
    answerContextQuestion,
  } = useRiskAssessment();
  const { assets, fetchAssets } = useAssetRegistry();
  const { toast } = useToast();

  const [wizardStep, setWizardStep] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; selectedAssetIds: string[] }>({
    title: "",
    description: "",
    selectedAssetIds: [],
  });
  const [adHocApps, setAdHocApps] = useState<AdHocApplication[]>([]);
  const [showAdHocForm, setShowAdHocForm] = useState(false);
  const [adHocDraft, setAdHocDraft] = useState<AdHocApplication>({
    name: "",
    description: "",
    assessment_context: "",
    confidentiality: 3,
    integrity: 3,
    availability: 3,
  });
  const [qaAssetIdx, setQaAssetIdx] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, Record<string, LocalAnswer>>>>({});
  const [submittingQa, setSubmittingQa] = useState(false);

  const [contextProfile, setContextProfile] = useState<ContextProfile>(EMPTY_CONTEXT_PROFILE);
  const [savingContext, setSavingContext] = useState(false);
  const [contextFileUploading, setContextFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAssessments();
    fetchAssets();
    fetchSections();
  }, [fetchAssessments, fetchAssets, fetchSections]);

  useEffect(() => {
    if (!selectedAssessment) return;
    const cp = selectedAssessment.context_profile;
    if (!cp) return;
    setContextProfile({
      project_context: cp.project_context || "",
      business_impact: cp.business_impact || "",
      overall_project_summary: cp.overall_project_summary || "",
      regulatory_context: cp.regulatory_context || "",
      security_requirements: cp.security_requirements || "",
      jira_context: cp.jira_context || "",
      free_text_context: cp.free_text_context || "",
    });
  }, [selectedAssessment?.id]);

  useEffect(() => {
    if (wizardStep !== 3 || !selectedAssessment || isAnalyzing) return;
    if (selectedAssessment.risks.length > 0) {
      setWizardStep(4);
      return;
    }
    analyzeAssessment(selectedAssessment.id).then(() => setWizardStep(4)).catch(() => {});
  }, [analyzeAssessment, isAnalyzing, selectedAssessment, wizardStep]);

  useEffect(() => {
    if (wizardStep !== 5 || !selectedAssessment) return;
    if ((selectedAssessment.suggested_controls ?? []).length === 0) {
      suggestControls(selectedAssessment.id).catch(() => {});
    }
  }, [selectedAssessment, suggestControls, wizardStep]);

  useEffect(() => {
    if (wizardStep !== 6 || !selectedAssessment) return;
    fetchResidual(selectedAssessment.id).catch(() => {});
  }, [fetchResidual, selectedAssessment, wizardStep]);

  const activeAssessments = assessments.filter((assessment) => assessment.status !== "complete").length;
  const allRisks = assessments.flatMap((assessment) => assessment.risks);
  const highCriticalRisks = allRisks.filter(
    (risk) => risk.inherent_risk_band === "Critical" || risk.inherent_risk_band === "High",
  ).length;
  const drafts = assessments.filter((assessment) => assessment.status === "draft").length;
  const selectedHighRisks = selectedAssessment
    ? selectedAssessment.risks.filter(
        (risk) => risk.inherent_risk_band === "Critical" || risk.inherent_risk_band === "High",
      ).length
    : 0;

  const currentAssetId = selectedAssessment?.asset_ids[qaAssetIdx] ?? "";
  const currentReport = report ?? selectedAssessment?.report_markdown ?? null;

  const assetName = (id: string) =>
    assets.find((asset) => asset.id === id)?.name ??
    selectedAssessment?.ad_hoc_applications?.find((app) => app.id === id)?.name ??
    id;

  function resetCreateState() {
    setForm({ title: "", description: "", selectedAssetIds: [] });
    setAdHocApps([]);
    setAdHocDraft({
      name: "",
      description: "",
      assessment_context: "",
      confidentiality: 3,
      integrity: 3,
      availability: 3,
    });
    setShowAdHocForm(false);
  }

  function setAnswer(assetId: string, sectionId: string, questionId: string, answer: AnswerType) {
    setAnswers((prev) => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {}),
        [sectionId]: {
          ...(prev[assetId]?.[sectionId] ?? {}),
          [questionId]: {
            answer,
            details: prev[assetId]?.[sectionId]?.[questionId]?.details ?? "",
          },
        },
      },
    }));
  }

  function setDetails(assetId: string, sectionId: string, questionId: string, details: string) {
    setAnswers((prev) => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? {}),
        [sectionId]: {
          ...(prev[assetId]?.[sectionId] ?? {}),
          [questionId]: {
            answer: prev[assetId]?.[sectionId]?.[questionId]?.answer ?? "na",
            details,
          },
        },
      },
    }));
  }

  function answeredCount(assetId: string) {
    const assetAnswers = answers[assetId] ?? {};
    return Object.values(assetAnswers).flatMap((sectionAnswer) => Object.values(sectionAnswer)).length;
  }

  async function handleCreate() {
    if (!form.title.trim() || (form.selectedAssetIds.length === 0 && adHocApps.length === 0)) {
      toast({ title: "Title and at least one application required", variant: "destructive" });
      return;
    }

    try {
      const assessment = await createAssessment({
        title: form.title,
        description: form.description,
        asset_ids: form.selectedAssetIds,
        ad_hoc_applications: adHocApps,
      });
      selectAssessment(assessment);
      setShowCreate(false);
      setWizardStep(0);
      setQaAssetIdx(0);
      setExpandedSection(sections[0]?.id ?? null);
      resetCreateState();
      toast({ title: "Assessment created" });
    } catch {
      toast({ title: "Failed to create assessment", variant: "destructive" });
    }
  }

  function handleAddAdHoc() {
    if (!adHocDraft.name?.trim()) return;
    setAdHocApps((prev) => [...prev, { ...adHocDraft }]);
    setAdHocDraft({
      name: "",
      description: "",
      assessment_context: "",
      confidentiality: 3,
      integrity: 3,
      availability: 3,
    });
    setShowAdHocForm(false);
  }

  async function handleSaveContextAndSuggest() {
    if (!selectedAssessment) return;
    setSavingContext(true);
    try {
      await updateContextProfile(selectedAssessment.id, contextProfile);
      await suggestContextQuestions(selectedAssessment.id);
      setWizardStep(2); // Proceed to Questionnaire (questions are now inline there)
      setExpandedSection(sections[0]?.id ?? null);
      toast({ title: "Context saved. AI questions generated and added to questionnaire." });
    } catch {
      toast({ title: "Failed to save context or generate questions", variant: "destructive" });
    } finally {
      setSavingContext(false);
    }
  }

  async function handleContextFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedAssessment || !event.target.files?.[0]) return;
    setContextFileUploading(true);
    try {
      const updated = await uploadContextFile(selectedAssessment.id, event.target.files[0]);
      // Sync AI-extracted context fields into the form
      if (updated?.context_profile) {
        const cp = updated.context_profile;
        setContextProfile((prev) => ({
          project_context: cp.project_context || prev.project_context,
          business_impact: cp.business_impact || prev.business_impact,
          overall_project_summary: cp.overall_project_summary || prev.overall_project_summary,
          regulatory_context: cp.regulatory_context || prev.regulatory_context,
          security_requirements: cp.security_requirements || prev.security_requirements,
          jira_context: cp.jira_context || prev.jira_context,
          free_text_context: cp.free_text_context || prev.free_text_context,
        }));
      }
      toast({ title: "Document uploaded — context fields auto-filled from document" });
    } catch {
      toast({ title: "File upload failed", variant: "destructive" });
    } finally {
      setContextFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmitQa() {
    if (!selectedAssessment || !currentAssetId) return;
    setSubmittingQa(true);

    try {
      const responses = sections.flatMap((section) =>
        section.questions.map((question) => {
          const local = answers[currentAssetId]?.[section.id]?.[question.id];
          return {
            asset_id: currentAssetId,
            section_id: section.id,
            question_id: question.id,
            answer: (local?.answer ?? "na") as AnswerType,
            details: local?.details ?? "",
          };
        }),
      );

      await submitResponseBatch(selectedAssessment.id, responses);

      if (qaAssetIdx < selectedAssessment.asset_ids.length - 1) {
        setQaAssetIdx((prev) => prev + 1);
        setExpandedSection(sections[0]?.id ?? null);
        toast({ title: "Responses saved for this application" });
      } else {
        setWizardStep(3);
        toast({ title: "All responses submitted. Starting analysis." });
      }
    } catch {
      toast({ title: "Failed to save responses", variant: "destructive" });
    } finally {
      setSubmittingQa(false);
    }
  }

  async function refreshAssessment(assessmentId: string) {
    try {
      const response = await fetch(`/api/risk-assessment/${assessmentId}`);
      if (!response.ok) return;
      const updated = await response.json();
      selectAssessment(updated);
    } catch {
      // Non-critical UI refresh path.
    }
  }

  async function handleGenerateReport() {
    if (!selectedAssessment) return;
    try {
      await generateReport(selectedAssessment.id);
      toast({ title: "Report generated" });
    } catch {
      toast({ title: "Report failed", variant: "destructive" });
    }
  }

  async function handleApplySuggestion(riskId: string, suggestion: SuggestedControl) {
    if (!selectedAssessment) return;
    try {
      await applyControl(selectedAssessment.id, riskId, suggestion.control_id, "suggested", suggestion.rationale);
      await refreshAssessment(selectedAssessment.id);
      toast({ title: "Control applied" });
    } catch {
      toast({ title: "Failed to apply control", variant: "destructive" });
    }
  }

  function openCreate() {
    setShowCreate(true);
    selectAssessment(null);
    setWizardStep(0);
  }

  function closeCreate() {
    setShowCreate(false);
    resetCreateState();
  }

  function selectExistingAssessment(assessment: RiskAssessment) {
    setShowCreate(false);
    selectAssessment(assessment);
    setWizardStep(statusToStep(assessment.status));
    setQaAssetIdx(0);
    setExpandedSection(sections[0]?.id ?? null);
  }

  const suggestedQuestions: SuggestedQuestion[] = (selectedAssessment?.suggested_questions ?? []) as SuggestedQuestion[];
  const answeredContextQuestions = suggestedQuestions.filter((q) => q.status === "answered").length;

  return (
    <div className="h-full overflow-auto bg-[#F0F2F7]" data-risk-assessment-page="true">
      <HeroSection
        title="Risk Assessment"
        subtitle="Application risk assessments, structured questionnaires, inherent scoring, residual analysis, and reporting."
        icon={ShieldAlert}
      />

      <main className="mx-auto max-w-[1460px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside
            className="rounded-[28px] border border-[#11345A] bg-[linear-gradient(180deg,#0C233C_0%,#14355F_100%)] p-5 text-white shadow-[0_24px_54px_-32px_rgba(12,35,60,0.46)]"
            data-risk-assessment-rail="true"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.28em] text-white/46">Sessions</p>
                <h2 className="text-[20px] font-bold tracking-[-0.03em] text-white">Assessments</h2>
              </div>
              <button className={PRIMARY_BUTTON} onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>

            {error ? (
              <div className="mb-4 rounded-[16px] border border-[#F3C6CF] bg-[#FEEBED] px-4 py-3 text-[12px] font-medium text-[#E5001B]">
                {error}
              </div>
            ) : null}

            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-[16px] border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/46">Active</div>
                <div className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-white">{activeAssessments}</div>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/46">High</div>
                <div className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-white">{highCriticalRisks}</div>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/46">Drafts</div>
                <div className="mt-2 text-[26px] font-bold tracking-[-0.03em] text-white">{drafts}</div>
              </div>
            </div>

            <ScrollArea className="h-[560px] pr-3">
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-[#7E91AE]" />
                  </div>
                ) : assessments.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-white/18 bg-white/6 px-4 py-8 text-center text-[13px] leading-6 text-white/60">
                    No assessments yet. Create a new session to start the workflow.
                  </div>
                ) : (
                  assessments.map((assessment) => {
                    const selected = selectedAssessment?.id === assessment.id && !showCreate;
                    return (
                      <button
                        key={assessment.id}
                        className={`w-full rounded-[20px] border px-4 py-4 text-left transition-all ${
                          selected
                            ? "border-[#7FB0FF] bg-[linear-gradient(135deg,rgba(30,73,226,0.34)_0%,rgba(0,184,245,0.18)_100%)] shadow-[0_16px_34px_-24px_rgba(0,184,245,0.45)]"
                            : "border-white/10 bg-white/6 hover:border-white/18 hover:bg-white/10"
                        }`}
                        onClick={() => selectExistingAssessment(assessment)}
                        data-risk-assessment-session={assessment.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-bold tracking-[-0.02em] text-white">
                              {assessment.title}
                            </p>
                            <p className="mt-1 text-[12px] text-white/62">
                              {assessmentAppCount(assessment)} application{assessmentAppCount(assessment) === 1 ? "" : "s"}
                            </p>
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/36" />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <StatusBadge status={assessment.status} />
                          <span className="text-[11px] text-white/46">{formatDate(assessment.updated_at)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </aside>

          <div className="min-w-0 space-y-6">
            {!selectedAssessment && !showCreate ? (
              <>
                <TraceStatusRibbon
                  title="Assessment Dashboard"
                  detail="Create sessions, capture questionnaire responses, score inherent risks, apply controls, and review residual posture without leaving the feature."
                  icon={ShieldCheck}
                  action={
                    <button className={PRIMARY_BUTTON} onClick={openCreate}>
                      <Plus className="h-4 w-4" />
                      New Assessment
                    </button>
                  }
                />

                <HowItWorks
                  steps={[
                    {
                      number: 1,
                      title: "Define Scope & Context",
                      desc: "Name the session, select applications, add context fields and upload relevant documents so the LLM can suggest targeted questions.",
                      color: "#7213EA",
                    },
                    {
                      number: 2,
                      title: "Answer All Questions",
                      desc: "Respond to both the static questionnaire and the LLM-suggested context-driven questions with evidence.",
                      color: "#1E49E2",
                    },
                    {
                      number: 3,
                      title: "Review And Report",
                      desc: "Validate the resulting risks, apply controls, compare residual posture, and generate the final report.",
                      color: "#098E7E",
                    },
                  ]}
                />

                <div className="grid gap-5 md:grid-cols-3" data-risk-assessment-dashboard="true">
                  <TraceMetricCard
                    label="Active Assessments"
                    value={activeAssessments}
                    sub="Sessions currently progressing"
                    accentColor="#1E49E2"
                    badge={`${assessments.length} total sessions`}
                    badgeClassName="bg-[#EEF2FF] text-[#1E49E2]"
                  />
                  <TraceMetricCard
                    label="High / Critical Risks"
                    value={highCriticalRisks}
                    sub="Across all fetched assessments"
                    accentColor="#EAAA00"
                    badge={`${allRisks.length} total recorded risks`}
                    badgeClassName="bg-[#FFF9E8] text-[#8A6A00]"
                  />
                  <TraceMetricCard
                    label="Draft Assessments"
                    value={drafts}
                    sub="Waiting to begin questionnaire capture"
                    accentColor="#009A44"
                    badge={`${assets.length} asset registry applications available`}
                    badgeClassName="bg-[#EDFBF5] text-[#009A44]"
                  />
                </div>

                {assessments.length > 0 ? (
                  <TracePanel
                    title="Recent Assessments"
                    subtitle="Open a session from the rail or jump back into the most recently updated assessments below."
                  >
                    <div className="overflow-hidden rounded-[18px] border border-[#E2E6EF]">
                      <table className="w-full border-collapse">
                        <thead className="bg-[#F7F9FC]">
                          <tr>
                            {["Assessment", "Scope", "Status", "Updated"].map((label) => (
                              <th
                                key={label}
                                className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-[#7E91AE]"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {assessments.slice(0, 5).map((assessment) => (
                            <tr key={assessment.id} className="border-t border-[#E2E6EF]">
                              <td className="px-4 py-3 text-[13px] font-bold text-[#0C233C]">{assessment.title}</td>
                              <td className="px-4 py-3 text-[13px] text-[#5A6478]">
                                {assessmentAppCount(assessment)} application{assessmentAppCount(assessment) === 1 ? "" : "s"}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={assessment.status} />
                              </td>
                              <td className="px-4 py-3 text-[13px] text-[#5A6478]">{formatDate(assessment.updated_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TracePanel>
                ) : (
                  <TraceLockedState
                    title="No Risk Assessments Yet"
                    description="Start the first session to define scope, run the questionnaire, and generate the assessment output inside this feature."
                    action={
                      <button className={PRIMARY_BUTTON} onClick={openCreate}>
                        <Plus className="h-4 w-4" />
                        Create The First Assessment
                      </button>
                    }
                  />
                )}
              </>
            ) : null}

            {showCreate ? (
              <SurfaceSection
                eyebrow="Setup"
                title="Create New Assessment"
                action={
                  <div className="flex flex-wrap gap-2" data-risk-assessment-create="true">
                    <button className={SECONDARY_BUTTON} onClick={closeCreate}>
                      Cancel
                    </button>
                    <button className={PRIMARY_BUTTON} onClick={() => void handleCreate()}>
                      <Play className="h-4 w-4" />
                      Create Assessment
                    </button>
                  </div>
                }
              >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="space-y-5">
                    <div className="overflow-hidden rounded-[22px] border border-[#123863] bg-[linear-gradient(135deg,#0C233C_0%,#163B67_58%,#1E49E2_100%)] p-6 text-white shadow-[0_20px_44px_-30px_rgba(12,35,60,0.48)]">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] text-white/46">Assessment Setup</p>
                      <h3 className="text-[24px] font-bold tracking-[-0.04em] text-white">Define Scope Before We Ask Anything</h3>
                      <p className="mt-3 max-w-[560px] text-[14px] leading-7 text-white/66">
                        Name the session, choose the core applications in scope, and add any ad hoc systems that need to be assessed without touching the wider registry.
                      </p>
                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <CommandDeckMetric
                          label="Registry Assets"
                          value={form.selectedAssetIds.length}
                          detail="Selected from the live registry"
                        />
                        <CommandDeckMetric
                          label="Ad Hoc Systems"
                          value={adHocApps.length}
                          detail="Scoped only to this assessment"
                        />
                        <CommandDeckMetric
                          label="Questionnaire Path"
                          value={Math.max(form.selectedAssetIds.length, 0)}
                          detail="Registry-backed applications will enter the guided questionnaire"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-[#7E91AE]">
                        Assessment Title
                      </label>
                      <Input
                        value={form.title}
                        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="FY2026 Cloud Payments Review"
                        className="h-12 rounded-[16px] border-[#DCE3EE]"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-[#7E91AE]">
                        Description
                      </label>
                      <Textarea
                        value={form.description}
                        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Describe the scope, timing, and assessment objective."
                        rows={4}
                        className="rounded-[16px] border-[#DCE3EE]"
                      />
                    </div>
                    <TracePanel
                      title="Applications In Scope"
                      subtitle="Select existing applications from the Asset Registry. These drive the questionnaire path."
                    >
                      <div className="space-y-3">
                        {assets.length === 0 ? (
                          <div className="rounded-[16px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-6 text-[13px] leading-6 text-[#7388A8]">
                            No applications are available in the Asset Registry yet.
                          </div>
                        ) : (
                          assets.map((asset) => {
                            const checked = form.selectedAssetIds.includes(asset.id);
                            return (
                              <label
                                key={asset.id}
                                className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-4 transition-colors ${
                                  checked ? "border-[#AFC1F8] bg-[#EEF2FF]" : "border-[#E2E6EF] bg-white hover:bg-[#F8FAFF]"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-[#B4C1D6]"
                                  checked={checked}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      selectedAssetIds: event.target.checked
                                        ? [...prev.selectedAssetIds, asset.id]
                                        : prev.selectedAssetIds.filter((value) => value !== asset.id),
                                    }))
                                  }
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[14px] font-bold text-[#0C233C]">{asset.name}</p>
                                      <p className="mt-1 text-[12px] leading-6 text-[#7388A8]">
                                        {asset.description || asset.use || "Application in the asset registry"}
                                      </p>
                                    </div>
                                    <BandBadge band={asset.criticality} />
                                  </div>
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </TracePanel>
                  </div>

                  <div className="space-y-5">
                    <TracePanel
                      title="Ad Hoc Applications"
                      subtitle="Add systems not yet in the registry. They remain part of scope without touching other features."
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="text-[13px] text-[#7388A8]">
                          {adHocApps.length} ad hoc application{adHocApps.length === 1 ? "" : "s"} added
                        </div>
                        <button className={SOFT_BUTTON} onClick={() => setShowAdHocForm((prev) => !prev)}>
                          <Plus className="h-4 w-4" />
                          Add Entry
                        </button>
                      </div>

                      {adHocApps.length > 0 ? (
                        <div className="mb-4 space-y-2">
                          {adHocApps.map((application, index) => (
                            <div
                              key={`${application.name}-${index}`}
                              className="flex items-center justify-between rounded-[16px] border border-[#E2E6EF] bg-[#FBFCFE] px-4 py-3"
                            >
                              <div>
                                <p className="text-[13px] font-bold text-[#0C233C]">{application.name}</p>
                                <p className="text-[12px] text-[#7388A8]">
                                  CIA {application.confidentiality}/{application.integrity}/{application.availability}
                                </p>
                              </div>
                              <button
                                className="text-[12px] font-bold text-[#8492A6] transition-colors hover:text-[#E5001B]"
                                onClick={() => setAdHocApps((prev) => prev.filter((_, appIndex) => appIndex !== index))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {showAdHocForm ? (
                        <div className="space-y-4 rounded-[18px] border border-[#E2E6EF] bg-[#F7F9FC] p-4">
                          <Input
                            value={adHocDraft.name ?? ""}
                            onChange={(event) => setAdHocDraft((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="Application name"
                            className="h-11 rounded-[14px] border-[#DCE3EE]"
                          />
                          <Textarea
                            value={adHocDraft.description ?? ""}
                            onChange={(event) => setAdHocDraft((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder="Application description"
                            rows={2}
                            className="rounded-[14px] border-[#DCE3EE]"
                          />
                          <Textarea
                            value={adHocDraft.assessment_context ?? ""}
                            onChange={(event) =>
                              setAdHocDraft((prev) => ({ ...prev, assessment_context: event.target.value }))
                            }
                            placeholder="Assessment context"
                            rows={2}
                            className="rounded-[14px] border-[#DCE3EE]"
                          />
                          <CiaRatingWidget
                            confidentiality={adHocDraft.confidentiality ?? 3}
                            confidentiality_min={adHocDraft.confidentiality ?? 3}
                            integrity={adHocDraft.integrity ?? 3}
                            integrity_min={adHocDraft.integrity ?? 3}
                            availability={adHocDraft.availability ?? 3}
                            availability_min={adHocDraft.availability ?? 3}
                            onChange={(field, _minValue, maxValue) =>
                              setAdHocDraft((prev) => ({ ...prev, [field]: maxValue }))
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <button className={PRIMARY_BUTTON} onClick={handleAddAdHoc} disabled={!adHocDraft.name?.trim()}>
                              Add Application
                            </button>
                            <button className={SECONDARY_BUTTON} onClick={() => setShowAdHocForm(false)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </TracePanel>
                  </div>
                </div>
              </SurfaceSection>
            ) : null}

            {selectedAssessment && !showCreate ? (
              <>
                <section className="overflow-hidden rounded-[28px] border border-[#123863] bg-[linear-gradient(135deg,#0C233C_0%,#163B67_58%,#1E49E2_100%)] shadow-[0_28px_60px_-36px_rgba(12,35,60,0.5)]">
                  <div className="border-b border-white/10 px-6 py-6 lg:px-8">
                    <div className="flex flex-wrap items-start justify-between gap-5">
                      <div className="min-w-0">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] text-white/46">Selected Assessment</p>
                        <h2 className="text-[32px] font-bold tracking-[-0.04em] text-white">{selectedAssessment.title}</h2>
                        <p className="mt-3 max-w-[760px] text-[14px] leading-7 text-white/66">
                          {getAssessmentRiskSummary(selectedAssessment)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={selectedAssessment.status} />
                        <div className="rounded-full border border-white/14 bg-white/10 px-4 py-2 text-[12px] font-bold text-white/84">
                          Updated {formatDate(selectedAssessment.updated_at)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 border-b border-white/10 px-6 py-5 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
                    <CommandDeckMetric
                      label="Applications In Scope"
                      value={assessmentAppCount(selectedAssessment)}
                      detail="Registry and ad hoc applications"
                    />
                    <CommandDeckMetric
                      label="Inherent Risks"
                      value={selectedAssessment.risks.length}
                      detail={`${selectedHighRisks} high or critical`}
                    />
                    <CommandDeckMetric
                      label="Controls Applied"
                      value={selectedAssessment.applied_controls.length}
                      detail="Mapped during the control response step"
                    />
                    <CommandDeckMetric
                      label="Context Questions"
                      value={`${answeredContextQuestions}/${suggestedQuestions.length}`}
                      detail="LLM-suggested questions answered"
                    />
                  </div>

                  <div className="px-6 py-5 lg:px-8" data-risk-assessment-stepper="true">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-white/46">Workflow Progress</div>
                    <div className="flex flex-wrap gap-2">
                      {WIZARD_STEPS.map((label, index) => (
                        <StepPill key={label} label={label} index={index} currentStep={wizardStep} />
                      ))}
                    </div>
                  </div>
                </section>

                {/* Step 0 — Assessment Summary */}
                {wizardStep === 0 ? (
                  <SurfaceSection
                    eyebrow="Scope"
                    title="Assessment Summary"
                    action={
                      <button
                        className={PRIMARY_BUTTON}
                        onClick={() => setWizardStep(1)}
                      >
                        Add Context
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    }
                  >
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <TracePanel
                        title="Applications In Scope"
                        subtitle="Asset Registry applications drive the questionnaire path for this assessment."
                      >
                        <div className="flex flex-wrap gap-2">
                          {selectedAssessment.asset_ids.length > 0 ? (
                            selectedAssessment.asset_ids.map((assetId) => (
                              <Badge key={assetId} variant="outline" className="rounded-full px-3 py-1.5 text-[12px]">
                                {assetName(assetId)}
                              </Badge>
                            ))
                          ) : (
                            <div className="text-[13px] text-[#7388A8]">No Asset Registry applications selected.</div>
                          )}
                        </div>
                        {selectedAssessment.ad_hoc_applications?.length ? (
                          <div className="mt-4 border-t border-[#E2E6EF] pt-4">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7E91AE]">
                              Ad Hoc Applications
                            </p>
                            <div className="space-y-2">
                              {selectedAssessment.ad_hoc_applications.map((application, index) => (
                                <div
                                  key={`${application.name}-${index}`}
                                  className="rounded-[16px] border border-[#E2E6EF] bg-[#FBFCFE] px-4 py-3"
                                >
                                  <p className="text-[13px] font-bold text-[#0C233C]">{application.name}</p>
                                  <p className="mt-1 text-[12px] text-[#7388A8]">
                                    {application.assessment_context || application.description || "Added as scope context"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </TracePanel>

                      <TracePanel title="Readiness" subtitle="Add context and generate questions before starting the questionnaire.">
                        <div className="space-y-3">
                          <div className="rounded-[18px] bg-[#F7F9FC] px-4 py-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8492A6]">Registry Applications</div>
                            <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0C233C]">
                              {selectedAssessment.asset_ids.length}
                            </div>
                          </div>
                          <div className="rounded-[18px] bg-[#F7F9FC] px-4 py-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8492A6]">Context Questions</div>
                            <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0C233C]">
                              {suggestedQuestions.length}
                            </div>
                          </div>
                        </div>
                      </TracePanel>
                    </div>
                  </SurfaceSection>
                ) : null}

                {/* Step 1 — Context */}
                {wizardStep === 1 ? (
                  <SurfaceSection
                    eyebrow="Context"
                    title="Assessment Context"
                    action={
                      <div className="flex flex-wrap gap-2">
                        <button className={SECONDARY_BUTTON} onClick={() => { setWizardStep(2); setExpandedSection(sections[0]?.id ?? null); }}>
                          Skip to Questionnaire
                        </button>
                        <button
                          className={PRIMARY_BUTTON}
                          onClick={() => void handleSaveContextAndSuggest()}
                          disabled={savingContext || isSuggestingQuestions}
                        >
                          {savingContext || isSuggestingQuestions ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {savingContext || isSuggestingQuestions ? "Analysing documents…" : "Save & Generate Questions"}
                        </button>
                      </div>
                    }
                  >
                    {/* Upload first — primary action */}
                    <div className="mb-6 rounded-[20px] border border-[#C9D7FF] bg-[#EEF2FF] p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <FileUp className="h-4 w-4 text-[#1E49E2]" />
                        <p className="text-[13px] font-bold text-[#1E49E2]">Upload Project Documents</p>
                        <span className="rounded-full border border-[#C9D7FF] bg-white px-2 py-0.5 text-[10px] font-bold text-[#1E49E2]">Optional</span>
                      </div>
                      <p className="mb-4 text-[12px] leading-5 text-[#5A6EA8]">
                        Upload architecture diagrams, project plans, Jira exports, or any reference document. The AI reads them and auto-fills the context fields below, then generates targeted evidence-request questions for the questionnaire.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={(e) => void handleContextFileUpload(e)}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          className={PRIMARY_BUTTON}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={contextFileUploading}
                        >
                          {contextFileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                          {contextFileUploading ? "Uploading & Extracting…" : "Upload Document"}
                        </button>
                        <p className="text-[11px] text-[#7E91AE]">PDF, DOCX, XLSX, CSV, TXT, PNG, JPG</p>
                      </div>
                      {(selectedAssessment.context_sources ?? []).length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedAssessment.context_sources.map((source) => (
                            <div
                              key={String((source as Record<string, unknown>).id ?? (source as Record<string, unknown>).filename)}
                              className="inline-flex items-center gap-2 rounded-full border border-[#BFE7D1] bg-white px-3 py-1.5 text-[11px] font-bold text-[#009A44]"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {String((source as Record<string, unknown>).filename ?? "Document")}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* Context fields — review / edit AI-extracted values */}
                    <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.18em] text-[#7E91AE]">
                      Review & Edit Context — AI fills these from your documents. You can add or correct anything.
                    </p>
                    <div className="space-y-5">
                      {([
                        ["project_context", "Project Context", "What is this project about? Tech stack, architecture, deployment environment, scope."],
                        ["business_impact", "Business Impact", "Impact of a breach, outage, or compliance failure — affected users, financial exposure, reputational risk."],
                        ["overall_project_summary", "Project Summary", "2–3 sentence executive summary for the risk assessment header."],
                        ["free_text_context", "Additional Context", "Optional — anything not captured above: architecture decisions, known gaps, third-party integrations, delivery constraints."],
                      ] as [keyof ContextProfile, string, string][]).map(([field, label, placeholder]) => (
                        <div key={field}>
                          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-[#7E91AE]">
                            {label}
                          </label>
                          <Textarea
                            value={contextProfile[field]}
                            onChange={(e) => setContextProfile((prev) => ({ ...prev, [field]: e.target.value }))}
                            placeholder={placeholder}
                            rows={3}
                            className="rounded-[16px] border-[#DCE3EE]"
                          />
                        </div>
                      ))}
                    </div>
                  </SurfaceSection>
                ) : null}

                {/* Step 2 — Questionnaire */}
                {wizardStep === 2 ? (
                  <div className="space-y-5" data-risk-assessment-questionnaire="true">
                    <SurfaceSection
                      eyebrow="Questionnaire"
                      title="Application Response Capture"
                      action={
                        currentAssetId ? (
                          <button className={PRIMARY_BUTTON} onClick={() => void handleSubmitQa()} disabled={submittingQa}>
                            {submittingQa ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {qaAssetIdx < selectedAssessment.asset_ids.length - 1 ? "Save And Next" : "Submit Responses"}
                          </button>
                        ) : null
                      }
                    >
                      {/* AI Context Questions — inline section within the questionnaire */}
                      {suggestedQuestions.length > 0 ? (
                        <div className="mb-6 overflow-hidden rounded-[20px] border border-[#C9D7FF] bg-[#F7F9FF]">
                          <div className="flex items-center justify-between gap-3 border-b border-[#C9D7FF] px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#C9D7FF] bg-[#EEF2FF] px-2.5 py-1 text-[10px] font-bold text-[#1E49E2]">
                                <Sparkles className="h-3 w-3" />
                                AI Context
                              </span>
                              <span className="text-[14px] font-bold text-[#0C233C]">Evidence Requests from Document Analysis</span>
                            </div>
                            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${answeredContextQuestions === suggestedQuestions.length ? "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]" : "border-[#DCE3EE] bg-[#F3F6FA] text-[#6A748A]"}`}>
                              {answeredContextQuestions}/{suggestedQuestions.length} answered
                            </span>
                          </div>
                          <div className="space-y-0 divide-y divide-[#E2EBFF]">
                            {suggestedQuestions.map((question) => (
                              <div key={question.question_id} className="px-5 py-5">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${PRIORITY_CLASS[question.priority] ?? PRIORITY_CLASS.medium}`}>
                                      {question.priority.charAt(0).toUpperCase() + question.priority.slice(1)} Priority
                                    </span>
                                    <span className="text-[11px] text-[#9AA8BC]">{question.section_title}</span>
                                  </div>
                                  {question.status === "answered" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-[#BFE7D1] bg-[#EDFBF5] px-3 py-1 text-[11px] font-bold text-[#009A44]">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Answered
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mb-1 text-[14px] font-bold leading-7 text-[#0C233C]">{question.text}</p>
                                {question.rationale ? (
                                  <p className="mb-4 text-[12px] leading-6 text-[#9AA8BC]">{question.rationale}</p>
                                ) : null}
                                <div className="mb-3 flex flex-wrap gap-2">
                                  {(["yes", "no", "na"] as AnswerType[]).map((ans) => (
                                    <button
                                      key={ans}
                                      className={`rounded-full border px-4 py-2 text-[12px] font-bold transition-colors ${question.answer === ans ? ANSWER_CLASS[ans] : "border-[#DCE3EE] bg-white text-[#6A748A] hover:bg-[#F7F9FC]"}`}
                                      onClick={() => void answerContextQuestion(selectedAssessment.id, question.question_id, ans, question.details ?? "")}
                                    >
                                      {ans === "na" ? "N/A" : ans.toUpperCase()}
                                    </button>
                                  ))}
                                </div>
                                {question.answer && question.answer !== "na" ? (
                                  <Textarea
                                    defaultValue={question.details ?? ""}
                                    onBlur={(e) => {
                                      if (e.target.value !== (question.details ?? "")) {
                                        void answerContextQuestion(selectedAssessment.id, question.question_id, question.answer!, e.target.value);
                                      }
                                    }}
                                    placeholder="Add evidence, artefact reference, or supporting detail"
                                    rows={2}
                                    className="rounded-[14px] border-[#DCE3EE]"
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedAssessment.asset_ids.length === 0 ? (
                        <div className="rounded-[18px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-8 text-center text-[13px] leading-6 text-[#7388A8]">
                          No Asset Registry applications were selected for questionnaire capture.
                        </div>
                      ) : (
                        <>
                          <div className="sticky top-0 z-10 mb-4 rounded-[18px] border border-[#DCE3EE] bg-white/95 px-4 py-3 shadow-[0_14px_28px_-24px_rgba(12,35,60,0.26)] backdrop-blur">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-[14px] font-bold text-[#0C233C]">{assetName(currentAssetId)}</p>
                                <p className="mt-1 text-[12px] text-[#7388A8]">
                                  Application {qaAssetIdx + 1} of {selectedAssessment.asset_ids.length} · {answeredCount(currentAssetId)} answered
                                </p>
                              </div>
                              <div className="rounded-full border border-[#DCE3EE] bg-[#F7F9FC] px-4 py-2 text-[12px] font-bold text-[#7388A8]">
                                {sections.length} sections
                              </div>
                            </div>
                          </div>

                          <div className="mb-4 flex flex-wrap gap-2">
                            {selectedAssessment.asset_ids.map((assetId, index) => (
                              <button
                                key={assetId}
                                className={`rounded-full border px-4 py-2 text-[12px] font-bold transition-colors ${
                                  index === qaAssetIdx
                                    ? "border-[#1E49E2] bg-[#1E49E2] text-white"
                                    : "border-[#DCE3EE] bg-white text-[#6A748A] hover:bg-[#F7F9FC]"
                                }`}
                                onClick={() => setQaAssetIdx(index)}
                              >
                                {assetName(assetId)} <span className="opacity-70">({answeredCount(assetId)})</span>
                              </button>
                            ))}
                          </div>

                          <div className="space-y-4">
                            {sections.map((section) => {
                              const completed = sectionProgress(answers, currentAssetId, section);
                              const total = section.questions.length;
                              const isOpen = expandedSection === section.id;
                              return (
                                <div
                                  key={section.id}
                                  className={`overflow-hidden rounded-[20px] border bg-white ${
                                    isOpen ? "border-[#AFC1F8] shadow-[0_16px_34px_-30px_rgba(30,73,226,0.35)]" : "border-[#E2E6EF]"
                                  }`}
                                >
                                  <button
                                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                                    onClick={() => setExpandedSection(isOpen ? null : section.id)}
                                  >
                                    <div className="flex items-center gap-3">
                                      {isOpen ? (
                                        <ChevronDown className="h-4 w-4 text-[#7E91AE]" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-[#7E91AE]" />
                                      )}
                                      <span className="text-[15px] font-bold text-[#0C233C]">{section.title}</span>
                                    </div>
                                    <span
                                      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${
                                        completed === total
                                          ? "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]"
                                          : "border-[#DCE3EE] bg-[#F3F6FA] text-[#6A748A]"
                                      }`}
                                    >
                                      {completed}/{total}
                                    </span>
                                  </button>

                                  {isOpen ? (
                                    <div className="border-t border-[#E2E6EF] px-5 py-5">
                                      <div className="space-y-5">
                                        {section.questions.map((question) => {
                                          const local = answers[currentAssetId]?.[section.id]?.[question.id];
                                          return (
                                            <div key={question.id} className="border-t border-[#EFF2F7] pt-5 first:border-t-0 first:pt-0">
                                              <div className="mb-3 flex items-start gap-3">
                                                <span
                                                  className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                                                    question.question_type === "Exposure"
                                                      ? "border-[#F6D3A0] bg-[#FFF4E8] text-[#AB5C00]"
                                                      : question.question_type === "Control"
                                                        ? "border-[#C9D7FF] bg-[#EEF2FF] text-[#1E49E2]"
                                                        : "border-[#DCE3EE] bg-[#F3F6FA] text-[#6A748A]"
                                                  }`}
                                                >
                                                  {question.question_type}
                                                </span>
                                                <p className="text-[14px] leading-7 text-[#4D6485]">{question.text}</p>
                                              </div>

                                              <div className="mb-3 flex flex-wrap gap-2">
                                                {(["yes", "no", "na"] as AnswerType[]).map((answer) => (
                                                  <button
                                                    key={answer}
                                                    className={`rounded-full border px-4 py-2 text-[12px] font-bold transition-colors ${
                                                      local?.answer === answer
                                                        ? ANSWER_CLASS[answer]
                                                        : "border-[#DCE3EE] bg-white text-[#6A748A] hover:bg-[#F7F9FC]"
                                                    }`}
                                                    onClick={() => setAnswer(currentAssetId, section.id, question.id, answer)}
                                                  >
                                                    {answer === "na" ? "N/A" : answer.toUpperCase()}
                                                  </button>
                                                ))}
                                              </div>

                                              {local?.answer && local.answer !== "na" ? (
                                                <Textarea
                                                  value={local.details}
                                                  onChange={(event) =>
                                                    setDetails(currentAssetId, section.id, question.id, event.target.value)
                                                  }
                                                  placeholder="Add supporting detail or evidence notes"
                                                  rows={2}
                                                  className="rounded-[14px] border-[#DCE3EE]"
                                                />
                                              ) : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </SurfaceSection>
                  </div>
                ) : null}

                {/* Step 3 — Analyse */}
                {wizardStep === 3 ? (
                  <SurfaceSection eyebrow="Analysis" title="Running Risk Analysis" data-risk-assessment-analysis="true">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="rounded-[22px] border border-[#E2E6EF] bg-white px-8 py-10 text-center shadow-[0_18px_42px_-34px_rgba(12,35,60,0.26)]">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F3F0FF] text-[#7213EA]">
                          <Sparkles className="h-8 w-8 animate-pulse" />
                        </div>
                        <h3 className="mt-5 text-[24px] font-bold tracking-[-0.03em] text-[#0C233C]">
                          Scoring Inherent Risk Across Selected Applications
                        </h3>
                        <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-7 text-[#7388A8]">
                          Applying rule-based scoring and LLM analysis — including context profile and answered context questions — to generate structured risk candidates.
                        </p>
                        <div className="mx-auto mt-7 max-w-[420px] overflow-hidden rounded-full bg-[#DCE3EE]">
                          <div className="h-3 w-[58%] rounded-full bg-[linear-gradient(90deg,#1E49E2_0%,#00B8F5_100%)]" />
                        </div>
                        <div className="mt-5 flex items-center justify-center gap-2 text-[13px] font-bold text-[#1E49E2]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analysis in progress
                        </div>
                      </div>

                      <TracePanel title="Current Run" subtitle="The page remains inside Risk Assessment while analysis completes.">
                        <div className="space-y-3">
                          {[
                            ["Responses validated", "Done", "done"],
                            ["Context pack assembled", "Done", "done"],
                            ["Exposure patterns grouped", "Running", "running"],
                            ["Draft risks generated", "Queued", "queued"],
                            ["Bands assigned", "Queued", "queued"],
                          ].map(([label, state, tone]) => (
                            <div key={label} className="flex items-center justify-between rounded-[16px] bg-[#F7F9FC] px-4 py-3">
                              <span className="text-[13px] font-medium text-[#0C233C]">{label}</span>
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${
                                  tone === "done"
                                    ? "border-[#BFE7D1] bg-[#EDFBF5] text-[#009A44]"
                                    : tone === "running"
                                      ? "border-[#C9D7FF] bg-[#EEF2FF] text-[#1E49E2]"
                                      : "border-[#DCE3EE] bg-white text-[#6A748A]"
                                }`}
                              >
                                {state}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TracePanel>
                    </div>
                  </SurfaceSection>
                ) : null}

                {/* Step 4 — Risks */}
                {wizardStep === 4 ? (
                  <SurfaceSection
                    eyebrow="Risks"
                    title={`Identified Risks (${selectedAssessment.risks.length})`}
                    action={
                      <button className={PRIMARY_BUTTON} onClick={() => setWizardStep(5)} data-risk-assessment-risks="true">
                        Apply Controls
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    }
                  >
                    {selectedAssessment.risks.length > 0 ? (
                      <div className="grid gap-4">
                        {selectedAssessment.risks.map((risk) => (
                          <RiskSummaryCard key={risk.id} risk={risk} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-8 text-center text-[13px] leading-6 text-[#7388A8]">
                        No risks have been identified for this assessment yet.
                      </div>
                    )}
                  </SurfaceSection>
                ) : null}

                {/* Step 5 — Controls */}
                {wizardStep === 5 ? (
                  <SurfaceSection
                    eyebrow="Controls"
                    title="Apply Controls To Risks"
                    action={
                      <div className="flex flex-wrap gap-2" data-risk-assessment-controls="true">
                        <button
                          className={SOFT_BUTTON}
                          onClick={() =>
                            void suggestControls(selectedAssessment.id)
                              .then(() => toast({ title: "Suggestions refreshed" }))
                              .catch(() => toast({ title: "Failed to refresh suggestions", variant: "destructive" }))
                          }
                        >
                          <RefreshCw className="h-4 w-4" />
                          Refresh Suggestions
                        </button>
                        <button className={PRIMARY_BUTTON} onClick={() => setWizardStep(6)}>
                          Calculate Residual
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    }
                  >
                    {selectedAssessment.risks.length > 0 ? (
                      <div className="space-y-5">
                        {selectedAssessment.risks.map((risk) => {
                          const suggestions = (selectedAssessment.suggested_controls ?? []).filter(
                            (suggestion) => suggestion.risk_id === risk.id,
                          );
                          const applied = selectedAssessment.applied_controls.filter((control) => control.risk_id === risk.id);
                          return (
                            <TracePanel
                              key={risk.id}
                              title={risk.title}
                              subtitle={risk.description}
                              className="border-[#E2E6EF]"
                            >
                              <div className="mb-4 flex flex-wrap items-center gap-2">
                                <BandBadge band={risk.inherent_risk_band} />
                                <span className="text-[12px] text-[#7388A8]">
                                  {applied.length} applied · {suggestions.length} suggested
                                </span>
                              </div>

                              {applied.length > 0 ? (
                                <div className="mb-4">
                                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#7E91AE]">
                                    Applied Controls
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {applied.map((control) => (
                                      <AppliedControlChip key={control.id} label={control.control_id} />
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              <div className="space-y-3">
                                {suggestions.length > 0 ? (
                                  suggestions.map((suggestion) => (
                                    <SuggestedControlRow
                                      key={`${risk.id}-${suggestion.control_id}`}
                                      suggestion={suggestion}
                                      alreadyApplied={applied.some((control) => control.control_id === suggestion.control_id)}
                                      onApply={() => handleApplySuggestion(risk.id, suggestion)}
                                    />
                                  ))
                                ) : (
                                  <div className="rounded-[16px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-6 text-[13px] text-[#7388A8]">
                                    Loading suggestions or no control suggestions are available yet.
                                  </div>
                                )}
                              </div>
                            </TracePanel>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-8 text-center text-[13px] leading-6 text-[#7388A8]">
                        No risks are available for control application.
                      </div>
                    )}
                  </SurfaceSection>
                ) : null}

                {/* Step 6 — Residual */}
                {wizardStep === 6 ? (
                  <SurfaceSection
                    eyebrow="Residual"
                    title="Residual Risk Review"
                    action={
                      <div className="flex flex-wrap gap-2" data-risk-assessment-residual="true">
                        <button className={SOFT_BUTTON} onClick={() => void fetchResidual(selectedAssessment.id)}>
                          <RefreshCw className="h-4 w-4" />
                          Refresh
                        </button>
                        <button className={PRIMARY_BUTTON} onClick={() => setWizardStep(7)}>
                          Generate Report
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    }
                  >
                    {residualResults.length > 0 ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {residualResults.map((result) => (
                          <ResidualCard key={result.risk_id} result={result} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-10 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-[#7E91AE]" />
                        <p className="text-[13px] text-[#7388A8]">Calculating residual risk.</p>
                      </div>
                    )}
                  </SurfaceSection>
                ) : null}

                {/* Step 7 — Report */}
                {wizardStep === 7 ? (
                  <SurfaceSection
                    eyebrow="Report"
                    title="Risk Assessment Report"
                    action={
                      <button
                        className={PRIMARY_BUTTON}
                        onClick={() => void handleGenerateReport()}
                        disabled={isGeneratingReport}
                        data-risk-assessment-report="true"
                      >
                        {isGeneratingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                        Generate Report
                      </button>
                    }
                  >
                    {currentReport ? (
                      <div className="rounded-[22px] border border-[#DCE3EE] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(12,35,60,0.22)]">
                        <div className="mb-5 border-b border-[#E2E6EF] pb-5">
                          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#00338D]">Formatted Report</p>
                          <h3 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#0C233C]">
                            {selectedAssessment.title}
                          </h3>
                        </div>
                        <div className="prose prose-sm max-w-none text-[#4D6485] [&_h1]:text-[28px] [&_h1]:font-bold [&_h1]:tracking-[-0.03em] [&_h1]:text-[#0C233C] [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2]:font-bold [&_h2]:tracking-[-0.02em] [&_h2]:text-[#0C233C] [&_h3]:mt-6 [&_h3]:text-[16px] [&_h3]:font-bold [&_h3]:text-[#0C233C] [&_li]:leading-7 [&_p]:leading-7 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#E2E6EF] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[#E2E6EF] [&_th]:bg-[#F7F9FC] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.18em] [&_th]:text-[#7E91AE]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReport}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#DCE3EE] bg-[#FBFCFE] px-4 py-8 text-center text-[13px] leading-6 text-[#7388A8]">
                        Generate the report to preview the formatted assessment output here.
                      </div>
                    )}
                  </SurfaceSection>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

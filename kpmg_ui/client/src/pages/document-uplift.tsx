import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileStack,
  FileText,
  Filter,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type CaseStage =
  | "uploading"
  | "converting"
  | "analyzing"
  | "review_ready"
  | "generating_outputs"
  | "complete"
  | "failed"
  | "partial";

type DocumentTag = "procedure" | "rcm" | "policy" | "process_doc" | "risk_data" | "evidence";
type SuggestionStatus = "pending" | "accepted" | "rejected" | "edited";
type SuggestionSeverity = "critical" | "high" | "medium" | "low" | "informational";
type SuggestionTargetType =
  | "procedure_step"
  | "role_responsibility"
  | "raci_matrix"
  | "evidence_requirement"
  | "monitoring_reporting"
  | "document_metadata"
  | "other";

interface CostSummary {
  provider?: string;
  model?: string;
  call_count?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  is_local_provider?: boolean;
}

interface DocumentUpliftStatus {
  stage: CaseStage;
  stage1_cost?: CostSummary | null;
  final_cost?: CostSummary | null;
}

interface DocumentTagEntry {
  file_id: string;
  filename: string;
  tag: DocumentTag;
  conversion_status?: string;
  looks_corrupt?: boolean;
  page_count?: number;
  error?: string | null;
}

interface SourceReference {
  document_id: string;
  filename?: string | null;
  anchor_id?: string | null;
  sheet_name?: string | null;
  row_index?: number | null;
}

interface SuggestionEditTarget {
  target_id: string;
  target_type: SuggestionTargetType;
  title?: string | null;
  detail?: string | null;
  proposed_text: string;
  original_text?: string | null;
  target_anchor_id?: string | null;
  target_text?: string | null;
  target_heading?: string | null;
  review_status?: SuggestionStatus | null;
  edited_proposed_text?: string | null;
  source_references?: SourceReference[];
}

interface Suggestion {
  suggestion_id: string;
  suggestion_type: string;
  severity: SuggestionSeverity;
  title: string;
  detail: string;
  proposed_text?: string | null;
  original_text?: string | null;
  review_status: SuggestionStatus;
  edited_proposed_text?: string | null;
  reviewer_notes?: string | null;
  source_references: SourceReference[];
  edit_targets?: SuggestionEditTarget[];
}

interface OutputItem {
  output_id: string;
  output_type: "docx" | "png_diagram" | "pdf_diagram" | string;
  filename: string;
  output_mode?: string;
  created_at?: string;
}

interface StageCounter {
  total?: number;
  completed?: number;
  failed?: number;
  pending?: number;
}

interface ProcessingState {
  conversion?: StageCounter;
  analysis?: StageCounter;
  pipeline_status?: string;
  pipeline_error?: string | null;
  warnings?: string[];
}

interface SsePipelineEventData {
  stage?: CaseStage | string;
  step?: string;
  doc?: string;
  sheet?: string;
  anchor?: string;
  batch?: number;
  total_batches?: number;
  total_docs?: number;
  completed_docs?: number;
  suggestion_count?: number;
  output_count?: number;
  message?: string;
}

interface CorpusMap {
  risk_to_control_map?: unknown[];
  sop_to_control_map?: unknown[];
  evidence_to_control_map?: unknown[];
}

interface DocumentUpliftCase {
  case_id: string;
  title: string;
  process_name?: string | null;
  domain_label?: string | null;
  notes?: string | null;
  status?: DocumentUpliftStatus;
  document_tags?: DocumentTagEntry[];
  suggestions?: Suggestion[];
  outputs?: OutputItem[];
  corpus_map?: CorpusMap | null;
  processing_state?: ProcessingState;
  final_summary?: string | null;
  created_at?: string;
  updated_at?: string;
}

const PIPELINE_STEPS: Array<{ stage: CaseStage; label: string; detail: string }> = [
  { stage: "uploading", label: "Case Setup And Upload", detail: "Upload and tag documents" },
  { stage: "converting", label: "Extract And Analyze", detail: "Conversion and chunking" },
  { stage: "analyzing", label: "Review Suggestions", detail: "Analysis in progress" },
  { stage: "review_ready", label: "Review Suggestions", detail: "Review uplift" },
  { stage: "generating_outputs", label: "Generate Outputs", detail: "Word and diagrams" },
  { stage: "complete", label: "Generate Outputs", detail: "Artifacts ready" },
];

const TAG_OPTIONS: Array<{ value: DocumentTag; label: string }> = [
  { value: "procedure", label: "Procedure SOP" },
  { value: "rcm", label: "RCM / Controls" },
  { value: "risk_data", label: "Risk Register" },
  { value: "policy", label: "Policy" },
  { value: "process_doc", label: "Process Document" },
  { value: "evidence", label: "Evidence" },
];

const severityStyles: Record<SuggestionSeverity, string> = {
  critical: "border-[#B00020] bg-[#FFF0F2] text-[#9B0018]",
  high: "border-[#FEEBED] bg-[#FFF7F8] text-[#E5001B]",
  medium: "border-[#F7E7A8] bg-[#FFFBEB] text-[#7A5400]",
  low: "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]",
  informational: "border-[#B7D7FF] bg-[#F2F8FF] text-[#005EB8]",
};

function caseStage(caseItem?: DocumentUpliftCase | null): CaseStage {
  return caseItem?.status?.stage ?? "uploading";
}

function stageProgress(stage: CaseStage): number {
  if (stage === "failed") return 100;
  if (stage === "partial") return 72;
  const order: CaseStage[] = ["uploading", "converting", "analyzing", "review_ready", "generating_outputs", "complete"];
  const index = Math.max(0, order.indexOf(stage));
  return Math.round(((index + 1) / order.length) * 100);
}

function activeStep(stage: CaseStage): number {
  if (stage === "uploading") return 0;
  if (stage === "converting" || stage === "analyzing") return 1;
  if (stage === "review_ready" || stage === "partial" || stage === "failed") return 2;
  return 3;
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTag(tag: string): string {
  return TAG_OPTIONS.find((option) => option.value === tag)?.label ?? formatStage(tag);
}

function formatCost(cost?: CostSummary | null): string {
  if (!cost) return "Cost pending";
  if (cost.is_local_provider) return `${cost.call_count ?? 0} local calls`;
  const amount = Number(cost.estimated_cost_usd ?? 0);
  return `$${amount.toFixed(2)} / ${cost.call_count ?? 0} calls`;
}

function sourceLabel(source: SourceReference): string {
  const parts = [source.filename || source.document_id];
  if (source.sheet_name) parts.push(source.sheet_name);
  if (source.row_index !== undefined && source.row_index !== null) parts.push(`row ${source.row_index}`);
  return parts.join(" - ");
}

function sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const severityRank: Record<SuggestionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
  const statusRank: Record<SuggestionStatus, number> = { pending: 0, edited: 1, accepted: 2, rejected: 3 };
  return [...suggestions].sort((left, right) => {
    const statusDelta = statusRank[left.review_status] - statusRank[right.review_status];
    if (statusDelta) return statusDelta;
    return severityRank[left.severity] - severityRank[right.severity];
  });
}

function compactFileName(name: string): string {
  return name.length > 34 ? `${name.slice(0, 31)}...` : name;
}

function formatSseProgressLabel(data: SsePipelineEventData): string {
  const docSuffix = data.doc ? ` - ${data.doc}` : "";
  if (data.step === "section_classification") return `Classifying sections${docSuffix}`;
  if (data.step === "terminology_extraction") return `Extracting terminology${docSuffix}`;
  if (data.step === "extraction_batch") {
    const batchLabel = data.batch && data.total_batches ? ` batch ${data.batch} of ${data.total_batches}` : "";
    return `Extracting content${batchLabel}${docSuffix}`;
  }
  if (data.step === "excel_schema_detection") {
    const sheetLabel = data.sheet ? ` - ${data.sheet}` : "";
    return `Detecting Excel schema${docSuffix}${sheetLabel}`;
  }
  if (data.step === "cross_document_synthesis") return "Synthesizing cross-document gaps";
  if (data.step === "section_rewrite") return `Rewriting section${data.anchor ? ` ${data.anchor}` : ""}`;
  if (data.step === "swimlane_extraction") return "Extracting swimlane flow";
  if (data.step === "diagram_render") return "Rendering diagram";
  if (data.step === "word_export") return "Exporting track-changes Word document";
  if (data.step === "doc_conversion") {
    return `Converting documents (${data.completed_docs ?? 0} of ${data.total_docs ?? 0})`;
  }
  if (data.message) return data.message;
  return data.stage ? formatStage(String(data.stage)) : "Waiting for pipeline progress";
}

function parseSsePipelineEvent(event: MessageEvent): SsePipelineEventData | null {
  try {
    return JSON.parse(event.data) as SsePipelineEventData;
  } catch {
    return null;
  }
}

function sseProgressPercent(data: SsePipelineEventData, fallbackStage: CaseStage): number {
  if (data.total_docs && data.completed_docs !== undefined && data.total_docs > 0) {
    const base = stageProgress((data.stage as CaseStage) || fallbackStage);
    const withinStage = Math.round((data.completed_docs / data.total_docs) * 14);
    return Math.min(98, Math.max(4, base - 10 + withinStage));
  }
  if (data.stage) return stageProgress(data.stage as CaseStage);
  return stageProgress(fallbackStage);
}

export default function DocumentUpliftPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createProcess, setCreateProcess] = useState("");
  const [uploadTag, setUploadTag] = useState<DocumentTag>("procedure");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string>("");
  const [editedText, setEditedText] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [rejectAllOpen, setRejectAllOpen] = useState(false);
  const [rejectAllToken, setRejectAllToken] = useState("");
  const [autoAcceptWarning, setAutoAcceptWarning] = useState("");
  const [documentUpliftProgressLabel, setDocumentUpliftProgressLabel] = useState("");
  const [sseProgress, setSseProgress] = useState<number | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const casesQuery = useQuery<{ cases: DocumentUpliftCase[] }>({
    queryKey: ["/api/document-uplift/cases"],
    refetchInterval: (query) => {
      const cases = query.state.data?.cases ?? [];
      return cases.some((item) => ["converting", "analyzing", "generating_outputs"].includes(caseStage(item))) ? 5000 : false;
    },
  });

  const cases = casesQuery.data?.cases ?? [];
  const filteredCases = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter((item) => [item.title, item.process_name, item.domain_label].some((value) => value?.toLowerCase().includes(needle)));
  }, [cases, search]);

  useEffect(() => {
    if (!selectedCaseId && cases[0]) {
      setSelectedCaseId(cases[0].case_id);
    }
  }, [cases, selectedCaseId]);

  const caseQuery = useQuery<DocumentUpliftCase>({
    queryKey: [`/api/document-uplift/cases/${selectedCaseId}`],
    enabled: !!selectedCaseId,
    refetchInterval: (query) => {
      const stage = caseStage(query.state.data);
      return ["converting", "analyzing", "generating_outputs"].includes(stage) ? 5000 : false;
    },
  });

  const suggestionsQuery = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: [`/api/document-uplift/cases/${selectedCaseId}/suggestions`],
    enabled: !!selectedCaseId,
  });

  const selectedCase = caseQuery.data ?? cases.find((item) => item.case_id === selectedCaseId) ?? null;
  const suggestions = suggestionsQuery.data?.suggestions ?? selectedCase?.suggestions ?? [];
  const sortedSuggestions = useMemo(() => sortSuggestions(suggestions), [suggestions]);
  const selectedSuggestion = sortedSuggestions.find((item) => item.suggestion_id === selectedSuggestionId) ?? sortedSuggestions[0] ?? null;
  const selectedEditTargets = selectedSuggestion?.edit_targets ?? [];

  useEffect(() => {
    if (selectedSuggestion) {
      setSelectedSuggestionId(selectedSuggestion.suggestion_id);
      setEditedText(selectedSuggestion.edited_proposed_text || selectedSuggestion.proposed_text || "");
      setReviewerNotes(selectedSuggestion.reviewer_notes || "");
    } else {
      setSelectedSuggestionId("");
      setEditedText("");
      setReviewerNotes("");
    }
  }, [selectedSuggestion?.suggestion_id]);

  useEffect(() => {
    if (!selectedCaseId) {
      setDocumentUpliftProgressLabel("");
      setSseProgress(null);
      setSseConnected(false);
      return;
    }

    const eventSource = new EventSource(`/api/document-uplift/cases/${selectedCaseId}/pipeline/stream`);

    const updateFromEvent = (event: MessageEvent) => {
      const data = parseSsePipelineEvent(event);
      if (!data) return;
      setSseConnected(true);
      setDocumentUpliftProgressLabel(formatSseProgressLabel(data));
      setSseProgress((current) => Math.max(current ?? 0, sseProgressPercent(data, caseStage(selectedCase))));
    };

    const handleStage = (event: MessageEvent) => {
      updateFromEvent(event);
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${selectedCaseId}`] });
    };

    const handleProgress = (event: MessageEvent) => {
      updateFromEvent(event);
    };

    const handleComplete = (event: MessageEvent) => {
      updateFromEvent(event);
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${selectedCaseId}/suggestions`] });
      eventSource.close();
      setSseConnected(false);
    };

    const handleStreamError = (event: Event) => {
      const data = "data" in event ? parseSsePipelineEvent(event as MessageEvent) : null;
      if (data) {
        setDocumentUpliftProgressLabel(formatSseProgressLabel(data));
        setSseProgress(sseProgressPercent(data, caseStage(selectedCase)));
      } else {
        setDocumentUpliftProgressLabel("Live progress stream unavailable; polling status instead.");
      }
      setSseConnected(false);
      if (data?.stage === "failed") {
        eventSource.close();
      }
    };

    eventSource.addEventListener("stage", handleStage);
    eventSource.addEventListener("progress", handleProgress);
    eventSource.addEventListener("complete", handleComplete);
    eventSource.addEventListener("error", handleStreamError);

    return () => {
      eventSource.close();
    };
  }, [selectedCaseId, selectedCase?.status?.stage]);

  const createCase = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/document-uplift/cases", {
        title: createTitle.trim(),
        process_name: createProcess.trim() || undefined,
      });
      return response.json() as Promise<DocumentUpliftCase>;
    },
    onSuccess: (created) => {
      setCreateTitle("");
      setCreateProcess("");
      setSelectedCaseId(created.case_id);
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      toast({ title: "Case created", description: created.title });
    },
    onError: (error: Error) => toast({ title: "Create case failed", description: error.message, variant: "destructive" }),
  });

  const uploadFiles = useMutation({
    mutationFn: async () => {
      if (!selectedCaseId || !selectedFiles.length) return [];
      const uploaded: DocumentTagEntry[] = [];
      for (const file of selectedFiles) {
        const form = new FormData();
        form.append("tag", uploadTag);
        form.append("file", file);
        const response = await fetch(`/api/document-uplift/cases/${selectedCaseId}/upload`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Failed to upload ${file.name}`);
        }
        uploaded.push(await response.json());
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      invalidateCase();
      toast({ title: "Files uploaded", description: `${uploaded.length} file(s) added to this case.` });
    },
    onError: (error: Error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
  });

  const runPipeline = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/document-uplift/cases/${selectedCaseId}/run-pipeline`);
      return response.json();
    },
    onSuccess: () => {
      invalidateCase();
      toast({ title: "Pipeline started", description: "Document Uplift analysis is running." });
    },
    onError: (error: Error) => toast({ title: "Run failed", description: error.message, variant: "destructive" }),
  });

  const updateSuggestion = useMutation({
    mutationFn: async ({
      suggestionId,
      reviewStatus,
      editedProposedText,
      notes,
    }: {
      suggestionId: string;
      reviewStatus: SuggestionStatus;
      editedProposedText?: string;
      notes?: string;
    }) => {
      const response = await apiRequest("PATCH", `/api/document-uplift/cases/${selectedCaseId}/suggestions/${suggestionId}`, {
        review_status: reviewStatus,
        edited_proposed_text: editedProposedText,
        reviewer_notes: notes,
      });
      return response.json() as Promise<Suggestion>;
    },
    onSuccess: () => {
      invalidateCase();
      toast({ title: "Suggestion updated" });
    },
    onError: (error: Error) => toast({ title: "Suggestion update failed", description: error.message, variant: "destructive" }),
  });

  const bulkReview = useMutation({
    mutationFn: async ({ action, token }: { action: "accept_all" | "reject_all"; token?: string }) => {
      const response = await apiRequest("POST", `/api/document-uplift/cases/${selectedCaseId}/suggestions/bulk-review`, {
        action,
        confirmation_token: token,
      });
      return response.json() as Promise<{ updated_count: number }>;
    },
    onSuccess: (result) => {
      setRejectAllOpen(false);
      setRejectAllToken("");
      invalidateCase();
      toast({ title: "Bulk review complete", description: `${result.updated_count} suggestion(s) updated.` });
    },
    onError: (error: Error) => toast({ title: "Bulk review failed", description: error.message, variant: "destructive" }),
  });

  const generateOutputs = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/document-uplift/cases/${selectedCaseId}/generate-outputs`);
      return response.json() as Promise<{ warnings?: string[]; auto_accepted_count?: number }>;
    },
    onSuccess: (result) => {
      const warning = result.warnings?.[0] ?? "";
      setAutoAcceptWarning(warning);
      invalidateCase();
      toast({
        title: "Output generation started",
        description: warning || "Track-changes Word and diagram outputs are being generated.",
      });
    },
    onError: (error: Error) => toast({ title: "Generate outputs failed", description: error.message, variant: "destructive" }),
  });

  function invalidateCase() {
    queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
    if (selectedCaseId) {
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/document-uplift/cases/${selectedCaseId}/suggestions`] });
    }
  }

  const counts = useMemo(() => {
    const reviewReady = cases.filter((item) => caseStage(item) === "review_ready").length;
    const complete = cases.filter((item) => caseStage(item) === "complete").length;
    const averageCalls = cases
      .map((item) => item.status?.final_cost?.call_count ?? item.status?.stage1_cost?.call_count)
      .filter((value): value is number => typeof value === "number");
    return {
      open: cases.length,
      reviewReady,
      complete,
      averageCalls: averageCalls.length ? Math.round(averageCalls.reduce((sum, value) => sum + value, 0) / averageCalls.length) : 0,
    };
  }, [cases]);

  const currentStage = caseStage(selectedCase);
  const activeStepIndex = activeStep(currentStage);
  const progress = sseProgress ?? stageProgress(currentStage);
  const pendingCount = suggestions.filter((item) => item.review_status === "pending").length;
  const costSummary = selectedCase?.status?.final_cost ?? selectedCase?.status?.stage1_cost;
  const conversionCounter = selectedCase?.processing_state?.conversion ?? {};
  const analysisCounter = selectedCase?.processing_state?.analysis ?? {};

  return (
    <div className="h-full flex flex-col" data-testid="document-uplift-page">
      <HeroSection
        title="Document Uplift"
        subtitle="Review, improve, and export procedure documents with cross-document control evidence."
        icon={FileStack}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => runPipeline.mutate()}
              disabled={!selectedCaseId || runPipeline.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#064BB4] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#00338D] disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="document-uplift-run-pipeline"
            >
              {runPipeline.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Pipeline
            </button>
            <button
              type="button"
              onClick={() => generateOutputs.mutate()}
              disabled={!selectedCaseId || generateOutputs.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="document-uplift-generate-outputs"
            >
              {generateOutputs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate Outputs
            </button>
          </div>
        }
      />

      <TracePageBody width="wide" tint contentClassName="space-y-5">
        {casesQuery.isError ? (
          <div className="rounded-2xl border border-[#F7E7A8] bg-[#FFFBEB] p-5 text-[#7A5400]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-bold text-[#0C233C]">Document Uplift API unavailable</div>
                <p className="mt-1 text-sm">
                  The backend returned an error while loading cases. Confirm `DOCUMENT_UPLIFT_ENABLED=true` in the local environment before testing this page.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Cases</div>
                <h2 className="text-[20px] font-bold tracking-tight text-[#0C233C]">Case List</h2>
              </div>
              <button
                type="button"
                onClick={() => casesQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#00338D]"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-4">
              <MetricCard label="Open Cases" value={counts.open} />
              <MetricCard label="Review Ready" value={counts.reviewReady} />
              <MetricCard label="Outputs Ready" value={counts.complete} />
              <MetricCard label="Avg LLM Calls" value={counts.averageCalls} />
            </div>

            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#E2E6EF] bg-white px-3 py-2">
              <Search className="h-4 w-4 text-[#8492A6]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cases..."
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0C233C] outline-none placeholder:text-[#8492A6]"
              />
            </div>

            <div className="space-y-2">
              {filteredCases.length ? (
                filteredCases.map((item) => (
                  <button
                    type="button"
                    key={item.case_id}
                    onClick={() => setSelectedCaseId(item.case_id)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      selectedCaseId === item.case_id
                        ? "border-[#1E49E2] bg-[#EEF2FF]"
                        : "border-[#E2E6EF] bg-white hover:bg-[#F8FAFD]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-bold text-[#0C233C]">{item.title}</div>
                        <div className="mt-1 text-[12px] text-[#5A6478]">{item.process_name || "No process name"}</div>
                      </div>
                      <StagePill stage={caseStage(item)} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#8492A6]">
                      <span>{item.document_tags?.length ?? 0} file(s)</span>
                      <span>{item.suggestions?.filter((suggestion) => suggestion.review_status === "pending").length ?? 0} open suggestion(s)</span>
                      <span>{item.outputs?.length ?? 0} output(s)</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#CAD7E8] bg-[#F8FAFD] p-6 text-center text-sm text-[#5A6478]">
                  No cases found. Create a case to start a Document Uplift run.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
            <div className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Setup</div>
              <h2 className="text-[20px] font-bold tracking-tight text-[#0C233C]">Create New Case</h2>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Title</span>
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#CAD7E8] px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
                  placeholder="Asset and wealth management"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Process Name</span>
                <input
                  value={createProcess}
                  onChange={(event) => setCreateProcess(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#CAD7E8] px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
                  placeholder="Client onboarding KYC"
                />
              </label>
              <button
                type="button"
                onClick={() => createCase.mutate()}
                disabled={!createTitle.trim() || createCase.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#064BB4] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#00338D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createCase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Case
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Selected Case</div>
              <h2 className="text-[24px] font-bold tracking-tight text-[#0C233C]">{selectedCase?.title ?? "No Case Selected"}</h2>
              <p className="mt-1 text-[13px] text-[#5A6478]">{selectedCase?.process_name ?? "Choose or create a case to begin."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StagePill stage={currentStage} />
              <span className="rounded-full border border-[#B8E7D0] bg-[#EDFBF5] px-3 py-1 text-[11px] font-bold text-[#007A3D]">
                Cost: {formatCost(costSummary)}
              </span>
            </div>
          </div>
          <PipelineStepper stage={currentStage} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)_330px]">
          <div className="space-y-5">
            <Panel title="Case Explorer" label="Documents">
              <div className="space-y-2">
                {TAG_OPTIONS.map((tag) => {
                  const files = selectedCase?.document_tags?.filter((item) => item.tag === tag.value) ?? [];
                  return (
                    <div key={tag.value} className="rounded-xl border border-[#E2E6EF] bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-bold text-[#0C233C]">{tag.label}</span>
                        <span className="text-[12px] text-[#8492A6]">{files.length}</span>
                      </div>
                      {files.length ? (
                        <div className="mt-2 space-y-1">
                          {files.slice(0, 3).map((file) => (
                            <div key={file.file_id} className="truncate rounded-lg bg-[#F8FAFD] px-2 py-1 text-[11px] text-[#5A6478]" title={file.filename}>
                              {compactFileName(file.filename)}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Generated Outputs" label="Artifacts">
              <div className="space-y-2">
                {selectedCase?.outputs?.length ? (
                  selectedCase.outputs.map((output) => (
                    <div key={output.output_id} className="rounded-xl border border-[#B8E7D0] bg-[#EDFBF5] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-bold text-[#0C233C]" title={output.filename}>{output.filename}</div>
                          <div className="mt-1 text-[11px] text-[#5A6478]">{formatStage(output.output_type)}</div>
                        </div>
                        <a
                          href={`/api/document-uplift/cases/${selectedCaseId}/outputs/${output.output_id}`}
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#064BB4] bg-white px-2 text-[11px] font-bold text-[#064BB4] transition-colors hover:bg-[#EEF2FF]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] text-[#5A6478]">Outputs will appear here after Stage 2 completes.</p>
                )}
              </div>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="Upload and Tag Documents" label="Inputs">
              <div
                className="rounded-2xl border border-dashed border-[#BFD0E6] bg-[#F8FAFD] p-8 text-center"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto h-8 w-8 text-[#8492A6]" />
                <div className="mt-3 text-[14px] font-bold text-[#0C233C]">Drop files here or click to browse</div>
                <div className="mt-1 text-[12px] text-[#8492A6]">DOCX, PDF, XLSX, CSV, PNG, JPG</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-[180px] flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Document Tag</span>
                  <select
                    value={uploadTag}
                    onChange={(event) => setUploadTag(event.target.value as DocumentTag)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#CAD7E8] bg-white px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
                  >
                    {TAG_OPTIONS.map((tag) => (
                      <option key={tag.value} value={tag.value}>{tag.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => uploadFiles.mutate()}
                  disabled={!selectedCaseId || !selectedFiles.length || uploadFiles.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#064BB4] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#00338D] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadFiles.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload Files
                </button>
              </div>
              {selectedFiles.length ? (
                <div className="mt-3 rounded-xl bg-[#EEF2FF] p-3 text-[12px] text-[#00338D]">
                  {selectedFiles.length} selected: {selectedFiles.map((file) => file.name).join(", ")}
                </div>
              ) : null}
            </Panel>

            <Panel title="Document Review" label="Suggestion Detail">
              {selectedSuggestion ? (
                <div className="space-y-5">
                  <div className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={selectedSuggestion.severity} />
                      <span className="rounded-full border border-[#E2E6EF] bg-white px-3 py-1 text-[11px] font-bold text-[#5A6478]">
                        {formatStage(selectedSuggestion.review_status)}
                      </span>
                    </div>
                    <h3 className="text-[18px] font-bold text-[#0C233C]">{selectedSuggestion.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#5A6478]">{selectedSuggestion.detail}</p>
                  </div>

                  {selectedEditTargets.length ? (
                    <div className="space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#00338D]">Uplift Targets</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedEditTargets.map((target) => (
                          <div key={target.target_id} className="rounded-xl border border-[#BFD0E6] bg-[#F8FAFD] p-4">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-[#D8E0ED] bg-white px-3 py-1 text-[11px] font-bold text-[#00338D]">
                                {formatStage(target.target_type)}
                              </span>
                              {target.review_status ? (
                                <span className="text-[11px] text-[#8492A6]">{formatStage(target.review_status)}</span>
                              ) : null}
                            </div>
                            <div className="text-[13px] font-bold text-[#0C233C]">{target.title || "Document target"}</div>
                            {target.detail ? <p className="mt-2 text-[12px] leading-relaxed text-[#5A6478]">{target.detail}</p> : null}
                            <p className="mt-3 text-[13px] leading-relaxed text-[#0C233C]">
                              {target.edited_proposed_text || target.proposed_text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-[#F7E7A8] bg-[#FFFBEB] p-4">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#7A5400]">Original Text</div>
                          <p className="text-[13px] leading-relaxed text-[#0C233C]">{selectedSuggestion.original_text || "No original text anchor supplied."}</p>
                        </div>
                        <div className="rounded-xl border border-[#BFD0E6] bg-[#F8FAFD] p-4">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#00338D]">Proposed Text</div>
                          <p className="text-[13px] leading-relaxed text-[#0C233C]">{selectedSuggestion.edited_proposed_text || selectedSuggestion.proposed_text || "No proposed text supplied."}</p>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Edit Suggestion</label>
                        <Textarea value={editedText} onChange={(event) => setEditedText(event.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Reviewer Notes</label>
                    <Textarea value={reviewerNotes} onChange={(event) => setReviewerNotes(event.target.value)} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      label="Accept"
                      tone="primary"
                      onClick={() => updateSuggestion.mutate({ suggestionId: selectedSuggestion.suggestion_id, reviewStatus: "accepted", notes: reviewerNotes })}
                      disabled={updateSuggestion.isPending}
                    />
                    <ActionButton
                      label="Edit"
                      tone="secondary"
                      onClick={() => updateSuggestion.mutate({ suggestionId: selectedSuggestion.suggestion_id, reviewStatus: "edited", editedProposedText: editedText, notes: reviewerNotes })}
                      disabled={updateSuggestion.isPending || !editedText.trim() || selectedEditTargets.length > 0}
                    />
                    <ActionButton
                      label="Reject"
                      tone="danger"
                      onClick={() => updateSuggestion.mutate({ suggestionId: selectedSuggestion.suggestion_id, reviewStatus: "rejected", notes: reviewerNotes })}
                      disabled={updateSuggestion.isPending}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#CAD7E8] bg-[#F8FAFD] p-8 text-center text-[13px] text-[#5A6478]">
                  Run the pipeline to populate review suggestions.
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="Pipeline Progress" label="Status">
              <div className="h-2 overflow-hidden rounded-full bg-[#E6EDF7]">
                <div className="h-full rounded-full bg-[#1E49E2]" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-3 rounded-xl border border-[#C9D7FF] bg-[#EEF2FF] px-3 py-2 text-[12px] font-semibold text-[#00338D]">
                {documentUpliftProgressLabel || formatStage(currentStage)}
                <span className="ml-2 text-[#5A6478]">{sseConnected ? "Live" : "Polling fallback"}</span>
              </div>
              <div className="mt-4 space-y-3 text-[12px] text-[#5A6478]">
                <ProgressLine label="Conversion" counter={conversionCounter} />
                <ProgressLine label="Analysis" counter={analysisCounter} />
                <div>Stage: {formatStage(currentStage)}</div>
                <div>Suggestions: {pendingCount} pending</div>
              </div>
              <div className="mt-5 rounded-xl border border-[#C9D7FF] bg-[#EEF2FF] p-4">
                <div className="text-[14px] font-bold text-[#0C233C]">Cost</div>
                <div className="mt-1 text-[13px] text-[#5A6478]">{formatCost(costSummary)}</div>
              </div>
            </Panel>

            <Panel title="Suggestion Queue" label={`${pendingCount} Open`}>
              <div className="mb-3 flex flex-wrap gap-2">
                <ActionButton label="Accept All" tone="secondary" onClick={() => bulkReview.mutate({ action: "accept_all" })} disabled={!suggestions.length || bulkReview.isPending} />
                <ActionButton label="Reject All" tone="danger" onClick={() => setRejectAllOpen(true)} disabled={!suggestions.length || bulkReview.isPending} />
              </div>
              <div className="space-y-2">
                {sortedSuggestions.length ? (
                  sortedSuggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion.suggestion_id}
                      onClick={() => setSelectedSuggestionId(suggestion.suggestion_id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selectedSuggestion?.suggestion_id === suggestion.suggestion_id
                          ? "border-[#1E49E2] bg-[#EEF2FF]"
                          : "border-[#E2E6EF] bg-white hover:bg-[#F8FAFD]",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <SeverityBadge severity={suggestion.severity} />
                        <span className="text-[11px] text-[#8492A6]">{formatStage(suggestion.review_status)}</span>
                      </div>
                      <div className="text-[13px] font-bold text-[#0C233C]">{suggestion.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#5A6478]">
                        <span>{formatStage(suggestion.suggestion_type)}</span>
                        {suggestion.edit_targets?.length ? (
                          <span className="rounded-full border border-[#D8E0ED] bg-[#F8FAFD] px-2 py-0.5 text-[#00338D]">
                            {suggestion.edit_targets.length} targets
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-[13px] text-[#5A6478]">No suggestions yet.</p>
                )}
              </div>
            </Panel>

            <Panel title="Source References" label="Evidence">
              {selectedSuggestion?.source_references?.length ? (
                <div className="space-y-2">
                  {selectedSuggestion.source_references.map((source, index) => (
                    <div key={`${source.document_id}-${index}`} className="rounded-xl border border-[#E2E6EF] bg-white p-3">
                      <div className="text-[13px] font-bold text-[#0C233C]">{source.document_id}</div>
                      <div className="mt-1 text-[11px] text-[#5A6478]">{sourceLabel(source)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#5A6478]">Source references appear with selected suggestions.</p>
              )}
            </Panel>
          </div>
        </section>

        {autoAcceptWarning ? (
          <div className="rounded-2xl border border-[#F7E7A8] bg-[#FFFBEB] p-4 text-[13px] text-[#7A5400]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>auto-accepted suggestion warning: {autoAcceptWarning}</span>
            </div>
          </div>
        ) : null}
      </TracePageBody>

      <Dialog open={rejectAllOpen} onOpenChange={setRejectAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject All Suggestions?</DialogTitle>
            <DialogDescription>
              Type REJECT_ALL before this action is enabled. This protects the review queue from accidental bulk rejection.
            </DialogDescription>
          </DialogHeader>
          <input
            value={rejectAllToken}
            onChange={(event) => setRejectAllToken(event.target.value)}
            placeholder="REJECT_ALL"
            className="h-10 rounded-lg border border-[#CAD7E8] px-3 text-sm outline-none focus:border-[#1E49E2]"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRejectAllOpen(false)}
              className="rounded-lg border border-[#CAD7E8] bg-white px-4 py-2 text-[13px] font-bold text-[#0C233C]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => bulkReview.mutate({ action: "reject_all", token: rejectAllToken })}
              disabled={rejectAllToken !== "REJECT_ALL" || bulkReview.isPending}
              className="rounded-lg bg-[#E5001B] px-4 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reject All
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#E2E6EF] bg-white p-4">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#8492A6]">{label}</div>
      <div className="mt-2 text-[28px] font-bold leading-none text-[#0C233C]">{value}</div>
    </div>
  );
}

function Panel({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">{label}</div>
        <h3 className="text-[20px] font-bold tracking-tight text-[#0C233C]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PipelineStepper({ stage }: { stage: CaseStage }) {
  const stepIndex = activeStep(stage);
  const visualSteps = [
    { label: "Case Setup And Upload", detail: "Upload and tag documents" },
    { label: "Extract And Analyze", detail: "Run extraction" },
    { label: "Review Suggestions", detail: "Review uplift" },
    { label: "Generate Outputs", detail: "Download artifacts" },
  ];
  return (
    <div className="grid overflow-hidden rounded-xl border border-[#E2E6EF] bg-white md:grid-cols-4">
      {visualSteps.map((step, index) => {
        const complete = index < stepIndex;
        const active = index === stepIndex;
        return (
          <div key={step.label} className={cn("border-[#E2E6EF] p-4 md:border-r md:last:border-r-0", active && "bg-[#EEF2FF]")}>
            <div className="flex items-center gap-3">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold", complete ? "bg-[#009A44] text-white" : active ? "bg-[#1E49E2] text-white" : "border border-[#CAD7E8] bg-white text-[#00338D]")}>
                {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <div>
                <div className="text-[13px] font-bold text-[#0C233C]">{step.label}</div>
                <div className="text-[11px] text-[#8492A6]">{step.detail}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StagePill({ stage }: { stage: CaseStage }) {
  const style =
    stage === "complete" ? "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]" :
    stage === "failed" ? "border-[#FEEBED] bg-[#FFF7F8] text-[#E5001B]" :
    stage === "partial" ? "border-[#F7E7A8] bg-[#FFFBEB] text-[#7A5400]" :
    "border-[#C9D7FF] bg-[#EEF2FF] text-[#00338D]";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold", style)}>
      {formatStage(stage)}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: SuggestionSeverity }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", severityStyles[severity])}>
      {severity}
    </span>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  const className =
    tone === "primary" ? "bg-[#064BB4] text-white hover:bg-[#00338D]" :
    tone === "danger" ? "border border-[#F1B8BF] bg-white text-[#E5001B] hover:bg-[#FEEBED]" :
    "border border-[#BFD0E6] bg-white text-[#00338D] hover:bg-[#EEF2FF]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex items-center justify-center rounded-lg px-4 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      {label}
    </button>
  );
}

function ProgressLine({ label, counter }: { label: string; counter: StageCounter }) {
  const total = counter.total ?? 0;
  const completed = counter.completed ?? 0;
  const failed = counter.failed ?? 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-[#8492A6]">
        {total ? `${completed}/${total}${failed ? `, ${failed} failed` : ""}` : "pending"}
      </span>
    </div>
  );
}

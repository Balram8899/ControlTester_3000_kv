import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileStack,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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

type SuggestionStatus = "pending" | "accepted" | "rejected" | "edited";

interface Suggestion {
  suggestion_id: string;
  review_status: SuggestionStatus;
}

interface DocumentTagEntry {
  file_id: string;
  filename: string;
  tag: string;
  conversion_status?: string;
}

interface OutputItem {
  output_id: string;
  filename: string;
  output_type?: string;
}

interface CostSummary {
  estimated_cost_usd?: number;
  call_count?: number;
  total_tokens?: number;
  is_local_provider?: boolean;
}

interface DocumentUpliftCase {
  case_id: string;
  title: string;
  process_name?: string | null;
  domain_label?: string | null;
  notes?: string | null;
  status?: {
    stage?: CaseStage;
    stage1_cost?: CostSummary | null;
    final_cost?: CostSummary | null;
  };
  document_tags?: DocumentTagEntry[];
  suggestions?: Suggestion[];
  outputs?: OutputItem[];
  created_at?: string;
  updated_at?: string;
}

const HOW_IT_WORKS_KEY = "apex_uplift_hiw_open";

const STEPS = [
  { title: "Create Case", detail: "Set the SOP, process, owner, and domain.", icon: BriefcaseBusiness, accent: "#7213EA" },
  { title: "Upload Documents", detail: "Add the primary SOP and supporting evidence.", icon: UploadCloud, accent: "#1E49E2" },
  { title: "Run Pipeline", detail: "Extract anchors and generate uplift suggestions.", icon: Loader2, accent: "#00B8F5" },
  { title: "Review Suggestions", detail: "Accept, reject, or edit proposed changes.", icon: CheckCircle2, accent: "#098E7E" },
  { title: "Export", detail: "Generate the tracked DOCX and supporting logs.", icon: FileText, accent: "#009A44" },
] as const;

function caseStage(caseItem?: DocumentUpliftCase | null): CaseStage {
  return caseItem?.status?.stage ?? "uploading";
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string): string {
  if (!value) return "Not run";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCost(cost?: CostSummary | null): string {
  if (!cost) return "Pending";
  if (cost.is_local_provider) return `${cost.call_count ?? 0} local calls`;
  return `$${Number(cost.estimated_cost_usd ?? 0).toFixed(2)}`;
}

function stageTone(stage: CaseStage): { border: string; badge: string; label: string } {
  if (stage === "complete") {
    return { border: "#009A44", badge: "border-[#B8E7D0] bg-[#EDFBF5] text-[#007A3D]", label: "Complete" };
  }
  if (stage === "review_ready" || stage === "partial") {
    return { border: "#EAAA00", badge: "border-[#F7E7A8] bg-[#FFFBEB] text-[#7A5400]", label: stage === "partial" ? "Partial" : "Review Ready" };
  }
  if (stage === "failed") {
    return { border: "#E5001B", badge: "border-[#FEEBED] bg-[#FFF7F8] text-[#E5001B]", label: "Failed" };
  }
  if (stage === "converting" || stage === "analyzing" || stage === "generating_outputs") {
    return { border: "#1E49E2", badge: "border-[#C9D7FF] bg-[#EEF2FF] text-[#00338D]", label: formatStage(stage) };
  }
  return { border: "#CAD7E8", badge: "border-[#E2E6EF] bg-[#F0F2F7] text-[#5A6478]", label: "Draft" };
}

function pendingSuggestions(caseItem: DocumentUpliftCase): number {
  return caseItem.suggestions?.filter((item) => item.review_status === "pending").length ?? 0;
}

function SectionHeader({
  label,
  title,
  actions,
}: {
  label: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#E2E6EF] pb-4">
      <div className="text-left">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">{label}</div>
        <div className="text-[20px] font-bold tracking-tight text-[#0C233C]">{title}</div>
      </div>
      {actions}
    </div>
  );
}

function StageBadge({ stage }: { stage: CaseStage }) {
  const tone = stageTone(stage);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold", tone.badge)}>
      {tone.label}
    </span>
  );
}

function MetricStrip({ cases }: { cases: DocumentUpliftCase[] }) {
  const metrics = useMemo(() => {
    const reviewReady = cases.filter((item) => caseStage(item) === "review_ready" || caseStage(item) === "partial").length;
    const pendingUploads = cases.filter((item) => (item.document_tags?.length ?? 0) < 2).length;
    const exports = cases.reduce((total, item) => total + (item.outputs?.length ?? 0), 0);
    return [
      { label: "Active Cases", value: cases.length, icon: FolderOpen, accent: "#1E49E2", tint: "#EEF2FF" },
      { label: "Review Ready", value: reviewReady, icon: CheckCircle2, accent: "#098E7E", tint: "#E6F4F2" },
      { label: "Pending Uploads", value: pendingUploads, icon: UploadCloud, accent: "#00B8F5", tint: "#EFF8FF" },
      { label: "Exports", value: exports, icon: FileText, accent: "#009A44", tint: "#EDFBF5" },
    ];
  }, [cases]);

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: metric.tint, color: metric.accent }}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[13px] text-[#5A6478]">{metric.label}</div>
                <div className="mt-1 text-[34px] font-bold leading-none tracking-tight" style={{ color: metric.accent }}>
                  {metric.value}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const Icon = step.icon;
  return (
    <div className="relative min-h-[150px] rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl" style={{ background: step.accent }} />
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: step.accent }}>
          {index + 1}
        </div>
        <div className="min-w-0">
          <Icon className="mb-3 h-6 w-6" style={{ color: step.accent }} />
          <div className="text-[15px] font-bold text-[#0C233C]">{step.title}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#5A6478]">{step.detail}</p>
        </div>
      </div>
    </div>
  );
}

function CaseRow({
  item,
  onOpen,
  onDelete,
}: {
  item: DocumentUpliftCase;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const stage = caseStage(item);
  const tone = stageTone(stage);
  return (
    <div className="group grid gap-4 rounded-2xl border border-[#E2E6EF] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0 border-l-4 pl-4" style={{ borderColor: tone.border }}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#1E49E2]">
            <FileStack className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-[#0C233C]">{item.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#5A6478]">
              <span>{item.domain_label || item.process_name || "General"}</span>
              <span>{item.document_tags?.length ?? 0} document(s)</span>
              <span>{pendingSuggestions(item)} pending</span>
              <span>Updated {formatDate(item.updated_at || item.created_at)}</span>
              <span>Cost {formatCost(item.status?.final_cost ?? item.status?.stage1_cost)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center">
        <StageBadge stage={stage} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-xl border border-[#C9D7FF] bg-[#EEF2FF] px-4 py-2 text-[13px] font-bold text-[#00338D] transition-colors hover:bg-[#DCE7FF]"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E6EF] bg-white text-[#8492A6] transition-colors hover:border-[#F1B8BF] hover:bg-[#FEEBED] hover:text-[#E5001B]"
          aria-label={`Delete ${item.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CreateCaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [processName, setProcessName] = useState("");
  const [domain, setDomain] = useState("");
  const [notes, setNotes] = useState("");

  const createCase = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/document-uplift/cases", {
        title: title.trim(),
        process_name: processName.trim() || undefined,
        domain_label: domain.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      return response.json() as Promise<DocumentUpliftCase>;
    },
    onSuccess: (created) => {
      setTitle("");
      setProcessName("");
      setDomain("");
      setNotes("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      setLocation(`/document-uplift/${created.case_id}`);
      toast({ title: "Case created", description: created.title });
    },
    onError: (error: Error) => toast({ title: "Create case failed", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[#0C233C]">Create Case</DialogTitle>
          <DialogDescription>Set up a Document Uplift case for a primary SOP and supporting documents.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Case Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#CAD7E8] px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
                placeholder="Cyber Incident Response SOP"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Process Name</span>
              <input
                value={processName}
                onChange={(event) => setProcessName(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#CAD7E8] px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
                placeholder="Incident response"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Domain</span>
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#CAD7E8] px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
                placeholder="Cyber Security"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8492A6]">Notes</span>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 min-h-[164px] border-[#CAD7E8] text-sm"
              placeholder="Optional case context for reviewers."
            />
          </label>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[#CAD7E8] bg-white px-4 py-2 text-[13px] font-bold text-[#0C233C]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createCase.mutate()}
            disabled={!title.trim() || createCase.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7213EA] px-5 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createCase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Case
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCaseDialog({
  caseItem,
  onOpenChange,
}: {
  caseItem: DocumentUpliftCase | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState("");
  const deleteCase = useMutation({
    mutationFn: async () => {
      if (!caseItem) return;
      await apiRequest("DELETE", `/api/document-uplift/cases/${caseItem.case_id}`);
    },
    onSuccess: () => {
      setConfirm("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/document-uplift/cases"] });
      toast({ title: "Case deleted" });
    },
    onError: (error: Error) => toast({ title: "Delete failed", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!caseItem) setConfirm("");
  }, [caseItem]);

  return (
    <Dialog open={!!caseItem} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[#0C233C]">Delete Case</DialogTitle>
          <DialogDescription>This removes the case, uploaded documents, suggestions, and generated outputs.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-[#F1B8BF] bg-[#FEEBED] p-4 text-[13px] text-[#8A0010]">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>This action cannot be undone.</span>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] text-[#5A6478]">Type the case name to confirm:</p>
          <div className="mb-2 text-[15px] font-bold text-[#0C233C]">{caseItem?.title}</div>
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="h-10 w-full rounded-lg border border-[#CAD7E8] px-3 text-sm text-[#0C233C] outline-none focus:border-[#1E49E2]"
            placeholder="Case name"
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[#CAD7E8] bg-white px-4 py-2 text-[13px] font-bold text-[#0C233C]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => deleteCase.mutate()}
            disabled={!caseItem || confirm !== caseItem.title || deleteCase.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E5001B] px-5 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete Case
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentUpliftPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [howItWorksOpen, setHowItWorksOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(HOW_IT_WORKS_KEY) !== "false";
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteCase, setDeleteCase] = useState<DocumentUpliftCase | null>(null);

  const casesQuery = useQuery<{ cases: DocumentUpliftCase[] }>({
    queryKey: ["/api/document-uplift/cases"],
    refetchInterval: (query) => {
      const cases = query.state.data?.cases ?? [];
      return cases.some((item) => ["converting", "analyzing", "generating_outputs"].includes(caseStage(item))) ? 5000 : false;
    },
  });

  const cases = useMemo(() => {
    return [...(casesQuery.data?.cases ?? [])].sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    });
  }, [casesQuery.data?.cases]);

  const filteredCases = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter((item) => [item.title, item.process_name, item.domain_label, item.notes].some((value) => value?.toLowerCase().includes(needle)));
  }, [cases, search]);

  const toggleHowItWorks = () => {
    setHowItWorksOpen((open) => {
      const next = !open;
      window.localStorage.setItem(HOW_IT_WORKS_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="h-full overflow-auto bg-[#F0F2F7] text-[#0C233C]" data-testid="document-uplift-page">
      <HeroSection
        title="Document Uplift"
        subtitle="Review, improve, and export procedure documents with cross-document control evidence."
        icon={FileStack}
      />
      <div className="sr-only">DOCUMENT INTELLIGENCE</div>

      <TracePageBody width="wide" tint contentClassName="space-y-9">
        {casesQuery.isError ? (
          <div className="rounded-2xl border border-[#F7E7A8] bg-[#FFFBEB] p-5 text-[#7A5400]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-bold text-[#0C233C]">Document Uplift API unavailable</div>
                <p className="mt-1 text-sm">
                  Confirm `DOCUMENT_UPLIFT_ENABLED=true` in the local environment before testing this page.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <MetricStrip cases={cases} />

        <section className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
          <button type="button" onClick={toggleHowItWorks} className="block w-full text-left">
            <SectionHeader
              label="Process"
              title="How It Works"
              actions={<ChevronDown className={cn("h-5 w-5 text-[#8492A6] transition-transform", !howItWorksOpen && "-rotate-90")} />}
            />
          </button>
          {howItWorksOpen ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-5">
              {STEPS.map((step, index) => (
                <StepCard key={step.title} step={step} index={index} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
            <SectionHeader
              label="Cases"
              title="Your Cases"
              actions={
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-3 rounded-xl bg-[#7213EA] px-5 py-3 text-[13px] font-bold text-white transition-all hover:-translate-y-0.5"
                >
                  <Plus className="h-4 w-4" />
                  New Case
                </button>
              }
            />
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#E2E6EF] bg-white px-3 py-2">
              <Search className="h-4 w-4 text-[#8492A6]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search cases, domains, documents..."
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0C233C] outline-none placeholder:text-[#8492A6]"
              />
            </div>
            <div className="mt-5 space-y-3">
              {casesQuery.isLoading ? (
                <div className="rounded-2xl border border-dashed border-[#CAD7E8] bg-[#F8FAFD] p-8 text-center text-sm text-[#5A6478]">
                  Loading cases...
                </div>
              ) : filteredCases.length ? (
                filteredCases.map((item) => (
                  <CaseRow
                    key={item.case_id}
                    item={item}
                    onOpen={() => setLocation(`/document-uplift/${item.case_id}`)}
                    onDelete={() => setDeleteCase(item)}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[#CAD7E8] bg-[#F8FAFD] p-10 text-center">
                  <FolderOpen className="mx-auto h-10 w-10 text-[#8492A6]" />
                  <div className="mt-3 text-[15px] font-bold text-[#0C233C]">No Cases Found</div>
                  <p className="mt-1 text-[13px] text-[#5A6478]">Create a case to start uplifting SOPs and related documents.</p>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#7213EA] px-5 py-2.5 text-[13px] font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    New Case
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Insights</div>
              <h3 className="mt-1 text-[20px] font-bold tracking-tight text-[#0C233C]">Status Distribution</h3>
              <div className="mt-5 space-y-3">
                {(["review_ready", "converting", "analyzing", "complete", "uploading"] as CaseStage[]).map((stage) => {
                  const count = cases.filter((item) => caseStage(item) === stage).length;
                  const percent = cases.length ? Math.round((count / cases.length) * 100) : 0;
                  const tone = stageTone(stage);
                  return (
                    <div key={stage}>
                      <div className="mb-1 flex justify-between text-[12px] text-[#5A6478]">
                        <span>{tone.label}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#E2E6EF]">
                        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: tone.border }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#1E49E2]">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-[#0C233C]">Recent Activity</div>
                  <div className="text-[12px] text-[#8492A6]">Latest case updates</div>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {cases.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    key={item.case_id}
                    onClick={() => setLocation(`/document-uplift/${item.case_id}`)}
                    className="block w-full rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] px-3 py-2 text-left hover:border-[#C9D7FF]"
                  >
                    <div className="truncate text-[12px] font-bold text-[#0C233C]">{item.title}</div>
                    <div className="mt-1 text-[11px] text-[#8492A6]">{stageTone(caseStage(item)).label} · {formatDate(item.updated_at || item.created_at)}</div>
                  </button>
                ))}
                {!cases.length ? <p className="text-[13px] text-[#5A6478]">No activity yet.</p> : null}
              </div>
            </div>
          </aside>
        </section>
      </TracePageBody>

      <CreateCaseDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteCaseDialog caseItem={deleteCase} onOpenChange={(open) => !open && setDeleteCase(null)} />
    </div>
  );
}

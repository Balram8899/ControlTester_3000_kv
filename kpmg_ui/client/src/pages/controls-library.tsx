import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Download,
  FileText,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import HeroSection from "@/components/HeroSection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chartTheme";

const TRACE_GRAPH_COLORS = ["#1E49E2", "#00B8F5", "#098E7E", "#7213EA", "#009A44", "#EAAA00", "#00338D", "#8492A6"];
const CHART_TEXT_STYLE = { fontFamily: "Arial", fontSize: 11, fill: "#5A6478" };
const CHART_AXIS_TICK = { ...CHART_TEXT_STYLE };

interface MappedObligation {
  obligation_id: string;
  obligation_text: string;
  section_reference: string;
  framework_name: string;
  enforcement_level: string;
  match_score: number;
}

interface ExtractedControl {
  control_id: string;
  control_name: string;
  description: string;
  document_reference: string;
  domain: string;
  control_type: string;
  keywords: string[];
  specificity_level: string;
  mapped_obligations: MappedObligation[];
  _source_filename?: string;
}

interface MergedControl extends ExtractedControl {
  merged_from_count: number;
  source_documents: { filename: string; document_reference: string; is_primary: boolean }[];
}

interface ControlsDocument {
  document_id: string;
  source_filename: string;
  upload_timestamp: string;
  model_used?: string;
  total_controls: number;
  controls_by_domain?: Record<string, number>;
}

interface ControlsDocumentFull extends ControlsDocument {
  controls: ExtractedControl[];
}

type ControlsViewMode = "document" | "merged";
type ControlsDashboardScope = "all" | "selected-document";

interface W1HResult {
  who: boolean;
  what: boolean;
  where: boolean;
  how: boolean;
  when: boolean;
  why: boolean;
}

interface CtrlW1H extends ExtractedControl {
  w1h: W1HResult;
  score: number;
  rag: "green" | "amber" | "red";
  qualityAvailable: boolean;
  unavailableReason?: string;
}

const RAG_COLOR = { green: "#009A44", amber: "#EAAA00", red: "#E5001B" };
const RAG_BG: Record<"green" | "amber" | "red", string> = {
  green: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300",
  amber: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  red: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
};

const W1H_KEYS: (keyof W1HResult)[] = ["who", "what", "where", "how", "when", "why"];
const W1H_COLORS: Record<keyof W1HResult, string> = {
  who: "#1E49E2",
  what: "#00B8F5",
  where: "#098E7E",
  how: "#7213EA",
  when: "#009A44",
  why: "#EAAA00",
};

const QUALITY_ANALYSIS_BATCH_SIZE = 20;
const QUALITY_ANALYSIS_DESCRIPTION_LIMIT = 1200;

type QualityPayloadControl = { control_id: string; name: string; description: string };

function buildQualityPayloadControls(controls: QualityPayloadControl[]): QualityPayloadControl[] {
  return controls.map(control => ({
    control_id: control.control_id,
    name: control.name,
    description: (control.description ?? "").slice(0, QUALITY_ANALYSIS_DESCRIPTION_LIMIT),
  }));
}

function isUnavailableQualityResult(result: any): boolean {
  const rationale = result?.rationale && typeof result.rationale === "object" ? Object.values(result.rationale) : [];
  return rationale.some(value => String(value).toLowerCase().includes("analysis unavailable"));
}

function exportQualityCSV(controls: CtrlW1H[]) {
  const header = ["Control ID", "Control Name", "Process Area", "WHO", "WHAT", "WHERE", "HOW", "WHEN", "WHY", "Score", "RAG"];
  const rows = controls.map(c => [
    c.control_id,
    c.control_name,
    c.domain,
    c.w1h.who ? "Y" : "N",
    c.w1h.what ? "Y" : "N",
    c.w1h.where ? "Y" : "N",
    c.w1h.how ? "Y" : "N",
    c.w1h.when ? "Y" : "N",
    c.w1h.why ? "Y" : "N",
    String(c.score),
    c.rag.toUpperCase(),
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "controls_quality.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

function formatDomainName(value: string) {
  return value ? value.replace(/_/g, " ") : "Unclassified";
}

function formatDomainTitle(value: string) {
  return formatDomainName(value)
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function domainColor(domain: string, allDomains: string[]): string {
  const idx = allDomains.indexOf(domain);
  return TRACE_GRAPH_COLORS[(idx >= 0 ? idx : 0) % TRACE_GRAPH_COLORS.length];
}

function SectionHeader({
  label,
  title,
  actions,
}: {
  label: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b-2 border-[#E2E6EF] pb-4">
      <div className="text-left">
        <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
          {label}
        </div>
        <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
          {title}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

function TraceButton({
  children,
  onClick,
  disabled,
  active = false,
  title,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-[#00338D] bg-[#00338D] text-white hover:-translate-y-0.5"
          : "border-[#E2E6EF] bg-white text-[#0C233C] hover:-translate-y-0.5 hover:border-[#1E49E2]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  detail,
  accent = "#1E49E2",
  progress,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  accent?: string;
  progress?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl" style={{ background: accent }} />
      <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#8492A6]">{label}</p>
      <div className="mt-3 text-[34px] font-bold leading-none tracking-tight text-[#0C233C]">
        {value}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#5A6478]">{detail}</p>
      {typeof progress === "number" && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#E2E6EF]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: accent }}
          />
        </div>
      )}
    </div>
  );
}

function StatusPill({
  children,
  color = "#1E49E2",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold"
      style={{ borderColor: `${color}55`, color, background: `${color}12` }}
    >
      {children}
    </span>
  );
}

function ProcessAreaRagBars({
  data,
}: {
  data: { domain: string; green: number; amber: number; red: number; total: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-[#E2E6EF] bg-[#F0F2F7] px-4 py-8 text-center text-[13px] font-bold text-[#8492A6]">
        Data not available
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="space-y-3">
        {data.map(area => {
          const greenPct = percent(area.green, area.total);
          const amberPct = percent(area.amber, area.total);
          const redPct = percent(area.red, area.total);
          return (
            <div key={area.domain} className="grid grid-cols-[118px_1fr_34px] items-center gap-3">
              <span className="text-[12px] font-bold leading-snug text-[#0C233C]">
                {formatDomainTitle(area.domain)}
              </span>
              <div className="flex h-4 overflow-hidden rounded-full bg-[#E2E6EF]">
                {area.green > 0 && <span title={`Green: ${area.green}`} style={{ width: `${greenPct}%`, background: RAG_COLOR.green }} />}
                {area.amber > 0 && <span title={`Amber: ${area.amber}`} style={{ width: `${amberPct}%`, background: RAG_COLOR.amber }} />}
                {area.red > 0 && <span title={`Red: ${area.red}`} style={{ width: `${redPct}%`, background: RAG_COLOR.red }} />}
              </div>
              <span className="text-right text-[12px] font-bold text-[#0C233C]">{area.total}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-[#E2E6EF] pt-4" data-controls-library-domain-tags="true">
        <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#00338D]">Tagged Domains</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.map((area, index) => (
            <span
              key={area.domain}
              className="rounded-full border px-3 py-1 text-[11px] font-bold"
              style={{
                borderColor: `${TRACE_GRAPH_COLORS[index % TRACE_GRAPH_COLORS.length]}55`,
                color: TRACE_GRAPH_COLORS[index % TRACE_GRAPH_COLORS.length],
                background: `${TRACE_GRAPH_COLORS[index % TRACE_GRAPH_COLORS.length]}12`,
              }}
            >
              {formatDomainTitle(area.domain)} ({area.total})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ControlsLibraryPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const {
    pendingControlId,
    setPendingControlId,
    setPendingObligationId,
    pendingQualityAnalysis,
    setPendingQualityAnalysis,
  } = useCrossNav();
  const { refreshMetrics } = useLibraryMetrics();

  const [uploadOpen, setUploadOpen] = useState(true);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<any[]>([]);

  const [controlsDocs, setControlsDocs] = useState<ControlsDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [selectedDoc, setSelectedDoc] = useState<ControlsDocumentFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docCache, setDocCache] = useState<Record<string, ControlsDocumentFull>>({});

  const [mergedControls, setMergedControls] = useState<MergedControl[] | null>(null);
  const [mergedLoading, setMergedLoading] = useState(false);

  const [dashboardScope, setDashboardScope] = useState<ControlsDashboardScope>("all");
  const [controlsViewMode, setControlsViewMode] = useState<ControlsViewMode>("document");
  const [domainFilter, setDomainFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [dashboardControls, setDashboardControls] = useState<(ExtractedControl & { _source_filename?: string })[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardDomainFilter, setDashboardDomainFilter] = useState("all");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [qualityRagFilter, setQualityRagFilter] = useState<"all" | "green" | "amber" | "red">("all");
  const [selectedQualityControl, setSelectedQualityControl] = useState<CtrlW1H | null>(null);
  const [qualitySearch, setQualitySearch] = useState("");
  const [ctrlsW1H, setCtrlsW1H] = useState<CtrlW1H[]>([]);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityAnalysisRequested, setQualityAnalysisRequested] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [mergedCtrlStats, setMergedCtrlStats] = useState<{ total_raw: number; total_merged: number } | null>(null);
  const [mergedStatsLoading, setMergedStatsLoading] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  useEffect(() => {
    if (!pendingControlId) return;
    setDashboardScope("all");
    setControlsViewMode("document");
    setDashboardSearch(pendingControlId);
    setSearch(pendingControlId);
    setPendingControlId(null);
  }, [pendingControlId]);

  useEffect(() => {
    if (!pendingQualityAnalysis) return;
    setPendingQualityAnalysis(false);
  }, [pendingQualityAnalysis]);

  useEffect(() => {
    if (dashboardControls.length === 0) return;
    if (mergedCtrlStats === null && !mergedStatsLoading) fetchMergedStats();
  }, [dashboardControls.length]);

  const resetQualityAnalysis = useCallback(() => {
    setCtrlsW1H([]);
    setQualityAnalysisRequested(false);
    setQualityRagFilter("all");
    setSelectedQualityControl(null);
  }, []);

  const handleObligationClick = (obligationId: string) => {
    setPendingObligationId(obligationId);
    setLocation("/regulatory-library");
  };

  const fetchDocs = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/controls-library/documents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.documents)) {
        setControlsDocs(data.documents);
      }
    } catch (err) {
      console.warn("fetchDocs failed:", err);
    } finally {
      setDocsLoading(false);
    }
    fetchAllControls();
  };

  const fetchAllControls = async (): Promise<ExtractedControl[]> => {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/controls-library/all-controls");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.controls)) {
        setDashboardControls(data.controls);
        resetQualityAnalysis();
        return data.controls as ExtractedControl[];
      }
      if (data.error) {
        toast({ title: "Controls unavailable", description: data.error, variant: "destructive" });
      }
      return [];
    } catch (err) {
      console.warn("fetchAllControls failed:", err);
      toast({
        title: "Could not load controls",
        description: "The API returned an error. If running locally, ensure MongoDB is reachable.",
        variant: "destructive",
      });
      return [];
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchQualityAnalysis = useCallback(async (
    controls: { control_id: string; name: string; description: string }[],
    allControls: ExtractedControl[] = [],
  ) => {
    if (controls.length === 0) return false;
    setQualityLoading(true);
    setQualityAnalysisRequested(true);
    setCtrlsW1H([]);
    try {
      const payloadControls = buildQualityPayloadControls(controls);
      const results: any[] = [];

      for (let i = 0; i < payloadControls.length; i += QUALITY_ANALYSIS_BATCH_SIZE) {
        const batch = payloadControls.slice(i, i + QUALITY_ANALYSIS_BATCH_SIZE);
        const res = await fetch("/api/controls-library/quality-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controls: batch }),
        });
        if (!res.ok) throw new Error(`Quality analysis HTTP ${res.status}`);
        const data = await res.json();
        results.push(...(data.results ?? []));
      }

      const ctrlMap = new Map(allControls.map(c => [c.control_id, c]));
      const merged: CtrlW1H[] = results.map((r: any) => {
        const ctrl = (ctrlMap.get(r.control_id) ?? {}) as Partial<ExtractedControl>;
        const qualityAvailable = !isUnavailableQualityResult(r);
        return {
          control_id: r.control_id,
          control_name: r.control_name ?? ctrl.control_name ?? r.control_id,
          description: ctrl.description ?? "",
          document_reference: ctrl.document_reference ?? "",
          domain: ctrl.domain ?? "",
          control_type: ctrl.control_type ?? "",
          keywords: ctrl.keywords ?? [],
          specificity_level: ctrl.specificity_level ?? "",
          mapped_obligations: ctrl.mapped_obligations ?? [],
          _source_filename: ctrl._source_filename,
          w1h: {
            who: r.who ?? false,
            what: r.what ?? false,
            where: r.where ?? false,
            how: r.how ?? false,
            when: r.when ?? false,
            why: r.why ?? false,
          },
          score: r.score ?? 0,
          rag: r.rag ?? "red",
          qualityAvailable,
          unavailableReason: qualityAvailable ? undefined : "Backend returned unavailable analysis.",
        } as CtrlW1H;
      });
      setCtrlsW1H(merged);
      return true;
    } catch (err) {
      console.warn("Quality analysis failed:", err);
      toast({
        title: "Quality analysis failed",
        description: err instanceof Error ? err.message : "Could not reach the analysis service.",
        variant: "destructive",
      });
      return false;
    } finally {
      setQualityLoading(false);
    }
  }, [toast]);

  const handleIngest = async () => {
    if (uploadFiles.length === 0) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      uploadFiles.forEach(f => formData.append("policy_files", f));
      const res = await fetch("/api/controls-library/ingest", { method: "POST", body: formData });
      const queued = await res.json();
      if (!res.ok) throw new Error(queued.detail?.error || "Ingest failed");

      const taskId = queued.task_id;
      let data: any;
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(`/api/ingest-task/${taskId}`);
        const task = await poll.json();
        if (task.status === "done") { data = task.result; break; }
        if (task.status === "failed") throw new Error(task.error || "Ingest failed");
      }

      const ingested: any[] = data.ingested || [];
      setIngestResults(ingested);
      setUploadFiles([]);
      setDashboardScope("all");
      await fetchDocs();
      refreshMetrics();

      const mongoFailed = ingested.some((r: any) => !r.mongo_saved);
      toast({
        title: "Extracted",
        description: mongoFailed
          ? `${data.total_ingested} document(s) processed. MongoDB save failed; controls visible this session only.`
          : `${data.total_ingested} document(s) added. ${data.merged_count} controls after deduplication.`,
        variant: mongoFailed ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Ingest failed", variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/controls-library/documents/${docId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setControlsDocs(prev => prev.filter(d => d.document_id !== docId));
      if (selectedDoc?.document_id === docId) {
        setSelectedDoc(null);
        setDashboardScope("all");
      }
      fetchAllControls();
      refreshMetrics();
      toast({ title: "Deleted", description: "Document removed from controls library" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handleClearLibrary = async () => {
    setClearingLibrary(true);
    setShowClearConfirm(false);
    try {
      const res = await fetch("/api/controls-library/all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Clear failed");
      setControlsDocs([]);
      setDashboardControls([]);
      setMergedControls(null);
      setSelectedDoc(null);
      setDocCache({});
      setDashboardScope("all");
      resetQualityAnalysis();
      refreshMetrics();
      toast({ title: "Library cleared", description: `${data.deleted_count} document(s) removed` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Clear failed", variant: "destructive" });
    } finally {
      setClearingLibrary(false);
    }
  };

  const runObligationMapping = async (showToast = true): Promise<ExtractedControl[]> => {
    setRemapping(true);
    try {
      const res = await fetch("/api/controls-library/remap-obligations", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Remap failed");
      setMergedControls(null);
      setDocCache({});
      setSelectedDoc(null);
      setDashboardScope("all");
      const freshControls = await fetchAllControls();
      refreshMetrics();
      if (showToast) {
        toast({ title: "Obligations mapped", description: `${data.controls_updated} controls updated across ${data.documents_processed} document(s).` });
      }
      return freshControls;
    } catch (err) {
      if (showToast) {
        toast({ title: "Remap failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      }
      throw err;
    } finally {
      setRemapping(false);
    }
  };

  const handleRemapObligations = async () => {
    try {
      await runObligationMapping(true);
    } catch {
      // Toast is handled by runObligationMapping.
    }
  };

  const handleRunAnalysis = async () => {
    if (controlsDocs.length === 0 || analysisRunning) return;
    setAnalysisRunning(true);
    try {
      const mappedControls = await runObligationMapping(false);
      const controlsForQuality = mappedControls.length > 0 ? mappedControls : dashboardControls;
      const qualityOk = await fetchQualityAnalysis(
        controlsForQuality.map(c => ({
          control_id: c.control_id ?? String((c as any).id ?? ""),
          name: (c as any).control_name ?? c.control_id ?? "",
          description: c.description ?? "",
        })),
        controlsForQuality,
      );
      if (qualityOk) {
        toast({
          title: "Analysis complete",
          description: "Obligation mapping and 5W1H quality scoring refreshed.",
        });
      }
    } catch (err) {
      toast({
        title: "Analysis failed",
        description: err instanceof Error ? err.message : "Could not complete the combined analysis.",
        variant: "destructive",
      });
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleDocClick = async (doc: ControlsDocument) => {
    if (selectedDoc?.document_id === doc.document_id) {
      setSelectedDoc(null);
      setDashboardScope("all");
      return;
    }
    if (docCache[doc.document_id]) {
      setSelectedDoc(docCache[doc.document_id]);
      setDashboardScope("selected-document");
      setControlsViewMode("document");
      setDomainFilter("all");
      setTypeFilter("all");
      setSearch("");
      return;
    }
    setDetailLoading(true);
    setDashboardScope("selected-document");
    setControlsViewMode("document");
    try {
      const res = await fetch(`/api/controls-library/documents/${doc.document_id}`);
      const data = await res.json();
      if (data.success && data.document) {
        const full = data.document as ControlsDocumentFull;
        setDocCache(prev => ({ ...prev, [doc.document_id]: full }));
        setSelectedDoc(full);
        setDomainFilter("all");
        setTypeFilter("all");
        setSearch("");
      } else {
        toast({ title: "Warning", description: "Could not load controls; showing summary only.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Warning", description: "Could not load controls.", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchMerged = async () => {
    setMergedLoading(true);
    setMergedControls(null);
    try {
      const res = await fetch("/api/controls-library/merged");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to fetch merged controls");
      setMergedControls(data.merged_controls || []);
      setControlsViewMode("merged");
      setDashboardScope("all");
      setDomainFilter("all");
      setTypeFilter("all");
      setSearch("");
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Merge failed", variant: "destructive" });
    } finally {
      setMergedLoading(false);
    }
  };

  const fetchMergedStats = async () => {
    setMergedStatsLoading(true);
    try {
      const res = await fetch("/api/controls-library/merged");
      const data = await res.json();
      if (data.merged_controls) {
        setMergedCtrlStats({ total_raw: dashboardControls.length, total_merged: data.merged_controls.length });
      }
    } catch {
      // Non-fatal: the main dashboard can still render without duplicate stats.
    } finally {
      setMergedStatsLoading(false);
    }
  };

  const allDomainCounts: Record<string, number> = {};
  let totalRawControls = 0;
  for (const doc of controlsDocs) {
    totalRawControls += doc.total_controls ?? 0;
    for (const [domain, count] of Object.entries(doc.controls_by_domain ?? {})) {
      allDomainCounts[domain] = (allDomainCounts[domain] ?? 0) + count;
    }
  }

  const sortedDomains = Object.entries(allDomainCounts).sort((a, b) => b[1] - a[1]);
  const allDomainNames = sortedDomains.map(([domain]) => domain);
  const isSelectedScope = dashboardScope === "selected-document" && !!selectedDoc;
  const scopedControls: ExtractedControl[] = isSelectedScope ? (selectedDoc?.controls ?? []) : dashboardControls;
  const scopedDocumentCount = isSelectedScope ? 1 : controlsDocs.length;
  const scopedTotalControls = isSelectedScope ? (selectedDoc?.total_controls ?? scopedControls.length) : totalRawControls;
  const scopedControlIds = new Set(scopedControls.map(c => c.control_id));

  const scopedDomainCounts: Record<string, number> = isSelectedScope
    ? { ...(selectedDoc?.controls_by_domain ?? {}) }
    : { ...allDomainCounts };
  if (Object.keys(scopedDomainCounts).length === 0 && scopedControls.length > 0) {
    for (const ctrl of scopedControls) {
      scopedDomainCounts[ctrl.domain] = (scopedDomainCounts[ctrl.domain] ?? 0) + 1;
    }
  }
  const scopedSortedDomains = Object.entries(scopedDomainCounts).sort((a, b) => b[1] - a[1]);
  const scopedMaxDomainCount = scopedSortedDomains[0]?.[1] ?? 1;

  const activeControls: (ExtractedControl | MergedControl)[] =
    controlsViewMode === "merged" ? (mergedControls ?? []) : scopedControls;
  const allActiveControlDomains = Array.from(new Set(activeControls.map(c => c.domain).filter(Boolean)));
  const allActiveControlTypes = Array.from(new Set(activeControls.map(c => c.control_type).filter(Boolean)));

  const filteredControls = activeControls.filter(c =>
    (domainFilter === "all" || c.domain === domainFilter) &&
    (typeFilter === "all" || c.control_type === typeFilter) &&
    (search === "" ||
      c.control_id.toLowerCase().includes(search.toLowerCase()) ||
      c.control_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.document_reference.toLowerCase().includes(search.toLowerCase()))
  );

  const scopedQualityResults = isSelectedScope
    ? ctrlsW1H.filter(c => scopedControlIds.has(c.control_id))
    : ctrlsW1H;
  const availableQualityResults = scopedQualityResults.filter(c => c.qualityAvailable);
  const qualityResultsAvailable = qualityAnalysisRequested && availableQualityResults.length > 0;
  const qualityResultsForMetrics = qualityResultsAvailable ? availableQualityResults : [];
  const qualityUnavailableCount = qualityAnalysisRequested ? Math.max(0, scopedQualityResults.length - availableQualityResults.length) : 0;
  const qualityUnavailableCopy = "Data not available until quality analysis runs.";
  const qualityUnavailableAnalysisCopy = `${qualityUnavailableCount} controls could not be scored because quality analysis returned unavailable results. They are excluded from these charts.`;
  const ragCounts = { green: 0, amber: 0, red: 0 };
  const w1hTotals: Record<keyof W1HResult, number> = { who: 0, what: 0, where: 0, how: 0, when: 0, why: 0 };
  const domainRag: Record<string, { green: number; amber: number; red: number }> = {};
  for (const c of qualityResultsForMetrics) {
    ragCounts[c.rag]++;
    for (const k of W1H_KEYS) if (c.w1h[k]) w1hTotals[k]++;
    if (!domainRag[c.domain]) domainRag[c.domain] = { green: 0, amber: 0, red: 0 };
    domainRag[c.domain][c.rag]++;
  }
  const avgScore = qualityResultsForMetrics.length > 0
    ? qualityResultsForMetrics.reduce((sum, c) => sum + c.score, 0) / qualityResultsForMetrics.length
    : 0;
  const requiresImprovementCount = ragCounts.amber + ragCounts.red;
  const requiresImprovementPct = percent(requiresImprovementCount, qualityResultsForMetrics.length);

  const w1hPrevalenceData = W1H_KEYS
    .map(k => ({ element: k.toUpperCase(), count: w1hTotals[k], fill: W1H_COLORS[k] }))
    .sort((a, b) => b.count - a.count);
  const domainRagData = Object.entries(domainRag)
    .map(([domain, counts]) => ({ domain: formatDomainName(domain), ...counts, total: counts.green + counts.amber + counts.red }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const ragDonutData = [
    { name: "Green (0-1 missing)", value: ragCounts.green, color: RAG_COLOR.green },
    { name: "Amber (2 missing)", value: ragCounts.amber, color: RAG_COLOR.amber },
    { name: "Red (3+ missing)", value: ragCounts.red, color: RAG_COLOR.red },
  ].filter(d => d.value > 0);

  const oblMappedCount = scopedControls.filter(c => (c.mapped_obligations?.length ?? 0) > 0).length;
  const oblCoveragePct = percent(oblMappedCount, scopedControls.length);
  const allOblScores = scopedControls.flatMap(c => (c.mapped_obligations ?? []).map(o => o.match_score ?? 0));
  const avgOblMatchScore = allOblScores.length > 0 ? allOblScores.reduce((a, b) => a + b, 0) / allOblScores.length : 0;
  const qualityDuplicates = !isSelectedScope && mergedCtrlStats ? Math.max(0, mergedCtrlStats.total_raw - mergedCtrlStats.total_merged) : null;
  const duplicateDetail = !isSelectedScope && mergedCtrlStats
    ? `${mergedCtrlStats.total_raw} raw -> ${mergedCtrlStats.total_merged} merged`
    : isSelectedScope
      ? "calculated on all uploaded database"
      : mergedStatsLoading ? "computing..." : "click Merged to compute";

  const filteredQuality = qualityResultsForMetrics.filter(c =>
    (qualityRagFilter === "all" || c.rag === qualityRagFilter) &&
    (domainFilter === "all" || c.domain === domainFilter) &&
    (typeFilter === "all" || c.control_type === typeFilter) &&
    (qualitySearch === "" ||
      c.control_id.toLowerCase().includes(qualitySearch.toLowerCase()) ||
      c.control_name.toLowerCase().includes(qualitySearch.toLowerCase()) ||
      c.domain.toLowerCase().includes(qualitySearch.toLowerCase()))
  );

  const dashboardControlsFiltered = scopedControls.filter(c =>
    (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
    (dashboardSearch === "" ||
      c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
      c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
      c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
  );

  const selectedScopeLabel = isSelectedScope ? selectedDoc?.source_filename ?? "Selected Document" : "All Uploaded Database";

  return (
    <div className="trace-workbench-shell h-full min-h-0 overflow-auto bg-[#F0F2F7] text-[#0C233C]">
      <HeroSection
        title="Controls Library"
        subtitle="Browse, filter, and analyse enterprise security controls from the uploaded policy corpus."
        icon={ShieldCheck}
      />

      <main className="max-w-[1200px] mx-auto px-8 md:px-12 py-12 pb-24">
        <section className="mb-9">
          <SectionHeader
            label="Data Inputs"
            title="Upload Policy Documents"
            actions={
              <button
                type="button"
                className="rounded-xl border border-[#E2E6EF] bg-white p-2 text-[#8492A6] transition-colors hover:text-[#0C233C]"
                onClick={() => setUploadOpen(open => !open)}
                aria-label="Toggle upload section"
              >
                <ChevronDown className={`h-5 w-5 transition-transform ${uploadOpen ? "" : "-rotate-90"}`} />
              </button>
            }
          />

          {uploadOpen && (
            <div
              data-controls-library-upload-bar="true"
              className="mt-6 grid gap-6 rounded-2xl border border-dashed border-[#009A44] bg-white p-6 shadow-sm lg:grid-cols-[1fr_1.3fr_1fr]"
            >
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#1E49E2]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Policy Documents</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">PDF / Word / Excel / CSV / TXT / MD / Image</p>
                  <p className="mt-5 text-[13px] leading-relaxed text-[#5A6478]">
                    Upload one or more company policy documents. TRACE will extract controls, classify them by domain, and map each one to regulatory obligations.
                  </p>
                </div>
              </div>

              <div
                className={`flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                  uploadFiles.length > 0 ? "border-[#1E49E2] bg-[#EEF2FF]" : "border-[#E2E6EF] hover:border-[#1E49E2]"
                }`}
                onClick={() => document.getElementById("ctrl-file-input")?.click()}
              >
                <input
                  id="ctrl-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) setUploadFiles(prev => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
                <Upload className="h-9 w-9 text-[#1E49E2]" />
                <p className="mt-3 text-[15px] font-bold text-[#0C233C]">Click to browse</p>
                <p className="mt-1 text-[12px] text-[#8492A6]">PDF, Word, TXT, MD, Excel, CSV or image</p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EEF2FF] px-4 py-2 text-[13px] font-bold text-[#1E49E2]">
                  <Upload className="h-4 w-4" />
                  Choose File
                </span>
              </div>

              <div className="rounded-2xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                {uploadFiles.length === 0 ? (
                  <div className="flex h-full min-h-[150px] flex-col items-center justify-center text-center">
                    <FileText className="h-10 w-10 text-[#C8D0DD]" />
                    <p className="mt-3 text-[13px] font-bold text-[#5A6478]">No files queued</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#8492A6]">Selected files will appear here before extraction</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">
                      {uploadFiles.length} file{uploadFiles.length !== 1 ? "s" : ""} queued
                    </p>
                    <div className="max-h-28 space-y-2 overflow-auto pr-1">
                      {uploadFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl border border-[#E2E6EF] bg-white px-3 py-2 text-[12px]">
                          <FileText className="h-4 w-4 shrink-0 text-[#8492A6]" />
                          <span className="min-w-0 flex-1 truncate text-[#0C233C]">{file.name}</span>
                          <button
                            type="button"
                            className="text-[#8492A6] hover:text-[#E5001B]"
                            onClick={event => {
                              event.stopPropagation();
                              setUploadFiles(prev => prev.filter((_, i) => i !== index));
                            }}
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <TraceButton
                      active
                      disabled={ingesting}
                      className="w-full"
                      onClick={handleIngest}
                    >
                      {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {ingesting ? "Extracting..." : "Extract Controls"}
                    </TraceButton>
                  </div>
                )}

                {ingestResults.length > 0 && (
                  <div className="mt-4 border-t border-[#E2E6EF] pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#009A44]">Recently Added</p>
                    <div className="mt-2 space-y-2">
                      {ingestResults.map((result, index) => (
                        <div key={index} className="rounded-xl border border-[#009A44]/40 bg-[#EDFBF5] px-3 py-2">
                          <p className="truncate text-[12px] font-bold text-[#0C233C]">{result.filename}</p>
                          <StatusPill color="#009A44">{result.total_controls} controls</StatusPill>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="mb-9">
          <SectionHeader
            label="Knowledge Base"
            title="Documents"
            actions={
              <div data-controls-library-actions="true" className="flex flex-wrap items-center justify-end gap-2">
                <TraceButton active={controlsViewMode === "document"} onClick={() => { setControlsViewMode("document"); setDashboardScope("all"); }}>
                  <BookOpen className="h-4 w-4" />
                  Dashboard
                </TraceButton>
                <TraceButton disabled={controlsDocs.length === 0 || mergedLoading} active={controlsViewMode === "merged"} onClick={fetchMerged}>
                  {mergedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                  Merged
                </TraceButton>
                <TraceButton disabled={docsLoading} onClick={fetchDocs} title="Refresh documents">
                  <RotateCcw className={`h-4 w-4 ${docsLoading ? "animate-spin" : ""}`} />
                </TraceButton>
                <TraceButton active disabled={analysisRunning || remapping || qualityLoading || controlsDocs.length === 0} onClick={handleRunAnalysis}>
                  {analysisRunning || remapping || qualityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run Analysis
                </TraceButton>
              </div>
            }
          />

          {showClearConfirm && (
            <div className="mt-4 rounded-2xl border border-[#E5001B]/40 bg-[#FEEBED] p-4">
              <p className="text-[13px] font-bold text-[#E5001B]">Clear entire controls library?</p>
              <p className="mt-1 text-[12px] text-[#5A6478]">This permanently deletes all {controlsDocs.length} document(s) and extracted controls.</p>
              <div className="mt-3 flex gap-2">
                <TraceButton active disabled={clearingLibrary} onClick={handleClearLibrary}>
                  {clearingLibrary ? "Clearing..." : "Yes, clear all"}
                </TraceButton>
                <TraceButton onClick={() => setShowClearConfirm(false)}>Cancel</TraceButton>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
            {docsLoading ? (
              <div className="flex min-h-[170px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#1E49E2]" />
              </div>
            ) : controlsDocs.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E6EF] text-center">
                <BookOpen className="h-12 w-12 text-[#C8D0DD]" />
                <p className="mt-4 text-[14px] font-bold text-[#5A6478]">No documents yet</p>
                <p className="mt-1 text-[13px] text-[#8492A6]">Upload a policy document above to populate the library</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {controlsDocs.map(doc => {
                  const isSelected = selectedDoc?.document_id === doc.document_id;
                  const topDomains = Object.entries(doc.controls_by_domain ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);

                  return (
                    <button
                      type="button"
                      key={doc.document_id}
                      className={`rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        isSelected ? "border-[#1E49E2] bg-[#EEF2FF]" : "border-[#E2E6EF] bg-white"
                      }`}
                      onClick={() => handleDocClick(doc)}
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="mt-1 h-5 w-5 shrink-0 text-[#8492A6]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-bold text-[#0C233C]">{doc.source_filename}</p>
                          <p className="mt-1 text-[12px] text-[#8492A6]">{doc.total_controls} controls extracted</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg p-1 text-[#E5001B] hover:bg-[#FEEBED]"
                          onClick={event => {
                            event.stopPropagation();
                            handleDelete(doc.document_id);
                          }}
                          aria-label={`Delete ${doc.source_filename}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusPill color="#0C233C">{doc.total_controls} controls</StatusPill>
                        {topDomains.map(([domain, count]) => {
                          const color = domainColor(domain, allDomainNames);
                          return (
                            <span
                              key={domain}
                              className="rounded-full border px-3 py-1 text-[11px] font-semibold capitalize"
                              style={{
                                borderColor: `${color}55`,
                                color,
                                background: `${color}12`,
                              }}
                            >
                              {formatDomainName(domain)} - {count}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {controlsDocs.length > 0 && (
              <div className="mt-4 flex justify-end">
                <TraceButton disabled={clearingLibrary} onClick={() => setShowClearConfirm(true)}>
                  <Trash2 className="h-4 w-4" />
                  Clear Library
                </TraceButton>
              </div>
            )}
          </div>
        </section>

        <section className="mb-9">
          <SectionHeader label="Controls Library" title="Library Dashboard" />
          <div data-controls-library-scope="true" className="mt-6 rounded-2xl border border-[#E2E6EF] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#8492A6]">Metric Scope</p>
                <p className="mt-1 text-[13px] text-[#5A6478]">Metrics, charts, and table rows reflect the selected scope.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <TraceButton active={dashboardScope === "all"} onClick={() => setDashboardScope("all")}>
                  All Uploaded Database
                </TraceButton>
                <TraceButton
                  active={dashboardScope === "selected-document"}
                  disabled={!selectedDoc}
                  onClick={() => selectedDoc && setDashboardScope("selected-document")}
                >
                  Selected Document{selectedDoc ? `: ${selectedDoc.source_filename}` : ""}
                </TraceButton>
              </div>
            </div>
          </div>

          {controlsDocs.length === 0 ? (
            <div className="mt-6 flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E6EF] bg-white text-center shadow-sm">
              <ShieldCheck className="h-12 w-12 text-[#C8D0DD]" />
              <p className="mt-4 text-[14px] font-bold text-[#5A6478]">No policy documents ingested yet</p>
              <p className="mt-1 text-[13px] text-[#8492A6]">Upload a company policy document to extract controls</p>
            </div>
          ) : (
            <div data-controls-library-unified-dashboard="true" className="mt-6 space-y-5">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Documents" value={scopedDocumentCount} detail={isSelectedScope ? selectedScopeLabel : "uploaded policy files"} accent="#00338D" />
                <KpiCard label="Total Controls" value={scopedTotalControls} detail={controlsViewMode === "merged" ? "raw control inventory" : "extracted controls"} accent="#1E49E2" />
                <KpiCard label="Domains Covered" value={scopedSortedDomains.length} detail="security domains in scope" accent="#00B8F5" />
                <KpiCard label="Controls Mapped" value={`${oblMappedCount}/${scopedControls.length || 0}`} detail={`${oblCoveragePct.toFixed(1)}% controls-obligations coverage`} accent="#009A44" progress={oblCoveragePct} />
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Avg 5W1H Score"
                  value={qualityResultsAvailable ? `${avgScore.toFixed(2)}/6` : <span className="block text-[18px] leading-tight">Data not available</span>}
                  detail={qualityResultsAvailable ? "mean elements present" : qualityUnavailableCopy}
                  accent={qualityResultsAvailable ? (avgScore >= 5 ? "#009A44" : avgScore >= 4 ? "#EAAA00" : "#E5001B") : "#8492A6"}
                  progress={qualityResultsAvailable ? (avgScore / 6) * 100 : undefined}
                />
                <KpiCard
                  label="Requires Improvement"
                  value={qualityResultsAvailable ? requiresImprovementCount : <span className="block text-[18px] leading-tight">Data not available</span>}
                  detail={qualityResultsAvailable ? `${requiresImprovementPct.toFixed(1)}% amber + red controls` : qualityUnavailableCopy}
                  accent={qualityResultsAvailable ? "#E5001B" : "#8492A6"}
                  progress={qualityResultsAvailable ? requiresImprovementPct : undefined}
                />
                <KpiCard
                  label="Green - No Action"
                  value={qualityResultsAvailable ? ragCounts.green : <span className="block text-[18px] leading-tight">Data not available</span>}
                  detail={qualityResultsAvailable ? `${percent(ragCounts.green, qualityResultsForMetrics.length).toFixed(1)}% of scope` : qualityUnavailableCopy}
                  accent={qualityResultsAvailable ? "#009A44" : "#8492A6"}
                />
                <KpiCard label="Potential Duplicates" value={qualityDuplicates !== null ? qualityDuplicates : "-"} detail={duplicateDetail} accent="#EAAA00" />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-bold text-[#0C233C]">Domain Distribution</h3>
                      <p className="mt-1 text-[13px] text-[#8492A6]">Click a bar to filter controls below</p>
                    </div>
                    {dashboardDomainFilter !== "all" && (
                      <TraceButton onClick={() => { setDashboardDomainFilter("all"); setDomainFilter("all"); }}>Clear Filter</TraceButton>
                    )}
                  </div>
                  <div className="mt-6 space-y-3">
                    {scopedSortedDomains.map(([domain, count], index) => {
                      const color = TRACE_GRAPH_COLORS[index % TRACE_GRAPH_COLORS.length];
                      const width = percent(count, scopedMaxDomainCount);
                      const active = dashboardDomainFilter === domain;
                      return (
                        <button
                          type="button"
                          key={domain}
                          className={`grid w-full grid-cols-[160px_1fr_44px] items-center gap-4 rounded-xl px-3 py-2 text-left transition-colors ${
                            active ? "bg-[#EEF2FF]" : "hover:bg-[#F0F2F7]"
                          }`}
                          onClick={() => {
                            const next = active ? "all" : domain;
                            setDashboardDomainFilter(next);
                            setDomainFilter(next);
                          }}
                        >
                          <span className="text-[13px] font-bold capitalize" style={{ color }}>
                            {formatDomainName(domain)}
                          </span>
                          <span className="h-4 overflow-hidden rounded-full bg-[#E2E6EF]">
                            <span
                              className="block h-full rounded-full transition-all duration-500"
                              style={{ width: `${width}%`, background: color }}
                            />
                          </span>
                          <span className="text-right text-[13px] font-bold text-[#0C233C]">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Controls-Obligations Coverage</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">{selectedScopeLabel}</p>
                  <div className="mt-8 flex items-center gap-8">
                    <div className="relative h-36 w-36 shrink-0">
                      <svg viewBox="0 0 120 120" className="h-full w-full">
                        <circle cx="60" cy="60" r="48" fill="none" stroke="#E2E6EF" strokeWidth="14" />
                        <circle
                          cx="60"
                          cy="60"
                          r="48"
                          fill="none"
                          stroke="#009A44"
                          strokeWidth="14"
                          strokeLinecap="round"
                          strokeDasharray={`${Math.max(0, Math.min(100, oblCoveragePct)) * 3.015} 301.5`}
                          transform="rotate(-90 60 60)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[26px] font-bold text-[#0C233C]">{oblCoveragePct.toFixed(1)}%</span>
                        <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#8492A6]">Mapped</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#5A6478]">Mapped Controls</span>
                        <strong>{oblMappedCount}</strong>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#5A6478]">Unmapped Controls</span>
                        <strong>{Math.max(0, scopedControls.length - oblMappedCount)}</strong>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#5A6478]">Obligation Links</span>
                        <strong>{allOblScores.length}</strong>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-[#5A6478]">Avg Match Score</span>
                        <strong>{avgOblMatchScore.toFixed(3)}/1.0</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mb-9">
          <SectionHeader
            label="Distribution"
            title="5W1H Quality Charts"
          />

          <div data-controls-library-quality-charts="true" className="mt-6">
            {qualityLoading ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
                <Loader2 className="h-10 w-10 animate-spin text-[#1E49E2]" />
                <p className="mt-4 text-[14px] font-bold text-[#5A6478]">Running 5W1H analysis...</p>
              </div>
            ) : !qualityResultsAvailable ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E6EF] bg-white text-center shadow-sm">
                <Activity className="h-12 w-12 text-[#C8D0DD]" />
                <p className="mt-4 text-[14px] font-bold text-[#5A6478]">Data not available</p>
                <p className="mt-1 text-[13px] text-[#8492A6]">Use Run Analysis to map obligations and populate these quality metrics.</p>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">RAG Distribution</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Quality rating across {qualityResultsForMetrics.length} controls</p>
                  {qualityUnavailableCount > 0 && (
                    <p className="mt-1 text-[12px] font-bold text-[#8492A6]">{qualityUnavailableAnalysisCopy}</p>
                  )}
                  <div className="relative mt-4">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={ragDonutData} cx="50%" cy="50%" innerRadius={68} outerRadius={92} dataKey="value" strokeWidth={4} stroke="#FFFFFF">
                          {ragDonutData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [value, "Controls"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[26px] font-bold text-[#0C233C]">{qualityResultsForMetrics.length}</span>
                      <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#8492A6]">Controls</span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {ragDonutData.map(entry => (
                      <div key={entry.name} className="flex items-center gap-2 text-[13px]">
                        <span className="h-3 w-3 rounded-full" style={{ background: entry.color }} />
                        <span className="flex-1 text-[#5A6478]">{entry.name}</span>
                        <strong>{entry.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">5W1H Element Prevalence</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Controls with each element present</p>
                  <div className="mt-5">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={w1hPrevalenceData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                        <XAxis type="number" domain={[0, qualityResultsForMetrics.length]} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="element" tick={{ ...CHART_AXIS_TICK, fontWeight: 700 }} tickLine={false} axisLine={false} width={48} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(value: number) => [value, "Controls"]} />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                          {w1hPrevalenceData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Quality RAG by Process Area</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Controls are grouped by their extracted domain tag.</p>
                  <ProcessAreaRagBars data={domainRagData} />
                  <div className="mt-4 flex flex-wrap gap-4 text-[12px] font-bold text-[#5A6478]">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#009A44]" />Green</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#EAAA00]" />Amber</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#E5001B]" />Red</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mb-12">
          <SectionHeader
            label="Control Detail"
            title="5W1H Scores by Control"
            actions={
              <TraceButton active disabled={!qualityResultsAvailable} onClick={() => exportQualityCSV(filteredQuality)}>
                <Download className="h-4 w-4" />
                Export CSV
              </TraceButton>
            }
          />

          <div data-controls-library-quality-table="true" className="mt-6 rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
            <div className="border-b border-[#E2E6EF] p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(["all", "red", "amber", "green"] as const).map(filter => (
                    <button
                      key={filter}
                      type="button"
                      disabled={!qualityResultsAvailable && filter !== "all"}
                      className={`rounded-full border px-4 py-2 text-[13px] font-bold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                        qualityRagFilter === filter
                          ? filter === "all"
                            ? "border-[#00338D] bg-[#00338D] text-white"
                            : "border-transparent text-white"
                          : "border-[#E2E6EF] bg-white text-[#8492A6] hover:text-[#0C233C]"
                      }`}
                      style={qualityRagFilter === filter && filter !== "all" ? { background: RAG_COLOR[filter] } : {}}
                      onClick={() => setQualityRagFilter(filter)}
                    >
                      {filter === "all" ? `All (${qualityResultsAvailable ? qualityResultsForMetrics.length : filteredControls.length})` : `${filter} (${ragCounts[filter]})`}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8492A6]" />
                    <input
                      className="h-10 w-56 rounded-xl border border-[#E2E6EF] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#1E49E2]"
                      placeholder="Search controls..."
                      value={qualitySearch}
                      onChange={event => {
                        setQualitySearch(event.target.value);
                        setSearch(event.target.value);
                      }}
                    />
                  </div>
                  <select
                    className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                    value={domainFilter}
                    onChange={event => setDomainFilter(event.target.value)}
                  >
                    <option value="all">All Domains</option>
                    {allActiveControlDomains.map(domain => (
                      <option key={domain} value={domain}>{formatDomainName(domain)}</option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]"
                    value={typeFilter}
                    onChange={event => setTypeFilter(event.target.value)}
                  >
                    <option value="all">All Types</option>
                    {allActiveControlTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {(domainFilter !== "all" || typeFilter !== "all" || qualitySearch || dashboardDomainFilter !== "all") && (
                    <button
                      type="button"
                      className="text-[13px] font-bold text-[#1E49E2] hover:underline"
                      onClick={() => {
                        setDomainFilter("all");
                        setTypeFilter("all");
                        setQualitySearch("");
                        setSearch("");
                        setDashboardDomainFilter("all");
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[12px] text-[#8492A6]">
                Scope: {selectedScopeLabel}. {controlsViewMode === "merged" ? "Merged view is active." : "Document controls are shown."}
                {qualityUnavailableCount > 0 ? ` ${qualityUnavailableAnalysisCopy}` : !qualityResultsAvailable ? ` ${qualityUnavailableCopy}` : ""}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-[12px]">
                <thead>
                  <tr className="border-b border-[#E2E6EF] bg-[#F8FAFD] text-[#8492A6]">
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Control ID</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Control Text</th>
                    <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Process Area</th>
                    {W1H_KEYS.map(key => (
                      <th key={key} className="px-2 py-3 text-center font-bold uppercase tracking-[1.5px]" style={{ color: W1H_COLORS[key] }}>
                        {key.toUpperCase()}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-bold uppercase tracking-[1.5px]">Score</th>
                    <th className="px-3 py-3 text-center font-bold uppercase tracking-[1.5px]">RAG</th>
                    <th className="px-3 py-3 text-center font-bold uppercase tracking-[1.5px]">Obligations</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityResultsAvailable ? (
                    filteredQuality.length > 0 ? (
                      filteredQuality.slice(0, 200).map((control, index) => (
                      <tr key={control.control_id ?? index} className="border-b border-[#E2E6EF] last:border-0 hover:bg-[#F8FAFD]">
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            className="font-mono text-[12px] font-bold text-[#00338D] hover:underline"
                            onClick={() => setSelectedQualityControl(control)}
                          >
                            {control.control_id}
                          </button>
                        </td>
                        <td className="max-w-[360px] px-4 py-4 text-[#0C233C]">
                          <span className="line-clamp-2" title={control.control_name}>{control.control_name}</span>
                        </td>
                        <td className="px-4 py-4 capitalize text-[#5A6478]">{formatDomainName(control.domain)}</td>
                        {W1H_KEYS.map(key => (
                          <td key={key} className="px-2 py-4 text-center">
                            <span
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold"
                              style={{
                                color: control.w1h[key] ? W1H_COLORS[key] : "#8492A6",
                                background: control.w1h[key] ? `${W1H_COLORS[key]}18` : "#F0F2F7",
                              }}
                            >
                              {control.w1h[key] ? "Y" : "N"}
                            </span>
                          </td>
                        ))}
                        <td className="px-3 py-4 text-center font-bold text-[#0C233C]">{control.score}/6</td>
                        <td className="px-3 py-4 text-center">
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${RAG_BG[control.rag]}`}>
                            {control.rag.charAt(0).toUpperCase() + control.rag.slice(1)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-center">
                          <button
                            type="button"
                            className="rounded-full border border-[#E2E6EF] px-3 py-1 text-[11px] font-bold text-[#00338D] hover:border-[#1E49E2]"
                            onClick={() => setSelectedQualityControl(control)}
                          >
                            {control.mapped_obligations?.length ?? 0}
                          </button>
                        </td>
                      </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={12} className="px-4 py-10 text-center text-[13px] text-[#8492A6]">
                          No controls match the current quality filters.
                        </td>
                      </tr>
                    )
                  ) : (
                    filteredControls.slice(0, 200).map((control, index) => (
                      <tr key={control.control_id ?? index} className="border-b border-[#E2E6EF] last:border-0 hover:bg-[#F8FAFD]">
                        <td className="px-4 py-4 font-mono text-[12px] font-bold text-[#00338D]">{control.control_id}</td>
                        <td className="max-w-[420px] px-4 py-4 text-[#0C233C]">
                          <span className="line-clamp-2" title={control.control_name}>{control.control_name}</span>
                        </td>
                        <td className="px-4 py-4 capitalize text-[#5A6478]">{formatDomainName(control.domain)}</td>
                        <td className="px-2 py-4 text-center font-bold text-[#8492A6]" colSpan={6}>Data not available</td>
                        <td className="px-3 py-4 text-center">-</td>
                        <td className="px-3 py-4 text-center">-</td>
                        <td className="px-3 py-4 text-center">{control.mapped_obligations?.length ?? 0}</td>
                      </tr>
                    ))
                  )}
                  {!qualityResultsAvailable && filteredControls.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-[13px] text-[#8492A6]">
                        {dashboardLoading || detailLoading ? "Loading controls..." : "No controls match the current filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {((qualityResultsAvailable && filteredQuality.length > 200) || (!qualityResultsAvailable && filteredControls.length > 200)) && (
                <p className="border-t border-[#E2E6EF] py-3 text-center text-[12px] text-[#8492A6]">
                  Showing 200 rows. Use Export CSV for full quality data.
                </p>
              )}
            </div>
          </div>

          {dashboardControlsFiltered.length > 0 && dashboardSearch && (
            <div className="mt-4 rounded-2xl border border-[#E2E6EF] bg-white p-4 text-[13px] text-[#5A6478] shadow-sm">
              Search matched {dashboardControlsFiltered.length} control(s) in the current dashboard scope.
            </div>
          )}
        </section>
      </main>

      {selectedQualityControl && (
        <Dialog open={!!selectedQualityControl} onOpenChange={open => { if (!open) setSelectedQualityControl(null); }}>
          <DialogContent
            data-controls-library-detail-modal="true"
            className="max-h-[85vh] max-w-3xl overflow-y-auto border border-[#E2E6EF] bg-white p-0 text-[#0C233C] shadow-2xl"
          >
            <DialogHeader className="border-b border-[#E2E6EF] px-6 py-5 text-left">
              <div className="flex items-start gap-4 pr-8">
                <code className="mt-0.5 shrink-0 rounded-lg border border-[#1E49E2]/30 bg-[#EEF2FF] px-3 py-1.5 font-mono text-[12px] font-bold text-[#00338D]">
                  {selectedQualityControl.control_id}
                </code>
                <div className="min-w-0">
                  <DialogTitle className="text-[20px] font-bold leading-snug tracking-tight text-[#0C233C]">
                    {selectedQualityControl.control_name}
                  </DialogTitle>
                  <p className="mt-2 text-[12px] text-[#8492A6]">
                    {formatDomainName(selectedQualityControl.domain)} / {selectedQualityControl.control_type || "Unclassified"}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 px-6 py-6">
              <div className="rounded-2xl border border-[#EAAA00]/40 bg-[#FFFBEB] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#9C6500]">Citation</p>
                <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-[110px_1fr]">
                  <span className="font-bold text-[#5A6478]">Document</span>
                  <span className="font-mono font-bold text-[#0C233C]">{selectedQualityControl._source_filename ?? "-"}</span>
                  {selectedQualityControl.document_reference && (
                    <>
                      <span className="font-bold text-[#5A6478]">Reference</span>
                      <span className="font-mono font-bold text-[#0C233C]">{selectedQualityControl.document_reference}</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-[#00338D]">Description</p>
                <p className="text-[14px] leading-relaxed text-[#0C233C]">{selectedQualityControl.description || "No description available."}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-3 py-1 text-[11px] font-bold capitalize text-[#5A6478]">
                  {selectedQualityControl.control_type || "Unclassified"}
                </span>
                <span className="rounded-full border border-[#1E49E2]/25 bg-[#EEF2FF] px-3 py-1 text-[11px] font-bold capitalize text-[#00338D]">
                  {formatDomainName(selectedQualityControl.domain)}
                </span>
                {selectedQualityControl.specificity_level && (
                  <span className="rounded-full border border-[#E2E6EF] bg-white px-3 py-1 text-[11px] font-bold text-[#8492A6]">
                    {selectedQualityControl.specificity_level}
                  </span>
                )}
                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${RAG_BG[selectedQualityControl.rag]}`}>
                  {selectedQualityControl.rag.charAt(0).toUpperCase() + selectedQualityControl.rag.slice(1)}
                </span>
              </div>

              {selectedQualityControl.keywords?.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-[#00338D]">Keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedQualityControl.keywords.map(keyword => (
                      <span key={keyword} className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-3 py-1 text-[11px] font-semibold text-[#5A6478]">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[2px] text-[#00338D]">5W1H Quality</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {W1H_KEYS.map(key => (
                    <span
                      key={key}
                      className="flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-bold"
                      style={selectedQualityControl.w1h[key]
                        ? { borderColor: `${W1H_COLORS[key]}55`, color: W1H_COLORS[key], background: `${W1H_COLORS[key]}12` }
                        : { borderColor: "#E2E6EF", color: "#8492A6", background: "#F0F2F7" }
                      }
                    >
                      <span>{key.toUpperCase()}</span>
                      <span>{selectedQualityControl.w1h[key] ? "Y" : "N"}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-[#E2E6EF] bg-white px-4 py-3 text-[13px] font-bold text-[#0C233C]">
                  Score: {selectedQualityControl.score}/6
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[2px] text-[#00338D]">
                  Mapped Obligations ({selectedQualityControl.mapped_obligations?.length ?? 0})
                </p>
                {selectedQualityControl.mapped_obligations?.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedQualityControl.mapped_obligations.map((obligation, index) => (
                      <div key={index} className="rounded-xl border border-[#E2E6EF] bg-white p-3 text-[12px]">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="font-mono text-[11px] font-bold text-[#00338D] hover:underline"
                            onClick={() => handleObligationClick(obligation.obligation_id)}
                          >
                            {obligation.obligation_id}
                          </button>
                          <span className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-2 py-0.5 text-[10px] font-bold text-[#5A6478]">
                            {obligation.enforcement_level}
                          </span>
                          <span className="ml-auto text-[10px] font-bold text-[#8492A6]">{obligation.framework_name}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 leading-relaxed text-[#5A6478]">{obligation.obligation_text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#E2E6EF] bg-[#F0F2F7] px-4 py-5 text-center text-[13px] font-bold text-[#8492A6]">
                    Data not available
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}

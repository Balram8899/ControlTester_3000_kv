import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, X, Play, RotateCcw, Search, Trash2, ShieldCheck,
  LayoutDashboard, List, ChevronDown, ChevronRight, BookOpen,
  FileText, Link2, Layers, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ── Colors ───────────────────────────────────────────────────────────────────

const HUES = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];

const CONTROL_TYPE_COLOR: Record<string, string> = {
  preventive:   "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
  detective:    "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  corrective:   "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300",
  directive:    "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300",
  compensating: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

const ENFORCEMENT_COLOR: Record<string, string> = {
  mandatory:   "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
  recommended: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  optional:    "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

function domainHue(domain: string, allDomains: string[]): number {
  const idx = allDomains.indexOf(domain);
  return HUES[idx % HUES.length];
}

// ── TypeScript interfaces ─────────────────────────────────────────────────────

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

type RightPanelView = "dashboard" | "controls";
type ControlsViewMode = "document" | "merged";

// ── Control Card ─────────────────────────────────────────────────────────────

function ControlCard({
  ctrl,
  allDomains,
  isMerged = false,
}: {
  ctrl: ExtractedControl | MergedControl;
  allDomains: string[];
  isMerged?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [oblExpanded, setOblExpanded] = useState(false);
  const hue = domainHue(ctrl.domain, allDomains);
  const mergedCtrl = ctrl as MergedControl;

  return (
    <div className="border rounded-lg overflow-hidden transition-all duration-200 hover:border-primary/40">
      {/* Header bar */}
      <div
        className="flex items-start gap-2 p-3 cursor-pointer"
        style={{ borderLeft: `3px solid hsl(${hue},70%,50%)` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <code className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1">{ctrl.control_id}</code>
            <Badge
              variant="outline"
              className={`text-[10px] ${CONTROL_TYPE_COLOR[ctrl.control_type] ?? ""}`}
            >
              {ctrl.control_type}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{ borderColor: `hsl(${hue},60%,60%)`, color: `hsl(${hue},60%,40%)` }}
            >
              {ctrl.domain.replace(/_/g, " ")}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              {ctrl.specificity_level}
            </Badge>
            {isMerged && mergedCtrl.merged_from_count > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                <Layers className="h-2.5 w-2.5 mr-0.5" />
                {mergedCtrl.merged_from_count} sources
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold leading-tight">{ctrl.control_name}</p>
          <p className={`text-xs text-muted-foreground mt-1 ${expanded ? "" : "line-clamp-2"}`}>
            {ctrl.description}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t bg-muted/20 px-3 pb-3 space-y-3 pt-2.5">

          {/* Document reference */}
          {ctrl.document_reference && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="font-medium">Ref:</span>
              <span>{ctrl.document_reference}</span>
            </div>
          )}

          {/* Keywords */}
          {ctrl.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ctrl.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="text-[10px] px-1.5 py-0.5 rounded-full border"
                  style={{
                    background: `hsl(${hue},60%,95%)`,
                    borderColor: `hsl(${hue},60%,80%)`,
                    color: `hsl(${hue},60%,35%)`,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Merged sources */}
          {isMerged && mergedCtrl.source_documents?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {mergedCtrl.source_documents.map((src, i) => (
                  <Badge
                    key={i}
                    variant={src.is_primary ? "default" : "outline"}
                    className="text-[10px] max-w-[180px] truncate"
                    title={src.filename + (src.document_reference ? ` — ${src.document_reference}` : "")}
                  >
                    {src.is_primary && <span className="mr-1">★</span>}
                    {src.filename}
                    {src.document_reference && <span className="opacity-70 ml-1">§{src.document_reference}</span>}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Mapped obligations */}
          <div>
            <button
              className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-full hover:text-foreground transition-colors"
              onClick={() => setOblExpanded(!oblExpanded)}
            >
              <Link2 className="h-3 w-3" />
              Regulatory Obligations
              {ctrl.mapped_obligations?.length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">{ctrl.mapped_obligations.length}</Badge>
              )}
              <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${oblExpanded ? "rotate-90" : ""}`} />
            </button>

            {oblExpanded && (
              <div className="mt-2 space-y-1.5">
                {!ctrl.mapped_obligations?.length ? (
                  <p className="text-xs text-muted-foreground italic">No matching obligations found</p>
                ) : (
                  ctrl.mapped_obligations.map((obl, i) => (
                    <div
                      key={i}
                      className="rounded border bg-background px-2.5 py-2 space-y-1"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <code className="text-[10px] font-mono text-muted-foreground">{obl.obligation_id}</code>
                        <span className="text-[10px] font-medium text-foreground">{obl.framework_name}</span>
                        {obl.section_reference && (
                          <span className="text-[10px] text-muted-foreground">§{obl.section_reference}</span>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] ml-auto ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}
                        >
                          {obl.enforcement_level}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(obl.match_score * 100)}% match
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{obl.obligation_text}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ControlsLibraryPage() {
  const { toast } = useToast();

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(320);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const next = Math.min(600, Math.max(200, dragRef.current.startW + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<any[]>([]);

  // Document list
  const [controlsDocs, setControlsDocs] = useState<ControlsDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Selected document (full with controls)
  const [selectedDoc, setSelectedDoc] = useState<ControlsDocumentFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docCache, setDocCache] = useState<Record<string, ControlsDocumentFull>>({});

  // Merged controls
  const [mergedControls, setMergedControls] = useState<MergedControl[] | null>(null);
  const [mergedLoading, setMergedLoading] = useState(false);

  // Right panel & controls view
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("dashboard");
  const [controlsViewMode, setControlsViewMode] = useState<ControlsViewMode>("document");

  // Controls-view filters
  const [domainFilter, setDomainFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Dashboard state
  const [dashboardControls, setDashboardControls] = useState<(ExtractedControl & { _source_filename?: string })[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardDomainFilter, setDashboardDomainFilter] = useState("all");
  const [dashboardSearch, setDashboardSearch] = useState("");

  // Clear library state
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [remapping, setRemapping] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  // ── API helpers ─────────────────────────────────────────────────────────────

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
    // Also refresh dashboard controls
    fetchAllControls();
  };

  const fetchAllControls = async () => {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/controls-library/all-controls");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.controls)) {
        setDashboardControls(data.controls);
      }
    } catch (err) {
      console.warn("fetchAllControls failed:", err);
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleIngest = async () => {
    if (uploadFiles.length === 0) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      uploadFiles.forEach(f => formData.append("policy_files", f));
      const res = await fetch("/api/controls-library/ingest", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.error || "Ingest failed");

      const ingested: any[] = data.ingested || [];
      setIngestResults(ingested);
      setUploadFiles([]);
      await fetchDocs();
      await fetchAllControls();

      const mongoFailed = ingested.some((r: any) => !r.mongo_saved);
      toast({
        title: "Extracted",
        description: mongoFailed
          ? `${data.total_ingested} document(s) processed. ⚠ MongoDB save failed — controls visible this session only.`
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
        setRightPanelView("dashboard");
      }
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
      setRightPanelView("dashboard");
      toast({ title: "Library cleared", description: `${data.deleted_count} document(s) removed` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Clear failed", variant: "destructive" });
    } finally {
      setClearingLibrary(false);
    }
  };

  const handleRemapObligations = async () => {
    setRemapping(true);
    try {
      const res = await fetch("/api/controls-library/remap-obligations", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Remap failed");
      toast({ title: "Obligations mapped", description: `${data.controls_updated} controls updated across ${data.documents_processed} document(s).` });
      setDashboardControls([]);
      setMergedControls(null);
      setDocCache({});
      setSelectedDoc(null);
    } catch (err) {
      toast({ title: "Remap failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRemapping(false);
    }
  };

  const handleDocClick = async (doc: ControlsDocument) => {
    if (selectedDoc?.document_id === doc.document_id) {
      setSelectedDoc(null);
      setRightPanelView("dashboard");
      return;
    }
    if (docCache[doc.document_id]) {
      setSelectedDoc(docCache[doc.document_id]);
      setRightPanelView("controls");
      setControlsViewMode("document");
      setDomainFilter("all");
      setTypeFilter("all");
      setSearch("");
      return;
    }
    setDetailLoading(true);
    setRightPanelView("controls");
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
        toast({ title: "Warning", description: "Could not load controls — showing summary only.", variant: "destructive" });
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
      setRightPanelView("controls");
      setDomainFilter("all");
      setTypeFilter("all");
      setSearch("");
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Merge failed", variant: "destructive" });
    } finally {
      setMergedLoading(false);
    }
  };

  // ── Derived metrics ─────────────────────────────────────────────────────────

  const allDomainCounts: Record<string, number> = {};
  let totalRawControls = 0;
  for (const doc of controlsDocs) {
    totalRawControls += doc.total_controls ?? 0;
    for (const [d, cnt] of Object.entries(doc.controls_by_domain ?? {})) {
      allDomainCounts[d] = (allDomainCounts[d] ?? 0) + cnt;
    }
  }
  const sortedDomains = Object.entries(allDomainCounts).sort((a, b) => b[1] - a[1]);
  const allDomainNames = sortedDomains.map(([d]) => d);
  const maxDomainCount = sortedDomains[0]?.[1] ?? 1;

  // Controls shown in the panel
  const activeControls: (ExtractedControl | MergedControl)[] =
    controlsViewMode === "merged"
      ? (mergedControls ?? [])
      : (selectedDoc?.controls ?? []);

  const allActiveControlDomains = Array.from(new Set(activeControls.map(c => c.domain)));
  const allActiveControlTypes = Array.from(new Set(activeControls.map(c => c.control_type)));

  const filteredControls = activeControls.filter(c =>
    (domainFilter === "all" || c.domain === domainFilter) &&
    (typeFilter === "all" || c.control_type === typeFilter) &&
    (search === "" ||
      c.control_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.document_reference.toLowerCase().includes(search.toLowerCase()))
  );

  // Obligation coverage (controls with at least 1 mapped obligation)
  const coveredCount = activeControls.filter(c => c.mapped_obligations?.length > 0).length;
  const coveragePct = activeControls.length > 0 ? Math.round((coveredCount / activeControls.length) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden select-none">

      {/* ── LEFT PANEL ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col bg-background/50 overflow-hidden transition-[width] duration-200" style={{ width: leftPanelOpen ? panelWidth : 0 }}>

        {/* Upload section */}
        <div className="p-4 border-b space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Add Policy Documents
          </h2>

          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              uploadFiles.length > 0
                ? "border-primary/50 bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onClick={() => document.getElementById("ctrl-file-input")?.click()}
          >
            <input
              id="ctrl-file-input"
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (files.length) setUploadFiles(prev => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-foreground font-medium">Click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, TXT or MD</p>
          </div>

          {uploadFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {uploadFiles.length} file{uploadFiles.length !== 1 ? "s" : ""} queued
              </p>
              <div className="max-h-36 overflow-auto space-y-1 pr-0.5">
                {uploadFiles.map((f, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs bg-muted/50 rounded px-2 py-1.5">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-px" />
                    <span className="flex-1 break-all leading-tight min-w-0">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0 mt-px"
                      onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full text-xs"
                disabled={ingesting}
                onClick={handleIngest}
              >
                {ingesting ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1.5" />
                    Extract Controls
                  </>
                )}
              </Button>
            </div>
          )}

          {ingestResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">Recently added</p>
              {ingestResults.map((r, i) => (
                <div key={i} className="text-xs p-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded space-y-1">
                  <p className="font-medium break-words leading-tight text-foreground">{r.filename}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-green-700 border-green-400 text-[10px]">{r.total_controls} controls</Badge>
                    {!r.mongo_saved && (
                      <Badge variant="outline" className="text-orange-600 border-orange-400 text-[10px]">⚠ no DB</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Library header */}
        <div className="flex items-center justify-between px-4 py-2 border-b gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Documents
            {controlsDocs.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{controlsDocs.length}</Badge>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant={rightPanelView === "dashboard" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              title="Dashboard"
              onClick={() => { setRightPanelView("dashboard"); setSelectedDoc(null); }}
            >
              <LayoutDashboard className="h-3 w-3" />
            </Button>
            <Button
              variant={controlsViewMode === "merged" && rightPanelView === "controls" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              title="Merged View (all docs deduplicated)"
              disabled={controlsDocs.length === 0 || mergedLoading}
              onClick={fetchMerged}
            >
              {mergedLoading
                ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
                : <Layers className="h-3 w-3" />
              }
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchDocs} disabled={docsLoading}>
              <RotateCcw className={`h-3 w-3 ${docsLoading ? "animate-spin" : ""}`} />
            </Button>
            {controlsDocs.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Clear entire controls library"
                disabled={clearingLibrary}
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {/* Inline clear confirmation */}
        {showClearConfirm && (
          <div className="mx-3 my-2 p-3 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2">
            <p className="text-xs font-medium text-destructive">Clear entire controls library?</p>
            <p className="text-[11px] text-muted-foreground">This will permanently delete all {controlsDocs.length} document(s) and their extracted controls.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="h-7 text-xs flex-1" onClick={handleClearLibrary} disabled={clearingLibrary}>
                {clearingLibrary ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5" />Clearing...</> : "Yes, clear all"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Document list */}
        <ScrollArea className="flex-1">
          {docsLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}
          {!docsLoading && controlsDocs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              No documents yet. Upload a policy document above.
            </p>
          )}
          {!docsLoading && controlsDocs.length > 0 && (
            <div className="p-2 space-y-1">
              {controlsDocs.map((doc, i) => {
                const isSelected = selectedDoc?.document_id === doc.document_id;
                const topDomains = Object.entries(doc.controls_by_domain ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3);
                return (
                  <div
                    key={i}
                    className={`rounded-lg border cursor-pointer transition-colors min-w-0 ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50 hover:bg-muted/40"
                    }`}
                    onClick={() => handleDocClick(doc)}
                  >
                    <div className="p-2.5 space-y-1.5">
                      {/* Filename row with delete */}
                      <div className="flex items-start gap-1.5 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-px" />
                        <p className="text-xs font-semibold break-all leading-snug flex-1 min-w-0">
                          {doc.source_filename}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0 -mt-0.5"
                          onClick={e => { e.stopPropagation(); handleDelete(doc.document_id); }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1 pl-5">
                        <Badge variant="secondary" className="text-[10px]">{doc.total_controls} controls</Badge>
                        {topDomains.map(([d, cnt], di) => {
                          const hue = HUES[allDomainNames.indexOf(d) % HUES.length];
                          return (
                            <Badge
                              key={di}
                              variant="outline"
                              className="text-[10px] capitalize"
                              style={{
                                borderColor: `hsl(${hue},60%,60%)`,
                                color: `hsl(${hue},60%,40%)`,
                              }}
                            >
                              {d.replace(/_/g, " ")} · {cnt}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── DIVIDER ─────────────────────────────────────────────────────────── */}
      {leftPanelOpen && (
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors bg-border"
          onMouseDown={onDividerMouseDown}
        />
      )}

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* ── PANEL TOGGLE ──────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center px-2 py-1 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setLeftPanelOpen(o => !o)}
            title={leftPanelOpen ? "Collapse panel" : "Expand panel"}
          >
            {leftPanelOpen
              ? <PanelLeftClose className="h-4 w-4" />
              : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={remapping || controlsDocs.length === 0}
              onClick={handleRemapObligations}
              title="Re-map all controls to regulatory obligations"
            >
              {remapping
                ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" /> Remapping…</>
                : <><Link2 className="h-3.5 w-3.5" /> Map Obligations</>}
            </Button>
          </div>
        </div>

        {/* ── DASHBOARD ──────────────────────────────────────────────────────── */}
        {rightPanelView === "dashboard" && (
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Controls Library Dashboard</h2>
              </div>

              {controlsDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No policy documents ingested yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload a company policy document to extract controls</p>
                </div>
              ) : (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: "Documents", value: controlsDocs.length, sub: "policy files" },
                      { label: "Total Controls", value: totalRawControls, sub: "extracted" },
                      { label: "Domains Covered", value: sortedDomains.length, sub: "security domains" },
                    ].map((kpi, i) => (
                      <div key={i} className="rounded-xl border bg-card p-4 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                        <p className="text-2xl font-bold">{kpi.value}</p>
                        <p className="text-[11px] text-muted-foreground">{kpi.sub}</p>
                      </div>
                    ))}
                    <div
                      className="rounded-xl border bg-card p-4 space-y-1 cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={controlsDocs.length > 0 ? fetchMerged : undefined}
                    >
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Merged View</p>
                      <p className="text-2xl font-bold flex items-center gap-1">
                        {mergedLoading
                          ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                          : mergedControls !== null
                            ? mergedControls.length
                            : "—"
                        }
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {mergedControls !== null ? "after deduplication" : "click to compute"}
                      </p>
                    </div>
                  </div>

                  {/* Domain Distribution — clickable filter bars */}
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Domain Distribution</h3>
                      {dashboardDomainFilter !== "all" && (
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                          onClick={() => setDashboardDomainFilter("all")}
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">Click a bar to filter controls below</p>
                    <div className="space-y-1.5">
                      {sortedDomains.map(([domain, cnt], i) => {
                        const hue = HUES[i % HUES.length];
                        const pct = Math.round((cnt / maxDomainCount) * 100);
                        const isActive = dashboardDomainFilter === domain;
                        return (
                          <div
                            key={domain}
                            className={`flex items-center gap-3 rounded-lg px-2 py-1 cursor-pointer transition-colors ${
                              isActive ? "bg-primary/8 ring-1 ring-primary/30" : "hover:bg-muted/50"
                            }`}
                            onClick={() => setDashboardDomainFilter(isActive ? "all" : domain)}
                          >
                            <span
                              className="text-xs font-medium w-36 shrink-0 capitalize leading-tight"
                              style={{ color: `hsl(${hue},60%,${isActive ? 35 : 40}%)` }}
                            >
                              {domain.replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 h-3.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: `hsl(${hue},${isActive ? 70 : 55}%,${isActive ? 48 : 58}%)`,
                                  opacity: dashboardDomainFilter !== "all" && !isActive ? 0.35 : 1,
                                }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right shrink-0 font-medium">{cnt}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* All Controls list */}
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="p-3 border-b bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">
                          All Controls
                          {dashboardDomainFilter !== "all" && (
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground capitalize">
                              — {dashboardDomainFilter.replace(/_/g, " ")}
                            </span>
                          )}
                        </h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {(() => {
                            const filtered = dashboardControls.filter(c =>
                              (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                              (dashboardSearch === "" ||
                                c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                                c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                            );
                            return `${filtered.length} / ${dashboardControls.length}`;
                          })()}
                        </Badge>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-8 h-7 text-xs"
                          placeholder="Search controls…"
                          value={dashboardSearch}
                          onChange={e => setDashboardSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    {dashboardLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    ) : (
                      <div className="space-y-2 p-2">
                        {dashboardControls
                          .filter(c =>
                            (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                            (dashboardSearch === "" ||
                              c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                              c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                          )
                          .map((ctrl, i) => (
                            <ControlCard key={ctrl.control_id ?? i} ctrl={ctrl} allDomains={allDomainNames} />
                          ))
                        }
                        {dashboardControls.filter(c =>
                          (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                          (dashboardSearch === "" ||
                            c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                            c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                        ).length === 0 && !dashboardLoading && (
                          <p className="text-xs text-muted-foreground text-center py-6">
                            {dashboardControls.length === 0 ? "No controls extracted yet." : "No controls match the current filter."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}

        {/* ── CONTROLS VIEW ──────────────────────────────────────────────────── */}
        {rightPanelView === "controls" && (
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* Controls view header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {controlsViewMode === "merged" ? "Merged Controls" : selectedDoc?.source_filename ?? "Controls"}
                </span>
                {controlsViewMode === "merged" && mergedControls && (
                  <Badge variant="secondary" className="text-xs">
                    {filteredControls.length} / {mergedControls.length}
                  </Badge>
                )}
                {controlsViewMode === "document" && selectedDoc && (
                  <Badge variant="secondary" className="text-xs">
                    {filteredControls.length} / {selectedDoc.controls?.length ?? 0}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={controlsViewMode === "document" ? "default" : "outline"}
                  className="h-7 text-xs"
                  disabled={!selectedDoc}
                  onClick={() => { setControlsViewMode("document"); setDomainFilter("all"); setTypeFilter("all"); setSearch(""); }}
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  Document
                </Button>
                <Button
                  size="sm"
                  variant={controlsViewMode === "merged" ? "default" : "outline"}
                  className="h-7 text-xs"
                  disabled={controlsDocs.length === 0}
                  onClick={mergedControls !== null
                    ? () => { setControlsViewMode("merged"); setDomainFilter("all"); setTypeFilter("all"); setSearch(""); }
                    : fetchMerged
                  }
                >
                  {mergedLoading
                    ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1" />
                    : <Layers className="h-3 w-3 mr-1" />
                  }
                  Merged
                </Button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="px-4 py-3 border-b space-y-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Search controls…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {/* Domain filter */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Domain</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={domainFilter === "all" ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setDomainFilter("all")}
                  >All</Badge>
                  {allActiveControlDomains.map(d => {
                    const hue = domainHue(d, allDomainNames.length ? allDomainNames : allActiveControlDomains);
                    return (
                      <Badge
                        key={d}
                        variant={domainFilter === d ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        style={domainFilter !== d ? { borderColor: `hsl(${hue},60%,60%)`, color: `hsl(${hue},60%,40%)` } : {}}
                        onClick={() => setDomainFilter(d)}
                      >
                        {d.replace(/_/g, " ")}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              {/* Type filter */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Control Type</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={typeFilter === "all" ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setTypeFilter("all")}
                  >All</Badge>
                  {allActiveControlTypes.map(t => (
                    <Badge
                      key={t}
                      variant={typeFilter === t ? "default" : "outline"}
                      className={`cursor-pointer text-xs ${typeFilter !== t ? (CONTROL_TYPE_COLOR[t] ?? "") : ""}`}
                      onClick={() => setTypeFilter(t)}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Controls list */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {detailLoading && (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                )}
                {!detailLoading && filteredControls.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    {activeControls.length === 0 ? "No controls available." : "No controls match the current filters."}
                  </p>
                )}
                {!detailLoading && filteredControls.map((ctrl, i) => (
                  <ControlCard
                    key={ctrl.control_id ?? i}
                    ctrl={ctrl}
                    allDomains={allDomainNames.length ? allDomainNames : allActiveControlDomains}
                    isMerged={controlsViewMode === "merged"}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}

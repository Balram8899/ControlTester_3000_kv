import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, X, RotateCcw, Trash2, BookOpen,
  ChevronDown, FileText, Layers, PanelLeftClose, PanelLeftOpen,
  Network, AlertTriangle, Target, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ── Colors ────────────────────────────────────────────────────────────────────

const HUES = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];

const RISK_CATEGORY_COLOR: Record<string, string> = {
  operational:       "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
  strategic:         "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300",
  compliance:        "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
  financial:         "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  reputational:      "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300",
  technology:        "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300",
  people:            "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300",
  process:           "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300",
  quality_assurance: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-950 dark:text-teal-300",
  methodology:       "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

function categoryHue(cat: string, allCats: string[]): number {
  const idx = allCats.indexOf(cat);
  return HUES[idx % HUES.length];
}

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface FrameworkElement {
  element_id: string;
  element_name: string;
  description: string;
  risk_category: string;
  control_implications: string;
  applicability: string;
  keywords: string[];
  specificity_level: string;
  _source_filename?: string;
  _framework_name?: string;
}

interface MergedElement extends FrameworkElement {
  merged_from_count: number;
  source_documents: { filename: string; framework_name: string; is_primary: boolean }[];
}

interface FrameworkDocument {
  document_id: string;
  framework_name: string;
  framework_type: string;
  source_filename: string;
  upload_timestamp: string;
  model_used?: string;
  total_elements: number;
  elements_by_category?: Record<string, number>;
}

interface FrameworkDocumentFull extends FrameworkDocument {
  elements: FrameworkElement[];
}

interface GraphStats {
  graph_exists: boolean;
  last_updated: string | null;
  stats: Record<string, number>;
}

type RightPanelView = "dashboard" | "elements" | "graph";
type ElementsViewMode = "document" | "merged";

// ── Element Card ─────────────────────────────────────────────────────────────

function ElementCard({
  elem,
  allCategories,
  isMerged = false,
}: {
  elem: FrameworkElement | MergedElement;
  allCategories: string[];
  isMerged?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hue = categoryHue(elem.risk_category, allCategories);
  const mergedElem = elem as MergedElement;

  return (
    <div className="border rounded-lg overflow-hidden transition-all duration-200 hover:border-primary/40">
      <div
        className="flex items-start gap-2 p-3 cursor-pointer"
        style={{ borderLeft: `3px solid hsl(${hue},70%,50%)` }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <code className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1">
              {elem.element_id}
            </code>
            <Badge
              variant="outline"
              className={`text-[10px] ${RISK_CATEGORY_COLOR[elem.risk_category] ?? ""}`}
            >
              {elem.risk_category?.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {elem.specificity_level}
            </Badge>
            {isMerged && mergedElem.merged_from_count > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                <Layers className="h-2.5 w-2.5 mr-0.5" />
                {mergedElem.merged_from_count} sources
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold leading-tight">{elem.element_name}</p>
          <p className={`text-xs text-muted-foreground mt-1 ${expanded ? "" : "line-clamp-2"}`}>
            {elem.description}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 px-3 pb-3 space-y-3 pt-2.5">

          {/* Control Implications */}
          {elem.control_implications && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> Control Implications
              </p>
              <p className="text-xs text-foreground">{elem.control_implications}</p>
            </div>
          )}

          {/* Applicability */}
          {elem.applicability && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> When to Apply
              </p>
              <p className="text-xs text-muted-foreground">{elem.applicability}</p>
            </div>
          )}

          {/* Keywords */}
          {elem.keywords?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                <Tag className="h-3 w-3" /> Keywords
              </p>
              <div className="flex flex-wrap gap-1">
                {elem.keywords.map((kw, i) => (
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
            </div>
          )}

          {/* Merged sources */}
          {isMerged && mergedElem.source_documents?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {mergedElem.source_documents.map((src, i) => (
                  <Badge
                    key={i}
                    variant={src.is_primary ? "default" : "outline"}
                    className="text-[10px] max-w-[200px] truncate"
                    title={`${src.framework_name} — ${src.filename}`}
                  >
                    {src.is_primary && <span className="mr-1">★</span>}
                    {src.framework_name || src.filename}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Source filename for non-merged */}
          {!isMerged && elem._source_filename && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span>{elem._source_filename}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FrameworksLibraryPage() {
  const { toast } = useToast();

  // Resizable left panel
  const [panelWidth, setPanelWidth] = useState(320);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(600, Math.max(200, dragRef.current.startW + ev.clientX - dragRef.current.startX));
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

  // Document list
  const [frameworkDocs, setFrameworkDocs] = useState<FrameworkDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Selected document (full)
  const [selectedDoc, setSelectedDoc] = useState<FrameworkDocumentFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docCache, setDocCache] = useState<Record<string, FrameworkDocumentFull>>({});

  // All elements (for dashboard)
  const [allElements, setAllElements] = useState<FrameworkElement[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  // Merged elements
  const [mergedElements, setMergedElements] = useState<MergedElement[] | null>(null);
  const [mergedLoading, setMergedLoading] = useState(false);

  // Graph stats
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // Right panel & view
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("dashboard");
  const [elementsViewMode, setElementsViewMode] = useState<ElementsViewMode>("document");

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Clear state
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  // ── API helpers ───────────────────────────────────────────────────────────────

  const fetchDocs = async () => {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/documents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setFrameworkDocs(data.documents ?? []);
    } catch (err) {
      console.warn("fetchDocs failed:", err);
    } finally {
      setDocsLoading(false);
    }
    fetchAllElements();
  };

  const fetchAllElements = async () => {
    setAllLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/all-elements");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setAllElements(data.elements ?? []);
    } catch (err) {
      console.warn("fetchAllElements failed:", err);
    } finally {
      setAllLoading(false);
    }
  };

  const fetchMerged = async () => {
    setMergedLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/merged");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setMergedElements(data.merged_elements ?? []);
    } catch (err) {
      toast({ title: "Error", description: "Failed to load merged elements", variant: "destructive" });
    } finally {
      setMergedLoading(false);
    }
  };

  const fetchGraphStats = async () => {
    setGraphLoading(true);
    try {
      const res = await fetch("/api/frameworks-library/graph-stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setGraphStats(data);
    } catch (err) {
      console.warn("fetchGraphStats failed:", err);
    } finally {
      setGraphLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!uploadFiles.length) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      uploadFiles.forEach(f => formData.append("framework_files", f));
      const res = await fetch("/api/frameworks-library/ingest", { method: "POST", body: formData });
      const queued = await res.json();
      if (!res.ok) throw new Error(queued.detail?.error || "Ingest failed");

      // Poll background task until complete
      const taskId = queued.task_id;
      let data: any;
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(`/api/ingest-task/${taskId}`);
        const task = await poll.json();
        if (task.status === "done") { data = task.result; break; }
        if (task.status === "failed") throw new Error(task.error || "Ingest failed");
      }

      setUploadFiles([]);
      await fetchDocs();
      const failed = data.results?.filter((r: any) => !r.success) ?? [];
      toast({
        title: "Frameworks processed",
        description: failed.length
          ? `${data.succeeded} succeeded, ${failed.length} failed.`
          : `${data.succeeded} framework(s) added to library.`,
        variant: failed.length ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Ingest failed", variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/frameworks-library/documents/${docId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setFrameworkDocs(prev => prev.filter(d => d.document_id !== docId));
      if (selectedDoc?.document_id === docId) {
        setSelectedDoc(null);
        setRightPanelView("dashboard");
      }
      setAllElements(prev => prev.filter(e => e._source_filename !== frameworkDocs.find(d => d.document_id === docId)?.source_filename));
      toast({ title: "Deleted", description: "Framework removed from library" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handleClearLibrary = async () => {
    setClearingLibrary(true);
    setShowClearConfirm(false);
    try {
      const res = await fetch("/api/frameworks-library/all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Clear failed");
      setFrameworkDocs([]);
      setAllElements([]);
      setMergedElements(null);
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

  const handleDocClick = async (doc: FrameworkDocument) => {
    if (selectedDoc?.document_id === doc.document_id) {
      setSelectedDoc(null);
      setRightPanelView("dashboard");
      return;
    }
    if (docCache[doc.document_id]) {
      setSelectedDoc(docCache[doc.document_id]);
      setRightPanelView("elements");
      setElementsViewMode("document");
      setCategoryFilter("all");
      setSearch("");
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/frameworks-library/documents/${doc.document_id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const full = data.document as FrameworkDocumentFull;
      setDocCache(prev => ({ ...prev, [doc.document_id]: full }));
      setSelectedDoc(full);
      setRightPanelView("elements");
      setElementsViewMode("document");
      setCategoryFilter("all");
      setSearch("");
    } catch (err) {
      toast({ title: "Error", description: "Failed to load document details", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────────

  const totalElements = frameworkDocs.reduce((s, d) => s + (d.total_elements ?? 0), 0);
  const allCategories = Array.from(new Set(allElements.map(e => e.risk_category).filter(Boolean)));

  const activeElements: FrameworkElement[] =
    elementsViewMode === "merged"
      ? (mergedElements ?? [])
      : selectedDoc?.elements ?? allElements;

  const filteredElements = activeElements.filter(e => {
    if (categoryFilter !== "all" && e.risk_category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.element_name?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.control_implications?.toLowerCase().includes(q) ||
        e.keywords?.some(k => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── Drag-and-drop ─────────────────────────────────────────────────────────────

  const ACCEPTED = [".pdf", ".docx", ".doc", ".txt", ".md", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext))
    );
    setUploadFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...files.filter(f => !names.has(f.name))];
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* ── Page header ── */}
      <HeroSection
        title="Frameworks Library"
        subtitle="Upload quality & risk frameworks — 5W1H, ECOTM, PDCA, FMEA, and more"
        icon={BookOpen}
        actions={
          <Button variant="ghost" size="icon" onClick={fetchDocs} title="Refresh" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10">
            <RotateCcw className="h-4 w-4" />
          </Button>
        }
      />

      {/* ── KPI strip ── */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-3 px-5 py-3 border-b">
        {[
          { label: "Frameworks Uploaded", value: frameworkDocs.length, gradient: "from-teal-500/20 to-cyan-500/20", border: "border-teal-500/20", text: "text-teal-400" },
          { label: "Total Elements", value: totalElements, gradient: "from-blue-500/20 to-indigo-500/20", border: "border-blue-500/20", text: "text-blue-400" },
          { label: "Risk Categories", value: allCategories.length, gradient: "from-purple-500/20 to-pink-500/20", border: "border-purple-500/20", text: "text-purple-400" },
        ].map(({ label, value, gradient, border, text }) => (
          <div key={label} className={`rounded-lg border bg-gradient-to-br ${gradient} ${border} p-3`}>
            <p className={`text-2xl font-bold ${text}`}>{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left panel ── */}
        {leftPanelOpen && (
          <div
            className="flex-shrink-0 flex flex-col border-r bg-card/20"
            style={{ width: panelWidth }}
          >
            {/* Upload area */}
            <div className="flex-shrink-0 p-3 border-b space-y-2">
              <div
                className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => document.getElementById("fw-file-input")?.click()}
              >
                <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">
                  Drop framework files or <span className="text-primary underline">browse</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">PDF, DOCX, TXT, MD, CSV, Excel, image</p>
                <input
                  id="fw-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    setUploadFiles(prev => {
                      const names = new Set(prev.map(f => f.name));
                      return [...prev, ...files.filter(f => !names.has(f.name))];
                    });
                    e.target.value = "";
                  }}
                />
              </div>

              {uploadFiles.length > 0 && (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs bg-muted/50 rounded px-2 py-1">
                      <span className="flex-1 truncate">{f.name}</span>
                      <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                className="w-full h-8 text-xs"
                disabled={!uploadFiles.length || ingesting}
                onClick={handleIngest}
              >
                {ingesting ? (
                  <><RotateCcw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Extracting…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload & Extract</>
                )}
              </Button>
            </div>

            {/* Document list */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {docsLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
                ) : !frameworkDocs.length ? (
                  <p className="text-xs text-muted-foreground text-center py-6 px-3">
                    No frameworks uploaded yet. Drop a framework document above to get started.
                  </p>
                ) : (
                  frameworkDocs.map(doc => (
                    <div
                      key={doc.document_id}
                      className={`group rounded-lg border p-2.5 cursor-pointer transition-colors ${
                        selectedDoc?.document_id === doc.document_id
                          ? "bg-primary/10 border-primary/40"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => handleDocClick(doc)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{doc.framework_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{doc.source_filename}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] h-4">
                              {doc.total_elements} elements
                            </Badge>
                            {doc.framework_type && (
                              <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">
                                {doc.framework_type}
                              </Badge>
                            )}
                          </div>
                          {doc.elements_by_category && Object.keys(doc.elements_by_category).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {Object.entries(doc.elements_by_category).slice(0, 3).map(([cat, count]) => (
                                <span
                                  key={cat}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border"
                                >
                                  {cat.replace(/_/g, " ")} {count}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                          onClick={e => { e.stopPropagation(); handleDelete(doc.document_id); }}
                          title="Delete document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex-shrink-0 p-2 border-t space-y-1.5">
              {showClearConfirm ? (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs space-y-2">
                  <p className="font-medium text-destructive">Clear entire frameworks library?</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] flex-1" onClick={handleClearLibrary} disabled={clearingLibrary}>
                      {clearingLibrary ? "Clearing…" : "Yes, clear"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={() => setShowClearConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={!frameworkDocs.length}
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Clear Library
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Resize divider ── */}
        {leftPanelOpen && (
          <div
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors"
            onMouseDown={onDividerMouseDown}
          />
        )}

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Right panel header */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b bg-card/20">
            <button
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title={leftPanelOpen ? "Hide panel" : "Show panel"}
            >
              {leftPanelOpen ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
            </button>

            {/* View toggle */}
            <div className="flex rounded-md border overflow-hidden text-xs">
              {[
                { id: "dashboard", label: "Overview" },
                { id: "elements", label: "Elements" },
                { id: "graph", label: "Graph" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  className={`px-3 py-1 transition-colors ${rightPanelView === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => {
                    setRightPanelView(id as RightPanelView);
                    if (id === "graph" && !graphStats) fetchGraphStats();
                    if (id === "elements" && elementsViewMode === "merged" && !mergedElements) fetchMerged();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sub-mode toggle (only in elements view) */}
            {rightPanelView === "elements" && (
              <div className="flex rounded-md border overflow-hidden text-xs ml-1">
                {[
                  { id: "document", label: selectedDoc ? selectedDoc.framework_name : "All" },
                  { id: "merged", label: "Merged" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    className={`px-3 py-1 transition-colors ${elementsViewMode === id ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted"}`}
                    onClick={() => {
                      setElementsViewMode(id as ElementsViewMode);
                      if (id === "merged" && !mergedElements) fetchMerged();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Filter controls (elements view) */}
            {rightPanelView === "elements" && (
              <div className="flex items-center gap-2 ml-auto">
                <Input
                  placeholder="Search elements…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-7 text-xs w-44"
                />
                <select
                  className="h-7 text-xs rounded-md border bg-background px-2"
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {allCategories.map(cat => (
                    <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Right panel content */}
          <ScrollArea className="flex-1">
            <div className="p-4">

              {/* Overview */}
              {rightPanelView === "dashboard" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-sm font-semibold mb-3">Library Summary</h2>
                    {allLoading ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : !frameworkDocs.length ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No frameworks uploaded yet</p>
                        <p className="text-xs mt-1">Upload a framework document from the left panel to get started</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Category breakdown */}
                        {allCategories.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Elements by Risk Category</p>
                            <div className="grid grid-cols-2 gap-2">
                              {allCategories.map(cat => {
                                const count = allElements.filter(e => e.risk_category === cat).length;
                                const hue = categoryHue(cat, allCategories);
                                return (
                                  <div
                                    key={cat}
                                    className="flex items-center justify-between rounded-lg border bg-card/50 px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors"
                                    onClick={() => {
                                      setCategoryFilter(cat);
                                      setRightPanelView("elements");
                                      setElementsViewMode("document");
                                    }}
                                  >
                                    <span
                                      className="text-xs font-medium"
                                      style={{ color: `hsl(${hue},60%,45%)` }}
                                    >
                                      {cat.replace(/_/g, " ")}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] h-4"
                                      style={{ background: `hsl(${hue},60%,92%)`, color: `hsl(${hue},60%,35%)` }}
                                    >
                                      {count}
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Per-framework breakdown */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Uploaded Frameworks</p>
                          <div className="space-y-2">
                            {frameworkDocs.map(doc => (
                              <div
                                key={doc.document_id}
                                className="rounded-lg border bg-card/50 p-3 cursor-pointer hover:border-primary/40 transition-colors"
                                onClick={() => handleDocClick(doc)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{doc.framework_name}</p>
                                    <p className="text-[11px] text-muted-foreground">{doc.framework_type} · {doc.total_elements} elements</p>
                                  </div>
                                  <Badge variant="outline" className="text-[10px] shrink-0">View</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Elements view */}
              {rightPanelView === "elements" && (
                <div className="space-y-2">
                  {(elementsViewMode === "merged" ? mergedLoading : allLoading || detailLoading) ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
                  ) : !filteredElements.length ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      {allElements.length ? "No elements match the current filter." : "No elements extracted yet. Upload a framework document."}
                    </p>
                  ) : (
                    filteredElements.map(elem => (
                      <ElementCard
                        key={elem.element_id}
                        elem={elem}
                        allCategories={allCategories}
                        isMerged={elementsViewMode === "merged"}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Graph stats view */}
              {rightPanelView === "graph" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold mb-1">Knowledge Graph</h2>
                    <p className="text-xs text-muted-foreground">
                      A knowledge graph is automatically built and saved after each framework document is ingested.
                      It is used for Graph-RAG enriched extraction of subsequent documents.
                    </p>
                  </div>

                  {graphLoading ? (
                    <p className="text-xs text-muted-foreground">Loading graph stats…</p>
                  ) : !graphStats ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No graph data loaded yet</p>
                      <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={fetchGraphStats}>
                        Fetch Graph Stats
                      </Button>
                    </div>
                  ) : !graphStats.graph_exists ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                      <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No graph saved yet</p>
                      <p className="text-xs mt-1">Upload a framework document to generate the knowledge graph.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {graphStats.last_updated && (
                        <p className="text-xs text-muted-foreground">
                          Last updated: {new Date(graphStats.last_updated).toLocaleString()}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(graphStats.stats).map(([key, val]) => (
                          <div key={key} className="rounded-lg border bg-card/50 p-3">
                            <p className="text-xl font-bold text-teal-400">{val}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{key.replace(/_/g, " ")}</p>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={fetchGraphStats}
                      >
                        <RotateCcw className="h-3 w-3 mr-1.5" /> Refresh
                      </Button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

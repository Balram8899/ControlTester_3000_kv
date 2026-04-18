import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import {
  Upload, X, Play, RotateCcw, Search, Trash2, ShieldCheck,
  LayoutDashboard, List, ChevronDown, ChevronRight, BookOpen,
  FileText, Link2, Layers, PanelLeftClose, PanelLeftOpen,
  Activity, Download,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, Cell, Legend,
  PieChart, Pie,
} from "recharts";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE } from "@/lib/chartTheme";

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

type RightPanelView = "dashboard" | "controls";
type ControlsViewMode = "document" | "merged";

// ── 5W1H Quality Analysis ─────────────────────────────────────────────────────

interface W1HResult { who: boolean; what: boolean; where: boolean; how: boolean; when: boolean; why: boolean; }
interface CtrlW1H extends ExtractedControl { w1h: W1HResult; score: number; rag: "green" | "amber" | "red"; }


function ragFromScore(score: number): "green" | "amber" | "red" {
  return score >= 5 ? "green" : score === 4 ? "amber" : "red";
}

function exportQualityCSV(controls: CtrlW1H[]) {
  const header = ["Control ID","Control Name","Process Area","WHO","WHAT","WHERE","HOW","WHEN","WHY","Score","RAG"];
  const rows = controls.map(c => [
    c.control_id, c.control_name, c.domain,
    c.w1h.who?"Y":"N", c.w1h.what?"Y":"N", c.w1h.where?"Y":"N",
    c.w1h.how?"Y":"N", c.w1h.when?"Y":"N", c.w1h.why?"Y":"N",
    String(c.score), c.rag.toUpperCase()
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  const a = Object.assign(document.createElement("a"), {href: url, download: "controls_quality.csv"});
  a.click(); URL.revokeObjectURL(url);
}

const RAG_COLOR = { green: "#009A44", amber: "#EAAA00", red: "#D73027" };
const RAG_BG: Record<"green"|"amber"|"red", string> = {
  green: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300",
  amber: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  red:   "bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
};
const W1H_KEYS: (keyof W1HResult)[] = ["who", "what", "where", "how", "when", "why"];
const W1H_COLORS: Record<keyof W1HResult, string> = {
  who: "#1E49E2", what: "#F97316", where: "#8B5CF6",
  how: "#EC4899", when: "#10B981", why: "#0EA5E9",
};

// ── Coverage Ring ────────────────────────────────────────────────────────────

function CoverageRing({ pct, size = 28 }: { pct: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 75 ? "var(--green)" : pct >= 40 ? "var(--amber)" : "var(--red)";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={2} className="text-muted/40" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={2.5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-500"
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        className="fill-foreground" style={{ fontSize: size * 0.3, fontFamily: "var(--font-mono)" }}>
        {pct}
      </text>
    </svg>
  );
}

// ── Obligation Radar Chart ──────────────────────────────────────────────────

function ObligationRadar({ obligations }: { obligations: MappedObligation[] }) {
  const [viewMode, setViewMode] = useState<"framework" | "domain">("framework");

  // Group by framework
  const byFramework: Record<string, { count: number; avgScore: number }> = {};
  for (const obl of obligations) {
    const key = obl.framework_name || "Unknown";
    if (!byFramework[key]) byFramework[key] = { count: 0, avgScore: 0 };
    byFramework[key].count++;
    byFramework[key].avgScore += obl.match_score;
  }
  for (const k of Object.keys(byFramework)) {
    byFramework[k].avgScore = Math.round((byFramework[k].avgScore / byFramework[k].count) * 100);
  }

  // Group by enforcement level as a proxy for "domain" dimension
  const byEnforcement: Record<string, { count: number; avgScore: number }> = {};
  for (const obl of obligations) {
    const key = obl.enforcement_level || "unknown";
    if (!byEnforcement[key]) byEnforcement[key] = { count: 0, avgScore: 0 };
    byEnforcement[key].count++;
    byEnforcement[key].avgScore += obl.match_score;
  }
  for (const k of Object.keys(byEnforcement)) {
    byEnforcement[k].avgScore = Math.round((byEnforcement[k].avgScore / byEnforcement[k].count) * 100);
  }

  const activeData = viewMode === "framework" ? byFramework : byEnforcement;
  const radarData = Object.entries(activeData).map(([name, { count, avgScore }]) => ({
    axis: name.length > 16 ? name.slice(0, 14) + "…" : name,
    fullName: name,
    count,
    score: avgScore,
  }));

  if (radarData.length < 3) {
    // Need at least 3 points for a meaningful radar
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Obligation Coverage
        </span>
        <div className="flex gap-1">
          {(["framework", "domain"] as const).map(mode => (
            <button
              key={mode}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize ${
                viewMode === mode
                  ? "bg-[var(--pacific)]/15 border-[var(--pacific)]/30 text-[var(--pacific)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode(mode)}
            >
              {mode === "domain" ? "Enforcement" : mode}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--grid-color)" strokeWidth={0.5} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: "#8492A6" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: "#8492A6" }}
            axisLine={false}
          />
          <Radar
            name="Match Score"
            dataKey="score"
            stroke="#00B8F5"
            fill="#00B8F5"
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
          <Radar
            name="Count"
            dataKey="count"
            stroke="#7213EA"
            fill="#7213EA"
            fillOpacity={0.1}
            strokeWidth={1}
            strokeDasharray="4 2"
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Control Card ─────────────────────────────────────────────────────────────

function ControlCard({
  ctrl,
  allDomains,
  isMerged = false,
  onObligationClick,
}: {
  ctrl: ExtractedControl | MergedControl;
  allDomains: string[];
  isMerged?: boolean;
  onObligationClick?: (obligationId: string) => void;
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
        <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
          {ctrl.mapped_obligations?.length > 0 && (
            <CoverageRing pct={Math.round(
              (ctrl.mapped_obligations.reduce((s, o) => s + o.match_score, 0) / ctrl.mapped_obligations.length) * 100
            )} />
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t bg-muted/20 px-3 pb-3 space-y-3 pt-2.5">

          {/* Radar chart for obligation mapping */}
          {ctrl.mapped_obligations?.length >= 3 && (
            <ObligationRadar obligations={ctrl.mapped_obligations} />
          )}

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
                        <button
                          type="button"
                          title="Navigate to this obligation in Regulatory Library"
                          className="text-[10px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                          onClick={() => onObligationClick?.(obl.obligation_id)}
                        >
                          ↗ {obl.obligation_id}
                        </button>
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
  const [, setLocation] = useLocation();
  const { pendingControlId, setPendingControlId, setPendingObligationId, pendingQualityAnalysis, setPendingQualityAnalysis } = useCrossNav();
  const { refreshMetrics } = useLibraryMetrics();

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
  const [dashboardTab, setDashboardTab] = useState<"overview" | "quality">("overview");
  const [qualityRagFilter, setQualityRagFilter] = useState<"all" | "green" | "amber" | "red">("all");
  const [selectedQualityControl, setSelectedQualityControl] = useState<CtrlW1H | null>(null);
  const [qualitySearch, setQualitySearch] = useState("");
  const [ctrlsW1H, setCtrlsW1H] = useState<CtrlW1H[]>([]);

  // Clear library state
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [remapping, setRemapping] = useState(false);

  // Merged stats for quality tab KPIs (fetched quietly, no view switch)
  const [mergedCtrlStats, setMergedCtrlStats] = useState<{ total_raw: number; total_merged: number } | null>(null);
  const [mergedStatsLoading, setMergedStatsLoading] = useState(false);

  useEffect(() => { fetchDocs(); }, []);

  // React to cross-page navigation: jump to a specific control
  useEffect(() => {
    if (!pendingControlId) return;
    setRightPanelView("dashboard");
    setControlsViewMode("document");
    setDashboardSearch(pendingControlId);
    setPendingControlId(null);
  }, [pendingControlId]);

  // React to cross-page navigation: open quality analysis tab
  useEffect(() => {
    if (!pendingQualityAnalysis) return;
    setRightPanelView("dashboard");
    setDashboardTab("quality");
    setPendingQualityAnalysis(false);
  }, [pendingQualityAnalysis]);

  // Auto-fetch merged stats and quality analysis when quality tab is active
  useEffect(() => {
    if (dashboardTab === "quality" && dashboardControls.length > 0) {
      if (mergedCtrlStats === null && !mergedStatsLoading) fetchMergedStats();
      if (ctrlsW1H.length === 0) {
        fetchQualityAnalysis(
          dashboardControls.map(c => ({
            control_id: c.control_id ?? String((c as any).id ?? ""),
            name: (c as any).control_name ?? c.control_id ?? "",
            description: c.description ?? "",
          })),
          dashboardControls,
        );
      }
    }
  }, [dashboardTab, dashboardControls.length]);

  // Navigate to regulatory library focused on a specific obligation
  const handleObligationClick = (obligationId: string) => {
    setPendingObligationId(obligationId);
    setLocation("/regulatory-library");
  };

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

  const fetchAllControls = async (): Promise<ExtractedControl[]> => {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/controls-library/all-controls");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.controls)) {
        setDashboardControls(data.controls);
        return data.controls as ExtractedControl[];
      }
      return [];
    } catch (err) {
      console.warn("fetchAllControls failed:", err);
      return [];
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchQualityAnalysis = useCallback(async (
    controls: { control_id: string; name: string; description: string }[],
    allControls: ExtractedControl[] = [],
  ) => {
    if (controls.length === 0) return;
    try {
      const res = await fetch("/api/controls-library/quality-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controls }),
      });
      if (!res.ok) throw new Error(`Quality analysis HTTP ${res.status}`);
      const data = await res.json();
      const ctrlMap = new Map(allControls.map(c => [c.control_id, c]));
      const merged: CtrlW1H[] = (data.results ?? []).map((r: any) => {
        const ctrl = ctrlMap.get(r.control_id) ?? {} as any;
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
          w1h: { who: r.who ?? false, what: r.what ?? false, where: r.where ?? false, how: r.how ?? false, when: r.when ?? false, why: r.why ?? false },
          score: r.score ?? 0,
          rag: r.rag ?? "red",
        } as CtrlW1H;
      });
      setCtrlsW1H(merged);
    } catch (err) {
      console.warn("Quality analysis failed:", err);
    }
  }, []);

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

      const ingested: any[] = data.ingested || [];
      setIngestResults(ingested);
      setUploadFiles([]);
      await fetchDocs();
      const freshControls = await fetchAllControls();
      refreshMetrics();

      // Trigger backend 5W1H analysis using freshly-fetched controls (not stale closure)
      fetchQualityAnalysis(
        freshControls.map(c => ({
          control_id: c.control_id ?? String((c as any).id ?? ""),
          name: (c as any).control_name ?? c.control_id ?? "",
          description: c.description ?? "",
        })),
        freshControls,
      );

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
      setRightPanelView("dashboard");
      refreshMetrics();
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
      setMergedControls(null);
      setDocCache({});
      setSelectedDoc(null);
      await fetchAllControls();
      refreshMetrics();
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

  const fetchMergedStats = async () => {
    setMergedStatsLoading(true);
    try {
      const res = await fetch("/api/controls-library/merged");
      const data = await res.json();
      if (data.merged_controls) {
        setMergedCtrlStats({ total_raw: dashboardControls.length, total_merged: data.merged_controls.length });
      }
    } catch { /* non-fatal */ }
    finally { setMergedStatsLoading(false); }
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
      c.control_id.toLowerCase().includes(search.toLowerCase()) ||
      c.control_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.document_reference.toLowerCase().includes(search.toLowerCase()))
  );

  // Obligation coverage (controls with at least 1 mapped obligation)
  const coveredCount = activeControls.filter(c => c.mapped_obligations?.length > 0).length;
  const coveragePct = activeControls.length > 0 ? Math.round((coveredCount / activeControls.length) * 100) : 0;

  // ── 5W1H Quality Analytics (populated from backend /quality-analysis endpoint) ──
  const ragCounts = { green: 0, amber: 0, red: 0 };
  const w1hTotals: Record<keyof W1HResult, number> = { who: 0, what: 0, where: 0, how: 0, when: 0, why: 0 };
  const domainRag: Record<string, { green: number; amber: number; red: number }> = {};
  for (const c of ctrlsW1H) {
    ragCounts[c.rag]++;
    for (const k of W1H_KEYS) { if (c.w1h[k]) w1hTotals[k]++; }
    if (!domainRag[c.domain]) domainRag[c.domain] = { green: 0, amber: 0, red: 0 };
    domainRag[c.domain][c.rag]++;
  }
  const avgScore = ctrlsW1H.length > 0
    ? ctrlsW1H.reduce((sum, c) => sum + c.score, 0) / ctrlsW1H.length : 0;
  const requiresImprovementCount = ragCounts.amber + ragCounts.red;
  const requiresImprovementPct = ctrlsW1H.length > 0
    ? (requiresImprovementCount / ctrlsW1H.length) * 100 : 0;

  const w1hPrevalenceData = W1H_KEYS
    .map(k => ({ element: k.toUpperCase(), count: w1hTotals[k], fill: W1H_COLORS[k] }))
    .sort((a, b) => b.count - a.count);

  const domainRagData = Object.entries(domainRag)
    .map(([domain, counts]) => ({ domain: domain.replace(/_/g, " "), ...counts, total: counts.green + counts.amber + counts.red }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const ragDonutData = [
    { name: "Green (0-1 missing)", value: ragCounts.green, color: RAG_COLOR.green },
    { name: "Amber (2 missing)",   value: ragCounts.amber, color: RAG_COLOR.amber },
    { name: "Red (3+ missing)",    value: ragCounts.red,   color: RAG_COLOR.red   },
  ].filter(d => d.value > 0);

  // Obligation-mapping KPIs (derived from dashboardControls)
  const oblMappedCount = dashboardControls.filter(c => ((c as any).mapped_obligations?.length ?? 0) > 0).length;
  const oblCoveragePct = dashboardControls.length > 0 ? (oblMappedCount / dashboardControls.length) * 100 : 0;
  const allOblScores = dashboardControls.flatMap(c => ((c as any).mapped_obligations ?? []).map((o: any) => o.match_score ?? 0));
  const avgOblMatchScore = allOblScores.length > 0 ? allOblScores.reduce((a: number, b: number) => a + b, 0) / allOblScores.length : 0;
  const qualityDuplicates = mergedCtrlStats ? Math.max(0, mergedCtrlStats.total_raw - mergedCtrlStats.total_merged) : null;

  const filteredQuality = ctrlsW1H.filter(c =>
    (qualityRagFilter === "all" || c.rag === qualityRagFilter) &&
    (qualitySearch === "" ||
      c.control_id.toLowerCase().includes(qualitySearch.toLowerCase()) ||
      c.control_name.toLowerCase().includes(qualitySearch.toLowerCase()) ||
      c.domain.toLowerCase().includes(qualitySearch.toLowerCase()))
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">
      <HeroSection title="Controls Library" subtitle="Browse, filter, and analyse enterprise security controls" icon={ShieldCheck} />
      <div className="flex-1 flex overflow-hidden">

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
              accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (files.length) setUploadFiles(prev => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-foreground font-medium">Click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, Word, TXT, MD, Excel, CSV or image</p>
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-semibold">Controls Library Dashboard</h2>
                </div>
                {controlsDocs.length > 0 && (
                  <div className="flex items-center gap-1">
                    {(["overview", "quality"] as const).map(tab => (
                      <button
                        key={tab}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          dashboardTab === tab
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setDashboardTab(tab)}
                      >
                        {tab === "quality" ? <><Activity className="inline h-3 w-3 mr-1" />Quality Analysis</> : "Overview"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {controlsDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No policy documents ingested yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload a company policy document to extract controls</p>
                </div>
              ) : (
                <>
                  {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
                  {dashboardTab === "overview" && <>

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
                                c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
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
                              c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                              c.control_name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                              c.description.toLowerCase().includes(dashboardSearch.toLowerCase()))
                          )
                          .map((ctrl, i) => (
                            <ControlCard key={ctrl.control_id ?? i} ctrl={ctrl} allDomains={allDomainNames} onObligationClick={handleObligationClick} />
                          ))
                        }
                        {dashboardControls.filter(c =>
                          (dashboardDomainFilter === "all" || c.domain === dashboardDomainFilter) &&
                          (dashboardSearch === "" ||
                            c.control_id.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
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

                  </>} {/* end overview tab */}

                  {/* ── QUALITY ANALYSIS TAB ─────────────────────────────── */}
                  {dashboardTab === "quality" && (
                    ctrlsW1H.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Activity className="h-12 w-12 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">No controls to analyze yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Extract controls from a policy document first</p>
                      </div>
                    ) : (
                      <div className="space-y-5">

                        {/* KPI Row */}
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Controls Assessed</p>
                            <p className="text-2xl font-bold font-mono">{ctrlsW1H.length}</p>
                            <p className="text-[11px] text-muted-foreground">across {sortedDomains.length} process areas</p>
                          </div>
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Avg Quality Score</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: avgScore >= 5 ? RAG_COLOR.green : avgScore >= 4 ? RAG_COLOR.amber : RAG_COLOR.red }}>
                              {avgScore.toFixed(2)}/6
                            </p>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(avgScore/6)*100}%`, background: avgScore >= 5 ? RAG_COLOR.green : avgScore >= 4 ? RAG_COLOR.amber : RAG_COLOR.red }} />
                            </div>
                            <p className="text-[11px] text-muted-foreground">mean 5W1H elements present</p>
                          </div>
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Requires Improvement</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: RAG_COLOR.red }}>{requiresImprovementPct.toFixed(1)}%</p>
                            <p className="text-[11px] text-muted-foreground">{requiresImprovementCount} controls (amber + red)</p>
                          </div>
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Green — No Action</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: RAG_COLOR.green }}>{ragCounts.green}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {ctrlsW1H.length > 0 ? `${(ragCounts.green/ctrlsW1H.length*100).toFixed(1)}% of corpus` : "—"}
                            </p>
                          </div>
                        </div>

                        {/* Obligation Mapping KPI Row */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150"
                               style={{ borderLeft: "3px solid #009A44" }}>
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Controls–Obligations Coverage</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: "#009A44" }}>{oblCoveragePct.toFixed(1)}%</p>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${oblCoveragePct}%`, background: "#009A44" }} />
                            </div>
                            <p className="text-[11px] text-muted-foreground">{oblMappedCount} of {dashboardControls.length} controls mapped</p>
                          </div>
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150"
                               style={{ borderLeft: "3px solid #7213EA" }}>
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Avg Obligation Match Score</p>
                            <p className="text-2xl font-bold font-mono" style={{ color: "#7213EA" }}>{avgOblMatchScore.toFixed(3)}/1.0</p>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${avgOblMatchScore * 100}%`, background: "#7213EA" }} />
                            </div>
                            <p className="text-[11px] text-muted-foreground">across {allOblScores.length} obligation links</p>
                          </div>
                          <div className="rounded-xl border bg-card p-4 space-y-1 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150"
                               style={{ borderLeft: "3px solid #EAAA00" }}>
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Potential Duplicates</p>
                            {mergedStatsLoading ? (
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mt-1" />
                            ) : (
                              <p className="text-2xl font-bold font-mono" style={{ color: "#EAAA00" }}>
                                {qualityDuplicates !== null ? qualityDuplicates : "—"}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              {mergedCtrlStats
                                ? `${mergedCtrlStats.total_raw} raw → ${mergedCtrlStats.total_merged} merged`
                                : mergedStatsLoading ? "computing…" : "loading…"}
                            </p>
                          </div>
                        </div>

                        {/* Charts Row */}
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

                          {/* RAG Donut */}
                          <div className="rounded-xl border bg-card p-4 space-y-2 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <h3 className="text-sm font-semibold">RAG Distribution</h3>
                            <p className="text-[11px] text-muted-foreground">Quality rating across all {ctrlsW1H.length} controls</p>
                            <div className="relative">
                              <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                  <Pie data={ragDonutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={0}>
                                    {ragDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                  </Pie>
                                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(v: number) => [v, "Controls"]} />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-xl font-bold font-mono">{ctrlsW1H.length}</span>
                                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">controls</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {ragDonutData.map(d => (
                                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                                  <span className="text-muted-foreground flex-1">{d.name}</span>
                                  <span className="font-mono font-medium">{d.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 5W1H Prevalence Bar */}
                          <div className="rounded-xl border bg-card p-4 space-y-2 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <h3 className="text-sm font-semibold">5W1H Element Prevalence</h3>
                            <p className="text-[11px] text-muted-foreground">Controls with each element present</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={w1hPrevalenceData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                <XAxis type="number" domain={[0, ctrlsW1H.length]} tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="element" tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600 }} tickLine={false} axisLine={false} width={36} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} formatter={(v: number) => [v, "Controls"]} />
                                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                                  {w1hPrevalenceData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* RAG by Process Area */}
                          <div className="rounded-xl border bg-card p-4 space-y-2 hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                            <h3 className="text-sm font-semibold">Quality RAG by Process Area</h3>
                            <p className="text-[11px] text-muted-foreground">Green / Amber / Red breakdown per area</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={domainRagData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                                <XAxis type="number" tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="domain" tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={80} />
                                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="green" name="Green" stackId="rag" fill={RAG_COLOR.green} />
                                <Bar dataKey="amber" name="Amber" stackId="rag" fill={RAG_COLOR.amber} />
                                <Bar dataKey="red" name="Red" stackId="rag" fill={RAG_COLOR.red} radius={[0, 2, 2, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 5W1H Scores Detail Table */}
                        <div className="rounded-xl border bg-card overflow-hidden">
                          <div className="p-3 border-b bg-muted/30 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <h3 className="text-sm font-semibold">
                                5W1H Scores by Control
                              </h3>
                              <button
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2 py-1 transition-colors"
                                onClick={() => exportQualityCSV(filteredQuality)}
                              >
                                <Download className="h-3 w-3" />
                                Export CSV
                              </button>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {(["all", "red", "amber", "green"] as const).map(f => (
                                <button
                                  key={f}
                                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors capitalize ${
                                    qualityRagFilter === f
                                      ? f === "all"
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : `border-transparent text-white`
                                      : "border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                                  }`}
                                  style={qualityRagFilter === f && f !== "all" ? { background: RAG_COLOR[f] } : {}}
                                  onClick={() => setQualityRagFilter(f)}
                                >
                                  {f === "all" ? `All (${ctrlsW1H.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${ragCounts[f]})`}
                                </button>
                              ))}
                              <div className="relative ml-auto">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                <input
                                  className="pl-6 h-6 text-[11px] border rounded-lg bg-transparent pr-2 focus:outline-none focus:ring-1 focus:ring-primary/50 w-36"
                                  placeholder="Search…"
                                  value={qualitySearch}
                                  onChange={e => setQualitySearch(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b bg-muted/20">
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Control ID</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Control Text</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">Process Area</th>
                                  {W1H_KEYS.map(k => (
                                    <th key={k} className="text-center px-1 py-2 font-medium w-10" style={{ color: W1H_COLORS[k] }}>
                                      {k.toUpperCase()}
                                    </th>
                                  ))}
                                  <th className="text-center px-2 py-2 font-medium text-muted-foreground w-12">Score</th>
                                  <th className="text-center px-2 py-2 font-medium text-muted-foreground w-14">RAG</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredQuality.slice(0, 200).map((c, i) => (
                                  <tr key={c.control_id ?? i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                    <td
                                      className="px-3 py-2 font-mono text-[10px] text-primary cursor-pointer hover:underline"
                                      onClick={() => setSelectedQualityControl(c)}
                                    >{c.control_id}</td>
                                    <td className="px-3 py-2 text-foreground leading-tight max-w-xs">
                                      <span className="line-clamp-2" title={c.control_name}>{c.control_name}</span>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground capitalize">{c.domain?.replace(/_/g, " ")}</td>
                                    {W1H_KEYS.map(k => (
                                      <td key={k} className="text-center px-1 py-2">
                                        {c.w1h[k]
                                          ? <span style={{ color: W1H_COLORS[k] }}>✓</span>
                                          : <span className="text-muted-foreground/40">✗</span>
                                        }
                                      </td>
                                    ))}
                                    <td className="text-center px-2 py-2 font-mono font-medium">{c.score}/6</td>
                                    <td className="text-center px-2 py-2">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${RAG_BG[c.rag]}`}>
                                        {c.rag.charAt(0).toUpperCase() + c.rag.slice(1)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                {filteredQuality.length === 0 && (
                                  <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No controls match filter.</td></tr>
                                )}
                              </tbody>
                            </table>
                            {filteredQuality.length > 200 && (
                              <p className="text-[10px] text-muted-foreground text-center py-2 border-t">
                                Showing 200 of {filteredQuality.length} — use Export CSV for full data
                              </p>
                            )}
                          </div>
                        </div>

                      </div>
                    )
                  )} {/* end quality tab */}

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
                    onObligationClick={handleObligationClick}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
      </div>

      {/* ── Control Detail Modal ─────────────────────────────────────────────── */}
      {selectedQualityControl && (
      <Dialog open={!!selectedQualityControl} onOpenChange={open => { if (!open) setSelectedQualityControl(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 mt-0.5 shrink-0">
                {selectedQualityControl.control_id}
              </code>
              <DialogTitle className="text-base leading-snug">{selectedQualityControl.control_name}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* Citation */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-1.5">
              <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700 dark:text-amber-400">Citation</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground font-medium">Document</span>
                <span className="font-mono text-foreground">{selectedQualityControl._source_filename ?? "—"}</span>
                {selectedQualityControl.document_reference && (
                  <>
                    <span className="text-muted-foreground font-medium">Reference</span>
                    <span className="font-mono text-foreground">{selectedQualityControl.document_reference}</span>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">Description</p>
              <p className="text-sm leading-relaxed text-foreground">{selectedQualityControl.description}</p>
            </div>

            {/* Metadata row */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={CONTROL_TYPE_COLOR[selectedQualityControl.control_type] ?? ""}>
                {selectedQualityControl.control_type}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {selectedQualityControl.domain?.replace(/_/g, " ")}
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {selectedQualityControl.specificity_level}
              </Badge>
            </div>

            {/* Keywords */}
            {selectedQualityControl.keywords?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedQualityControl.keywords.map(kw => (
                    <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 5W1H */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">5W1H Quality</p>
              <div className="flex gap-2 flex-wrap">
                {W1H_KEYS.map(k => (
                  <span key={k} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    selectedQualityControl.w1h[k]
                      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
                      : "border-muted bg-muted/30 text-muted-foreground/50"
                  }`} style={selectedQualityControl.w1h[k] ? { borderColor: W1H_COLORS[k], color: W1H_COLORS[k], background: `${W1H_COLORS[k]}15` } : {}}>
                    {k.toUpperCase()} {selectedQualityControl.w1h[k] ? "✓" : "✗"}
                  </span>
                ))}
                <span className="text-[10px] px-2 py-0.5 rounded border font-bold border-muted bg-muted/30">
                  Score: {selectedQualityControl.score}/6
                </span>
              </div>
            </div>

            {/* Mapped Obligations */}
            {selectedQualityControl.mapped_obligations?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1.5">
                  Mapped Obligations ({selectedQualityControl.mapped_obligations.length})
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedQualityControl.mapped_obligations.map((obl, i) => (
                    <div key={i} className="rounded border p-2 text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-primary">{obl.obligation_id}</code>
                        <Badge variant="outline" className={`text-[9px] ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}>
                          {obl.enforcement_level}
                        </Badge>
                        <span className="ml-auto text-[10px] text-muted-foreground">{obl.framework_name}</span>
                      </div>
                      <p className="text-muted-foreground leading-tight line-clamp-2">{obl.obligation_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Upload, FileText, X, Play, RotateCcw, BookOpen, Search, Trash2, Library,
  LayoutDashboard, GitCompare, ChevronRight, AlertTriangle, CheckCircle2, Minus, Layers, Link2,
  PanelLeftClose, PanelLeftOpen, Download, Network, ShieldCheck, ChevronDown, ArrowRight, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, LibraryDocument } from "@/contexts/RegulatoryTestingContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ENFORCEMENT_COLOR: Record<string, string> = {
  mandatory:    "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
  recommended:  "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  optional:     "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

const HUES = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];

type RightPanelView = "dashboard" | "obligations" | "gap-analysis";

// ── Gap analysis result types ─────────────────────────────────────────────────
interface GapDocInfo {
  framework_name: string;
  source_filename: string;
  total_obligations: number;
  domains_count: number;
}
interface SimilarityEntry {
  domain: string;
  docs: Record<string, {
    count: number;
    enforcement_breakdown: Record<string, number>;
    sample_obligations: { text: string; section: string; enforcement: string; keywords: string[] }[];
  }>;
}
interface DifferenceEntry {
  domain: string;
  coverage_pct: number;
  present_in: string[];
  absent_in: string[];
  obligation_counts: Record<string, number>;
}
interface UniqueEntry {
  unique_domains: string[];
  unique_domain_count: number;
  unique_obligation_count: number;
  shared_domain_count: number;
  sample_obligations: { domain: string; text: string; section: string; enforcement: string }[];
}
interface GapResults {
  success: boolean;
  documents: Record<string, GapDocInfo>;
  domain_coverage: Record<string, { present_in: string[]; absent_in: string[]; coverage_pct: number; obligation_counts: Record<string, number> }>;
  similarities: SimilarityEntry[];
  differences: DifferenceEntry[];
  unique_by_doc: Record<string, UniqueEntry>;
  gap_summary: {
    total_documents: number;
    total_domains: number;
    shared_domain_count: number;
    shared_domains: string[];
    partial_coverage_domain_count: number;
    most_unique_doc: string | null;
    best_covered_doc: string | null;
    doc_domain_counts: Record<string, number>;
  };
  final_report?: string;
  graph_context_used?: boolean;
  graph_stats?: { nodes: number; edges: number; chunk_nodes: number; domain_nodes: number; standard_nodes: number } | null;
}

// ── Mapped-control reverse index types ────────────────────────────────────────
interface MappedControlEntry {
  control_id: string;
  control_name: string;
  domain: string;
  control_type: string;
  match_score: number;
  source_filename?: string;
}

const CTRL_TYPE_ICON_COLOR: Record<string, string> = {
  preventive:   "text-blue-500",
  detective:    "text-yellow-500",
  corrective:   "text-orange-500",
  directive:    "text-purple-500",
  compensating: "text-gray-400",
};

function scoreColor(score: number): string {
  if (score >= 0.7) return "bg-emerald-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-red-400";
}

function scorePct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Inline collapsible showing controls mapped to an obligation */
function MappedControlsSection({ controls, onControlClick }: { controls: MappedControlEntry[]; onControlClick?: (controlId: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (controls.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-[var(--pacific)]/20 bg-[var(--pacific)]/[0.03] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--pacific)]/[0.06] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--pacific)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--pacific)]">
          {controls.length} Mapped Control{controls.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {/* Mini score dots preview when collapsed */}
          {!expanded && controls.slice(0, 5).map((c, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${scoreColor(c.match_score)}`}
              title={`${c.control_name} (${scorePct(c.match_score)})`}
            />
          ))}
          {!expanded && controls.length > 5 && (
            <span className="text-[9px] text-muted-foreground">+{controls.length - 5}</span>
          )}
          {expanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          }
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--pacific)]/10 divide-y divide-[var(--pacific)]/5">
          {controls
            .sort((a, b) => b.match_score - a.match_score)
            .map((ctrl, ci) => (
            <div key={ci} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/20 transition-colors">
              <ShieldCheck className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${CTRL_TYPE_ICON_COLOR[ctrl.control_type] ?? "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-foreground">{ctrl.control_name}</span>
                  <button
                    type="button"
                    title="Navigate to this control in Controls Library"
                    className="text-[9px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                    onClick={() => onControlClick?.(ctrl.control_id)}
                  >
                    ↗ {ctrl.control_id}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground capitalize">{ctrl.domain.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">· {ctrl.control_type}</span>
                </div>
              </div>
              {/* Match score bar */}
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scoreColor(ctrl.match_score)}`}
                    style={{ width: scorePct(ctrl.match_score) }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{scorePct(ctrl.match_score)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DialogOblRow — obligation row inside the cross-library metric popup ────────
function DialogOblRow({
  obl, mappedCtrls, onControlClick, onObligationClick,
}: {
  obl: any;
  mappedCtrls: MappedControlEntry[];
  onControlClick: (id: string) => void;
  onObligationClick: (id: string) => void;
}) {
  const [ctrlsExpanded, setCtrlsExpanded] = useState(false);

  return (
    <div className="px-5 py-3 hover:bg-muted/30 transition-colors">
      {/* Header row */}
      <div className="flex items-start gap-2 flex-wrap mb-1">
        <button
          type="button"
          title="Jump to this obligation in the library"
          className="text-[10px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 shrink-0 transition-colors cursor-pointer"
          onClick={() => obl.obligation_id && onObligationClick(obl.obligation_id)}
        >
          {obl.obligation_id}
        </button>
        {obl.domain && (
          <span className="text-[10px] capitalize text-muted-foreground bg-muted rounded px-1.5 py-0.5">{obl.domain.replace(/_/g, " ")}</span>
        )}
        {obl.enforcement_level && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? "border-muted text-muted-foreground"}`}>
            {obl.enforcement_level}
          </span>
        )}
        {obl.framework_name && (
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{obl.framework_name}</span>
        )}
      </div>

      {/* Obligation text */}
      <p className="text-sm text-foreground leading-relaxed mb-1.5">{obl.obligation_text}</p>

      {/* Section reference */}
      {obl.section_reference && (
        <p className="text-[11px] text-muted-foreground mb-1.5">§ {obl.section_reference}</p>
      )}

      {/* Mapped controls toggle */}
      {mappedCtrls.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--pacific)] hover:text-[var(--pacific)]/80 transition-colors mt-1"
          onClick={() => setCtrlsExpanded(v => !v)}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {mappedCtrls.length} mapped control{mappedCtrls.length !== 1 ? "s" : ""}
          {ctrlsExpanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
        </button>
      )}

      {/* Mapped controls expanded list */}
      {ctrlsExpanded && (
        <div className="mt-2 rounded-lg border border-[var(--pacific)]/20 bg-[var(--pacific)]/[0.03] overflow-hidden divide-y divide-[var(--pacific)]/5">
          {mappedCtrls.sort((a, b) => b.match_score - a.match_score).map((ctrl, ci) => (
            <div key={ci} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/20 transition-colors">
              <ShieldCheck className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${CTRL_TYPE_ICON_COLOR[ctrl.control_type] ?? "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-foreground">{ctrl.control_name}</span>
                  <button
                    type="button"
                    className="text-[9px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 transition-colors"
                    onClick={() => onControlClick(ctrl.control_id)}
                  >
                    ↗ {ctrl.control_id}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground capitalize">{ctrl.domain.replace(/_/g, " ")}</span>
                  <span className="text-[10px] text-muted-foreground">· {ctrl.control_type}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${ctrl.match_score >= 0.7 ? "bg-emerald-500" : ctrl.match_score >= 0.4 ? "bg-amber-500" : "bg-red-400"}`}
                    style={{ width: `${Math.round(ctrl.match_score * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{Math.round(ctrl.match_score * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DashboardOblRow — stable row for dashboard obligations list ───────────────
function DashboardOblRow({
  obl, hue, dashboardViewMode, mappedCtrls, controlsLoaded, onControlClick,
}: {
  obl: any;
  hue: number;
  dashboardViewMode: string;
  mappedCtrls: MappedControlEntry[];
  controlsLoaded: boolean;
  onControlClick: (id: string) => void;
}) {
  const [ctrlsExpanded, setCtrlsExpanded] = useState(false);

  return (
    <div className="px-3 py-2.5 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <code className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1">{obl.obligation_id}</code>
            <Badge
              variant="outline"
              className="text-[10px] capitalize"
              style={{ borderColor: `hsl(${hue},60%,60%)`, color: `hsl(${hue},60%,40%)` }}
            >
              {obl.domain?.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}>
              {obl.enforcement_level}
            </Badge>
            {obl.merged_from_count > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                <Layers className="h-2.5 w-2.5 mr-0.5" />
                {obl.merged_from_count} sources
              </Badge>
            )}
            {controlsLoaded && mappedCtrls.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--pacific)]/40 text-[var(--pacific)] hover:bg-[var(--pacific)]/10 transition-colors"
                onClick={() => setCtrlsExpanded(v => !v)}
              >
                <ShieldCheck className="h-2.5 w-2.5" />
                {mappedCtrls.length}
                {ctrlsExpanded
                  ? <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                  : <ChevronRight className="h-2.5 w-2.5 ml-0.5" />}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{obl.obligation_text}</p>

          {dashboardViewMode === "all" && (
            <div className="flex items-center gap-1.5 mt-1 text-[10px]">
              <Link2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <span className="font-medium text-muted-foreground">{obl.framework_name || obl.source_filename}</span>
              {obl.framework_name && obl.source_filename && obl.framework_name !== obl.source_filename && (
                <span className="text-muted-foreground/50 truncate max-w-[160px]" title={obl.source_filename}>({obl.source_filename})</span>
              )}
              {obl.section_reference && <span className="text-muted-foreground/70">§{obl.section_reference}</span>}
            </div>
          )}

          {obl.merged_from_count > 1 && obl.source_documents?.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Merged from</p>
              <div className="flex flex-col gap-1">
                {obl.source_documents.map((src: any, si: number) => (
                  <div key={si} className={`flex items-start gap-1.5 text-[10px] rounded px-1.5 py-1 ${src.is_primary ? "bg-primary/8 border border-primary/20" : "bg-muted/40"}`}>
                    {src.is_primary && <span className="text-primary shrink-0 leading-none mt-0.5">★</span>}
                    <div className="min-w-0">
                      <span className="font-medium text-foreground/80">{src.framework_name || src.source_filename}</span>
                      {src.framework_name && src.source_filename && src.framework_name !== src.source_filename && (
                        <span className="text-muted-foreground/50 ml-1 truncate" title={src.source_filename}>({src.source_filename})</span>
                      )}
                      {src.section_reference && <span className="text-muted-foreground/70 ml-1">§{src.section_reference}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapped controls inline expand */}
          {controlsLoaded && mappedCtrls.length > 0 && ctrlsExpanded && (
            <div className="mt-2 rounded-lg border border-[var(--pacific)]/20 bg-[var(--pacific)]/[0.03] overflow-hidden divide-y divide-[var(--pacific)]/5">
              {mappedCtrls.sort((a, b) => b.match_score - a.match_score).map((ctrl, ci) => (
                <div key={ci} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/20 transition-colors">
                  <ShieldCheck className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${CTRL_TYPE_ICON_COLOR[ctrl.control_type] ?? "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{ctrl.control_name}</span>
                      <button
                        type="button"
                        className="text-[9px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 transition-colors"
                        onClick={() => onControlClick(ctrl.control_id)}
                      >
                        ↗ {ctrl.control_id}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground capitalize">{ctrl.domain.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground">· {ctrl.control_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${ctrl.match_score >= 0.7 ? "bg-emerald-500" : ctrl.match_score >= 0.4 ? "bg-amber-500" : "bg-red-400"}`}
                        style={{ width: `${Math.round(ctrl.match_score * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{Math.round(ctrl.match_score * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ObligationCard — stable component so expand state survives filter changes ──
function ObligationCard({
  obl, heading, hasFullText, mappedCtrls, controlsLoaded, onControlClick,
}: {
  obl: any;
  heading: string;
  hasFullText: boolean;
  mappedCtrls: MappedControlEntry[];
  controlsLoaded: boolean;
  onControlClick: (id: string) => void;
}) {
  const [ctrlsExpanded, setCtrlsExpanded] = useState(false);

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {obl.section_reference && (
            <Badge variant="secondary" className="text-xs font-mono">{obl.section_reference}</Badge>
          )}
          <Badge variant="outline" className={`text-xs ${ENFORCEMENT_COLOR[obl.enforcement_level] ?? ""}`}>
            {obl.enforcement_level}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">{(obl.domain ?? "").replace(/_/g, " ")}</Badge>
          <Badge variant="outline" className="text-xs">{(obl.obligation_type ?? "").replace(/_/g, " ")}</Badge>
          {obl.has_metric && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">metric</Badge>}
          {obl.has_frequency && <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">frequency</Badge>}
          {controlsLoaded && mappedCtrls.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--pacific)]/40 text-[var(--pacific)] hover:bg-[var(--pacific)]/10 transition-colors"
              onClick={() => setCtrlsExpanded(v => !v)}
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              {mappedCtrls.length} control{mappedCtrls.length !== 1 ? "s" : ""}
              {ctrlsExpanded
                ? <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                : <ChevronRight className="h-2.5 w-2.5 ml-0.5" />}
            </button>
          )}
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground leading-snug mt-1.5">{heading}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 space-y-2">
        {hasFullText && (
          <p className="text-sm text-foreground leading-relaxed">{obl.obligation_text}</p>
        )}
        {obl.keywords && obl.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {obl.keywords.slice(0, 6).map((kw: string, k: number) => (
              <span key={k} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{kw}</span>
            ))}
          </div>
        )}
        {controlsLoaded && mappedCtrls.length > 0 && ctrlsExpanded && (
          <div className="rounded-lg border border-[var(--pacific)]/20 bg-[var(--pacific)]/[0.03] overflow-hidden divide-y divide-[var(--pacific)]/5">
            {mappedCtrls.sort((a, b) => b.match_score - a.match_score).map((ctrl, ci) => (
              <div key={ci} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/20 transition-colors">
                <ShieldCheck className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${CTRL_TYPE_ICON_COLOR[ctrl.control_type] ?? "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{ctrl.control_name}</span>
                    <button
                      type="button"
                      className="text-[9px] font-mono text-[var(--pacific)] bg-[var(--pacific)]/10 hover:bg-[var(--pacific)]/20 border border-[var(--pacific)]/30 rounded px-1.5 py-0.5 transition-colors"
                      onClick={() => onControlClick(ctrl.control_id)}
                    >
                      ↗ {ctrl.control_id}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground capitalize">{ctrl.domain.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-muted-foreground">· {ctrl.control_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ctrl.match_score >= 0.7 ? "bg-emerald-500" : ctrl.match_score >= 0.4 ? "bg-amber-500" : "bg-red-400"}`}
                      style={{ width: `${Math.round(ctrl.match_score * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{Math.round(ctrl.match_score * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RegulatoryLibraryPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { pendingObligationId, setPendingObligationId, setPendingControlId } = useCrossNav();
  const {
    libraryDocuments,
    setLibraryDocuments,
    libraryLoading,
    setLibraryLoading,
  } = useRegulatoryTesting();

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
  const [libraryFiles, setLibraryFiles] = useState<File[]>([]);
  const [libraryIngesting, setLibraryIngesting] = useState(false);
  const [libraryIngestResults, setLibraryIngestResults] = useState<any[]>([]);

  // Right-panel view control
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("dashboard");

  // Obligation viewer state
  const [selectedLibraryDoc, setSelectedLibraryDoc] = useState<LibraryDocument | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [libraryDomainFilter, setLibraryDomainFilter] = useState<string>("all");
  const [libraryEnforcementFilter, setLibraryEnforcementFilter] = useState<string>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [obligationCache, setObligationCache] = useState<Record<string, LibraryDocument>>({});

  // Gap analysis state
  const [gapSelectedIds, setGapSelectedIds] = useState<Set<string>>(new Set());
  const [gapLoading, setGapLoading] = useState(false);
  const [gapResults, setGapResults] = useState<GapResults | null>(null);
  const [gapExpandedDomain, setGapExpandedDomain] = useState<string | null>(null);

  // Dashboard obligations state
  const [dashboardObligations, setDashboardObligations] = useState<any[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardDomainFilter, setDashboardDomainFilter] = useState("all");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [dashboardViewMode, setDashboardViewMode] = useState<"all" | "merged">("all");
  const [mergedObligations, setMergedObligations] = useState<any[] | null>(null);
  const [mergedObligationsLoading, setMergedObligationsLoading] = useState(false);

  // Clear library state
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Controls reverse-mapping state
  const [allControls, setAllControls] = useState<any[]>([]);
  const [controlsLoaded, setControlsLoaded] = useState(false);

  // Cross-library analysis toggle + metric drill-down popup
  const [showCrossAnalysis, setShowCrossAnalysis] = useState(false);
  const [crossMetricDialog, setCrossMetricDialog] = useState<{ title: string; obligations: any[] } | null>(null);

  // Build obligation_id → controls[] reverse index
  const obligationControlMap = useMemo(() => {
    const map = new Map<string, MappedControlEntry[]>();
    for (const ctrl of allControls) {
      const mappedObls: any[] = ctrl.mapped_obligations ?? [];
      for (const obl of mappedObls) {
        const oblId = obl.obligation_id;
        if (!oblId) continue;
        const entry: MappedControlEntry = {
          control_id: ctrl.control_id,
          control_name: ctrl.control_name,
          domain: ctrl.domain,
          control_type: ctrl.control_type,
          match_score: obl.match_score ?? 0,
          source_filename: ctrl._source_filename,
        };
        const existing = map.get(oblId);
        if (existing) existing.push(entry);
        else map.set(oblId, [entry]);
      }
    }
    return map;
  }, [allControls]);

  useEffect(() => {
    fetchLibraryDocuments();
    fetchAllControls();
  }, []);

  // React to cross-page navigation: jump to a specific obligation
  useEffect(() => {
    if (!pendingObligationId) return;
    setRightPanelView("dashboard");
    setSelectedLibraryDoc(null);
    setDashboardSearch(pendingObligationId);
    setDashboardDomainFilter("all");
    setDashboardViewMode("all");
    setPendingObligationId(null);
  }, [pendingObligationId]);

  // Navigate to controls library focused on a specific control
  const handleControlClick = (controlId: string) => {
    setPendingControlId(controlId);
    setLocation("/controls-library");
  };

  // ── API helpers ───────────────────────────────────────────────────────────

  const fetchLibraryDocuments = async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch(`/api/regulatory-library/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.documents)) {
        if (data.documents.length > 0) {
          setLibraryDocuments(data.documents);
        }
      }
    } catch (err) {
      console.warn("fetchLibraryDocuments failed:", err);
    } finally {
      setLibraryLoading(false);
    }
    fetchAllObligations();
  };

  const fetchAllObligations = async () => {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/regulatory-library/all-obligations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.obligations)) {
        setDashboardObligations(data.obligations);
      }
    } catch (err) {
      console.warn("fetchAllObligations failed:", err);
    } finally {
      setDashboardLoading(false);
    }
  };

  const fetchAllControls = async () => {
    try {
      const res = await fetch("/api/controls-library/all-controls");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.controls)) {
        setAllControls(data.controls);
      }
    } catch {
      // silently ignore — mapped controls are supplementary
    } finally {
      setControlsLoaded(true);
    }
  };

  const fetchMergedObligations = async () => {
    setMergedObligationsLoading(true);
    setMergedObligations(null);
    try {
      const res = await fetch("/api/regulatory-library/merged-obligations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setMergedObligations(data.merged_obligations);
        setDashboardViewMode("merged");
      }
    } catch (err) {
      toast({ title: "Error", description: "Obligation merge failed", variant: "destructive" });
    } finally {
      setMergedObligationsLoading(false);
    }
  };

  const handleLibraryIngest = async () => {
    if (libraryFiles.length === 0) return;
    const selectedModel = localStorage.getItem("selectedModel") || "llama3";
    setLibraryIngesting(true);
    try {
      const formData = new FormData();
      formData.append("selected_model", selectedModel);
      libraryFiles.forEach(f => formData.append("regulation_files", f));
      const res = await fetch(`/api/regulatory-library/ingest`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.error || "Ingest failed");

      const ingested: any[] = data.ingested || [];
      setLibraryIngestResults(ingested);
      setLibraryFiles([]);

      if (ingested.length > 0) {
        const newDocs: LibraryDocument[] = ingested.map((r: any) => ({
          document_id: r.document_id,
          framework_name: r.framework_name || r.filename,
          issuing_authority: r.issuing_authority || "",
          source_filename: r.filename,
          upload_timestamp: new Date().toISOString(),
          model_used: selectedModel,
          total_obligations: r.total_obligations,
          obligations_by_domain: r.obligations_by_domain || {},
        }));
        const existingIds = new Set(libraryDocuments.map((d: LibraryDocument) => d.document_id));
        setLibraryDocuments([...libraryDocuments, ...newDocs.filter(d => !existingIds.has(d.document_id))]);
      }

      await fetchLibraryDocuments();
      await fetchAllObligations();

      const mongoFailed = ingested.some((r: any) => !r.mongo_saved);
      toast({
        title: "Ingested",
        description: mongoFailed
          ? `${data.total_ingested} document(s) extracted. ⚠ MongoDB save failed — obligations visible this session only.`
          : `${data.total_ingested} document(s) added to library`,
        variant: mongoFailed ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Ingest failed", variant: "destructive" });
    } finally {
      setLibraryIngesting(false);
    }
  };

  const handleLibraryDelete = async (documentId: string) => {
    try {
      const res = await fetch(`/api/regulatory-library/documents/${documentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setLibraryDocuments(libraryDocuments.filter(d => d.document_id !== documentId));
      if (selectedLibraryDoc?.document_id === documentId) {
        setSelectedLibraryDoc(null);
        setRightPanelView("dashboard");
      }
      gapSelectedIds.delete(documentId);
      setGapSelectedIds(new Set(gapSelectedIds));
      toast({ title: "Deleted", description: "Document removed from library" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    }
  };

  const handleClearLibrary = async () => {
    setClearingLibrary(true);
    setShowClearConfirm(false);
    try {
      const res = await fetch("/api/regulatory-library/all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Clear failed");
      setLibraryDocuments([]);
      setDashboardObligations([]);
      setMergedObligations(null);
      setSelectedLibraryDoc(null);
      setRightPanelView("dashboard");
      setGapSelectedIds(new Set());
      setGapResults(null);
      toast({ title: "Library cleared", description: `${data.deleted_count} document(s) removed` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Clear failed", variant: "destructive" });
    } finally {
      setClearingLibrary(false);
    }
  };

  const handleLibraryDocClick = async (doc: LibraryDocument) => {
    if (rightPanelView === "gap-analysis") return; // don't navigate while in gap mode
    if (selectedLibraryDoc?.document_id === doc.document_id) {
      setSelectedLibraryDoc(null);
      setRightPanelView("dashboard");
      return;
    }

    if (obligationCache[doc.document_id]) {
      setSelectedLibraryDoc(obligationCache[doc.document_id]);
      setRightPanelView("obligations");
      setLibraryDomainFilter("all");
      setLibrarySearch("");
      return;
    }

    setDetailLoading(true);
    setRightPanelView("obligations");
    try {
      const res = await fetch(`/api/regulatory-library/documents/${doc.document_id}`);
      const data = await res.json();
      if (data.success && data.document) {
        const full: LibraryDocument = data.document;
        setObligationCache(prev => ({ ...prev, [doc.document_id]: full }));
        setSelectedLibraryDoc(full);
        setLibraryDomainFilter("all");
        setLibraryEnforcementFilter("all");
        setLibrarySearch("");
      } else {
        setSelectedLibraryDoc(doc);
        setLibraryDomainFilter("all");
        setLibraryEnforcementFilter("all");
        setLibrarySearch("");
        toast({ title: "Obligations unavailable", description: "Document metadata loaded but obligations could not be retrieved.", variant: "destructive" });
      }
    } catch {
      setSelectedLibraryDoc(doc);
      setLibraryDomainFilter("all");
      setLibrarySearch("");
      toast({ title: "Warning", description: "Could not load obligations — showing document summary only.", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRunGapAnalysis = async () => {
    if (gapSelectedIds.size < 2) {
      toast({ title: "Select at least 2 documents", description: "Gap analysis requires 2 or more documents.", variant: "destructive" });
      return;
    }
    setGapLoading(true);
    setGapResults(null);
    setGapExpandedDomain(null);
    try {
      const selectedModel = localStorage.getItem("selectedModel") || "";
      const res = await fetch(`/api/regulatory-library/gap-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_ids: Array.from(gapSelectedIds),
          selected_model: selectedModel,
          generate_report: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Gap analysis failed");
      setGapResults(data);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Gap analysis failed", variant: "destructive" });
    } finally {
      setGapLoading(false);
    }
  };

  const handleExportGapJson = () => {
    if (!gapResults) return;
    const blob = new Blob([JSON.stringify(gapResults, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "regulatory_gap_analysis.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Results downloaded as JSON" });
  };

  const handleExportGapMarkdown = () => {
    if (!gapResults?.final_report) return;
    const blob = new Blob([gapResults.final_report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "regulatory_gap_analysis.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Report downloaded as Markdown" });
  };

  const [pdfExporting, setPdfExporting] = useState(false);
  const handleExportGapPdf = async () => {
    if (!gapResults?.final_report) return;
    setPdfExporting(true);
    try {
      const res = await fetch("/api/regulatory-library/gap-analysis-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_report: gapResults.final_report }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "PDF generation failed" }));
        throw new Error(err.detail || "PDF generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "regulatory_gap_analysis.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "Report downloaded as PDF" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "PDF export failed", variant: "destructive" });
    } finally {
      setPdfExporting(false);
    }
  };

  const toggleGapDoc = (id: string) => {
    const next = new Set(gapSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setGapSelectedIds(next);
  };

  // ── Filtered obligations ──────────────────────────────────────────────────

  const filteredObligations = selectedLibraryDoc?.obligations?.filter(o =>
    (libraryDomainFilter === "all" || o.domain === libraryDomainFilter) &&
    (libraryEnforcementFilter === "all" || o.enforcement_level === libraryEnforcementFilter) &&
    (librarySearch === "" ||
      (o.obligation_id ?? "").toLowerCase().includes(librarySearch.toLowerCase()) ||
      (o.obligation_text ?? "").toLowerCase().includes(librarySearch.toLowerCase()) ||
      (o.section_reference ?? "").toLowerCase().includes(librarySearch.toLowerCase()))
  ) ?? [];

  // ── Dashboard obligations — filtered list ────────────────────────────────
  const filteredDashboardObligations = useMemo(() => {
    const activeObls = dashboardViewMode === "merged"
      ? (mergedObligations ?? [])
      : dashboardObligations;
    return activeObls.filter(o =>
      (dashboardDomainFilter === "all" || o.domain === dashboardDomainFilter) &&
      (dashboardSearch === "" ||
        (o.obligation_id ?? "").toLowerCase().includes(dashboardSearch.toLowerCase()) ||
        (o.obligation_text ?? "").toLowerCase().includes(dashboardSearch.toLowerCase()) ||
        (o.section_reference ?? "").toLowerCase().includes(dashboardSearch.toLowerCase()))
    );
  }, [dashboardObligations, mergedObligations, dashboardViewMode, dashboardDomainFilter, dashboardSearch]);

  // ── Dashboard metrics ─────────────────────────────────────────────────────

  const allDomainCounts: Record<string, number> = {};
  let totalObligations = 0;

  for (const doc of libraryDocuments) {
    totalObligations += doc.total_obligations ?? 0;
    for (const [domain, count] of Object.entries(doc.obligations_by_domain ?? {})) {
      allDomainCounts[domain] = (allDomainCounts[domain] ?? 0) + count;
    }
  }

  const sortedDomains = Object.entries(allDomainCounts).sort((a, b) => b[1] - a[1]);

  // ── Cross-library metrics ─────────────────────────────────────────────────
  const coveredObligationIds = new Set<string>(
    allControls.flatMap(c => (c.mapped_obligations ?? []).map((o: any) => o.obligation_id).filter(Boolean))
  );
  const coveredObligations = coveredObligationIds.size;
  const gapObligations = Math.max(0, totalObligations - coveredObligations);
  const oblCoveragePct = totalObligations > 0 ? (coveredObligations / totalObligations) * 100 : 0;
  const ctrlWithMapping = allControls.filter(c => (c.mapped_obligations?.length ?? 0) > 0).length;
  const ctrlCoveragePct = allControls.length > 0 ? (ctrlWithMapping / allControls.length) * 100 : 0;
  const frameworkNames = Array.from(new Set(libraryDocuments.map(d => d.framework_name).filter(Boolean)));
  const hasCrossData = controlsLoaded && allControls.length > 0 && totalObligations > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">
      <HeroSection title="Regulatory Library" subtitle="Browse and analyse regulatory frameworks and obligations" icon={Library} />
      <div className="flex-1 flex overflow-hidden">

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col bg-background/50 overflow-hidden transition-[width] duration-200" style={{ width: leftPanelOpen ? panelWidth : 0 }}>

        {/* Upload section */}
        <div className="p-4 border-b space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Add Documents
          </h2>

          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              libraryFiles.length > 0
                ? "border-primary/50 bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onClick={() => document.getElementById("lib-file-input")?.click()}
          >
            <input
              id="lib-file-input"
              type="file"
              multiple
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (files.length) setLibraryFiles(prev => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-foreground font-medium">Click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, TXT or MD</p>
          </div>

          {libraryFiles.length > 0 && (
            <div className="space-y-1.5">
              <div className="max-h-32 overflow-auto space-y-1">
                {libraryFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <span className="truncate flex-1 mr-1">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0"
                      onClick={() => setLibraryFiles(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full text-xs"
                disabled={libraryIngesting}
                onClick={handleLibraryIngest}
              >
                {libraryIngesting ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1.5" />
                    Extract & Save
                  </>
                )}
              </Button>
            </div>
          )}

          {libraryIngestResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-green-600">Recently added</p>
              {libraryIngestResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded">
                  <span className="font-medium truncate">{r.framework_name || r.filename}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <Badge variant="outline" className="text-green-700 border-green-400 text-[10px]">{r.total_obligations}</Badge>
                    {!r.mongo_saved && (
                      <Badge variant="outline" className="text-orange-600 border-orange-400 text-[10px]" title="Not persisted">⚠ no DB</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Library header with view toggles */}
        <div className="flex items-center justify-between px-4 py-2 border-b gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
            Library
            {libraryDocuments.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{libraryDocuments.length}</Badge>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant={rightPanelView === "dashboard" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              title="Library Dashboard"
              onClick={() => { setRightPanelView("dashboard"); setSelectedLibraryDoc(null); }}
            >
              <LayoutDashboard className="h-3 w-3" />
            </Button>
            <Button
              variant={rightPanelView === "gap-analysis" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              title="Gap Analysis"
              onClick={() => { setRightPanelView("gap-analysis"); setSelectedLibraryDoc(null); setGapResults(null); }}
            >
              <GitCompare className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchLibraryDocuments} disabled={libraryLoading}>
              <RotateCcw className={`h-3 w-3 ${libraryLoading ? "animate-spin" : ""}`} />
            </Button>
            {libraryDocuments.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Clear entire library"
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
            <p className="text-xs font-medium text-destructive">Clear entire regulatory library?</p>
            <p className="text-[11px] text-muted-foreground">This will permanently delete all {libraryDocuments.length} document(s) and their obligations.</p>
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

        <ScrollArea className="flex-1">
          {libraryLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}
          {!libraryLoading && libraryDocuments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">
              No documents yet. Upload a regulatory document above.
            </p>
          )}
          {!libraryLoading && libraryDocuments.length > 0 && (
            <div className="p-2 space-y-1">
              {libraryDocuments.map((doc, i) => {
                const isSelected = selectedLibraryDoc?.document_id === doc.document_id;
                const isGapChecked = gapSelectedIds.has(doc.document_id);
                return (
                  <div
                    key={i}
                    className={`rounded-lg border cursor-pointer transition-colors group ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : isGapChecked
                          ? "border-blue-500 bg-blue-500/5"
                          : "hover:border-primary/50 hover:bg-muted/40"
                    }`}
                    onClick={() => rightPanelView === "gap-analysis" ? toggleGapDoc(doc.document_id) : handleLibraryDocClick(doc)}
                  >
                    <div className="flex items-start justify-between p-2.5 gap-1">
                      {rightPanelView === "gap-analysis" && (
                        <div className={`w-4 h-4 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                          isGapChecked ? "bg-blue-500 border-blue-500" : "border-muted-foreground/40"
                        }`}>
                          {isGapChecked && <span className="text-white text-[10px] leading-none">✓</span>}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words leading-snug">{doc.framework_name}</p>
                        <p className="text-xs text-muted-foreground break-all leading-snug mt-0.5">{doc.source_filename}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {doc.total_obligations} obligations
                          </Badge>
                        </div>
                      </div>
                      {rightPanelView !== "gap-analysis" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 self-start mt-0.5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={e => { e.stopPropagation(); handleLibraryDelete(doc.document_id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Gap analysis run button */}
        {rightPanelView === "gap-analysis" && (
          <div className="p-3 border-t space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              {gapSelectedIds.size < 2
                ? `Select ${2 - gapSelectedIds.size} more doc${gapSelectedIds.size === 0 ? "s" : ""}`
                : `${gapSelectedIds.size} docs selected`}
            </p>
            <Button
              size="sm"
              className="w-full text-xs"
              disabled={gapSelectedIds.size < 2 || gapLoading}
              onClick={handleRunGapAnalysis}
            >
              {gapLoading ? (
                <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5" />Analyzing...</>
              ) : (
                <><GitCompare className="h-3 w-3 mr-1.5" />Run Analysis</>
              )}
            </Button>
            {gapSelectedIds.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => { setGapSelectedIds(new Set()); setGapResults(null); }}
              >
                Clear selection
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── DRAG DIVIDER ─────────────────────────────────────────────────── */}
      {leftPanelOpen && (
        <div
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
          onMouseDown={onDividerMouseDown}
          title="Drag to resize"
        />
      )}

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── PANEL TOGGLE ─────────────────────────────────────────────── */}
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
        </div>

        {/* ── DASHBOARD VIEW ─────────────────────────────────────────────── */}
        {rightPanelView === "dashboard" && (
          libraryDocuments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Library className="h-8 w-8 opacity-30" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Library is empty</p>
                <p className="text-xs text-muted-foreground">Upload regulatory documents on the left to begin</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">

                {/* Page heading */}
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight">Library Dashboard</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Aggregate metrics across all ingested regulations</p>
                  </div>
                  <Badge variant="outline" className="text-xs gap-1.5 px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    {libraryDocuments.length} document{libraryDocuments.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: "Documents", value: libraryDocuments.length.toString(), sub: "in library", accent: "from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-800", icon: "📄" },
                    { label: "Obligations", value: totalObligations.toLocaleString(), sub: "total extracted", accent: "from-violet-500/10 to-violet-500/5 border-violet-200 dark:border-violet-800", icon: "📋" },
                    { label: "Domains", value: sortedDomains.length.toString(), sub: "areas covered", accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-200 dark:border-emerald-800", icon: "🏷️" },
                  ].map(({ label, value, sub, accent, icon }) => (
                    <div key={label} className={`rounded-xl border bg-gradient-to-br ${accent} p-4`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                          <p className="text-3xl font-bold mt-1 leading-none">{value}</p>
                          <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
                        </div>
                        <span className="text-xl opacity-60">{icon}</span>
                      </div>
                    </div>
                  ))}
                  {/* Merged KPI card */}
                  <div
                    className="rounded-xl border bg-card p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={mergedObligations !== null
                      ? () => setDashboardViewMode("merged")
                      : fetchMergedObligations
                    }
                  >
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Merged</p>
                    <p className="text-3xl font-bold mt-1 leading-none flex items-center gap-1">
                      {mergedObligationsLoading
                        ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary inline-block" />
                        : mergedObligations !== null ? mergedObligations.length : "—"
                      }
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {mergedObligations !== null ? "after deduplication" : "click to compute"}
                    </p>
                  </div>
                </div>

                {/* Cross-Library Analysis card */}
                {(hasCrossData || (controlsLoaded && allControls.length === 0)) && (
                  <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#00338D] to-[#1E49E2] p-5 text-white space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/60 mb-0.5">
                          Cross-Library Analysis
                        </p>
                        <h3 className="text-base font-bold">Regulation–Controls Coverage</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCrossAnalysis(v => !v)}
                        className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-white/30 text-white hover:bg-white/10 transition-colors flex items-center gap-1.5"
                      >
                        {showCrossAnalysis ? "Hide Breakdown" : "View Full Analysis"} <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Stats row */}
                    {hasCrossData ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                          {
                            value: `${oblCoveragePct.toFixed(0)}%`,
                            label: "obligations covered",
                            color: oblCoveragePct >= 75 ? "#00FF88" : oblCoveragePct >= 50 ? "#EAAA00" : "#FF6B6B",
                          },
                          { value: totalObligations.toLocaleString(), label: "total obligations", color: "#00B8F5" },
                          {
                            value: String(gapObligations),
                            label: "gap obligations",
                            color: gapObligations === 0 ? "#00FF88" : "#EAAA00",
                          },
                          { value: String(allControls.length), label: "controls assessed", color: "#ffffff" },
                        ].map(({ value, label, color }) => (
                          <div key={label}>
                            <p className="text-2xl font-bold leading-none" style={{ color }}>{value}</p>
                            <p className="text-[11px] text-white/60 mt-1">{label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-white/50">Load the Controls Library to see cross-library metrics.</p>
                    )}

                    {/* Framework pills */}
                    {frameworkNames.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {frameworkNames.map((name, i) => (
                          <span key={i} className="text-[11px] font-medium px-3 py-1 rounded-full border border-white/20 bg-white/10 text-white/80">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded breakdown */}
                    {showCrossAnalysis && hasCrossData && (() => {
                      // Deduplicate by obligation_id (same ID can appear across multiple docs)
                      const dedup = (obls: any[]) =>
                        Array.from(new Map(obls.filter(o => o.obligation_id).map(o => [o.obligation_id, o])).values());

                      const coveredObls = dedup(dashboardObligations.filter(o => o.obligation_id && coveredObligationIds.has(o.obligation_id)));
                      const gapObls    = dedup(dashboardObligations.filter(o => o.obligation_id && !coveredObligationIds.has(o.obligation_id)));
                      const allObls    = dedup(dashboardObligations);

                      const metrics = [
                        {
                          icon: "📊",
                          metric: "Obligations Coverage",
                          value: `${oblCoveragePct.toFixed(1)}%`,
                          color: oblCoveragePct >= 75 ? "#00FF88" : oblCoveragePct >= 50 ? "#EAAA00" : "#FF6B6B",
                          explanation: `${coveredObls.length} of ${allObls.length} unique obligations are addressed by at least one control.`,
                          obligations: coveredObls,
                          dialogTitle: `Covered Obligations (${coveredObls.length})`,
                        },
                        {
                          icon: "🔴",
                          metric: "Gap Obligations",
                          value: String(gapObls.length),
                          color: gapObls.length === 0 ? "#00FF88" : "#EAAA00",
                          explanation: gapObls.length === 0
                            ? "All obligations have at least one mapped control — no gaps."
                            : `${gapObls.length} obligations have no mapped controls. These are compliance risk areas.`,
                          obligations: gapObls,
                          dialogTitle: `Gap Obligations — No Control Coverage (${gapObls.length})`,
                        },
                        {
                          icon: "📋",
                          metric: "Total Obligations",
                          value: allObls.length.toLocaleString(),
                          color: "#00B8F5",
                          explanation: `${allObls.length} unique obligations across ${libraryDocuments.length} document(s): ${frameworkNames.join(", ") || "unknown frameworks"}.`,
                          obligations: allObls,
                          dialogTitle: `All Obligations (${allObls.length})`,
                        },
                        {
                          icon: "🏷️",
                          metric: "Domain Coverage",
                          value: `${sortedDomains.length} domains`,
                          color: "#ffffff",
                          explanation: `Obligations span ${sortedDomains.length} domains. Domains with many obligations but few controls are highest-risk gaps.`,
                          obligations: [] as any[],
                          dialogTitle: "",
                        },
                      ];
                      return (
                        <div className="mt-2 rounded-xl bg-white/10 border border-white/20 p-4 space-y-1">
                          <p className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">Metric Breakdown — click to view obligations</p>
                          {metrics.map(({ icon, metric, value, color, explanation, obligations, dialogTitle }) => (
                            <button
                              key={metric}
                              type="button"
                              disabled={obligations.length === 0}
                              className="w-full flex items-start gap-3 text-left rounded-lg px-3 py-2.5 hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-default group"
                              onClick={() => obligations.length > 0 && setCrossMetricDialog({ title: dialogTitle, obligations })}
                            >
                              <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-white/90">{metric}</span>
                                  <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
                                  {obligations.length > 0 && (
                                    <ArrowRight className="h-3 w-3 text-white/40 ml-auto group-hover:text-white/70 transition-colors" />
                                  )}
                                </div>
                                <p className="text-[11px] text-white/55 mt-0.5 leading-relaxed">{explanation}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Domain Distribution — clickable filter bars */}
                {sortedDomains.length > 0 && (
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
                    <p className="text-[11px] text-muted-foreground -mt-1">Click a bar to filter obligations below</p>
                    <div className="space-y-1.5">
                      {sortedDomains.map(([domain, count], i) => {
                        const hue = HUES[i % HUES.length];
                        const maxCount = sortedDomains[0]?.[1] ?? 1;
                        const pct = Math.round((count / maxCount) * 100);
                        const isActive = dashboardDomainFilter === domain;
                        return (
                          <div
                            key={domain}
                            className={`flex items-center gap-3 rounded-lg px-2 py-1 cursor-pointer transition-colors ${
                              isActive ? "ring-1 ring-primary/30 bg-primary/5" : "hover:bg-muted/50"
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
                            <span className="text-xs text-muted-foreground w-8 text-right shrink-0 font-medium">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All / Merged Obligations list */}
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="p-3 border-b bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">
                          {dashboardViewMode === "merged" ? "Merged Obligations" : "All Obligations"}
                          {dashboardDomainFilter !== "all" && (
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground capitalize">
                              — {dashboardDomainFilter.replace(/_/g, " ")}
                            </span>
                          )}
                        </h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {filteredDashboardObligations.length} shown
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={dashboardViewMode === "all" ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => setDashboardViewMode("all")}
                        >
                          <BookOpen className="h-3 w-3 mr-1" />
                          All
                        </Button>
                        <Button
                          size="sm"
                          variant={dashboardViewMode === "merged" ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={mergedObligations !== null
                            ? () => setDashboardViewMode("merged")
                            : fetchMergedObligations
                          }
                          disabled={mergedObligationsLoading}
                        >
                          {mergedObligationsLoading
                            ? <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1 inline-block" />
                            : <Layers className="h-3 w-3 mr-1" />
                          }
                          Merged
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="pl-8 h-7 text-xs"
                        placeholder="Search obligations…"
                        value={dashboardSearch}
                        onChange={e => setDashboardSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {dashboardLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  ) : filteredDashboardObligations.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      {dashboardObligations.length === 0 ? "No obligations loaded." : "No obligations match the current filter."}
                    </p>
                  ) : (
                    <div className="divide-y">
                      {filteredDashboardObligations.map((obl, i) => {
                        const hue = HUES[sortedDomains.findIndex(([d]) => d === obl.domain) % HUES.length];
                        const mappedCtrls = obligationControlMap.get(obl.obligation_id) ?? [];
                        return (
                          <DashboardOblRow
                            key={`${obl.obligation_id ?? ""}::${obl.source_filename ?? ""}::${i}`}
                            obl={obl}
                            hue={hue}
                            dashboardViewMode={dashboardViewMode}
                            mappedCtrls={mappedCtrls}
                            controlsLoaded={controlsLoaded}
                            onControlClick={handleControlClick}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </ScrollArea>
          )
        )}

        {/* ── OBLIGATION VIEWER ──────────────────────────────────────────── */}
        {rightPanelView === "obligations" && (
          detailLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-sm">Loading obligations...</p>
            </div>
          ) : !selectedLibraryDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Library className="h-12 w-12 opacity-20" />
              <p className="text-sm">Select a document from the library to view its obligations</p>
            </div>
          ) : (
            <>
              {/* Framework header */}
              <div className="p-5 border-b bg-background/50 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold truncate">{selectedLibraryDoc.framework_name}</h1>
                    <p className="text-sm text-muted-foreground">
                      {selectedLibraryDoc.issuing_authority}
                      {selectedLibraryDoc.upload_timestamp && (
                        <> · Loaded {new Date(selectedLibraryDoc.upload_timestamp).toLocaleDateString()}</>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedLibraryDoc.source_filename}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-sm px-3 py-1">
                    {selectedLibraryDoc.total_obligations} obligations
                  </Badge>
                </div>

                {selectedLibraryDoc.obligations_by_domain && (() => {
                  const sorted = Object.entries(selectedLibraryDoc.obligations_by_domain).sort((a, b) => b[1] - a[1]);
                  return (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Domain coverage</p>
                      <div className="flex h-2 rounded-full overflow-hidden gap-px">
                        {sorted.map(([domain, count], i) => {
                          const pct = Math.round((count / selectedLibraryDoc.total_obligations) * 100);
                          return (
                            <div
                              key={domain}
                              title={`${domain.replace(/_/g, " ")}: ${count} (${pct}%)`}
                              style={{ width: `${pct}%`, backgroundColor: `hsl(${HUES[i % HUES.length]},60%,55%)` }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {sorted.map(([domain, count], i) => {
                          const pct = Math.round((count / selectedLibraryDoc.total_obligations) * 100);
                          return (
                            <div key={domain} className="flex items-center gap-1">
                              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: `hsl(${HUES[i % HUES.length]},60%,55%)` }} />
                              <span className="text-xs text-muted-foreground capitalize">
                                {domain.replace(/_/g, " ")}{" "}
                                <span className="text-foreground font-medium">{pct}%</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Domain filter chips + search */}
              <div className="p-4 border-b space-y-3 bg-background/30">
                {selectedLibraryDoc.obligations && selectedLibraryDoc.obligations_by_domain && (
                  <div className="space-y-2">
                    {/* Domain filter */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Domain</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant={libraryDomainFilter === "all" ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => setLibraryDomainFilter("all")}
                        >
                          All
                        </Badge>
                        {Object.entries(selectedLibraryDoc.obligations_by_domain)
                          .sort((a, b) => b[1] - a[1])
                          .map(([domain, count]) => (
                            <Badge
                              key={domain}
                              variant={libraryDomainFilter === domain ? "default" : "outline"}
                              className="cursor-pointer text-xs capitalize"
                              onClick={() => setLibraryDomainFilter(domain)}
                            >
                              {domain.replace(/_/g, " ")} ({count})
                            </Badge>
                          ))}
                      </div>
                    </div>

                    {/* Enforcement filter */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Enforcement</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { key: "all",         label: "All" },
                          { key: "mandatory",   label: "Mandatory" },
                          { key: "recommended", label: "Recommended" },
                          { key: "optional",    label: "Optional" },
                        ].map(({ key, label }) => (
                          <Badge
                            key={key}
                            variant={libraryEnforcementFilter === key ? "default" : "outline"}
                            className={`cursor-pointer text-xs ${libraryEnforcementFilter !== key ? (ENFORCEMENT_COLOR[key] ?? "") : ""}`}
                            onClick={() => setLibraryEnforcementFilter(key)}
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedLibraryDoc.obligations && (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search obligations..."
                        value={librarySearch}
                        onChange={e => setLibrarySearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {librarySearch && (
                        <button onClick={() => setLibrarySearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Showing {filteredObligations.length} of {selectedLibraryDoc.total_obligations} obligations
                    </p>
                  </>
                )}
              </div>

              {/* Obligation list */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3 pr-5">
                  {!selectedLibraryDoc.obligations && (
                    <div className="text-center py-12 space-y-2">
                      <p className="text-muted-foreground text-sm">Obligations not available in database.</p>
                      <p className="text-muted-foreground text-xs">Re-ingest to restore them.</p>
                    </div>
                  )}
                  {selectedLibraryDoc.obligations && filteredObligations.length === 0 && (
                    <p className="text-center text-muted-foreground py-12 text-sm">No obligations match the current filter</p>
                  )}
                  {filteredObligations.map((obl, j) => {
                    const oblText = obl.obligation_text ?? "";
                    const heading = oblText.length > 120
                      ? oblText.slice(0, 120).replace(/\s\S*$/, "") + "…"
                      : oblText;
                    const hasFullText = oblText.length > 120;
                    const mappedCtrls = obligationControlMap.get(obl.obligation_id) ?? [];

                    return (
                      <ObligationCard
                        key={obl.obligation_id ?? j}
                        obl={obl}
                        heading={heading}
                        hasFullText={hasFullText}
                        mappedCtrls={mappedCtrls}
                        controlsLoaded={controlsLoaded}
                        onControlClick={handleControlClick}
                      />
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )
        )}

        {/* ── GAP ANALYSIS VIEW ─────────────────────────────────────────── */}
        {rightPanelView === "gap-analysis" && (
          gapLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">Running gap analysis</p>
                <p className="text-xs">Comparing obligations across {gapSelectedIds.size} documents…</p>
              </div>
            </div>
          ) : !gapResults ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <GitCompare className="h-8 w-8 opacity-30" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Select documents to compare</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Check 2 or more documents in the left panel, then click <span className="font-medium text-foreground">Run Analysis</span> to compare obligations, identify shared coverage, and surface gaps.
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">

                {/* Page heading */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight">Gap Analysis</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {gapResults.gap_summary.total_documents} documents · {gapResults.gap_summary.total_domains} domains compared
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => { setGapResults(null); setGapSelectedIds(new Set()); }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1.5" />
                    New Analysis
                  </Button>
                </div>

                {/* Export buttons row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {gapResults.graph_context_used && (
                    <Badge variant="outline" className="text-xs gap-1 border-emerald-400 text-emerald-600 dark:text-emerald-400">
                      <Network className="h-3 w-3" />
                      Graph-enriched
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7" onClick={handleExportGapJson}>
                    <Download className="h-3 w-3" />
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5 h-7"
                    onClick={handleExportGapMarkdown}
                    disabled={!gapResults.final_report}
                  >
                    <Download className="h-3 w-3" />
                    Report (MD)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5 h-7"
                    onClick={handleExportGapPdf}
                    disabled={!gapResults.final_report || pdfExporting}
                  >
                    {pdfExporting
                      ? <><span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1" />Generating…</>
                      : <><Download className="h-3 w-3" />Report (PDF)</>
                    }
                  </Button>
                </div>

                {/* Documents compared strip */}
                <div className="flex gap-2 flex-wrap">
                  {Object.values(gapResults.documents).map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/30 text-xs">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: `hsl(${HUES[i % HUES.length]},60%,55%)` }}
                      />
                      <span className="font-medium">{doc.framework_name}</span>
                      <span className="text-muted-foreground">{doc.total_obligations} obligations</span>
                    </div>
                  ))}
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Shared Domains",
                      value: gapResults.gap_summary.shared_domain_count,
                      sub: "in all documents",
                      accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-200 dark:border-emerald-800",
                      valueColor: "text-emerald-600",
                      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
                    },
                    {
                      label: "Partial Coverage",
                      value: gapResults.gap_summary.partial_coverage_domain_count,
                      sub: "domains in some only",
                      accent: "from-amber-500/10 to-amber-500/5 border-amber-200 dark:border-amber-800",
                      valueColor: "text-amber-600",
                      icon: <Minus className="h-4 w-4 text-amber-500" />,
                    },
                    {
                      label: "Total Domains",
                      value: gapResults.gap_summary.total_domains,
                      sub: "across all documents",
                      accent: "from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-800",
                      valueColor: "text-blue-600",
                      icon: <AlertTriangle className="h-4 w-4 text-blue-500" />,
                    },
                  ].map(({ label, value, sub, accent, valueColor, icon }) => (
                    <div key={label} className={`rounded-xl border bg-gradient-to-br ${accent} p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                        {icon}
                      </div>
                      <p className={`text-3xl font-bold leading-none ${valueColor}`}>{value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Domain coverage matrix */}
                <Card className="shadow-none">
                  <CardHeader className="px-4 pt-4 pb-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Domain Coverage Matrix</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide min-w-[150px]">Domain</th>
                            {Object.entries(gapResults.documents).map(([, doc], i) => (
                              <th key={i} className="px-3 py-2.5 text-center min-w-[96px]" title={doc.source_filename}>
                                <div className="flex flex-col items-center gap-1">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: `hsl(${HUES[i % HUES.length]},60%,55%)` }}
                                  />
                                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate max-w-[80px] block">{doc.framework_name}</span>
                                </div>
                              </th>
                            ))}
                            <th className="px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Coverage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(gapResults.domain_coverage)
                            .sort((a, b) => b[1].coverage_pct - a[1].coverage_pct)
                            .map(([domain, info]) => {
                              const isFullyCovered = info.coverage_pct === 100;
                              const isPartial = info.coverage_pct > 0 && info.coverage_pct < 100;
                              return (
                                <tr
                                  key={domain}
                                  className={`border-b last:border-0 transition-colors ${
                                    isFullyCovered ? "hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
                                    : isPartial    ? "hover:bg-amber-50/30 dark:hover:bg-amber-950/10"
                                    : "hover:bg-muted/20"
                                  }`}
                                >
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        isFullyCovered ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-red-400"
                                      }`} />
                                      <span className="capitalize font-medium">{domain.replace(/_/g, " ")}</span>
                                    </div>
                                  </td>
                                  {Object.keys(gapResults.documents).map((docId) => (
                                    <td key={docId} className="px-3 py-2.5 text-center">
                                      {info.present_in.includes(docId) ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                          </div>
                                          <span className="text-[10px] text-muted-foreground font-medium">{info.obligation_counts[docId]}</span>
                                        </div>
                                      ) : (
                                        <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto">
                                          <X className="h-3 w-3 text-red-500" />
                                        </div>
                                      )}
                                    </td>
                                  ))}
                                  <td className="px-3 py-2.5 text-center">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      isFullyCovered
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                        : isPartial
                                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                                    }`}>
                                      {info.coverage_pct}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Similarities */}
                {gapResults.similarities.length > 0 && (
                  <Card className="shadow-none">
                    <CardHeader className="px-4 pt-4 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Similarities</CardTitle>
                        <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400">
                          {gapResults.similarities.length} shared domain{gapResults.similarities.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {gapResults.similarities.map((sim, i) => {
                        const isOpen = gapExpandedDomain === `sim-${i}`;
                        return (
                          <div key={i} className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 transition-colors text-left"
                              onClick={() => setGapExpandedDomain(isOpen ? null : `sim-${i}`)}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-medium text-sm capitalize">{sim.domain.replace(/_/g, " ")}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 ml-3">
                                {Object.entries(sim.docs).map(([docId, info], di) => (
                                  <div key={docId} className="flex items-center gap-1">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ backgroundColor: `hsl(${HUES[di % HUES.length]},60%,55%)` }}
                                    />
                                    <span className="text-[11px] text-muted-foreground">{info.count}</span>
                                  </div>
                                ))}
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                              </div>
                            </button>
                            {isOpen && (
                              <div className="border-t border-emerald-200/60 dark:border-emerald-800/40 divide-y divide-muted/50">
                                {Object.entries(sim.docs).map(([docId, info], di) => (
                                  <div key={docId} className="p-4 bg-muted/5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{ backgroundColor: `hsl(${HUES[di % HUES.length]},60%,55%)` }}
                                        />
                                        <p className="text-xs font-semibold">{gapResults.documents[docId]?.framework_name}</p>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{info.count} obligations</span>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {Object.entries(info.enforcement_breakdown).filter(([, v]) => v > 0).map(([lvl, cnt]) => (
                                        <Badge key={lvl} variant="outline" className={`text-[10px] ${ENFORCEMENT_COLOR[lvl] ?? ""}`}>{lvl}: {cnt}</Badge>
                                      ))}
                                    </div>
                                    <div className="space-y-1.5">
                                      {info.sample_obligations.map((obl, k) => (
                                        <p key={k} className="text-xs text-muted-foreground leading-relaxed border-l-2 border-emerald-300 dark:border-emerald-700 pl-3">{obl.text}</p>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Differences */}
                {gapResults.differences.length > 0 && (
                  <Card className="shadow-none">
                    <CardHeader className="px-4 pt-4 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Differences</CardTitle>
                        <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400">
                          {gapResults.differences.length} domain{gapResults.differences.length !== 1 ? "s" : ""} partially covered
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {gapResults.differences.map((diff, i) => {
                        const pct = diff.coverage_pct;
                        const pctColor = pct >= 66 ? "text-amber-600" : "text-red-600";
                        const barColor = pct >= 66 ? "bg-amber-500" : "bg-red-500";
                        return (
                          <div key={i} className="rounded-lg border p-3.5 space-y-2.5 hover:bg-muted/20 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-0.5" />
                                <span className="text-sm font-medium capitalize">{diff.domain.replace(/_/g, " ")}</span>
                              </div>
                              <span className={`text-sm font-bold shrink-0 ${pctColor}`}>{pct}%</span>
                            </div>
                            {/* Mini progress bar */}
                            <div className="w-full bg-muted/60 rounded-full h-1">
                              <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {diff.present_in.map(id => (
                                <div key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  {gapResults.documents[id]?.framework_name}
                                  <span className="opacity-70">({diff.obligation_counts[id]})</span>
                                </div>
                              ))}
                              {diff.absent_in.map(id => (
                                <div key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                  <X className="h-2.5 w-2.5" />
                                  {gapResults.documents[id]?.framework_name}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Unique obligations per doc */}
                <Card className="shadow-none">
                  <CardHeader className="px-4 pt-4 pb-3">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unique to Each Document</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {Object.entries(gapResults.unique_by_doc).map(([docId, unique], di) => (
                      <div key={docId} className="rounded-xl border overflow-hidden">
                        {/* Doc header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: `hsl(${HUES[di % HUES.length]},60%,55%)` }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{gapResults.documents[docId]?.framework_name}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {unique.unique_domain_count} unique domain{unique.unique_domain_count !== 1 ? "s" : ""} · {unique.unique_obligation_count} unique obligation{unique.unique_obligation_count !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0 ml-2">
                            <Badge variant="secondary" className="text-[11px] px-2">{unique.unique_domain_count}d</Badge>
                            <Badge variant="outline" className="text-[11px] px-2">{unique.unique_obligation_count}o</Badge>
                          </div>
                        </div>

                        {unique.unique_domains.length > 0 ? (
                          <div className="px-4 py-3 space-y-3">
                            {/* Domain chips */}
                            <div className="flex flex-wrap gap-1.5">
                              {unique.unique_domains.map(d => (
                                <span
                                  key={d}
                                  className="text-[11px] px-2.5 py-1 rounded-full border capitalize font-medium"
                                  style={{
                                    backgroundColor: `hsl(${HUES[di % HUES.length]},60%,95%)`,
                                    borderColor: `hsl(${HUES[di % HUES.length]},60%,80%)`,
                                    color: `hsl(${HUES[di % HUES.length]},50%,35%)`,
                                  }}
                                >
                                  {d.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                            {/* Sample obligations */}
                            {unique.sample_obligations.length > 0 && (
                              <div className="space-y-2 pt-0.5">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Sample obligations</p>
                                {unique.sample_obligations.map((obl, k) => (
                                  <div key={k} className="flex gap-2.5 items-start">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] shrink-0 mt-0.5 ${ENFORCEMENT_COLOR[obl.enforcement] ?? ""}`}
                                    >
                                      {obl.enforcement}
                                    </Badge>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{obl.text}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-4 py-4 flex items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            <p className="text-xs">All domains shared with at least one other document.</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Full LLM-generated report viewer */}
                {gapResults.final_report && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                        <FileText className="h-3.5 w-3.5" />
                        View Full Analysis Report
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 p-5 rounded-xl border bg-card text-sm prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {gapResults.final_report}
                        </ReactMarkdown>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

              </div>
            </ScrollArea>
          )
        )}
      </div>
      </div>

      {/* ── Cross-Library Metric Obligation Popup ────────────────────────── */}
      <Dialog open={!!crossMetricDialog} onOpenChange={open => { if (!open) setCrossMetricDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">{crossMetricDialog?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0" type="always">
            <div className="divide-y">
              {(crossMetricDialog?.obligations ?? []).map((obl: any, i: number) => (
                <DialogOblRow
                  key={obl.obligation_id ?? i}
                  obl={obl}
                  mappedCtrls={obligationControlMap.get(obl.obligation_id) ?? []}
                  onControlClick={handleControlClick}
                  onObligationClick={(oblId) => {
                    setCrossMetricDialog(null);
                    setRightPanelView("dashboard");
                    setSelectedLibraryDoc(null);
                    setDashboardSearch(oblId);
                    setDashboardDomainFilter("all");
                    setDashboardViewMode("all");
                  }}
                />
              ))}
              {(crossMetricDialog?.obligations ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">No obligations to display.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

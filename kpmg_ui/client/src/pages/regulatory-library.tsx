import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Upload, FileText, X, Play, RotateCcw, BookOpen, Search, Trash2, Library,
  LayoutDashboard, GitCompare, ChevronRight, AlertTriangle, CheckCircle2, Minus, Layers, Link2,
  PanelLeftClose, PanelLeftOpen, Download, Network, ShieldCheck, ChevronDown, ArrowRight, TrendingUp, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRegulatoryTesting, LibraryDocument } from "@/contexts/RegulatoryTestingContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TraceMetricCard, TracePanel, TraceSectionHeading, TraceStatusRibbon } from "@/components/TraceAnalysisPrimitives";
import Footer from "@/components/Footer";

const ENFORCEMENT_COLOR: Record<string, string> = {
  mandatory:    "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
  recommended:  "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300",
  optional:     "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
};

const HUES = [220, 160, 30, 280, 10, 190, 120, 50, 340, 260, 90, 200];

type RightPanelView = "dashboard" | "obligations" | "gap-analysis";

function WorkbenchModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
        active
          ? "bg-[#0C3B99] text-white shadow-[0_10px_24px_-18px_rgba(12,59,153,0.7)]"
          : "bg-[#F3F7FF] text-[#5B7294] hover:bg-[#EAF1FF] hover:text-[#0C233C]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}


function LibraryStatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#D8E3F2] bg-[#F8FBFF] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7E91AE]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#0C233C]">{value}</p>
    </div>
  );
}

function formatTraceDomain(domain?: string) {
  return (domain || "Unclassified")
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
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
    <div className="flex flex-col gap-4 border-b-2 border-[#E2E6EF] pb-4 md:flex-row md:items-end md:justify-between">
      <div className="text-left">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">
          {label}
        </div>
        <div className="text-[20px] font-bold text-[#0C233C]">
          {title}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  );
}

function TraceActionButton({
  children,
  onClick,
  disabled,
  active = false,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-bold transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-[#00338D] bg-[#00338D] text-white"
          : "border-[#E2E6EF] bg-white text-[#0C233C] hover:border-[#1E49E2]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function TracePill({
  children,
  color = "#1E49E2",
  fill,
}: {
  children: ReactNode;
  color?: string;
  fill?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold"
      style={{ borderColor: `${color}55`, color, background: fill ?? `${color}1A` }}
    >
      {children}
    </span>
  );
}

function RegulatoryKpiTile({
  label,
  value,
  detail,
  accent,
  progress,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  accent: string;
  progress?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl" style={{ background: accent }} />
      <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#8492A6]">{label}</p>
      <div className="mt-3 text-[34px] font-bold leading-none" style={{ color: accent }}>
        {value}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#5A6478]">{detail}</p>
      {typeof progress === "number" ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#E2E6EF]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: accent }}
          />
        </div>
      ) : null}
    </div>
  );
}

function DomainDistributionBars({
  domains,
  activeDomain,
  onSelect,
}: {
  domains: [string, number][];
  activeDomain: string;
  onSelect: (domain: string) => void;
}) {
  const maxCount = domains[0]?.[1] || 1;

  return (
    <div className="space-y-2">
      {domains.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E6EF] bg-[#F8FAFD] px-5 py-8 text-center">
          <p className="text-[13px] font-bold text-[#5A6478]">No domains loaded</p>
          <p className="mt-1 text-[12px] text-[#8492A6]">Upload a regulatory source document to populate domain bands.</p>
        </div>
      ) : (
        domains.map(([domain, count]) => {
          const active = activeDomain === domain;
          return (
            <button
              key={domain}
              type="button"
              className={`grid w-full grid-cols-[170px_1fr_44px] items-center gap-4 rounded-xl px-3 py-2 text-left transition-colors ${
                active ? "bg-[#EEF2FF]" : "hover:bg-[#F0F2F7]"
              }`}
              onClick={() => onSelect(active ? "all" : domain)}
            >
              <span className="text-[13px] font-bold text-[#0C233C]">{formatTraceDomain(domain)}</span>
              <span className="h-4 overflow-hidden rounded-full bg-[#E2E6EF]">
                <span
                  className="block h-full rounded-full bg-[#1E49E2] transition-all duration-500"
                  style={{ width: `${Math.max(8, (count / maxCount) * 100)}%` }}
                />
              </span>
              <span className="text-right text-[13px] font-bold text-[#5A6478]">{count}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function RegulatoryDocumentCard({
  doc,
  selected,
  checked,
  mode,
  onOpen,
  onToggle,
  onDelete,
}: {
  doc: LibraryDocument;
  selected: boolean;
  checked: boolean;
  mode: RightPanelView;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const topDomains = Object.entries(doc.obligations_by_domain ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <button
      type="button"
      className={`group rounded-2xl border p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        selected || checked ? "border-[#1E49E2] bg-[#EEF2FF]" : "border-[#E2E6EF] bg-white"
      }`}
      onClick={mode === "gap-analysis" ? onToggle : onOpen}
    >
      <div className="flex items-start gap-3">
        {mode === "gap-analysis" ? (
          <span
            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              checked ? "border-[#1E49E2] bg-[#1E49E2] text-white" : "border-[#E2E6EF] bg-white text-transparent"
            }`}
          >
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <FileText className="mt-1 h-5 w-5 shrink-0 text-[#8492A6]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] font-bold leading-snug text-[#0C233C]">{doc.framework_name}</p>
          <p className="mt-1 truncate text-[12px] text-[#8492A6]">{doc.source_filename}</p>
        </div>
        {mode !== "gap-analysis" ? (
          <span
            role="button"
            tabIndex={0}
            className="rounded-lg p-1 text-[#E5001B] opacity-0 transition-opacity hover:bg-[#FEEBED] group-hover:opacity-100"
            onClick={event => {
              event.stopPropagation();
              onDelete();
            }}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }
            }}
            aria-label={`Delete ${doc.source_filename}`}
          >
            <Trash2 className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <TracePill color="#1E49E2">{doc.total_obligations} obligations</TracePill>
        {doc.issuing_authority ? <TracePill color="#8492A6">{doc.issuing_authority}</TracePill> : null}
        {topDomains.map(([domain, count]) => (
          <TracePill key={domain} color="#098E7E">
            {formatTraceDomain(domain)} {count}
          </TracePill>
        ))}
      </div>
    </button>
  );
}

function RegulatoryObligationTable({
  rows,
  loading,
  controlsLoaded,
  obligationControlMap,
  onControlClick,
  emptyCopy,
}: {
  rows: any[];
  loading: boolean;
  controlsLoaded: boolean;
  obligationControlMap: Map<string, MappedControlEntry[]>;
  onControlClick: (id: string) => void;
  emptyCopy: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[1120px] text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[#E2E6EF] bg-[#F8FAFD] text-[#8492A6]">
              <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">ID</th>
              <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Domain</th>
              <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Level</th>
              <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Obligation Text</th>
              <th className="px-4 py-3 text-center font-bold uppercase tracking-[1.5px]">Mapped Controls</th>
              <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Source</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#1E49E2] border-t-transparent" />
                  <p className="mt-3 text-[13px] font-bold text-[#5A6478]">Loading obligations</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-[13px] text-[#8492A6]">
                  {emptyCopy}
                </td>
              </tr>
            ) : (
              rows.slice(0, 250).map((obl, index) => {
                const mappedCtrls = obligationControlMap.get(obl.obligation_id) ?? [];
                const source = [
                  obl.framework_name || obl.source_filename,
                  obl.section_reference ? `§${obl.section_reference}` : "",
                ].filter(Boolean).join(" ");
                return (
                  <tr key={`${obl.obligation_id ?? index}-${obl.source_filename ?? ""}`} className="border-b border-[#E2E6EF] last:border-0 align-top hover:bg-[#F8FAFD]">
                    <td className="px-4 py-4">
                      <code className="rounded-md bg-[#0C233C] px-2 py-1 font-mono text-[11px] font-bold text-white">
                        {obl.obligation_id || "-"}
                      </code>
                    </td>
                    <td className="px-4 py-4">
                      <TracePill color="#1E49E2">{formatTraceDomain(obl.domain)}</TracePill>
                    </td>
                    <td className="px-4 py-4">
                      <TracePill
                        color={obl.enforcement_level === "mandatory" ? "#E5001B" : obl.enforcement_level === "recommended" ? "#EAAA00" : "#8492A6"}
                        fill={obl.enforcement_level === "mandatory" ? "#FEEBED" : obl.enforcement_level === "recommended" ? "#FFFBEB" : "#F0F2F7"}
                      >
                        {obl.enforcement_level || "-"}
                      </TracePill>
                    </td>
                    <td className="max-w-[520px] px-4 py-4 text-[#5A6478]">
                      <p className="line-clamp-3 leading-relaxed">{obl.obligation_text || "-"}</p>
                      {controlsLoaded && mappedCtrls.length > 0 ? (
                        <MappedControlsSection controls={mappedCtrls} onControlClick={onControlClick} />
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {controlsLoaded ? (
                        <TracePill color={mappedCtrls.length > 0 ? "#009A44" : "#EAAA00"} fill={mappedCtrls.length > 0 ? "#EDFBF5" : "#FFFBEB"}>
                          {mappedCtrls.length}
                        </TracePill>
                      ) : (
                        <span className="text-[#8492A6]">-</span>
                      )}
                    </td>
                    <td className="max-w-[260px] px-4 py-4 text-[#8492A6]">
                      <span className="line-clamp-2" title={source}>{source || "-"}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 250 ? (
        <p className="border-t border-[#E2E6EF] py-3 text-center text-[12px] text-[#8492A6]">
          Showing 250 rows. Use search and filters to narrow the obligation list.
        </p>
      ) : null}
    </div>
  );
}

function MappedControlsPanel({
  controls,
  defaultExpanded = false,
  onControlClick,
}: {
  controls: MappedControlEntry[];
  defaultExpanded?: boolean;
  onControlClick?: (controlId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const visibleControls = expanded ? controls.slice().sort((a, b) => b.match_score - a.match_score) : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] border-l-4 border-l-[#1E49E2] bg-[#F8FAFD] shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#EEF2FF]"
        onClick={() => setExpanded(value => !value)}
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#1E49E2]" />
        <span className="text-[13px] font-bold text-[#0C233C]">Mapped Controls</span>
        <TracePill color="#009A44" fill="#EDFBF5">{controls.length}</TracePill>
        <ChevronDown className={`ml-auto h-4 w-4 text-[#8492A6] transition-transform ${expanded ? "" : "-rotate-90"}`} />
      </button>
      {expanded ? (
        <div className="grid gap-3 border-t border-[#E2E6EF] bg-white p-3">
          {visibleControls.map(ctrl => {
            const score = Math.round(ctrl.match_score * 100);
            const accent = score >= 70 ? "#009A44" : score >= 40 ? "#EAAA00" : "#E5001B";
            return (
              <div key={`${ctrl.control_id}-${ctrl.control_name}`} className="grid grid-cols-[1fr_150px] gap-4 rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-bold text-[#0C233C]">{ctrl.control_name}</span>
                    <button
                      type="button"
                      title="Open control in Controls Library"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#1E49E2] bg-white px-2 py-1 font-mono text-[10px] font-bold text-[#1E49E2] hover:bg-[#EEF2FF]"
                      onClick={() => onControlClick?.(ctrl.control_id)}
                    >
                      {ctrl.control_id}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] capitalize text-[#5A6478]">
                    {formatTraceDomain(ctrl.domain)} - {ctrl.control_type || "control"}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <div className="h-2 w-20 overflow-hidden rounded-full bg-[#E2E6EF]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, score)}%`, background: accent }} />
                  </div>
                  <span className="w-9 text-right font-mono text-[11px] font-bold text-[#5A6478]">{score}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RegulatoryObligationList({
  rows,
  loading,
  controlsLoaded,
  obligationControlMap,
  onControlClick,
  emptyCopy,
}: {
  rows: any[];
  loading: boolean;
  controlsLoaded: boolean;
  obligationControlMap: Map<string, MappedControlEntry[]>;
  onControlClick: (id: string) => void;
  emptyCopy: string;
}) {
  const gridColumns = "grid-cols-[120px_170px_150px_minmax(420px,1fr)_150px_280px]";

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
      <div className="max-h-[620px] overflow-auto">
        <div className="min-w-[1290px] text-[12px]">
          <div className={`sticky top-0 z-10 grid ${gridColumns} border-b border-[#E2E6EF] bg-[#F8FAFD] text-[#8492A6] shadow-sm`}>
            {["ID", "Domain", "Level", "Obligation", "Mapped Controls", "Source"].map(label => (
              <div key={label} className="px-5 py-4 text-left font-bold uppercase tracking-[1.5px]">
                {label}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="px-4 py-16 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#1E49E2] border-t-transparent" />
              <p className="mt-3 text-[13px] font-bold text-[#5A6478]">Loading obligations</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 text-center text-[13px] text-[#8492A6]">{emptyCopy}</div>
          ) : (
            rows.slice(0, 250).map((obl, index) => {
              const mappedCtrls = obligationControlMap.get(obl.obligation_id) ?? [];
              const source = [
                obl.framework_name || obl.source_filename,
                obl.section_reference ? `Section ${obl.section_reference}` : "",
              ].filter(Boolean).join(" - ");
              return (
                <div key={`${obl.obligation_id ?? index}-${obl.source_filename ?? ""}`} className="border-b border-[#E2E6EF] bg-white last:border-0 hover:bg-[#F8FAFD]">
                  <div className={`grid ${gridColumns} items-start`}>
                    <div className="px-5 py-5">
                      <code className="inline-flex min-w-[72px] justify-center rounded-lg bg-[#0C233C] px-2.5 py-1.5 font-mono text-[11px] font-bold text-white">
                        {obl.obligation_id || "-"}
                      </code>
                    </div>
                    <div className="px-5 py-5">
                      <TracePill color="#1E49E2">{formatTraceDomain(obl.domain)}</TracePill>
                    </div>
                    <div className="px-5 py-5">
                      <TracePill
                        color={obl.enforcement_level === "mandatory" ? "#E5001B" : obl.enforcement_level === "recommended" ? "#EAAA00" : "#8492A6"}
                        fill={obl.enforcement_level === "mandatory" ? "#FEEBED" : obl.enforcement_level === "recommended" ? "#FFFBEB" : "#F0F2F7"}
                      >
                        {obl.enforcement_level || "-"}
                      </TracePill>
                    </div>
                    <div className="px-5 py-5 text-[13px] leading-relaxed text-[#0C233C]">
                      {obl.obligation_text || "-"}
                    </div>
                    <div className="px-5 py-5">
                      {controlsLoaded ? (
                        <TracePill color={mappedCtrls.length > 0 ? "#009A44" : "#EAAA00"} fill={mappedCtrls.length > 0 ? "#EDFBF5" : "#FFFBEB"}>
                          {mappedCtrls.length} mapped
                        </TracePill>
                      ) : (
                        <span className="text-[#8492A6]">-</span>
                      )}
                    </div>
                    <div className="px-5 py-5 text-[12px] leading-relaxed text-[#5A6478]">
                      <span className="line-clamp-3" title={source}>{source || "-"}</span>
                    </div>
                  </div>
                  {controlsLoaded && mappedCtrls.length > 0 ? (
                    <div className="px-5 pb-5">
                      <div className="w-full">
                        <MappedControlsPanel
                          controls={mappedCtrls}
                          defaultExpanded={index === 0 && mappedCtrls.length <= 3}
                          onControlClick={onControlClick}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
      {rows.length > 250 ? (
        <p className="border-t border-[#E2E6EF] py-3 text-center text-[12px] text-[#8492A6]">
          Showing 250 rows. Use search and filters to narrow the obligation list.
        </p>
      ) : null}
    </div>
  );
}

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

// ── DialogOblRow - obligation row inside the cross-library metric popup ────────
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

// ── DashboardOblRow - stable row for dashboard obligations list ───────────────
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

// ── ObligationCard - stable component so expand state survives filter changes ──
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
  const { refreshMetrics, allControls, loading: metricsLoading } = useLibraryMetrics();
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

  // Controls reverse-mapping: sourced from shared LibraryMetricsContext so it
  // stays in sync whenever any page calls refreshMetrics() (e.g. after remap).
  const controlsLoaded = !metricsLoading;

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
      const queued = await res.json();
      if (!res.ok) {
        const firstDetailedError = Array.isArray(queued.detail?.errors) && queued.detail.errors.length > 0
          ? `${queued.detail.errors[0].filename}: ${queued.detail.errors[0].error}`
          : null;
        throw new Error(firstDetailedError || queued.detail?.error || "Ingest failed");
      }

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
      refreshMetrics();

      const mongoFailed = ingested.some((r: any) => !r.mongo_saved);
      const controlsRemapped: number = data.controls_remapped ?? 0;
      const remapSuffix = controlsRemapped > 0 ? ` ${controlsRemapped} control(s) re-mapped.` : "";
      toast({
        title: "Ingested",
        description: mongoFailed
          ? `${data.total_ingested} document(s) extracted. ⚠ MongoDB save failed - obligations visible this session only.`
          : `${data.total_ingested} document(s) added to library.${remapSuffix}`,
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
      refreshMetrics();
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
      refreshMetrics();
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
      toast({ title: "Warning", description: "Could not load obligations - showing document summary only.", variant: "destructive" });
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

  // ── Dashboard obligations - filtered list ────────────────────────────────
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

  const useRedesignedRegulatoryLibrary = Boolean("trace-regulatory-library-redesign");
  if (useRedesignedRegulatoryLibrary) {
    const selectedObligationMode = rightPanelView === "obligations";
    const activeObligationRows = selectedObligationMode ? filteredObligations : filteredDashboardObligations;
    const activeSearch = selectedObligationMode ? librarySearch : dashboardSearch;
    const activeShownCount = activeObligationRows.length;
    const activeTotalCount = selectedObligationMode
      ? selectedLibraryDoc?.total_obligations ?? activeShownCount
      : dashboardViewMode === "merged"
        ? mergedObligations?.length ?? activeShownCount
        : dashboardObligations.length;
    const activeObligationTitle = selectedObligationMode
      ? "Selected Document Obligations"
      : dashboardViewMode === "merged"
        ? "Merged Obligations"
        : "All Obligations";
    const uniqueDashboardObligations = Array.from(
      new Map(dashboardObligations.filter(o => o.obligation_id).map(o => [o.obligation_id, o])).values()
    );
    const coveredMetricObligations = uniqueDashboardObligations.filter(o => coveredObligationIds.has(o.obligation_id));
    const gapMetricObligations = uniqueDashboardObligations.filter(o => !coveredObligationIds.has(o.obligation_id));
    const gapReady = gapSelectedIds.size >= 2;

    return (
      <div className="flex h-full flex-col overflow-hidden bg-[#F0F2F7] text-[#0C233C]">
        <section className="relative shrink-0 overflow-hidden bg-[#0C233C]">
          <div className="absolute inset-0 opacity-80" style={{ background: "linear-gradient(135deg, #0C233C 0%, #1E49E2 100%)" }} />
          <div className="relative px-8 py-7 md:px-10">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00B8F5]">Regulatory Corpus</div>
            <h1 className="text-[34px] font-bold leading-tight text-white md:text-[42px]">
              Regulatory Library
            </h1>
            <p className="mt-3 max-w-[760px] text-[16px] leading-[1.75] text-white/65">
              Curate source documents, review obligations, and compare frameworks in one workspace.
            </p>
          </div>
        </section>

        <main className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#E2E6EF] bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Feature Workspace</div>
              <div className="mt-1 text-[20px] font-bold text-[#0C233C]">
                {rightPanelView === "gap-analysis" ? "Gap Analysis" : "Dashboard"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TraceActionButton
                active={rightPanelView !== "gap-analysis"}
                onClick={() => {
                  setRightPanelView("dashboard");
                  setSelectedLibraryDoc(null);
                }}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </TraceActionButton>
              <TraceActionButton
                active={rightPanelView === "gap-analysis"}
                onClick={() => {
                  setRightPanelView("gap-analysis");
                  setSelectedLibraryDoc(null);
                  setGapResults(null);
                }}
              >
                <GitCompare className="h-4 w-4" />
                Gap Analysis
              </TraceActionButton>
            </div>
          </div>
          {rightPanelView !== "gap-analysis" ? (
          <>
          <section className="mb-9">
            <SectionHeader
              label="Data Inputs"
              title="Upload Regulatory Source Documents"
              actions={
                <>
                  <TraceActionButton onClick={fetchLibraryDocuments} disabled={libraryLoading}>
                    <RotateCcw className={`h-4 w-4 ${libraryLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </TraceActionButton>
                </>
              }
            />

            <div className="mt-6 grid gap-6 rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm lg:grid-cols-[1fr_1.1fr_1fr]">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#1E49E2]">
                  <Library className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Add regulatory source files</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#5A6478]">
                    Load regulatory documents, extract obligations, and keep the corpus ready for comparison.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <TracePill color="#1E49E2">{libraryDocuments.length} document{libraryDocuments.length !== 1 ? "s" : ""}</TracePill>
                    <TracePill color="#009A44" fill="#EDFBF5">{totalObligations.toLocaleString()} obligations</TracePill>
                  </div>
                </div>
              </div>

              <div
                className={`flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                  libraryFiles.length > 0 ? "border-[#1E49E2] bg-[#EEF2FF]" : "border-[#E2E6EF] hover:border-[#1E49E2]"
                }`}
                onClick={() => document.getElementById("regulatory-redesign-file-input")?.click()}
              >
                <input
                  id="regulatory-redesign-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={event => {
                    const files = Array.from(event.target.files || []);
                    if (files.length) setLibraryFiles(prev => [...prev, ...files]);
                    event.target.value = "";
                  }}
                />
                <Upload className="h-9 w-9 text-[#1E49E2]" />
                <p className="mt-3 text-[15px] font-bold text-[#0C233C]">Select source documents</p>
                <p className="mt-1 text-[12px] text-[#8492A6]">PDF, Word, text, spreadsheets, or image files</p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#EEF2FF] px-4 py-2 text-[13px] font-bold text-[#1E49E2]">
                  <Upload className="h-4 w-4" />
                  Browse Files
                </span>
              </div>

              <div className="rounded-2xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                <div className="flex h-full min-h-[150px] flex-col justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#00338D]">Workspace</p>
                    <p className="mt-2 text-[14px] font-bold text-[#0C233C]">Current library state</p>
                  </div>
                  {libraryFiles.length > 0 ? (
                    <div className="my-3 max-h-28 space-y-2 overflow-auto pr-1">
                      {libraryFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl border border-[#E2E6EF] bg-white px-3 py-2 text-[12px]">
                          <FileText className="h-4 w-4 shrink-0 text-[#8492A6]" />
                          <span className="min-w-0 flex-1 truncate text-[#0C233C]">{file.name}</span>
                          <button
                            type="button"
                            className="text-[#8492A6] hover:text-[#E5001B]"
                            onClick={event => {
                              event.stopPropagation();
                              setLibraryFiles(prev => prev.filter((_, i) => i !== index));
                            }}
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {libraryFiles.length > 0 ? (
                      <TraceActionButton active disabled={libraryIngesting} className="w-full" onClick={handleLibraryIngest}>
                        {libraryIngesting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Play className="h-4 w-4" />}
                        {libraryIngesting ? "Extracting" : "Extract And Save"}
                      </TraceActionButton>
                    ) : null}
                  </div>
                  {libraryDocuments.length > 0 ? <TracePill color="#1E49E2">{libraryDocuments.length} loaded</TracePill> : null}
                </div>
              </div>
            </div>
          </section>

          <section className="mb-9">
            <SectionHeader
              label="Knowledge Base"
              title="Source Documents"
              actions={
                <>
                  <TraceActionButton disabled={libraryDocuments.length === 0 || mergedObligationsLoading} active={dashboardViewMode === "merged"} onClick={mergedObligations !== null ? () => setDashboardViewMode("merged") : fetchMergedObligations}>
                    {mergedObligationsLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E49E2] border-t-transparent" /> : <Layers className="h-4 w-4" />}
                    Merged
                  </TraceActionButton>
                  {libraryDocuments.length > 0 ? (
                    <TraceActionButton disabled={clearingLibrary} onClick={() => setShowClearConfirm(true)}>
                      <Trash2 className="h-4 w-4" />
                      Clear Library
                    </TraceActionButton>
                  ) : null}
                </>
              }
            />

            {showClearConfirm ? (
              <div className="mt-4 rounded-2xl border border-[#E5001B]/40 bg-[#FEEBED] p-4">
                <p className="text-[13px] font-bold text-[#E5001B]">Clear entire regulatory library?</p>
                <p className="mt-1 text-[12px] text-[#5A6478]">This permanently deletes all {libraryDocuments.length} document(s) and their obligations.</p>
                <div className="mt-3 flex gap-2">
                  <TraceActionButton active disabled={clearingLibrary} onClick={handleClearLibrary}>{clearingLibrary ? "Clearing" : "Yes, Clear All"}</TraceActionButton>
                  <TraceActionButton onClick={() => setShowClearConfirm(false)}>Cancel</TraceActionButton>
                </div>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
              {libraryLoading ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1E49E2] border-t-transparent" />
                </div>
              ) : libraryDocuments.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E6EF] text-center">
                  <Library className="h-12 w-12 text-[#8492A6]" />
                  <p className="mt-4 text-[14px] font-bold text-[#5A6478]">No regulatory documents yet</p>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Upload a regulatory source document above to populate the library.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {libraryDocuments.map(doc => (
                    <RegulatoryDocumentCard
                      key={doc.document_id}
                      doc={doc}
                      selected={selectedLibraryDoc?.document_id === doc.document_id}
                      checked={gapSelectedIds.has(doc.document_id)}
                      mode={rightPanelView}
                      onOpen={() => handleLibraryDocClick(doc)}
                      onToggle={() => toggleGapDoc(doc.document_id)}
                      onDelete={() => handleLibraryDelete(doc.document_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mb-9">
            <SectionHeader label="Regulatory Library" title="Library Dashboard" />
            {libraryDocuments.length === 0 ? (
              <div className="mt-6 flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E6EF] bg-white text-center shadow-sm">
                <Library className="h-12 w-12 text-[#8492A6]" />
                <p className="mt-4 text-[14px] font-bold text-[#5A6478]">No regulatory corpus loaded</p>
                <p className="mt-1 text-[13px] text-[#8492A6]">Upload a source document to extract obligations and domain metrics.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                  <RegulatoryKpiTile label="Documents" value={libraryDocuments.length} detail="uploaded source files" accent="#00338D" />
                  <RegulatoryKpiTile label="Obligations" value={totalObligations.toLocaleString()} detail="requirements extracted" accent="#1E49E2" />
                  <RegulatoryKpiTile label="Domains" value={sortedDomains.length} detail="current domain bands" accent="#00B8F5" />
                  <RegulatoryKpiTile
                    label="Merged"
                    value={mergedObligationsLoading ? <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-[#098E7E] border-t-transparent" /> : mergedObligations !== null ? mergedObligations.length.toLocaleString() : "-"}
                    detail={mergedObligations !== null ? "deduplicated obligation set" : "deduplication not run"}
                    accent={mergedObligations !== null ? "#098E7E" : "#8492A6"}
                  />
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-[17px] font-bold text-[#0C233C]">Regulation-Control Coverage</h3>
                        <p className="mt-1 text-[13px] text-[#8492A6]">Metrics shown when Controls Library mappings are available.</p>
                      </div>
                    </div>
                    {hasCrossData ? (
                      <div className="mt-6 grid gap-4 md:grid-cols-3">
                        {[
                          { label: "Coverage", value: `${oblCoveragePct.toFixed(0)}%`, detail: `${coveredObligations.toLocaleString()} obligations mapped`, color: "#009A44", obligations: coveredMetricObligations, title: `Covered Obligations (${coveredMetricObligations.length})` },
                          { label: "Gap Obligations", value: gapObligations.toLocaleString(), detail: "requirements without mapped controls", color: "#EAAA00", obligations: gapMetricObligations, title: `Gap Obligations (${gapMetricObligations.length})` },
                          { label: "Controls Assessed", value: allControls.length.toLocaleString(), detail: `${ctrlCoveragePct.toFixed(0)}% have obligation links`, color: "#1E49E2", obligations: uniqueDashboardObligations, title: `All Obligations (${uniqueDashboardObligations.length})` },
                        ].map(metric => (
                          <button key={metric.label} type="button" className="rounded-2xl border border-[#E2E6EF] bg-[#F8FAFD] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1E49E2]" onClick={() => setCrossMetricDialog({ title: metric.title, obligations: metric.obligations })}>
                            <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#8492A6]">{metric.label}</p>
                            <p className="mt-3 text-[34px] font-bold leading-none" style={{ color: metric.color }}>{metric.value}</p>
                            <p className="mt-3 text-[12px] leading-relaxed text-[#5A6478]">{metric.detail}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-dashed border-[#E2E6EF] bg-[#F8FAFD] px-5 py-8 text-center">
                        <p className="text-[14px] font-bold text-[#5A6478]">Controls Library mappings unavailable</p>
                        <p className="mt-1 text-[13px] text-[#8492A6]">Load mapped controls to evaluate obligation coverage.</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[17px] font-bold text-[#0C233C]">Domain Distribution</h3>
                        <p className="mt-1 text-[13px] text-[#8492A6]">Click a band to filter the obligation explorer below.</p>
                      </div>
                      {dashboardDomainFilter !== "all" ? <TraceActionButton onClick={() => setDashboardDomainFilter("all")}>Clear Filter</TraceActionButton> : null}
                    </div>
                    <div className="mt-5 max-h-[300px] overflow-auto pr-1">
                      <DomainDistributionBars domains={sortedDomains} activeDomain={dashboardDomainFilter} onSelect={setDashboardDomainFilter} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="mb-9">
            <SectionHeader
              label="Obligation Detail"
              title={activeObligationTitle}
              actions={
                selectedObligationMode ? (
                  <TraceActionButton onClick={() => { setSelectedLibraryDoc(null); setRightPanelView("dashboard"); setLibrarySearch(""); }}>
                    <ArrowRight className="h-4 w-4 rotate-180" />
                    All Obligations
                  </TraceActionButton>
                ) : (
                  <>
                    <TraceActionButton active={dashboardViewMode === "all"} onClick={() => setDashboardViewMode("all")}><BookOpen className="h-4 w-4" />All</TraceActionButton>
                    <TraceActionButton active={dashboardViewMode === "merged"} disabled={mergedObligationsLoading} onClick={mergedObligations !== null ? () => setDashboardViewMode("merged") : fetchMergedObligations}>
                      {mergedObligationsLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E49E2] border-t-transparent" /> : <Layers className="h-4 w-4" />}
                      Merged
                    </TraceActionButton>
                  </>
                )
              }
            />

            <div className="mt-6 rounded-2xl border border-[#E2E6EF] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-bold text-[#0C233C]">{activeObligationTitle}</h3>
                    <TracePill color="#1E49E2">{activeShownCount.toLocaleString()} shown</TracePill>
                  </div>
                  <p className="mt-1 text-[13px] text-[#8492A6]">
                    {selectedObligationMode && selectedLibraryDoc ? selectedLibraryDoc.framework_name : dashboardDomainFilter !== "all" ? `Filtered by ${formatTraceDomain(dashboardDomainFilter)}` : "Search, filter, and review extracted obligations across the corpus."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8492A6]" />
                    <input
                      className="h-10 w-72 rounded-xl border border-[#E2E6EF] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#1E49E2]"
                      placeholder="Search obligations..."
                      value={activeSearch}
                      onChange={event => {
                        if (selectedObligationMode) setLibrarySearch(event.target.value);
                        else setDashboardSearch(event.target.value);
                      }}
                    />
                  </div>
                  {selectedObligationMode && selectedLibraryDoc?.obligations_by_domain ? (
                    <>
                      <select className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]" value={libraryDomainFilter} onChange={event => setLibraryDomainFilter(event.target.value)}>
                        <option value="all">All Domains</option>
                        {Object.entries(selectedLibraryDoc.obligations_by_domain).sort((a, b) => b[1] - a[1]).map(([domain]) => <option key={domain} value={domain}>{formatTraceDomain(domain)}</option>)}
                      </select>
                      <select className="h-10 rounded-xl border border-[#E2E6EF] bg-white px-3 text-[13px] text-[#0C233C] outline-none focus:border-[#1E49E2]" value={libraryEnforcementFilter} onChange={event => setLibraryEnforcementFilter(event.target.value)}>
                        <option value="all">All Levels</option>
                        <option value="mandatory">Mandatory</option>
                        <option value="recommended">Recommended</option>
                        <option value="optional">Optional</option>
                      </select>
                    </>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-[12px] text-[#8492A6]">Showing {activeShownCount.toLocaleString()} of {activeTotalCount.toLocaleString()} obligations.</p>
            </div>

            <div className="mt-6">
              <RegulatoryObligationList
                rows={activeObligationRows}
                loading={dashboardLoading || detailLoading}
                controlsLoaded={controlsLoaded}
                obligationControlMap={obligationControlMap}
                onControlClick={handleControlClick}
                emptyCopy={selectedObligationMode ? "No obligations match the selected document filters." : dashboardObligations.length === 0 ? "No obligations loaded." : "No obligations match the current filters."}
              />
            </div>
          </section>

          </>
          ) : (
          <section className="mb-12">
            <SectionHeader
              label="Comparison"
              title="Gap Analysis"
              actions={
                <>
                  <TraceActionButton active disabled={!gapReady || gapLoading} onClick={() => { setRightPanelView("gap-analysis"); handleRunGapAnalysis(); }}>
                    {gapLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <GitCompare className="h-4 w-4" />}
                    Run Analysis
                  </TraceActionButton>
                  {gapResults ? (
                    <>
                      <TraceActionButton onClick={handleExportGapJson}><Download className="h-4 w-4" />JSON</TraceActionButton>
                      <TraceActionButton disabled={!gapResults.final_report} onClick={handleExportGapMarkdown}><Download className="h-4 w-4" />Markdown</TraceActionButton>
                      <TraceActionButton disabled={!gapResults.final_report || pdfExporting} onClick={handleExportGapPdf}><Download className="h-4 w-4" />PDF</TraceActionButton>
                    </>
                  ) : null}
                </>
              }
            />

            <div className="mt-6 rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Documents and comparison modes</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Gap analysis is available when at least two regulatory source documents are loaded.</p>
                </div>
                <TracePill color={gapReady ? "#009A44" : "#EAAA00"} fill={gapReady ? "#EDFBF5" : "#FFFBEB"}>{gapSelectedIds.size} selected</TracePill>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {libraryDocuments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E2E6EF] bg-[#F8FAFD] px-5 py-8 text-center text-[13px] text-[#8492A6]">Upload regulatory documents before running gap analysis.</div>
                ) : (
                  libraryDocuments.map(doc => (
                    <RegulatoryDocumentCard key={doc.document_id} doc={doc} selected={false} checked={gapSelectedIds.has(doc.document_id)} mode="gap-analysis" onOpen={() => handleLibraryDocClick(doc)} onToggle={() => toggleGapDoc(doc.document_id)} onDelete={() => handleLibraryDelete(doc.document_id)} />
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <RegulatoryKpiTile label="Selected" value={gapSelectedIds.size} detail="documents ready" accent="#00338D" />
              <RegulatoryKpiTile label="Needed" value={2} detail="minimum documents" accent="#EAAA00" />
              <RegulatoryKpiTile label="Results" value={gapResults ? "Ready" : "-"} detail={gapResults ? "comparison available" : "comparison not run"} accent={gapResults ? "#009A44" : "#8492A6"} />
              <RegulatoryKpiTile label="Coverage" value={hasCrossData ? `${oblCoveragePct.toFixed(0)}%` : "-"} detail={hasCrossData ? `${coveredObligations.toLocaleString()} obligations mapped` : "from mapped controls"} accent={hasCrossData ? "#009A44" : "#8492A6"} progress={hasCrossData ? oblCoveragePct : undefined} />
            </div>

            {gapLoading ? (
              <div className="mt-6 flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1E49E2] border-t-transparent" />
                <p className="mt-4 text-[14px] font-bold text-[#5A6478]">Running gap analysis</p>
                <p className="mt-1 text-[13px] text-[#8492A6]">Comparing obligations across {gapSelectedIds.size} documents.</p>
              </div>
            ) : !gapResults ? (
              <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Selected Document Domains</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Click a band to filter obligations.</p>
                  <div className="mt-5 max-h-[300px] overflow-auto pr-1">
                    <DomainDistributionBars domains={sortedDomains} activeDomain={dashboardDomainFilter} onSelect={setDashboardDomainFilter} />
                  </div>
                </div>
                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Comparison</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">Shared and unique obligations will appear after analysis.</p>
                  <div className="mt-8 flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#E2E6EF] bg-[#F8FAFD] text-center">
                    <GitCompare className="h-10 w-10 text-[#8492A6]" />
                    <p className="mt-4 text-[14px] font-bold text-[#5A6478]">Gap analysis not available yet</p>
                    <p className="mt-1 max-w-[320px] text-[13px] leading-relaxed text-[#8492A6]">Load a second regulatory document, then run analysis to compare shared and unique obligations.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-5 animate-[fadeUp_0.5s_ease_both]">
                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Gap Analysis Results</h3>
                  <p className="mt-1 text-[13px] text-[#8492A6]">{gapResults.gap_summary.total_documents} documents · {gapResults.gap_summary.total_domains} domains compared</p>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <RegulatoryKpiTile label="Shared Domains" value={gapResults.gap_summary.shared_domain_count} detail="in all documents" accent="#009A44" />
                    <RegulatoryKpiTile label="Partial Coverage" value={gapResults.gap_summary.partial_coverage_domain_count} detail="domains in some documents" accent="#EAAA00" />
                    <RegulatoryKpiTile label="Total Domains" value={gapResults.gap_summary.total_domains} detail="across selected documents" accent="#1E49E2" />
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Domain Coverage Matrix</h3>
                  <div className="mt-5 max-h-[420px] overflow-auto rounded-2xl border border-[#E2E6EF]">
                    <table className="w-full min-w-[820px] text-[12px]">
                      <thead className="sticky top-0 bg-[#F8FAFD] text-[#8492A6]">
                        <tr className="border-b border-[#E2E6EF]">
                          <th className="px-4 py-3 text-left font-bold uppercase tracking-[1.5px]">Domain</th>
                          {Object.entries(gapResults.documents).map(([id, doc]) => <th key={id} className="px-4 py-3 text-center font-bold uppercase tracking-[1.5px]" title={doc.source_filename}>{doc.framework_name}</th>)}
                          <th className="px-4 py-3 text-center font-bold uppercase tracking-[1.5px]">Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(gapResults.domain_coverage).sort((a, b) => b[1].coverage_pct - a[1].coverage_pct).map(([domain, info]) => (
                          <tr key={domain} className="border-b border-[#E2E6EF] last:border-0 hover:bg-[#F8FAFD]">
                            <td className="px-4 py-4 font-bold text-[#0C233C]">{formatTraceDomain(domain)}</td>
                            {Object.keys(gapResults.documents).map(docId => (
                              <td key={docId} className="px-4 py-4 text-center">
                                {info.present_in.includes(docId) ? <span className="inline-flex flex-col items-center gap-1 text-[#009A44]"><CheckCircle2 className="h-4 w-4" /><span className="text-[11px] font-bold text-[#5A6478]">{info.obligation_counts[docId]}</span></span> : <X className="mx-auto h-4 w-4 text-[#E5001B]" />}
                              </td>
                            ))}
                            <td className="px-4 py-4 text-center"><TracePill color={info.coverage_pct === 100 ? "#009A44" : info.coverage_pct > 0 ? "#EAAA00" : "#E5001B"}>{info.coverage_pct}%</TracePill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[17px] font-bold text-[#0C233C]">Shared Domains</h3>
                        <p className="mt-1 text-[13px] text-[#8492A6]">Domains present in every selected regulation.</p>
                      </div>
                      <TracePill color="#009A44" fill="#EDFBF5">{gapResults.similarities.length}</TracePill>
                    </div>
                    <div className="mt-5 max-h-[360px] space-y-3 overflow-auto pr-1">
                      {gapResults.similarities.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[#E2E6EF] bg-[#F8FAFD] p-4 text-[13px] text-[#8492A6]">No shared domains found.</p>
                      ) : gapResults.similarities.map(sim => (
                        <div key={sim.domain} className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[14px] font-bold text-[#0C233C]">{formatTraceDomain(sim.domain)}</p>
                            <TracePill color="#009A44" fill="#EDFBF5">Shared</TracePill>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {Object.entries(sim.docs).map(([docId, info]) => (
                              <div key={docId} className="rounded-lg border border-[#E2E6EF] bg-white p-3">
                                <p className="line-clamp-2 text-[12px] font-bold text-[#0C233C]">{gapResults.documents[docId]?.framework_name ?? docId}</p>
                                <p className="mt-1 text-[12px] text-[#5A6478]">{info.count} obligations</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[17px] font-bold text-[#0C233C]">Partial Coverage</h3>
                        <p className="mt-1 text-[13px] text-[#8492A6]">Domains missing from one or more selected regulations.</p>
                      </div>
                      <TracePill color="#EAAA00" fill="#FFFBEB">{gapResults.differences.length}</TracePill>
                    </div>
                    <div className="mt-5 max-h-[360px] space-y-3 overflow-auto pr-1">
                      {gapResults.differences.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[#E2E6EF] bg-[#F8FAFD] p-4 text-[13px] text-[#8492A6]">No partial coverage gaps found.</p>
                      ) : gapResults.differences.map(diff => (
                        <div key={diff.domain} className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[14px] font-bold text-[#0C233C]">{formatTraceDomain(diff.domain)}</p>
                            <TracePill color="#EAAA00" fill="#FFFBEB">{diff.coverage_pct}%</TracePill>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <div className="rounded-lg border border-[#E2E6EF] bg-white p-3">
                              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#009A44]">Present In</p>
                              <p className="mt-1 text-[12px] text-[#5A6478]">{diff.present_in.map(id => gapResults.documents[id]?.framework_name ?? id).join(", ")}</p>
                            </div>
                            <div className="rounded-lg border border-[#E2E6EF] bg-white p-3">
                              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#E5001B]">Absent In</p>
                              <p className="mt-1 text-[12px] text-[#5A6478]">{diff.absent_in.map(id => gapResults.documents[id]?.framework_name ?? id).join(", ")}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <h3 className="text-[17px] font-bold text-[#0C233C]">Unique Coverage By Document</h3>
                  <div className="mt-5 grid gap-4 xl:grid-cols-3">
                    {Object.entries(gapResults.unique_by_doc).map(([docId, unique]) => (
                      <div key={docId} className="rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4">
                        <p className="line-clamp-2 text-[13px] font-bold text-[#0C233C]">{gapResults.documents[docId]?.framework_name ?? docId}</p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[24px] font-bold leading-none text-[#1E49E2]">{unique.unique_domain_count}</p>
                            <p className="mt-1 text-[11px] text-[#8492A6]">unique domains</p>
                          </div>
                          <div>
                            <p className="text-[24px] font-bold leading-none text-[#009A44]">{unique.shared_domain_count}</p>
                            <p className="mt-1 text-[11px] text-[#8492A6]">shared domains</p>
                          </div>
                        </div>
                        {unique.sample_obligations.length > 0 ? (
                          <div className="mt-4 space-y-2">
                            {unique.sample_obligations.slice(0, 2).map((sample, i) => (
                              <p key={i} className="line-clamp-2 rounded-lg border border-[#E2E6EF] bg-white p-3 text-[12px] leading-relaxed text-[#5A6478]">
                                {sample.text}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {gapResults.final_report ? (
                  <div className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                    <h3 className="text-[17px] font-bold text-[#0C233C]">Full Analysis Report</h3>
                    <div className="prose prose-sm mt-4 max-w-none text-[#5A6478]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{gapResults.final_report}</ReactMarkdown>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
          )}

          <style>{`
            @keyframes fadeUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </main>

        <Dialog open={!!crossMetricDialog} onOpenChange={open => { if (!open) setCrossMetricDialog(null); }}>
          <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col gap-0 overflow-hidden border border-[#E2E6EF] bg-white p-0 text-[#0C233C]">
            <DialogHeader className="shrink-0 border-b border-[#E2E6EF] px-5 py-4">
              <DialogTitle className="text-[17px] font-bold text-[#0C233C]">{crossMetricDialog?.title}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="divide-y divide-[#E2E6EF]">
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
                {(crossMetricDialog?.obligations ?? []).length === 0 ? <p className="py-10 text-center text-[13px] text-[#8492A6]">No obligations to display.</p> : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="trace-workbench-shell h-full min-h-0 flex flex-col overflow-hidden select-none">
      <HeroSection
        title="Regulatory Library"
        subtitle="Curate source documents, review obligations, and compare frameworks in one workspace."
        icon={Library}
      />
      <div className="trace-workbench-layout">

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div
        className="trace-workbench-rail min-h-0 shrink-0 flex flex-col overflow-y-auto overflow-x-hidden border-r border-[#00338D]/8 bg-[linear-gradient(180deg,#FCFDFF_0%,#F5F9FE_100%)] transition-[width] duration-200"
        style={{
          width: leftPanelOpen ? panelWidth : 0,
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >

        {/* Upload section */}
        <div className="space-y-4 border-b border-[#00338D]/8 bg-white/88 p-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="kpmg-section-label text-[#1E49E2]">Library intake</p>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold tracking-[-0.02em] text-[#0C233C]">Add regulatory source files</h2>
                  <p className="text-[12px] leading-5 text-[#5B7294]">
                    Load regulatory documents, extract obligations, and keep the corpus ready for comparison.
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#D8E3F2] bg-[#F5F9FF]">
                  <BookOpen className="h-4 w-4 text-[#1E49E2]" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <LibraryStatPill label="documents" value={libraryDocuments.length.toString()} />
              <LibraryStatPill label="obligations" value={totalObligations.toLocaleString()} />
            </div>
          </div>

          <div
            className={`rounded-[22px] border border-dashed p-5 text-center transition-colors ${
              libraryFiles.length > 0
                ? "border-[#1E49E2]/35 bg-[#EEF4FF]"
                : "cursor-pointer border-[#C7D7F1] bg-[#F9FBFF] hover:border-[#1E49E2]/32 hover:bg-[#F3F7FF]"
            }`}
            onClick={() => document.getElementById("lib-file-input")?.click()}
          >
            <input
              id="lib-file-input"
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                if (files.length) setLibraryFiles(prev => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#D8E3F2] bg-white">
              <Upload className="h-5 w-5 text-[#1E49E2]" />
            </div>
            <p className="text-sm font-semibold text-[#0C233C]">Select source documents</p>
            <p className="mt-1 text-[12px] leading-5 text-[#5B7294]">PDF, Word, text, spreadsheets, or image files</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1E49E2]">Browse files</p>
          </div>

          {libraryFiles.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7E91AE]">Queued uploads</p>
                <Badge variant="outline" className="rounded-full border-[#C7D7F1] bg-white text-[10px] text-[#1E49E2]">
                  {libraryFiles.length}
                </Badge>
              </div>
              <div className="max-h-36 overflow-auto space-y-1.5 pr-1">
                {libraryFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-[16px] border border-[#D8E3F2] bg-white px-3 py-2 text-xs shadow-[0_12px_24px_-28px_rgba(12,35,60,0.35)]">
                    <span className="truncate flex-1 font-medium text-[#0C233C]">{f.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-full text-[#7E91AE] hover:bg-[#F3F7FF] hover:text-[#0C233C]"
                      onClick={() => setLibraryFiles(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="h-10 w-full rounded-[14px] bg-[#0C3B99] text-xs font-semibold hover:bg-[#153A96]"
                disabled={libraryIngesting}
                onClick={handleLibraryIngest}
              >
                {libraryIngesting ? (
                  <>
                    <div className="mr-1.5 h-3 w-3 animate-spin rounded-full border-b-2 border-white" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Extract and save
                  </>
                )}
              </Button>
            </div>
          )}

          {libraryIngestResults.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#009A44]">Recently added</p>
              {libraryIngestResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-[16px] border border-[#BFE9D0] bg-[#F4FBF7] px-3 py-2 text-xs">
                  <span className="font-medium truncate text-[#0C233C]">{r.framework_name || r.filename}</span>
                  <div className="ml-1 flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="border-[#7AD19D] bg-white text-[10px] text-[#009A44]">{r.total_obligations}</Badge>
                    {!r.mongo_saved && (
                      <Badge variant="outline" className="text-orange-600 border-orange-400 text-[10px]" title="Not persisted">⚠ no DB</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border-b border-[#00338D]/8 bg-white/78 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7E91AE]">Workspace</p>
              <p className="mt-1 text-sm font-semibold text-[#0C233C]">Documents and comparison modes</p>
            </div>
            {libraryDocuments.length > 0 ? (
              <Badge variant="outline" className="rounded-full border-[#D8E3F2] bg-white px-2.5 py-1 text-[10px] text-[#1E49E2]">
                {libraryDocuments.length} loaded
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <WorkbenchModeButton
              active={rightPanelView === "dashboard"}
              icon={<LayoutDashboard className="h-3.5 w-3.5" />}
              label="Dashboard"
              onClick={() => { setRightPanelView("dashboard"); setSelectedLibraryDoc(null); }}
            />
            <WorkbenchModeButton
              active={rightPanelView === "gap-analysis"}
              icon={<GitCompare className="h-3.5 w-3.5" />}
              label="Gap analysis"
              onClick={() => { setRightPanelView("gap-analysis"); setSelectedLibraryDoc(null); setGapResults(null); }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 rounded-[16px] border border-[#D8E3F2] bg-[#F8FBFF] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#0C233C]">
                {rightPanelView === "gap-analysis"
                  ? `${gapSelectedIds.size} document${gapSelectedIds.size !== 1 ? "s" : ""} selected`
                  : selectedLibraryDoc?.framework_name || "Select a document to inspect obligations"}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5B7294]">
                {rightPanelView === "gap-analysis"
                  ? "Choose at least two documents before running the comparison."
                  : "Click a document below to move into obligation review."}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-[12px]" onClick={fetchLibraryDocuments} disabled={libraryLoading}>
                <RotateCcw className={`h-3.5 w-3.5 ${libraryLoading ? "animate-spin" : ""}`} />
              </Button>
              {libraryDocuments.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title="Clear entire library"
                  disabled={clearingLibrary}
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Inline clear confirmation */}
        {showClearConfirm && (
          <div className="mx-3 my-2 space-y-2 rounded-[18px] border border-destructive/25 bg-white p-3 shadow-[0_16px_28px_-28px_rgba(229,0,27,0.48)]">
            <p className="text-xs font-medium text-destructive">Clear entire regulatory library?</p>
            <p className="text-[11px] text-[var(--ink-muted)]">This will permanently delete all {libraryDocuments.length} document(s) and their obligations.</p>
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

        <div style={{ overscrollBehavior: "contain" }}>
          {libraryLoading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}
          {!libraryLoading && libraryDocuments.length === 0 && (
            <div className="px-3 py-6">
              <div className="rounded-[18px] border border-dashed border-[#D8E3F2] bg-white px-4 py-8 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#F3F7FF] text-[#1E49E2]">
                  <FileText className="h-4 w-4" />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#0C233C]">No regulatory documents yet</p>
                <p className="mt-1 text-xs leading-5 text-[#5B7294]">Upload a source file above to start building the library.</p>
              </div>
            </div>
          )}
          {!libraryLoading && libraryDocuments.length > 0 && (
            <div className="space-y-2 p-2">
              {libraryDocuments.map((doc, i) => {
                const isSelected = selectedLibraryDoc?.document_id === doc.document_id;
                const isGapChecked = gapSelectedIds.has(doc.document_id);
                return (
                  <div
                    key={i}
                    className={`group cursor-pointer rounded-[20px] border bg-white shadow-[0_14px_28px_-30px_rgba(12,35,60,0.42)] transition-all ${
                      isSelected
                        ? "border-[#1E49E2] bg-[#EEF4FF]"
                        : isGapChecked
                          ? "border-[#1E49E2]/45 bg-[#F5F9FF]"
                          : "border-[#D8E3F2] hover:border-[#1E49E2]/36 hover:bg-[#F8FBFF] hover:shadow-[0_20px_36px_-34px_rgba(12,35,60,0.52)]"
                    }`}
                    onClick={() => rightPanelView === "gap-analysis" ? toggleGapDoc(doc.document_id) : handleLibraryDocClick(doc)}
                  >
                    <div className="flex items-start justify-between gap-2 p-3">
                      {rightPanelView === "gap-analysis" && (
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          isGapChecked ? "border-[#1E49E2] bg-[#1E49E2] text-white" : "border-[#B8C7DC] bg-white text-transparent"
                        }`}>
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold break-words leading-snug text-[#0C233C]">{doc.framework_name}</p>
                        <p className="mt-1 text-xs break-all leading-snug text-[#5B7294]">{doc.source_filename}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="rounded-full bg-[#EEF4FF] px-2.5 py-0.5 text-[10px] text-[#1E49E2]">
                            {doc.total_obligations} obligations
                          </Badge>
                          {doc.issuing_authority ? (
                            <Badge variant="outline" className="rounded-full border-[#D8E3F2] px-2.5 py-0.5 text-[10px] text-[#5B7294]">
                              {doc.issuing_authority}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      {rightPanelView !== "gap-analysis" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mt-0.5 h-8 w-8 shrink-0 self-start rounded-full opacity-0 text-destructive hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
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
        </div>

        {/* Gap analysis run button */}
        {rightPanelView === "gap-analysis" && (
          <div className="space-y-2 border-t border-[#00338D]/8 bg-white/88 p-3">
            <p className="text-center text-xs text-[#5B7294]">
              {gapSelectedIds.size < 2
                ? `Select ${2 - gapSelectedIds.size} more doc${gapSelectedIds.size === 0 ? "s" : ""}`
                : `${gapSelectedIds.size} docs selected`}
            </p>
            <Button
              size="sm"
              className="h-10 w-full rounded-[14px] bg-[#0C3B99] text-xs font-semibold hover:bg-[#153A96]"
              disabled={gapSelectedIds.size < 2 || gapLoading}
              onClick={handleRunGapAnalysis}
            >
              {gapLoading ? (
                <><div className="mr-1.5 h-3 w-3 animate-spin rounded-full border-b-2 border-white" />Analyzing...</>
              ) : (
                <><GitCompare className="mr-1.5 h-3 w-3" />Run analysis</>
              )}
            </Button>
            {gapSelectedIds.size > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-[#5B7294]"
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
      <div className="trace-workbench-main min-h-0 flex-1 flex flex-col overflow-hidden">

        {/* ── PANEL TOGGLE ─────────────────────────────────────────────── */}
        <div className="trace-workbench-tabs shrink-0 flex items-center border-b border-[#00338D]/8 bg-white/75 px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-[12px] text-[var(--ink-muted)] hover:bg-[#F3F7FF] hover:text-[var(--ink-strong)]"
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
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--ink-muted)]">
              <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-[#00338D]/10 bg-[#F3F7FF]">
                <Library className="h-8 w-8 text-[var(--cobalt)]/40" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-[var(--ink-strong)]">Library is empty</p>
                <p className="text-xs text-[var(--ink-muted)]">Upload regulatory documents on the left to begin</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="trace-workbench-scroll flex-1">
              <div className="p-5 space-y-5">

                <TraceSectionHeading
                  eyebrow="Regulatory overview"
                  title="Library dashboard"
                  action={(
                    <Badge variant="outline" className="rounded-full border-[#D8E3F2] bg-white px-3 py-1.5 text-[11px] text-[#0C233C]">
                      {libraryDocuments.length} document{libraryDocuments.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                />

                <TraceStatusRibbon
                  title="Regulatory corpus is live"
                  detail={
                    hasCrossData
                      ? `${coveredObligations.toLocaleString()} obligations are already mapped to controls across ${frameworkNames.length || libraryDocuments.length} frameworks.`
                      : `${totalObligations.toLocaleString()} obligations extracted across the current regulatory corpus.`
                  }
                  action={(
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/20 bg-white/8 px-4 text-white hover:bg-white/14 hover:text-white"
                      onClick={() => setShowCrossAnalysis(v => !v)}
                    >
                      {showCrossAnalysis ? "Hide coverage detail" : "View coverage detail"}
                    </Button>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label="Documents"
                    value={libraryDocuments.length.toString()}
                    subtitle="frameworks currently loaded"
                    accentColor="#1E49E2"
                    icon={<FileText className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Obligations"
                    value={totalObligations.toLocaleString()}
                    subtitle="requirements extracted from source documents"
                    accentColor="#153A96"
                    icon={<BookOpen className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Domains"
                    value={sortedDomains.length.toString()}
                    subtitle="risk and regulatory areas covered"
                    accentColor="#00A3A1"
                    icon={<Layers className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Merged"
                    value={
                      mergedObligationsLoading
                        ? <span className="inline-block h-7 w-7 animate-spin rounded-full border-b-2 border-[#1E49E2]" />
                        : mergedObligations !== null ? mergedObligations.length : "-"
                    }
                    subtitle={mergedObligations !== null ? "deduplicated obligation set" : "deduplication ready to compute"}
                    accentColor="#5B7294"
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                </div>

                {(hasCrossData || (controlsLoaded && allControls.length === 0)) && (
                  <TracePanel
                    title="Regulation-control coverage"
                    subtitle="How well the current controls library maps to extracted obligations."
                  >
                    {hasCrossData ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        <TraceMetricCard
                          label="Coverage"
                          value={`${oblCoveragePct.toFixed(0)}%`}
                          sub={`${coveredObligations.toLocaleString()} obligations mapped`}
                          accentColor="#009A44"
                          badge="Controls aligned"
                          badgeClassName="bg-[#ECFBF1] text-[#009A44]"
                        />
                        <TraceMetricCard
                          label="Gap Obligations"
                          value={gapObligations.toLocaleString()}
                          sub="requirements without mapped controls"
                          accentColor="#EAAA00"
                          badge="Requires review"
                          badgeClassName="bg-[#FFF8E8] text-[#A66300]"
                        />
                        <TraceMetricCard
                          label="Controls Assessed"
                          value={allControls.length.toLocaleString()}
                          sub={`${ctrlCoveragePct.toFixed(0)}% of controls have obligation links`}
                          accentColor="#1E49E2"
                          badge="Cross-library"
                          badgeClassName="bg-[#EEF4FF] text-[#1E49E2]"
                        />
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#D8E3F2] bg-[#F8FBFF] px-5 py-8 text-center">
                        <p className="text-sm font-semibold text-[#0C233C]">Controls Library not loaded</p>
                        <p className="mt-2 text-sm leading-6 text-[#5B7294]">
                          Load the Controls Library to evaluate obligation coverage and surface regulatory gaps.
                        </p>
                      </div>
                    )}

                    {frameworkNames.length > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {frameworkNames.map((name, i) => (
                          <span key={i} className="rounded-full border border-[#D8E3F2] bg-[#F8FBFF] px-3 py-1.5 text-[11px] font-semibold text-[#4A6184]">
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {showCrossAnalysis && hasCrossData && (() => {
                      const dedup = (obls: any[]) =>
                        Array.from(new Map(obls.filter(o => o.obligation_id).map(o => [o.obligation_id, o])).values());

                      const coveredObls = dedup(dashboardObligations.filter(o => o.obligation_id && coveredObligationIds.has(o.obligation_id)));
                      const gapObls = dedup(dashboardObligations.filter(o => o.obligation_id && !coveredObligationIds.has(o.obligation_id)));
                      const allObls = dedup(dashboardObligations);

                      const metrics = [
                        {
                          icon: <TrendingUp className="h-4 w-4 text-[#009A44]" />,
                          metric: "Covered obligations",
                          value: `${oblCoveragePct.toFixed(1)}%`,
                          explanation: `${coveredObls.length} of ${allObls.length} unique obligations are addressed by at least one control.`,
                          obligations: coveredObls,
                          dialogTitle: `Covered Obligations (${coveredObls.length})`,
                        },
                        {
                          icon: <AlertTriangle className="h-4 w-4 text-[#A66300]" />,
                          metric: "Gap obligations",
                          value: String(gapObls.length),
                          explanation: gapObls.length === 0
                            ? "All obligations currently have at least one mapped control."
                            : `${gapObls.length} obligations do not yet have mapped controls.`,
                          obligations: gapObls,
                          dialogTitle: `Gap Obligations (${gapObls.length})`,
                        },
                        {
                          icon: <Layers className="h-4 w-4 text-[#1E49E2]" />,
                          metric: "All obligations",
                          value: allObls.length.toLocaleString(),
                          explanation: `${allObls.length} unique obligations are currently in the unified regulatory corpus.`,
                          obligations: allObls,
                          dialogTitle: `All Obligations (${allObls.length})`,
                        },
                      ];

                      return (
                        <div className="mt-5 space-y-2 rounded-[18px] border border-[#D8E3F2] bg-[#F8FBFF] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7E91AE]">Coverage detail</p>
                          {metrics.map(({ icon, metric, value, explanation, obligations, dialogTitle }) => (
                            <button
                              key={metric}
                              type="button"
                              disabled={obligations.length === 0}
                              className="group flex w-full items-start gap-3 rounded-[16px] border border-transparent bg-white px-4 py-3 text-left transition-colors hover:border-[#D8E3F2] hover:bg-[#FCFDFF] disabled:cursor-default disabled:opacity-60"
                              onClick={() => obligations.length > 0 && setCrossMetricDialog({ title: dialogTitle, obligations })}
                            >
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3F7FF]">{icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[#0C233C]">{metric}</span>
                                  <span className="text-sm font-bold text-[#1E49E2]">{value}</span>
                                  {obligations.length > 0 ? <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#7E91AE]" /> : null}
                                </div>
                                <p className="mt-1 text-[12px] leading-5 text-[#5B7294]">{explanation}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </TracePanel>
                )}

                {false && (
                  <>
                {/* KPI row */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: "Documents", value: libraryDocuments.length.toString(), sub: "in library", accent: "from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-800", icon: "📄" },
                    { label: "Obligations", value: totalObligations.toLocaleString(), sub: "total extracted", accent: "from-violet-500/10 to-violet-500/5 border-violet-200 dark:border-violet-800", icon: "📋" },
                    { label: "Domains", value: sortedDomains.length.toString(), sub: "areas covered", accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-200 dark:border-emerald-800", icon: "🏷️" },
                  ].map(({ label, value, sub, accent, icon }) => (
                    <div key={label} className={`rounded-[18px] border bg-gradient-to-br ${accent} p-4 shadow-[0_14px_28px_-28px_rgba(12,35,60,0.28)]`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[11px] font-medium text-[var(--ink-muted)] uppercase tracking-wider">{label}</p>
                          <p className="text-3xl font-bold mt-1 leading-none text-[var(--ink-strong)]">{value}</p>
                          <p className="text-[11px] text-[var(--ink-muted)] mt-1.5">{sub}</p>
                        </div>
                        <span className="text-xl opacity-60">{icon}</span>
                      </div>
                    </div>
                  ))}
                  {/* Merged KPI card */}
                  <div
                    className="rounded-[18px] border border-[#00338D]/12 bg-card p-4 cursor-pointer shadow-[0_14px_28px_-28px_rgba(12,35,60,0.28)] hover:border-[#1E49E2]/35 hover:bg-[#F8FBFF] transition-colors"
                    onClick={mergedObligations !== null
                      ? () => setDashboardViewMode("merged")
                      : fetchMergedObligations
                    }
                  >
                    <p className="text-[11px] font-medium text-[var(--ink-muted)] uppercase tracking-wider">Merged</p>
                    <p className="text-3xl font-bold mt-1 leading-none flex items-center gap-1 text-[var(--ink-strong)]">
                      {mergedObligationsLoading
                        ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary inline-block" />
                        : mergedObligations?.length ?? "-"
                      }
                    </p>
                    <p className="text-[11px] text-[var(--ink-muted)] mt-1.5">
                      {mergedObligations !== null ? "after deduplication" : "click to compute"}
                    </p>
                  </div>
                </div>

                {/* Cross-Library Analysis card */}
                {(hasCrossData || (controlsLoaded && allControls.length === 0)) && (
                  <div className="dashboard-highlight rounded-[18px] overflow-hidden p-5 text-white space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#ACEAFF] mb-0.5">
                          Cross-Library Analysis
                        </p>
                        <h3 className="text-base font-bold">Regulation-Control Coverage</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCrossAnalysis(v => !v)}
                        className="kpmg-dark-outline-button shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5"
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
                            <p className="mt-1 text-[11px] text-[#DCE7FA]">{label}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#DCE7FA]">Load the Controls Library to see cross-library metrics.</p>
                    )}

                    {/* Framework pills */}
                    {frameworkNames.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {frameworkNames.map((name, i) => (
                          <span key={i} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-[#E4EEFB]">
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
                            ? "All obligations have at least one mapped control - no gaps."
                            : `${gapObls.length} obligations have no mapped controls. These are compliance risk areas.`,
                          obligations: gapObls,
                          dialogTitle: `Gap Obligations - No Control Coverage (${gapObls.length})`,
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
                        <div className="mt-2 rounded-[16px] border border-white/20 bg-white/10 p-4 space-y-1">
                          <p className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">Metric Breakdown - click to view obligations</p>
                          {metrics.map(({ icon, metric, value, color, explanation, obligations, dialogTitle }) => (
                            <button
                              key={metric}
                              type="button"
                              disabled={obligations.length === 0}
                              className="group flex w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-white/10 disabled:opacity-60 disabled:cursor-default"
                              onClick={() => obligations.length > 0 && setCrossMetricDialog({ title: dialogTitle, obligations })}
                            >
                              <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-white">{metric}</span>
                                  <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
                                  {obligations.length > 0 && (
                                    <ArrowRight className="ml-auto h-3 w-3 text-[#C8D8F0] transition-colors group-hover:text-white" />
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-[#DCE7FA]">{explanation}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                  </>
                )}

                {/* Domain Distribution - clickable filter bars */}
                {sortedDomains.length > 0 && (
                  <TracePanel title="Domain distribution" subtitle="Click a band to filter the obligation explorer below.">
                    <div className="flex items-center justify-between">
                      {dashboardDomainFilter !== "all" && (
                        <button
                          className="text-[11px] font-medium text-[#5B7294] underline underline-offset-2 transition-colors hover:text-[#0C233C]"
                          onClick={() => setDashboardDomainFilter("all")}
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {sortedDomains.map(([domain, count]) => {
                        const maxCount = sortedDomains[0]?.[1] ?? 1;
                        const pct = Math.round((count / maxCount) * 100);
                        const isActive = dashboardDomainFilter === domain;
                        return (
                          <div
                            key={domain}
                            className={`flex items-center gap-3 rounded-[16px] px-3 py-2.5 cursor-pointer transition-colors ${
                              isActive ? "border border-[#1E49E2]/20 bg-[#EEF4FF]" : "border border-transparent hover:bg-[#F7FAFF]"
                            }`}
                            onClick={() => setDashboardDomainFilter(isActive ? "all" : domain)}
                          >
                            <span className="w-40 shrink-0 text-xs font-medium capitalize leading-tight text-[#0C233C]">
                              {domain.replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 h-3.5 overflow-hidden rounded-full bg-[#E6EDF7]">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: "linear-gradient(90deg,#153A96 0%, #1E49E2 100%)",
                                  opacity: dashboardDomainFilter !== "all" && !isActive ? 0.35 : 1,
                                }}
                              />
                            </div>
                            <span className="w-8 shrink-0 text-right text-xs font-medium text-[#5B7294]">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </TracePanel>
                )}

                {/* All / Merged Obligations list */}
                <TracePanel
                  title={dashboardViewMode === "merged" ? "Merged obligations" : "Obligation explorer"}
                  subtitle="Search, filter, and review extracted obligations across the corpus."
                  className="overflow-hidden"
                >
                  <div className="space-y-2 rounded-[18px] border border-[#DCE3EE] bg-[#F8FAFD] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#0C233C]">
                          {dashboardViewMode === "merged" ? "Merged view" : "All obligations"}
                          {dashboardDomainFilter !== "all" && (
                            <span className="ml-2 text-[11px] font-normal capitalize text-[#5B7294]">
                              - {dashboardDomainFilter.replace(/_/g, " ")}
                            </span>
                          )}
                        </h3>
                        <Badge variant="secondary" className="rounded-full bg-[#EEF4FF] text-[10px] text-[#1E49E2]">
                          {filteredDashboardObligations.length} shown
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={dashboardViewMode === "all" ? "default" : "outline"}
                          className="h-8 rounded-[12px] text-xs"
                          onClick={() => setDashboardViewMode("all")}
                        >
                          <BookOpen className="h-3 w-3 mr-1" />
                          All
                        </Button>
                        <Button
                          size="sm"
                          variant={dashboardViewMode === "merged" ? "default" : "outline"}
                          className="h-8 rounded-[12px] text-xs"
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
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7E91AE]" />
                      <Input
                        className="h-9 rounded-[12px] border-[#D8E3F2] bg-white pl-8 text-xs"
                        placeholder="Search obligations..."
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
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {dashboardObligations.length === 0 ? "No obligations loaded." : "No obligations match the current filter."}
                    </p>
                  ) : (
                    <div className="divide-y rounded-b-[18px] border border-t-0 border-[#DCE3EE] bg-white">
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
                </TracePanel>

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
              <ScrollArea className="trace-workbench-scroll flex-1">
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
            <ScrollArea className="trace-workbench-scroll flex-1">
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
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">{crossMetricDialog?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

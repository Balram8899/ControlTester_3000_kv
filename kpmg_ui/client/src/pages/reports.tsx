import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileBarChart, RefreshCw, Download, Trash2, ChevronRight, AlertCircle,
  CheckCircle2, FileText, GitCompare, Network, ShieldCheck, ScanSearch,
  FilePenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ControlTestingKpis from "@/components/ControlTestingKpis";

interface GapSummary {
  total_documents: number;
  total_domains: number;
  shared_domain_count: number;
  partial_coverage_domain_count: number;
}

interface ControlTestSummary {
  controls_tested: number;
  controls_with_evidence: number;
  controls_without_evidence: number;
  overall_result: string;
  pass_count: number;
  fail_count: number;
  partial_count: number;
  no_evidence_count: number;
  severity_counts?: { high: number; medium: number; low: number };
}

interface ReportSummary {
  report_id: string;
  report_type?: string;          // "rcm_compliance" | "regulatory_gap_analysis" | "control_testing" | undefined
  created_at: string;
  regulation_document_ids: string[];
  regulation_names: string[];
  document_names?: string[];
  document_count?: number;
  rcm_filename: string;
  workpaper_filename?: string;
  model_used: string;
  status: string;
  error_message?: string | null;
  compliance_stats?: {
    total_controls?: number;
    controls_analyzed?: number;
    compliant?: number;
    partial_compliant?: number;
    non_compliant?: number;
    overall_compliance_score?: number;
    risk_level?: string;
  };
  suggestions_summary_counts?: Record<string, number>;
  gap_summary?: GapSummary;
  graph_context_used?: boolean;
  controls_tested?: number;
  summary?: ControlTestSummary;
  session_id?: string;
  case_id?: string;
  process_name?: string;
  case_title?: string;
  suggestion_counts?: { total?: number; accepted?: number; edited?: number; rejected?: number };
  output_files?: { type: string; filename: string; output_id?: string }[];
  // Evidence assessment specific
  evidence_files?: string[];
  evidence_file_count?: number;
  assessment_count?: number;
  controls_graph_nodes?: number;
}

interface FullReport extends ReportSummary {
  analysis?: Record<string, unknown>;
  executive_summary?: string;
  final_report?: string;
  domain_reports?: Record<string, string>;
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [fullReports, setFullReports] = useState<Record<string, FullReport>>({});
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState<string | null>(null);

  const fetchReports = () => {
    setLoading(true);
    fetch("/api/rcm-reports")
      .then(r => r.json())
      .then(data => {
        setReports(data.reports ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchReports(); }, []);

  const handleViewReport = async (reportId: string) => {
    if (expandedReport === reportId) {
      setExpandedReport(null);
      return;
    }
    setExpandedReport(reportId);

    if (!fullReports[reportId]) {
      setLoadingReport(reportId);
      try {
        const res = await fetch(`/api/rcm-reports/${reportId}`);
        const data = await res.json();
        if (data.success && data.report) {
          setFullReports(prev => ({ ...prev, [reportId]: data.report }));
        }
      } catch {
        toast({ title: "Error", description: "Failed to load report details", variant: "destructive" });
      } finally {
        setLoadingReport(null);
      }
    }
  };

  const handleDownloadRcm = async (reportId: string, filename: string) => {
    try {
      const res = await fetch(`/api/rcm-reports/${reportId}/rcm-file`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: filename });
    } catch {
      toast({ title: "Error", description: "Failed to download RCM file", variant: "destructive" });
    }
  };

  const handleDownloadSopOutput = async (report: ReportSummary, output: { type: string; filename: string; output_id?: string }) => {
    if (!report.case_id || !output.output_id) return;
    try {
      const res = await fetch(`/api/sop-uplift/cases/${report.case_id}/outputs/${output.output_id}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = output.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: output.filename });
    } catch {
      toast({ title: "Error", description: "Failed to download SOP Uplift output", variant: "destructive" });
    }
  };

  const handleExportJson = (reportId: string) => {
    const full = fullReports[reportId];
    if (!full) return;
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${reportId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Report downloaded as JSON" });
  };

  const handleExportMarkdown = (reportId: string) => {
    const full = fullReports[reportId];
    const content = full?.final_report || full?.executive_summary;
    if (!content) return;
    const isGap = full?.report_type === "regulatory_gap_analysis";
    const blob = new Blob([content], { type: isGap ? "text/markdown" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isGap
      ? `gap_analysis_${reportId.slice(0, 8)}.md`
      : `rcm_report_${reportId.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Report downloaded" });
  };

  const handleExportPdf = async (reportId: string) => {
    const full = fullReports[reportId];
    const content = full?.final_report;
    if (!content) return;
    setPdfExporting(reportId);
    try {
      const res = await fetch("/api/regulatory-library/gap-analysis-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_report: content }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gap_analysis_${reportId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "Report downloaded as PDF" });
    } catch {
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setPdfExporting(null);
    }
  };

  const handleDelete = async (reportId: string) => {
    try {
      const res = await fetch(`/api/rcm-reports/${reportId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setReports(prev => prev.filter(r => r.report_id !== reportId));
        if (expandedReport === reportId) setExpandedReport(null);
        toast({ title: "Deleted", description: "Report removed" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete report", variant: "destructive" });
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const riskColor = (level?: string) => {
    if (!level) return "text-muted-foreground";
    if (level === "LOW") return "text-green-400";
    if (level === "MEDIUM") return "text-yellow-400";
    return "text-red-400";
  };

  const isGapReport = (r: ReportSummary) => r.report_type === "regulatory_gap_analysis";
  const isControlTest = (r: ReportSummary) => r.report_type === "control_testing";
  const isEvidenceAssessment = (r: ReportSummary) => r.report_type === "evidence_assessment";
  const isSopUplift = (r: ReportSummary) => r.report_type === "sop_uplift";
  const sopOutputLabel = (type: string) => {
    const labels: Record<string, string> = {
      docx: "Updated SOP (DOCX)",
      vsdx: "Process Diagram (VSDX)",
      drawio: "Diagram (Draw.io)",
      mermaid: "Diagram (Mermaid)",
      diagram_png: "Diagram (PNG)",
      diagram_pdf: "Diagram (PDF)",
      diagram_svg: "Diagram (SVG)",
      svg: "Diagram (SVG)",
      changelog_markdown: "Change Log (Markdown)",
      changelog_json: "Audit Log (JSON)",
    };
    return labels[type] ?? type.replace(/_/g, " ");
  };
  const sopFallbackOutputs: { type: string; filename: string; output_id?: string }[] = [
    { type: "docx", filename: "Vendor_Onboarding_SOP_Uplifted.docx" },
    { type: "vsdx", filename: "Vendor_Onboarding_Process_Swimlane.vsdx" },
    { type: "changelog_markdown", filename: "Vendor_Onboarding_ChangeLog.md" },
    { type: "changelog_json", filename: "Vendor_Onboarding_AuditLog.json" },
  ];

  return (
    <div className="h-full flex flex-col">
      <HeroSection
        title="Reports"
        subtitle="Evidence assessments, control testing workpapers, RCM compliance assessments, and regulatory gap analyses"
        icon={FileBarChart}
        actions={
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchReports}
            disabled={loading}
            className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      <TracePageBody width="wide" contentClassName="space-y-4">

          {loading && reports.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
                  <div className="h-4 w-48 bg-muted rounded mb-3" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-20">
              <FileBarChart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No reports yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Run an Evidence Assessment, Control Testing workpaper, RCM compliance analysis, or Regulatory Library gap analysis to see records here
              </p>
            </div>
          ) : (
            reports.map((report) => {
              const gap = isGapReport(report);
              const ctTest = isControlTest(report);
              const evAssess = isEvidenceAssessment(report);
              const sopUplift = isSopUplift(report);
              const isExpanded = expandedReport === report.report_id;
              const full = fullReports[report.report_id];
              const stats = report.compliance_stats;
              const gapSum = report.gap_summary;
              const ctSum = report.summary;
              const names = gap
                ? (report.document_names ?? report.regulation_names ?? [])
                : report.regulation_names;

              return (
                <Collapsible
                  key={report.report_id}
                  open={isExpanded}
                  onOpenChange={() => handleViewReport(report.report_id)}
                >
                  <Card className={`transition-colors ${isExpanded ? "border-primary/30" : ""}`}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-accent/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Report type badge */}
                              {gap ? (
                                <Badge variant="outline" className="text-[10px] gap-1 border-violet-400 text-violet-500 dark:text-violet-400">
                                  <GitCompare className="h-3 w-3" />
                                  Gap Analysis
                                </Badge>
                              ) : ctTest ? (
                                <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-500 dark:text-amber-400">
                                  <ShieldCheck className="h-3 w-3" />
                                  AI Control Testing
                                </Badge>
                              ) : evAssess ? (
                                <Badge variant="outline" className="text-[10px] gap-1 border-teal-400 text-teal-500 dark:text-teal-400">
                                  <ScanSearch className="h-3 w-3" />
                                  Evidence Assessment
                                </Badge>
                              ) : sopUplift ? (
                                <Badge variant="outline" className="text-[10px] gap-1 border-cyan-400 text-cyan-600 dark:text-cyan-400">
                                  <FilePenLine className="h-3 w-3" />
                                  SOP Uplift
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] gap-1 border-blue-400 text-blue-500 dark:text-blue-400">
                                  <FileBarChart className="h-3 w-3" />
                                  RCM Assessment
                                </Badge>
                              )}

                              <CardTitle className="text-sm font-semibold">
                                {gap
                                  ? `${names.length} framework${names.length !== 1 ? "s" : ""} compared`
                                  : ctTest
                                  ? report.workpaper_filename ?? report.rcm_filename
                                  : evAssess
                                  ? `${report.evidence_file_count ?? 0} evidence file${(report.evidence_file_count ?? 0) !== 1 ? "s" : ""} assessed`
                                  : sopUplift
                                  ? report.case_title ?? report.process_name ?? "SOP Uplift case"
                                  : report.rcm_filename}
                              </CardTitle>

                              <Badge
                                variant={report.status === "success" ? "default" : "destructive"}
                                className="text-[10px]"
                              >
                                {report.status === "success" ? (
                                  <><CheckCircle2 className="h-3 w-3 mr-1" />Complete</>
                                ) : (
                                  <><AlertCircle className="h-3 w-3 mr-1" />Error</>
                                )}
                              </Badge>

                              {!gap && !ctTest && stats?.risk_level && (
                                <Badge variant="outline" className={`text-[10px] ${riskColor(stats.risk_level)}`}>
                                  {stats.risk_level} Risk
                                </Badge>
                              )}

                              {ctTest && ctSum?.overall_result && (
                                <Badge variant="outline" className={`text-[10px] ${
                                  ctSum.overall_result === "COMPLIANT" ? "border-green-400 text-green-500 dark:text-green-400"
                                  : ctSum.overall_result === "NON_COMPLIANT" ? "border-red-400 text-red-500 dark:text-red-400"
                                  : "border-yellow-400 text-yellow-500 dark:text-yellow-400"
                                }`}>
                                  {ctSum.overall_result.replace(/_/g, " ")}
                                </Badge>
                              )}

                              {gap && report.graph_context_used && (
                                <Badge variant="outline" className="text-[10px] gap-1 border-emerald-400 text-emerald-600 dark:text-emerald-400">
                                  <Network className="h-3 w-3" />
                                  Graph-enriched
                                </Badge>
                              )}
                            </div>

                            {/* Framework / regulation name pills (not shown for control testing or evidence assessment) */}
                            {!ctTest && !evAssess && !sopUplift && (
                              <div className="flex flex-wrap gap-1.5">
                                {names.map((name, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {evAssess && report.evidence_files && report.evidence_files.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {report.evidence_files.map((f, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">
                                    {f}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {sopUplift && report.output_files && report.output_files.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {report.output_files.map((f, i) => (
                                  <Badge key={`${f.type}-${i}`} variant="secondary" className="text-[10px]">
                                    {f.type.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                              <span>{formatDate(report.created_at)}</span>
                              {!gap && !ctTest && !evAssess && stats?.overall_compliance_score != null && (
                                <span>Score: {stats.overall_compliance_score}%</span>
                              )}
                              {!gap && !ctTest && !evAssess && stats?.controls_analyzed != null && (
                                <span>{stats.controls_analyzed} controls analyzed</span>
                              )}
                              {ctTest && ctSum && (
                                <span>{ctSum.controls_tested} controls tested</span>
                              )}
                              {evAssess && (
                                <>
                                  <span>{report.assessment_count ?? 0} controls assessed</span>
                                  {report.controls_graph_nodes ? <span>{report.controls_graph_nodes} graph nodes</span> : null}
                                </>
                              )}
                              {sopUplift && (
                                <>
                                  <span>{report.process_name ?? "Process not set"}</span>
                                  <span>{report.suggestion_counts?.total ?? 0} suggestions</span>
                                  <span>{report.suggestion_counts?.accepted ?? 0} accepted</span>
                                  <span>{report.suggestion_counts?.edited ?? 0} edited</span>
                                  <span>{report.suggestion_counts?.rejected ?? 0} rejected</span>
                                </>
                              )}
                              {gap && gapSum && (
                                <>
                                  <span>{gapSum.total_domains} domains</span>
                                  <span>{gapSum.shared_domain_count} shared</span>
                                  <span>{gapSum.partial_coverage_domain_count} gaps</span>
                                </>
                              )}
                            </div>
                          </div>

                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 mt-1 ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-4">
                        {sopUplift && (
                          <div className="space-y-4">
                            <div className="rounded-md border border-[#D8E0ED] bg-white p-5">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h3 className="text-lg font-semibold text-[#0C233C]">Outputs & Reports</h3>
                                  <p className="mt-1 text-xs text-muted-foreground">Generated and downloadable uplifted deliverables.</p>
                                </div>
                                <Button size="sm" className="gap-1.5 bg-[#1E49E2] text-xs hover:bg-[#00338D]">
                                  <Download className="h-3 w-3" /> Download All
                                </Button>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                                {[
                                  { label: "Total suggestions", value: report.suggestion_counts?.total ?? 0 },
                                  { label: "Accepted", value: report.suggestion_counts?.accepted ?? 0 },
                                  { label: "Edited", value: report.suggestion_counts?.edited ?? 0 },
                                  { label: "Rejected", value: report.suggestion_counts?.rejected ?? 0 },
                                  { label: "Artifacts", value: report.output_files?.length ?? sopFallbackOutputs.length },
                                ].map((metric) => (
                                  <div key={metric.label} className="rounded-md border border-[#E6ECF5] bg-[#FAFCFF] p-3">
                                    <p className="text-xl font-semibold text-[#00338D]">{metric.value}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">{metric.label}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-md border border-[#D8E0ED] bg-white p-5">
                              <h4 className="mb-4 text-sm font-semibold text-[#0C233C]">Generated artifacts</h4>
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                {(report.output_files?.length ? report.output_files : sopFallbackOutputs).map((output) => (
                                  <div key={`${report.report_id}-${output.type}`} className="rounded-md border border-[#D8E0ED] bg-white p-4">
                                    <div className="mb-3 flex items-center gap-3">
                                      <span className="grid h-10 w-10 place-items-center rounded bg-[#E8F8FD] text-[#1E49E2]">
                                        {output.type.includes("diagram") || output.type === "vsdx" || output.type === "drawio"
                                          ? <Network className="h-5 w-5" />
                                          : <FileText className="h-5 w-5" />}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[#0C233C]">{sopOutputLabel(output.type)}</p>
                                        <p className="truncate text-[11px] text-muted-foreground">{output.filename}</p>
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-full text-xs"
                                      onClick={(e) => { e.stopPropagation(); handleDownloadSopOutput(report, output); }}
                                      disabled={!report.case_id || !output.output_id}
                                    >
                                      <Download className="mr-1.5 h-3 w-3" /> Download
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                              <div className="rounded-md border border-[#D8E0ED] bg-white p-5">
                                <h4 className="mb-4 text-sm font-semibold text-[#0C233C]">Swimlane preview</h4>
                                <div className="overflow-x-auto rounded-md border border-[#D8E0ED] bg-[#FAFCFF]">
                                  <div className="min-w-[820px] text-[11px] text-[#0C233C]">
                                    {[
                                      ["Business Owner", "Submit onboarding request", "Check completeness", "High risk?", "Retain evidence"],
                                      ["Operations Risk", "", "Perform due diligence", "Exception approval", "Compliance review"],
                                      ["Compliance", "", "Incomplete onboarding", "Unapproved exception", "Evidence repository"],
                                      ["Control Testing", "", "", "Select test sample", "Record testing outcome"],
                                    ].map((lane) => (
                                      <div key={lane[0]} className="grid grid-cols-[145px_repeat(4,1fr)] border-b border-[#D8E0ED] last:border-b-0">
                                        <div className="bg-[#00338D] p-3 font-semibold text-white">{lane[0]}</div>
                                        {lane.slice(1).map((step, index) => (
                                          <div key={`${lane[0]}-${index}`} className="min-h-16 border-l border-[#D8E0ED] p-3">
                                            {step && (
                                              <span className={step.includes("?") ? "inline-block border border-[#0086A8] bg-white px-3 py-2 text-center" : "inline-block border border-[#00338D] bg-white px-3 py-2 text-center"}>
                                                {step}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="rounded-md border border-[#D8E0ED] bg-white p-4">
                                  <h4 className="mb-3 text-sm font-semibold text-[#0C233C]">Control summary</h4>
                                  {["C1 - Completeness check", "C2 - Weekly exception approval", "C3 - Evidence retention", "C4 - Test sample review"].map((control) => (
                                    <p key={control} className="mb-2 text-xs text-[#0C233C]">{control}</p>
                                  ))}
                                </div>
                                <div className="rounded-md border border-[#D8E0ED] bg-white p-4">
                                  <h4 className="mb-3 text-sm font-semibold text-[#E5001B]">Risk summary</h4>
                                  {["R1 - Incomplete onboarding may lead to vendor risk exposure", "R2 - Unapproved exception may result in compliance breach"].map((risk) => (
                                    <p key={risk} className="mb-2 text-xs text-[#0C233C]">{risk}</p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* ── Control Testing KPI cards ── */}
                        {ctTest && ctSum && (
                          <div className="space-y-3">
                            <ControlTestingKpis
                              controlsTested={ctSum.controls_tested}
                              issuesIdentified={ctSum.fail_count + ctSum.partial_count}
                              severityCounts={ctSum.severity_counts}
                            />
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                { label: "Pass", value: ctSum.pass_count, color: "text-green-400" },
                                { label: "Fail", value: ctSum.fail_count, color: "text-red-400" },
                                { label: "Partial", value: ctSum.partial_count, color: "text-yellow-400" },
                                { label: "No Evidence", value: ctSum.no_evidence_count, color: "text-muted-foreground" },
                              ].map((kpi) => (
                                <div key={kpi.label} className="rounded-lg bg-muted/30 p-3 text-center">
                                  <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Evidence assessment KPI row ── */}
                        {evAssess && (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: "Files Assessed", value: report.evidence_file_count ?? 0, color: "text-teal-400" },
                              { label: "Controls Tested", value: report.assessment_count ?? 0, color: "text-blue-400" },
                            ].map((kpi) => (
                              <div key={kpi.label} className="rounded-lg bg-muted/30 p-3 text-center">
                                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── RCM compliance KPI row ── */}
                        {!gap && !ctTest && !evAssess && stats && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: "Compliant", value: stats.compliant ?? 0, color: "text-green-400" },
                              { label: "Partial", value: stats.partial_compliant ?? 0, color: "text-yellow-400" },
                              { label: "Non-Compliant", value: stats.non_compliant ?? 0, color: "text-red-400" },
                              { label: "Score", value: `${stats.overall_compliance_score ?? 0}%`, color: "text-blue-400" },
                            ].map((kpi) => (
                              <div key={kpi.label} className="rounded-lg bg-muted/30 p-3 text-center">
                                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── Gap analysis KPI row ── */}
                        {gap && gapSum && (
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: "Domains Found", value: gapSum.total_domains, color: "text-blue-400" },
                              { label: "Shared", value: gapSum.shared_domain_count, color: "text-emerald-400" },
                              { label: "Gaps", value: gapSum.partial_coverage_domain_count, color: "text-amber-400" },
                            ].map((kpi) => (
                              <div key={kpi.label} className="rounded-lg bg-muted/30 p-3 text-center">
                                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── Report content ── */}
                        {loadingReport === report.report_id ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                          </div>
                        ) : gap && (full?.final_report) ? (
                          <ScrollArea className="max-h-96 rounded-lg border bg-muted/20 p-4">
                            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {full.final_report}
                              </ReactMarkdown>
                            </div>
                          </ScrollArea>
                        ) : (evAssess || (!gap && !ctTest)) && full?.executive_summary ? (
                          <ScrollArea className="max-h-80 rounded-lg border bg-muted/20 p-4">
                            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                              {full.executive_summary}
                            </pre>
                          </ScrollArea>
                        ) : null}

                        {report.error_message && (
                          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
                            <p className="text-xs text-destructive">{report.error_message}</p>
                          </div>
                        )}

                        {/* ── Action buttons ── */}
                        <div className="flex flex-wrap gap-2">
                          {/* Evidence Assessment: download PDF workbook */}
                          {sopUplift && report.output_files?.map((output) => (
                            <Button
                              key={`${report.report_id}-${output.type}`}
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDownloadSopOutput(report, output); }}
                              className="gap-1.5 text-xs"
                            >
                              <Download className="h-3 w-3" /> {output.type.replace(/_/g, " ")}
                            </Button>
                          ))}

                          {/* Evidence Assessment: download PDF workbook */}
                          {evAssess && report.rcm_filename && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDownloadRcm(report.report_id, report.rcm_filename); }}
                              className="gap-1.5 text-xs"
                            >
                              <Download className="h-3 w-3" /> Download Report
                            </Button>
                          )}

                          {/* Control Testing: download workpaper */}
                          {ctTest && report.rcm_filename && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDownloadRcm(report.report_id, report.rcm_filename); }}
                              className="gap-1.5 text-xs"
                            >
                              <Download className="h-3 w-3" /> Download Workpaper
                            </Button>
                          )}

                          {/* RCM-only: download source file */}
                          {!gap && !ctTest && report.rcm_filename && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDownloadRcm(report.report_id, report.rcm_filename); }}
                              className="gap-1.5 text-xs"
                            >
                              <Download className="h-3 w-3" /> Download RCM
                            </Button>
                          )}

                          {/* MD export — gap uses final_report, RCM uses executive_summary (not for control testing) */}
                          {!ctTest && full && (full.final_report || full.executive_summary) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleExportMarkdown(report.report_id); }}
                              className="gap-1.5 text-xs"
                            >
                              <FileText className="h-3 w-3" />
                              {gap ? "Export MD" : "Export Report"}
                            </Button>
                          )}

                          {/* PDF export — gap analysis only */}
                          {gap && full?.final_report && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleExportPdf(report.report_id); }}
                              disabled={pdfExporting === report.report_id}
                              className="gap-1.5 text-xs"
                            >
                              {pdfExporting === report.report_id
                                ? <><span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />Generating…</>
                                : <><Download className="h-3 w-3" />Export PDF</>
                              }
                            </Button>
                          )}

                          {/* JSON export — always available once full report loaded */}
                          {full && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleExportJson(report.report_id); }}
                              className="gap-1.5 text-xs"
                            >
                              <Download className="h-3 w-3" /> Export JSON
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleDelete(report.report_id); }}
                            className="gap-1.5 text-xs text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </Button>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
      </TracePageBody>
    </div>
  );
}

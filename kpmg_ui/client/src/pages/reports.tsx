import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileBarChart, RefreshCw, Download, Trash2, ChevronRight, AlertCircle,
  CheckCircle2, FileText, GitCompare, Network, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

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

  return (
    <div className="h-full flex flex-col">
      {/* Pinned header */}
      <div
        className="flex-shrink-0 px-6 py-3 flex items-center gap-3"
        style={{
          background: "linear-gradient(135deg, hsl(262 80% 20% / 0.4), hsl(217 91% 20% / 0.3))",
          borderBottom: "1px solid hsl(217 91% 55% / 0.2)",
        }}
      >
        <FileBarChart className="h-6 w-6 text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground leading-tight">Reports</h1>
          <p className="text-xs text-muted-foreground">Control testing workpapers, RCM compliance assessments, and regulatory gap analyses</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchReports}
          disabled={loading}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">

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
                Run a Control Testing workpaper, RCM compliance analysis, or Regulatory Library gap analysis to see records here
              </p>
            </div>
          ) : (
            reports.map((report) => {
              const gap = isGapReport(report);
              const ctTest = isControlTest(report);
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

                            {/* Framework / regulation name pills (not shown for control testing) */}
                            {!ctTest && (
                              <div className="flex flex-wrap gap-1.5">
                                {names.map((name, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                              <span>{formatDate(report.created_at)}</span>
                              {!gap && !ctTest && stats?.overall_compliance_score != null && (
                                <span>Score: {stats.overall_compliance_score}%</span>
                              )}
                              {!gap && !ctTest && stats?.controls_analyzed != null && (
                                <span>{stats.controls_analyzed} controls analyzed</span>
                              )}
                              {ctTest && ctSum && (
                                <span>{ctSum.controls_tested} controls tested</span>
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
                        {/* ── Control Testing KPI row ── */}
                        {ctTest && ctSum && (
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
                        )}

                        {/* ── RCM compliance KPI row ── */}
                        {!gap && !ctTest && stats && (
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
                        ) : !gap && !ctTest && full?.executive_summary ? (
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
        </div>
      </div>
    </div>
  );
}

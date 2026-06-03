import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAssetRegistry } from "@/contexts/AssetRegistryContext";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useIssueManagement } from "@/contexts/IssueManagementContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import { useRiskAssessment } from "@/contexts/RiskAssessmentContext";
import {
  ClipboardList,
  FileBarChart,
  Grid2X2,
  RefreshCw,
  Scale,
  TestTube,
  Workflow,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import HeroSection from "@/components/HeroSection";
import TracePageBody from "@/components/TracePageBody";
import {
  AXIS_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  GRID_STYLE,
} from "@/lib/chartTheme";

type DashboardTab = "overview" | "libraries" | "workflows" | "exceptions";

type Tone = "blue" | "cyan" | "purple" | "green" | "amber" | "red" | "navy" | "teal";

type ChartDatum = {
  name: string;
  value: number;
  fill: string;
};

type BarLabelMode = "default" | "rotate" | "compact";

type SystemStatusSnapshot = {
  active_provider?: string;
  active_model?: string;
  regulatory_library?: {
    documents?: number;
    status?: string;
  };
  controls_library?: {
    documents?: number;
    status?: string;
  };
  platform?: {
    status?: string;
  };
};

type TestingSession = {
  id: string;
  status?: string;
  controls?: Array<{
    test_result?: string;
    evidence_text?: string;
  }>;
  report_markdown?: string | null;
};

type ReportSummary = {
  report_id: string;
  report_type?: string;
  status?: string;
  output_files?: Array<{ type?: string; filename?: string }>;
};

type SopCase = {
  case_id: string;
  status?: string;
  uploaded_files?: unknown[];
  suggestions?: Array<{ status?: string }>;
  outputs?: unknown[];
};

type FrameworkDocument = {
  document_id?: string;
  framework_name?: string;
  total_elements?: number;
  elements_by_category?: Record<string, number>;
};

type FrameworkElement = {
  risk_category?: string;
  specificity_level?: string;
};

const TONE_COLORS: Record<Tone, string> = {
  blue: "#1E49E2",
  cyan: "#00B8F5",
  purple: "#7213EA",
  green: "#009A44",
  amber: "#EAAA00",
  red: "#E5001B",
  navy: "#00338D",
  teal: "#098E7E",
};

const TONE_TINTS: Record<Tone, string> = {
  blue: "#EEF2FF",
  cyan: "#EFF8FF",
  purple: "#F3F0FF",
  green: "#EDFBF5",
  amber: "#FFFBEB",
  red: "#FEEBED",
  navy: "#EEF2FF",
  teal: "#E6F4F2",
};

const CHART_COLORS = ["#00338D", "#1E49E2", "#00B8F5", "#098E7E", "#009A44", "#EAAA00", "#E5001B", "#7213EA"];
const RISK_BANDS = ["Low", "Medium", "High", "Critical"] as const;
const ASSESSMENT_STATUSES = ["draft", "in_progress", "risks_identified", "controls_applied", "complete"] as const;
const TESTING_STATUSES = ["draft", "in_progress", "complete"] as const;
const TEST_RESULTS = ["pass", "partial", "fail", "not_tested"] as const;
const ISSUE_STATUSES = ["Open", "In Remediation", "Pending Review", "Returned", "Closed"] as const;
const QUEUE_STATUSES = ["Pending", "Accepted", "Dismissed"] as const;

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function titleize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function reportTypeLabel(type?: string) {
  if (type === "rcm_compliance") return "RCM";
  if (type === "regulatory_gap_analysis") return "Regulatory Testing";
  if (type === "control_testing") return "Control Testing";
  if (type === "evidence_assessment") return "Final Reporting";
  if (type === "sop_uplift") return "SOP Uplift";
  return type ? titleize(type) : "Report";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function shortenAxisLabel(value: string, maxChars: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function withColors(data: Array<{ name: string; value: number }>, start = 0): ChartDatum[] {
  return data.map((item, index) => ({
    ...item,
    fill: CHART_COLORS[(index + start) % CHART_COLORS.length],
  }));
}

function orderedCounts<T>(
  items: T[],
  order: readonly string[],
  getKey: (item: T) => string | undefined | null,
  start = 0,
) {
  const counts = new Map(order.map(label => [label, 0]));
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return withColors(order.map(name => ({ name: titleize(name), value: counts.get(name) ?? 0 })), start);
}

function groupedCounts<T>(items: T[], getKey: (item: T) => string | undefined | null, start = 0) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    const name = key ? titleize(key) : "Unspecified";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return withColors(
    Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    start,
  );
}

function hasChartData(data: ChartDatum[]) {
  return data.some(item => item.value > 0);
}

function EmptyChart({ label = "No Records" }: { label?: string }) {
  return (
    <div className="flex h-[230px] items-center justify-center rounded-xl border border-dashed border-[#E2E6EF] bg-[#F8FAFC] text-[13px] font-semibold text-[#8492A6]">
      {label}
    </div>
  );
}

function KpiMetricCard({
  label,
  value,
  subLabel,
  badge,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  subLabel: string;
  badge?: string;
  tone: Tone;
  onClick: () => void;
}) {
  const accent = TONE_COLORS[tone];
  return (
    <button
      type="button"
      data-dashboard-kpi-style="reference-number-card"
      onClick={onClick}
      className="group relative min-h-[168px] overflow-hidden rounded-[18px] border border-[#D9E1EC] bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute left-0 right-0 top-0 h-[3px] rounded-t-[18px]" style={{ background: accent }} />
      <p className="text-[11px] font-bold uppercase leading-4 tracking-[2.2px] text-[#8492A6]">{label}</p>
      <p className="mt-4 text-[42px] font-bold leading-none tracking-tight text-[#0C233C]">{value}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#6B7890]">{subLabel}</p>
      {badge ? (
        <span
          className="mt-4 inline-flex max-w-full items-center rounded-full px-3 py-1 text-[11px] font-bold"
          style={{ background: TONE_TINTS[tone], color: accent }}
        >
          <span className="truncate">{badge}</span>
        </span>
      ) : null}
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[17px] font-bold tracking-tight text-[#0C233C]">{title}</h3>
    </div>
  );
}

function ChartCard({
  title,
  footerLabel,
  footerValue,
  children,
  wide = false,
  className = "",
}: {
  title: string;
  footerLabel: string;
  footerValue: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <section className={`rounded-[18px] border border-[#D9E1EC] bg-white p-7 shadow-sm ${wide ? "xl:col-span-2" : ""} ${className}`}>
      <SectionTitle title={title} />
      {children}
      <div className="mt-4 flex items-center justify-between border-t border-[#E2E6EF] pt-3 text-[12px]">
        <span className="text-[#5A6478]">{footerLabel}</span>
        <span className="font-bold text-[#0C233C]">{footerValue}</span>
      </div>
    </section>
  );
}

function BarChartPanel({
  data,
  height = 210,
  labelMode = "default",
}: {
  data: ChartDatum[];
  height?: number;
  labelMode?: BarLabelMode;
}) {
  if (!hasChartData(data)) return <EmptyChart />;
  const rotate = labelMode === "rotate";
  const compact = labelMode === "compact";
  const xAxisHeight = rotate ? 76 : 40;
  const tickFontSize = compact ? 9 : 10;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -4, bottom: rotate ? 28 : 12 }} barCategoryGap={compact ? "22%" : "18%"}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis
          dataKey="name"
          tick={{ ...AXIS_STYLE, fontSize: tickFontSize }}
          interval={0}
          tickMargin={rotate ? 14 : 10}
          height={xAxisHeight}
          angle={rotate ? -28 : 0}
          textAnchor={rotate ? "end" : "middle"}
          tickFormatter={value => shortenAxisLabel(String(value), rotate ? 18 : compact ? 12 : 16)}
          minTickGap={compact ? 4 : 8}
        />
        <YAxis tick={{ ...AXIS_STYLE, fontSize: 10 }} width={30} allowDecimals={false} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} cursor={{ fill: "var(--osint-glow)" }} />
        <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DonutChartPanel({ data }: { data: ChartDatum[] }) {
  if (!hasChartData(data)) return <EmptyChart />;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="grid gap-5 xl:grid-cols-[170px_minmax(0,1fr)] xl:items-center">
      <div className="rounded-[18px] border border-[#EEF2F7] bg-[#FBFCFE] p-3">
        <div className="relative mx-auto aspect-square w-full max-w-[158px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="92%"
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                isAnimationActive
                animationDuration={1050}
                animationEasing="ease-out"
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[28px] font-bold leading-none tracking-tight text-[#0C233C]">{formatNumber(total)}</div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[2px] text-[#8492A6]">Total</div>
            </div>
          </div>
        </div>
      </div>
      <div className="max-h-[212px] space-y-2.5 overflow-auto pr-1">
        {data.filter(item => item.value > 0).map(item => (
          <div key={item.name} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.fill }} />
            <span className="truncate text-[#0C233C]">{item.name}</span>
            <span className="font-bold text-[#0C233C]">
              {formatNumber(item.value)} ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalPercentPanel({ data }: { data: ChartDatum[] }) {
  if (!hasChartData(data)) return <EmptyChart />;
  return (
    <div className="space-y-4">
      {data.map((item, index) => {
        const width = clampPercent(item.value);
        const animationStyle: CSSProperties = {
          width: `${width}%`,
          background: item.fill,
          transformOrigin: "left",
          animation: `dashboardScaleX 900ms cubic-bezier(0.2, 1, 0.3, 1) ${index * 90}ms both`,
        };
        return (
        <div key={item.name} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 text-[12px]">
          <span className="truncate font-semibold text-[#0C233C]">{item.name}</span>
          <div className="h-8 overflow-hidden rounded-md bg-[#EEF2FF]">
            <div className="h-full rounded-md" style={animationStyle} />
          </div>
          <span className="text-right font-bold text-[#0C233C]">{formatPercent(item.value)}</span>
        </div>
        );
      })}
    </div>
  );
}

function SegmentedStatusPanel({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <EmptyChart />;
  return (
    <div className="space-y-5">
      <div className="flex h-11 overflow-hidden rounded-md border border-[#D9E1EC]">
        {data.filter(item => item.value > 0).map((item, index) => {
          const pct = (item.value / total) * 100;
          const segmentStyle: CSSProperties = {
            width: `${pct}%`,
            background: item.fill,
            animation: `dashboardScaleX 950ms cubic-bezier(0.2, 1, 0.3, 1) ${index * 90}ms both`,
            transformOrigin: "left",
          };
          return (
            <div
              key={item.name}
              className="flex min-w-[42px] items-center justify-center border-r border-white/60 text-[12px] font-bold text-white last:border-r-0"
              style={segmentStyle}
              title={`${item.name}: ${formatNumber(item.value)}`}
            >
              {Math.round(pct)}%
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {data.map(item => (
          <div key={item.name} className="flex items-center gap-2 text-[12px] text-[#5A6478]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.fill }} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModuleMetricCard({
  title,
  metrics,
  tone,
  icon,
  onClick,
}: {
  title: string;
  metrics: Array<{ label: string; value: string }>;
  tone: Tone;
  icon: ReactNode;
  onClick: () => void;
}) {
  const accent = TONE_COLORS[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden rounded-lg border border-[#D9E1EC] bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute left-0 right-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: TONE_TINTS[tone], color: accent }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold uppercase tracking-[0.4px] text-[#0C233C]">{title}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {metrics.map(metric => (
              <div key={metric.label}>
                <p className="text-[22px] font-bold leading-none" style={{ color: accent }}>{metric.value}</p>
                <p className="mt-1 text-[11px] text-[#8492A6]">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { setPendingQualityAnalysis } = useCrossNav();
  const {
    regDocs,
    ctrlDocs,
    totalObligations,
    totalControls,
    allControls,
    ctrlCoveragePct,
    orphanedCtrlCount,
    avgMatchScore,
    lowQualityPct,
    gapObligations,
    oblCoveragePct,
    potentialDuplicates,
    confirmedDuplicates,
    domainCoveragePct,
    barChartData,
    pieData,
    loading,
    analysisLoading,
    lastRefreshed,
    refreshMetrics,
  } = useLibraryMetrics();
  const { assets, fetchAssets, isLoading: assetsLoading } = useAssetRegistry();
  const { assessments, fetchAssessments, isLoading: assessmentsLoading } = useRiskAssessment();
  const { issues, queueItems, fetchIssues, fetchQueue, isLoading: issuesLoading, isLoadingQueue } = useIssueManagement();

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [systemStatus, setSystemStatus] = useState<SystemStatusSnapshot | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(false);
  const [pageRecordsLoading, setPageRecordsLoading] = useState(false);
  const [testingSessions, setTestingSessions] = useState<TestingSession[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [sopCases, setSopCases] = useState<SopCase[]>([]);
  const [frameworkDocs, setFrameworkDocs] = useState<FrameworkDocument[]>([]);
  const [frameworkElements, setFrameworkElements] = useState<FrameworkElement[]>([]);

  const refreshSystemStatus = useCallback(async () => {
    setSystemStatusLoading(true);
    try {
      const response = await fetch("/api/settings/system-status");
      if (!response.ok) throw new Error(`Status ${response.status}`);
      setSystemStatus(await response.json());
    } catch {
      setSystemStatus(previous => previous ?? {
        active_model: "Unavailable",
        regulatory_library: { documents: regDocs.length, status: regDocs.length > 0 ? "loaded" : "empty" },
        controls_library: { documents: ctrlDocs.length, status: ctrlDocs.length > 0 ? "loaded" : "empty" },
        platform: { status: "degraded" },
      });
    } finally {
      setSystemStatusLoading(false);
    }
  }, [ctrlDocs.length, regDocs.length]);

  const refreshPageRecords = useCallback(async () => {
    setPageRecordsLoading(true);
    try {
      const [testingResult, reportsResult, sopResult, frameworkDocsResult, frameworkElementsResult] = await Promise.allSettled([
        fetch("/api/control-testing").then(r => (r.ok ? r.json() : [])),
        fetch("/api/rcm-reports").then(r => (r.ok ? r.json() : { reports: [] })),
        fetch("/api/sop-uplift/cases").then(r => (r.ok ? r.json() : { cases: [] })),
        fetch("/api/frameworks-library/documents").then(r => (r.ok ? r.json() : { documents: [] })),
        fetch("/api/frameworks-library/all-elements").then(r => (r.ok ? r.json() : { elements: [] })),
        fetchAssets(),
        fetchAssessments(),
        fetchIssues(),
        fetchQueue(),
      ]);

      if (testingResult.status === "fulfilled" && Array.isArray(testingResult.value)) setTestingSessions(testingResult.value);
      if (reportsResult.status === "fulfilled") setReports(Array.isArray(reportsResult.value?.reports) ? reportsResult.value.reports : []);
      if (sopResult.status === "fulfilled") setSopCases(Array.isArray(sopResult.value?.cases) ? sopResult.value.cases : []);
      if (frameworkDocsResult.status === "fulfilled") setFrameworkDocs(Array.isArray(frameworkDocsResult.value?.documents) ? frameworkDocsResult.value.documents : []);
      if (frameworkElementsResult.status === "fulfilled") setFrameworkElements(Array.isArray(frameworkElementsResult.value?.elements) ? frameworkElementsResult.value.elements : []);
    } finally {
      setPageRecordsLoading(false);
    }
  }, [fetchAssets, fetchAssessments, fetchIssues, fetchQueue]);

  useEffect(() => {
    refreshSystemStatus();
    refreshPageRecords();
    const interval = window.setInterval(refreshSystemStatus, 30000);
    return () => window.clearInterval(interval);
  }, [refreshPageRecords, refreshSystemStatus]);

  const refreshDashboard = () => {
    refreshMetrics();
    refreshSystemStatus();
    refreshPageRecords();
  };

  const allPageLoading = loading || systemStatusLoading || pageRecordsLoading || assetsLoading || assessmentsLoading || issuesLoading || isLoadingQueue;
  const activeModel = systemStatus?.active_model || "Not Configured";
  const platformOnline = (systemStatus?.platform?.status || "online").toLowerCase() === "online";
  const regulatoryCount = systemStatus?.regulatory_library?.documents ?? regDocs.length;
  const controlsCount = systemStatus?.controls_library?.documents ?? ctrlDocs.length;
  const lastRefreshDate = lastRefreshed ?? new Date();
  const lastRefreshLabel = lastRefreshed ? lastRefreshed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not Refreshed";

  const risks = useMemo(() => assessments.flatMap(assessment => assessment.risks ?? []), [assessments]);
  const riskCount = risks.length;
  const criticalRiskCount = risks.filter(risk => risk.residual_risk_band === "Critical" || risk.inherent_risk_band === "Critical").length;
  const appliedControlCount = assessments.reduce((sum, assessment) => sum + (assessment.applied_controls?.length ?? 0), 0);
  const subjectAssetCount = assessments.reduce((sum, assessment) => sum + (assessment.asset_ids?.length ?? 0), 0);

  const testingControls = useMemo(() => testingSessions.flatMap(session => session.controls ?? []), [testingSessions]);
  const failedControlCount = testingControls.filter(control => control.test_result === "fail").length;
  const controlWithEvidenceCount = testingControls.filter(control => Boolean(control.evidence_text?.trim())).length;
  const testingReportsReady = testingSessions.filter(session => Boolean(session.report_markdown)).length;

  const activeAssets = assets.filter(asset => asset.status === "Operational").length;
  const openIssues = issues.filter(issue => issue.status !== "Closed").length;
  const criticalIssues = issues.filter(issue => issue.severity === "Critical" || issue.severity === "High").length;
  const pendingQueue = queueItems.filter(item => item.queue_status === "Pending").length;
  const acceptedQueue = queueItems.filter(item => item.queue_status === "Accepted").length;
  const reportOutputCount = reports.reduce((sum, report) => sum + (report.output_files?.length ?? 0), 0);
  const regulatoryTestingReports = reports.filter(report => report.report_type === "regulatory_gap_analysis" || report.report_type === "rcm_compliance").length;
  const controlTestingReports = reports.filter(report => report.report_type === "control_testing").length;
  const finalReportingReports = reports.filter(report => report.report_type === "evidence_assessment").length;
  const sopReports = reports.filter(report => report.report_type === "sop_uplift").length;
  const sopSuggestionCount = sopCases.reduce((sum, item) => sum + (item.suggestions?.length ?? 0), 0);
  const sopOutputCount = sopCases.reduce((sum, item) => sum + (item.outputs?.length ?? 0), 0);
  const exceptionTotal = gapObligations + potentialDuplicates + orphanedCtrlCount + openIssues + pendingQueue + failedControlCount;

  const assetsByCriticality = useMemo(() => orderedCounts(assets, RISK_BANDS, asset => asset.criticality, 4), [assets]);
  const assetsByStatus = useMemo(() => groupedCounts(assets, asset => asset.status, 2), [assets]);
  const assessmentsByStatus = useMemo(() => orderedCounts(assessments, ASSESSMENT_STATUSES, assessment => assessment.status, 0), [assessments]);
  const riskBands = useMemo(() => orderedCounts(risks, RISK_BANDS, risk => risk.residual_risk_band || risk.inherent_risk_band, 4), [risks]);
  const testingByStatus = useMemo(() => orderedCounts(testingSessions, TESTING_STATUSES, session => session.status, 0), [testingSessions]);
  const controlResults = useMemo(() => orderedCounts(testingControls, TEST_RESULTS, control => control.test_result, 3), [testingControls]);
  const issuesBySeverity = useMemo(() => orderedCounts(issues, RISK_BANDS, issue => issue.severity, 4), [issues]);
  const issuesByStatus = useMemo(() => orderedCounts(issues, ISSUE_STATUSES, issue => issue.status, 0), [issues]);
  const queueByStatus = useMemo(() => orderedCounts(queueItems, QUEUE_STATUSES, item => item.queue_status, 5), [queueItems]);
  const reportsByType = useMemo(() => groupedCounts(reports, report => reportTypeLabel(report.report_type), 0), [reports]);
  const sopByStatus = useMemo(() => groupedCounts(sopCases, item => item.status || "Draft", 3), [sopCases]);
  const frameworkCategoryData = useMemo(() => groupedCounts(frameworkElements, item => item.risk_category, 2), [frameworkElements]);
  const obligationPieData = useMemo(
    () => pieData.map((item, index) => ({ ...item, fill: item.fill || CHART_COLORS[index % CHART_COLORS.length] })),
    [pieData],
  );
  const domainCoverageData = useMemo(
    () => withColors([
      { name: "Obligations", value: clampPercent(oblCoveragePct) },
      { name: "Controls", value: clampPercent(ctrlCoveragePct) },
      { name: "Domains", value: clampPercent(domainCoveragePct) },
    ], 0),
    [ctrlCoveragePct, domainCoveragePct, oblCoveragePct],
  );

  const tabClassName = (tab: DashboardTab) =>
    activeTab === tab
      ? "border-[#1E49E2] text-[#1E49E2]"
      : "border-transparent text-[#0C233C]/80 hover:border-[#AEC5F7] hover:text-[#1E49E2]";

  const overviewKpis = [
    { label: "Library Documents", value: formatNumber(regDocs.length + ctrlDocs.length + frameworkDocs.length), subLabel: "regulatory, controls, and frameworks", badge: `${formatNumber(regulatoryCount + controlsCount)} source docs`, tone: "blue" as const, onClick: () => setLocation("/regulatory-library") },
    { label: "Controls", value: formatNumber(totalControls), subLabel: "controls extracted from library files", badge: `${formatNumber(orphanedCtrlCount)} unmapped`, tone: "blue" as const, onClick: () => setLocation("/controls-library") },
    { label: "Risk Assessments", value: formatNumber(assessments.length), subLabel: "assessment sessions in scope", badge: `${formatNumber(riskCount)} risks recorded`, tone: "purple" as const, onClick: () => setLocation("/risk-assessment") },
    { label: "Reports", value: formatNumber(reports.length), subLabel: "generated report records", badge: `${formatNumber(reportOutputCount)} output files`, tone: "green" as const, onClick: () => setLocation("/reports") },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F0F2F7]">
      <HeroSection
        title="Dashboard"
        subtitle="Monitor Apex libraries, workflows, issues, and generated outputs."
        icon={Grid2X2}
      />

      <TracePageBody width="wide" tint contentClassName="gap-5">
        <section
          data-dashboard-banner="true"
          className="rounded-lg border border-[#D8E3F2] bg-white px-5 py-4 text-[#0C233C] shadow-sm"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${platformOnline ? "bg-[#009A44]" : "bg-[#EAAA00]"}`} />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">Workspace Status</p>
                <p className="mt-1 text-[13px] font-semibold text-[#5A6478]">{platformOnline ? "Platform Online" : "Platform Degraded"} / {activeModel}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={refreshDashboard}
                disabled={allPageLoading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D8E3F2] bg-[#F8FBFF] text-[#1E49E2] transition-colors hover:bg-[#EEF2FF] disabled:cursor-wait disabled:text-[#8492A6]"
                title="Refresh Dashboard"
              >
                <RefreshCw className={`h-5 w-5 ${allPageLoading ? "animate-spin" : ""}`} />
              </button>
              <div className="flex items-center gap-3 rounded-full border border-[#D8E3F2] bg-[#F8FBFF] px-4 py-2 text-[12px] font-semibold text-[#5A6478]">
                <span className="rounded-full border border-[#D8E3F2] bg-white px-2 py-1 text-[#00338D]">Last Refresh</span>
                <span title={lastRefreshLabel}>{lastRefreshed ? lastRefreshDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Not Refreshed"}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#CBD5E1]">
          <div className="flex flex-wrap gap-6">
            <button
              type="button"
              data-dashboard-tab="overview"
              onClick={() => setActiveTab("overview")}
              className={`border-b-[3px] px-1 pb-3 text-[13px] font-semibold transition-colors ${tabClassName("overview")}`}
            >
              Overview
            </button>
            <button
              type="button"
              data-dashboard-tab="libraries"
              onClick={() => setActiveTab("libraries")}
              className={`border-b-[3px] px-1 pb-3 text-[13px] font-semibold transition-colors ${tabClassName("libraries")}`}
            >
              Libraries
            </button>
            <button
              type="button"
              data-dashboard-tab="workflows"
              onClick={() => setActiveTab("workflows")}
              className={`border-b-[3px] px-1 pb-3 text-[13px] font-semibold transition-colors ${tabClassName("workflows")}`}
            >
              Workflows
            </button>
            <button
              type="button"
              data-dashboard-tab="exceptions"
              onClick={() => setActiveTab("exceptions")}
              className={`border-b-[3px] px-1 pb-3 text-[13px] font-semibold transition-colors ${tabClassName("exceptions")}`}
            >
              Exceptions
            </button>
          </div>
        </section>

        {activeTab === "overview" ? (
          <div className="animate-[fadeUp_0.35s_ease_both] space-y-5">
            <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {overviewKpis.map(item => <KpiMetricCard key={item.label} {...item} />)}
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <ChartCard title="Assets By Criticality" footerLabel="Total Assets" footerValue={formatNumber(assets.length)}>
                <BarChartPanel data={assetsByCriticality} />
              </ChartCard>
              <ChartCard title="Assessments By Status" footerLabel="Total Assessments" footerValue={formatNumber(assessments.length)}>
                <BarChartPanel data={assessmentsByStatus} labelMode="rotate" height={226} />
              </ChartCard>
              <ChartCard title="Issues By Severity" footerLabel="Total Issues" footerValue={formatNumber(issues.length)}>
                <BarChartPanel data={issuesBySeverity} />
              </ChartCard>
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.92fr_1.32fr]">
              <ChartCard title="Reports By Type" footerLabel="Total Reports" footerValue={formatNumber(reports.length)}>
                <DonutChartPanel data={reportsByType} />
              </ChartCard>
              <ChartCard title="Domain Coverage" footerLabel="Gap Obligations" footerValue={formatNumber(gapObligations)}>
                <HorizontalPercentPanel data={domainCoverageData} />
              </ChartCard>
            </section>
          </div>
        ) : null}

        {activeTab === "libraries" ? (
          <div className="animate-[fadeUp_0.35s_ease_both] space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiMetricCard label="Regulations" value={formatNumber(regDocs.length)} subLabel="regulatory source documents" badge={`${formatNumber(totalObligations)} obligations`} tone="blue" onClick={() => setLocation("/regulatory-library")} />
              <KpiMetricCard label="Controls" value={formatNumber(totalControls)} subLabel="library controls extracted" badge={`${formatNumber(allControls.length)} indexed`} tone="green" onClick={() => setLocation("/controls-library")} />
              <KpiMetricCard label="Frameworks" value={formatNumber(frameworkDocs.length)} subLabel="framework source documents" badge={`${formatNumber(frameworkElements.length)} elements`} tone="teal" onClick={() => setLocation("/frameworks-library")} />
              <KpiMetricCard label="Quality Score" value={`${avgMatchScore.toFixed(2)}/1`} subLabel="average match score" badge={`${formatPercent(lowQualityPct)} low quality`} tone="purple" onClick={() => {
                setPendingQualityAnalysis(true);
                setLocation("/controls-library");
              }} />
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <ChartCard title="Domain Coverage" footerLabel="Obligation Coverage" footerValue={formatPercent(oblCoveragePct)}>
                {barChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -2, bottom: 50 }} barCategoryGap="18%">
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis
                        dataKey="domain"
                        tick={{ ...AXIS_STYLE, fontSize: 10 }}
                        angle={-28}
                        textAnchor="end"
                        height={82}
                        tickMargin={14}
                        interval={0}
                        tickFormatter={value => shortenAxisLabel(String(value), 18)}
                      />
                      <YAxis tick={{ ...AXIS_STYLE, fontSize: 10 }} width={30} allowDecimals={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} cursor={{ fill: "var(--osint-glow)" }} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, fontFamily: "Arial, sans-serif", paddingBottom: 8 }} />
                      <Bar dataKey="Regulations" fill="#00338D" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out" />
                      <Bar dataKey="Controls" fill="#1E49E2" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={980} animationEasing="ease-out" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </ChartCard>
              <ChartCard title="Obligations By Domain" footerLabel="Total Obligations" footerValue={formatNumber(totalObligations)}>
                <DonutChartPanel data={obligationPieData} />
              </ChartCard>
              <ChartCard title="Framework Elements By Category" footerLabel="Total Elements" footerValue={formatNumber(frameworkElements.length)}>
                <BarChartPanel data={frameworkCategoryData} labelMode="rotate" height={242} />
              </ChartCard>
              <ChartCard title="Assets By Status" footerLabel="Operational Assets" footerValue={formatNumber(activeAssets)}>
                <BarChartPanel data={assetsByStatus} labelMode="compact" />
              </ChartCard>
            </section>
          </div>
        ) : null}

        {activeTab === "workflows" ? (
          <div className="animate-[fadeUp_0.35s_ease_both] space-y-5">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <ModuleMetricCard title="Risk Assessment" tone="purple" icon={<ClipboardList className="h-5 w-5" />} onClick={() => setLocation("/risk-assessment")} metrics={[
                { label: "assessments", value: formatNumber(assessments.length) },
                { label: "risks", value: formatNumber(riskCount) },
                { label: "critical", value: formatNumber(criticalRiskCount) },
                { label: "controls", value: formatNumber(appliedControlCount) },
              ]} />
              <ModuleMetricCard title="Control Testing" tone="green" icon={<TestTube className="h-5 w-5" />} onClick={() => setLocation("/control-testing")} metrics={[
                { label: "sessions", value: formatNumber(testingSessions.length) },
                { label: "controls", value: formatNumber(testingControls.length) },
                { label: "evidence", value: formatNumber(controlWithEvidenceCount) },
                { label: "reports", value: formatNumber(testingReportsReady + controlTestingReports) },
              ]} />
              <ModuleMetricCard title="Regulatory Testing" tone="blue" icon={<Scale className="h-5 w-5" />} onClick={() => setLocation("/regulatory-testing")} metrics={[
                { label: "reports", value: formatNumber(regulatoryTestingReports) },
                { label: "obligations", value: formatNumber(totalObligations) },
                { label: "coverage", value: formatPercent(oblCoveragePct) },
                { label: "gaps", value: formatNumber(gapObligations) },
              ]} />
              <ModuleMetricCard title="Final Reporting" tone="navy" icon={<FileBarChart className="h-5 w-5" />} onClick={() => setLocation("/evidence-assessment")} metrics={[
                { label: "reports", value: formatNumber(finalReportingReports) },
                { label: "all reports", value: formatNumber(reports.length) },
                { label: "outputs", value: formatNumber(reportOutputCount) },
                { label: "testing", value: formatNumber(controlTestingReports) },
              ]} />
              <ModuleMetricCard title="SOP Uplift" tone="teal" icon={<Workflow className="h-5 w-5" />} onClick={() => setLocation("/sop-uplift")} metrics={[
                { label: "cases", value: formatNumber(sopCases.length) },
                { label: "suggestions", value: formatNumber(sopSuggestionCount) },
                { label: "outputs", value: formatNumber(sopOutputCount) },
                { label: "reports", value: formatNumber(sopReports) },
              ]} />
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <ChartCard title="Assessments By Status" footerLabel="Assessment Subjects" footerValue={formatNumber(subjectAssetCount)}>
                <BarChartPanel data={assessmentsByStatus} labelMode="rotate" height={226} />
              </ChartCard>
              <ChartCard title="Testing Sessions By Status" footerLabel="Total Sessions" footerValue={formatNumber(testingSessions.length)}>
                <SegmentedStatusPanel data={testingByStatus} />
              </ChartCard>
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
              <ChartCard title="Control Test Results" footerLabel="Controls In Sessions" footerValue={formatNumber(testingControls.length)}>
                <BarChartPanel data={controlResults} />
              </ChartCard>
              <ChartCard title="SOP Cases By Status" footerLabel="Total Cases" footerValue={formatNumber(sopCases.length)}>
                <BarChartPanel data={sopByStatus} />
              </ChartCard>
              <ChartCard title="Reports By Type" footerLabel="Generated Reports" footerValue={formatNumber(reports.length)}>
                <DonutChartPanel data={reportsByType} />
              </ChartCard>
            </section>
          </div>
        ) : null}

        {activeTab === "exceptions" ? (
          <div className="animate-[fadeUp_0.35s_ease_both] space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiMetricCard label="Gap Obligations" value={formatNumber(gapObligations)} subLabel="uncovered obligations" tone={gapObligations > 0 ? "amber" : "green"} onClick={() => setLocation("/regulatory-library")} />
              <KpiMetricCard label="Orphaned Controls" value={formatNumber(orphanedCtrlCount)} subLabel="unmapped controls" tone={orphanedCtrlCount > 0 ? "amber" : "green"} onClick={() => setLocation("/controls-library")} />
              <KpiMetricCard label="Low Quality Controls" value={formatPercent(lowQualityPct)} subLabel="below target" tone={lowQualityPct > 0 ? "red" : "green"} onClick={() => {
                setPendingQualityAnalysis(true);
                setLocation("/controls-library");
              }} />
              <KpiMetricCard label="Potential Duplicates" value={formatNumber(potentialDuplicates)} subLabel="control records to review" badge={`${formatNumber(confirmedDuplicates)} likely confirmed`} tone={potentialDuplicates > 0 ? "amber" : "green"} onClick={() => setLocation("/controls-library")} />
              <KpiMetricCard label="Open Issues" value={formatNumber(openIssues)} subLabel="issues not closed" tone={openIssues > 0 ? "red" : "green"} onClick={() => setLocation("/issue-management")} />
              <KpiMetricCard label="High Severity Issues" value={formatNumber(criticalIssues)} subLabel="high or critical" tone={criticalIssues > 0 ? "red" : "green"} onClick={() => setLocation("/issue-management")} />
              <KpiMetricCard label="Pending Queue" value={formatNumber(pendingQueue)} subLabel="validation findings" tone={pendingQueue > 0 ? "amber" : "green"} onClick={() => setLocation("/issue-management")} />
              <KpiMetricCard label="Failed Controls" value={formatNumber(failedControlCount)} subLabel="testing failures" tone={failedControlCount > 0 ? "red" : "green"} onClick={() => setLocation("/control-testing")} />
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <ChartCard title="Issues By Severity" footerLabel="Total Issues" footerValue={formatNumber(issues.length)}>
                <BarChartPanel data={issuesBySeverity} />
              </ChartCard>
              <ChartCard title="Issues By Status" footerLabel="Open Issues" footerValue={formatNumber(openIssues)}>
                <BarChartPanel data={issuesByStatus} />
              </ChartCard>
              <ChartCard title="Validation Queue By Status" footerLabel="Pending Queue" footerValue={formatNumber(pendingQueue)}>
                <BarChartPanel data={queueByStatus} />
              </ChartCard>
              <ChartCard title="Risk Bands" footerLabel="Risks Recorded" footerValue={formatNumber(riskCount)}>
                <BarChartPanel data={riskBands} />
              </ChartCard>
              <ChartCard title="Control Test Results" footerLabel="Failed Controls" footerValue={formatNumber(failedControlCount)}>
                <BarChartPanel data={controlResults} />
              </ChartCard>
              <ChartCard title="Exception Signals" footerLabel="Total Signals" footerValue={formatNumber(exceptionTotal)}>
                <SegmentedStatusPanel data={withColors([
                  { name: "Gaps", value: gapObligations },
                  { name: "Duplicates", value: potentialDuplicates },
                  { name: "Open Issues", value: openIssues },
                  { name: "Queue", value: pendingQueue },
                  { name: "Failed Controls", value: failedControlCount },
                ], 2)} />
              </ChartCard>
            </section>
          </div>
        ) : null}

        <style>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes dashboardScaleX {
            from {
              transform: scaleX(0);
            }
            to {
              transform: scaleX(1);
            }
          }
        `}</style>
      </TracePageBody>
    </div>
  );
}

import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import {
  LayoutDashboard,
  Library,
  ShieldCheck,
  Scale,
  ArrowRight,
  RefreshCw,
  FileText,
  Layers,
  Lock,
  Activity,
  Database,
  Cpu,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import KpiCard from "@/components/KpiCard";
import {
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  AXIS_STYLE,
  GRID_STYLE,
} from "@/lib/chartTheme";

function AnalysisCard({
  title,
  accentColor,
  value,
  valueColor,
  subLabel,
  detail,
  preview = false,
  onViewFull,
}: {
  title: string;
  accentColor: string;
  value: string;
  valueColor: string;
  subLabel: string;
  detail: string;
  preview?: boolean;
  onViewFull: () => void;
}) {
  return (
        <div className="dashboard-panel card-interactive group flex flex-col overflow-hidden rounded-[18px] border bg-card">
      <div className="h-1 shrink-0" style={{ background: accentColor }} />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-tight text-[var(--ink-strong)]">{title}</span>
          {preview && (
            <span className="landing-chip shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
              PREVIEW
            </span>
          )}
        </div>
        <p className="mb-1 text-4xl font-bold leading-none" style={{ color: valueColor }}>
          {value}
        </p>
        <p className="mb-2 text-xs text-[var(--ink-muted)]">{subLabel}</p>
        <p className="mb-3 mt-auto text-[11px] text-[var(--ink-muted)]">{detail}</p>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold transition-all hover:gap-2"
          style={{ color: accentColor }}
          onClick={onViewFull}
        >
          View Full Analysis <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="dashboard-panel animate-pulse overflow-hidden rounded-2xl border bg-card">
      <div className="h-1 bg-muted" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-36 rounded bg-muted" />
        <div className="h-9 w-24 rounded bg-muted" />
        <div className="h-2.5 w-20 rounded bg-muted" />
        <div className="h-2.5 w-44 rounded bg-muted" />
        <div className="mt-4 h-3 w-28 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { setPendingQualityAnalysis } = useCrossNav();

  const {
    regDocs,
    ctrlDocs,
    totalObligations,
    regDomainCount,
    frameworkNames,
    totalControls,
    ctrlDomainCount,
    allControls,
    ctrlCoveragePct,
    orphanedCtrlCount,
    avgMatchScore,
    lowQualityPct,
    gapObligations,
    oblCoveragePct,
    potentialDuplicates,
    confirmedDuplicates,
    regOnlyDomains,
    domainCoveragePct,
    allDomains,
    barChartData,
    pieData,
    loading,
    analysisLoading,
    lastRefreshed,
    refreshMetrics,
  } = useLibraryMetrics();

  const selectedModel = typeof window !== "undefined" ? localStorage.getItem("selectedModel") : null;
  const hasAnalysisData = !analysisLoading && allControls.length > 0 && totalObligations > 0;
  const librariesLoaded = !loading && (regDocs.length > 0 || ctrlDocs.length > 0);
  const obligationCoverageColor =
    oblCoveragePct >= 75 ? "#009A44" : oblCoveragePct >= 50 ? "#EAAA00" : "#E5001B";
  const gapSeverityRatio = totalObligations > 0 ? gapObligations / totalObligations : 0;
  const gapColor = gapObligations === 0 ? "#009A44" : gapSeverityRatio > 0.2 ? "#E5001B" : "#EAAA00";

  return (
    <div className="flex h-full flex-col">
      <HeroSection
        title="Dashboard"
        subtitle="Portfolio oversight for regulatory, controls, and coverage diagnostics across the active libraries"
        icon={LayoutDashboard}
        actions={
          <div className="flex items-center gap-2">
            {lastRefreshed && (
              <span className="hidden text-[11px] text-[#D7E4FA] sm:block">
                {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshMetrics}
              disabled={loading}
              className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="dashboard-band rounded-2xl p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="kpmg-section-label">Portfolio status</p>
                <h2 className="mt-1 text-lg font-bold text-[#0C233C]">Selected library metrics</h2>
              </div>
              <p className="text-[12px] text-slate-500">
                Live counts across the regulatory, controls, and domain reference layers.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="dashboard-panel rounded-2xl border bg-card p-4 animate-pulse">
                    <div className="mb-3 h-2.5 w-20 rounded bg-muted" />
                    <div className="mb-2 h-7 w-12 rounded bg-muted" />
                    <div className="h-2 w-16 rounded bg-muted" />
                  </div>
                ))
              ) : (
                <>
                  <KpiCard
                    label="Regulations"
                    value={regDocs.length}
                    subtitle="documents"
                    accentColor="var(--kpmg-blue)"
                    icon={<FileText className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Obligations"
                    value={totalObligations.toLocaleString()}
                    subtitle="extracted"
                    accentColor="var(--cobalt)"
                    icon={<Layers className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Regulatory Domains"
                    value={regDomainCount}
                    subtitle="areas"
                    accentColor="var(--pacific)"
                    icon={<Scale className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Policy Documents"
                    value={ctrlDocs.length}
                    subtitle="files"
                    accentColor="var(--dark-blue)"
                    icon={<FileText className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Controls"
                    value={totalControls.toLocaleString()}
                    subtitle="extracted"
                    accentColor="var(--green)"
                    icon={<ShieldCheck className="h-5 w-5" />}
                  />
                  <KpiCard
                    label="Control Domains"
                    value={ctrlDomainCount}
                    subtitle="areas"
                    accentColor="var(--amber)"
                    icon={<Lock className="h-5 w-5" />}
                  />
                </>
              )}
            </div>
          </section>

          {!loading && allDomains.length > 0 && (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="dashboard-panel card-interactive rounded-2xl border bg-card p-4 lg:col-span-2">
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--pacific)]" />
                  <h3 className="text-sm font-semibold font-display">Domain Coverage</h3>
                  <span className="ml-auto text-[11px] text-muted-foreground">Regulations vs controls</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis
                      dataKey="domain"
                      tick={{ ...AXIS_STYLE }}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                      interval={0}
                    />
                    <YAxis tick={{ ...AXIS_STYLE }} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      cursor={{ fill: "var(--osint-glow)" }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ fontSize: 11, fontFamily: "Arial, sans-serif", paddingBottom: 8 }}
                    />
                    <Bar dataKey="Regulations" fill="#00338D" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Controls" fill="#1E49E2" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="dashboard-panel card-interactive rounded-2xl border bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--kpmg-blue)]" />
                  <h3 className="text-sm font-semibold font-display">Obligation Distribution</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 max-h-24 space-y-1 overflow-auto">
                  {pieData.slice(0, 6).map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 text-[11px]">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: entry.fill }} />
                      <span className="truncate text-muted-foreground capitalize">{entry.name}</span>
                      <span className="ml-auto font-semibold text-[#0C233C]">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="mb-4">
              <p className="kpmg-section-label">Diagnostic outputs</p>
              <h2 className="mt-1 text-lg font-bold">Cross-library analysis and quality indicators</h2>
            </div>

            {analysisLoading ? (
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <AnalysisSkeleton key={index} />
                ))}
              </div>
            ) : !librariesLoaded ? (
              <div className="dashboard-panel rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                <Library className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm">Populate both libraries to unlock analysis insights.</p>
              </div>
            ) : !hasAnalysisData ? (
              <div className="dashboard-panel rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                <Library className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm font-medium">Partial data available</p>
                <p className="mt-1 text-xs">Load both the Regulatory and Controls libraries to see full analysis.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <AnalysisCard
                    title="Controls-Obligations Coverage"
                    accentColor="#009A44"
                    value={`${ctrlCoveragePct.toFixed(1)}%`}
                    valueColor="#009A44"
                    subLabel="coverage rate"
                    detail={`${orphanedCtrlCount} unmapped controls - ${allControls.length} total`}
                    onViewFull={() => setLocation("/controls-library")}
                  />
                  <AnalysisCard
                    title="Control Quality Analysis"
                    accentColor="#1E49E2"
                    value={`${avgMatchScore.toFixed(2)}/1.0`}
                    valueColor="#1E49E2"
                    subLabel="average match score"
                    detail={`${lowQualityPct.toFixed(1)}% controls need better alignment`}
                    onViewFull={() => {
                      setPendingQualityAnalysis(true);
                      setLocation("/controls-library");
                    }}
                  />
                  <AnalysisCard
                    title="Control Duplicates"
                    accentColor="#EAAA00"
                    value={String(potentialDuplicates)}
                    valueColor="#EAAA00"
                    subLabel="potential duplicates"
                    detail={`${confirmedDuplicates} likely confirmed - ${potentialDuplicates - confirmedDuplicates} under review`}
                    onViewFull={() => setLocation("/controls-library")}
                  />
                  <AnalysisCard
                    title="Domain Gap Assessment"
                    accentColor="#00338D"
                    value={`${domainCoveragePct.toFixed(0)}%`}
                    valueColor="#00338D"
                    subLabel="regulatory domains covered"
                    detail={`${regOnlyDomains.length} domain${regOnlyDomains.length !== 1 ? "s" : ""} without controls`}
                    onViewFull={() => setLocation("/regulatory-library")}
                  />
                </div>

                <div className="dashboard-highlight rounded-[18px] p-6 text-white">
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#ACEAFF] mb-0.5">
                          Cross-library analysis
                        </p>
                        <h3 className="text-base font-bold">Regulation and control coverage summary</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLocation("/regulatory-library")}
                        className="kpmg-dark-outline-button shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        View Full Analysis <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {[
                        {
                          value: `${oblCoveragePct.toFixed(0)}%`,
                          label: "obligations covered",
                          color: obligationCoverageColor,
                        },
                        {
                          value: totalObligations.toLocaleString(),
                          label: "total obligations",
                          color: "#ACEAFF",
                        },
                        {
                          value: String(gapObligations),
                          label: "gap obligations",
                          color: gapColor,
                        },
                        {
                          value: String(regDocs.length),
                          label: "regulations assessed",
                          color: "#FFFFFF",
                        },
                      ].map(({ value, label, color }) => (
                        <div key={label}>
                          <p className="text-3xl font-bold leading-none" style={{ color }}>
                            {value}
                          </p>
                          <p className="mt-1 text-[11px] text-[#DCE7FA]">{label}</p>
                        </div>
                      ))}
                    </div>

                    {frameworkNames.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {frameworkNames.map((name, index) => (
                          <span
                            key={index}
                            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-[#E4EEFB]"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="dashboard-panel card-interactive rounded-2xl border bg-card p-4">
              <div className="mb-4 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[var(--green)]" />
                <h3 className="text-sm font-semibold font-display">System Status</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Active model</span>
                  </div>
                  <span className="text-xs font-semibold text-[#0C233C]">{selectedModel || "None"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Regulatory Library</span>
                  </div>
                  <span className={`text-xs font-semibold ${regDocs.length > 0 ? "text-[var(--green)]" : "text-muted-foreground"}`}>
                    {regDocs.length > 0 ? `${regDocs.length} loaded` : "empty"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Controls Library</span>
                  </div>
                  <span className={`text-xs font-semibold ${ctrlDocs.length > 0 ? "text-[var(--green)]" : "text-muted-foreground"}`}>
                    {ctrlDocs.length > 0 ? `${ctrlDocs.length} loaded` : "empty"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] data-pulse" />
                    <span className="text-xs text-muted-foreground">Platform</span>
                  </div>
                  <span className="text-xs font-semibold text-[var(--green)]">Online</span>
                </div>
              </div>
            </div>

            {[
              {
                label: "Regulatory Testing",
                desc: "Run regulation comparison and RCM assessment workflows.",
                path: "/regulatory-testing",
                icon: <Scale className="h-4 w-4" />,
                color: "var(--kpmg-blue)",
              },
              {
                label: "Controls Library",
                desc: "Browse controls, quality signals, and mapping diagnostics.",
                path: "/controls-library",
                icon: <ShieldCheck className="h-4 w-4" />,
                color: "var(--green)",
              },
            ].map(({ label, desc, path, icon, color }) => (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className="dashboard-panel card-interactive group rounded-2xl border bg-card p-4 text-left"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span style={{ color }}>{icon}</span>
                  <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="text-sm font-medium font-display text-foreground">{label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

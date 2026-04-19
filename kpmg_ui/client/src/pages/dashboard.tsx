import { useLocation } from "wouter";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { useLibraryMetrics } from "@/contexts/LibraryMetricsContext";
import {
  LayoutDashboard, Library, ShieldCheck, Scale, ArrowRight, RefreshCw,
  FileText, Layers, Lock, Activity, Database, Cpu,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import HeroSection from "@/components/HeroSection";
import KpiCard from "@/components/KpiCard";
import { CHART_TOOLTIP_STYLE, AXIS_STYLE, GRID_STYLE } from "@/lib/chartTheme";

// ── Analysis Card ─────────────────────────────────────────────────────────────
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
    <div className="dashboard-panel card-interactive group flex flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="h-1 shrink-0" style={{ background: accentColor }} />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-[#0C233C] leading-tight">{title}</span>
          {preview && (
            <span className="landing-chip text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0">
              PREVIEW
            </span>
          )}
        </div>
        <p className="text-4xl font-bold leading-none mb-1" style={{ color: valueColor }}>{value}</p>
        <p className="text-xs text-muted-foreground mb-2">{subLabel}</p>
        <p className="text-[11px] text-muted-foreground mt-auto mb-3">{detail}</p>
        <button
          type="button"
          className="text-xs font-semibold flex items-center gap-1 hover:gap-2 transition-all"
          style={{ color: accentColor }}
          onClick={onViewFull}
        >
          View Full Analysis <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function AnalysisSkeleton() {
  return (
    <div className="dashboard-panel animate-pulse overflow-hidden rounded-2xl border bg-card">
      <div className="h-1 bg-muted" />
      <div className="p-5 space-y-3">
        <div className="h-3 w-36 bg-muted rounded" />
        <div className="h-9 w-24 bg-muted rounded" />
        <div className="h-2.5 w-20 bg-muted rounded" />
        <div className="h-2.5 w-44 bg-muted rounded" />
        <div className="h-3 w-28 bg-muted rounded mt-4" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { setPendingQualityAnalysis } = useCrossNav();

  const {
    regDocs, ctrlDocs,
    totalObligations, regDomainCount, regDomainCounts, frameworkNames,
    totalControls, ctrlDomainCount,
    allControls,
    ctrlCoverageCount, orphanedCtrlCount, ctrlCoveragePct,
    avgMatchScore, lowQualityPct,
    coveredObligations, gapObligations, oblCoveragePct,
    potentialDuplicates, confirmedDuplicates,
    regOnlyDomains, domainCoveragePct,
    allDomains, barChartData, pieData,
    loading, analysisLoading, lastRefreshed,
    refreshMetrics,
  } = useLibraryMetrics();

  const selectedModel = typeof window !== "undefined" ? localStorage.getItem("selectedModel") : null;
  const hasAnalysisData = !analysisLoading && allControls.length > 0 && totalObligations > 0;
  const librariesLoaded = !loading && (regDocs.length > 0 || ctrlDocs.length > 0);

  return (
    <div className="h-full flex flex-col">
      <HeroSection
        title="Dashboard"
        subtitle="Audit overview — Regulatory & Controls intelligence"
        icon={LayoutDashboard}
        actions={
          <div className="flex items-center gap-2">
            {lastRefreshed && (
              <span className="text-[10px] text-slate-500 hidden sm:block font-mono">
                {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshMetrics}
              disabled={loading}
              className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* ── KPI Strip ── */}
          <section className="dashboard-band rounded-2xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="dashboard-panel rounded-2xl border bg-card p-4 animate-pulse">
                    <div className="h-2.5 w-20 bg-muted rounded mb-3" />
                    <div className="h-7 w-12 bg-muted rounded mb-2" />
                    <div className="h-2 w-16 bg-muted rounded" />
                  </div>
                ))
              ) : (
                <>
                  <KpiCard label="Regulations" value={regDocs.length} subtitle="documents" accentColor="var(--kpmg-blue)" icon={<FileText className="h-5 w-5" />} />
                  <KpiCard label="Obligations" value={totalObligations.toLocaleString()} subtitle="extracted" accentColor="var(--purple-accent)" icon={<Layers className="h-5 w-5" />} />
                  <KpiCard label="Reg. Domains" value={regDomainCount} subtitle="areas" accentColor="var(--teal)" icon={<Scale className="h-5 w-5" />} />
                  <KpiCard label="Policy Docs" value={ctrlDocs.length} subtitle="files" accentColor="var(--pacific)" icon={<FileText className="h-5 w-5" />} />
                  <KpiCard label="Controls" value={totalControls.toLocaleString()} subtitle="extracted" accentColor="var(--cobalt)" icon={<ShieldCheck className="h-5 w-5" />} />
                  <KpiCard label="Ctrl. Domains" value={ctrlDomainCount} subtitle="domains" accentColor="var(--green)" icon={<Lock className="h-5 w-5" />} />
                </>
              )}
            </div>
          </section>

          {/* ── Charts Row ── */}
          {!loading && allDomains.length > 0 && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bar Chart — Domain Coverage Comparison */}
              <div className="dashboard-panel card-interactive lg:col-span-2 rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="h-4 w-4 text-[var(--pacific)]" />
                  <h3 className="text-sm font-semibold font-display">Domain Coverage</h3>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                    Regulations vs Controls
                  </span>
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
                      cursor={{ fill: "var(--osint-glow)" }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ fontSize: 11, fontFamily: "Arial, sans-serif", paddingBottom: 8 }}
                    />
                    <Bar dataKey="Regulations" fill="#00B8F5" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Controls" fill="#1E49E2" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Donut Chart — Obligation Distribution */}
              <div className="dashboard-panel card-interactive rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="h-4 w-4 text-[var(--purple-accent)]" />
                  <h3 className="text-sm font-semibold font-display">Obligations</h3>
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
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      itemStyle={{ color: "#e2e8f0" }}
                      labelStyle={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1 max-h-24 overflow-auto">
                  {pieData.slice(0, 6).map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: entry.fill }} />
                      <span className="text-muted-foreground truncate capitalize">{entry.name}</span>
                      <span className="ml-auto font-mono text-foreground">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Analysis Results ── */}
          <section>
            <div className="mb-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                  Analysis Results
                </p>
              <h2 className="text-lg font-bold mt-0.5">Explore Diagnostic Outputs</h2>
            </div>

            {analysisLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {Array.from({ length: 4 }).map((_, i) => <AnalysisSkeleton key={i} />)}
              </div>
            ) : !librariesLoaded ? (
              <div className="dashboard-panel rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                <Library className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Populate both libraries to unlock analysis insights</p>
              </div>
            ) : !hasAnalysisData ? (
              <div className="dashboard-panel rounded-2xl border bg-card p-8 text-center text-muted-foreground">
                <Library className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Partial data available</p>
                <p className="text-xs mt-1">Load both the Regulatory and Controls libraries to see full analysis</p>
              </div>
            ) : (
              <>
                {/* 2×2 Analysis Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <AnalysisCard
                    title="Controls-Obligations Coverage"
                    accentColor="#009A44"
                    value={`${ctrlCoveragePct.toFixed(1)}%`}
                    valueColor="#009A44"
                    subLabel="coverage rate"
                    detail={`${orphanedCtrlCount} unmapped controls · ${allControls.length} total`}
                    onViewFull={() => setLocation("/controls-library")}
                  />
                  <AnalysisCard
                    title="Control Quality Analysis"
                    accentColor="#7213EA"
                    value={`${avgMatchScore.toFixed(2)}/1.0`}
                    valueColor="#7213EA"
                    subLabel="avg match score"
                    detail={`${lowQualityPct.toFixed(1)}% controls need better alignment`}
                    onViewFull={() => { setPendingQualityAnalysis(true); setLocation("/controls-library"); }}
                  />
                  <AnalysisCard
                    title="Controls Duplicates"
                    accentColor="#EAAA00"
                    value={String(potentialDuplicates)}
                    valueColor="#EAAA00"
                    subLabel="potential duplicates"
                    detail={`${confirmedDuplicates} likely confirmed · ${potentialDuplicates - confirmedDuplicates} under review`}
                    onViewFull={() => setLocation("/controls-library")}
                  />
                  <AnalysisCard
                    title="Domain Gap Assessment"
                    accentColor="#1E49E2"
                    value={`${domainCoveragePct.toFixed(0)}%`}
                    valueColor="#1E49E2"
                    subLabel="regulatory domains covered"
                    detail={`${regOnlyDomains.length} domain${regOnlyDomains.length !== 1 ? "s" : ""} without controls`}
                    onViewFull={() => setLocation("/regulatory-library")}
                  />
                </div>

                {/* Full-width Regulation-Controls Coverage Card */}
                <div className="dashboard-highlight rounded-2xl overflow-hidden p-6 text-white">
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 mb-0.5">
                        Cross-Library Analysis
                      </p>
                      <h3 className="text-base font-bold">Regulation–Controls Coverage</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocation("/regulatory-library")}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border border-white/30 text-white hover:bg-white/10 transition-colors flex items-center gap-1.5"
                    >
                      View Full Analysis <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {[
                      {
                        value: `${oblCoveragePct.toFixed(0)}%`,
                        label: "obligations covered",
                        color: oblCoveragePct >= 75 ? "#00FF88" : oblCoveragePct >= 50 ? "#EAAA00" : "#FF6B6B",
                      },
                      {
                        value: totalObligations.toLocaleString(),
                        label: "total obligations",
                        color: "#00B8F5",
                      },
                      {
                        value: String(gapObligations),
                        label: "gap obligations",
                        color: gapObligations === 0 ? "#00FF88" : "#EAAA00",
                      },
                      {
                        value: String(regDocs.length),
                        label: "regulations assessed",
                        color: "#ffffff",
                      },
                    ].map(({ value, label, color }) => (
                      <div key={label}>
                        <p className="text-3xl font-bold leading-none" style={{ color }}>{value}</p>
                        <p className="text-[11px] text-white/60 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Framework pills */}
                  {frameworkNames.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {frameworkNames.map((name, i) => (
                        <span
                          key={i}
                          className="text-[11px] font-medium px-3 py-1 rounded-full border border-white/20 bg-white/10 text-white/80"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── System Status + Quick Links ── */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* System Status */}
            <div className="dashboard-panel card-interactive rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="h-4 w-4 text-[var(--terminal-green)]" />
                <h3 className="text-sm font-semibold font-display">System Status</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Active Model</span>
                  </div>
                  <span className="text-xs font-mono text-foreground">
                    {selectedModel || "None"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Regulatory Library</span>
                  </div>
                  <span className={`text-xs font-mono ${regDocs.length > 0 ? "text-[var(--terminal-green)]" : "text-muted-foreground"}`}>
                    {regDocs.length > 0 ? `${regDocs.length} loaded` : "empty"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Controls Library</span>
                  </div>
                  <span className={`text-xs font-mono ${ctrlDocs.length > 0 ? "text-[var(--terminal-green)]" : "text-muted-foreground"}`}>
                    {ctrlDocs.length > 0 ? `${ctrlDocs.length} loaded` : "empty"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400 data-pulse" />
                    <span className="text-xs text-muted-foreground">Platform</span>
                  </div>
                  <span className="text-xs font-mono text-green-400">Online</span>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            {[
              { label: "Regulatory Testing", desc: "Run compliance assessments", path: "/regulatory-testing", icon: <Scale className="h-4 w-4" />, color: "var(--kpmg-blue)" },
              { label: "Controls Library", desc: "Browse & manage controls", path: "/controls-library", icon: <ShieldCheck className="h-4 w-4" />, color: "var(--teal)" },
            ].map(({ label, desc, path, icon, color }) => (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className="dashboard-panel card-interactive group rounded-2xl border bg-card p-4 text-left"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ color }}>{icon}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm font-medium font-display text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </section>

        </div>
      </div>
    </div>
  );
}

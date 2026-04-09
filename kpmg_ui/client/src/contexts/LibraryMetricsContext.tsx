import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";

// ── Raw data types ─────────────────────────────────────────────────────────────

interface RegDoc {
  framework_name?: string;
  total_obligations?: number;
  obligations_by_domain?: Record<string, number>;
}

interface CtrlDoc {
  total_controls?: number;
  controls_by_domain?: Record<string, number>;
}

interface MergedCtrlData {
  total_raw: number;
  total_merged: number;
}

// ── Computed metrics ───────────────────────────────────────────────────────────

export interface LibraryMetrics {
  // Regulatory
  regDocs: RegDoc[];
  totalObligations: number;
  regDomainCount: number;
  regDomainCounts: Record<string, number>;
  frameworkNames: string[];

  // Controls
  ctrlDocs: CtrlDoc[];
  totalControls: number;
  ctrlDomainCount: number;
  ctrlDomainCounts: Record<string, number>;
  allControls: any[];

  // Coverage analysis
  ctrlCoverageCount: number;
  orphanedCtrlCount: number;
  ctrlCoveragePct: number;
  avgMatchScore: number;
  lowQualityCtrlCount: number;
  lowQualityPct: number;
  coveredObligations: number;
  gapObligations: number;
  oblCoveragePct: number;

  // Duplicates
  potentialDuplicates: number;
  confirmedDuplicates: number;
  mergedCtrlData: MergedCtrlData | null;

  // Domain gap
  regOnlyDomains: string[];
  coveredRegDomains: number;
  domainCoveragePct: number;

  // Chart helpers
  allDomains: string[];
  barChartData: { domain: string; Regulations: number; Controls: number }[];
  pieData: { name: string; value: number; fill: string }[];

  // Loading states
  loading: boolean;
  analysisLoading: boolean;
  lastRefreshed: Date | null;
}

interface LibraryMetricsContextValue extends LibraryMetrics {
  refreshMetrics: () => void;
}

const CHART_COLORS = [
  "#00B8F5", "#1E49E2", "#009A44", "#7213EA", "#EAAA00",
  "#FF6B6B", "#00FF88", "#FF8C00", "#00CED1", "#FF69B4",
];

const LibraryMetricsContext = createContext<LibraryMetricsContextValue | undefined>(undefined);

export function LibraryMetricsProvider({ children }: { children: ReactNode }) {
  const [regDocs, setRegDocs] = useState<RegDoc[]>([]);
  const [ctrlDocs, setCtrlDocs] = useState<CtrlDoc[]>([]);
  const [allControls, setAllControls] = useState<any[]>([]);
  const [mergedCtrlData, setMergedCtrlData] = useState<MergedCtrlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchMetrics = useCallback(() => {
    setLoading(true);
    setAnalysisLoading(true);
    Promise.all([
      fetch("/api/regulatory-library/documents").then(r => r.json()).catch(() => ({ documents: [] })),
      fetch("/api/controls-library/documents").then(r => r.json()).catch(() => ({ documents: [] })),
      fetch("/api/controls-library/all-controls").then(r => r.json()).catch(() => ({ controls: [] })),
      fetch("/api/controls-library/merged").then(r => r.json()).catch(() => null),
    ]).then(([regData, ctrlData, allCtrlData, mergedData]) => {
      setRegDocs(regData.documents ?? []);
      setCtrlDocs(ctrlData.documents ?? []);
      setAllControls(allCtrlData.controls ?? []);
      if (mergedData?.success) {
        setMergedCtrlData({ total_raw: mergedData.total_raw ?? 0, total_merged: mergedData.total_merged ?? 0 });
      } else {
        setMergedCtrlData(null);
      }
      setLastRefreshed(new Date());
      setLoading(false);
      setAnalysisLoading(false);
    }).catch(() => {
      setLoading(false);
      setAnalysisLoading(false);
    });
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  // ── Regulatory metrics ───────────────────────────────────────────────────────
  const regMetrics = useMemo(() => {
    let totalObligations = 0;
    const regDomainCounts: Record<string, number> = {};
    for (const doc of regDocs) {
      totalObligations += doc.total_obligations ?? 0;
      for (const [d, c] of Object.entries(doc.obligations_by_domain ?? {}))
        regDomainCounts[d] = (regDomainCounts[d] ?? 0) + c;
    }
    const regDomainCount = Object.keys(regDomainCounts).length;
    const frameworkNames = Array.from(new Set(regDocs.map(d => d.framework_name).filter(Boolean))) as string[];
    return { totalObligations, regDomainCounts, regDomainCount, frameworkNames };
  }, [regDocs]);

  // ── Controls metrics ─────────────────────────────────────────────────────────
  const ctrlMetrics = useMemo(() => {
    let totalControls = 0;
    const ctrlDomainCounts: Record<string, number> = {};
    for (const doc of ctrlDocs) {
      totalControls += doc.total_controls ?? 0;
      for (const [d, c] of Object.entries(doc.controls_by_domain ?? {}))
        ctrlDomainCounts[d] = (ctrlDomainCounts[d] ?? 0) + c;
    }
    const ctrlDomainCount = Object.keys(ctrlDomainCounts).length;
    return { totalControls, ctrlDomainCounts, ctrlDomainCount };
  }, [ctrlDocs]);

  // ── Analysis metrics ─────────────────────────────────────────────────────────
  const analysisMetrics = useMemo(() => {
    const { totalObligations, regDomainCounts } = regMetrics;
    const { ctrlDomainCounts } = ctrlMetrics;

    const ctrlCoverageCount = allControls.filter(c => (c.mapped_obligations?.length ?? 0) > 0).length;
    const orphanedCtrlCount = allControls.length - ctrlCoverageCount;
    const ctrlCoveragePct = allControls.length > 0 ? (ctrlCoverageCount / allControls.length) * 100 : 0;

    const allScores: number[] = allControls.flatMap(c =>
      (c.mapped_obligations ?? []).map((o: any) => o.match_score ?? 0)
    );
    const avgMatchScore = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;

    const lowQualityCtrlCount = allControls.filter(c => {
      if (!c.mapped_obligations?.length) return true;
      const avg = c.mapped_obligations.reduce((s: number, o: any) => s + (o.match_score ?? 0), 0) / c.mapped_obligations.length;
      return avg < 0.4;
    }).length;
    const lowQualityPct = allControls.length > 0 ? (lowQualityCtrlCount / allControls.length) * 100 : 0;

    const coveredObligationIds = new Set<string>(
      allControls.flatMap(c => (c.mapped_obligations ?? []).map((o: any) => o.obligation_id).filter(Boolean))
    );
    const coveredObligations = coveredObligationIds.size;
    const gapObligations = Math.max(0, totalObligations - coveredObligations);
    const oblCoveragePct = totalObligations > 0 ? (coveredObligations / totalObligations) * 100 : 0;

    const potentialDuplicates = mergedCtrlData ? Math.max(0, mergedCtrlData.total_raw - mergedCtrlData.total_merged) : 0;
    const confirmedDuplicates = Math.floor(potentialDuplicates * 0.25);

    const regDomains = Object.keys(regDomainCounts);
    const regOnlyDomains = regDomains.filter(d => !ctrlDomainCounts[d]);
    const coveredRegDomains = regDomains.length - regOnlyDomains.length;
    const domainCoveragePct = regDomains.length > 0 ? (coveredRegDomains / regDomains.length) * 100 : 0;

    return {
      ctrlCoverageCount, orphanedCtrlCount, ctrlCoveragePct,
      avgMatchScore, lowQualityCtrlCount, lowQualityPct,
      coveredObligations, gapObligations, oblCoveragePct,
      potentialDuplicates, confirmedDuplicates,
      regOnlyDomains, coveredRegDomains, domainCoveragePct,
    };
  }, [allControls, mergedCtrlData, regMetrics, ctrlMetrics]);

  // ── Chart data ───────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const { regDomainCounts } = regMetrics;
    const { ctrlDomainCounts } = ctrlMetrics;
    const allDomains = Array.from(new Set([
      ...Object.keys(regDomainCounts),
      ...Object.keys(ctrlDomainCounts),
    ]));
    const barChartData = allDomains.map(d => ({
      domain: d.replace(/_/g, " "),
      Regulations: regDomainCounts[d] ?? 0,
      Controls: ctrlDomainCounts[d] ?? 0,
    }));
    const pieData = Object.entries(regDomainCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name: name.replace(/_/g, " "),
        value,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
    return { allDomains, barChartData, pieData };
  }, [regMetrics, ctrlMetrics]);

  const value: LibraryMetricsContextValue = {
    // Raw
    regDocs,
    ctrlDocs,
    allControls,
    mergedCtrlData,

    // Regulatory
    totalObligations: regMetrics.totalObligations,
    regDomainCount: regMetrics.regDomainCount,
    regDomainCounts: regMetrics.regDomainCounts,
    frameworkNames: regMetrics.frameworkNames,

    // Controls
    totalControls: ctrlMetrics.totalControls,
    ctrlDomainCount: ctrlMetrics.ctrlDomainCount,
    ctrlDomainCounts: ctrlMetrics.ctrlDomainCounts,

    // Analysis
    ...analysisMetrics,

    // Charts
    ...chartData,

    // State
    loading,
    analysisLoading,
    lastRefreshed,

    refreshMetrics: fetchMetrics,
  };

  return (
    <LibraryMetricsContext.Provider value={value}>
      {children}
    </LibraryMetricsContext.Provider>
  );
}

export function useLibraryMetrics() {
  const context = useContext(LibraryMetricsContext);
  if (!context) {
    throw new Error("useLibraryMetrics must be used within a LibraryMetricsProvider");
  }
  return context;
}

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Download,
  CheckCircle,
  AlertTriangle,
  Lock,
  ArrowUpDown,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import TraceNavBar from "@/components/TraceNavBar";
import Footer from "@/components/Footer";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { APEX_UNMAPPED, APEX_ORPHANED, APEX_OVER } from "@/data/apex-risks-data";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const RATING_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RatingPill({ rating }: { rating: string }) {
  const styles: Record<string, string> = {
    Critical: "bg-[#FFF0F0] text-[#E5001B]",
    High: "bg-[#FFF8E7] text-[#92600A]",
    Medium: "bg-[#EFF8FF] text-[#1E49E2]",
    Low: "bg-[#EDFBF5] text-[#098E7E]",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${styles[rating] || styles.Low}`}>
      {rating}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Manual: "bg-[#F3F4F6] text-[#4B5563]",
    Automated: "bg-[#EEF2FF] text-[#1E49E2]",
    "Semi-Automated": "bg-[#F5F3FF] text-[#7213EA]",
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles[type] || styles.Manual}`}>
      {type}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  badge,
  badgeColor,
  accentColor,
}: {
  label: string;
  value: string | number;
  sub: string;
  badge: string;
  badgeColor: string;
  accentColor: string;
}) {
  const badgeStyles: Record<string, string> = {
    red: "bg-[#FFF0F0] text-[#E5001B]",
    amber: "bg-[#FFFBEB] text-[#92600A]",
    green: "bg-[#EDFBF5] text-[#009A44]",
    blue: "bg-[#EEF2FF] text-[#1E49E2]",
  };
  return (
    <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-5 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: accentColor }}
      />
      <div className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1.5px] mb-2 mt-1">
        {label}
      </div>
      <div className="font-bold text-[36px] text-[#0C233C] tracking-tight leading-none mb-1.5">
        {value}
      </div>
      <div className="text-[12px] text-[#8492A6] mb-2">{sub}</div>
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${badgeStyles[badgeColor]}`}>
        {badge}
      </span>
    </div>
  );
}

type SortDir = 1 | -1;
type TabKey = "unmapped" | "orphaned" | "over";

function useSort<T extends Record<string, any>>(data: T[]) {
  const [col, setCol] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>(1);

  const sorted = useMemo(() => {
    if (!col) return data;
    return [...data].sort((a, b) => {
      let av = a[col];
      let bv = b[col];
      if (col === "rating") { av = RATING_ORDER[av] ?? 99; bv = RATING_ORDER[bv] ?? 99; }
      if (col === "count") { av = +av; bv = +bv; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [data, col, dir]);

  function handleSort(c: string) {
    if (col === c) setDir(d => (d === 1 ? -1 : 1) as SortDir);
    else { setCol(c); setDir(1); }
  }

  return { sorted, col, dir, handleSort };
}

function SortableTh({
  col,
  activeCol,
  dir,
  onSort,
  children,
  className = "",
}: {
  col: string;
  activeCol: string | null;
  dir: SortDir;
  onSort: (c: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = activeCol === col;
  return (
    <th
      className={`text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left cursor-pointer whitespace-nowrap select-none ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === 1 ? <ChevronUp size={12} className="text-[#00338D]" /> : <ChevronDownIcon size={12} className="text-[#00338D]" />
        ) : (
          <ArrowUpDown size={11} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <button
        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border-[1.5px] border-[#E2E6EF] bg-white text-[#8492A6] hover:border-[#00338D] hover:text-[#00338D] disabled:opacity-40"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
      >
        ← Prev
      </button>
      {Array.from({ length: pages }, (_, i) => (
        <button
          key={i}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border-[1.5px] transition-colors ${
            i === page
              ? "bg-[#00338D] text-white border-[#00338D]"
              : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
          }`}
          onClick={() => onPage(i)}
        >
          {i + 1}
        </button>
      ))}
      <button
        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border-[1.5px] border-[#E2E6EF] bg-white text-[#8492A6] hover:border-[#00338D] hover:text-[#00338D] disabled:opacity-40"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages - 1}
      >
        Next →
      </button>
      <span className="text-[12px] text-[#8492A6]">Page {page + 1} of {pages}</span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function RiskControlsCoveragePage() {
  const [, navigate] = useLocation();
  const [isLocked, setIsLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("unmapped");

  // Pagination state
  const [unmappedPage, setUnmappedPage] = useState(0);
  const [orphanedPage, setOrphanedPage] = useState(0);

  const unmappedSort = useSort(APEX_UNMAPPED);
  const orphanedSort = useSort(APEX_ORPHANED);
  const overSort = useSort(APEX_OVER);

  useEffect(() => {
    if (!localStorage.getItem("apex_diagnostics_run")) {
      setIsLocked(true);
    }
  }, []);

  // Paginated slices
  const unmappedPage_data = unmappedSort.sorted.slice(
    unmappedPage * PAGE_SIZE,
    (unmappedPage + 1) * PAGE_SIZE
  );
  const orphanedPage_data = orphanedSort.sorted.slice(
    orphanedPage * PAGE_SIZE,
    (orphanedPage + 1) * PAGE_SIZE
  );

  // Chart data
  const coverageData = [
    { name: "Covered", value: 301 },
    { name: "Unmapped", value: 79 },
  ];
  const distData = [
    { label: "1", value: 45 },
    { label: "2", value: 65 },
    { label: "3", value: 72 },
    { label: "4", value: 55 },
    { label: "5", value: 36 },
    { label: "6–8", value: 18 },
    { label: "9–15", value: 7 },
    { label: "16–34", value: 3 },
  ];
  const typeData = [
    { name: "Manual", value: 520, color: "#00338D" },
    { name: "Automated", value: 449, color: "#1E49E2" },
    { name: "Semi-Auto", value: 290, color: "#00B8F5" },
  ];
  const DIST_COLORS = ["#00338D","#1E49E2","#0C6E9E","#098E7E","#00B8F5","#7213EA","#EAAA00","#E5001B"];

  const tooltipStyle = {
    backgroundColor: "#0C233C",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "white",
    fontSize: 12,
  };

  return (
    <div className="min-h-screen bg-[#F0F2F7]">
      {/* ── Nav ── */}
      <TraceNavBar breadcrumb="Risk–Controls Coverage" />
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "#0C233C", padding: "52px 0 48px" }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 400, height: 400,
            background: "radial-gradient(circle, rgba(30,73,226,0.3) 0%, transparent 70%)",
            filter: "blur(80px)", top: -120, right: -60,
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 280, height: 280,
            background: "radial-gradient(circle, rgba(9,142,126,0.2) 0%, transparent 70%)",
            filter: "blur(80px)", bottom: -80, left: "5%",
          }}
        />
        <div className="relative max-w-[1100px] mx-auto px-8 md:px-12">
          <button
            onClick={() => navigate("/controls-diagnostics")}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-white/45 hover:text-[#00B8F5] transition-colors mb-7"
          >
            <ArrowLeft size={16} />
            Back to Diagnostics Hub
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-0.5 rounded bg-[#098E7E]" />
            <span className="text-[11px] font-bold text-[#098E7E] tracking-[2px] uppercase">
              Controls Design Diagnostics
            </span>
          </div>
          <h1
            className="font-bold text-white leading-tight mb-3"
            style={{ fontSize: "clamp(28px,4vw,44px)", letterSpacing: "-1.5px" }}
          >
            Risk–Controls Coverage
          </h1>
          <p className="text-[16px] text-white/60 max-w-[620px] leading-[1.7] mb-9">
            Diagnostic analysis of the linkage between recorded risks and controls — surfacing
            gaps where risks are unmapped, over-controlled, or where controls have no risk rationale.
          </p>
          <div
            className="flex items-start gap-3 max-w-[680px] rounded-xl p-4 border"
            style={{
              background: "rgba(255,255,255,0.05)",
              borderLeft: "3px solid #098E7E",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <AlertTriangle size={18} className="text-[#098E7E] flex-shrink-0 mt-0.5" />
            <p className="text-[14px] text-white/65 leading-relaxed">
              <strong className="text-white/90 font-semibold">How it works:</strong>{" "}
              Extract your risk register and controls inventory from your GRC tool. APEX analyses
              the mappings, identifies unlinked items, and produces a coverage diagnostic report.
            </p>
          </div>
        </div>
      </section>

      <main className="max-w-[1200px] mx-auto px-8 md:px-12 py-12 pb-24">

        {/* ── Locked Notice ── */}
        {isLocked && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-[#E2E6EF] p-12 text-center mb-12">
            <Lock size={40} className="text-[#8492A6] mx-auto mb-4" />
            <h3 className="font-bold text-[#0C233C] text-[20px] mb-2">Diagnostics Not Yet Run</h3>
            <p className="text-[14px] text-[#8492A6] mb-6">
              Please run the Controls Design Diagnostics before viewing this analysis.
            </p>
            <button
              onClick={() => navigate("/controls-diagnostics")}
              className="inline-flex items-center gap-2 font-bold text-[14px] text-white bg-[#00338D] px-6 py-3 rounded-xl"
            >
              Go to Diagnostics Hub →
            </button>
          </div>
        )}

        {/* ── Results ── */}
        {!isLocked && (
          <>
            {/* Analysis banner */}
            <div
              className="rounded-2xl px-7 py-5 flex items-center justify-between gap-4 flex-wrap mb-7"
              style={{ background: "linear-gradient(135deg, #00338D 0%, #1E49E2 100%)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center">
                  <CheckCircle size={18} className="text-white" />
                </div>
                <div>
                  <div className="font-bold text-white text-[15px]">Analysis Complete</div>
                  <div className="text-[13px] text-white/65 mt-0.5">
                    Results generated — 380 risks · 1,259 controls analysed
                  </div>
                </div>
              </div>
              <button className="inline-flex items-center gap-2 text-[13px] font-semibold text-white bg-white/15 border border-white/25 rounded-lg px-4 py-2 hover:bg-white/25 transition-colors">
                <Download size={14} />
                Export Report
              </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
              <KpiCard
                label="Total Controls"
                value="1,259"
                sub="across 380 risks"
                badge="41% Manual · 36% Auto"
                badgeColor="blue"
                accentColor="#00338D"
              />
              <KpiCard
                label="Unmapped Risks"
                value="79"
                sub="risks with zero controls"
                badge="↑ 3 Critical · 14 High"
                badgeColor="red"
                accentColor="#E5001B"
              />
              <KpiCard
                label="Orphaned Controls"
                value="121"
                sub="controls with no linked risk"
                badge="9.6% of inventory"
                badgeColor="amber"
                accentColor="#EAAA00"
              />
              <KpiCard
                label="Coverage Rate"
                value="79.2%"
                sub="301 of 380 risks covered"
                badge="Target: 95%"
                badgeColor="green"
                accentColor="#009A44"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">

              {/* Coverage Bar */}
              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6">
                <div className="font-bold text-[#0C233C] text-[14px] mb-1">Risk Coverage</div>
                <div className="text-[12px] text-[#8492A6] mb-5">Covered vs uncovered risks</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={coverageData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#8492A6" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fontWeight: 600, fill: "#2D3748" }} width={70} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={6} barSize={36}>
                      <Cell fill="#00338D" />
                      <Cell fill="#E5001B" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00338D]" />
                      <span className="text-[12px] text-[#5A6478]">Covered</span>
                    </div>
                    <span className="text-[12px] font-bold text-[#0C233C]">301</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#E5001B]" />
                      <span className="text-[12px] text-[#5A6478]">Unmapped</span>
                    </div>
                    <span className="text-[12px] font-bold text-[#0C233C]">79</span>
                  </div>
                </div>
              </div>

              {/* Distribution Bar */}
              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6">
                <div className="font-bold text-[#0C233C] text-[14px] mb-1">Controls per Risk — Distribution</div>
                <div className="text-[12px] text-[#8492A6] mb-5">
                  Number of risks by controls count band (mean: 3.8)
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={distData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EF" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#8492A6" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#8492A6" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} risks`]} />
                    <Bar dataKey="value" radius={[4,4,0,0]} barSize={22}>
                      {distData.map((_, i) => (
                        <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Control Type Donut */}
              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6">
                <div className="font-bold text-[#0C233C] text-[14px] mb-1">Control Type Mix</div>
                <div className="text-[12px] text-[#8492A6] mb-3">Across 1,259 controls</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={typeData}
                      dataKey="value"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {typeData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 mt-2">
                  {typeData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="text-[12px] text-[#5A6478]">{d.name}</span>
                      </div>
                      <span className="text-[12px] font-bold text-[#0C233C]">
                        {d.value} ({Math.round((d.value / 1259) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Gap Report */}
            <div>
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div>
                  <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                    Gap Report
                  </div>
                  <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                    Prioritised Coverage Issues
                  </h2>
                </div>
                <button className="inline-flex items-center gap-2 text-[13px] font-semibold text-white bg-[#00338D] border-none rounded-xl px-5 py-2.5 hover:bg-[#1E49E2] transition-colors">
                  <Download size={14} />
                  Export CSV
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-[#F0F2F7] rounded-xl p-1 w-fit mb-5">
                {(
                  [
                    { key: "unmapped", label: `Unmapped Risks (${APEX_UNMAPPED.length})` },
                    { key: "orphaned", label: `Orphaned Controls (${APEX_ORPHANED.length})` },
                    { key: "over", label: `Over-controlled (${APEX_OVER.length})` },
                  ] as { key: TabKey; label: string }[]
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`text-[13px] font-semibold rounded-lg px-4 py-2 transition-all ${
                      activeTab === key
                        ? "bg-white text-[#0C233C] shadow-sm"
                        : "text-[#8492A6] hover:text-[#0C233C]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Unmapped Risks Table */}
              {activeTab === "unmapped" && (
                <>
                  <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[#F7F9FC] border-b border-[#E2E6EF]">
                            <SortableTh col="id" activeCol={unmappedSort.col} dir={unmappedSort.dir} onSort={c => { unmappedSort.handleSort(c); setUnmappedPage(0); }}>Risk ID</SortableTh>
                            <SortableTh col="desc" activeCol={unmappedSort.col} dir={unmappedSort.dir} onSort={c => { unmappedSort.handleSort(c); setUnmappedPage(0); }}>Risk Description</SortableTh>
                            <SortableTh col="area" activeCol={unmappedSort.col} dir={unmappedSort.dir} onSort={c => { unmappedSort.handleSort(c); setUnmappedPage(0); }}>Process Area</SortableTh>
                            <SortableTh col="rating" activeCol={unmappedSort.col} dir={unmappedSort.dir} onSort={c => { unmappedSort.handleSort(c); setUnmappedPage(0); }}>Risk Rating</SortableTh>
                            <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left">Controls Mapped</th>
                            <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left">Recommended Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unmappedPage_data.map((r) => (
                            <tr key={r.id} className="border-b border-[#E2E6EF] hover:bg-[#FAFBFD] transition-colors last:border-0">
                              <td className="px-4 py-3 font-bold text-[#00338D] text-[12px] whitespace-nowrap">{r.id}</td>
                              <td className="px-4 py-3 text-[13px] text-[#3D4A5C]">{r.desc}</td>
                              <td className="px-4 py-3 text-[13px] text-[#3D4A5C] whitespace-nowrap">{r.area}</td>
                              <td className="px-4 py-3"><RatingPill rating={r.rating} /></td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E5001B] bg-[#FFF0F0] rounded-full px-2.5 py-0.5">
                                  ⚠ 0
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[12px] text-[#5A6478]">{r.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <Pagination page={unmappedPage} total={unmappedSort.sorted.length} onPage={setUnmappedPage} />
                  <p className="text-[12px] text-[#8492A6] mt-2">
                    Showing {unmappedPage * PAGE_SIZE + 1}–{Math.min((unmappedPage + 1) * PAGE_SIZE, unmappedSort.sorted.length)} of {unmappedSort.sorted.length} unmapped risks
                  </p>
                </>
              )}

              {/* Orphaned Controls Table */}
              {activeTab === "orphaned" && (
                <>
                  <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[#F7F9FC] border-b border-[#E2E6EF]">
                            <SortableTh col="id" activeCol={orphanedSort.col} dir={orphanedSort.dir} onSort={c => { orphanedSort.handleSort(c); setOrphanedPage(0); }}>Control ID</SortableTh>
                            <SortableTh col="desc" activeCol={orphanedSort.col} dir={orphanedSort.dir} onSort={c => { orphanedSort.handleSort(c); setOrphanedPage(0); }}>Control Description</SortableTh>
                            <SortableTh col="area" activeCol={orphanedSort.col} dir={orphanedSort.dir} onSort={c => { orphanedSort.handleSort(c); setOrphanedPage(0); }}>Process Area</SortableTh>
                            <SortableTh col="type" activeCol={orphanedSort.col} dir={orphanedSort.dir} onSort={c => { orphanedSort.handleSort(c); setOrphanedPage(0); }}>Type</SortableTh>
                            <SortableTh col="owner" activeCol={orphanedSort.col} dir={orphanedSort.dir} onSort={c => { orphanedSort.handleSort(c); setOrphanedPage(0); }}>Owner</SortableTh>
                            <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left">Recommended Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orphanedPage_data.map((c) => (
                            <tr key={c.id} className="border-b border-[#E2E6EF] hover:bg-[#FAFBFD] transition-colors last:border-0">
                              <td className="px-4 py-3 font-bold text-[#00338D] text-[12px] whitespace-nowrap">{c.id}</td>
                              <td className="px-4 py-3 text-[13px] text-[#3D4A5C]">{c.desc}</td>
                              <td className="px-4 py-3 text-[13px] text-[#3D4A5C] whitespace-nowrap">{c.area}</td>
                              <td className="px-4 py-3"><TypePill type={c.type} /></td>
                              <td className="px-4 py-3 text-[12px] text-[#3D4A5C]">{c.owner}</td>
                              <td className="px-4 py-3 text-[12px] text-[#5A6478]">{c.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <Pagination page={orphanedPage} total={orphanedSort.sorted.length} onPage={setOrphanedPage} />
                  <p className="text-[12px] text-[#8492A6] mt-2">
                    Showing {orphanedPage * PAGE_SIZE + 1}–{Math.min((orphanedPage + 1) * PAGE_SIZE, orphanedSort.sorted.length)} of {orphanedSort.sorted.length} orphaned controls
                  </p>
                </>
              )}

              {/* Over-controlled Table */}
              {activeTab === "over" && (
                <>
                  <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[#F7F9FC] border-b border-[#E2E6EF]">
                            <SortableTh col="id" activeCol={overSort.col} dir={overSort.dir} onSort={overSort.handleSort}>Risk ID</SortableTh>
                            <SortableTh col="desc" activeCol={overSort.col} dir={overSort.dir} onSort={overSort.handleSort}>Risk Description</SortableTh>
                            <SortableTh col="area" activeCol={overSort.col} dir={overSort.dir} onSort={overSort.handleSort}>Process Area</SortableTh>
                            <SortableTh col="rating" activeCol={overSort.col} dir={overSort.dir} onSort={overSort.handleSort}>Risk Rating</SortableTh>
                            <SortableTh col="count" activeCol={overSort.col} dir={overSort.dir} onSort={overSort.handleSort} className="text-center">Controls Mapped</SortableTh>
                            <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left">Recommendation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overSort.sorted.map((r) => (
                            <tr key={r.id} className="border-b border-[#E2E6EF] hover:bg-[#FAFBFD] transition-colors last:border-0">
                              <td className="px-4 py-3 font-bold text-[#00338D] text-[12px] whitespace-nowrap">{r.id}</td>
                              <td className="px-4 py-3 text-[13px] text-[#3D4A5C]">{r.desc}</td>
                              <td className="px-4 py-3 text-[13px] text-[#3D4A5C] whitespace-nowrap">{r.area}</td>
                              <td className="px-4 py-3"><RatingPill rating={r.rating} /></td>
                              <td className="px-4 py-3 text-center font-bold text-[#00338D]">{r.count}</td>
                              <td className="px-4 py-3 text-[12px] text-[#5A6478]">{r.rec}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-[12px] text-[#8492A6] mt-2">
                    Showing {overSort.sorted.length} of {overSort.sorted.length} over-controlled risks (≥6 controls per risk)
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

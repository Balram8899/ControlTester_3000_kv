import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import TraceStandalonePage from "@/components/TraceStandalonePage";
import {
  TraceLockedState,
  TraceMetricCard,
  TracePanel,
  TraceSectionHeading,
  TraceStatusRibbon,
} from "@/components/TraceAnalysisPrimitives";
import { APEX_ORPHANED, APEX_OVER, APEX_UNMAPPED } from "@/data/apex-risks-data";

const PAGE_SIZE = 50;
const RATING_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-[18px] bg-[#00338D] px-5 py-3 text-[15px] font-bold text-white shadow-[0_16px_40px_-30px_rgba(0,51,141,0.55)] transition-transform hover:-translate-y-px"
    >
      <Download className="h-4 w-4" />
      {children}
    </button>
  );
}

function RatingPill({ rating }: { rating: string }) {
  const styles: Record<string, string> = {
    Critical: "bg-[#FFF0F0] text-[#E5001B]",
    High: "bg-[#FFF8E7] text-[#92600A]",
    Medium: "bg-[#EEF4FF] text-[#1E49E2]",
    Low: "bg-[#EDFBF5] text-[#098E7E]",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-bold ${styles[rating] || styles.Low}`}>
      {rating}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Manual: "bg-[#F3F6FA] text-[#546781]",
    Automated: "bg-[#EEF4FF] text-[#1E49E2]",
    "Semi-Automated": "bg-[#F3F0FF] text-[#7213EA]",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-bold ${styles[type] || styles.Manual}`}>
      {type}
    </span>
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
      if (col === "rating") {
        av = RATING_ORDER[av] ?? 99;
        bv = RATING_ORDER[bv] ?? 99;
      }
      if (col === "count") {
        av = Number(av);
        bv = Number(bv);
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [col, data, dir]);

  function handleSort(nextCol: string) {
    if (col === nextCol) {
      setDir((current) => (current === 1 ? -1 : 1));
      return;
    }
    setCol(nextCol);
    setDir(1);
  }

  return { sorted, col, dir, handleSort };
}

function SortableHeader({
  label,
  column,
  activeColumn,
  dir,
  onSort,
  className,
}: {
  label: string;
  column: string;
  activeColumn: string | null;
  dir: SortDir;
  onSort: (column: string) => void;
  className?: string;
}) {
  const active = activeColumn === column;
  return (
    <th
      className={`cursor-pointer px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE] ${className ?? ""}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <span className="text-[#B2BECE]">{active ? (dir === 1 ? "↑" : "↓") : "↕"}</span>
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
  onPage: (nextPage: number) => void;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="rounded-full border border-[#DCE3EE] bg-white px-4 py-2 text-[13px] font-bold text-[#7388A8] disabled:opacity-40"
      >
        Prev
      </button>
      {Array.from({ length: pages }, (_, index) => (
        <button
          key={index}
          onClick={() => onPage(index)}
          className={`rounded-full px-3.5 py-2 text-[13px] font-bold ${
            index === page ? "bg-[#00338D] text-white" : "border border-[#DCE3EE] bg-white text-[#7388A8]"
          }`}
        >
          {index + 1}
        </button>
      ))}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= pages - 1}
        className="rounded-full border border-[#DCE3EE] bg-white px-4 py-2 text-[13px] font-bold text-[#7388A8] disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

export default function RiskControlsCoveragePage() {
  const [, navigate] = useLocation();
  const [isLocked, setIsLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("unmapped");
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

  const coverageData = [
    { name: "Covered", value: 301 },
    { name: "Unmapped", value: 79 },
  ];
  const distributionData = [
    { label: "1", value: 45 },
    { label: "2", value: 65 },
    { label: "3", value: 72 },
    { label: "4", value: 55 },
    { label: "5", value: 36 },
    { label: "6-8", value: 18 },
    { label: "16-34", value: 3 },
  ];
  const typeData = [
    { name: "Manual", value: 520, color: "#00338D" },
    { name: "Automated", value: 449, color: "#1E49E2" },
    { name: "Semi-Auto", value: 290, color: "#18A8E1" },
  ];
  const tooltipStyle = {
    backgroundColor: "#0C233C",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "white",
    fontSize: 12,
  };

  const unmappedRows = unmappedSort.sorted.slice(unmappedPage * PAGE_SIZE, (unmappedPage + 1) * PAGE_SIZE);
  const orphanedRows = orphanedSort.sorted.slice(orphanedPage * PAGE_SIZE, (orphanedPage + 1) * PAGE_SIZE);

  return (
    <TraceStandalonePage breadcrumb="Risk-Controls Coverage" maxWidth="1380px">
      {isLocked ? (
        <TraceLockedState
          title="Diagnostics Not Yet Run"
          description="Run Controls Diagnostics first so TRACE can generate the coverage analysis, KPI cards, charts, and gap report."
          action={
            <button
              onClick={() => navigate("/controls-diagnostics")}
              className="rounded-[18px] bg-[#00338D] px-6 py-3 text-[15px] font-bold text-white"
            >
              Go to Controls Diagnostics
            </button>
          }
        />
      ) : (
        <>
          <TraceStatusRibbon
            title="Analysis Complete"
            detail="Results generated — 380 risks · 1,259 controls analysed"
            action={<ActionButton>Export Report</ActionButton>}
            tone="blue"
          />

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <TraceMetricCard
              label="Total Controls"
              value="1,259"
              sub="across 380 risks"
              accentColor="#00338D"
              badge="41% Manual · 36% Auto"
              badgeClassName="bg-[#EEF4FF] text-[#1E49E2]"
            />
            <TraceMetricCard
              label="Unmapped Risks"
              value="79"
              sub="risks with zero controls"
              accentColor="#F51322"
              badge="3 Critical · 14 High"
              badgeClassName="bg-[#FFF0F0] text-[#E5001B]"
            />
            <TraceMetricCard
              label="Orphaned Controls"
              value="121"
              sub="controls with no linked risk"
              accentColor="#EAAA00"
              badge="9.6% of inventory"
              badgeClassName="bg-[#FFF8E7] text-[#92600A]"
            />
            <TraceMetricCard
              label="Coverage Rate"
              value="79.2%"
              sub="301 of 380 risks covered"
              accentColor="#0AA05A"
              badge="Target: 95%"
              badgeClassName="bg-[#EDFBF5] text-[#009A44]"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <TracePanel title="Risk Coverage" subtitle="Covered vs uncovered risks">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={coverageData} layout="vertical" margin={{ left: 6, right: 18 }}>
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#7388A8" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 14, fill: "#0C233C", fontWeight: 700 }} width={90} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={7} barSize={46}>
                    <Cell fill="#133E9A" />
                    <Cell fill="#F1001A" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-5 space-y-2.5">
                {coverageData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-[15px]">
                    <div className="flex items-center gap-2.5 text-[#4D6485]">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.name === "Covered" ? "#133E9A" : "#F1001A" }} />
                      {item.name}
                    </div>
                    <span className="font-bold text-[#0C233C]">{item.value}</span>
                  </div>
                ))}
              </div>
            </TracePanel>

            <TracePanel
              title="Controls per Risk — Distribution"
              subtitle="Number of risks by controls count band (mean: 3.8)"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distributionData} margin={{ left: -18, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3EAF3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#7388A8" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#7388A8" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} risks`]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28}>
                    {distributionData.map((entry, index) => (
                      <Cell
                        key={entry.label}
                        fill={["#123E99", "#2C4EE1", "#1E84AF", "#128C82", "#19A9DF", "#7123DC", "#EAAA00"][index]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </TracePanel>

            <TracePanel title="Control Type Mix" subtitle="Across 1,259 controls">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={typeData} dataKey="value" innerRadius={72} outerRadius={102} paddingAngle={3}>
                    {typeData.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-5 space-y-2.5">
                {typeData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-[15px]">
                    <div className="flex items-center gap-2.5 text-[#4D6485]">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </div>
                    <span className="font-bold text-[#0C233C]">
                      {item.value} ({Math.round((item.value / 1259) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </TracePanel>
          </div>

          <TraceSectionHeading
            eyebrow="Gap report"
            title="Prioritised Coverage Issues"
            action={<ActionButton>Export CSV</ActionButton>}
          />

          <div className="flex flex-wrap gap-4">
            {([
              { key: "unmapped", label: `Unmapped Risks (${APEX_UNMAPPED.length})` },
              { key: "orphaned", label: `Orphaned Controls (${APEX_ORPHANED.length})` },
              { key: "over", label: `Over-controlled (${APEX_OVER.length})` },
            ] as { key: TabKey; label: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-3 text-[15px] font-bold ${
                  activeTab === tab.key
                    ? "bg-white text-[#0C233C] shadow-[0_14px_34px_-26px_rgba(12,35,60,0.35)]"
                    : "text-[#7E91AE]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "unmapped" ? (
            <div>
              <div className="overflow-hidden rounded-[24px] border border-[#DCE3EE] bg-white shadow-[0_18px_42px_-34px_rgba(12,35,60,0.24)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#DCE3EE] bg-[#F6F9FC]">
                        <SortableHeader label="Risk ID" column="id" activeColumn={unmappedSort.col} dir={unmappedSort.dir} onSort={(column) => { unmappedSort.handleSort(column); setUnmappedPage(0); }} />
                        <SortableHeader label="Risk Description" column="desc" activeColumn={unmappedSort.col} dir={unmappedSort.dir} onSort={(column) => { unmappedSort.handleSort(column); setUnmappedPage(0); }} />
                        <SortableHeader label="Process Area" column="area" activeColumn={unmappedSort.col} dir={unmappedSort.dir} onSort={(column) => { unmappedSort.handleSort(column); setUnmappedPage(0); }} />
                        <SortableHeader label="Risk Rating" column="rating" activeColumn={unmappedSort.col} dir={unmappedSort.dir} onSort={(column) => { unmappedSort.handleSort(column); setUnmappedPage(0); }} />
                        <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Controls Mapped</th>
                        <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Recommended Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmappedRows.map((row) => (
                        <tr key={row.id} className="border-b border-[#E7EDF4] align-top last:border-0 hover:bg-[#FAFCFE]">
                          <td className="px-5 py-4 text-[14px] font-bold text-[#00338D]">{row.id}</td>
                          <td className="px-5 py-4 text-[15px] leading-7 text-[#344A67]">{row.desc}</td>
                          <td className="px-5 py-4 text-[15px] text-[#344A67]">{row.area}</td>
                          <td className="px-5 py-4"><RatingPill rating={row.rating} /></td>
                          <td className="px-5 py-4">
                            <span className="inline-flex rounded-full bg-[#FFF0F0] px-3 py-1 text-[12px] font-bold text-[#E5001B]">0</span>
                          </td>
                          <td className="px-5 py-4 text-[15px] leading-7 text-[#4D6485]">{row.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination page={unmappedPage} total={unmappedSort.sorted.length} onPage={setUnmappedPage} />
            </div>
          ) : null}

          {activeTab === "orphaned" ? (
            <div>
              <div className="overflow-hidden rounded-[24px] border border-[#DCE3EE] bg-white shadow-[0_18px_42px_-34px_rgba(12,35,60,0.24)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#DCE3EE] bg-[#F6F9FC]">
                        <SortableHeader label="Control ID" column="id" activeColumn={orphanedSort.col} dir={orphanedSort.dir} onSort={(column) => { orphanedSort.handleSort(column); setOrphanedPage(0); }} />
                        <SortableHeader label="Control Description" column="desc" activeColumn={orphanedSort.col} dir={orphanedSort.dir} onSort={(column) => { orphanedSort.handleSort(column); setOrphanedPage(0); }} />
                        <SortableHeader label="Process Area" column="area" activeColumn={orphanedSort.col} dir={orphanedSort.dir} onSort={(column) => { orphanedSort.handleSort(column); setOrphanedPage(0); }} />
                        <SortableHeader label="Type" column="type" activeColumn={orphanedSort.col} dir={orphanedSort.dir} onSort={(column) => { orphanedSort.handleSort(column); setOrphanedPage(0); }} />
                        <SortableHeader label="Owner" column="owner" activeColumn={orphanedSort.col} dir={orphanedSort.dir} onSort={(column) => { orphanedSort.handleSort(column); setOrphanedPage(0); }} />
                        <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Recommended Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphanedRows.map((row) => (
                        <tr key={row.id} className="border-b border-[#E7EDF4] align-top last:border-0 hover:bg-[#FAFCFE]">
                          <td className="px-5 py-4 text-[14px] font-bold text-[#00338D]">{row.id}</td>
                          <td className="px-5 py-4 text-[15px] leading-7 text-[#344A67]">{row.desc}</td>
                          <td className="px-5 py-4 text-[15px] text-[#344A67]">{row.area}</td>
                          <td className="px-5 py-4"><TypePill type={row.type} /></td>
                          <td className="px-5 py-4 text-[15px] text-[#344A67]">{row.owner}</td>
                          <td className="px-5 py-4 text-[15px] leading-7 text-[#4D6485]">{row.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination page={orphanedPage} total={orphanedSort.sorted.length} onPage={setOrphanedPage} />
            </div>
          ) : null}

          {activeTab === "over" ? (
            <div className="overflow-hidden rounded-[24px] border border-[#DCE3EE] bg-white shadow-[0_18px_42px_-34px_rgba(12,35,60,0.24)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#DCE3EE] bg-[#F6F9FC]">
                      <SortableHeader label="Risk ID" column="id" activeColumn={overSort.col} dir={overSort.dir} onSort={overSort.handleSort} />
                      <SortableHeader label="Risk Description" column="desc" activeColumn={overSort.col} dir={overSort.dir} onSort={overSort.handleSort} />
                      <SortableHeader label="Process Area" column="area" activeColumn={overSort.col} dir={overSort.dir} onSort={overSort.handleSort} />
                      <SortableHeader label="Risk Rating" column="rating" activeColumn={overSort.col} dir={overSort.dir} onSort={overSort.handleSort} />
                      <SortableHeader label="Controls Mapped" column="count" activeColumn={overSort.col} dir={overSort.dir} onSort={overSort.handleSort} className="text-center" />
                      <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overSort.sorted.map((row) => (
                      <tr key={row.id} className="border-b border-[#E7EDF4] align-top last:border-0 hover:bg-[#FAFCFE]">
                        <td className="px-5 py-4 text-[14px] font-bold text-[#00338D]">{row.id}</td>
                        <td className="px-5 py-4 text-[15px] leading-7 text-[#344A67]">{row.desc}</td>
                        <td className="px-5 py-4 text-[15px] text-[#344A67]">{row.area}</td>
                        <td className="px-5 py-4"><RatingPill rating={row.rating} /></td>
                        <td className="px-5 py-4 text-center text-[15px] font-bold text-[#00338D]">{row.count}</td>
                        <td className="px-5 py-4 text-[15px] leading-7 text-[#4D6485]">{row.rec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </TraceStandalonePage>
  );
}

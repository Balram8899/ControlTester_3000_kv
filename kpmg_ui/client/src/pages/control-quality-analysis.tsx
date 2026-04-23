import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
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
import { APEX_CSV, type ApexControl } from "@/data/apex-controls-data";

type RagType = "green" | "amber" | "red";
type FilterType = "all" | RagType;
type ExampleTab = RagType;

const PAGE_SIZE = 50;

function score(control: ApexControl) {
  return control.who + control.what + control.where + control.how + control.when + control.why;
}

function rag(control: ApexControl): RagType {
  const missing = 6 - score(control);
  if (missing <= 1) return "green";
  if (missing === 2) return "amber";
  return "red";
}

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-[18px] bg-[#00338D] px-5 py-3 text-[15px] font-bold text-white shadow-[0_16px_40px_-30px_rgba(0,51,141,0.55)] transition-transform hover:-translate-y-px">
      <Download className="h-4 w-4" />
      {children}
    </button>
  );
}

function DimCheck({ present }: { present: 0 | 1 }) {
  return present ? (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#DDF8EA] text-[15px] font-bold text-[#008D41]">
      ✓
    </span>
  ) : (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#FDE3E6] text-[15px] font-bold text-[#D92A3A]">
      ✕
    </span>
  );
}

const RAG_BADGE_CLASS: Record<RagType, string> = {
  green: "bg-[#EDFBF5] text-[#009A44]",
  amber: "bg-[#FFF8E7] text-[#92600A]",
  red: "bg-[#FFF0F0] text-[#E5001B]",
};

const EXAMPLES: Record<
  ExampleTab,
  {
    id: string;
    text: React.ReactNode;
    score: number;
    ragLabel: string;
    ragColor: string;
    dims: { dim: string; dimClassName: string; text: string; present: boolean }[];
  }
> = {
  green: {
    id: "CTRL-0189",
    score: 6,
    ragLabel: "GREEN — No action required",
    ragColor: "#009A44",
    text: (
      <>
        “<span className="rounded-sm bg-[#DBEAFE] px-1 text-[#1E40AF] font-semibold">The IRM Governance team</span> will{" "}
        <span className="rounded-sm bg-[#D9F6E8] px-1 text-[#006F45] font-semibold">review all policy and configuration changes</span>{" "}
        <span className="rounded-sm bg-[#FFF0D2] px-1 text-[#9A5E00] font-semibold">through the SIEM platform, via Splunk audit logs</span>{" "}
        <span className="rounded-sm bg-[#EFE7FF] px-1 text-[#6B20D9] font-semibold">triggered automatically to their monitored inbox</span>{" "}
        <span className="rounded-sm bg-[#FFE3F2] px-1 text-[#B30E66] font-semibold">on a daily basis</span>{" "}
        <span className="rounded-sm bg-[#FFEAD6] px-1 text-[#A34E00] font-semibold">to identify and investigate unauthorised changes before they impact system integrity</span>.”
      </>
    ),
    dims: [
      { dim: "WHO", dimClassName: "text-[#1E40AF]", text: "IRM Governance team", present: true },
      { dim: "WHAT", dimClassName: "text-[#006F45]", text: "Review all policy and configuration changes", present: true },
      { dim: "WHERE", dimClassName: "text-[#9A5E00]", text: "SIEM platform / Splunk audit logs", present: true },
      { dim: "HOW", dimClassName: "text-[#6B20D9]", text: "Triggered automatically to monitored inbox", present: true },
      { dim: "WHEN", dimClassName: "text-[#B30E66]", text: "Daily", present: true },
      { dim: "WHY", dimClassName: "text-[#A34E00]", text: "Identify unauthorised changes before they impact system integrity", present: true },
    ],
  },
  amber: {
    id: "CTRL-0542",
    score: 4,
    ragLabel: "AMBER — 2 elements missing",
    ragColor: "#B67800",
    text: (
      <>
        “<span className="rounded-sm bg-[#DBEAFE] px-1 text-[#1E40AF] font-semibold">The Finance Operations team</span> will{" "}
        <span className="rounded-sm bg-[#D9F6E8] px-1 text-[#006F45] font-semibold">perform a three-way match of purchase orders, goods received notes and supplier invoices</span>{" "}
        <span className="rounded-sm bg-[#FFF0D2] px-1 text-[#9A5E00] font-semibold">within the ERP system</span>{" "}
        on a <span className="rounded-sm bg-[#FFE3F2] px-1 text-[#B30E66] font-semibold">monthly basis</span> prior to payment approval.”
      </>
    ),
    dims: [
      { dim: "WHO", dimClassName: "text-[#1E40AF]", text: "Finance Operations team", present: true },
      { dim: "WHAT", dimClassName: "text-[#006F45]", text: "Three-way match of POs, GRNs and invoices", present: true },
      { dim: "WHERE", dimClassName: "text-[#9A5E00]", text: "ERP system", present: true },
      { dim: "HOW", dimClassName: "text-[#6B20D9]", text: "Method not specified", present: false },
      { dim: "WHEN", dimClassName: "text-[#B30E66]", text: "Monthly, prior to payment run", present: true },
      { dim: "WHY", dimClassName: "text-[#A34E00]", text: "Business rationale not stated", present: false },
    ],
  },
  red: {
    id: "CTRL-0901",
    score: 2,
    ragLabel: "RED — 4 elements missing",
    ragColor: "#D92A3A",
    text: (
      <>
        “Access rights to the <span className="rounded-sm bg-[#FFF0D2] px-1 text-[#9A5E00] font-semibold">trading platform</span> are{" "}
        <span className="rounded-sm bg-[#D9F6E8] px-1 text-[#006F45] font-semibold">reviewed</span> and inappropriate access is removed.”
      </>
    ),
    dims: [
      { dim: "WHO", dimClassName: "text-[#1E40AF]", text: "No performer identified", present: false },
      { dim: "WHAT", dimClassName: "text-[#006F45]", text: "Review access rights and remove inappropriate access", present: true },
      { dim: "WHERE", dimClassName: "text-[#9A5E00]", text: "Trading platform", present: true },
      { dim: "HOW", dimClassName: "text-[#6B20D9]", text: "No method or tool described", present: false },
      { dim: "WHEN", dimClassName: "text-[#B30E66]", text: "No timing or frequency defined", present: false },
      { dim: "WHY", dimClassName: "text-[#A34E00]", text: "No rationale stated", present: false },
    ],
  },
};

export default function ControlQualityAnalysisPage() {
  const [, navigate] = useLocation();
  const [isLocked, setIsLocked] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(0);
  const [exampleTab, setExampleTab] = useState<ExampleTab>("green");
  const [examplesOpen, setExamplesOpen] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("apex_diagnostics_run")) {
      setIsLocked(true);
    }
  }, []);

  const greenCount = useMemo(() => APEX_CSV.filter((control) => rag(control) === "green").length, []);
  const amberCount = useMemo(() => APEX_CSV.filter((control) => rag(control) === "amber").length, []);
  const redCount = useMemo(() => APEX_CSV.filter((control) => rag(control) === "red").length, []);
  const avgScore = useMemo(() => {
    const total = APEX_CSV.reduce((sum, control) => sum + score(control), 0);
    return (total / APEX_CSV.length).toFixed(2);
  }, []);
  const improvePct = useMemo(() => (((amberCount + redCount) / APEX_CSV.length) * 100).toFixed(1), [amberCount, redCount]);

  const areas = useMemo(() => Array.from(new Set(APEX_CSV.map((control) => control.area))).sort(), []);
  const markerData = useMemo(
    () => [
      { label: "WHAT", value: APEX_CSV.filter((control) => control.what).length, color: "#38CC92" },
      { label: "WHO", value: APEX_CSV.filter((control) => control.who).length, color: "#5E9BE9" },
      { label: "WHEN", value: APEX_CSV.filter((control) => control.when).length, color: "#E965B1" },
      { label: "HOW", value: APEX_CSV.filter((control) => control.how).length, color: "#9D82EA" },
      { label: "WHERE", value: APEX_CSV.filter((control) => control.where).length, color: "#FFC53A" },
      { label: "WHY", value: APEX_CSV.filter((control) => control.why).length, color: "#FF9738" },
    ],
    [],
  );
  const ragChartData = useMemo(
    () => [
      { name: "Green", value: greenCount, color: "#009A44" },
      { name: "Amber", value: amberCount, color: "#EAAA00" },
      { name: "Red", value: redCount, color: "#E5001B" },
    ],
    [amberCount, greenCount, redCount],
  );
  const processData = useMemo(
    () =>
      areas.map((area) => ({
        area: area.length > 16 ? area.slice(0, 15) + "…" : area,
        Green: APEX_CSV.filter((control) => control.area === area && rag(control) === "green").length,
        Amber: APEX_CSV.filter((control) => control.area === area && rag(control) === "amber").length,
        Red: APEX_CSV.filter((control) => control.area === area && rag(control) === "red").length,
      })),
    [areas],
  );

  const filtered = useMemo(
    () => (filter === "all" ? APEX_CSV : APEX_CSV.filter((control) => rag(control) === filter)),
    [filter],
  );
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const activeExample = EXAMPLES[exampleTab];

  const tooltipStyle = {
    backgroundColor: "#0C233C",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "white",
    fontSize: 12,
  };

  return (
    <TraceStandalonePage breadcrumb="Control Quality Analysis" maxWidth="1380px">
      {isLocked ? (
        <TraceLockedState
          title="Diagnostics Not Yet Run"
          description="Run Controls Diagnostics first so TRACE can score the control corpus, calculate 5W1H coverage, and populate the assessment tables."
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
            tone="purple"
            title="5W1H Analysis Complete"
            detail={`${APEX_CSV.length.toLocaleString()} controls assessed across ${areas.length} process areas`}
            action={<ActionButton>Export Full Report</ActionButton>}
          />

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <TraceMetricCard
              label="Total Controls Assessed"
              value={APEX_CSV.length.toLocaleString()}
              sub={`across ${areas.length} process areas`}
              accentColor="#7213EA"
              badge="Full corpus"
              badgeClassName="bg-[#F3F0FF] text-[#7213EA]"
            />
            <TraceMetricCard
              label="Avg Quality Score"
              value={
                <span>
                  {avgScore}
                  <span className="ml-1 text-[24px] tracking-normal text-[#92A0B8]">/6</span>
                </span>
              }
              sub="mean 5W1H elements present"
              accentColor="#1E49E2"
            >
              <div className="h-2 rounded-full bg-[#E2E7EF]">
                <div
                  className="h-2 rounded-full bg-[linear-gradient(90deg,#E5001B_0%,#EAAA00_38%,#009A44_100%)]"
                  style={{ width: `${(Number(avgScore) / 6) * 100}%` }}
                />
              </div>
            </TraceMetricCard>
            <TraceMetricCard
              label="Requires Improvement"
              value={`${improvePct}%`}
              sub={`${(amberCount + redCount).toLocaleString()} controls (amber + red)`}
              accentColor="#E5001B"
              badge="vs 95% target"
              badgeClassName="bg-[#FFF0F0] text-[#E5001B]"
            />
            <TraceMetricCard
              label="Green — No Action"
              value={greenCount.toLocaleString()}
              sub="controls with ≤1 dimension missing"
              accentColor="#009A44"
              badge={`${((greenCount / APEX_CSV.length) * 100).toFixed(1)}% of corpus`}
              badgeClassName="bg-[#EDFBF5] text-[#009A44]"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <TracePanel
              title="RAG Distribution"
              subtitle={`Quality rating across all ${APEX_CSV.length.toLocaleString()} controls`}
            >
              <div className="relative">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={ragChartData} dataKey="value" innerRadius={78} outerRadius={112} paddingAngle={3}>
                      {ragChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[28px] font-bold tracking-[-0.04em] text-[#0C233C]">{APEX_CSV.length.toLocaleString()}</div>
                  <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#7E91AE]">Controls</div>
                </div>
              </div>
              <div className="mt-2 space-y-2.5">
                {ragChartData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-[15px]">
                    <div className="flex items-center gap-2.5 text-[#4D6485]">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      {entry.name} {entry.name === "Green" ? "(0–1 missing)" : entry.name === "Amber" ? "(2 missing)" : "(3+ missing)"}
                    </div>
                    <span className="font-bold text-[#0C233C]">{entry.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </TracePanel>

            <TracePanel title="5W1H Element Prevalence" subtitle="Controls with each element present">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={markerData} layout="vertical" margin={{ left: 8, right: 18 }}>
                  <XAxis type="number" domain={[0, APEX_CSV.length]} tick={{ fontSize: 12, fill: "#7388A8" }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 14, fill: "#0C233C", fontWeight: 700 }} width={64} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [`${value.toLocaleString()} controls (${Math.round((value / APEX_CSV.length) * 100)}%)`]}
                  />
                  <Bar dataKey="value" radius={[0, 7, 7, 0]} barSize={32}>
                    {markerData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </TracePanel>

            <TracePanel title="Quality RAG by Process Area" subtitle="Green / Amber / Red per area">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={processData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3EAF3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#7388A8" }} />
                  <YAxis type="category" dataKey="area" tick={{ fontSize: 12, fill: "#0C233C" }} width={96} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="Green" stackId="a" fill="#009A44" />
                  <Bar dataKey="Amber" stackId="a" fill="#EAAA00" />
                  <Bar dataKey="Red" stackId="a" fill="#E5001B" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </TracePanel>
          </div>

          <section>
            <button
              onClick={() => setExamplesOpen((open) => !open)}
              className="flex w-full items-start justify-between gap-4 border-b border-[#DCE3EE] pb-5 text-left"
            >
              <TraceSectionHeading eyebrow="5W1H annotation" title="Example Control Assessments" />
              <span className="mt-3 text-[#92A0B8]">{examplesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</span>
            </button>

            {examplesOpen ? (
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap gap-3">
                  {([
                    { key: "green", label: "Green — 6/6", dot: "#009A44" },
                    { key: "amber", label: "Amber — 4/6", dot: "#EAAA00" },
                    { key: "red", label: "Red — 2/6", dot: "#E5001B" },
                  ] as { key: ExampleTab; label: string; dot: string }[]).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setExampleTab(item.key)}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold ${
                        exampleTab === item.key
                          ? "bg-white text-[#0C233C] shadow-[0_14px_34px_-26px_rgba(12,35,60,0.35)]"
                          : "text-[#7E91AE]"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.dot }} />
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-6 rounded-[24px] border border-[#DCE3EE] bg-white p-7 shadow-[0_18px_42px_-34px_rgba(12,35,60,0.24)] xl:grid-cols-[1.05fr_1fr]">
                  <div>
                    <p className="mb-4 text-[14px] font-bold uppercase tracking-[0.14em] text-[#7E91AE]">
                      Control Text ({activeExample.id})
                    </p>
                    <div className="text-[18px] leading-[2.1] text-[#0C233C]">{activeExample.text}</div>
                    <div className="mt-8 flex flex-wrap items-center gap-4 text-[16px] font-bold">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: activeExample.ragColor }} />
                        Score: {activeExample.score} / 6
                      </span>
                      <span style={{ color: activeExample.ragColor }}>{activeExample.ragLabel}</span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-4 text-[14px] font-bold uppercase tracking-[0.14em] text-[#7E91AE]">5W1H Assessment</p>
                    <div className="space-y-3">
                      {activeExample.dims.map((item) => (
                        <div
                          key={item.dim}
                          className={`flex items-start gap-4 rounded-[18px] px-5 py-4 ${item.present ? "bg-[#EAF8F1]" : "bg-[#FFF4F5]"}`}
                        >
                          <span className={`w-12 shrink-0 text-[13px] font-bold uppercase tracking-[0.12em] ${item.dimClassName}`}>
                            {item.dim}
                          </span>
                          <span className="flex-1 text-[15px] leading-7 text-[#3E5370]">{item.text}</span>
                          <span className={`shrink-0 text-[13px] font-bold ${item.present ? "text-[#009A44]" : "text-[#E5001B]"}`}>
                            {item.present ? "Present" : "Missing"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <TraceSectionHeading
            eyebrow="Control detail"
            title="5W1H Scores by Control"
            action={<ActionButton>Export CSV</ActionButton>}
          />

          <div className="flex flex-wrap items-center gap-3">
            {([
              { key: "all", label: `All (${APEX_CSV.length.toLocaleString()})`, activeClass: "bg-[#00338D] text-white" },
              { key: "red", label: `Red (${redCount.toLocaleString()})`, activeClass: "bg-[#FFF0F0] text-[#E5001B]" },
              { key: "amber", label: `Amber (${amberCount.toLocaleString()})`, activeClass: "bg-[#FFF8E7] text-[#92600A]" },
              { key: "green", label: `Green (${greenCount.toLocaleString()})`, activeClass: "bg-[#EDFBF5] text-[#009A44]" },
            ] as { key: FilterType; label: string; activeClass: string }[]).map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  setFilter(item.key);
                  setPage(0);
                }}
                className={`rounded-full px-4 py-3 text-[15px] font-bold ${
                  filter === item.key ? item.activeClass : "border border-[#DCE3EE] bg-white text-[#7E91AE]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-[24px] border border-[#DCE3EE] bg-white shadow-[0_18px_42px_-34px_rgba(12,35,60,0.24)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE3EE] bg-[#F6F9FC]">
                    {["Control ID", "Control Text", "Process Area"].map((heading) => (
                      <th key={heading} className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">
                        {heading}
                      </th>
                    ))}
                    {["WHO", "WHAT", "WHERE", "HOW", "WHEN", "WHY"].map((heading) => (
                      <th key={heading} className="px-3 py-4 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">
                        {heading}
                      </th>
                    ))}
                    <th className="px-4 py-4 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Score</th>
                    <th className="px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">RAG</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((control) => {
                    const controlScore = score(control);
                    const controlRag = rag(control);
                    const truncatedText = control.text.length > 108 ? control.text.slice(0, 108) + "…" : control.text;

                    return (
                      <tr key={control.id} className="border-b border-[#E7EDF4] align-top last:border-0 hover:bg-[#FAFCFE]">
                        <td className="px-5 py-4 text-[14px] font-bold">
                          <button
                            onClick={() => navigate(`/control-360/${control.id}`)}
                            className="text-[#00338D] hover:text-[#1E49E2] hover:underline"
                          >
                            {control.id}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-[15px] leading-7 text-[#344A67]">{truncatedText}</td>
                        <td className="px-5 py-4 text-[15px] text-[#344A67]">{control.area}</td>
                        <td className="px-3 py-4 text-center"><DimCheck present={control.who} /></td>
                        <td className="px-3 py-4 text-center"><DimCheck present={control.what} /></td>
                        <td className="px-3 py-4 text-center"><DimCheck present={control.where} /></td>
                        <td className="px-3 py-4 text-center"><DimCheck present={control.how} /></td>
                        <td className="px-3 py-4 text-center"><DimCheck present={control.when} /></td>
                        <td className="px-3 py-4 text-center"><DimCheck present={control.why} /></td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex rounded-full px-3 py-1 text-[13px] font-bold ${RAG_BADGE_CLASS[controlRag]}`}>
                            {controlScore}/6
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize ${RAG_BADGE_CLASS[controlRag]}`}>
                            {controlRag}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[14px] text-[#7388A8]">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} controls
          </p>

          {pages > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="rounded-full border border-[#DCE3EE] bg-white px-4 py-2 text-[13px] font-bold text-[#7388A8] disabled:opacity-40"
              >
                Prev
              </button>
              {Array.from({ length: pages }, (_, index) => (
                <button
                  key={index}
                  onClick={() => setPage(index)}
                  className={`rounded-full px-3.5 py-2 text-[13px] font-bold ${
                    index === page ? "bg-[#00338D] text-white" : "border border-[#DCE3EE] bg-white text-[#7388A8]"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}
                disabled={page >= pages - 1}
                className="rounded-full border border-[#DCE3EE] bg-white px-4 py-2 text-[13px] font-bold text-[#7388A8] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </TraceStandalonePage>
  );
}

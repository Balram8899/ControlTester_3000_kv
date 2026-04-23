import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Download,
  CheckCircle,
  Lock,
  ChevronDown,
  ChevronUp,
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
} from "recharts";
import { APEX_CSV, type ApexControl } from "@/data/apex-controls-data";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function score(c: ApexControl) {
  return c.who + c.what + c.where + c.how + c.when + c.why;
}

function rag(c: ApexControl): "green" | "amber" | "red" {
  const missing = 6 - score(c);
  if (missing <= 1) return "green";
  if (missing === 2) return "amber";
  return "red";
}

type RagType = "green" | "amber" | "red";
type FilterType = "all" | RagType;

const PAGE_SIZE = 50;

const RAG_STYLES: Record<RagType, { pill: string; chip: string }> = {
  green: { pill: "bg-[#EDFBF5] text-[#009A44]", chip: "bg-[#EDFBF5] text-[#009A44]" },
  amber: { pill: "bg-[#FFFBEB] text-[#92600A]", chip: "bg-[#FFFBEB] text-[#92600A]" },
  red:   { pill: "bg-[#FFF0F0] text-[#E5001B]", chip: "bg-[#FFF0F0] text-[#E5001B]" },
};

function DimCheck({ present }: { present: 0 | 1 }) {
  return present ? (
    <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[#D1FAE5] text-[#065F46] text-[12px] font-bold">✓</span>
  ) : (
    <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-[#FEE2E2] text-[#991B1B] text-[12px] font-bold">✗</span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  badge,
  badgeClass,
  accentColor,
  scoreBar,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  badge: string;
  badgeClass: string;
  accentColor: string;
  scoreBar?: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: accentColor }} />
      <div className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1.5px] mb-2 mt-1">{label}</div>
      <div className="font-bold text-[38px] text-[#0C233C] tracking-tight leading-none mb-1">{value}</div>
      <div className="text-[12px] text-[#8492A6] mb-2">{sub}</div>
      {scoreBar !== undefined && (
        <div className="h-1.5 bg-[#E2E6EF] rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full"
            style={{
              width: `${scoreBar}%`,
              background: "linear-gradient(90deg, #E5001B 0%, #EAAA00 50%, #009A44 100%)",
            }}
          />
        </div>
      )}
      <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeClass}`}>
        {badge}
      </span>
    </div>
  );
}

// ─── Example Control Card ─────────────────────────────────────────────────────

type ExampleTab = "green" | "amber" | "red";

const EXAMPLES: Record<ExampleTab, {
  id: string;
  text: React.ReactNode;
  score: number;
  ragLabel: string;
  ragColor: string;
  dims: { dim: string; dimClass: string; text: string; present: boolean }[];
}> = {
  green: {
    id: "CTRL-0189",
    score: 6,
    ragLabel: "GREEN — No action required",
    ragColor: "#009A44",
    text: (
      <>
        &ldquo;<span className="bg-[#DBEAFE] text-[#1E40AF] font-semibold px-0.5 rounded-sm">The IRM Governance team</span> will{" "}
        <span className="bg-[#D1FAE5] text-[#065F46] font-semibold px-0.5 rounded-sm">review all policy and configuration changes</span>{" "}
        <span className="bg-[#FEF3C7] text-[#92400E] font-semibold px-0.5 rounded-sm">through the SIEM platform, via Splunk audit logs</span>{" "}
        <span className="bg-[#EDE9FE] text-[#5B21B6] font-semibold px-0.5 rounded-sm">triggered automatically to their monitored inbox</span>{" "}
        <span className="bg-[#FCE7F3] text-[#9D174D] font-semibold px-0.5 rounded-sm">on a daily basis</span>{" "}
        <span className="bg-[#FFEDD5] text-[#92400E] font-semibold px-0.5 rounded-sm">to identify and investigate any unauthorised policy or configuration changes before they impact system integrity</span>.&rdquo;
      </>
    ),
    dims: [
      { dim: "WHO", dimClass: "text-[#1E40AF]", text: "IRM Governance team", present: true },
      { dim: "WHAT", dimClass: "text-[#065F46]", text: "Review all policy and configuration changes", present: true },
      { dim: "WHERE", dimClass: "text-[#92400E]", text: "SIEM platform / Splunk audit logs", present: true },
      { dim: "HOW", dimClass: "text-[#5B21B6]", text: "Triggered automatically to monitored inbox", present: true },
      { dim: "WHEN", dimClass: "text-[#9D174D]", text: "Daily", present: true },
      { dim: "WHY", dimClass: "text-[#92400E]", text: "To identify unauthorised changes before they impact system integrity", present: true },
    ],
  },
  amber: {
    id: "CTRL-0542",
    score: 4,
    ragLabel: "AMBER — 2 elements missing, improvement recommended",
    ragColor: "#92600A",
    text: (
      <>
        &ldquo;<span className="bg-[#DBEAFE] text-[#1E40AF] font-semibold px-0.5 rounded-sm">The Finance Operations team</span> will{" "}
        <span className="bg-[#D1FAE5] text-[#065F46] font-semibold px-0.5 rounded-sm">perform a three-way match of purchase orders, goods received notes and supplier invoices</span>{" "}
        <span className="bg-[#FEF3C7] text-[#92400E] font-semibold px-0.5 rounded-sm">within the ERP system</span>{" "}
        on a <span className="bg-[#FCE7F3] text-[#9D174D] font-semibold px-0.5 rounded-sm">monthly basis</span>{" "}
        prior to payment run approval.&rdquo;
      </>
    ),
    dims: [
      { dim: "WHO", dimClass: "text-[#1E40AF]", text: "Finance Operations team", present: true },
      { dim: "WHAT", dimClass: "text-[#065F46]", text: "Three-way match of POs, GRNs and invoices", present: true },
      { dim: "WHERE", dimClass: "text-[#92400E]", text: "ERP system", present: true },
      { dim: "HOW", dimClass: "text-[#5B21B6]", text: "Not specified — automated or manual?", present: false },
      { dim: "WHEN", dimClass: "text-[#9D174D]", text: "Monthly, prior to payment run", present: true },
      { dim: "WHY", dimClass: "text-[#92400E]", text: "Purpose not stated — fraud prevention? Accuracy?", present: false },
    ],
  },
  red: {
    id: "CTRL-0901",
    score: 2,
    ragLabel: "RED — 4 elements missing, urgent rewrite required",
    ragColor: "#E5001B",
    text: (
      <>
        &ldquo;Access rights to the{" "}
        <span className="bg-[#FEF3C7] text-[#92400E] font-semibold px-0.5 rounded-sm">trading platform</span>{" "}
        are <span className="bg-[#D1FAE5] text-[#065F46] font-semibold px-0.5 rounded-sm">reviewed</span>{" "}
        and any inappropriate access is removed.&rdquo;
      </>
    ),
    dims: [
      { dim: "WHO", dimClass: "text-[#1E40AF]", text: "Not specified — no control owner identified", present: false },
      { dim: "WHAT", dimClass: "text-[#065F46]", text: "Review access rights; remove inappropriate access", present: true },
      { dim: "WHERE", dimClass: "text-[#92400E]", text: "Trading platform", present: true },
      { dim: "HOW", dimClass: "text-[#5B21B6]", text: "No process or tooling described", present: false },
      { dim: "WHEN", dimClass: "text-[#9D174D]", text: "No frequency or trigger defined", present: false },
      { dim: "WHY", dimClass: "text-[#92400E]", text: "Rationale not stated", present: false },
    ],
  },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ControlQualityAnalysisPage() {
  const [, navigate] = useLocation();
  const [isLocked, setIsLocked] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(0);
  const [exTab, setExTab] = useState<ExampleTab>("green");
  const [examplesOpen, setExamplesOpen] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("apex_diagnostics_run")) {
      setIsLocked(true);
    }
  }, []);

  // Compute stats from live data
  const greenCount = useMemo(() => APEX_CSV.filter(c => rag(c) === "green").length, []);
  const amberCount = useMemo(() => APEX_CSV.filter(c => rag(c) === "amber").length, []);
  const redCount   = useMemo(() => APEX_CSV.filter(c => rag(c) === "red").length, []);
  const avgScore   = useMemo(() => {
    const total = APEX_CSV.reduce((s, c) => s + score(c), 0);
    return (total / APEX_CSV.length).toFixed(2);
  }, []);
  const improvePct = useMemo(() => (((amberCount + redCount) / APEX_CSV.length) * 100).toFixed(1), [amberCount, redCount]);

  const whoCount   = useMemo(() => APEX_CSV.filter(c => c.who).length, []);
  const whatCount  = useMemo(() => APEX_CSV.filter(c => c.what).length, []);
  const whereCount = useMemo(() => APEX_CSV.filter(c => c.where).length, []);
  const howCount   = useMemo(() => APEX_CSV.filter(c => c.how).length, []);
  const whenCount  = useMemo(() => APEX_CSV.filter(c => c.when).length, []);
  const whyCount   = useMemo(() => APEX_CSV.filter(c => c.why).length, []);

  const areas = useMemo(() => Array.from(new Set(APEX_CSV.map(c => c.area))).sort(), []);
  const processData = useMemo(() =>
    areas.map(a => ({
      area: a.length > 16 ? a.substring(0, 15) + "…" : a,
      Green: APEX_CSV.filter(c => c.area === a && rag(c) === "green").length,
      Amber: APEX_CSV.filter(c => c.area === a && rag(c) === "amber").length,
      Red:   APEX_CSV.filter(c => c.area === a && rag(c) === "red").length,
    })),
  [areas]);

  // Filtered + paginated table
  const filtered = useMemo(
    () => filter === "all" ? APEX_CSV : APEX_CSV.filter(c => rag(c) === filter),
    [filter]
  );
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pages = Math.ceil(filtered.length / PAGE_SIZE);

  const tooltipStyle = {
    backgroundColor: "#0C233C",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "white",
    fontSize: 12,
  };

  const markerData = [
    { label: "WHAT", value: whatCount, color: "#34D399" },
    { label: "WHO",  value: whoCount,  color: "#60A5FA" },
    { label: "WHEN", value: whenCount, color: "#F472B6" },
    { label: "HOW",  value: howCount,  color: "#A78BFA" },
    { label: "WHERE",value: whereCount,color: "#FBBF24" },
    { label: "WHY",  value: whyCount,  color: "#FB923C" },
  ];

  const ragChartData = [
    { name: "Green", value: greenCount, color: "#009A44" },
    { name: "Amber", value: amberCount, color: "#EAAA00" },
    { name: "Red",   value: redCount,   color: "#E5001B" },
  ];

  const ex = EXAMPLES[exTab];

  return (
    <div className="min-h-screen bg-[#F0F2F7]">
      {/* ── Nav ── */}
      <TraceNavBar breadcrumb="Control Quality Analysis" />
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "#0C233C", padding: "52px 0 48px" }}
      >
        <div className="absolute rounded-full pointer-events-none" style={{ width:400,height:400,background:"radial-gradient(circle, rgba(114,19,234,0.25) 0%, transparent 70%)",filter:"blur(80px)",top:-120,right:-60 }} />
        <div className="absolute rounded-full pointer-events-none" style={{ width:280,height:280,background:"radial-gradient(circle, rgba(0,154,68,0.15) 0%, transparent 70%)",filter:"blur(80px)",bottom:-80,left:"5%" }} />
        <div className="relative max-w-[1100px] mx-auto px-8 md:px-12">
          <button
            onClick={() => navigate("/controls-diagnostics")}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-white/45 hover:text-[#00B8F5] transition-colors mb-7"
          >
            <ArrowLeft size={16} />
            Back to Diagnostics Hub
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-0.5 rounded bg-[#7213EA]" />
            <span className="text-[11px] font-bold text-[#7213EA] tracking-[2px] uppercase">Controls Design Diagnostics</span>
          </div>
          <h1 className="font-bold text-white leading-tight mb-3" style={{ fontSize:"clamp(28px,4vw,44px)", letterSpacing:"-1.5px" }}>
            Control Quality Analysis
          </h1>
          <p className="text-[16px] text-white/60 max-w-[680px] leading-[1.7] mb-6">
            Assess control documentation quality using the{" "}
            <strong className="text-white">5W1H framework</strong> — evaluating whether each
            control clearly defines Who performs it, What action is taken, Where it occurs, How
            it is executed, When it happens, and Why it is necessary.
          </p>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "WHO",   color: "#60A5FA" },
              { label: "WHAT",  color: "#34D399" },
              { label: "WHERE", color: "#FBBF24" },
              { label: "HOW",   color: "#A78BFA" },
              { label: "WHEN",  color: "#F472B6" },
              { label: "WHY",   color: "#FB923C" },
            ].map(({ label, color }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-1.5 rounded-full text-white border"
                style={{ background:"rgba(255,255,255,0.08)", borderColor:"rgba(255,255,255,0.12)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <main className="max-w-[1200px] mx-auto px-8 md:px-12 py-12 pb-24">

        {/* ── Locked ── */}
        {isLocked && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-[#E2E6EF] p-12 text-center mb-12">
            <Lock size={40} className="text-[#8492A6] mx-auto mb-4" />
            <h3 className="font-bold text-[#0C233C] text-[20px] mb-2">Diagnostics Not Yet Run</h3>
            <p className="text-[14px] text-[#8492A6] mb-6">Please run the Controls Design Diagnostics before viewing this analysis.</p>
            <button onClick={() => navigate("/controls-diagnostics")} className="inline-flex items-center gap-2 font-bold text-[14px] text-white bg-[#00338D] px-6 py-3 rounded-xl">
              Go to Diagnostics Hub →
            </button>
          </div>
        )}

        {/* ── Results ── */}
        {!isLocked && (
          <>
            {/* Analysis Banner */}
            <div className="rounded-2xl px-7 py-5 flex items-center justify-between gap-4 flex-wrap mb-7"
              style={{ background:"linear-gradient(135deg, #4a0ea8 0%, #7213EA 100%)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center">
                  <CheckCircle size={18} className="text-white" />
                </div>
                <div>
                  <div className="font-bold text-white text-[15px]">5W1H Analysis Complete</div>
                  <div className="text-[13px] text-white/65 mt-0.5">
                    {APEX_CSV.length.toLocaleString()} controls assessed across {areas.length} process areas
                  </div>
                </div>
              </div>
              <button className="inline-flex items-center gap-2 text-[13px] font-semibold text-white bg-white/15 border border-white/25 rounded-lg px-4 py-2 hover:bg-white/25 transition-colors">
                <Download size={14} />
                Export Full Report
              </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
              <KpiCard
                label="Total Controls Assessed"
                value={APEX_CSV.length.toLocaleString()}
                sub={`across ${areas.length} process areas`}
                badge="Full corpus"
                badgeClass="bg-[#F3F0FF] text-[#7213EA]"
                accentColor="#7213EA"
              />
              <KpiCard
                label="Avg Quality Score"
                value={<span>{avgScore}<span className="text-[18px] tracking-normal text-[#8492A6]">/6</span></span>}
                sub="mean 5W1H elements present"
                badge=""
                badgeClass=""
                accentColor="#1E49E2"
                scoreBar={parseFloat(avgScore) / 6 * 100}
              />
              <KpiCard
                label="Requires Improvement"
                value={`${improvePct}%`}
                sub={`${(amberCount + redCount).toLocaleString()} controls (amber + red)`}
                badge="↑ vs 95% target"
                badgeClass="bg-[#FFF0F0] text-[#E5001B]"
                accentColor="#E5001B"
              />
              <KpiCard
                label="Green — No Action"
                value={greenCount.toLocaleString()}
                sub="controls with ≤1 dimension missing"
                badge={`${((greenCount / APEX_CSV.length) * 100).toFixed(1)}% of corpus`}
                badgeClass="bg-[#EDFBF5] text-[#009A44]"
                accentColor="#009A44"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">

              {/* RAG Donut */}
              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6">
                <div className="font-bold text-[#0C233C] text-[14px] mb-1">RAG Distribution</div>
                <div className="text-[12px] text-[#8492A6] mb-4">Quality rating across all {APEX_CSV.length.toLocaleString()} controls</div>
                <div className="relative h-[180px]">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={ragChartData} dataKey="value" innerRadius={60} outerRadius={82} paddingAngle={2}>
                        {ragChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <div className="font-bold text-[22px] text-[#0C233C] tracking-tight leading-none">{APEX_CSV.length.toLocaleString()}</div>
                    <div className="text-[10px] text-[#8492A6] font-semibold uppercase tracking-wide mt-0.5">controls</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 mt-3">
                  {ragChartData.map(d => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="text-[12px] text-[#5A6478]">
                          {d.name} {d.name === "Green" ? "(0–1 missing)" : d.name === "Amber" ? "(2 missing)" : "(3+ missing)"}
                        </span>
                      </div>
                      <span className="text-[12px] font-bold text-[#0C233C]">{d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5W1H Marker bar */}
              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6">
                <div className="font-bold text-[#0C233C] text-[14px] mb-1">5W1H Element Prevalence</div>
                <div className="text-[12px] text-[#8492A6] mb-4">Controls with each element present</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={markerData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" domain={[0, APEX_CSV.length]} tick={{ fontSize: 11, fill: "#8492A6" }} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fontWeight: 700, fill: "#2D3748" }} width={45} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toLocaleString()} controls (${Math.round(v / APEX_CSV.length * 100)}%)`]} />
                    <Bar dataKey="value" radius={[0,4,4,0]} barSize={26}>
                      {markerData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* RAG by Process Area */}
              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6">
                <div className="font-bold text-[#0C233C] text-[14px] mb-1">Quality RAG by Process Area</div>
                <div className="text-[12px] text-[#8492A6] mb-4">Green / Amber / Red per area</div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={processData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EF" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#8492A6" }} />
                    <YAxis type="category" dataKey="area" tick={{ fontSize: 10, fill: "#2D3748" }} width={75} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="Green" stackId="a" fill="#009A44" />
                    <Bar dataKey="Amber" stackId="a" fill="#EAAA00" />
                    <Bar dataKey="Red"   stackId="a" fill="#E5001B" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Example Controls (collapsible) */}
            <div className="mb-7" id="sec-examples">
              <button
                className="w-full flex items-center justify-between pb-4 border-b-2 border-[#E2E6EF] mb-5"
                onClick={() => setExamplesOpen(o => !o)}
              >
                <div className="text-left">
                  <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">5W1H Annotation</div>
                  <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">Example Control Assessments</div>
                </div>
                {examplesOpen
                  ? <ChevronUp size={22} className="text-[#8492A6]" />
                  : <ChevronDown size={22} className="text-[#8492A6]" />
                }
              </button>
              {examplesOpen && (
                <>
                  <div className="flex gap-1 bg-[#F0F2F7] rounded-xl p-1 w-fit mb-4">
                    {(["green","amber","red"] as ExampleTab[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setExTab(t)}
                        className={`text-[13px] font-semibold rounded-lg px-4 py-2 transition-all flex items-center gap-1.5 ${
                          exTab === t ? "bg-white text-[#0C233C] shadow-sm" : "text-[#8492A6] hover:text-[#0C233C]"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: t === "green" ? "#009A44" : t === "amber" ? "#EAAA00" : "#E5001B" }} />
                        {t === "green" ? "Green — 6/6" : t === "amber" ? "Amber — 4/6" : "Red — 2/6"}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-7 grid grid-cols-1 md:grid-cols-2 gap-7">
                    {/* Text side */}
                    <div>
                      <div className="text-[14px] font-bold text-[#8492A6] uppercase tracking-wider mb-3">
                        Control Text ({ex.id})
                      </div>
                      <p className="text-[15px] text-[#0C233C] leading-[1.8] italic">{ex.text}</p>
                      <div className="flex items-center gap-3 mt-4 font-bold text-[14px]">
                        <span className="w-3 h-3 rounded-full" style={{ background: ex.ragColor }} />
                        Score: <strong>{ex.score} / 6</strong>
                        &nbsp;·&nbsp;
                        <span style={{ color: ex.ragColor }}>{ex.ragLabel}</span>
                      </div>
                    </div>
                    {/* Breakdown side */}
                    <div>
                      <div className="text-[14px] font-bold text-[#8492A6] uppercase tracking-wider mb-3">
                        5W1H Assessment
                      </div>
                      <div className="flex flex-col gap-2">
                        {ex.dims.map(d => (
                          <div
                            key={d.dim}
                            className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl ${
                              d.present ? "bg-[#EDFBF5]" : "bg-[#FFF5F5]"
                            }`}
                          >
                            <span className={`text-[11px] font-bold uppercase tracking-wider w-10 flex-shrink-0 mt-0.5 ${d.dimClass}`}>{d.dim}</span>
                            <span className="text-[13px] text-[#3D4A5C] flex-1">{d.text}</span>
                            <span className={`text-[11px] font-bold flex-shrink-0 ${d.present ? "text-[#009A44]" : "text-[#E5001B]"}`}>
                              {d.present ? "✓ Present" : "✗ Missing"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Table */}
            <div>
              <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-2">Control Detail</div>
              <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight mb-4">5W1H Scores by Control</h2>

              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="flex gap-1.5 flex-wrap">
                  {(
                    [
                      { key: "all",   label: `All (${APEX_CSV.length.toLocaleString()})`, cls: "bg-[#00338D] text-white border-[#00338D]" },
                      { key: "red",   label: `Red (${redCount.toLocaleString()})`,         cls: "bg-[#E5001B] text-white border-[#E5001B]" },
                      { key: "amber", label: `Amber (${amberCount.toLocaleString()})`,     cls: "bg-[#EAAA00] text-white border-[#EAAA00]" },
                      { key: "green", label: `Green (${greenCount.toLocaleString()})`,     cls: "bg-[#009A44] text-white border-[#009A44]" },
                    ] as { key: FilterType; label: string; cls: string }[]
                  ).map(({ key, label, cls }) => (
                    <button
                      key={key}
                      onClick={() => { setFilter(key); setPage(0); }}
                      className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full border-[1.5px] transition-all ${
                        filter === key ? cls : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="inline-flex items-center gap-2 text-[13px] font-semibold text-white bg-[#00338D] rounded-lg px-4 py-2 hover:bg-[#1E49E2] transition-colors">
                  <Download size={14} />
                  Export CSV
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 860 }}>
                    <thead>
                      <tr className="bg-[#F7F9FC] border-b border-[#E2E6EF]">
                        {["Control ID","Control Text","Process Area"].map(h => (
                          <th key={h} className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left whitespace-nowrap">{h}</th>
                        ))}
                        {["WHO","WHAT","WHERE","HOW","WHEN","WHY"].map(h => (
                          <th key={h} className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3 py-3 text-center">{h}</th>
                        ))}
                        <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3 py-3 text-center">Score</th>
                        <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-4 py-3 text-left">RAG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageData.map((c) => {
                        const s = score(c);
                        const r = rag(c);
                        const chipCls = r === "green" ? "bg-[#EDFBF5] text-[#009A44]" : r === "amber" ? "bg-[#FFFBEB] text-[#92600A]" : "bg-[#FFF0F0] text-[#E5001B]";
                        const pillCls = RAG_STYLES[r].pill;
                        const trunc = c.text.length > 100 ? c.text.substring(0, 100) + "…" : c.text;
                        return (
                          <tr key={c.id} className="border-b border-[#E2E6EF] hover:bg-[#FAFBFD] transition-colors last:border-0">
                            <td className="px-4 py-3 font-bold text-[12px] whitespace-nowrap">
                              <button
                                onClick={() => navigate(`/control-360/${c.id}`)}
                                className="text-[#00338D] hover:text-[#1E49E2] hover:underline cursor-pointer"
                              >
                                {c.id}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-[13px] text-[#3D4A5C] max-w-[280px] leading-snug">{trunc}</td>
                            <td className="px-4 py-3 text-[12px] text-[#3D4A5C] whitespace-nowrap">{c.area}</td>
                            <td className="px-3 py-3 text-center"><DimCheck present={c.who} /></td>
                            <td className="px-3 py-3 text-center"><DimCheck present={c.what} /></td>
                            <td className="px-3 py-3 text-center"><DimCheck present={c.where} /></td>
                            <td className="px-3 py-3 text-center"><DimCheck present={c.how} /></td>
                            <td className="px-3 py-3 text-center"><DimCheck present={c.when} /></td>
                            <td className="px-3 py-3 text-center"><DimCheck present={c.why} /></td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex items-center justify-center font-bold text-[13px] w-[34px] h-[28px] rounded-lg ${chipCls}`}>
                                {s}/6
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${pillCls} before:content-[''] before:w-[7px] before:h-[7px] before:rounded-full before:bg-current`}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-[12px] text-[#8492A6] mt-3">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()} controls
              </p>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <button
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border-[1.5px] border-[#E2E6EF] bg-white text-[#8492A6] hover:border-[#00338D] hover:text-[#00338D] disabled:opacity-40"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >← Prev</button>
                  {Array.from({ length: pages }, (_, i) => {
                    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 2) {
                      return (
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border-[1.5px] transition-colors ${
                            i === page ? "bg-[#00338D] text-white border-[#00338D]" : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                          }`}
                        >{i + 1}</button>
                      );
                    }
                    if (Math.abs(i - page) === 3) return <span key={i} className="text-[#8492A6] px-1">…</span>;
                    return null;
                  })}
                  <button
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border-[1.5px] border-[#E2E6EF] bg-white text-[#8492A6] hover:border-[#00338D] hover:text-[#00338D] disabled:opacity-40"
                    onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
                    disabled={page >= pages - 1}
                  >Next →</button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

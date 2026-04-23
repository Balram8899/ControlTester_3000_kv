import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Shield, BookOpen, Brain, Copy, FileText, Layers, CheckCircle2, AlertTriangle } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import TraceNavBar from "@/components/TraceNavBar";
import Footer from "@/components/Footer";
import { APEX_CSV, type ApexControl } from "@/data/apex-controls-data";
import { APEX_RISK_MAP, type ApexRisk } from "@/data/apex-risks-data";
import { APEX_OBLIGATIONS, type ApexObligation } from "@/data/apex-obligations-data";
import { useToast } from "@/hooks/use-toast";

const WEIGHTS = {
  riskCoverage: 0.25,
  regulatoryCoverage: 0.25,
  controlQuality: 0.15,
  duplicateEfficiency: 0.1,
  operationalMaturity: 0.15,
  sopAlignment: 0.1,
} as const;

type Coverage = "Full" | "Partial" | "Nominal";
type Rag = "Effective" | "Needs Improvement" | "At Risk";

type RadarScores = {
  riskCoverage: number;
  regulatoryCoverage: number;
  controlQuality: number;
  duplicateEfficiency: number;
  operationalMaturity: number;
  sopAlignment: number;
};

type CtrlView = {
  id: string;
  name: string;
  owner: string;
  domain: string;
  type: string;
  lastAssessed: string;
  description: string;
  risks: { id: string; name: string; coverage: Coverage; spof: boolean }[];
  obligations: { id: string; reg: string; summary: string; auth: string; coverage: Coverage; sole: boolean }[];
  w1h: Record<"who" | "what" | "when" | "where" | "why" | "how", { score: 0 | 2; gap: string | null }>;
  maturity: { frequency: string; automation: string; evidence: string; lastTested: string; level: number; levelDesc: string };
  duplicates: { controlId: string; controlName: string; pct: number; type: string; rec: string }[];
  radar: RadarScores;
  verdict: string;
  rag: Rag;
  summary: string;
};

const CSV_IDX: Record<string, ApexControl> = Object.fromEntries(APEX_CSV.map((c) => [c.id, c]));

const OBL_BY_DOMAIN: Record<string, ApexObligation[]> = (() => {
  const m: Record<string, ApexObligation[]> = {};
  APEX_OBLIGATIONS.forEach((o) => {
    const k = (o.domain || "").toLowerCase();
    if (!m[k]) m[k] = [];
    m[k].push(o);
  });
  return m;
})();

function buildCtrl(id: string): CtrlView {
  const csv = CSV_IDX[id];
  if (!csv) {
    return {
      id,
      name: "Control Not Found",
      owner: "Unknown",
      domain: "Unknown",
      type: "Unknown",
      lastAssessed: "—",
      description: "This control ID was not found in the APEX controls database.",
      risks: [],
      obligations: [],
      w1h: {
        who: { score: 0, gap: "Not assessed." },
        what: { score: 0, gap: "Not assessed." },
        when: { score: 0, gap: "Not assessed." },
        where: { score: 0, gap: "Not assessed." },
        why: { score: 0, gap: "Not assessed." },
        how: { score: 0, gap: "Not assessed." },
      },
      maturity: { frequency: "Unknown", automation: "Unknown", evidence: "Unknown", lastTested: "Unknown", level: 1, levelDesc: "Not assessed." },
      duplicates: [],
      radar: { riskCoverage: 0, regulatoryCoverage: 0, controlQuality: 0, duplicateEfficiency: 0, operationalMaturity: 0, sopAlignment: 0 },
      verdict: "Control not assessed.",
      rag: "At Risk",
      summary: "Control not found in inventory.",
    };
  }

  const sc = csv.who + csv.what + csv.where + csv.how + csv.when + csv.why;
  const miss = 6 - sc;
  const ragStr: Rag = miss <= 1 ? "Effective" : miss === 2 ? "Needs Improvement" : "At Risk";
  const we = (flag: 0 | 1, gap: string): { score: 0 | 2; gap: string | null } =>
    flag ? { score: 2, gap: null } : { score: 0, gap };

  const matLvl = csv.type === "Automated" ? 4 : csv.type === "Semi-Automated" ? 3 : 2;
  const matDescs = [
    "",
    "Ad hoc — no evidence of consistent execution.",
    "Defined — control documented but evidence quality limited.",
    "Implemented and monitored — control operates with documented output.",
    "Embedded with MI — control is monitored with management information and regular reporting.",
  ];
  const freqLabel = csv.type === "Automated" ? "Automated" : csv.type === "Semi-Automated" ? "Partially Automated" : "Manual";
  const evidence = matLvl >= 4 ? "Strong" : matLvl === 3 ? "Adequate" : "Limited";

  const linkedRisks = (APEX_RISK_MAP.byControl[id] || []).map((r: ApexRisk) => ({
    id: r.id,
    name: r.desc,
    coverage: "Partial" as Coverage,
    spof: false,
  }));

  const domainKey = (csv.area || "").toLowerCase();
  let matchedObls: ApexObligation[] = OBL_BY_DOMAIN[domainKey] || [];
  if (!matchedObls.length) {
    matchedObls = APEX_OBLIGATIONS.filter(
      (o) => o.domain && csv.area && csv.area.toLowerCase().includes((o.domain || "").toLowerCase().split(" ")[0]),
    );
  }
  const SEV_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const linkedObls = matchedObls
    .slice()
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      reg: o.reg,
      summary: o.summary,
      auth: (o.reg || "").split("/")[0].split(" ")[0],
      coverage: "Partial" as Coverage,
      sole: false,
    }));

  const sharedRiskIds = new Set(linkedRisks.map((r) => r.id));
  const dupCandidates: { controlId: string; controlName: string; pct: number; type: string; rec: string }[] = [];
  const seen = new Set<string>();
  sharedRiskIds.forEach(() => {
    Object.entries(APEX_RISK_MAP.byControl).forEach(([cId2, risks]) => {
      if (cId2 === id || seen.has(cId2)) return;
      const overlap = (risks as ApexRisk[]).filter((r) => sharedRiskIds.has(r.id)).length;
      if (overlap > 0) {
        seen.add(cId2);
        const pct = Math.round((overlap / sharedRiskIds.size) * 100);
        dupCandidates.push({
          controlId: cId2,
          controlName: CSV_IDX[cId2]?.name || cId2,
          pct,
          type: "Complementary",
          rec: "Review",
        });
      }
    });
  });
  const duplicates = dupCandidates.sort((a, b) => b.pct - a.pct).slice(0, 5);

  const riskCov = linkedRisks.length >= 3 ? 5 : linkedRisks.length >= 1 ? 3 : 1;
  const regCov = linkedObls.length >= 3 ? 5 : linkedObls.length >= 1 ? 3 : 1;
  const dupEff = duplicates.length === 0 ? 5 : duplicates.length <= 2 ? 4 : 3;
  const sopAlign = csv.how ? 3 : 1;

  return {
    id,
    name: csv.name,
    owner: csv.owner || "Unassigned",
    domain: csv.area,
    type: csv.type,
    lastAssessed: csv.lastAssessed || "5 Apr 2026",
    description: csv.text,
    risks: linkedRisks,
    obligations: linkedObls,
    w1h: {
      who: we(csv.who, "WHO absent — no performer or responsible team identified."),
      what: we(csv.what, "WHAT absent — activity is not clearly defined."),
      when: we(csv.when, "WHEN absent — no frequency or timing defined."),
      where: we(csv.where, "WHERE absent — no system or environment specified."),
      why: we(csv.why, "WHY absent — no risk rationale or purpose stated."),
      how: we(csv.how, "HOW absent — no methodology or procedure described."),
    },
    maturity: {
      frequency: freqLabel,
      automation: csv.type,
      evidence,
      lastTested: csv.lastAssessed || "Unknown",
      level: matLvl,
      levelDesc: matDescs[matLvl],
    },
    duplicates,
    radar: {
      riskCoverage: riskCov,
      regulatoryCoverage: regCov,
      controlQuality: sc,
      duplicateEfficiency: dupEff,
      operationalMaturity: matLvl,
      sopAlignment: sopAlign,
    },
    verdict: `${id} scored ${sc}/6 on 5W1H quality with ${linkedRisks.length} mapped risk(s). Click "Run AI Analysis" for a full 360° diagnostic.`,
    rag: ragStr,
    summary: `${id} — Run the AI Analysis above to generate the full control assessment, SOP evaluation and prioritised recommendations.`,
  };
}

const DOMAIN_COLOR: Record<string, string> = {
  IT: "#00B8F5",
  Financial: "#009A44",
  Governance: "#7213EA",
  User: "#E5001B",
  Credit: "#1E49E2",
  Compliance: "#098E7E",
  HR: "#EAAA00",
  Cyber: "#E5001B",
  Operations: "#00338D",
  Network: "#00B8F5",
  Data: "#098E7E",
};

function domainColor(domain: string) {
  return Object.entries(DOMAIN_COLOR).find(([k]) => domain.includes(k))?.[1] || "#00338D";
}

export default function Control360Page() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const idFromUrl = useMemo(() => {
    const parts = location.split("/").filter(Boolean);
    return parts[parts.length - 1] || "CTRL-0001";
  }, [location]);

  const C = useMemo(() => buildCtrl(idFromUrl), [idFromUrl]);

  const [toggleState, setToggleState] = useState<Record<number, "none" | "accepted" | "rejected">>({});

  const effectiveness = useMemo(() => {
    let total = 0;
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).forEach((k) => {
      total += (C.radar[k] || 0) * WEIGHTS[k];
    });
    return Math.round(total * 10) / 10;
  }, [C]);
  const effPct = Math.round((effectiveness / 6) * 100);

  const radarData = [
    { axis: "Risk Coverage", value: C.radar.riskCoverage },
    { axis: "Regulatory", value: C.radar.regulatoryCoverage },
    { axis: "Quality", value: C.radar.controlQuality },
    { axis: "Duplicate Eff.", value: C.radar.duplicateEfficiency },
    { axis: "Maturity", value: C.radar.operationalMaturity },
    { axis: "SOP", value: C.radar.sopAlignment },
  ];

  const ragStyle =
    C.rag === "Effective"
      ? { bg: "rgba(0,154,68,0.2)", border: "rgba(0,154,68,0.4)", color: "#4ade80" }
      : C.rag === "At Risk"
      ? { bg: "rgba(229,0,27,0.2)", border: "rgba(229,0,27,0.4)", color: "#f87171" }
      : { bg: "rgba(234,170,0,0.2)", border: "rgba(234,170,0,0.4)", color: "#fbbf24" };

  function exportGRC() {
    const pkg = {
      exportVersion: "1.0",
      exportTimestamp: new Date().toISOString(),
      source: "KPMG TRACE",
      control: {
        id: C.id,
        name: C.name,
        owner: C.owner,
        domain: C.domain,
        type: C.type,
        effectivenessScore: effectiveness,
        ragStatus: C.rag,
        radarScores: C.radar,
      },
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${C.id}_GRC_Export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast({ title: "GRC export downloaded", description: "Connect a GRC endpoint in Settings to push directly." });
  }

  const totalW1H = Object.values(C.w1h).reduce((s, v) => s + v.score, 0);
  const lvlNames = ["", "Ad hoc", "Defined", "Implemented", "Embedded", "Optimised"];

  return (
    <div className="min-h-screen bg-[#F0F2F7] flex flex-col">
      <TraceNavBar breadcrumb="Control 360°" />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "#0C233C", padding: "44px 0 48px" }}>
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ width: 500, height: 500, background: "radial-gradient(circle, rgba(0,51,141,0.4) 0%, transparent 70%)", filter: "blur(80px)", top: -180, right: -100 }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{ width: 300, height: 300, background: "radial-gradient(circle, rgba(0,184,245,0.15) 0%, transparent 70%)", filter: "blur(80px)", bottom: -80, left: "5%" }}
        />
        <div className="relative max-w-[1200px] mx-auto px-8 md:px-12">
          <button
            onClick={() => navigate("/controls-diagnostics/control-quality-analysis")}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-white/45 hover:text-[#00B8F5] transition-colors mb-7"
          >
            <ArrowLeft size={16} /> Back to Control Quality Analysis
          </button>
          <div className="flex items-start justify-between gap-6 flex-wrap mb-5">
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-3.5 mb-3">
                <span className="font-mono font-bold text-[13px] text-[#00B8F5] bg-[rgba(0,184,245,0.12)] border border-[rgba(0,184,245,0.28)] px-3.5 py-1.5 rounded-lg tracking-[1px]">
                  {C.id}
                </span>
                <span className="text-[12px] text-white/35">Last assessed: {C.lastAssessed}</span>
              </div>
              <h1 className="font-bold text-white leading-tight mb-4" style={{ fontSize: "clamp(22px,3vw,32px)", letterSpacing: "-0.8px" }}>
                {C.name}
              </h1>
              <div className="flex gap-2 flex-wrap mb-5">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full border border-white/15 text-white/80 bg-white/5">
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: domainColor(C.domain) }} />
                  {C.domain}
                </span>
                <span className="inline-flex items-center text-[12px] font-semibold px-3 py-1 rounded-full border border-white/15 text-white/80 bg-white/5">
                  {C.type}
                </span>
                <span className="inline-flex items-center text-[12px] font-semibold px-3 py-1 rounded-full border border-white/15 text-white/80 bg-white/5">
                  👤 {C.owner}
                </span>
              </div>
            </div>
            <button
              onClick={exportGRC}
              className="inline-flex items-center gap-2 text-[13px] font-bold text-white bg-[#00338D] hover:bg-[#1E49E2] border-none rounded-[10px] px-5 py-2.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Download size={16} /> Export to GRC
            </button>
          </div>
          <div className="bg-white/5 border border-white/10 border-l-[3px] border-l-[#00B8F5] rounded-[10px] px-5 py-4 text-[14px] text-white/65 leading-[1.75] italic">
            {C.description}
          </div>
        </div>
      </section>

      {/* Radar + Effectiveness */}
      <section className="relative overflow-hidden" style={{ background: "#0A1628", padding: "48px 0" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(0,51,141,0.35) 0%, transparent 65%)" }} />
        <div className="relative max-w-[1200px] mx-auto px-8 md:px-12 grid gap-10 lg:grid-cols-[1fr_360px] items-center">
          <div>
            <div className="font-bold text-white text-[18px] mb-1">Control Intelligence Radar</div>
            <div className="text-[13px] text-white/40 mb-7">Six-dimensional performance assessment · scores out of 6</div>
            <div className="max-w-[500px] mx-auto" style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 6]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                  <Radar name="Score" dataKey="value" stroke="#00B8F5" fill="#00338D" fillOpacity={0.28} strokeWidth={2.5} dot={{ r: 5, fill: "#00B8F5", stroke: "#0A1628", strokeWidth: 2 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="font-bold text-white text-[18px] mb-1">Overall Effectiveness</div>
            <div className="text-[13px] text-white/40 mb-5">Weighted composite · 6 axes</div>
            <div className="relative w-[210px] h-[118px] mx-auto mb-2">
              <svg viewBox="0 0 210 118" width="210" height="118">
                <defs>
                  <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: "#E5001B" }} />
                    <stop offset="50%" style={{ stopColor: "#EAAA00" }} />
                    <stop offset="100%" style={{ stopColor: "#009A44" }} />
                  </linearGradient>
                </defs>
                <path d="M 21 105 A 84 84 0 0 1 189 105" stroke="rgba(255,255,255,0.07)" strokeWidth={13} fill="none" strokeLinecap="round" />
                {(() => {
                  const cx = 105, cy = 105, r = 84;
                  const sa = Math.PI;
                  const sw = Math.PI * Math.min(effPct / 100, 1);
                  const ea = sa + sw;
                  const x1 = cx + r * Math.cos(sa);
                  const y1 = cy + r * Math.sin(sa);
                  const x2 = cx + r * Math.cos(ea);
                  const y2 = cy + r * Math.sin(ea);
                  return (
                    <path
                      d={`M ${x1} ${y1} A ${r} ${r} 0 ${sw > Math.PI ? 1 : 0} 1 ${x2} ${y2}`}
                      stroke="url(#gGrad)"
                      strokeWidth={13}
                      fill="none"
                      strokeLinecap="round"
                    />
                  );
                })()}
              </svg>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
                <div className="font-bold text-white text-[40px] leading-none" style={{ letterSpacing: "-2px" }}>
                  {effectiveness.toFixed(1)}
                  <span className="text-[18px] text-white/35">/6</span>
                </div>
                <div className="text-[12px] text-white/45 mt-0.5">{effPct}% effectiveness</div>
              </div>
            </div>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-bold mx-auto w-fit mt-3"
              style={{ background: ragStyle.bg, border: `1px solid ${ragStyle.border}`, color: ragStyle.color }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "currentColor" }} />
              {C.rag}
            </div>
            <div className="text-[13px] text-white/60 leading-[1.65] italic border-l-2 border-[#00338D] pl-3.5 mt-5">
              {C.verdict}
            </div>
            <div className="flex flex-col gap-2 mt-5">
              {(Object.entries(C.radar) as [keyof RadarScores, number][]).map(([k, v]) => {
                const col = v >= 5 ? "#4ade80" : v >= 3 ? "#fbbf24" : "#f87171";
                const labels: Record<keyof RadarScores, string> = {
                  riskCoverage: "Risk Coverage",
                  regulatoryCoverage: "Regulatory Coverage",
                  controlQuality: "Control Quality",
                  duplicateEfficiency: "Duplicate Efficiency",
                  operationalMaturity: "Op. Maturity",
                  sopAlignment: "SOP Alignment",
                };
                return (
                  <div key={k} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-white/50 w-[148px] flex-shrink-0">{labels[k]}</span>
                    <div className="flex-1 h-[5px] bg-white/7 rounded overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <div className="h-full rounded transition-all duration-1000" style={{ width: `${Math.round((v / 6) * 100)}%`, background: col }} />
                    </div>
                    <span className="font-mono text-[11px] font-bold w-5 text-right" style={{ color: col }}>{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main */}
      <main className="max-w-[1200px] mx-auto px-8 md:px-12 py-12 w-full flex-1">
        {/* AI trigger */}
        <div
          className="rounded-2xl px-8 py-7 flex items-center justify-between gap-5 mb-9 flex-wrap"
          style={{ background: "linear-gradient(135deg, #00338D 0%, #1E49E2 100%)" }}
        >
          <div>
            <h3 className="font-bold text-white text-[17px] mb-1.5">AI 360° Analysis Engine</h3>
            <p className="text-[13px] text-white/65 leading-[1.5] max-w-[560px]">
              Run a full Claude-powered diagnostic — generates scored assessments across all six axes, SOP gap analysis, duplicate detection, and prioritised recommendations.
            </p>
          </div>
          <button
            onClick={() => toast({ title: "AI Analysis", description: "Configure your Anthropic API key in Settings to enable live 360° analysis." })}
            className="inline-flex items-center gap-2.5 text-[14px] font-bold text-[#00338D] bg-white rounded-[10px] px-6 py-3 cursor-pointer transition-transform hover:-translate-y-px whitespace-nowrap"
          >
            <Brain size={18} /> Run AI Analysis
          </button>
        </div>

        <div className="mb-6">
          <p className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-2">Diagnostic Panels</p>
          <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight mb-6">360° Control Assessment</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 mb-7">
          {/* Risk Alignment */}
          <Panel accent="#098E7E" iconBg="#E6F5F3" iconColor="#098E7E" icon={<Shield size={15} />} title="Risk Alignment">
            {C.risks.length === 0 ? (
              <p className="text-[13px] text-[#8492A6]">No risks mapped.</p>
            ) : (
              C.risks.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 py-2.5 border-b border-[#E2E6EF] last:border-0">
                  <span className="font-mono text-[10px] font-bold text-[#00338D] bg-[#EEF2FF] px-2 py-0.5 rounded whitespace-nowrap">{r.id}</span>
                  <span className="text-[13px] text-[#3D4A5C] flex-1 leading-snug">{r.name}</span>
                  <CovPill coverage={r.coverage} />
                </div>
              ))
            )}
          </Panel>

          {/* Regulatory Alignment */}
          <Panel accent="#1E49E2" iconBg="#EEF2FF" iconColor="#1E49E2" icon={<BookOpen size={15} />} title="Regulatory Alignment">
            {C.obligations.length === 0 ? (
              <p className="text-[13px] text-[#8492A6]">No obligations mapped.</p>
            ) : (
              C.obligations.map((o) => (
                <div key={o.id} className="flex items-start gap-2.5 py-2.5 border-b border-[#E2E6EF] last:border-0">
                  <div>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#EEF2FF] text-[#1E49E2]">{o.auth}</span>
                    <div className="text-[11px] text-[#8492A6] mt-0.5">{o.id} · {o.reg}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] text-[#3D4A5C] leading-snug">{o.summary}</div>
                  </div>
                  <CovPill coverage={o.coverage} />
                </div>
              ))
            )}
          </Panel>

          {/* 5W1H */}
          <Panel accent="#7213EA" iconBg="#F3F0FF" iconColor="#7213EA" icon={<Layers size={15} />} title="5W1H Quality Analysis">
            {(
              [
                { k: "who" as const, l: "WHO", c: "#60A5FA" },
                { k: "what" as const, l: "WHAT", c: "#34D399" },
                { k: "when" as const, l: "WHEN", c: "#F472B6" },
                { k: "where" as const, l: "WHERE", c: "#FBBF24" },
                { k: "why" as const, l: "WHY", c: "#FB923C" },
                { k: "how" as const, l: "HOW", c: "#A78BFA" },
              ]
            ).map((d) => {
              const s = C.w1h[d.k];
              return (
                <div key={d.k} className="flex items-start gap-3 py-2.5 border-b border-[#E2E6EF] last:border-0">
                  <span className="font-mono text-[11px] font-bold w-9 flex-shrink-0 mt-0.5" style={{ color: d.c }}>
                    {d.l}
                  </span>
                  <div className="flex-1">
                    <div className="flex gap-1 mb-1">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: i < s.score ? d.c : "#E2E6EF" }}
                        />
                      ))}
                    </div>
                    {s.gap ? (
                      <div className="text-[12px] text-[#8492A6] italic leading-snug">{s.gap}</div>
                    ) : (
                      <div className="text-[12px] text-[#009A44] font-semibold">✓ Present</div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="font-bold text-[30px] mt-4" style={{ color: totalW1H >= 10 ? "#009A44" : totalW1H >= 6 ? "#EAAA00" : "#E5001B", letterSpacing: "-1px" }}>
              {totalW1H}
              <span className="text-[14px] font-normal text-[#8492A6]">/12</span>
            </div>
            <div className="text-[12px] text-[#8492A6] mt-0.5">
              {totalW1H >= 10 ? "Green — strong documentation" : totalW1H >= 6 ? "Amber — needs improvement" : "Red — urgent rewrite required"}
            </div>
          </Panel>

          {/* Duplicates */}
          <Panel accent="#EAAA00" iconBg="#FFFBEB" iconColor="#92600A" icon={<AlertTriangle size={15} />} title="Duplicate Control Analysis">
            {C.duplicates.length === 0 ? (
              <p className="text-[13px] text-[#8492A6]">No significant duplicates identified.</p>
            ) : (
              <>
                {C.duplicates.filter((d) => d.pct >= 60).length > 0 && (
                  <div className="bg-[#FFFBEB] border border-[#EAAA00] rounded-[10px] px-3.5 py-2.5 text-[12px] text-[#92600A] font-semibold mb-3.5 flex items-center gap-2">
                    <AlertTriangle size={14} /> {C.duplicates.filter((d) => d.pct >= 60).length} high-overlap duplicate(s) — rationalisation recommended.
                  </div>
                )}
                {C.duplicates.map((d) => (
                  <div key={d.controlId} className="flex items-center gap-2 py-2.5 border-b border-[#E2E6EF] last:border-0 flex-wrap">
                    <button
                      onClick={() => navigate(`/control-360/${d.controlId}`)}
                      className="font-mono text-[10px] font-bold text-[#7213EA] bg-[#F3F0FF] px-2 py-0.5 rounded hover:underline whitespace-nowrap"
                    >
                      {d.controlId}
                    </button>
                    <span
                      className="font-mono text-[12px] font-bold whitespace-nowrap"
                      style={{ color: d.pct >= 60 ? "#E5001B" : d.pct >= 30 ? "#EAAA00" : "#009A44" }}
                    >
                      {d.pct}%
                    </span>
                    <span className="text-[12px] text-[#3D4A5C] flex-1 min-w-[100px]">{d.controlName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EDFBF5] text-[#009A44] whitespace-nowrap">{d.type}</span>
                  </div>
                ))}
              </>
            )}
          </Panel>

          {/* Maturity */}
          <Panel accent="#009A44" iconBg="#EDFBF5" iconColor="#009A44" icon={<CheckCircle2 size={15} />} title="Operational Maturity">
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {[
                { l: "Frequency", v: C.maturity.frequency },
                { l: "Automation", v: C.maturity.automation },
                { l: "Evidence", v: C.maturity.evidence },
                { l: "Last Tested", v: C.maturity.lastTested },
              ].map((m) => (
                <div key={m.l} className="bg-[#F0F2F7] rounded-[10px] px-3.5 py-2.5">
                  <div className="text-[10px] font-bold text-[#8492A6] uppercase tracking-[1px] mb-1">{m.l}</div>
                  <div className="text-[14px] font-bold text-[#0C233C]">{m.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3.5">
              <div className="flex justify-between text-[12px] text-[#8492A6] mb-1.5">
                <span>Maturity Level {C.maturity.level}/5</span>
                <span>{lvlNames[C.maturity.level] || ""}</span>
              </div>
              <div className="h-2 bg-[#E2E6EF] rounded-lg overflow-hidden">
                <div
                  className="h-full rounded-lg transition-all duration-1000"
                  style={{ width: `${((C.maturity.level - 1) / 4) * 100}%`, background: "linear-gradient(90deg, #00338D, #1E49E2)" }}
                />
              </div>
            </div>
            <div className="font-bold text-[22px] text-[#00338D] mt-3">
              Level {C.maturity.level} — {lvlNames[C.maturity.level] || ""}
            </div>
            <div className="text-[12px] text-[#8492A6] mt-1 leading-[1.5]">{C.maturity.levelDesc}</div>
          </Panel>

          {/* SOP */}
          <Panel accent="#00338D" iconBg="#EEF2FF" iconColor="#00338D" icon={<FileText size={15} />} title="SOP Alignment">
            <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-1.5 rounded-full bg-[#FFF0F0] text-[#E5001B]">
                ✗ No SOP — Critical Gap
              </span>
            </div>
            <p className="text-[13px] text-[#8492A6] italic mb-3 leading-[1.55]">
              SOP assessment requires AI Analysis — click "Run AI Analysis" to generate a full SOP evaluation for this control.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                onClick={() => toast({ title: "SOP draft", description: "Run AI Analysis to generate a draft SOP." })}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-[#EEF2FF] text-[#1E49E2] hover:bg-[#DDE4FF]"
              >
                <Copy size={12} /> Copy SOP
              </button>
              <button
                onClick={() => toast({ title: "SOP queued", description: "Connect your GRC endpoint in Settings to push directly." })}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-[#00338D] text-white hover:bg-[#1E49E2]"
              >
                ⬆ Push to GRC
              </button>
            </div>
          </Panel>
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-2xl border border-[#E2E6EF] border-l-[4px] border-l-[#00338D] shadow-sm p-8 mb-12">
          <p className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-2">AI-Generated</p>
          <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight mb-6">KPMG TRACE Recommendations</h2>
          <div className="overflow-auto mb-6">
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr className="bg-[#F7F9FC]">
                  <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3.5 py-2.5 text-left border-b border-[#E2E6EF] w-10">Pri.</th>
                  <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3.5 py-2.5 text-left border-b border-[#E2E6EF]">Facet</th>
                  <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3.5 py-2.5 text-left border-b border-[#E2E6EF]">Recommendation</th>
                  <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3.5 py-2.5 text-left border-b border-[#E2E6EF]">Effort</th>
                  <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3.5 py-2.5 text-left border-b border-[#E2E6EF]">Impact</th>
                  <th className="text-[11px] font-bold text-[#8492A6] uppercase tracking-[1px] px-3.5 py-2.5 text-left border-b border-[#E2E6EF]">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="text-center py-7 text-[#8492A6] text-[13px]">
                    Run AI Analysis to generate recommendations.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-[14px] text-[#3D4A5C] leading-[1.75] bg-[#F0F2F7] rounded-[10px] px-5 py-4 italic">
            {C.summary}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Panel({
  accent,
  iconBg,
  iconColor,
  icon,
  title,
  children,
}: {
  accent: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-7 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: accent }} />
      <div className="font-bold text-[#0C233C] text-[15px] mb-4 flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function CovPill({ coverage }: { coverage: Coverage }) {
  const cls =
    coverage === "Full"
      ? "bg-[#EDFBF5] text-[#009A44]"
      : coverage === "Partial"
      ? "bg-[#FFFBEB] text-[#92600A]"
      : "bg-[#FFF0F0] text-[#E5001B]";
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${cls}`}>
      {coverage}
    </span>
  );
}

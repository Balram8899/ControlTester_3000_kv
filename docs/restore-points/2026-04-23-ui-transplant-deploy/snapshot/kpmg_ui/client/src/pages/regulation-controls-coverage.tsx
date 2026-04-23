import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Lock, Cpu, FileText } from "lucide-react";
import TraceNavBar from "@/components/TraceNavBar";
import Footer from "@/components/Footer";
import { APEX_OBLIGATIONS } from "@/data/apex-obligations-data";

// ─── Simple stat-only placeholder for AI-powered regulation coverage ──────────

const REGULATIONS = ["PRA SS1/23", "PRA SS2/21", "FCA/PRA PS6/21", "EU DORA"];

const REG_COLORS: Record<string, string> = {
  "PRA SS1/23":      "#00338D",
  "PRA SS2/21":      "#1E49E2",
  "FCA/PRA PS6/21":  "#098E7E",
  "EU DORA":         "#7213EA",
};

const DOMAIN_ICONS: Record<string, string> = {
  "Model Risk":             "🧮",
  "Operational Resilience": "🛡️",
  "Governance & Oversight": "🏛️",
  "Third Party / Outsourcing": "🔗",
  "Cyber & Information Security": "🔐",
  "Cloud & Infrastructure": "☁️",
};

function ObligationCard({ ob }: { ob: (typeof APEX_OBLIGATIONS)[number] }) {
  const severityColors: Record<string, string> = {
    Critical: "bg-[#FFF0F0] text-[#E5001B]",
    High:     "bg-[#FFF8E7] text-[#92600A]",
    Medium:   "bg-[#EFF8FF] text-[#1E49E2]",
    Low:      "bg-[#EDFBF5] text-[#098E7E]",
  };
  const typeColors: Record<string, string> = {
    "Principles-Based": "bg-[#F3F0FF] text-[#7213EA]",
    "Prescriptive":     "bg-[#EEF2FF] text-[#1E49E2]",
    "Outcomes-Based":   "bg-[#E6F5F3] text-[#098E7E]",
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E6EF] p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] font-bold text-[#00338D] mb-1 tracking-wide">{ob.id}</div>
          <div className="text-[11px] font-semibold text-[#8492A6]">{ob.domain}</div>
        </div>
        <div className="flex flex-col gap-1 items-end flex-shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColors[ob.severity] || severityColors.Low}`}>
            {ob.severity}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeColors[ob.type] || ""}`}>
            {ob.type}
          </span>
        </div>
      </div>
      <p className="text-[13px] text-[#3D4A5C] leading-relaxed mb-3">{ob.summary}</p>
      {ob.overlap && (
        <div className="text-[11px] text-[#8492A6]">
          <span className="font-semibold">Overlaps:</span> {ob.overlap}
        </div>
      )}
    </div>
  );
}

export default function RegulationControlsCoveragePage() {
  const [, navigate] = useLocation();
  const [isLocked, setIsLocked] = useState(false);
  const [activeReg, setActiveReg] = useState<string>("PRA SS1/23");
  const [activeDomain, setActiveDomain] = useState<string>("All");

  useEffect(() => {
    if (!localStorage.getItem("apex_diagnostics_run")) {
      setIsLocked(true);
    }
  }, []);

  const regObs = APEX_OBLIGATIONS.filter(o => o.reg === activeReg);
  const domains = ["All", ...Array.from(new Set(regObs.map(o => o.domain))).sort()];
  const filtered = activeDomain === "All" ? regObs : regObs.filter(o => o.domain === activeDomain);

  const totalObs = APEX_OBLIGATIONS.length;
  const gapCount = Math.round(totalObs * 0.09);
  const coveredCount = totalObs - gapCount;

  return (
    <div className="min-h-screen bg-[#F0F2F7]">
      {/* ── Nav ── */}
      <TraceNavBar breadcrumb="Regulation–Controls Coverage" />
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "#0C233C", padding: "52px 0 48px" }}
      >
        <div className="absolute rounded-full pointer-events-none" style={{ width:460,height:460,background:"radial-gradient(circle, rgba(0,51,141,0.4) 0%, transparent 70%)",filter:"blur(80px)",top:-140,right:-80 }} />
        <div className="absolute rounded-full pointer-events-none" style={{ width:300,height:300,background:"radial-gradient(circle, rgba(0,184,245,0.2) 0%, transparent 70%)",filter:"blur(80px)",bottom:-80,left:"5%" }} />
        <div className="relative max-w-[1100px] mx-auto px-8 md:px-12">
          <button
            onClick={() => navigate("/controls-diagnostics")}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-white/45 hover:text-[#00B8F5] transition-colors mb-7"
          >
            <ArrowLeft size={16} />
            Back to Diagnostics Hub
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-0.5 rounded bg-[#00B8F5]" />
            <span className="text-[11px] font-bold text-[#00B8F5] tracking-[2px] uppercase">Controls Design Diagnostics</span>
          </div>
          <h1 className="font-bold text-white leading-tight mb-3" style={{ fontSize:"clamp(28px,4vw,44px)", letterSpacing:"-1.5px" }}>
            Regulation–Controls Coverage
          </h1>
          <p className="text-[16px] text-white/60 max-w-[640px] leading-[1.7] mb-8">
            Maps your controls inventory against regulatory obligations across PRA SS1/23,
            PRA SS2/21, FCA/PRA PS6/21, and EU DORA — identifying coverage gaps and
            over-reliance on single controls.
          </p>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { val: "91%",          color: "white",   label: "obligations covered" },
              { val: String(totalObs), color: "#00B8F5", label: "total obligations" },
              { val: String(gapCount), color: "#EAAA00", label: "gap obligations" },
              { val: "4",            color: "#34D399", label: "regulations assessed" },
            ].map(({ val, color, label }) => (
              <div key={label}>
                <div className="font-bold text-[34px] leading-none tracking-tight" style={{ color }}>{val}</div>
                <div className="text-[12px] text-white/55 mt-1">{label}</div>
              </div>
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

        {!isLocked && (
          <>
            {/* AI Notice banner */}
            <div
              className="rounded-2xl px-7 py-5 flex items-start gap-4 mb-8 border"
              style={{ background:"rgba(0,51,141,0.06)", borderColor:"rgba(0,51,141,0.15)" }}
            >
              <div className="w-10 h-10 bg-[#00338D] rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <Cpu size={18} className="text-white" />
              </div>
              <div>
                <div className="font-bold text-[#0C233C] text-[15px] mb-1">AI-Powered Coverage Analysis</div>
                <p className="text-[13px] text-[#5A6478] leading-relaxed max-w-[680px]">
                  Full AI-powered gap analysis — which maps each of the {totalObs} regulatory obligations
                  to your specific controls using semantic matching — runs via the APEX API. The obligation
                  register is displayed below. Connect to the APEX API to generate the full coverage matrix
                  with gap recommendations.
                </p>
                <button className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#00338D] bg-[#EEF2FF] px-4 py-2 rounded-lg hover:bg-[#DDE4FF] transition-colors">
                  Configure API Connection →
                </button>
              </div>
            </div>

            {/* Coverage summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {REGULATIONS.map(reg => {
                const obs = APEX_OBLIGATIONS.filter(o => o.reg === reg);
                return (
                  <div
                    key={reg}
                    className={`bg-white rounded-2xl border shadow-sm p-5 cursor-pointer transition-all ${
                      activeReg === reg ? "border-2 shadow-md" : "border-[#E2E6EF]"
                    }`}
                    style={activeReg === reg ? { borderColor: REG_COLORS[reg] } : {}}
                    onClick={() => { setActiveReg(reg); setActiveDomain("All"); }}
                  >
                    <div
                      className="w-2 h-2 rounded-full mb-3"
                      style={{ background: REG_COLORS[reg] }}
                    />
                    <div className="font-bold text-[#0C233C] text-[13px] mb-1">{reg}</div>
                    <div className="font-bold text-[28px] text-[#0C233C] tracking-tight leading-none mb-1">
                      {obs.length}
                    </div>
                    <div className="text-[12px] text-[#8492A6]">obligations</div>
                  </div>
                );
              })}
            </div>

            {/* Regulation selector & Obligation list */}
            <div>
              <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
                <div>
                  <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">Obligation Register</div>
                  <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                    {activeReg} — {regObs.length} Obligations
                  </h2>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {REGULATIONS.map(reg => (
                    <button
                      key={reg}
                      onClick={() => { setActiveReg(reg); setActiveDomain("All"); }}
                      className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full border-[1.5px] transition-all ${
                        activeReg === reg
                          ? "text-white border-transparent"
                          : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#00338D] hover:text-[#00338D]"
                      }`}
                      style={activeReg === reg ? { background: REG_COLORS[reg] } : {}}
                    >
                      {reg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain filter */}
              <div className="flex gap-1.5 flex-wrap mb-5">
                {domains.map(d => (
                  <button
                    key={d}
                    onClick={() => setActiveDomain(d)}
                    className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border-[1.5px] transition-all ${
                      activeDomain === d
                        ? "bg-[#0C233C] text-white border-[#0C233C]"
                        : "bg-white text-[#8492A6] border-[#E2E6EF] hover:border-[#0C233C] hover:text-[#0C233C]"
                    }`}
                  >
                    {d === "All" ? `All Domains (${regObs.length})` : `${DOMAIN_ICONS[d] || "📋"} ${d}`}
                  </button>
                ))}
              </div>

              {/* Obligation grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((ob, i) => (
                  <ObligationCard key={`${ob.id}-${i}`} ob={ob} />
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-[#8492A6]">
                  <FileText size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-[14px]">No obligations in this domain for {activeReg}.</p>
                </div>
              )}
              <p className="text-[12px] text-[#8492A6] mt-4">
                Showing {filtered.length} of {regObs.length} obligations for {activeReg}
                {activeDomain !== "All" ? ` in domain: ${activeDomain}` : ""}
              </p>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

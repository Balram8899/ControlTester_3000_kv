import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useCrossNav } from "@/contexts/CrossNavContext";
import { Search, CheckSquare, BookOpen, AlertTriangle, ChevronRight } from "lucide-react";

const CARD1_LINKS = [
  "Risk – Controls Coverage",
  "Regulation – Controls Coverage",
  "Control Quality Analysis",
  "Controls Duplicates",
  "Benchmarking and Gap Assessment",
];

const CARD2_LINKS = [
  "Regulatory Frameworks",
  "Obligation Mapping",
  "Compliance Gap Analysis",
];

const CARD3_LINKS = [
  "Testing Framework",
  "Automation Playbook",
  "Evidence Repository",
];

const CARD4_LINKS = [
  "Risk Heatmap",
  "Control-Risk Linkage",
  "Risk Appetite Dashboard",
];

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { setPendingQualityAnalysis } = useCrossNav();

  function handleSignOut() {
    logout();
    setLocation("/login");
  }

  function goToQualityAnalysis() {
    setPendingQualityAnalysis(true);
    setLocation("/controls-library");
  }

  const activeCardStyle = {
    background: "#fff",
    border: "2px solid #001E62",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  const inactiveCardStyle = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    opacity: 0.65,
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ── Top Nav ── */}
      <nav
        className="flex items-center justify-between px-8 py-3 flex-shrink-0"
        style={{ background: "#0a0e1a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm tracking-wide">KPMG</span>
          <span className="text-slate-500 text-sm">|</span>
          <span className="font-bold text-sm tracking-widest" style={{ color: "var(--pacific, #00b2e3)" }}>
            TRACE
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded tracking-wider"
            style={{ background: "rgba(255,255,255,0.08)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            KPMG CONFIDENTIAL
          </span>
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold px-3 py-1.5 rounded tracking-wider transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
          >
            SIGN OUT
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        className="flex-shrink-0 flex flex-col justify-center px-16 py-16"
        style={{ background: "linear-gradient(135deg, #001E62 0%, #0a1628 60%, #001030 100%)", minHeight: "40vh" }}
      >
        <div className="max-w-4xl">
          <p className="text-xs tracking-[0.3em] uppercase mb-6 flex items-center gap-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            <span style={{ width: 28, height: 1, background: "rgba(255,255,255,0.3)", display: "inline-block" }} />
            Agentic Solutions
          </p>

          <h1 className="text-6xl font-black mb-4 leading-tight tracking-tight">
            <span className="text-white">KPMG </span>
            <span style={{ color: "var(--pacific, #00b2e3)" }}>TRACE</span>
          </h1>

          <p className="text-base font-medium mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
            Agentic Process &amp; Controls Excellence
          </p>

          <p className="text-sm leading-relaxed max-w-xl" style={{ color: "rgba(255,255,255,0.38)" }}>
            A consolidated and fully agentified solution designed to transform how organisations design, test, measure and monitor technology controls.
          </p>
        </div>
      </section>

      {/* ── Proposition Cards ── */}
      <section className="flex-1 px-16 py-12" style={{ background: "#f1f4f8" }}>
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] tracking-[0.3em] uppercase font-semibold mb-1" style={{ color: "var(--pacific, #00b2e3)" }}>
                Proposition Areas
              </p>
              <h2 className="text-2xl font-bold" style={{ color: "#001E62" }}>
                TRACE Accelerator Capabilities
              </h2>
            </div>
            <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ background: "rgba(0,30,98,0.08)", color: "#001E62" }}>
              3 of 4 live
            </span>
          </div>

          {/* Cards grid — 4 columns */}
          <div className="grid grid-cols-4 gap-5">

            {/* Card 1 — Controls Design Diagnostics */}
            <div
              className="rounded-lg flex flex-col transition-all duration-200 cursor-pointer"
              style={activeCardStyle}
              onClick={goToQualityAnalysis}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,30,98,0.18)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--pacific, #00b2e3)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "#001E62";
              }}
            >
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ background: "#001E62" }}>
                    <Search className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h3 className="font-bold text-sm mb-2" style={{ color: "#001E62" }}>Controls Design Diagnostics</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                  A rapid assessment of the design of controls against recorded risks — evaluating coverage, completeness and the hygiene of controls design.
                </p>
              </div>
              <div className="px-5 pb-5">
                <div className="border-t pt-4" style={{ borderColor: "#e2e8f0" }}>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "#001E62" }}>
                    <ChevronRight className="h-3 w-3" /> Run Diagnostics
                  </p>
                  <div className="space-y-1.5">
                    {CARD1_LINKS.map(link => (
                      <p key={link} className="text-xs pl-4" style={{ color: "#3b82f6" }}>{link}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2 — Regulatory Analysis */}
            <div
              className="rounded-lg flex flex-col transition-all duration-200 cursor-pointer"
              style={activeCardStyle}
              onClick={() => setLocation("/regulatory-library")}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,30,98,0.18)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--pacific, #00b2e3)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "#001E62";
              }}
            >
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ background: "#001E62" }}>
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h3 className="font-bold text-sm mb-2" style={{ color: "#001E62" }}>Regulatory Analysis</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                  Map controls against regulatory obligations across NIST, ISO 27001, SOC 2, PCI-DSS, GDPR and more — identifying gaps and coverage at a glance.
                </p>
              </div>
              <div className="px-5 pb-5">
                <div className="border-t pt-4" style={{ borderColor: "#e2e8f0" }}>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "#001E62" }}>
                    <ChevronRight className="h-3 w-3" /> Explore Frameworks
                  </p>
                  <div className="space-y-1.5">
                    {CARD2_LINKS.map(link => (
                      <p key={link} className="text-xs pl-4" style={{ color: "#3b82f6" }}>{link}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3 — Controls Testing */}
            <div
              className="rounded-lg flex flex-col transition-all duration-200 cursor-pointer"
              style={activeCardStyle}
              onClick={() => setLocation("/control-testing")}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,30,98,0.18)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--pacific, #00b2e3)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "#001E62";
              }}
            >
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ background: "#001E62" }}>
                    <CheckSquare className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h3 className="font-bold text-sm mb-2" style={{ color: "#001E62" }}>Controls Testing</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                  Automated and AI-assisted execution of controls tests across IT general controls, application controls and business process controls — with full audit trail.
                </p>
              </div>
              <div className="px-5 pb-5">
                <div className="border-t pt-4" style={{ borderColor: "#e2e8f0" }}>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "#001E62" }}>
                    <ChevronRight className="h-3 w-3" /> Launch Testing
                  </p>
                  <div className="space-y-1.5">
                    {CARD3_LINKS.map(link => (
                      <p key={link} className="text-xs pl-4" style={{ color: "#3b82f6" }}>{link}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4 — Risk Assessment (In Development) */}
            <div
              className="rounded-lg flex flex-col transition-all duration-200 relative overflow-hidden"
              style={inactiveCardStyle}
            >
              {/* In Development badge */}
              <span
                className="absolute top-3 right-3 text-[9px] font-semibold px-2 py-0.5 rounded-full tracking-wider"
                style={{ background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid #cbd5e1" }}
              >
                IN DEVELOPMENT
              </span>
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ background: "#94a3b8" }}>
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h3 className="font-bold text-sm mb-2" style={{ color: "#64748b" }}>Risk Assessment</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
                  AI-driven risk identification and heatmap generation — linking risks to controls and surfacing coverage gaps across the enterprise risk landscape.
                </p>
              </div>
              <div className="px-5 pb-5">
                <div className="border-t pt-4" style={{ borderColor: "#e2e8f0" }}>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "#94a3b8" }}>
                    <ChevronRight className="h-3 w-3" /> View Risks
                  </p>
                  <div className="space-y-1.5">
                    {CARD4_LINKS.map(link => (
                      <p key={link} className="text-xs pl-4" style={{ color: "#cbd5e1" }}>{link}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="flex-shrink-0 flex items-center justify-center px-8 py-4"
        style={{ background: "#0a0e1a", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span className="font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>KPMG Trace</span>
          {"   "}© 2026 KPMG LLP, a UK limited liability partnership and a member firm of the KPMG global organisation.
        </p>
      </footer>
    </div>
  );
}

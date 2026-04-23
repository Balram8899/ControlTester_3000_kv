import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download, FileText, Scale } from "lucide-react";
import TraceStandalonePage from "@/components/TraceStandalonePage";
import {
  TraceLockedState,
  TraceMetricCard,
  TracePanel,
  TraceSectionHeading,
  TraceStatusRibbon,
} from "@/components/TraceAnalysisPrimitives";
import { APEX_OBLIGATIONS } from "@/data/apex-obligations-data";

const REGULATIONS = ["PRA SS1/23", "PRA SS2/21", "FCA/PRA PS6/21", "EU DORA"];

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-[18px] bg-[#00338D] px-5 py-3 text-[15px] font-bold text-white shadow-[0_16px_40px_-30px_rgba(0,51,141,0.55)] transition-transform hover:-translate-y-px">
      <Download className="h-4 w-4" />
      {children}
    </button>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    Critical: "bg-[#FFF0F0] text-[#E5001B]",
    High: "bg-[#FFF8E7] text-[#92600A]",
    Medium: "bg-[#EEF4FF] text-[#1E49E2]",
    Low: "bg-[#EDFBF5] text-[#098E7E]",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-bold ${styles[severity] || styles.Low}`}>
      {severity}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    "Principles-Based": "bg-[#F3F0FF] text-[#7213EA]",
    Prescriptive: "bg-[#EEF4FF] text-[#1E49E2]",
    "Outcomes-Based": "bg-[#EAF8F1] text-[#098E7E]",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-bold ${styles[type] || "bg-[#F3F6FA] text-[#546781]"}`}>
      {type}
    </span>
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

  const totalObs = APEX_OBLIGATIONS.length;
  const gapCount = Math.round(totalObs * 0.09);
  const coveredCount = totalObs - gapCount;
  const regulationObligations = useMemo(
    () => APEX_OBLIGATIONS.filter((item) => item.reg === activeReg),
    [activeReg],
  );
  const domains = useMemo(
    () => ["All", ...Array.from(new Set(regulationObligations.map((item) => item.domain))).sort()],
    [regulationObligations],
  );
  const filtered = activeDomain === "All"
    ? regulationObligations
    : regulationObligations.filter((item) => item.domain === activeDomain);

  return (
    <TraceStandalonePage breadcrumb="Regulation-Controls Coverage" maxWidth="1380px">
      {isLocked ? (
        <TraceLockedState
          title="Diagnostics Not Yet Run"
          description="Run Controls Diagnostics first so TRACE can assemble the obligation coverage register and regulation views."
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
            title="Coverage Analysis Loaded"
            detail={`${coveredCount} obligations covered · ${gapCount} gaps remaining · 4 regulations assessed`}
            action={<ActionButton>Export Report</ActionButton>}
            tone="blue"
          />

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <TraceMetricCard
              label="Obligations Covered"
              value="91%"
              sub="coverage across the uploaded register"
              accentColor="#00338D"
              badge={`${coveredCount} mapped obligations`}
              badgeClassName="bg-[#EEF4FF] text-[#1E49E2]"
            />
            <TraceMetricCard
              label="Total Obligations"
              value={String(totalObs)}
              sub="current obligation register"
              accentColor="#1E49E2"
              badge="4 source regulations"
              badgeClassName="bg-[#EEF4FF] text-[#1E49E2]"
            />
            <TraceMetricCard
              label="Gap Obligations"
              value={String(gapCount)}
              sub="items with coverage still required"
              accentColor="#EAAA00"
              badge="9% of register"
              badgeClassName="bg-[#FFF8E7] text-[#92600A]"
            />
            <TraceMetricCard
              label="Active Regulation"
              value={String(regulationObligations.length)}
              sub={`${activeReg} obligations in view`}
              accentColor="#098E7E"
              badge={activeReg}
              badgeClassName="bg-[#EAF8F1] text-[#098E7E]"
            />
          </div>

          <TracePanel title="Regulation Coverage" subtitle="Select a regulation and review the obligation register in scope">
            <div className="flex flex-wrap gap-3">
              {REGULATIONS.map((regulation) => (
                <button
                  key={regulation}
                  onClick={() => {
                    setActiveReg(regulation);
                    setActiveDomain("All");
                  }}
                  className={`rounded-full px-4 py-3 text-[15px] font-bold ${
                    activeReg === regulation
                      ? "bg-[#00338D] text-white shadow-[0_14px_34px_-26px_rgba(12,35,60,0.35)]"
                      : "border border-[#DCE3EE] bg-white text-[#7E91AE]"
                  }`}
                >
                  {regulation}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {domains.map((domain) => (
                <button
                  key={domain}
                  onClick={() => setActiveDomain(domain)}
                  className={`rounded-full px-4 py-3 text-[14px] font-bold ${
                    activeDomain === domain
                      ? "bg-[#0C233C] text-white"
                      : "border border-[#DCE3EE] bg-white text-[#7E91AE]"
                  }`}
                >
                  {domain === "All" ? `All Domains (${regulationObligations.length})` : domain}
                </button>
              ))}
            </div>
          </TracePanel>

          <TraceSectionHeading
            eyebrow="Obligation register"
            title={`${activeReg} — ${filtered.length} obligations`}
            action={<ActionButton>Export CSV</ActionButton>}
          />

          {filtered.length === 0 ? (
            <TracePanel title="No obligations in scope" subtitle="Try another domain or regulation filter">
              <div className="flex items-center gap-3 text-[15px] text-[#7388A8]">
                <FileText className="h-5 w-5" />
                No obligations matched the current filters.
              </div>
            </TracePanel>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {filtered.map((obligation) => (
                <section
                  key={obligation.id}
                  className="rounded-[22px] border border-[#DCE3EE] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(12,35,60,0.24)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-[12px] font-bold text-[#1E49E2]">
                        {obligation.id}
                      </div>
                      <p className="mt-3 text-[16px] leading-7 text-[#344A67]">{obligation.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SeverityPill severity={obligation.severity} />
                      <TypePill type={obligation.type} />
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] bg-[#F6F9FC] px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Domain</p>
                      <p className="mt-2 text-[15px] font-bold text-[#0C233C]">{obligation.domain}</p>
                    </div>
                    <div className="rounded-[18px] bg-[#F6F9FC] px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7E91AE]">Overlap</p>
                      <p className="mt-2 text-[15px] text-[#4D6485]">{obligation.overlap || "No overlap noted"}</p>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </TraceStandalonePage>
  );
}

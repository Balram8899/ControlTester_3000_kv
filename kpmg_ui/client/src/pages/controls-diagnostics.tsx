import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  Layers,
  LineChart,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import TraceStandalonePage from "@/components/TraceStandalonePage";
import {
  TraceSectionHeading,
  TraceStatusRibbon,
} from "@/components/TraceAnalysisPrimitives";

type RunState = "idle" | "running" | "done";

function InputCard({
  title,
  fileType,
  description,
  loadedFileName,
  loaded,
  onLoad,
  icon,
  accentColor,
  buttonColor,
  tintClassName,
}: {
  title: string;
  fileType: string;
  description: string;
  loadedFileName: string;
  loaded: boolean;
  onLoad: () => void;
  icon: React.ReactNode;
  accentColor: string;
  buttonColor?: string;
  tintClassName: string;
}) {
  return (
    <section
      className="rounded-[24px] border bg-white p-7 shadow-[0_20px_44px_-36px_rgba(12,35,60,0.26)]"
      style={{ borderColor: loaded ? accentColor : "#DCE3EE", boxShadow: loaded ? `0 22px 52px -40px ${accentColor}55` : undefined }}
    >
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] ${tintClassName}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[20px] font-bold tracking-[-0.02em] text-[#0C233C]">{title}</p>
          <p className="mt-1 text-[14px] text-[#7388A8]">{fileType}</p>
        </div>
      </div>
      <p className="mt-6 text-[15px] leading-7 text-[#4D6485]">{description}</p>
      {loaded ? (
        <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#EDFBF5] px-3.5 py-1.5 text-[14px] font-bold text-[#009A44]">
          <CheckCircle2 className="h-4 w-4" />
          {loadedFileName}
        </div>
      ) : (
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={onLoad}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold text-white"
            style={{ backgroundColor: buttonColor ?? accentColor }}
          >
            <Upload className="h-4 w-4" />
            Choose file
          </button>
          <button
            onClick={onLoad}
            className="text-[14px] font-bold"
            style={{ color: buttonColor ?? accentColor }}
          >
            Load sample data
          </button>
        </div>
      )}
    </section>
  );
}

function DiagnosticsCard({
  title,
  value,
  subLabel,
  detail,
  accentColor,
  icon,
  preview = false,
  onNavigate,
  valueClassName,
}: {
  title: string;
  value: React.ReactNode;
  subLabel: string;
  detail: string;
  accentColor: string;
  icon: React.ReactNode;
  preview?: boolean;
  onNavigate?: () => void;
  valueClassName?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-[#DCE3EE] bg-white p-7 shadow-[0_20px_48px_-36px_rgba(12,35,60,0.28)]">
      <div className="absolute inset-x-0 top-0 h-[4px]" style={{ backgroundColor: accentColor }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#0C233C]">{title}</h3>
        </div>
        {preview ? (
          <span className="rounded-full border border-[#DCE3EE] bg-[#F3F6FA] px-3 py-1 text-[12px] font-bold uppercase tracking-[0.08em] text-[#8AA0BF]">
            Preview
          </span>
        ) : (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px]"
            style={{ backgroundColor: `${accentColor}16`, color: accentColor }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className={valueClassName ?? "mt-8 text-[52px] font-bold leading-none tracking-[-0.04em] text-[#0C233C]"}>{value}</div>
      <p className="mt-3 text-[15px] text-[#7388A8]">{subLabel}</p>
      <p className="mt-7 text-[15px] text-[#4D6485]">{detail}</p>
      {!preview && onNavigate ? (
        <button
          onClick={onNavigate}
          className="mt-8 inline-flex items-center gap-2 text-[16px] font-bold"
          style={{ color: accentColor }}
        >
          View Full Analysis
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </section>
  );
}

export default function ControlsDiagnosticsPage() {
  const [, navigate] = useLocation();
  const [riskLoaded, setRiskLoaded] = useState(false);
  const [ctrlLoaded, setCtrlLoaded] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("apex_diagnostics_run")) {
      setRiskLoaded(true);
      setCtrlLoaded(true);
      setRunState("done");
      setShowResults(true);
    }
  }, []);

  function handleRun() {
    setRiskLoaded(true);
    setCtrlLoaded(true);
    setRunState("running");
    setTimeout(() => {
      localStorage.setItem("apex_diagnostics_run", "1");
      setRunState("done");
      setShowResults(true);
      setTimeout(() => {
        document.getElementById("diag-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }, 2200);
  }

  const obsCount = (() => {
    try {
      const obs = JSON.parse(localStorage.getItem("apex_obligations_v1") || "[]");
      return obs.length || 41;
    } catch {
      return 41;
    }
  })();
  const gapCount = Math.round(obsCount * 0.09) || 4;

  const runButton =
    runState === "done" ? (
      <>
        <CheckCircle2 className="h-5 w-5" />
        All Diagnostics Complete
      </>
    ) : runState === "running" ? (
      <>
        <Loader2 className="h-5 w-5 animate-spin" />
        Running diagnostics
      </>
    ) : (
      <>
        <Play className="h-5 w-5 fill-current" />
        Run All Diagnostics
      </>
    );

  return (
    <TraceStandalonePage breadcrumb="Controls Diagnostics" maxWidth="1380px">
      <div className="grid gap-5 lg:grid-cols-2">
        <InputCard
          title="Risk Register"
          fileType="CSV / XLSX"
          description="Risk IDs, descriptions, risk ratings, process owners, and categories."
          loadedFileName="risk_register_sample.csv loaded"
          loaded={riskLoaded}
          onLoad={() => setRiskLoaded(true)}
          icon={<FileText className="h-5 w-5 text-[#1E49E2]" />}
          accentColor="#009A44"
          buttonColor="#1E49E2"
          tintClassName="bg-[#EEF2FF]"
        />
        <InputCard
          title="Controls Inventory with Verbatim"
          fileType="CSV / XLSX"
          description="Control IDs, control text, owner, type, linked risk IDs, and process area."
          loadedFileName="controls_inventory_verbatim_sample.csv loaded"
          loaded={ctrlLoaded}
          onLoad={() => setCtrlLoaded(true)}
          icon={<Layers className="h-5 w-5 text-[#7213EA]" />}
          accentColor="#009A44"
          buttonColor="#7213EA"
          tintClassName="bg-[#F3F0FF]"
        />
      </div>

      <section className="rounded-[26px] border border-[#DCE3EE] bg-white px-7 py-8 shadow-[0_20px_48px_-36px_rgba(12,35,60,0.26)]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-[720px]">
            <h2 className="text-[26px] font-bold tracking-[-0.03em] text-[#0C233C]">Run All Diagnostics</h2>
            <p className="mt-3 text-[16px] leading-8 text-[#7388A8]">
              Triggers coverage, quality, duplicates, and benchmarking together. Results are saved into each analysis page after the run completes.
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={runState === "running"}
            className="inline-flex min-w-[280px] items-center justify-center gap-3 rounded-[18px] px-7 py-5 text-[17px] font-bold text-white transition-transform hover:-translate-y-px disabled:cursor-wait"
            style={{
              backgroundColor:
                runState === "done" ? "#0AA53D" : runState === "running" ? "#7E91AE" : "#7213EA",
            }}
          >
            {runButton}
          </button>
        </div>
      </section>

      {showResults ? (
        <div id="diag-results" className="space-y-6 lg:space-y-7">
          <TraceStatusRibbon
            tone="purple"
            title="All Diagnostics Complete"
            detail="1,259 controls assessed · 380 risks · 22 April 2026"
          />

          <TraceSectionHeading eyebrow="Analysis results" title="Explore Diagnostic Outputs" />

          <section className="overflow-hidden rounded-[24px] bg-[linear-gradient(90deg,#12367A_0%,#1E49E2_100%)] p-8 shadow-[0_24px_60px_-40px_rgba(12,35,60,0.42)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-[19px] font-bold tracking-[-0.02em] text-white">Regulation-Controls Coverage</h3>
                <p className="mt-2 max-w-[760px] text-[15px] text-white/78">
                  Coverage status across the uploaded obligation register and mapped controls.
                </p>
              </div>
              <button
                onClick={() => navigate("/controls-diagnostics/regulation-controls-coverage")}
                className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-2 text-[14px] font-bold text-white"
              >
                View Full Analysis
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "obligations covered", value: "91%", color: "#FFFFFF" },
                { label: "total obligations", value: String(obsCount), color: "#ACEAFF" },
                { label: "gap obligations", value: String(gapCount), color: "#FFD15E" },
                { label: "regulations assessed", value: "4", color: "#6EF2A7" },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    className="text-[46px] font-bold leading-none tracking-[-0.04em]"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </div>
                  <p className="mt-2 text-[14px] text-white/72">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              {["PRA SS1/23", "PRA SS2/21", "FCA/PRA PS6/21", "EU DORA"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/16 bg-white/10 px-4 py-2 text-[13px] font-bold text-white/88"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <DiagnosticsCard
              title="Risk-Controls Coverage"
              value="79.2%"
              subLabel="coverage rate"
              detail="79 unmapped risks · 121 orphaned controls"
              accentColor="#098E7E"
              icon={<ShieldCheck className="h-5 w-5" />}
              onNavigate={() => navigate("/controls-diagnostics/risk-controls-coverage")}
              valueClassName="mt-8 text-[52px] font-bold leading-none tracking-[-0.04em] text-[#098E7E]"
            />
            <DiagnosticsCard
              title="Control Quality Analysis"
              value={
                <span className="text-[#7213EA]">
                  3.84
                  <span className="ml-1 text-[24px] tracking-normal text-[#92A0B8]">/6</span>
                </span>
              }
              subLabel="avg quality score"
              detail="54.3% controls require improvement"
              accentColor="#7213EA"
              icon={<Search className="h-5 w-5" />}
              onNavigate={() => navigate("/controls-diagnostics/control-quality-analysis")}
            />
            <DiagnosticsCard
              title="Controls Duplicates"
              value={<span className="text-[#EAAA00]">47</span>}
              subLabel="potential duplicates"
              detail="12 confirmed · 35 under review"
              accentColor="#EAAA00"
              icon={<Copy className="h-5 w-5" />}
              preview
            />
            <DiagnosticsCard
              title="Benchmarking & Gap Assessment"
              value={<span className="text-[#1E49E2]">68%</span>}
              subLabel="industry benchmark"
              detail="15 capability gaps identified"
              accentColor="#1E49E2"
              icon={<LineChart className="h-5 w-5" />}
              preview
            />
          </div>
        </div>
      ) : null}
    </TraceStandalonePage>
  );
}

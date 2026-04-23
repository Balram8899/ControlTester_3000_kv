import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import TraceNavBar from "@/components/TraceNavBar";
import Footer from "@/components/Footer";
import {
  Play,
  CheckCircle,
  FileText,
  Upload,
  ChevronDown,
  ArrowLeft,
  Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type RunState = "idle" | "running" | "done";

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepCard({
  number,
  title,
  desc,
  color,
}: {
  number: number;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm p-6 flex flex-col gap-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
        style={{ background: color }}
      >
        {number}
      </div>
      <div className="font-bold text-[#0C233C] text-[15px]">{title}</div>
      <p className="text-[13px] text-[#5A6478] leading-relaxed">{desc}</p>
    </div>
  );
}

function UploadCard({
  id,
  title,
  fileType,
  desc,
  loadedFileName,
  loaded,
  onLoad,
  iconBg,
  iconColor,
}: {
  id: string;
  title: string;
  fileType: string;
  desc: string;
  loadedFileName: string;
  loaded: boolean;
  onLoad: () => void;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 ${
        loaded
          ? "border border-[#009A44] shadow-sm"
          : "border-2 border-dashed border-[#E2E6EF] shadow-sm"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <FileText size={22} style={{ color: iconColor }} />
        </div>
        <div>
          <div className="font-bold text-[#0C233C] text-[15px]">{title}</div>
          <div className="text-[12px] text-[#8492A6] mt-0.5">{fileType}</div>
        </div>
      </div>
      <p className="text-[13px] text-[#5A6478] leading-relaxed">{desc}</p>
      <div className="flex items-center gap-3 flex-wrap">
        {loaded ? (
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[#009A44]">
            <CheckCircle size={14} />
            {loadedFileName}
          </span>
        ) : (
          <>
            <button
              onClick={onLoad}
              className="inline-flex items-center gap-2 text-[13px] font-semibold rounded-lg px-4 py-2 transition-colors"
              style={{ background: iconBg, color: iconColor }}
            >
              <Upload size={14} />
              Choose File
            </button>
            <button
              onClick={onLoad}
              className="text-[12px] font-semibold text-[#098E7E] bg-transparent border-none p-0 cursor-pointer hover:underline"
            >
              or load sample data →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  accent,
  title,
  value,
  valueColor,
  subLabel,
  detail,
  preview,
  onNavigate,
  dark,
}: {
  accent: string;
  title: string;
  value: string | React.ReactNode;
  valueColor?: string;
  subLabel: string;
  detail: string;
  preview?: boolean;
  onNavigate?: () => void;
  dark?: boolean;
}) {
  const bg = dark
    ? "linear-gradient(135deg, #0C233C 0%, #1E49E2 100%)"
    : "white";
  const textColor = dark ? "white" : "#0C233C";
  const subColor = dark ? "rgba(255,255,255,0.6)" : "#8492A6";
  const detailColor = dark ? "rgba(255,255,255,0.55)" : "#8492A6";

  return (
    <div
      className={`rounded-2xl border overflow-hidden shadow-sm flex flex-col gap-4 p-7 relative transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
        dark ? "border-transparent" : "border-[#E2E6EF]"
      } ${preview ? "opacity-85" : ""}`}
      style={{ background: bg }}
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between gap-3 mt-1">
        <div className="font-bold text-[17px]" style={{ color: textColor }}>
          {title}
        </div>
        {preview ? (
          <span className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full bg-[#F0F2F7] text-[#8492A6] border border-[#E2E6EF] uppercase tracking-wide flex-shrink-0">
            Preview
          </span>
        ) : dark ? (
          onNavigate && (
            <button
              onClick={onNavigate}
              className="text-[12px] font-semibold text-white/65 bg-white/10 border border-white/20 px-3 py-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
            >
              View Full Analysis →
            </button>
          )
        ) : null}
      </div>
      <div>
        <div
          className="font-bold text-[38px] leading-none tracking-tight"
          style={{ color: valueColor || textColor }}
        >
          {value}
        </div>
        <div className="text-[13px] mt-1" style={{ color: subColor }}>
          {subLabel}
        </div>
      </div>
      <div className="text-[13px]" style={{ color: detailColor }}>
        {detail}
      </div>
      {!dark && !preview && onNavigate && (
        <button
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-[14px] font-bold mt-auto transition-opacity hover:opacity-75"
          style={{ color: valueColor || "#0C233C" }}
        >
          View Full Analysis
          <Play size={14} fill="currentColor" />
        </button>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ControlsDiagnosticsPage() {
  const [, navigate] = useLocation();

  const [riskLoaded, setRiskLoaded] = useState(false);
  const [ctrlLoaded, setCtrlLoaded] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [showResults, setShowResults] = useState(false);
  const [howOpen, setHowOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(true);

  // Load state from localStorage on mount
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
        document.getElementById("diag-results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }, 2200);
  }

  // Read obligation count from localStorage or fallback
  const obsCount = (() => {
    try {
      const obs = JSON.parse(localStorage.getItem("apex_obligations_v1") || "[]");
      return obs.length || 41;
    } catch {
      return 41;
    }
  })();
  const gapCount = Math.round(obsCount * 0.09) || 4;

  return (
    <div className="min-h-screen bg-[#F0F2F7]">
      {/* ── Nav ── */}
      <TraceNavBar breadcrumb="Controls Diagnostics" />
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "#0C233C", padding: "52px 0 56px" }}
      >
        {/* Orbs */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 460,
            height: 460,
            background: "radial-gradient(circle, rgba(114,19,234,0.3) 0%, transparent 70%)",
            filter: "blur(80px)",
            top: -140,
            right: -80,
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 320,
            height: 320,
            background: "radial-gradient(circle, rgba(0,184,245,0.18) 0%, transparent 70%)",
            filter: "blur(80px)",
            bottom: -100,
            left: "5%",
          }}
        />
        <div className="relative max-w-[1100px] mx-auto px-8 md:px-12">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-white/45 hover:text-[#00B8F5] transition-colors mb-7"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-0.5 rounded bg-[#00338D]" />
            <span className="text-[11px] font-bold text-[#00338D] tracking-[2px] uppercase">
              Controls Design Diagnostics
            </span>
          </div>
          <h1
            className="font-bold text-white leading-tight mb-4"
            style={{ fontSize: "clamp(32px, 5vw, 52px)", letterSpacing: "-2px" }}
          >
            Diagnostics Hub
          </h1>
          <p className="text-[16px] text-white/60 max-w-[640px] leading-[1.75]">
            Upload your GRC data once. APEX runs all four diagnostic analyses simultaneously —
            Coverage, Quality, Duplicates, and Benchmarking — from a single dataset.
          </p>
        </div>
      </section>

      {/* ── Main ── */}
      <main className="max-w-[1200px] mx-auto px-8 md:px-12 py-12 pb-24">

        {/* ── How It Works (collapsible) ── */}
        <div className="mb-9">
          <button
            className="w-full flex items-center justify-between pb-4 border-b-2 border-[#E2E6EF] mb-5"
            onClick={() => setHowOpen(o => !o)}
          >
            <div className="text-left">
              <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                Process
              </div>
              <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                How It Works
              </div>
            </div>
            <ChevronDown
              size={22}
              className={`text-[#8492A6] transition-transform duration-200 ${howOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {howOpen && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StepCard
                number={1}
                title="Extract GRC Data"
                desc="Export your risk register and controls inventory (with verbatim control text) from your GRC platform. Both files are required to run all four analyses."
                color="#7213EA"
              />
              <StepCard
                number={2}
                title="Upload & Run"
                desc="Upload both files below and click Run All Diagnostics. APEX processes 1,259+ controls across all four analytical modules simultaneously."
                color="#1E49E2"
              />
              <StepCard
                number={3}
                title="Explore Results"
                desc="Navigate to any of the four diagnostic pages. Results are pre-loaded and ready for review and export — no re-upload required."
                color="#098E7E"
              />
            </div>
          )}
        </div>

        {/* ── Upload GRC Extracts (collapsible) ── */}
        <div className="mb-12">
          <button
            className="w-full flex items-center justify-between pb-4 border-b-2 border-[#E2E6EF] mb-5"
            onClick={() => setUploadOpen(o => !o)}
          >
            <div className="text-left">
              <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-1">
                Data Inputs
              </div>
              <div className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                Upload GRC Extracts
              </div>
            </div>
            <ChevronDown
              size={22}
              className={`text-[#8492A6] transition-transform duration-200 ${uploadOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {uploadOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadCard
                id="riskCard"
                title="Risk Register"
                fileType="CSV / XLSX"
                desc="Risk IDs, descriptions, risk ratings, process owners, categories."
                loadedFileName="risk_register_sample.csv loaded"
                loaded={riskLoaded}
                onLoad={() => setRiskLoaded(true)}
                iconBg="#EEF2FF"
                iconColor="#1E49E2"
              />
              <UploadCard
                id="ctrlCard"
                title="Controls Inventory with Verbatim"
                fileType="CSV / XLSX"
                desc="Control IDs, control text/description, type, owner, linked risk IDs, process area."
                loadedFileName="controls_inventory_verbatim_sample.csv loaded"
                loaded={ctrlLoaded}
                onLoad={() => setCtrlLoaded(true)}
                iconBg="#F3F0FF"
                iconColor="#7213EA"
              />
            </div>
          )}
        </div>

        {/* ── Run Section ── */}
        <div className="bg-white rounded-2xl border border-[#E2E6EF] shadow-sm px-8 py-9 flex items-center justify-between gap-7 flex-wrap mb-12">
          <div>
            <h3 className="font-bold text-[#0C233C] text-[20px] tracking-tight mb-2">
              Run All Diagnostics
            </h3>
            <p className="text-[14px] text-[#8492A6] leading-relaxed max-w-[560px]">
              Triggers Coverage, Quality, Duplicates and Benchmarking analyses simultaneously
              across the full control corpus. Results are pre-loaded into all four analysis
              pages — navigate to any after running.
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={runState === "running"}
            className="inline-flex items-center gap-3 font-bold text-[16px] text-white rounded-xl px-8 py-4 transition-all duration-200 hover:-translate-y-0.5 whitespace-nowrap disabled:cursor-wait"
            style={{
              background:
                runState === "done"
                  ? "#009A44"
                  : runState === "running"
                  ? "#8492A6"
                  : "#7213EA",
            }}
          >
            {runState === "running" ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Running 4 analyses…
              </>
            ) : runState === "done" ? (
              <>
                <CheckCircle size={20} />
                All Diagnostics Complete
              </>
            ) : (
              <>
                <Play size={20} fill="white" />
                Run All Diagnostics
              </>
            )}
          </button>
        </div>

        {/* ── Results ── */}
        {showResults && (
          <div id="diag-results" className="animate-[fadeUp_0.5s_ease_both]">
            {/* Success Banner */}
            <div
              className="rounded-2xl px-8 py-6 flex items-center justify-between gap-4 flex-wrap mb-8"
              style={{ background: "linear-gradient(135deg, #4a0ea8 0%, #7213EA 100%)" }}
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-white/18 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={22} className="text-white" />
                </div>
                <div>
                  <div className="font-bold text-white text-[17px]">All Diagnostics Complete</div>
                  <div className="text-[13px] text-white/70 mt-0.5">
                    1,259 controls · 380 risks · 22 April 2026
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-bold text-[#00338D] tracking-[2.5px] uppercase mb-2">
                Analysis Results
              </div>
              <h2 className="font-bold text-[#0C233C] text-[20px] tracking-tight">
                Explore Diagnostic Outputs
              </h2>
            </div>

            {/* Regulation–Controls Coverage (full width) */}
            <div className="mb-5">
              <div
                className="rounded-2xl p-7 relative overflow-hidden border-transparent border"
                style={{ background: "linear-gradient(135deg, #0C233C 0%, #1E49E2 100%)" }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                  style={{ background: "#00B8F5" }}
                />
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4 mt-1">
                  <div className="font-bold text-white text-[17px]">
                    Regulation–Controls Coverage
                  </div>
                  <button
                    onClick={() => navigate("/controls-diagnostics/regulation-controls-coverage")}
                    className="text-[12px] font-semibold text-white/65 bg-white/10 border border-white/20 px-3 py-1 rounded-full hover:bg-white/20 transition-colors"
                  >
                    View Full Analysis →
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
                  {[
                    { val: "91%", color: "white", label: "obligations covered" },
                    { val: String(obsCount), color: "#00B8F5", label: "total obligations" },
                    { val: String(gapCount), color: "#EAAA00", label: "gap obligations" },
                    { val: "4", color: "#34D399", label: "regulations assessed" },
                  ].map(({ val, color, label }) => (
                    <div key={label}>
                      <div
                        className="font-bold text-[34px] leading-none tracking-tight"
                        style={{ color }}
                      >
                        {val}
                      </div>
                      <div className="text-[12px] text-white/55 mt-1">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {["PRA SS1/23", "PRA SS2/21", "FCA/PRA PS6/21", "EU DORA"].map((r) => (
                    <span
                      key={r}
                      className="text-[11px] font-semibold px-3 py-1 rounded-full border text-white/70"
                      style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.15)" }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 2×2 Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ResultCard
                accent="#098E7E"
                title="Risk–Controls Coverage"
                value="79.2%"
                valueColor="#098E7E"
                subLabel="coverage rate"
                detail="79 unmapped risks · 121 orphaned controls"
                onNavigate={() => navigate("/controls-diagnostics/risk-controls-coverage")}
              />
              <ResultCard
                accent="#7213EA"
                title="Control Quality Analysis"
                value={
                  <span>
                    3.84
                    <span className="text-[18px] tracking-normal text-[#8492A6]">/6</span>
                  </span>
                }
                valueColor="#7213EA"
                subLabel="avg quality score"
                detail="54.3% controls require improvement"
                onNavigate={() => navigate("/controls-diagnostics/control-quality-analysis")}
              />
              <ResultCard
                accent="#EAAA00"
                title="Controls Duplicates"
                value="47"
                valueColor="#EAAA00"
                subLabel="potential duplicates"
                detail="12 confirmed · 35 under review"
                preview
              />
              <ResultCard
                accent="#1E49E2"
                title="Benchmarking & Gap Assessment"
                value="68%"
                valueColor="#1E49E2"
                subLabel="industry benchmark"
                detail="15 capability gaps identified"
                preview
              />
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Footer />
    </div>
  );
}

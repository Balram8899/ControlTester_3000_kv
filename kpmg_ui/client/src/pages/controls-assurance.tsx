import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Plus,
} from "lucide-react";

import Footer from "@/components/Footer";
import { STAGE_LABEL, useCtSessions, type CtSessionSummary, type CtStage } from "@/hooks/useControlTesting";

const ACCENT_BY_STAGE: Record<CtStage, string> = {
  input: "#8492A6",
  analysing: "#1E49E2",
  control_review: "#7213EA",
  population: "#00B8F5",
  evidence: "#098E7E",
  testing: "#7213EA",
  workbook: "#7213EA",
  complete: "#009A44",
  failed: "#E5001B",
};

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5 border-b-2 border-[#E2E6EF] pb-4 text-left">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">{label}</div>
      <div className="text-[20px] font-bold tracking-tight text-[#0C233C]">{title}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  detail,
}: {
  label: string;
  value: number;
  accent: string;
  detail: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white p-7 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="text-[15px] font-bold text-[#0C233C]">{label}</div>
      <div className="mt-5 text-[38px] font-bold leading-none tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-[#5A6478]">{detail}</p>
    </section>
  );
}

function StageIcon({ stage }: { stage: CtStage }) {
  if (stage === "complete") return <CheckCircle2 size={18} />;
  if (stage === "failed") return <AlertCircle size={18} />;
  if (stage === "input") return <Clock size={18} />;
  return <Loader2 size={18} className="animate-spin" />;
}

function SessionRow({ session }: { session: CtSessionSummary }) {
  const [, navigate] = useLocation();
  const accent = ACCENT_BY_STAGE[session.stage] ?? "#1E49E2";
  return (
    <button
      type="button"
      onClick={() => navigate(`/controls-assurance/${session.id}`)}
      className="group grid w-full grid-cols-[1fr_auto] items-center gap-5 border-b border-[#E2E6EF] bg-white px-6 py-5 text-left transition-colors last:border-b-0 hover:bg-[#F8FAFD]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="truncate text-[16px] font-bold text-[#0C233C]">{session.title}</span>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold"
            style={{ borderColor: `${accent}33`, color: accent, background: `${accent}12` }}
          >
            <StageIcon stage={session.stage} />
            {STAGE_LABEL[session.stage] ?? session.stage}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[#5A6478]">
          <span>{session.entity}</span>
          <span>{session.framework}</span>
          <span>{session.control_count} controls</span>
          <span>Updated {new Date(session.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#1E49E2]">
        Open
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}

export default function ControlsAssurancePage() {
  const [, navigate] = useLocation();
  const { data: sessions = [], isLoading } = useCtSessions();
  const active = sessions.filter((session) => !["complete", "failed"].includes(session.stage));
  const complete = sessions.filter((session) => session.stage === "complete");
  const failed = sessions.filter((session) => session.stage === "failed");

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <div className="h-full overflow-auto bg-[#F0F2F7]">
        <section className="relative overflow-hidden" style={{ background: "#0C233C", padding: "52px 0 56px" }}>
          <div
            className="pointer-events-none absolute rounded-full blur-3xl"
            style={{ width: 420, height: 420, background: "rgba(30,73,226,0.35)", right: -140, top: -180 }}
          />
          <div
            className="pointer-events-none absolute rounded-full blur-3xl"
            style={{ width: 300, height: 300, background: "rgba(0,184,245,0.20)", left: -90, bottom: -120 }}
          />
          <div className="relative mx-auto max-w-[1100px] px-8 md:px-12">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[2.5px] text-white/55">
              Control Assurance
            </div>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <h1 className="font-bold leading-tight text-white" style={{ fontSize: "clamp(32px, 5vw, 52px)" }}>
                  Controls Assurance
                </h1>
                <p className="mt-4 max-w-2xl text-[16px] leading-[1.75] text-white/65">
                  Create local SOX ITGC testing assessments, monitor pipeline gates, review exceptions, and download
                  completed workpapers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/controls-assurance/new")}
                className="inline-flex items-center gap-3 whitespace-nowrap rounded-xl bg-[#7213EA] px-8 py-4 text-[16px] font-bold text-white transition-all duration-200 hover:-translate-y-0.5"
              >
                <Plus size={20} />
                New Assessment
              </button>
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-[1200px] px-8 py-12 pb-24 md:px-12">
          <section className="mb-9 grid gap-4 md:grid-cols-4">
            <StatCard label="All Cases" value={sessions.length} accent="#1E49E2" detail="Assessments in the local CT workspace." />
            <StatCard label="Active" value={active.length} accent="#7213EA" detail="Cases still moving through pipeline gates." />
            <StatCard label="Complete" value={complete.length} accent="#009A44" detail="Cases with generated workpapers." />
            <StatCard label="Failed" value={failed.length} accent="#E5001B" detail="Cases requiring pipeline review." />
          </section>

          <section className="mb-12">
            <SectionHeader label="Assessments" title="Current Testing Cases" />
            <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
              {isLoading ? (
                <div className="flex items-center gap-3 px-6 py-10 text-[13px] font-semibold text-[#5A6478]">
                  <Loader2 size={18} className="animate-spin" />
                  Loading assessments
                </div>
              ) : sessions.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <ClipboardCheck size={34} className="mx-auto text-[#8492A6]" />
                  <div className="mt-4 text-[18px] font-bold text-[#0C233C]">No Controls Assurance Assessments</div>
                  <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-[#5A6478]">
                    Start a new assessment with manual controls or the Excel input template.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/controls-assurance/new")}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#7213EA] px-6 py-3 text-[14px] font-bold text-white"
                  >
                    <Plus size={18} />
                    New Assessment
                  </button>
                </div>
              ) : (
                sessions.map((session) => <SessionRow key={session.id} session={session} />)
              )}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}

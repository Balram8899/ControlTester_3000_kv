import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";

import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  addCtControls,
  uploadCtTemplate,
  useCreateSession,
  type CreateControlBody,
  type TestStep,
} from "@/hooks/useControlTesting";

type SessionDraft = {
  title: string;
  description: string;
  entity: string;
  periodFrom: string;
  periodTo: string;
  preparer: string;
};

type ControlDraft = Omit<CreateControlBody, "test_steps"> & { test_steps: TestStep[] };

const emptySession: SessionDraft = {
  title: "",
  description: "",
  entity: "",
  periodFrom: "",
  periodTo: "",
  preparer: "",
};

function emptyControl(index: number): ControlDraft {
  return {
    control_id: `ITGC-${String(index + 1).padStart(3, "0")}`,
    control_name: "",
    control_type: "Preventive",
    domain: "",
    framework_reference: "SOX s.404",
    inherent_risk_rating: "Medium",
    control_owner: "",
    frequency: "",
    prior_period_result: "N/A",
    walkthrough_performed: false,
    risk: "",
    sampling_mode: "sample",
    test_steps: [{ label: "A", description: "", evidence_required: "" }],
  };
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5 border-b-2 border-[#E2E6EF] pb-4 text-left">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[2.5px] text-[#00338D]">{label}</div>
      <div className="text-[20px] font-bold tracking-tight text-[#0C233C]">{title}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[12px] font-bold text-[#0C233C]">{label}</Label>
      {children}
    </div>
  );
}

const inputClass = "h-10 border-[#DCE3EE] bg-white text-[13px] text-[#0C233C]";

export default function ControlsAssuranceNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [session, setSession] = useState<SessionDraft>(emptySession);
  const [controls, setControls] = useState<ControlDraft[]>([emptyControl(0)]);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const createSession = useCreateSession();

  const sessionValid =
    session.title.trim() &&
    session.entity.trim() &&
    session.periodFrom &&
    session.periodTo;
  const manualControlsValid =
    controls.length > 0 &&
    controls.every((control) => control.control_id.trim() && control.control_name.trim() && control.test_steps[0]?.description.trim());
  const canSubmit = Boolean(sessionValid && (templateFile || manualControlsValid));

  function updateSession(field: keyof SessionDraft, value: string) {
    setSession((prev) => ({ ...prev, [field]: value }));
  }

  function updateControl(index: number, field: keyof ControlDraft, value: string | boolean) {
    setControls((prev) => prev.map((control, i) => (i === index ? { ...control, [field]: value } : control)));
  }

  function updateStep(controlIndex: number, stepIndex: number, field: keyof TestStep, value: string) {
    setControls((prev) =>
      prev.map((control, i) => {
        if (i !== controlIndex) return control;
        return {
          ...control,
          test_steps: control.test_steps.map((step, s) => (s === stepIndex ? { ...step, [field]: value } : step)),
        };
      }),
    );
  }

  function addStep(controlIndex: number) {
    setControls((prev) =>
      prev.map((control, i) => {
        if (i !== controlIndex || control.test_steps.length >= 6) return control;
        const nextLabel = String.fromCharCode(65 + control.test_steps.length);
        return {
          ...control,
          test_steps: [...control.test_steps, { label: nextLabel, description: "", evidence_required: "" }],
        };
      }),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      const created = await createSession.mutateAsync({
        title: session.title.trim(),
        description: session.description.trim(),
        entity: session.entity.trim(),
        preparer: session.preparer.trim(),
        testing_period: { from: session.periodFrom, to: session.periodTo },
      });

      if (manualControlsValid) {
        await addCtControls(created.id, controls);
      }
      if (templateFile) {
        await uploadCtTemplate(created.id, templateFile);
      }

      toast({ title: "Assessment Created", description: "The controls assurance workspace is ready." });
      navigate(`/controls-assurance/${created.id}`);
    } catch (error) {
      toast({
        title: "Assessment Not Created",
        description: error instanceof Error ? error.message : "Review the entered details and try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="h-full overflow-auto bg-[#F0F2F7]">
      <section className="relative overflow-hidden" style={{ background: "#0C233C", padding: "52px 0 56px" }}>
        <div
          className="pointer-events-none absolute rounded-full blur-3xl"
          style={{ width: 420, height: 420, background: "rgba(30,73,226,0.34)", right: -130, top: -190 }}
        />
        <div className="relative mx-auto max-w-[1100px] px-8 md:px-12">
          <button
            type="button"
            onClick={() => navigate("/controls-assurance")}
            className="mb-5 inline-flex items-center gap-2 text-[13px] font-bold text-white/70"
          >
            <ArrowLeft size={16} />
            Back To Assessments
          </button>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[2.5px] text-white/55">New Assessment</div>
          <h1 className="font-bold leading-tight text-white" style={{ fontSize: "clamp(32px, 5vw, 52px)" }}>
            Create Controls Assurance Case
          </h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-[1.75] text-white/65">
            Set the case scope, upload the Excel template, or enter controls manually before starting analysis.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        <main className="mx-auto max-w-[1200px] px-8 py-12 pb-24 md:px-12">
          <section className="mb-9">
            <SectionHeader label="Case Setup" title="Assessment Details" />
            <div className="grid gap-5 rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm md:grid-cols-2">
              <Field label="Title">
                <Input className={inputClass} value={session.title} onChange={(e) => updateSession("title", e.target.value)} />
              </Field>
              <Field label="Entity">
                <Input className={inputClass} value={session.entity} onChange={(e) => updateSession("entity", e.target.value)} />
              </Field>
              <Field label="Preparer">
                <Input className={inputClass} value={session.preparer} onChange={(e) => updateSession("preparer", e.target.value)} />
              </Field>
              <Field label="Period From">
                <Input type="date" className={inputClass} value={session.periodFrom} onChange={(e) => updateSession("periodFrom", e.target.value)} />
              </Field>
              <Field label="Period To">
                <Input type="date" className={inputClass} value={session.periodTo} onChange={(e) => updateSession("periodTo", e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <Textarea
                    className="min-h-[92px] border-[#DCE3EE] bg-white text-[13px] text-[#0C233C]"
                    value={session.description}
                    onChange={(e) => updateSession("description", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="mb-9">
            <SectionHeader label="Template" title="Excel Input Path" />
            <div className="grid gap-5 rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex items-center gap-3 text-[16px] font-bold text-[#0C233C]">
                  <FileSpreadsheet size={20} style={{ color: "#098E7E" }} />
                  Download Template Or Upload Completed Workbook
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#5A6478]">
                  Use the CT input template when controls are already documented outside TRACE.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a
                    href="/api/ct/template/download"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#E6F4F2] px-4 py-2 text-[13px] font-semibold text-[#098E7E]"
                  >
                    <Download size={16} />
                    Download Template
                  </a>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#1E49E2]">
                    <Upload size={16} />
                    Upload .xlsx
                    <input
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>
              <span className="rounded-full border border-[#E2E6EF] bg-[#F0F2F7] px-3 py-1 text-[11px] font-semibold text-[#5A6478]">
                {templateFile ? templateFile.name : "No template selected"}
              </span>
            </div>
          </section>

          <section className="mb-12">
            <SectionHeader label="Manual Controls" title="Manual Control Entry" />
            <div className="space-y-5">
              {controls.map((control, index) => (
                <div key={index} className="rounded-2xl border border-[#E2E6EF] bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="text-[17px] font-bold text-[#0C233C]">Control {index + 1}</div>
                    {controls.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setControls((prev) => prev.filter((_, i) => i !== index))}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#FEEBED] px-3 py-2 text-[12px] font-semibold text-[#E5001B]"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Control ID">
                      <Input className={inputClass} value={control.control_id} onChange={(e) => updateControl(index, "control_id", e.target.value)} />
                    </Field>
                    <Field label="Control Name">
                      <Input className={inputClass} value={control.control_name} onChange={(e) => updateControl(index, "control_name", e.target.value)} />
                    </Field>
                    <Field label="Control Type">
                      <Input className={inputClass} value={control.control_type} onChange={(e) => updateControl(index, "control_type", e.target.value)} />
                    </Field>
                    <Field label="Domain">
                      <Input className={inputClass} value={control.domain} onChange={(e) => updateControl(index, "domain", e.target.value)} />
                    </Field>
                    <Field label="Risk Rating">
                      <Input className={inputClass} value={control.inherent_risk_rating} onChange={(e) => updateControl(index, "inherent_risk_rating", e.target.value)} />
                    </Field>
                    <Field label="Sampling Mode">
                      <Input className={inputClass} value={control.sampling_mode} onChange={(e) => updateControl(index, "sampling_mode", e.target.value)} />
                    </Field>
                  </div>
                  <div className="mt-5 space-y-3">
                    {control.test_steps.map((step, stepIndex) => (
                      <div key={step.label} className="grid gap-3 rounded-xl border border-[#E2E6EF] bg-[#F8FAFD] p-4 md:grid-cols-[80px_1fr_1fr]">
                        <Field label="Step">
                          <Input className={inputClass} value={step.label} readOnly />
                        </Field>
                        <Field label="Description">
                          <Input className={inputClass} value={step.description} onChange={(e) => updateStep(index, stepIndex, "description", e.target.value)} />
                        </Field>
                        <Field label="Evidence Required">
                          <Input className={inputClass} value={step.evidence_required} onChange={(e) => updateStep(index, stepIndex, "evidence_required", e.target.value)} />
                        </Field>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addStep(index)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#F3F0FF] px-4 py-2 text-[13px] font-semibold text-[#7213EA]"
                    >
                      <Plus size={16} />
                      Add Step A-F
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setControls((prev) => [...prev, emptyControl(prev.length)])}
                className="inline-flex items-center gap-2 rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#1E49E2]"
              >
                <Plus size={16} />
                Add Control
              </button>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit || createSession.isPending}
              className="inline-flex items-center gap-3 rounded-xl px-8 py-4 text-[16px] font-bold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:bg-[#8492A6]"
              style={{ background: canSubmit ? "#7213EA" : "#8492A6" }}
            >
              {createSession.isPending ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              Create Assessment
            </button>
          </div>
        </main>
      </form>
      <Footer />
    </div>
  );
}
